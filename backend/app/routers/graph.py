from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..graph_service import concept_to_out, find_concepts, get_subgraph, recommended_questions
from ..models import Concept, User
from ..schemas import ConceptOut, GraphOut
from ..security import current_user

router = APIRouter(prefix="/graph", tags=["graph"])


@router.get("/concepts", response_model=list[ConceptOut])
def list_concepts(q: str | None = None, db: Session = Depends(get_db), _: User = Depends(current_user)) -> list[ConceptOut]:
    query = db.query(Concept)
    if q:
        like = f"%{q}%"
        query = query.filter((Concept.name_cn.like(like)) | (Concept.name_en.like(like)) | (Concept.aliases_json.like(like)))
    return [concept_to_out(c) for c in query.order_by(Concept.id).all()]


@router.get("/subgraph", response_model=GraphOut)
def subgraph(
    concept_id: int | None = Query(default=None),
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
) -> GraphOut:
    concept_ids = [concept_id] if concept_id else []
    if q and not concept_ids:
        concept_ids = [c.id for c in find_concepts(db, q, limit=3)]
    return get_subgraph(db, concept_ids, depth=1, limit=40)


@router.get("/recommendations", response_model=list[str])
def recommendations(concept_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)) -> list[str]:
    return recommended_questions(db, [concept_id], limit=3)
