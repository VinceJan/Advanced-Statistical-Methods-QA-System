from __future__ import annotations

from collections import deque

from sqlalchemy import or_
from sqlalchemy.orm import Session

from .models import Concept, GraphEdge
from .schemas import ConceptOut, GraphEdgeOut, GraphOut
from .serialization import loads_list


def concept_to_out(concept: Concept) -> ConceptOut:
    return ConceptOut(
        id=concept.id,
        slug=concept.slug,
        name_cn=concept.name_cn,
        name_en=concept.name_en,
        aliases=[str(x) for x in loads_list(concept.aliases_json)],
        chapter=concept.chapter,
        description=concept.description,
    )


def edge_to_out(edge: GraphEdge, concepts: dict[int, Concept]) -> GraphEdgeOut:
    source = concepts[edge.source_id]
    target = concepts[edge.target_id]
    return GraphEdgeOut(
        id=edge.id,
        source_id=edge.source_id,
        target_id=edge.target_id,
        source_name=source.name_cn,
        target_name=target.name_cn,
        relation_type=edge.relation_type,
        evidence=edge.evidence,
    )


def find_concepts(db: Session, question: str, limit: int = 5) -> list[Concept]:
    question_l = question.lower()
    scored: list[tuple[int, Concept]] = []
    for concept in db.query(Concept).all():
        aliases = [concept.name_cn, concept.name_en, *[str(x) for x in loads_list(concept.aliases_json)]]
        score = 0
        for alias in aliases:
            alias_l = alias.lower()
            if alias and alias in question:
                score += 5 + len(alias)
            elif alias_l and alias_l in question_l:
                score += 5 + len(alias_l)
        if score:
            scored.append((score, concept))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [concept for _, concept in scored[:limit]]


def get_subgraph(db: Session, concept_ids: list[int], depth: int = 1, limit: int = 30) -> GraphOut:
    if not concept_ids:
        return GraphOut(nodes=[], edges=[])
    seen = set(concept_ids)
    frontier = set(concept_ids)
    edge_ids: set[int] = set()
    for _ in range(depth):
        if not frontier or len(seen) >= limit:
            break
        edges = (
            db.query(GraphEdge)
            .filter(or_(GraphEdge.source_id.in_(frontier), GraphEdge.target_id.in_(frontier)))
            .limit(limit * 4)
            .all()
        )
        next_frontier: set[int] = set()
        for edge in edges:
            edge_ids.add(edge.id)
            for node_id in (edge.source_id, edge.target_id):
                if node_id not in seen and len(seen) < limit:
                    seen.add(node_id)
                    next_frontier.add(node_id)
        frontier = next_frontier
    concepts = {c.id: c for c in db.query(Concept).filter(Concept.id.in_(seen)).all()}
    edges = db.query(GraphEdge).filter(GraphEdge.id.in_(edge_ids)).all() if edge_ids else []
    filtered_edges = [e for e in edges if e.source_id in concepts and e.target_id in concepts]
    return GraphOut(
        nodes=[concept_to_out(c) for c in concepts.values()],
        edges=[edge_to_out(e, concepts) for e in filtered_edges],
    )


def shortest_path_edges(db: Session, source_id: int, target_id: int, max_depth: int = 4) -> list[GraphEdge]:
    adjacency: dict[int, list[GraphEdge]] = {}
    for edge in db.query(GraphEdge).all():
        adjacency.setdefault(edge.source_id, []).append(edge)
    queue = deque([(source_id, [])])
    seen = {source_id}
    while queue:
        node_id, path = queue.popleft()
        if len(path) >= max_depth:
            continue
        for edge in adjacency.get(node_id, []):
            if edge.target_id == target_id:
                return [*path, edge]
            if edge.target_id not in seen:
                seen.add(edge.target_id)
                queue.append((edge.target_id, [*path, edge]))
    return []


def recommended_questions(db: Session, concept_ids: list[int], limit: int = 3) -> list[str]:
    if not concept_ids:
        return ["什么是交叉验证？", "岭回归和 Lasso 有什么区别？", "逻辑回归可以用来解决什么问题？"]
    concepts = db.query(Concept).filter(Concept.id.in_(concept_ids)).all()
    questions: list[str] = []
    for concept in concepts:
        questions.extend(
            [
                f"什么是{concept.name_cn}？",
                f"{concept.name_cn}适合用来解决什么问题？",
                f"{concept.name_cn}和哪些概念关系最密切？",
            ]
        )
    seen: list[str] = []
    for question in questions:
        if question not in seen:
            seen.append(question)
    return seen[:limit]
