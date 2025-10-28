from functools import lru_cache
import os
from pydantic import BaseModel


class Settings(BaseModel):
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./epc_monitor.db")
    partnermatic_token: str | None = os.getenv("PARTNERMATIC_TOKEN", "LSfjexThROKxRRkQ")
    partnermatic_base_url: str = os.getenv(
        "PARTNERMATIC_BASE_URL", "https://api.partnermatic.com/api/monetization"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
