from __future__ import annotations

import re
import os
from dataclasses import dataclass

import httpx
from sqlalchemy.orm import Session

from .app_config import get_llm_config
from .models import ChatMessage
from .schemas import SourceOut


# 限制同时进行的 LLM 调用数量，防止弱 VPS 内存暴涨
import asyncio
_LLM_SEMAPHORE = asyncio.Semaphore(5)


@dataclass(frozen=True)
class AnswerResult:
    content: str
    mode: str
    error: str = ""


class LLMClient:
    def __init__(self, db: Session | None = None):
        self.db = db

    def configured(self) -> bool:
        return bool(self.api_key()) and os.getenv("APP_DISABLE_LLM", "").lower() not in {"1", "true", "yes"}

    def api_key(self) -> str:
        return get_llm_config(self.db).api_key

    def base_url(self) -> str:
        return get_llm_config(self.db).base_url

    def model(self) -> str:
        return get_llm_config(self.db).model

    async def answer(self, question: str, evidence: list[SourceOut], graph_notes: list[str], history: list[ChatMessage] | None = None) -> AnswerResult:
        if not self.configured():
            return AnswerResult(self.local_answer(question, evidence, graph_notes), "local_fallback", "missing_api_key")
        prompt = self._build_prompt(question, evidence, graph_notes, history or [])
        url = self.base_url().rstrip("/") + "/chat/completions"
        payload = {
            "model": self.model(),
            "messages": [
                {"role": "system", "content": "你是高级统计方法课程的中文助教。只依据给定教材片段和知识图谱事实回答，不确定时明确说明。"},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
            "max_completion_tokens": 900,
            "thinking": {"type": "disabled"},
        }
        headers = {"Authorization": f"Bearer {self.api_key()}", "Content-Type": "application/json"}
        async with _LLM_SEMAPHORE:
            try:
                async with httpx.AsyncClient(timeout=45) as client:
                    response = await client.post(url, headers=headers, json=payload)
                    response.raise_for_status()
                    data = response.json()
                content = data["choices"][0]["message"].get("content", "")
                content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
                return AnswerResult(content or self.local_answer(question, evidence, graph_notes), "minimax")
            except Exception as exc:
                fallback = self.local_answer(question, evidence, graph_notes)
                return AnswerResult(fallback, "local_fallback", type(exc).__name__)

    def local_answer(self, question: str, evidence: list[SourceOut], graph_notes: list[str]) -> str:
        evidence_context = " ".join(
            f"{source.chapter} {source.section} {source.summary} {source.snippet}"
            for source in evidence[:5]
        )
        joined_context = f"{question} {' '.join(graph_notes)} {evidence_context}".lower()
        if "变量选择" in question and ("lasso" in joined_context or "l1" in joined_context or "l1" in question.lower()):
            return (
                "Lasso 能做变量选择，核心原因是它使用 L1 惩罚。L1 惩罚会把系数估计压向 0，并且在优化几何上更容易让某些系数正好等于 0；"
                "这些系数对应的变量就可以被视为没有进入最终模型。\n\n"
                "和岭回归相比，岭回归的 L2 惩罚通常只是把系数整体缩小，很少让系数精确变成 0；"
                "因此岭回归更适合保留所有变量并处理共线性，Lasso 更适合希望得到稀疏、可解释模型的场景。\n\n"
                "但要注意：如果多个变量高度相关，Lasso 可能只保留其中一部分，选择结果会受样本和调参影响；实际使用时应结合交叉验证、业务解释和稳定性检查。"
            )
        snippets = "；".join((source.summary or source.snippet) for source in evidence[:3]) or "当前教材证据不足。"
        graph_text = "；".join(graph_notes[:4]) if graph_notes else "知识图谱未找到明确关系路径。"
        return (
            f"针对“{question}”，可以先依据教材证据这样理解：{snippets}\n\n"
            f"结合知识图谱，相关关系为：{graph_text}\n\n"
            "学习时建议同时关注定义、适用条件、与相邻概念的区别，以及它在模型选择或评估中的作用。"
        )

    def _build_prompt(self, question: str, evidence: list[SourceOut], graph_notes: list[str], history: list[ChatMessage]) -> str:
        evidence_text = "\n".join(
            f"[{i}] {src.chapter} / {src.section} / PDF第{src.pdf_page}页：{src.summary or src.snippet}"
            for i, src in enumerate(evidence, start=1)
        )
        graph_text = "\n".join(f"- {note}" for note in graph_notes) or "- 未找到明确图谱关系。"
        history_text = "\n".join(
            f"{'学生' if msg.role == 'user' else '助教'}：{msg.content[:420]}"
            for msg in history[-6:]
        ) or "无"
        return (
            f"问题：{question}\n\n"
            f"最近对话上下文：\n{history_text}\n\n"
            f"教材片段：\n{evidence_text}\n\n"
            f"知识图谱事实：\n{graph_text}\n\n"
            "请用简体中文回答。要求：\n"
            "1. 先给出直接结论。\n"
            "2. 用分段或列表解释关键依据。\n"
            "3. 如果是比较类问题，用表格或清晰对比。\n"
            "4. 如果教材证据不足，只能说明不足，不能编造来源。\n"
            "5. 不要输出原始 PDF 乱码公式；必要公式用标准 LaTeX。"
        )
