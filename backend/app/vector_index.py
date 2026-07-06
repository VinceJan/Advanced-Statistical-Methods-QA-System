from __future__ import annotations

import json
import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from .models import TextChunk
from .schemas import SourceOut


VECTOR_INDEX_VERSION = "hashed-vector-v1"
VECTOR_DIMENSIONS = 768
TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9\-']+|\d+(?:\.\d+)?|[\u4e00-\u9fff]{2,}")
STOPWORDS = {
    "the", "and", "or", "to", "of", "in", "on", "for", "is", "are", "am", "what", "why", "how",
    "this", "that", "with", "from", "as", "by", "it", "be", "a", "an", "什么", "怎么", "为什么",
}
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


@dataclass(frozen=True)
class VectorIndexState:
    ready: bool
    chunk_count: int
    index_path: Path
    version: str = VECTOR_INDEX_VERSION


def default_index_path(index_dir: Path) -> Path:
    return index_dir / "text_chunks_hashed_vector.json"


def vector_index_ready(index_dir: Path) -> bool:
    path = default_index_path(index_dir)
    if not path.exists():
        return False
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return False
    return payload.get("version") == VECTOR_INDEX_VERSION and bool(payload.get("items"))


def build_vector_index(db: Session, index_dir: Path) -> VectorIndexState:
    index_dir.mkdir(parents=True, exist_ok=True)
    chunks = db.query(TextChunk).order_by(TextChunk.id).all()
    items = []
    for chunk in chunks:
        weights = vectorize(chunk.text)
        if not weights:
            continue
        items.append({"id": chunk.id, "weights": sorted(weights.items())})
    payload = {
        "version": VECTOR_INDEX_VERSION,
        "dimensions": VECTOR_DIMENSIONS,
        "chunk_count": len(items),
        "items": items,
    }
    path = default_index_path(index_dir)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return VectorIndexState(ready=bool(items), chunk_count=len(items), index_path=path)


def search_vector_index(db: Session, question: str, index_dir: Path, top_k: int = 5) -> list[SourceOut]:
    index = load_index(index_dir)
    if not index:
        return []
    query_vector = vectorize(expand_query(question))
    if not query_vector:
        return []
    chunk_ids = [item["id"] for item in index]
    chunks = {chunk.id: chunk for chunk in db.query(TextChunk).filter(TextChunk.id.in_(chunk_ids)).all()}
    scored: list[tuple[float, TextChunk]] = []
    for item in index:
        chunk = chunks.get(item["id"])
        if not chunk:
            continue
        score = dot(query_vector, dict(item["weights"]))
        if score > 0:
            scored.append((score, chunk))
    scored.sort(key=lambda item: item[0], reverse=True)
    query_tokens = tokenize(expand_query(question))
    return [
        SourceOut(
            chunk_id=chunk.chunk_id,
            chapter=chunk.chapter,
            section=chunk.section,
            pdf_page=chunk.pdf_page,
            source_file=chunk.source_file,
            snippet=best_snippet(chunk.text, query_tokens),
            summary=best_snippet(chunk.text, query_tokens, max_len=220),
            score=round(score * 100, 4),
        )
        for score, chunk in scored[:top_k]
    ]


def load_index(index_dir: Path) -> list[dict]:
    path = default_index_path(index_dir)
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    if payload.get("version") != VECTOR_INDEX_VERSION:
        return []
    return payload.get("items") or []


def expand_query(question: str) -> str:
    additions = []
    lowered = question.lower()
    for cn, en in TERM_EXPANSIONS.items():
        if cn.lower() in lowered:
            additions.append(en)
    return f"{question} {' '.join(additions)}"


def tokenize(text: str) -> list[str]:
    tokens = []
    for token in TOKEN_RE.findall(text):
        normalized = token.lower().strip("-'")
        if len(normalized) >= 2 and normalized not in STOPWORDS:
            tokens.append(normalized)
    return tokens


def vectorize(text: str) -> dict[int, float]:
    counts = Counter(tokenize(text))
    if not counts:
        return {}
    weighted: dict[int, float] = {}
    for token, count in counts.items():
        bucket = stable_hash(token) % VECTOR_DIMENSIONS
        sign = 1 if stable_hash(f"{token}:sign") % 2 == 0 else -1
        weighted[bucket] = weighted.get(bucket, 0.0) + sign * (1.0 + math.log(count))
    norm = math.sqrt(sum(value * value for value in weighted.values()))
    if norm == 0:
        return {}
    return {bucket: value / norm for bucket, value in weighted.items()}


def stable_hash(text: str) -> int:
    value = 2166136261
    for byte in text.encode("utf-8"):
        value ^= byte
        value = (value * 16777619) & 0xFFFFFFFF
    return value


def dot(left: dict[int, float], right: dict[int, float]) -> float:
    if len(left) > len(right):
        left, right = right, left
    return sum(value * right.get(bucket, 0.0) for bucket, value in left.items())


def best_snippet(text: str, query_tokens: list[str], max_len: int = 360) -> str:
    clean = sanitize_display_text(text)
    if len(clean) <= max_len:
        return clean
    lowered = clean.lower()
    positions = [lowered.find(token.lower()) for token in query_tokens if lowered.find(token.lower()) >= 0]
    start = max(min(positions) - 90, 0) if positions else 0
    snippet = clean[start : start + max_len].strip()
    return ("..." if start > 0 else "") + snippet + ("..." if start + max_len < len(clean) else "")


def sanitize_display_text(text: str) -> str:
    clean = re.sub(r"\s+", " ", text).strip()
    clean = clean.replace("Thelassois", "The lasso is").replace("Thelasso", "The lasso")
    clean = re.sub(r"([a-z])([A-Z])", r"\1 \2", clean)
    clean = re.sub(r"\bFIGURE\s+\d+\.\d+.*?(?=(The|This|In|We|For)\b)", " ", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\bCoefficient Estimate\b.*?(?=(Ridge|Lasso|The|This|In)\b)", " ", clean)
    clean = re.sub(r"[\\{}_^]+", " ", clean)
    clean = re.sub(r"\s+", " ", clean)
    return clean.strip()
