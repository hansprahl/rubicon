"""Extract personality colors, strengths, and communication style from Insights Discovery profiles."""

from __future__ import annotations

import anthropic

from api.config import settings
from api.models.onboarding import InsightsParsed

MODEL = "claude-sonnet-4-20250514"

EXTRACTION_PROMPT = """\
You are an expert at analyzing Insights Discovery personality profiles.

Insights Discovery uses four color energies:
- Fiery Red: competitive, demanding, determined, strong-willed, purposeful
- Sunshine Yellow: sociable, dynamic, demonstrative, enthusiastic, persuasive
- Earth Green: caring, encouraging, sharing, patient, relaxed
- Cool Blue: cautious, precise, deliberate, questioning, formal

Analyze the following Insights Discovery profile and extract structured data. Return ONLY valid JSON with these fields:

{
  "primary_color": "the dominant color energy (one of: Fiery Red, Sunshine Yellow, Earth Green, Cool Blue)",
  "secondary_color": "the second strongest color energy",
  "color_scores": {
    "fiery_red": 0.0,
    "sunshine_yellow": 0.0,
    "earth_green": 0.0,
    "cool_blue": 0.0
  },
  "strengths": ["list of key strengths identified in the profile"],
  "weaknesses": ["list of possible weaknesses or blind spots"],
  "communication_style": "description of how this person prefers to communicate and be communicated with",
  "personality_summary": "2-3 sentence summary of the overall personality type"
}

For color_scores, estimate a 0.0-1.0 score for each color based on the profile content. Be thorough with strengths and weaknesses.
"""


async def parse_insights(document_text: str) -> InsightsParsed:
    """Send Insights profile text to Claude and extract structured data."""
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
    return InsightsParsed(**data)
