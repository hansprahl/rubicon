from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    anthropic_api_key: str = ""
    cors_origins_str: str = "http://localhost:3000"
    environment: str = "development"

    @property
    def cors_origins(self) -> list[str]:
        return [s.strip() for s in self.cors_origins_str.split(",") if s.strip()]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
