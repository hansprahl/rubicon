"""Extract goals, development areas, and leadership priorities from IDP documents."""

from __future__ import annotations

import anthropic

from api.config import settings
from api.models.onboarding import IDPParsed

MODEL = "claude-sonnet-4-20250514"

EXTRACTION_PROMPT = """\
You are an expert at analyzing Individual Development Plans (IDPs) from EMBA programs.

Analyze the following IDP document and extract structured data. Return ONLY valid JSON with these fields:

{
  "goals": ["list of career and professional goals"],
  "development_areas": ["list of areas the person wants to develop"],
  "leadership_priorities": ["list of leadership development priorities"],
  "expertise": ["list of current areas of expertise or strength"],
  "action_plans": ["list of concrete action items or plans mentioned"]
}

Be thorough — extract every goal, development area, and priority mentioned. Keep each item concise (one sentence max).
"""


async def parse_idp(document_text: str) -> IDPParsed:
    """Send IDP text to Claude and extract structured profile data."""
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
    # Extract JSON from response (handle markdown code blocks)
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]

    data = json.loads(text.strip())
    return IDPParsed(**data)
