from __future__ import annotations

import math
import re
import time
from collections import Counter
from dataclasses import dataclass

from sqlalchemy import func
from sqlalchemy.orm import Session

from .graph_service import find_concepts, get_subgraph, recommended_questions
from .llm import LLMClient
from .models import ChatConversation, ChatMessage, Concept, GraphEdge, QAPair, QuestionHistory, TextChunk, User, utcnow
from .schemas import AskResponse, PerformanceOut, SourceOut
from .serialization import dumps, loads_list


TERM_EXPANSIONS = {
    "交叉验证": "cross-validation cross validation validation set k-fold leave-one-out",
    "岭回归": "ridge regression shrinkage L2 regularization",
    "逻辑回归": "logistic regression classification probability logit",
    "线性回归": "linear regression least squares coefficient",
    "偏差": "bias variance trade-off flexibility",
    "方差": "variance bias variance trade-off flexibility",
    "Lasso": "lasso L1 regularization variable selection",
    "套索": "lasso L1 regularization variable selection",
    "随机森林": "random forest bagging trees predictors split",
    "支持向量机": "support vector machine SVM kernel margin",
    "主成分": "principal component analysis PCA dimension reduction",
    "聚类": "clustering k-means hierarchical dendrogram",
    "K近邻": "K-nearest neighbors KNN classification",
    "自助法": "bootstrap resampling standard error",
    "剪枝": "pruning tree cost complexity",
}


TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9\-']+|\d+(?:\.\d+)?|[\u4e00-\u9fff]{2,}")
RETRIEVAL_THRESHOLD = 4.0
STRONG_RETRIEVAL_THRESHOLD = 8.0
STOPWORDS = {
    "the", "and", "or", "to", "of", "in", "on", "for", "is", "are", "am", "who", "what", "why", "how",
    "this", "that", "with", "from", "as", "by", "it", "be", "a", "an", "我是谁", "是谁", "什么", "怎么",
}
COURSE_SCOPE_HINTS = {
    "统计", "回归", "分类", "模型", "学习", "验证", "方差", "偏差", "正则", "聚类", "主成分",
    "random", "forest", "regression", "classification", "lasso", "ridge", "svm", "pca", "clustering",
}
FOLLOW_UP_HINTS = {"它", "这个", "这些", "上述", "前面", "刚才", "继续", "那", "两者", "区别", "为什么", "怎么", "举例", "公式"}
CLEAR_OUT_OF_SCOPE_HINTS = {"我是谁", "天气", "写诗", "唱歌", "电影", "股票", "旅游", "菜谱", "笑话"}


@dataclass(frozen=True)
class IndexedChunk:
    id: int
    chunk_id: str
    text: str
    chapter: str
    section: str
    pdf_page: int
    source_file: str
    token_counts: Counter[str]


@dataclass(frozen=True)
class TextIndex:
    signature: tuple[int, int]
    chunks: list[IndexedChunk]
    df: Counter[str]


_TEXT_INDEX_CACHE: TextIndex | None = None


@dataclass(frozen=True)
class QuestionAnalysis:
    in_scope: bool
    confidence: float
    retrieval_confidence: float
    status: str
    answer_mode: str
    notice: str
    matched: list[Concept]
    sources: list[SourceOut]


class RagService:
    def __init__(self, db: Session):
        self.db = db
        self.llm = LLMClient(db)
        self.last_retrieval_ms = 0
        self.last_retrieval_cache = ""

    async def ask(self, user: User, question: str, conversation_id: int | None = None) -> AskResponse:
        started = time.perf_counter()
        conversation = self.get_or_create_conversation(user, conversation_id, question)
        prior_messages = self.recent_messages(conversation.id)
        contextual_question = self.contextualize_question(question, prior_messages)
        user_message = ChatMessage(conversation_id=conversation.id, role="user", content=question)
        self.db.add(user_message)
        self.db.flush()

        graph_ms = 0
        llm_ms = 0
        analysis_started = time.perf_counter()
        analysis = self.analyze_question(contextual_question, raw_question=question)
        analysis_ms = elapsed_ms(analysis_started)
        matched = analysis.matched
        sources = analysis.sources
        if analysis.status != "answered":
            answer = analysis.notice
            graph = get_subgraph(self.db, [], depth=1, limit=0)
            related: list[str] = []
            answer_mode = analysis.answer_mode
            status = analysis.status
        else:
            graph_started = time.perf_counter()
            graph = get_subgraph(self.db, [c.id for c in matched], depth=1, limit=24)
            graph_notes = [f"{edge.source_name} --{edge.relation_type}--> {edge.target_name}：{edge.evidence}" for edge in graph.edges[:8]]
            related = recommended_questions(self.db, [c.id for c in matched], limit=3) if matched else []
            curated = self.find_curated_answer(question, matched, exact_only=bool(prior_messages))
            graph_ms = elapsed_ms(graph_started)
            if curated and not self.llm.configured():
                answer = curated
                answer_mode = "curated_fallback"
                status = "answered"
            else:
                llm_started = time.perf_counter()
                llm_result = await self.llm.answer(question, sources, graph_notes, history=prior_messages)
                llm_ms = elapsed_ms(llm_started)
                answer = llm_result.content
                answer_mode = llm_result.mode
                status = "llm_error" if llm_result.error and llm_result.error != "missing_api_key" and self.llm.configured() else "answered"
        if analysis.status != "answered":
            graph_ms = 0
            llm_ms = 0
        perf = PerformanceOut(
            analysis_ms=analysis_ms,
            retrieval_ms=self.last_retrieval_ms,
            graph_ms=graph_ms,
            llm_ms=llm_ms,
            total_ms=elapsed_ms(started),
            retrieval_cache=self.last_retrieval_cache,
        )
        matched_out = [
            {
                "id": c.id,
                "slug": c.slug,
                "name_cn": c.name_cn,
                "name_en": c.name_en,
                "aliases": [],
                "chapter": c.chapter,
                "description": c.description,
            }
            for c in matched
        ]
        response_answer = append_source_footer(answer, sources)
        assistant_message = ChatMessage(
            conversation_id=conversation.id,
            role="assistant",
            content=response_answer,
            status=status,
            confidence=str(analysis.confidence),
            retrieval_confidence=str(analysis.retrieval_confidence),
            answer_mode=answer_mode,
            sources_json=dumps([src.model_dump() for src in sources]),
            related_questions_json=dumps(related),
            matched_concepts_json=dumps(matched_out),
            graph_json=graph.model_dump_json(),
            performance_json=perf.model_dump_json(),
        )
        conversation.title = conversation.title if conversation.title != "新会话" else make_title(question)
        conversation.updated_at = utcnow()
        self.db.add(assistant_message)
        self.db.flush()
        history = QuestionHistory(
            user_id=user.id,
            conversation_id=conversation.id,
            message_id=assistant_message.id,
            question=question,
            answer=response_answer,
            answer_summary=summarize(response_answer),
            sources_json=dumps([src.model_dump() for src in sources]),
        )
        self.db.add(history)
        self.db.commit()
        return AskResponse(
            conversation_id=conversation.id,
            message_id=assistant_message.id,
            question=question,
            answer=response_answer,
            status=status,
            confidence=analysis.confidence,
            retrieval_confidence=analysis.retrieval_confidence,
            answer_mode=answer_mode,
            notice=analysis.notice,
            sources=sources,
            related_questions=related,
            matched_concepts=matched_out,
            graph=graph,
            performance=perf,
        )

    def get_or_create_conversation(self, user: User, conversation_id: int | None, question: str) -> ChatConversation:
        if conversation_id is not None:
            conversation = (
                self.db.query(ChatConversation)
                .filter(ChatConversation.id == conversation_id, ChatConversation.user_id == user.id)
                .first()
            )
            if conversation:
                return conversation
        conversation = ChatConversation(user_id=user.id, title=make_title(question))
        self.db.add(conversation)
        self.db.flush()
        return conversation

    def recent_messages(self, conversation_id: int, limit: int = 8) -> list[ChatMessage]:
        return list(
            reversed(
                self.db.query(ChatMessage)
                .filter(ChatMessage.conversation_id == conversation_id)
                .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
                .limit(limit)
                .all()
            )
        )

    def contextualize_question(self, question: str, prior_messages: list[ChatMessage]) -> str:
        if not prior_messages:
            return question
        lowered = question.lower()
        if any(hint in lowered for hint in CLEAR_OUT_OF_SCOPE_HINTS):
            return question
        is_follow_up = len(question) <= 40 or any(hint in question for hint in FOLLOW_UP_HINTS)
        if not is_follow_up:
            return question
        user_turns = [msg.content for msg in prior_messages if msg.role == "user"][-2:]
        assistant_concepts: list[str] = []
        for msg in prior_messages:
            if msg.role != "assistant":
                continue
            for concept in loads_list(msg.matched_concepts_json):
                if isinstance(concept, dict):
                    name = concept.get("name_cn") or concept.get("name_en")
                    if name:
                        assistant_concepts.append(str(name))
        context_bits = user_turns + assistant_concepts[-6:]
        if not context_bits:
            return question
        return f"{question}\n上下文：{'；'.join(context_bits)}"

    def find_curated_answer(self, question: str, matched: list[Concept], exact_only: bool = False) -> str:
        normalized = normalize_question(question)
        pairs = self.db.query(QAPair).all()
        for pair in pairs:
            if normalize_question(pair.question) == normalized:
                return pair.answer
        if exact_only:
            return ""
        matched_ids = {concept.id for concept in matched}
        if not matched_ids:
            return ""
        best: tuple[int, QAPair] | None = None
        for pair in pairs:
            ids = {int(x) for x in __import__("json").loads(pair.concept_ids_json or "[]")}
            score = len(ids & matched_ids)
            if score and (best is None or score > best[0]):
                best = (score, pair)
        return best[1].answer if best and best[0] >= 2 else ""

    def analyze_question(self, question: str, raw_question: str | None = None) -> QuestionAnalysis:
        matched = find_concepts(self.db, question, limit=4)
        sources = self.retrieve(question, top_k=5)
        retrieval_confidence = sources[0].score if sources else 0.0
        raw = raw_question or question
        has_scope_hint = any(hint.lower() in raw.lower() or hint.lower() in question.lower() for hint in COURSE_SCOPE_HINTS)

        # 知识点匹配度：0-1，匹配越多越高，但边际递减
        concept_confidence = min(1.0, len(matched) / 3 + (0.15 if len(matched) >= 1 else 0))

        # 检索得分归一化：使用 sigmoid 风格映射，避免线性除法导致过早饱和
        # 典型检索得分范围 0-50，20 分左右为较强证据
        retrieval_confidence_norm = 1.0 / (1.0 + math.exp(-(retrieval_confidence - 12) / 6))

        # 综合置信度：检索权重更高（60%），知识点匹配占 40%
        confidence = 0.4 * concept_confidence + 0.6 * retrieval_confidence_norm

        # 根据检索强度分档衰减，避免弱证据给出过高置信度
        if retrieval_confidence < RETRIEVAL_THRESHOLD:
            confidence *= 0.5
        elif retrieval_confidence < STRONG_RETRIEVAL_THRESHOLD:
            confidence *= 0.85

        # 硬上限：无来源或极少匹配时，置信度不超过 0.55
        if not sources or len(matched) == 0:
            confidence = min(confidence, 0.55)

        confidence = round(max(0.3, min(0.95, confidence)), 3)

        if any(hint in raw.lower() for hint in CLEAR_OUT_OF_SCOPE_HINTS):
            matched = []
            sources = []
            retrieval_confidence = 0.0
            confidence = 0.0
        if not matched and retrieval_confidence < RETRIEVAL_THRESHOLD and not has_scope_hint:
            return QuestionAnalysis(
                in_scope=False,
                confidence=confidence,
                retrieval_confidence=retrieval_confidence,
                status="out_of_scope",
                answer_mode="guardrail",
                notice="当前系统只支持高级统计方法课程相关问题。这个问题没有匹配到课程知识点或可靠教材证据，因此不展示来源、推荐问题或知识图谱。",
                matched=[],
                sources=[],
            )
        if not sources or retrieval_confidence < RETRIEVAL_THRESHOLD:
            return QuestionAnalysis(
                in_scope=True,
                confidence=confidence,
                retrieval_confidence=retrieval_confidence,
                status="insufficient_evidence",
                answer_mode="guardrail",
                notice="这个问题可能与统计学习有关，但当前教材检索证据不足。请换成更具体的课程概念，例如“交叉验证”“岭回归”“逻辑回归”或“随机森林”。",
                matched=matched,
                sources=[],
            )
        return QuestionAnalysis(
            in_scope=True,
            confidence=confidence,
            retrieval_confidence=retrieval_confidence,
            status="answered",
            answer_mode="pending",
            notice="",
            matched=matched,
            sources=sources,
        )

    def retrieve(self, question: str, top_k: int = 5) -> list[SourceOut]:
        started = time.perf_counter()
        self.last_retrieval_cache = get_cache_state(self.db)
        index = get_text_index(self.db)
        self.last_retrieval_cache = "warm" if self.last_retrieval_cache == "warm" else "cold"
        if not index.chunks:
            self.last_retrieval_ms = elapsed_ms(started)
            return []
        expanded = expand_query(question)
        query_tokens = [token for token in tokenize(expanded) if token not in STOPWORDS]
        if not query_tokens:
            self.last_retrieval_ms = elapsed_ms(started)
            return []
        total_docs = len(index.chunks)
        scored: list[tuple[float, IndexedChunk]] = []
        for chunk in index.chunks:
            score = score_chunk(query_tokens, chunk, index.df, total_docs)
            if score > 0:
                scored.append((score, chunk))
        scored.sort(key=lambda item: item[0], reverse=True)
        results: list[SourceOut] = []
        for score, chunk in scored[:top_k]:
            results.append(
                SourceOut(
                    chunk_id=chunk.chunk_id,
                    chapter=chunk.chapter,
                    section=chunk.section,
                    pdf_page=chunk.pdf_page,
                    source_file=chunk.source_file,
                    snippet=best_snippet(chunk.text, query_tokens),
                    summary=readable_summary(chunk.text, query_tokens),
                    score=round(score, 4),
                )
            )
        self.last_retrieval_ms = elapsed_ms(started)
        return results


def expand_query(question: str) -> str:
    additions = []
    for cn, en in TERM_EXPANSIONS.items():
        if cn.lower() in question.lower():
            additions.append(en)
    return f"{question} {' '.join(additions)}"


def tokenize(text: str) -> list[str]:
    tokens = []
    for token in TOKEN_RE.findall(text):
        token = token.lower().strip("-'")
        if len(token) >= 2 and token not in STOPWORDS:
            tokens.append(token)
    return tokens


def document_frequency(chunks: list[TextChunk]) -> Counter[str]:
    df: Counter[str] = Counter()
    for chunk in chunks:
        df.update(set(tokenize(chunk.text)))
    return df


def score_chunk(query_tokens: list[str], chunk: IndexedChunk | TextChunk, df: Counter[str], total_docs: int) -> float:
    counts = chunk.token_counts if isinstance(chunk, IndexedChunk) else Counter(tokenize(chunk.text))
    if not counts:
        return 0.0
    score = 0.0
    query_counts = Counter(query_tokens)
    for token, q_weight in query_counts.items():
        tf = counts[token]
        if not tf:
            continue
        idf = math.log((total_docs + 1) / (df[token] + 1)) + 1
        score += (1 + math.log(tf)) * idf * min(q_weight, 3)
    chapter_bonus = 0.4 if any(token in (chunk.section + " " + chunk.chapter).lower() for token in query_tokens) else 0.0
    return score + chapter_bonus


def best_snippet(text: str, query_tokens: list[str], max_len: int = 360) -> str:
    clean = sanitize_display_text(text)
    sentence = best_clean_sentence(clean, query_tokens)
    if sentence:
        return sentence[:max_len] + ("..." if len(sentence) > max_len else "")
    if len(clean) <= max_len:
        return clean
    lowered = clean.lower()
    positions = [lowered.find(token.lower()) for token in query_tokens if lowered.find(token.lower()) >= 0]
    start = max(min(positions) - 90, 0) if positions else 0
    snippet = clean[start : start + max_len].strip()
    return ("..." if start > 0 else "") + snippet + ("..." if start + max_len < len(clean) else "")


def readable_summary(text: str, query_tokens: list[str], max_len: int = 220) -> str:
    snippet = best_clean_sentence(sanitize_display_text(text), query_tokens) or best_snippet(text, query_tokens, max_len=max_len)
    snippet = re.sub(r"\bFIGURE\s+\d+\.\d+.*", "", snippet, flags=re.IGNORECASE)
    snippet = re.sub(r"[\\{}_^]+", " ", snippet)
    snippet = re.sub(r"\s+", " ", snippet).strip(" .;，。")
    return snippet[:max_len] + ("..." if len(snippet) > max_len else "")


def sanitize_display_text(text: str) -> str:
    clean = re.sub(r"\s+", " ", text).strip()
    clean = clean.replace("Thelassois", "The lasso is").replace("Thelasso", "The lasso")
    clean = clean.replace("ridge regre...", "ridge regression")
    clean = re.sub(r"([a-z])([A-Z])", r"\1 \2", clean)
    clean = re.sub(r"\bFIGURE\s+\d+\.\d+.*?(?=(The|This|In|We|For)\b)", " ", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\s+", " ", clean)
    return clean.strip()


def best_clean_sentence(text: str, query_tokens: list[str]) -> str:
    sentences = re.split(r"(?<=[.!?])\s+", text)
    candidates: list[str] = []
    for sentence in sentences:
        lowered = sentence.lower()
        if not any(token in lowered for token in query_tokens):
            continue
        if is_noisy_sentence(sentence):
            continue
        candidates.append(sentence.strip())
        if len(" ".join(candidates)) > 260:
            break
    return " ".join(candidates).strip()


def is_noisy_sentence(sentence: str) -> bool:
    if len(sentence) < 40:
        return True
    if re.search(r"\bFIGURE\b|\bCoefficient Estimate\b|\bMean Squared Error\b", sentence, re.IGNORECASE):
        return True
    if len(re.findall(r"[\\{}_^∑βλπµσ∞≈≤≥]", sentence)) > 8:
        return True
    if len(re.findall(r"\d", sentence)) / max(len(sentence), 1) > 0.22:
        return True
    return False


def normalize_question(question: str) -> str:
    return re.sub(r"[\s？?，,。.!！:：]+", "", question).lower()


def summarize(answer: str, max_len: int = 140) -> str:
    clean = re.sub(r"\s+", " ", answer).strip()
    return clean[:max_len] + ("..." if len(clean) > max_len else "")


def append_source_footer(answer: str, sources: list[SourceOut]) -> str:
    if not sources:
        return answer
    lines = ["", "引用来源："]
    for idx, source in enumerate(sources[:5], start=1):
        section = clean_section_name(source.section, source.chapter)
        lines.append(f"{idx}. {source.source_file}，{source.chapter}，{section}，PDF第{source.pdf_page}页。")
    return answer.rstrip() + "\n" + "\n".join(lines)


def clean_section_name(section: str, fallback: str) -> str:
    if not section or section == fallback:
        return fallback
    if re.search(r"\bFIGURE\b|\bPrinter\b|\bWe can see\b", section, re.IGNORECASE):
        return fallback
    digit_ratio = len(re.findall(r"\d", section)) / max(len(section), 1)
    if digit_ratio > 0.35 or len(section) > 90:
        return fallback
    if re.search(r"\d{2,}\s+[A-Z]", section):
        return fallback
    return section


def get_text_index(db: Session) -> TextIndex:
    global _TEXT_INDEX_CACHE
    count = db.query(func.count(TextChunk.id)).scalar() or 0
    max_id = db.query(func.max(TextChunk.id)).scalar() or 0
    signature = (count, max_id)
    if _TEXT_INDEX_CACHE and _TEXT_INDEX_CACHE.signature == signature:
        return _TEXT_INDEX_CACHE
    chunks: list[IndexedChunk] = []
    df: Counter[str] = Counter()
    for chunk in db.query(TextChunk).order_by(TextChunk.id).all():
        token_counts = Counter(tokenize(chunk.text))
        df.update(set(token_counts))
        chunks.append(
            IndexedChunk(
                id=chunk.id,
                chunk_id=chunk.chunk_id,
                text=chunk.text,
                chapter=chunk.chapter,
                section=chunk.section,
                pdf_page=chunk.pdf_page,
                source_file=chunk.source_file,
                token_counts=token_counts,
            )
        )
    _TEXT_INDEX_CACHE = TextIndex(signature=signature, chunks=chunks, df=df)
    return _TEXT_INDEX_CACHE


def get_cache_state(db: Session) -> str:
    if not _TEXT_INDEX_CACHE:
        return "cold"
    count = db.query(func.count(TextChunk.id)).scalar() or 0
    max_id = db.query(func.max(TextChunk.id)).scalar() or 0
    return "warm" if _TEXT_INDEX_CACHE.signature == (count, max_id) else "cold"


def elapsed_ms(started: float) -> int:
    return max(0, round((time.perf_counter() - started) * 1000))


def make_title(question: str) -> str:
    clean = re.sub(r"\s+", " ", question).strip()
    return clean[:28] + ("..." if len(clean) > 28 else "")
