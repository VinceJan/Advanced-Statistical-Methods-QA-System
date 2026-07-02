from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..llm import LLMClient
from ..models import Concept, GraphEdge, QAPair, TextChunk, User
from ..schemas import SystemStats
from ..settings import settings

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/stats", response_model=SystemStats)
def stats(db: Session = Depends(get_db)) -> SystemStats:
    return SystemStats(
        users=db.query(func.count(User.id)).scalar() or 0,
        concepts=db.query(func.count(Concept.id)).scalar() or 0,
        graph_edges=db.query(func.count(GraphEdge.id)).scalar() or 0,
        qa_pairs=db.query(func.count(QAPair.id)).scalar() or 0,
        text_chunks=db.query(func.count(TextChunk.id)).scalar() or 0,
        llm_configured=LLMClient(db).configured(),
        pdf_available=settings.pdf_path.exists(),
    )
