from functools import lru_cache
from pathlib import Path

from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "RUKUN"
    app_host: str = "0.0.0.0"
    app_port: int = 8082
    app_base_url: str = "http://localhost:8082"
    app_public_path: str = ""
    environment: str = "development"
    auto_create_tables: bool = False
    seed_on_startup: bool = True

    db_host: str = "localhost"
    db_port: int = 3306
    db_name: str = "db_resida"
    db_user: str = "resida_app"
    db_password: str = ""
    database_url: str | None = None

    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 43200

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@resida.local"

    upload_dir: str = "uploads"
    upload_url_prefix: str = "/uploads"
    frontend_dist_dir: str = "frontend/dist"

    seed_superadmin_email: str = "superadmin@resida.local"
    seed_superadmin_password: str = "Resida123!"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator("app_base_url")
    @classmethod
    def strip_trailing_slash(cls, value: str) -> str:
        return value.rstrip("/")

    @field_validator("app_public_path")
    @classmethod
    def normalize_app_public_path(cls, value: str) -> str:
        value = value.strip().strip("/")
        return f"/{value}" if value else ""

    @field_validator("upload_url_prefix")
    @classmethod
    def normalize_upload_url_prefix(cls, value: str) -> str:
        value = value.strip() or "/uploads"
        if not value.startswith("/"):
            value = f"/{value}"
        return value.rstrip("/") or "/uploads"

    @property
    def public_upload_url_prefix(self) -> str:
        return f"{self.app_public_path}{self.upload_url_prefix}"

    @property
    def sqlalchemy_database_uri(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"mysql+pymysql://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}?charset=utf8mb4"
        )

    @property
    def upload_path(self) -> Path:
        return Path(self.upload_dir)


@lru_cache
def get_settings() -> Settings:
    return Settings()
