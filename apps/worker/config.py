"""
Application configuration via pydantic-settings.
All environment variables are loaded from .env file or environment.

Never hardcode secrets — all sensitive values come from environment variables.
In production: injected via Azure Container Apps secret references from Key Vault.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Database (PostgreSQL Flexible Server in prod; docker-compose postgres in dev)
    database_url: str = "postgresql://mintuser:mintpassword@localhost:5432/mintdb"

    # Azure Storage (Azurite in dev; Azure Storage Account in prod)
    azure_storage_connection_string: str = (
        "DefaultEndpointsProtocol=http;"
        "AccountName=devstoreaccount1;"
        "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tiqXNE==;"
        "BlobEndpoint=http://localhost:10000/devstoreaccount1;"
        "QueueEndpoint=http://localhost:10001/devstoreaccount1;"
    )
    azure_queue_name: str = "statement-processing"
    azure_blob_container_name: str = "statements"

    # LLM provider (LiteLLM — switch model via env var, zero code changes)
    # Default: Anthropic Claude Haiku (fast + cheap for categorization)
    llm_model: str = "anthropic/claude-haiku-4-5-20251001"
    llm_api_key: str = ""

    # Categorization config
    confidence_threshold: float = 0.7  # Flag transactions below this threshold
    llm_batch_size: int = 50           # Transactions per LLM API call
    llm_max_tokens: int = 2048
    llm_temperature: float = 0.1       # Low temp for deterministic categorization

    # Application
    environment: str = "development"
    log_level: str = "INFO"


# Module-level singleton — import and use throughout the worker
settings = Settings()
