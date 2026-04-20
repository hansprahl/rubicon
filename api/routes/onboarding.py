"""Document upload, parsing, and agent profile synthesis for onboarding."""

from __future__ import annotations

import io
from uuid import UUID

import anthropic
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from api.auth import get_current_user
from api.config import settings
from api.db import get_sb
from api.models.onboarding import (
    OnboardingDoc,
    OnboardingProfileRequest,
    OnboardingSynthesizeRequest,
    SynthesizedProfile,
)
from api.parsers.idp_parser import parse_idp
from api.parsers.ethics_parser import parse_ethics
from api.parsers.insights_parser import parse_insights
from api.runtime.prompt_builder import build_progressive_prompt
from api.services.prompt_service import rebuild_agent_prompt

router = APIRouter(prefix="/onboarding", tags=["onboarding"])

MODEL = "claude-sonnet-4-20250514"


def _assert_is_caller(path_user_id: UUID, caller: str) -> None:
    """Ensure the path user_id matches the authenticated caller.

    Onboarding is always self-service — one user managing their own identity
    docs and agent profile. Any mismatch is either a frontend bug or an attack.
    """
    if str(path_user_id) != caller:
        raise HTTPException(
            status_code=403,
            detail="Cannot onboard another user",
        )


def _extract_text_from_pdf(content: bytes) -> str:
    """Extract text from PDF bytes using a simple approach."""
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
async def setup_profile(
    user_id: UUID,
    body: OnboardingProfileRequest,
    current_user: str = Depends(get_current_user),
):
    """Create or update the caller's display name and avatar."""
    _assert_is_caller(user_id, current_user)
    sb = get_sb()

    auth_user = sb.auth.admin.get_user_by_id(str(user_id))
    email = auth_user.user.email or ""

    result = (
        sb.table("users")
        .update({"display_name": body.display_name, "avatar_url": body.avatar_url})
        .eq("id", str(user_id))
        .execute()
    )

    if not result.data:
        result = (
            sb.table("users")
            .insert({
                "id": str(user_id),
                "display_name": body.display_name,
                "email": email,
                "avatar_url": body.avatar_url,
            })
            .execute()
        )

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create user profile")

    return {"status": "ok", "display_name": body.display_name}


# ---------------------------------------------------------------------------
# Document upload + parse (Steps 2-4)
# ---------------------------------------------------------------------------


@router.post("/upload/{user_id}/{doc_type}", response_model=OnboardingDoc)
async def upload_document(
    user_id: UUID,
    doc_type: str,
    file: UploadFile = File(...),
    current_user: str = Depends(get_current_user),
):
    """Upload a document, store in Supabase Storage, parse with Claude."""
    _assert_is_caller(user_id, current_user)
    if doc_type not in ("idp", "ethics", "insights"):
        raise HTTPException(status_code=400, detail=f"Invalid doc_type: {doc_type}")

    sb = get_sb()
    file_content = await file.read()

    max_size = 10 * 1024 * 1024
    if len(file_content) > max_size:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10MB.")

    filename = file.filename or f"{doc_type}_document"

    lower = (filename or "").lower()
    if not lower.endswith((".pdf", ".docx", ".txt")):
        raise HTTPException(status_code=400, detail="Only PDF, DOCX, and TXT files are supported.")

    storage_path = f"onboarding/{user_id}/{doc_type}/{filename}"
    sb.storage.from_("documents").upload(
        storage_path, file_content, {"content-type": file.content_type or "application/octet-stream", "upsert": "true"}
    )

    document_text = await _extract_text(file_content, filename)

    if doc_type == "idp":
        parsed = await parse_idp(document_text)
    elif doc_type == "ethics":
        parsed = await parse_ethics(document_text)
    else:
        parsed = await parse_insights(document_text)

    parsed_data = parsed.model_dump()

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

    await rebuild_agent_prompt(sb, str(user_id))

    return result.data[0]


# ---------------------------------------------------------------------------
# Get parsed data (for review step)
# ---------------------------------------------------------------------------


@router.get("/docs/{user_id}")
async def get_onboarding_docs(
    user_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Get all onboarding documents and parsed data for the caller."""
    _assert_is_caller(user_id, current_user)
    sb = get_sb()
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


@router.post("/synthesize/{user_id}", response_model=SynthesizedProfile)
async def synthesize_profile(
    user_id: UUID,
    body: OnboardingSynthesizeRequest,
    current_user: str = Depends(get_current_user),
):
    """Combine all parsed documents into a synthesized agent profile."""
    _assert_is_caller(user_id, current_user)
    sb = get_sb()

    user_result = sb.table("users").select("*").eq("id", str(user_id)).execute()
    if not user_result.data:
        raise HTTPException(status_code=404, detail="User not found")
    user = user_result.data[0]

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

    system_prompt = build_progressive_prompt(
        display_name=user["display_name"],
        agent_name=body.agent_name,
        idp_data=idp_data if idp_data else None,
        ethics_data=ethics_data if ethics_data else None,
        insights_data=insights_data if insights_data else None,
        enrichment_answers=body.enrichment_answers,
    )

    personality_data = {
        "primary_color": insights_data.get("primary_color", ""),
        "secondary_color": insights_data.get("secondary_color", ""),
        "color_scores": insights_data.get("color_scores", {}),
        "strengths": insights_data.get("strengths", []),
        "personality_summary": insights_data.get("personality_summary", ""),
    }
    if body.enrichment_answers:
        personality_data["enrichment"] = body.enrichment_answers

    profile_data = {
        "user_id": str(user_id),
        "agent_name": body.agent_name,
        "expertise": idp_data.get("expertise", []) + idp_data.get("leadership_priorities", []),
        "goals": idp_data.get("goals", []) + idp_data.get("development_areas", []),
        "values": ethics_data.get("values", []) + ethics_data.get("key_principles", []),
        "personality": personality_data,
        "communication_style": insights_data.get("communication_style", ""),
        "system_prompt": system_prompt,
        "autonomy_level": body.autonomy_level,
    }

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
async def onboarding_status(
    user_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Check if the caller has completed onboarding."""
    _assert_is_caller(user_id, current_user)
    sb = get_sb()

    agent_result = (
        sb.table("agent_profiles")
        .select("id")
        .eq("user_id", str(user_id))
        .execute()
    )
    has_profile = bool(agent_result.data)

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
