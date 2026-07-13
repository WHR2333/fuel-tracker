"""Application settings loaded from environment / .env."""
from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime config.

    Reads from .env at project root (if present) or process env.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Database ---
    mysql_host: str = "192.168.3.4"
    mysql_port: int = 8809
    mysql_user: str = "fuel_user"
    mysql_password: str = "Fuel@2026Test"
    mysql_database: str = "fuel_tracker"

    # --- Auth ---
    admin_user: str = "admin"
    admin_password: str = ""          # MUST be set via env / .env
    secret_key: str = ""              # JWT signing key — generate with: python -c "import secrets; print(secrets.token_hex(32))"
    token_expire_hours: int = 24

    # --- App ---
    app_env: str = "dev"  # dev | prod
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5050",
    ]

    @property
    def database_url(self) -> str:
        pwd = quote_plus(self.mysql_password)
        return (
            f"mysql+pymysql://{self.mysql_user}:{pwd}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}?charset=utf8mb4"
        )


settings = Settings()