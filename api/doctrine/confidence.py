"""Confidence scoring for agent outputs.

Parses agent responses to extract or compute a calibrated confidence score.
Agents are instructed to self-report confidence; this module normalizes
and validates those scores.
"""

from __future__ import annotations

import json
import re

from api.models.agent import ConfidenceScore

# Default when agent doesn't provide confidence metadata
DEFAULT_CONFIDENCE = ConfidenceScore(
    score=0.5, reasoning="No explicit confidence provided"
)

# Keywords that suggest high/low confidence in free-text responses
_HIGH_SIGNALS = [
    "certain", "confident", "clearly", "definitely", "well-established",
    "strong evidence", "widely accepted",
]
_LOW_SIGNALS = [
    "uncertain", "unsure", "might", "possibly", "speculative",
    "not sure", "limited evidence", "guess",
]


def parse_confidence(raw_response: str) -> tuple[str, ConfidenceScore]:
    """Extract confidence metadata from an agent response.

    The agent is prompted to include a JSON block like:
        [CONFIDENCE: {"score": 0.85, "reasoning": "..."}]

    Returns the cleaned response text and the parsed ConfidenceScore.
    """
    pattern = r'\[CONFIDENCE:\s*(\{.*?\})\s*\]'
    match = re.search(pattern, raw_response, re.DOTALL)

    if match:
        try:
            data = json.loads(match.group(1))
            score = max(0.0, min(1.0, float(data.get("score", 0.5))))
            reasoning = data.get("reasoning", "")
            clean_text = raw_response[:match.start()] + raw_response[match.end():]
            return clean_text.strip(), ConfidenceScore(score=score, reasoning=reasoning)
        except (json.JSONDecodeError, ValueError, TypeError):
            pass

    # Fallback: heuristic scoring from language signals
    score = _heuristic_score(raw_response)
    return raw_response.strip(), score


def _heuristic_score(text: str) -> ConfidenceScore:
    """Estimate confidence from linguistic cues when no explicit score given."""
    lower = text.lower()
    high_count = sum(1 for s in _HIGH_SIGNALS if s in lower)
    low_count = sum(1 for s in _LOW_SIGNALS if s in lower)

    if high_count > low_count:
        score = min(0.85, 0.6 + high_count * 0.05)
        reasoning = "High-confidence language detected in response"
    elif low_count > high_count:
        score = max(0.2, 0.5 - low_count * 0.05)
        reasoning = "Hedging language detected in response"
    else:
        score = 0.5
        reasoning = "No strong confidence signals detected"

    return ConfidenceScore(score=round(score, 2), reasoning=reasoning)
