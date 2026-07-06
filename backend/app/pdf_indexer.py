from __future__ import annotations

import re
from pathlib import Path

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import TextChunk
from .settings import settings

INDEX_VERSION = "local-clean-v3"

CHAPTER_BREAKS = [
    (1, "封面、前言与目录"),
    (25, "第2章 统计学习"),
    (69, "第3章 线性回归"),
    (139, "第4章 分类"),
    (207, "第5章 重采样方法"),
    (249, "第6章 线性模型选择与正则化"),
    (293, "第7章 超越线性"),
    (339, "第8章 基于树的方法"),
    (389, "第9章 支持向量机"),
    (431, "第10章 深度学习"),
    (477, "第11章 生存分析"),
    (511, "第12章 无监督学习"),
]


def build_text_chunks_if_needed(db: Session, min_chunks: int = 200) -> int:
    existing = db.query(func.count(TextChunk.id)).scalar() or 0
    current_version = db.query(func.count(TextChunk.id)).filter(TextChunk.embedding_model == INDEX_VERSION).scalar() or 0
    if existing >= min_chunks and current_version == existing:
        return existing
    if existing > 0:
        db.query(TextChunk).delete()
        db.commit()
    return build_text_chunks(db)


def build_text_chunks(db: Session, pdf_path: Path | None = None, book_id: int | None = None) -> int:
    pdf_path = pdf_path or settings.pdf_path
    if not pdf_path.exists():
        return 0
    try:
        from pypdf import PdfReader
    except Exception:
        return 0

    reader = PdfReader(str(pdf_path))
    total = 0
    for page_index, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        text = normalize_text(text)
        if should_skip_page(page_index, text):
            continue
        chapter = infer_chapter(page_index)
        section = infer_section(text, chapter)
        for chunk_no, chunk in enumerate(split_text(text), start=1):
            chunk = clean_chunk(chunk)
            if should_skip_chunk(chunk):
                continue
            total += 1
            db.add(
                TextChunk(
                    book_id=book_id,
                    chunk_id=f"islr-p{page_index:03d}-{chunk_no:02d}",
                    text=chunk,
                    chapter=chapter,
                    section=section,
                    pdf_page=page_index,
                    source_file=pdf_path.name,
                    embedding_model=INDEX_VERSION,
                )
            )
    db.commit()
    return total


def normalize_text(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", text)
    text = re.sub(r"([.!?])(?=[A-Z])", r"\1 ", text)
    text = re.sub(r"\b(\d{1,3})\s+\d+\.\s+Linear Model Selection and Regularization\b", "", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def should_skip_page(page: int, text: str) -> bool:
    if page < 25:
        return True
    lowered = text.lower()
    if "contents" in lowered and len(text) < 4000:
        return True
    return len(text) < 220


def clean_chunk(text: str) -> str:
    text = re.sub(r"\bFIGURE\s+\d+\.\d+.*?(?=(?:[A-Z][a-z]{3,}|$))", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\bCoefficient Estimate\b.*?(?=(?:Ridge|Lasso|The|This|In)\b)", " ", text)
    text = re.sub(r"([∑βλπµσ∞≈≤≥])", r" \1 ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def should_skip_chunk(text: str) -> bool:
    if len(text) < 180:
        return True
    symbol_count = len(re.findall(r"[\\∑βλπµσ∞≈≤≥{}_^]", text))
    alpha_count = len(re.findall(r"[A-Za-z]", text))
    if symbol_count > 18 and alpha_count < 260:
        return True
    number_ratio = len(re.findall(r"\d", text)) / max(len(text), 1)
    if number_ratio > 0.28:
        return True
    figure_noise = len(re.findall(r"\bFIGURE\b|\bCoefficient Estimate\b|\bMean Squared Error\b", text, re.IGNORECASE))
    if figure_noise >= 2:
        return True
    return False


def split_text(text: str, chunk_size: int = 1200, overlap: int = 180) -> list[str]:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        if len(current) + len(paragraph) + 1 <= chunk_size:
            current = f"{current}\n{paragraph}".strip()
            continue
        if current:
            chunks.append(current)
        if len(paragraph) <= chunk_size:
            current = paragraph
        else:
            for start in range(0, len(paragraph), chunk_size - overlap):
                part = paragraph[start : start + chunk_size].strip()
                if part:
                    chunks.append(part)
            current = ""
    if current:
        chunks.append(current)
    if not chunks:
        for start in range(0, len(text), chunk_size - overlap):
            chunks.append(text[start : start + chunk_size].strip())
    return chunks


def infer_chapter(page: int) -> str:
    current = CHAPTER_BREAKS[0][1]
    for start, chapter in CHAPTER_BREAKS:
        if page >= start:
            current = chapter
        else:
            break
    return current


def infer_section(text: str, fallback: str) -> str:
    match = re.search(r"\b(\d{1,2}\.\d+(?:\.\d+)?)\s+([A-Z][A-Za-z0-9,;:\-\s]{4,80})", text)
    if match:
        return f"{match.group(1)} {match.group(2).strip()}"
    return fallback
