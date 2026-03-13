import os

from pydantic_settings import BaseSettings, SettingsConfigDict


_BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
_BACKEND_ENV_FILE = os.path.join(_BASE_DIR, ".env")

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_BACKEND_ENV_FILE, extra="ignore")

    DATABASE_URL: str
    SYNC_DATABASE_URL: str
    REDIS_URL: str
    CELERY_BROKER_URL: str
    CELERY_RESULT_BACKEND: str
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"
    OPENAI_FALLBACK_MODEL: str = "gpt-3.5-turbo"

settings = Settings()
