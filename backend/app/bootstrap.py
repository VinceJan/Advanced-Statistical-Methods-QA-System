from __future__ import annotations

from sqlalchemy.orm import Session

from .app_config import seed_llm_config
from .pdf_indexer import build_text_chunks_if_needed
from .seed_data import seed_core_data, seed_demo_chunks_if_needed
from .settings import settings
from .models import User
from .security import hash_password


def bootstrap(db: Session) -> None:
    seed_core_data(db)
    seed_admin(db)
    seed_llm_config(db)
    if settings.bootstrap_index:
        count = build_text_chunks_if_needed(db)
        if count == 0:
            seed_demo_chunks_if_needed(db)
    else:
        seed_demo_chunks_if_needed(db)


def seed_admin(db: Session) -> None:
    admin = db.query(User).filter(User.username == settings.admin_username).first()
    if admin:
        if admin.role != "admin":
            admin.role = "admin"
            db.commit()
        return
    db.add(
        User(
            username=settings.admin_username,
            password_hash=hash_password(settings.admin_password),
            role="admin",
        )
    )
    db.commit()
