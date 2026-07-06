from __future__ import annotations

from sqlalchemy.orm import Session

from .app_config import seed_llm_config
from .pdf_indexer import build_text_chunks_if_needed
from .seed_data import seed_core_data, seed_demo_chunks_if_needed
from .settings import settings
from .models import ReferenceBook, TextChunk, User
from .security import hash_password
from .vector_index import build_vector_index, vector_index_ready


def bootstrap(db: Session) -> None:
    seed_core_data(db)
    seed_admin(db)
    seed_llm_config(db)
    default_book = seed_default_reference_book(db)
    if settings.bootstrap_index:
        count = build_text_chunks_if_needed(db)
        if count == 0:
            seed_demo_chunks_if_needed(db)
    else:
        seed_demo_chunks_if_needed(db)
    refresh_default_book_counts(db, default_book)
    ensure_vector_index_if_needed(db)


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


def seed_default_reference_book(db: Session) -> ReferenceBook:
    path = settings.pdf_path
    book = db.query(ReferenceBook).filter(ReferenceBook.storage_path == str(path)).first()
    if not book:
        book = ReferenceBook(
            display_name=path.name,
            filename=path.name,
            storage_path=str(path),
            is_active=1,
            index_status="ready" if path.exists() else "missing",
            retrieval_mode=settings.retrieval_mode,
        )
        db.add(book)
        db.commit()
        db.refresh(book)
    active = db.query(ReferenceBook).filter(ReferenceBook.is_active == 1).first()
    if not active:
        book.is_active = 1
        db.commit()
        db.refresh(book)
    return book


def refresh_default_book_counts(db: Session, book: ReferenceBook) -> None:
    chunk_count = db.query(TextChunk).count()
    if chunk_count:
        db.query(TextChunk).filter(TextChunk.book_id.is_(None)).update({TextChunk.book_id: book.id})
    book.chunk_count = chunk_count
    book.index_status = "ready" if chunk_count else ("missing" if not settings.pdf_path.exists() else "empty")
    book.updated_at = __import__("backend.app.models", fromlist=["utcnow"]).utcnow()
    db.commit()


def ensure_vector_index_if_needed(db: Session) -> None:
    if settings.retrieval_mode not in {"vector", "hybrid", "auto"}:
        return
    if vector_index_ready(settings.vector_index_dir):
        return
    if db.query(TextChunk.id).first() is None:
        return
    build_vector_index(db, settings.vector_index_dir)
