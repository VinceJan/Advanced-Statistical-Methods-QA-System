from __future__ import annotations

from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .settings import DATA_DIR, settings


class Base(DeclarativeBase):
    pass


engine = None
SessionLocal: sessionmaker[Session] | None = None


def configure_database(database_url: str | None = None) -> None:
    global engine, SessionLocal
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    url = database_url or settings.database_url
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    engine = create_engine(url, connect_args=connect_args)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db() -> None:
    if engine is None:
        configure_database()
    assert engine is not None
    Base.metadata.create_all(bind=engine)
    run_sqlite_migrations()


def run_sqlite_migrations() -> None:
    if engine is None or not str(engine.url).startswith("sqlite"):
        return
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "users" not in tables:
        return
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    history_columns = {column["name"] for column in inspector.get_columns("question_history")} if "question_history" in tables else set()
    with engine.begin() as conn:
        if "role" not in user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'student'"))
        if "question_history" in tables and "conversation_id" not in history_columns:
            conn.execute(text("ALTER TABLE question_history ADD COLUMN conversation_id INTEGER"))
        if "question_history" in tables and "message_id" not in history_columns:
            conn.execute(text("ALTER TABLE question_history ADD COLUMN message_id INTEGER"))


def get_db() -> Generator[Session, None, None]:
    if SessionLocal is None:
        configure_database()
        init_db()
    assert SessionLocal is not None
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def db_path() -> Path:
    if settings.database_url.startswith("sqlite:///"):
        return Path(settings.database_url.replace("sqlite:///", "", 1))
    return DATA_DIR / "app.db"
