import json


def parse_llm_json(text: str) -> dict:
    """Strip markdown fences from LLM output and parse as JSON."""
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]
    return json.loads(text.strip())
