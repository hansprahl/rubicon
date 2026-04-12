"""Shared Supabase client factory."""

from supabase import create_client

from api.config import settings


def get_sb():
    """Create a Supabase client with service-role credentials."""
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
