from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    anthropic_api_key: str = ""
    cors_origins_str: str = "http://localhost:3000"
    environment: str = "development"
    # Max concurrent in-flight calls to the Anthropic API across the process.
    # Tune to stay under your account's tokens-per-minute / requests-per-minute.
    anthropic_max_concurrency: int = 4
    # Max retry attempts when the Anthropic API returns 429 / 5xx / connection errors.
    anthropic_max_retries: int = 5

    @property
    def cors_origins(self) -> list[str]:
        return [s.strip() for s in self.cors_origins_str.split(",") if s.strip()]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
