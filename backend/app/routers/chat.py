from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ChatConversation, ChatMessage, User, utcnow
from ..rag import RagService
from ..schemas import AskRequest, AskResponse, ChatConversationDetail, ChatConversationOut, ChatConversationUpdate, ChatMessageOut, ConceptOut, GraphOut, PerformanceOut, SourceOut
from ..security import current_user
from ..serialization import loads_dict, loads_list

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/ask", response_model=AskResponse)
async def ask(payload: AskRequest, db: Session = Depends(get_db), user: User = Depends(current_user)) -> AskResponse:
    return await RagService(db).ask(user=user, question=payload.question.strip(), conversation_id=payload.conversation_id)


@router.get("/conversations", response_model=list[ChatConversationOut])
def list_conversations(db: Session = Depends(get_db), user: User = Depends(current_user)) -> list[ChatConversationOut]:
    counts = dict(
        db.query(ChatMessage.conversation_id, func.count(ChatMessage.id))
        .join(ChatConversation, ChatConversation.id == ChatMessage.conversation_id)
        .filter(ChatConversation.user_id == user.id)
        .group_by(ChatMessage.conversation_id)
        .all()
    )
    conversations = (
        db.query(ChatConversation)
        .filter(ChatConversation.user_id == user.id)
        .order_by(ChatConversation.updated_at.desc(), ChatConversation.id.desc())
        .limit(50)
        .all()
    )
    return [
        ChatConversationOut(
            id=item.id,
            title=item.title,
            created_at=item.created_at,
            updated_at=item.updated_at,
            message_count=int(counts.get(item.id, 0)),
        )
        for item in conversations
    ]


@router.get("/conversations/{conversation_id}", response_model=ChatConversationDetail)
def get_conversation(conversation_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)) -> ChatConversationDetail:
    conversation = (
        db.query(ChatConversation)
        .filter(ChatConversation.id == conversation_id, ChatConversation.user_id == user.id)
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conversation.id)
        .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
        .all()
    )
    return ChatConversationDetail(
        id=conversation.id,
        title=conversation.title,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        message_count=len(messages),
        messages=[message_to_out(item) for item in messages],
    )


@router.patch("/conversations/{conversation_id}", response_model=ChatConversationOut)
def update_conversation(
    conversation_id: int,
    payload: ChatConversationUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> ChatConversationOut:
    conversation = (
        db.query(ChatConversation)
        .filter(ChatConversation.id == conversation_id, ChatConversation.user_id == user.id)
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="会话标题不能为空")
    conversation.title = title
    conversation.updated_at = utcnow()
    db.commit()
    db.refresh(conversation)
    message_count = db.query(func.count(ChatMessage.id)).filter(ChatMessage.conversation_id == conversation.id).scalar() or 0
    return ChatConversationOut(
        id=conversation.id,
        title=conversation.title,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        message_count=int(message_count),
    )


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict[str, str]:
    conversation = (
        db.query(ChatConversation)
        .filter(ChatConversation.id == conversation_id, ChatConversation.user_id == user.id)
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")
    db.delete(conversation)
    db.commit()
    return {"message": "会话已删除"}


def message_to_out(message: ChatMessage) -> ChatMessageOut:
    sources = [SourceOut.model_validate(item) for item in loads_list(message.sources_json) if isinstance(item, dict)]
    matched = [ConceptOut.model_validate(item) for item in loads_list(message.matched_concepts_json) if isinstance(item, dict)]
    graph_data = loads_dict(message.graph_json)
    perf_data = loads_dict(message.performance_json)
    return ChatMessageOut(
        id=message.id,
        role=message.role,
        content=message.content,
        status=message.status,
        confidence=float(message.confidence or 0),
        retrieval_confidence=float(message.retrieval_confidence or 0),
        answer_mode=message.answer_mode,
        sources=sources,
        related_questions=[str(item) for item in loads_list(message.related_questions_json)],
        matched_concepts=matched,
        graph=GraphOut.model_validate(graph_data or {"nodes": [], "edges": []}),
        performance=PerformanceOut.model_validate(perf_data or {}),
        created_at=message.created_at,
    )
