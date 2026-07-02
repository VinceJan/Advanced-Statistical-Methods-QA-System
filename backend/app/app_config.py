from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from .models import SystemConfig
from .settings import settings


LLM_BASE_URL_KEY = "llm_base_url"
LLM_MODEL_KEY = "llm_model"
LLM_API_KEY_KEY = "llm_api_key"


@dataclass(frozen=True)
class LlmRuntimeConfig:
    base_url: str
    model: str
    api_key: str


def get_config(db: Session, key: str, default: str = "") -> str:
    item = db.get(SystemConfig, key)
    return item.value if item else default


def set_config(db: Session, key: str, value: str) -> None:
    item = db.get(SystemConfig, key)
    if item:
        item.value = value
        item.updated_at = datetime.utcnow()
    else:
        db.add(SystemConfig(key=key, value=value))


def seed_llm_config(db: Session) -> None:
    if db.get(SystemConfig, LLM_BASE_URL_KEY) is None:
        set_config(db, LLM_BASE_URL_KEY, settings.llm_base_url)
    if db.get(SystemConfig, LLM_MODEL_KEY) is None:
        set_config(db, LLM_MODEL_KEY, settings.llm_model)
    if settings.llm_api_key and db.get(SystemConfig, LLM_API_KEY_KEY) is None:
        set_config(db, LLM_API_KEY_KEY, settings.llm_api_key)
    db.commit()


def get_llm_config(db: Session | None = None) -> LlmRuntimeConfig:
    if db is None:
        return LlmRuntimeConfig(
            base_url=os.getenv("MINIMAX_BASE_URL", settings.llm_base_url),
            model=os.getenv("MINIMAX_MODEL", settings.llm_model),
            api_key=os.getenv("MINIMAX_API_KEY", settings.llm_api_key),
        )
    return LlmRuntimeConfig(
        base_url=get_config(db, LLM_BASE_URL_KEY, settings.llm_base_url),
        model=get_config(db, LLM_MODEL_KEY, settings.llm_model),
        api_key=get_config(db, LLM_API_KEY_KEY, settings.llm_api_key),
    )


def preview_secret(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 10:
        return "*" * len(value)
    return f"{value[:4]}...{value[-4:]}"
