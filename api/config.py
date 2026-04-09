from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    anthropic_api_key: str = ""
    database_url: str = ""
    cors_origins: list[str] = ["http://localhost:3000"]
    environment: str = "development"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: object) -> list[str]:
        if isinstance(v, str):
            # Accept comma-separated string: "http://a.com,http://b.com"
            return [s.strip() for s in v.split(",") if s.strip()]
        return v  # type: ignore[return-value]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
