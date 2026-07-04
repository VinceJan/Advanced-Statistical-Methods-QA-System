from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..llm import LLMClient
from ..models import Concept, GraphEdge, QAPair, TextChunk, User
from ..schemas import SystemStats, TextChunkOut
from ..security import current_user
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


@router.get("/chunks/{chunk_id}", response_model=TextChunkOut)
def get_chunk_public(chunk_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)) -> TextChunkOut:
    """获取文本块详情（需要登录，不需要管理员权限）"""
    chunk = db.query(TextChunk).filter(TextChunk.chunk_id == chunk_id).first()
    if not chunk:
        raise HTTPException(status_code=404, detail="文本块不存在")
    return TextChunkOut(
        id=chunk.id,
        chunk_id=chunk.chunk_id,
        chapter=chunk.chapter,
        section=chunk.section,
        pdf_page=chunk.pdf_page,
        source_file=chunk.source_file,
        preview=chunk.text,
        embedding_model=chunk.embedding_model,
    )
