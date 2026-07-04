from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Favorite, QuestionHistory, User, UserNote
from ..schemas import FavoriteOut, HistoryOut, UserNoteOut
from ..security import current_user
from ..serialization import loads_list

router = APIRouter(prefix="/history", tags=["history"])


@router.get("", response_model=list[HistoryOut])
def list_history(db: Session = Depends(get_db), user: User = Depends(current_user)) -> list[HistoryOut]:
    items = (
        db.query(QuestionHistory)
        .filter(QuestionHistory.user_id == user.id)
        .order_by(QuestionHistory.created_at.desc())
        .limit(100)
        .all()
    )
    return [history_to_out(item) for item in items]


@router.delete("")
def clear_history(db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict[str, str]:
    db.query(QuestionHistory).filter(QuestionHistory.user_id == user.id).delete()
    db.commit()
    return {"message": "历史记录已清空"}


@router.post("/{history_id}/favorite")
def toggle_favorite(history_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict[str, bool]:
    """切换收藏状态"""
    existing = db.query(Favorite).filter(Favorite.user_id == user.id, Favorite.history_id == history_id).first()
    if existing:
        db.delete(existing)
        db.commit()
        return {"favorited": False}
    favorite = Favorite(user_id=user.id, history_id=history_id)
    db.add(favorite)
    db.commit()
    return {"favorited": True}


@router.get("/favorites", response_model=list[FavoriteOut])
def list_favorites(db: Session = Depends(get_db), user: User = Depends(current_user)) -> list[FavoriteOut]:
    items = db.query(Favorite).filter(Favorite.user_id == user.id).order_by(Favorite.created_at.desc()).all()
    return [FavoriteOut(id=item.id, history_id=item.history_id, created_at=item.created_at) for item in items]


@router.post("/{history_id}/notes")
def save_note(history_id: int, content: str, db: Session = Depends(get_db), user: User = Depends(current_user)) -> UserNoteOut:
    """保存或更新笔记"""
    existing = db.query(UserNote).filter(UserNote.user_id == user.id, UserNote.history_id == history_id).first()
    if existing:
        existing.content = content
        db.commit()
        db.refresh(existing)
        return UserNoteOut(id=existing.id, history_id=existing.history_id, content=existing.content, created_at=existing.created_at, updated_at=existing.updated_at)
    note = UserNote(user_id=user.id, history_id=history_id, content=content)
    db.add(note)
    db.commit()
    db.refresh(note)
    return UserNoteOut(id=note.id, history_id=note.history_id, content=note.content, created_at=note.created_at, updated_at=note.updated_at)


@router.get("/{history_id}/notes", response_model=UserNoteOut | None)
def get_note(history_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)) -> UserNoteOut | None:
    item = db.query(UserNote).filter(UserNote.user_id == user.id, UserNote.history_id == history_id).first()
    if not item:
        return None
    return UserNoteOut(id=item.id, history_id=item.history_id, content=item.content, created_at=item.created_at, updated_at=item.updated_at)


def history_to_out(item: QuestionHistory) -> HistoryOut:
    return HistoryOut(
        id=item.id,
        conversation_id=item.conversation_id,
        message_id=item.message_id,
        question=item.question,
        answer_summary=item.answer_summary,
        answer=item.answer,
        sources=[dict(x) for x in loads_list(item.sources_json) if isinstance(x, dict)],
        created_at=item.created_at,
    )
