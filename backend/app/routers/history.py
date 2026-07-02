from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import QuestionHistory, User
from ..schemas import HistoryOut
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
