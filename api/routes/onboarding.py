"""Document upload, parsing, and agent profile synthesis for onboarding."""

from __future__ import annotations

import io
from uuid import UUID

import anthropic
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from supabase import create_client

from api.config import settings
from api.models.onboarding import (
    IDPParsed,
    EthicsParsed,
    InsightsParsed,
    OnboardingDoc,
    OnboardingProfileRequest,
    OnboardingSynthesizeRequest,
    SynthesizedProfile,
)
from api.parsers.idp_parser import parse_idp
from api.parsers.ethics_parser import parse_ethics
from api.parsers.insights_parser import parse_insights

router = APIRouter(prefix="/onboarding", tags=["onboarding"])

MODEL = "claude-sonnet-4-20250514"


def _supabase():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def _extract_text_from_pdf(content: bytes) -> str:
    """Extract text from PDF bytes using a simple approach."""
    # Try PyPDF2 / pypdf first
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(content))
        text_parts = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                text_parts.append(text)
        return "\n\n".join(text_parts)
    except ImportError:
        pass

    # Fallback: send raw bytes to Claude via base64 document support
    # This works because Claude can read PDFs natively
    return ""


def _extract_text_from_docx(content: bytes) -> str:
    """Extract text from DOCX bytes."""
    try:
        from docx import Document

        doc = Document(io.BytesIO(content))
        return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="python-docx not installed. Cannot parse DOCX files.",
        )


async def _extract_text(file_content: bytes, filename: str) -> str:
    """Extract text from uploaded file based on extension."""
    lower = filename.lower()
    if lower.endswith(".pdf"):
        text = _extract_text_from_pdf(file_content)
        if not text:
            # Use Claude's native PDF reading via base64
            import base64

            b64 = base64.standard_b64encode(file_content).decode("utf-8")
            client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
            response = await client.messages.create(
                model=MODEL,
                max_tokens=4096,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "document",
                                "source": {
                                    "type": "base64",
                                    "media_type": "application/pdf",
                                    "data": b64,
                                },
                            },
                            {
                                "type": "text",
                                "text": "Extract and return ALL the text content from this document. Return only the raw text, no commentary.",
                            },
                        ],
                    }
                ],
            )
            text = response.content[0].text
        return text
    elif lower.endswith(".docx"):
        return _extract_text_from_docx(file_content)
    elif lower.endswith(".txt"):
        return file_content.decode("utf-8")
    else:
        raise HTTPException(
            status_code=400, detail=f"Unsupported file type: {filename}"
        )


# ---------------------------------------------------------------------------
# Profile setup (Step 1)
# ---------------------------------------------------------------------------


@router.post("/profile/{user_id}")
async def setup_profile(user_id: UUID, body: OnboardingProfileRequest):
    """Create or update the user's display name and avatar."""
    sb = _supabase()

    # Upsert into users table
    data = {"id": str(user_id), "display_name": body.display_name}
    if body.avatar_url:
        data["avatar_url"] = body.avatar_url

    result = (
        sb.table("users")
        .update({"display_name": body.display_name, "avatar_url": body.avatar_url})
        .eq("id", str(user_id))
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")

    return {"status": "ok", "display_name": body.display_name}


# ---------------------------------------------------------------------------
# Document upload + parse (Steps 2-4)
# ---------------------------------------------------------------------------


@router.post("/upload/{user_id}/{doc_type}", response_model=OnboardingDoc)
async def upload_document(
    user_id: UUID,
    doc_type: str,
    file: UploadFile = File(...),
):
    """Upload a document, store in Supabase Storage, parse with Claude."""
    if doc_type not in ("idp", "ethics", "insights"):
        raise HTTPException(status_code=400, detail=f"Invalid doc_type: {doc_type}")

    sb = _supabase()
    file_content = await file.read()
    filename = file.filename or f"{doc_type}_document"

    # Upload to Supabase Storage
    storage_path = f"onboarding/{user_id}/{doc_type}/{filename}"
    sb.storage.from_("documents").upload(
        storage_path, file_content, {"content-type": file.content_type or "application/octet-stream", "upsert": "true"}
    )

    # Extract text from document
    document_text = await _extract_text(file_content, filename)

    # Parse with appropriate parser
    if doc_type == "idp":
        parsed = await parse_idp(document_text)
    elif doc_type == "ethics":
        parsed = await parse_ethics(document_text)
    else:
        parsed = await parse_insights(document_text)

    parsed_data = parsed.model_dump()

    # Upsert into onboarding_docs (replace if re-uploading)
    # Delete existing doc for this user+type first
    sb.table("onboarding_docs").delete().eq("user_id", str(user_id)).eq(
        "doc_type", doc_type
    ).execute()

    result = (
        sb.table("onboarding_docs")
        .insert(
            {
                "user_id": str(user_id),
                "doc_type": doc_type,
                "file_name": filename,
                "storage_path": storage_path,
                "parsed_data": parsed_data,
            }
        )
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save document record")

    return result.data[0]


# ---------------------------------------------------------------------------
# Get parsed data (for review step)
# ---------------------------------------------------------------------------


@router.get("/docs/{user_id}")
async def get_onboarding_docs(user_id: UUID):
    """Get all onboarding documents and parsed data for a user."""
    sb = _supabase()
    result = (
        sb.table("onboarding_docs")
        .select("*")
        .eq("user_id", str(user_id))
        .execute()
    )
    return result.data


# ---------------------------------------------------------------------------
# Synthesize agent profile (Step 5-6)
# ---------------------------------------------------------------------------


async def _synthesize_system_prompt(
    display_name: str,
    agent_name: str,
    idp_data: dict,
    ethics_data: dict,
    insights_data: dict,
) -> str:
    """Use Claude to synthesize a personalized system prompt from all three documents."""
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    synthesis_prompt = f"""\
You are building a system prompt for an AI agent that is a digital twin of {display_name}.

This agent, named "{agent_name}", must think like {display_name}, advocate for their perspective, and collaborate with other agents on the Rubicon platform.

Here is the structured data extracted from {display_name}'s three EMBA documents:

## IDP (Individual Development Plan)
Goals: {idp_data.get('goals', [])}
Development Areas: {idp_data.get('development_areas', [])}
Leadership Priorities: {idp_data.get('leadership_priorities', [])}
Expertise: {idp_data.get('expertise', [])}
Action Plans: {idp_data.get('action_plans', [])}

## Ethics / Worldview Paper
Values: {ethics_data.get('values', [])}
Ethical Framework: {ethics_data.get('ethical_framework', '')}
Worldview: {ethics_data.get('worldview', '')}
Key Principles: {ethics_data.get('key_principles', [])}

## Insights Discovery Profile
Primary Color: {insights_data.get('primary_color', '')}
Secondary Color: {insights_data.get('secondary_color', '')}
Strengths: {insights_data.get('strengths', [])}
Communication Style: {insights_data.get('communication_style', '')}
Personality Summary: {insights_data.get('personality_summary', '')}

Write a detailed system prompt (300-500 words) for this agent. The prompt should:
1. Define the agent's identity and role as {display_name}'s digital twin
2. Incorporate their goals, values, and personality
3. Guide how the agent communicates (matching their Insights profile)
4. Specify how the agent approaches decisions (based on their ethical framework)
5. Include their areas of expertise and development goals

Return ONLY the system prompt text, no other commentary.
"""

    response = await client.messages.create(
        model=MODEL,
        max_tokens=2048,
        messages=[{"role": "user", "content": synthesis_prompt}],
    )

    return response.content[0].text


@router.post("/synthesize/{user_id}", response_model=SynthesizedProfile)
async def synthesize_profile(user_id: UUID, body: OnboardingSynthesizeRequest):
    """Combine all parsed documents into a synthesized agent profile and create it."""
    sb = _supabase()

    # Get user info
    user_result = sb.table("users").select("*").eq("id", str(user_id)).execute()
    if not user_result.data:
        raise HTTPException(status_code=404, detail="User not found")
    user = user_result.data[0]

    # Get all parsed docs
    docs_result = (
        sb.table("onboarding_docs")
        .select("*")
        .eq("user_id", str(user_id))
        .execute()
    )

    docs_by_type = {doc["doc_type"]: doc["parsed_data"] for doc in docs_result.data}
    idp_data = docs_by_type.get("idp", {})
    ethics_data = docs_by_type.get("ethics", {})
    insights_data = docs_by_type.get("insights", {})

    # Synthesize system prompt
    system_prompt = await _synthesize_system_prompt(
        display_name=user["display_name"],
        agent_name=body.agent_name,
        idp_data=idp_data,
        ethics_data=ethics_data,
        insights_data=insights_data,
    )

    # Build profile
    profile_data = {
        "user_id": str(user_id),
        "agent_name": body.agent_name,
        "expertise": idp_data.get("expertise", []) + idp_data.get("leadership_priorities", []),
        "goals": idp_data.get("goals", []) + idp_data.get("development_areas", []),
        "values": ethics_data.get("values", []) + ethics_data.get("key_principles", []),
        "personality": {
            "primary_color": insights_data.get("primary_color", ""),
            "secondary_color": insights_data.get("secondary_color", ""),
            "color_scores": insights_data.get("color_scores", {}),
            "strengths": insights_data.get("strengths", []),
            "personality_summary": insights_data.get("personality_summary", ""),
        },
        "communication_style": insights_data.get("communication_style", ""),
        "system_prompt": system_prompt,
        "autonomy_level": body.autonomy_level,
    }

    # Delete existing agent profile if re-onboarding
    sb.table("agent_profiles").delete().eq("user_id", str(user_id)).execute()

    result = sb.table("agent_profiles").insert(profile_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create agent profile")

    return SynthesizedProfile(
        agent_name=body.agent_name,
        expertise=profile_data["expertise"],
        goals=profile_data["goals"],
        values=profile_data["values"],
        personality=profile_data["personality"],
        communication_style=profile_data["communication_style"],
        system_prompt=system_prompt,
        autonomy_level=body.autonomy_level,
    )


# ---------------------------------------------------------------------------
# Check onboarding status
# ---------------------------------------------------------------------------


@router.get("/status/{user_id}")
async def onboarding_status(user_id: UUID):
    """Check if a user has completed onboarding."""
    sb = _supabase()

    # Check for agent profile
    agent_result = (
        sb.table("agent_profiles")
        .select("id")
        .eq("user_id", str(user_id))
        .execute()
    )
    has_profile = bool(agent_result.data)

    # Check which docs are uploaded
    docs_result = (
        sb.table("onboarding_docs")
        .select("doc_type")
        .eq("user_id", str(user_id))
        .execute()
    )
    uploaded_docs = [doc["doc_type"] for doc in docs_result.data]

    return {
        "completed": has_profile,
        "uploaded_docs": uploaded_docs,
        "has_idp": "idp" in uploaded_docs,
        "has_ethics": "ethics" in uploaded_docs,
        "has_insights": "insights" in uploaded_docs,
    }
