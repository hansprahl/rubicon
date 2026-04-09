"""Extract values, ethical framework, and worldview from Ethics/Worldview papers."""

from __future__ import annotations

import anthropic

from api.config import settings
from api.models.onboarding import EthicsParsed

MODEL = "claude-sonnet-4-20250514"

EXTRACTION_PROMPT = """\
You are an expert at analyzing Ethics and Worldview papers from EMBA programs.

Analyze the following Ethics/Worldview paper and extract structured data. Return ONLY valid JSON with these fields:

{
  "values": ["list of core personal and professional values"],
  "ethical_framework": "description of the person's ethical framework or approach (e.g., utilitarian, deontological, virtue ethics, or their own synthesis)",
  "worldview": "brief summary of the person's worldview and how they see their role in the world",
  "key_principles": ["list of key principles that guide their decision-making"]
}

Be thorough — extract every value and principle mentioned. Keep list items concise (one sentence max). The framework and worldview summaries can be 2-3 sentences.
"""


async def parse_ethics(document_text: str) -> EthicsParsed:
    """Send Ethics/Worldview paper text to Claude and extract structured data."""
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    response = await client.messages.create(
        model=MODEL,
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": f"{EXTRACTION_PROMPT}\n\n---\n\nDOCUMENT:\n{document_text}",
            }
        ],
    )

    import json

    text = response.content[0].text
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]

    data = json.loads(text.strip())
    return EthicsParsed(**data)
