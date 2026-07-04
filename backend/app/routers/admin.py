from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..app_config import LLM_API_KEY_KEY, LLM_BASE_URL_KEY, LLM_MODEL_KEY, get_llm_config, preview_secret, set_config
from ..database import get_db
from ..graph_service import concept_to_out, edge_to_out
from ..llm import LLMClient
from ..models import ChatConversation, Concept, GraphEdge, QAPair, QuestionHistory, SessionToken, TextChunk, User
from ..pdf_indexer import build_text_chunks
from ..schemas import (
    ConceptCreate,
    ConceptOut,
    ConceptUpdate,
    GraphEdgeCreate,
    GraphEdgeOut,
    GraphEdgeUpdate,
    HistoryOut,
    LlmConfigOut,
    LlmConfigTestOut,
    LlmConfigUpdate,
    TextChunkOut,
    UserPasswordUpdate,
    UserOut,
    UserRoleUpdate,
)
from ..security import hash_password, require_admin
from ..serialization import dumps, loads_list

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> list[UserOut]:
    return [
        UserOut(id=user.id, username=user.username, role=user.role, created_at=user.created_at)
        for user in db.query(User).order_by(User.id).all()
    ]


@router.patch("/users/{user_id}/role", response_model=UserOut)
def update_user_role(user_id: int, payload: UserRoleUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> UserOut:
    if payload.role not in {"admin", "student"}:
        raise HTTPException(status_code=400, detail="角色只能是 admin 或 student")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.role == "admin" and payload.role == "student" and admin_count(db) <= 1:
        raise HTTPException(status_code=400, detail="至少需要保留一个管理员账号")
    user.role = payload.role
    db.commit()
    db.refresh(user)
    return UserOut(id=user.id, username=user.username, role=user.role, created_at=user.created_at)


@router.post("/users/{user_id}/logout")
def logout_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> dict[str, str]:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    db.query(SessionToken).filter(SessionToken.user_id == user_id).delete()
    db.commit()
    return {"message": "用户会话已注销"}


@router.patch("/users/{user_id}/password", response_model=UserOut)
def reset_user_password(
    user_id: int,
    payload: UserPasswordUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> UserOut:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    user.password_hash = hash_password(payload.password)
    db.query(SessionToken).filter(SessionToken.user_id == user_id).delete()
    db.commit()
    db.refresh(user)
    return UserOut(id=user.id, username=user.username, role=user.role, created_at=user.created_at)


@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), admin_user: User = Depends(require_admin)) -> dict[str, str]:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.id == admin_user.id:
        raise HTTPException(status_code=400, detail="不能删除当前登录账号")
    if user.role == "admin" and admin_count(db) <= 1:
        raise HTTPException(status_code=400, detail="至少需要保留一个管理员账号")
    db.query(SessionToken).filter(SessionToken.user_id == user_id).delete()
    db.query(QuestionHistory).filter(QuestionHistory.user_id == user_id).delete()
    for conversation in db.query(ChatConversation).filter(ChatConversation.user_id == user_id).all():
        db.delete(conversation)
    db.delete(user)
    db.commit()
    return {"message": "用户已删除"}


@router.get("/llm-config", response_model=LlmConfigOut)
def get_llm_runtime_config(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> LlmConfigOut:
    config = get_llm_config(db)
    return LlmConfigOut(
        base_url=config.base_url,
        model=config.model,
        has_api_key=bool(config.api_key),
        api_key_preview=preview_secret(config.api_key),
        disabled=not LLMClient(db).configured() and bool(config.api_key),
    )


@router.patch("/llm-config", response_model=LlmConfigOut)
def update_llm_runtime_config(
    payload: LlmConfigUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> LlmConfigOut:
    if payload.base_url is not None:
        base_url = payload.base_url.strip().rstrip("/")
        if not base_url.startswith(("http://", "https://")):
            raise HTTPException(status_code=400, detail="Base URL 必须以 http:// 或 https:// 开头")
        set_config(db, LLM_BASE_URL_KEY, base_url)
    if payload.model is not None:
        model = payload.model.strip()
        if not model:
            raise HTTPException(status_code=400, detail="模型名称不能为空")
        set_config(db, LLM_MODEL_KEY, model)
    if payload.clear_api_key:
        set_config(db, LLM_API_KEY_KEY, "")
    elif payload.api_key is not None and payload.api_key.strip():
        set_config(db, LLM_API_KEY_KEY, payload.api_key.strip())
    db.commit()
    return get_llm_runtime_config(db=db)


@router.post("/llm-config/test", response_model=LlmConfigTestOut)
def test_llm_runtime_config(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> LlmConfigTestOut:
    config = get_llm_config(db)
    if not config.api_key:
        return LlmConfigTestOut(configured=False, message="尚未配置 API Key，真实问答会使用本地降级回答。")
    if not LLMClient(db).configured():
        return LlmConfigTestOut(configured=False, message="API Key 已保存，但当前 APP_DISABLE_LLM 禁用了外部 LLM 调用。")
    return LlmConfigTestOut(configured=True, message="配置已生效；下一次课程问答会使用当前 Base URL、模型和 API Key。")


@router.post("/concepts", response_model=ConceptOut)
def create_concept(payload: ConceptCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> ConceptOut:
    if db.query(Concept).filter(Concept.slug == payload.slug).first():
        raise HTTPException(status_code=409, detail="知识点 slug 已存在")
    concept = Concept(
        slug=payload.slug,
        name_cn=payload.name_cn,
        name_en=payload.name_en,
        aliases_json=dumps(payload.aliases),
        chapter=payload.chapter,
        description=payload.description,
    )
    db.add(concept)
    db.commit()
    db.refresh(concept)
    return concept_to_out(concept)


@router.patch("/concepts/{concept_id}", response_model=ConceptOut)
def update_concept(concept_id: int, payload: ConceptUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> ConceptOut:
    concept = db.get(Concept, concept_id)
    if not concept:
        raise HTTPException(status_code=404, detail="知识点不存在")
    data = payload.model_dump(exclude_unset=True)
    for key in ("name_cn", "name_en", "chapter", "description"):
        if key in data and data[key] is not None:
            setattr(concept, key, data[key])
    if data.get("aliases") is not None:
        concept.aliases_json = dumps(data["aliases"])
    db.commit()
    db.refresh(concept)
    return concept_to_out(concept)


@router.delete("/concepts/{concept_id}")
def delete_concept(concept_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> dict[str, str]:
    concept = db.get(Concept, concept_id)
    if not concept:
        raise HTTPException(status_code=404, detail="知识点不存在")
    db.query(GraphEdge).filter(or_(GraphEdge.source_id == concept_id, GraphEdge.target_id == concept_id)).delete()
    db.delete(concept)
    db.commit()
    return {"message": "知识点已删除"}


@router.get("/edges", response_model=list[GraphEdgeOut])
def list_edges(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> list[GraphEdgeOut]:
    edges = db.query(GraphEdge).order_by(GraphEdge.id).limit(500).all()
    concept_ids = {edge.source_id for edge in edges} | {edge.target_id for edge in edges}
    concepts = {c.id: c for c in db.query(Concept).filter(Concept.id.in_(concept_ids)).all()}
    return [edge_to_out(edge, concepts) for edge in edges if edge.source_id in concepts and edge.target_id in concepts]


@router.post("/edges", response_model=GraphEdgeOut)
def create_edge(payload: GraphEdgeCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> GraphEdgeOut:
    concepts = {c.id: c for c in db.query(Concept).filter(Concept.id.in_([payload.source_id, payload.target_id])).all()}
    if payload.source_id not in concepts or payload.target_id not in concepts:
        raise HTTPException(status_code=400, detail="边的起点或终点不存在")
    edge = GraphEdge(
        source_id=payload.source_id,
        target_id=payload.target_id,
        relation_type=payload.relation_type,
        evidence=payload.evidence,
    )
    db.add(edge)
    db.commit()
    db.refresh(edge)
    return edge_to_out(edge, concepts)


@router.patch("/edges/{edge_id}", response_model=GraphEdgeOut)
def update_edge(edge_id: int, payload: GraphEdgeUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> GraphEdgeOut:
    edge = db.get(GraphEdge, edge_id)
    if not edge:
        raise HTTPException(status_code=404, detail="图谱边不存在")
    data = payload.model_dump(exclude_unset=True)
    if data.get("relation_type") is not None:
        edge.relation_type = data["relation_type"]
    if data.get("evidence") is not None:
        edge.evidence = data["evidence"]
    db.commit()
    db.refresh(edge)
    concepts = {c.id: c for c in db.query(Concept).filter(Concept.id.in_([edge.source_id, edge.target_id])).all()}
    return edge_to_out(edge, concepts)


@router.delete("/edges/{edge_id}")
def delete_edge(edge_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> dict[str, str]:
    edge = db.get(GraphEdge, edge_id)
    if not edge:
        raise HTTPException(status_code=404, detail="图谱边不存在")
    db.delete(edge)
    db.commit()
    return {"message": "图谱边已删除"}


@router.get("/chunks", response_model=list[TextChunkOut])
def list_chunks(
    q: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[TextChunkOut]:
    query = db.query(TextChunk)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(TextChunk.text.like(like), TextChunk.chapter.like(like), TextChunk.section.like(like)))
    chunks = query.order_by(TextChunk.pdf_page).limit(limit).all()
    return [
        TextChunkOut(
            id=chunk.id,
            chunk_id=chunk.chunk_id,
            chapter=chunk.chapter,
            section=chunk.section,
            pdf_page=chunk.pdf_page,
            source_file=chunk.source_file,
            preview=" ".join(chunk.text.split())[:260],
            embedding_model=chunk.embedding_model,
        )
        for chunk in chunks
    ]


@router.post("/chunks/rebuild")
def rebuild_chunks(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> dict[str, int]:
    db.query(TextChunk).delete()
    db.commit()
    count = build_text_chunks(db)
    return {"text_chunks": count}


@router.get("/histories", response_model=list[HistoryOut])
def list_all_histories(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> list[HistoryOut]:
    items = db.query(QuestionHistory).order_by(QuestionHistory.created_at.desc()).limit(200).all()
    return [
        HistoryOut(
            id=item.id,
            conversation_id=item.conversation_id,
            message_id=item.message_id,
            question=item.question,
            answer_summary=item.answer_summary,
            answer=item.answer,
            sources=[dict(x) for x in loads_list(item.sources_json) if isinstance(x, dict)],
            created_at=item.created_at,
        )
        for item in items
    ]


def admin_count(db: Session) -> int:
    return db.query(User).filter(User.role == "admin").count()


@router.get("/chunks/{chunk_id}", response_model=TextChunkOut)
def get_chunk_detail(chunk_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> TextChunkOut:
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
