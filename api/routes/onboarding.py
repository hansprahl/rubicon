"""Document upload, parsing, and agent profile synthesis for onboarding."""

from __future__ import annotations

import io
from uuid import UUID

import anthropic
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from supabase import create_client

from api.config import settings
from api.models.onboarding import (
    OnboardingDoc,
    OnboardingProfileRequest,
    OnboardingSynthesizeRequest,
    SynthesizedProfile,
)
from api.parsers.idp_parser import parse_idp
from api.parsers.ethics_parser import parse_ethics
from api.parsers.insights_parser import parse_insights
from api.runtime.prompt_builder import build_progressive_prompt, calculate_fidelity

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

    # Get email from auth.users
    auth_user = sb.auth.admin.get_user_by_id(str(user_id))
    email = auth_user.user.email or ""

    # Try update first
    result = (
        sb.table("users")
        .update({"display_name": body.display_name, "avatar_url": body.avatar_url})
        .eq("id", str(user_id))
        .execute()
    )

    # If no row existed, insert
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
):
    """Upload a document, store in Supabase Storage, parse with Claude."""
    if doc_type not in ("idp", "ethics", "insights"):
        raise HTTPException(status_code=400, detail=f"Invalid doc_type: {doc_type}")

    sb = _supabase()
    file_content = await file.read()

    # Limit file size to 10MB
    max_size = 10 * 1024 * 1024
    if len(file_content) > max_size:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10MB.")

    filename = file.filename or f"{doc_type}_document"

    # Validate file extension
    lower = (filename or "").lower()
    if not lower.endswith((".pdf", ".docx", ".txt")):
        raise HTTPException(status_code=400, detail="Only PDF, DOCX, and TXT files are supported.")

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

    # Incrementally rebuild the agent's system prompt
    await _rebuild_agent_prompt(sb, str(user_id))

    return result.data[0]


async def _rebuild_agent_prompt(sb, user_id: str):
    """Rebuild the agent's system prompt from all currently uploaded docs."""
    # Get agent profile
    agent_result = sb.table("agent_profiles").select("*").eq("user_id", user_id).execute()
    if not agent_result.data:
        return  # No agent yet — will be rebuilt when agent is created

    agent = agent_result.data[0]

    # Get user info
    user_result = sb.table("users").select("display_name").eq("id", user_id).execute()
    display_name = user_result.data[0]["display_name"] if user_result.data else "Unknown"

    # Get all uploaded docs
    docs_result = sb.table("onboarding_docs").select("*").eq("user_id", user_id).execute()
    docs_by_type = {doc["doc_type"]: doc["parsed_data"] for doc in docs_result.data}

    idp_data = docs_by_type.get("idp")
    ethics_data = docs_by_type.get("ethics")
    insights_data = docs_by_type.get("insights")
    enrichment = agent.get("enrichment_answers") or {}
    enrichment = enrichment if enrichment != {} else None
    google_services = agent.get("google_services") or []

    # Fetch North Star (Soul layer)
    north_star_data = None
    try:
        ns_result = sb.table("north_stars").select("*").eq("user_id", user_id).execute()
        if ns_result.data:
            north_star_data = ns_result.data[0]
    except Exception:
        pass  # Table may not exist yet

    # Build new prompt
    new_prompt = build_progressive_prompt(
        display_name=display_name,
        agent_name=agent["agent_name"],
        idp_data=idp_data,
        ethics_data=ethics_data,
        insights_data=insights_data,
        enrichment_answers=enrichment,
        google_services=google_services if google_services else None,
        north_star=north_star_data,
    )

    # Calculate new fidelity
    fidelity = calculate_fidelity(
        has_idp=bool(idp_data),
        has_ethics=bool(ethics_data),
        has_insights=bool(insights_data),
        has_enrichment=bool(enrichment),
        has_google=bool(google_services),
    )

    # Update agent profile fields based on uploaded docs
    update_data: dict = {
        "system_prompt": new_prompt,
        "fidelity": fidelity,
    }

    if idp_data:
        update_data["expertise"] = idp_data.get("expertise", []) + idp_data.get("leadership_priorities", [])
        update_data["goals"] = idp_data.get("goals", []) + idp_data.get("development_areas", [])

    if ethics_data:
        update_data["values"] = ethics_data.get("values", []) + ethics_data.get("key_principles", [])

    if insights_data:
        update_data["personality"] = {
            "primary_color": insights_data.get("primary_color", ""),
            "secondary_color": insights_data.get("secondary_color", ""),
            "color_scores": insights_data.get("color_scores", {}),
            "strengths": insights_data.get("strengths", []),
            "personality_summary": insights_data.get("personality_summary", ""),
        }
        update_data["communication_style"] = insights_data.get("communication_style", "")

    sb.table("agent_profiles").update(update_data).eq("id", agent["id"]).execute()


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

    # Build system prompt using the progressive builder (consistent with doc re-upload path)
    system_prompt = build_progressive_prompt(
        display_name=user["display_name"],
        agent_name=body.agent_name,
        idp_data=idp_data if idp_data else None,
        ethics_data=ethics_data if ethics_data else None,
        insights_data=insights_data if insights_data else None,
        enrichment_answers=body.enrichment_answers,
    )

    # Build profile
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
