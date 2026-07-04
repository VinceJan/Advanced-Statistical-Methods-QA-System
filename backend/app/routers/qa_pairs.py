from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import QAPair, User, utcnow
from ..schemas import QAPairCreate, QAPairOut, QAPairUpdate
from ..security import current_user, require_admin
from ..serialization import dumps, loads_list

router = APIRouter(prefix="/qa-pairs", tags=["qa-pairs"])


@router.get("", response_model=list[QAPairOut])
def list_qa_pairs(
    q: str | None = None,
    type: str | None = None,
    concept_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
) -> list[QAPairOut]:
    query = db.query(QAPair)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(QAPair.question.like(like), QAPair.answer.like(like)))
    if type:
        query = query.filter(QAPair.type == type)
    pairs = query.order_by(QAPair.id).all()
    if concept_id is not None:
        pairs = [pair for pair in pairs if concept_id in [int(x) for x in loads_list(pair.concept_ids_json)]]
    return [qa_to_out(pair) for pair in pairs]


@router.post("", response_model=QAPairOut)
def create_qa_pair(payload: QAPairCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> QAPairOut:
    pair = QAPair(
        question=payload.question,
        answer=payload.answer,
        type=payload.type,
        concept_ids_json=dumps(payload.concept_ids),
        source_refs_json=dumps(payload.source_refs),
        quality_status=payload.quality_status,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(pair)
    db.commit()
    db.refresh(pair)
    return qa_to_out(pair)


@router.patch("/{pair_id}", response_model=QAPairOut)
def update_qa_pair(pair_id: int, payload: QAPairUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> QAPairOut:
    pair = db.get(QAPair, pair_id)
    if not pair:
        raise HTTPException(status_code=404, detail="问答对不存在")
    data = payload.model_dump(exclude_unset=True)
    for key in ("question", "answer", "type", "quality_status"):
        if key in data and data[key] is not None:
            setattr(pair, key, data[key])
    if data.get("concept_ids") is not None:
        pair.concept_ids_json = dumps(data["concept_ids"])
    if data.get("source_refs") is not None:
        pair.source_refs_json = dumps(data["source_refs"])
    pair.updated_at = utcnow()
    db.commit()
    db.refresh(pair)
    return qa_to_out(pair)


@router.delete("/{pair_id}")
def delete_qa_pair(pair_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> dict[str, str]:
    pair = db.get(QAPair, pair_id)
    if not pair:
        raise HTTPException(status_code=404, detail="问答对不存在")
    db.delete(pair)
    db.commit()
    return {"message": "已删除"}


def qa_to_out(pair: QAPair) -> QAPairOut:
    return QAPairOut(
        id=pair.id,
        question=pair.question,
        answer=pair.answer,
        type=pair.type,
        concept_ids=[int(x) for x in loads_list(pair.concept_ids_json)],
        source_refs=[dict(x) for x in loads_list(pair.source_refs_json) if isinstance(x, dict)],
        quality_status=pair.quality_status,
        created_at=pair.created_at,
        updated_at=pair.updated_at,
    )
