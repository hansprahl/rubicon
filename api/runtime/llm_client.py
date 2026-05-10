"""Shared Anthropic client wrapper with retry, backoff, and concurrency caps.

Every call into the Claude API in this codebase should go through
`create_message` so rate limits are handled centrally:

- Reuses a single `AsyncAnthropic` client across the process.
- Caps concurrent in-flight requests via a global asyncio semaphore.
- Retries `RateLimitError`, transient `APIStatusError` (429/5xx), and connection
  errors with exponential backoff. Honors the `retry-after` header when set.
"""

from __future__ import annotations

import asyncio
import logging
import random
from typing import Any

import anthropic
from anthropic import AsyncAnthropic

from api.config import settings

logger = logging.getLogger(__name__)


_client: AsyncAnthropic | None = None
_semaphore: asyncio.Semaphore | None = None


def get_client() -> AsyncAnthropic:
    global _client
    if _client is None:
        _client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


def _get_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(settings.anthropic_max_concurrency)
    return _semaphore


def _retry_after_seconds(err: Exception) -> float | None:
    """Pull a `retry-after` hint from an Anthropic SDK error, if present."""
    response = getattr(err, "response", None)
    headers = getattr(response, "headers", None) if response is not None else None
    if not headers:
        return None
    value = headers.get("retry-after") or headers.get("Retry-After")
    if not value:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


async def create_message(**kwargs: Any) -> Any:
    """Call `client.messages.create` with concurrency cap and retry/backoff.

    Accepts the same kwargs as the underlying SDK call. Raises the final
    exception if all retries are exhausted.
    """
    client = get_client()
    semaphore = _get_semaphore()
    max_retries = settings.anthropic_max_retries

    attempt = 0
    while True:
        async with semaphore:
            try:
                return await client.messages.create(**kwargs)
            except anthropic.RateLimitError as e:
                last_err: Exception = e
                hint = _retry_after_seconds(e)
            except anthropic.APIStatusError as e:
                if e.status_code != 429 and e.status_code < 500:
                    raise
                last_err = e
                hint = _retry_after_seconds(e)
            except (anthropic.APIConnectionError, anthropic.APITimeoutError) as e:
                last_err = e
                hint = None

        attempt += 1
        if attempt > max_retries:
            logger.warning(
                "Anthropic call failed after %d retries: %s", max_retries, last_err
            )
            raise last_err

        # Exponential backoff with jitter; respect server hint if larger.
        backoff = min(2 ** attempt, 30) + random.uniform(0, 1)
        delay = max(backoff, hint) if hint else backoff
        logger.info(
            "Anthropic rate-limit/transient error (attempt %d/%d); sleeping %.1fs",
            attempt,
            max_retries,
            delay,
        )
        await asyncio.sleep(delay)
