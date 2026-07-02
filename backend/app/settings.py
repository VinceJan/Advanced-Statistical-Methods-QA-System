from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT_DIR / "data"
load_dotenv(ROOT_DIR / ".env")


@dataclass(frozen=True)
class Settings:
    app_name: str = "高级统计方法智能问答系统"
    database_url: str = os.getenv("APP_DATABASE_URL", f"sqlite:///{DATA_DIR / 'app.db'}")
    pdf_path: Path = Path(os.getenv("APP_PDF_PATH", str(ROOT_DIR / "ISLRv2_corrected_June_2023.pdf")))
    bootstrap_index: bool = os.getenv("APP_BOOTSTRAP_INDEX", "true").lower() != "false"
    llm_base_url: str = os.getenv("MINIMAX_BASE_URL", "https://api.minimaxi.com/v1")
    llm_model: str = os.getenv("MINIMAX_MODEL", "MiniMax-M3")
    llm_api_key: str = os.getenv("MINIMAX_API_KEY", "")
    admin_username: str = os.getenv("ADMIN_USERNAME", "admin")
    admin_password: str = os.getenv("ADMIN_PASSWORD", "Admin@123456")
    cors_origins: tuple[str, ...] = (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    )


settings = Settings()
