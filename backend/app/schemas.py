from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    token: str
    username: str
    role: str = "student"


class ConceptOut(BaseModel):
    id: int
    slug: str
    name_cn: str
    name_en: str
    aliases: list[str]
    chapter: str
    description: str


class GraphEdgeOut(BaseModel):
    id: int
    source_id: int
    target_id: int
    source_name: str
    target_name: str
    relation_type: str
    evidence: str


class GraphOut(BaseModel):
    nodes: list[ConceptOut]
    edges: list[GraphEdgeOut]


class QAPairBase(BaseModel):
    question: str
    answer: str
    type: str
    concept_ids: list[int] = []
    source_refs: list[dict[str, Any]] = []
    quality_status: str = "已校对"


class QAPairCreate(QAPairBase):
    pass


class QAPairUpdate(BaseModel):
    question: str | None = None
    answer: str | None = None
    type: str | None = None
    concept_ids: list[int] | None = None
    source_refs: list[dict[str, Any]] | None = None
    quality_status: str | None = None


class QAPairOut(QAPairBase):
    id: int
    created_at: datetime
    updated_at: datetime


class PaginatedQAPairs(BaseModel):
    items: list[QAPairOut]
    total: int
    page: int
    page_size: int


class SourceOut(BaseModel):
    chunk_id: str
    chapter: str
    section: str
    pdf_page: int
    source_file: str
    snippet: str
    summary: str = ""
    score: float


class AskRequest(BaseModel):
    question: str = Field(min_length=2)
    conversation_id: int | None = None


class PerformanceOut(BaseModel):
    analysis_ms: int = 0
    retrieval_ms: int = 0
    graph_ms: int = 0
    llm_ms: int = 0
    total_ms: int = 0
    retrieval_cache: str = ""


class AskResponse(BaseModel):
    conversation_id: int | None = None
    message_id: int | None = None
    question: str
    answer: str
    status: str
    confidence: float
    retrieval_confidence: float
    answer_mode: str
    notice: str = ""
    sources: list[SourceOut]
    related_questions: list[str]
    matched_concepts: list[ConceptOut]
    graph: GraphOut
    performance: PerformanceOut = PerformanceOut()


class ChatMessageOut(BaseModel):
    id: int
    role: str
    content: str
    status: str = ""
    confidence: float = 0
    retrieval_confidence: float = 0
    answer_mode: str = ""
    sources: list[SourceOut] = []
    related_questions: list[str] = []
    matched_concepts: list[ConceptOut] = []
    graph: GraphOut = GraphOut(nodes=[], edges=[])
    performance: PerformanceOut = PerformanceOut()
    created_at: datetime


class ChatConversationOut(BaseModel):
    id: int
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int = 0


class ChatConversationUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=160)


class ChatConversationDetail(ChatConversationOut):
    messages: list[ChatMessageOut] = []


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    created_at: datetime


class UserRoleUpdate(BaseModel):
    role: str


class UserPasswordUpdate(BaseModel):
    password: str = Field(min_length=6, max_length=128)


class LlmConfigOut(BaseModel):
    base_url: str
    model: str
    has_api_key: bool
    api_key_preview: str = ""
    disabled: bool = False


class LlmConfigUpdate(BaseModel):
    base_url: str | None = None
    model: str | None = None
    api_key: str | None = None
    clear_api_key: bool = False


class LlmConfigTestOut(BaseModel):
    configured: bool
    message: str


class ConceptUpdate(BaseModel):
    name_cn: str | None = None
    name_en: str | None = None
    aliases: list[str] | None = None
    chapter: str | None = None
    description: str | None = None


class ConceptCreate(BaseModel):
    slug: str
    name_cn: str
    name_en: str
    aliases: list[str] = []
    chapter: str = ""
    description: str = ""


class GraphEdgeCreate(BaseModel):
    source_id: int
    target_id: int
    relation_type: str
    evidence: str = ""


class GraphEdgeUpdate(BaseModel):
    relation_type: str | None = None
    evidence: str | None = None


class TextChunkOut(BaseModel):
    id: int
    chunk_id: str
    chapter: str
    section: str
    pdf_page: int
    source_file: str
    preview: str
    embedding_model: str


class ReferenceBookOut(BaseModel):
    id: int
    display_name: str
    filename: str
    storage_path: str
    is_active: bool
    page_count: int = 0
    chunk_count: int = 0
    index_status: str
    index_error: str = ""
    retrieval_mode: str
    created_at: datetime
    updated_at: datetime


class ReferenceBookIndexStatus(BaseModel):
    book_id: int
    index_status: str
    chunk_count: int = 0
    vector_index_ready: bool = False
    index_error: str = ""


class HistoryOut(BaseModel):
    id: int
    conversation_id: int | None = None
    message_id: int | None = None
    question: str
    answer_summary: str
    answer: str
    sources: list[dict[str, Any]]
    created_at: datetime
    favorited: bool = False


class SystemStats(BaseModel):
    users: int
    concepts: int
    graph_edges: int
    qa_pairs: int
    text_chunks: int
    llm_configured: bool
    pdf_available: bool
    retrieval_mode: str = "auto"
    vector_index_ready: bool = False
    active_book: dict[str, Any] | None = None
    active_book_chunks: int = 0
    index_status: str = "unknown"


class FavoriteOut(BaseModel):
    id: int
    history_id: int
    created_at: datetime


class UserNoteOut(BaseModel):
    id: int
    history_id: int
    content: str
    created_at: datetime
    updated_at: datetime


class ChunkDetailOut(BaseModel):
    id: int
    chunk_id: str
    chapter: str
    section: str
    pdf_page: int
    source_file: str
    text: str
    embedding_model: str
