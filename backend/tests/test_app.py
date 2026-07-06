from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app.llm import LLMClient
from backend.app.main import app
from backend.app.schemas import SourceOut


def test_vector_index_builds_and_searches_text_chunks(tmp_path) -> None:
    with TestClient(app):
        from backend.app import database
        from backend.app.vector_index import build_vector_index, search_vector_index

        assert database.SessionLocal is not None
        db = database.SessionLocal()
        try:
            state = build_vector_index(db, tmp_path)
            assert state.ready
            assert state.chunk_count >= 50
            results = search_vector_index(db, "岭回归和 Lasso 有什么区别？", tmp_path, top_k=5)
            assert results
            assert results[0].score > 0
            joined = " ".join(result.summary.lower() + " " + result.snippet.lower() for result in results)
            assert "ridge" in joined or "lasso" in joined
        finally:
            db.close()


def test_rag_service_uses_vector_mode_when_configured(tmp_path) -> None:
    with TestClient(app):
        from backend.app import database
        from backend.app.rag import RagService
        from backend.app.settings import settings
        from backend.app.vector_index import build_vector_index

        assert database.SessionLocal is not None
        db = database.SessionLocal()
        old_mode = settings.retrieval_mode
        old_index_dir = settings.vector_index_dir
        try:
            build_vector_index(db, tmp_path)
            object.__setattr__(settings, "retrieval_mode", "vector")
            object.__setattr__(settings, "vector_index_dir", tmp_path)
            service = RagService(db)
            sources = service.retrieve("岭回归和 Lasso 有什么区别？", top_k=3)
            assert sources
            assert service.last_retrieval_cache == "vector"
        finally:
            object.__setattr__(settings, "retrieval_mode", old_mode)
            object.__setattr__(settings, "vector_index_dir", old_index_dir)
            db.close()


def test_health_and_stats() -> None:
    with TestClient(app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        stats = client.get("/api/system/stats")
        assert stats.status_code == 200
        body = stats.json()
        assert body["concepts"] >= 60
        assert body["graph_edges"] >= 100
        assert body["qa_pairs"] >= 60
        assert body["text_chunks"] >= 50


def test_next_stage_stats_pagination_and_reference_books() -> None:
    with TestClient(app) as client:
        admin = client.post("/api/auth/login", json={"username": "admin", "password": "Admin@123456"})
        assert admin.status_code == 200
        admin_headers = {"Authorization": f"Bearer {admin.json()['token']}"}

        student = client.post("/api/auth/register", json={"username": "book_student", "password": "password123"})
        if student.status_code == 409:
            student = client.post("/api/auth/login", json={"username": "book_student", "password": "password123"})
        assert student.status_code == 200
        student_headers = {"Authorization": f"Bearer {student.json()['token']}"}

        stats = client.get("/api/system/stats")
        assert stats.status_code == 200
        stats_body = stats.json()
        assert stats_body["retrieval_mode"] in {"tfidf", "vector", "hybrid", "auto"}
        assert "vector_index_ready" in stats_body
        if stats_body["retrieval_mode"] in {"vector", "hybrid", "auto"}:
            assert stats_body["vector_index_ready"] is True
        assert "active_book" in stats_body
        assert "index_status" in stats_body

        paged = client.get("/api/qa-pairs?page=1&page_size=10", headers=admin_headers)
        assert paged.status_code == 200
        paged_body = paged.json()
        assert paged_body["page"] == 1
        assert paged_body["page_size"] == 10
        assert paged_body["total"] >= 60
        assert len(paged_body["items"]) <= 10

        student_books = client.get("/api/admin/reference-books", headers=student_headers)
        assert student_books.status_code == 403

        books = client.get("/api/admin/reference-books", headers=admin_headers)
        assert books.status_code == 200
        book_items = books.json()
        assert isinstance(book_items, list)
        assert book_items
        assert any(book["is_active"] for book in book_items)
        active = next(book for book in book_items if book["is_active"])
        assert active["filename"] == "ISLRv2_corrected_June_2023.pdf"
        assert active["chunk_count"] >= 50

        rebuilt = client.post(f"/api/admin/reference-books/{active['id']}/rebuild", headers=admin_headers)
        assert rebuilt.status_code == 200
        rebuilt_body = rebuilt.json()
        assert rebuilt_body["index_status"] == "ready"
        assert rebuilt_body["chunk_count"] >= 50
        assert rebuilt_body["vector_index_ready"] is True


def test_admin_can_upload_reference_book_metadata() -> None:
    with TestClient(app) as client:
        admin = client.post("/api/auth/login", json={"username": "admin", "password": "Admin@123456"})
        assert admin.status_code == 200
        admin_headers = {"Authorization": f"Bearer {admin.json()['token']}"}

        student = client.post("/api/auth/register", json={"username": "upload_student", "password": "password123"})
        if student.status_code == 409:
            student = client.post("/api/auth/login", json={"username": "upload_student", "password": "password123"})
        student_headers = {"Authorization": f"Bearer {student.json()['token']}"}

        student_upload = client.post(
            "/api/admin/reference-books/upload",
            headers=student_headers,
            files={"file": ("student.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")},
        )
        assert student_upload.status_code == 403

        uploaded = client.post(
            "/api/admin/reference-books/upload",
            headers=admin_headers,
            files={"file": ("uploaded-reference.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")},
        )
        assert uploaded.status_code == 200
        body = uploaded.json()
        assert body["filename"].endswith(".pdf")
        assert body["display_name"] == "uploaded-reference.pdf"
        assert body["is_active"] is False
        assert body["index_status"] in {"pending", "empty"}

        from pathlib import Path

        from backend.app import database
        from backend.app.models import ReferenceBook

        assert database.SessionLocal is not None
        db = database.SessionLocal()
        try:
            book = db.get(ReferenceBook, body["id"])
            if book:
                Path(book.storage_path).unlink(missing_ok=True)
                db.delete(book)
                db.commit()
        finally:
            db.close()


def test_auth_qa_crud_and_ask() -> None:
    with TestClient(app) as client:
        username = "tester_crud"
        password = "password123"
        reg = client.post("/api/auth/register", json={"username": username, "password": password})
        if reg.status_code == 409:
            reg = client.post("/api/auth/login", json={"username": username, "password": password})
        assert reg.status_code == 200
        token = reg.json()["token"]
        assert reg.json()["role"] in {"admin", "student"}
        headers = {"Authorization": f"Bearer {token}"}

        pairs = client.get("/api/qa-pairs", headers=headers)
        assert pairs.status_code == 200
        assert len(pairs.json()) >= 60

        forbidden_create = client.post(
            "/api/qa-pairs",
            headers=headers,
            json={
                "question": "学生不应新增问答对",
                "answer": "权限测试",
                "type": "概念解释",
                "concept_ids": [],
                "source_refs": [],
                "quality_status": "草稿",
            },
        )
        assert forbidden_create.status_code == 403

        admin = client.post("/api/auth/login", json={"username": "admin", "password": "Admin@123456"})
        assert admin.status_code == 200
        admin_headers = {"Authorization": f"Bearer {admin.json()['token']}"}

        created = client.post(
            "/api/qa-pairs",
            headers=admin_headers,
            json={
                "question": "测试问题：什么是课程项目？",
                "answer": "这是一个用于测试 CRUD 的问答对。",
                "type": "概念解释",
                "concept_ids": [],
                "source_refs": [{"source": "测试"}],
                "quality_status": "草稿",
            },
        )
        assert created.status_code == 200
        pair_id = created.json()["id"]

        updated = client.patch(
            f"/api/qa-pairs/{pair_id}",
            headers=admin_headers,
            json={"quality_status": "已校对", "answer": "这是一个已更新的测试问答对。"},
        )
        assert updated.status_code == 200
        assert updated.json()["quality_status"] == "已校对"

        ask = client.post("/api/chat/ask", headers=headers, json={"question": "岭回归和 Lasso 有什么区别？"})
        assert ask.status_code == 200
        answer = ask.json()
        assert answer["status"] in {"answered", "llm_error"}
        assert answer["conversation_id"]
        assert answer["message_id"]
        assert answer["performance"]["total_ms"] >= 0
        assert answer["sources"]
        assert answer["graph"]["nodes"]
        assert "引用来源" in answer["answer"]

        follow_up = client.post(
            "/api/chat/ask",
            headers=headers,
            json={"question": "那它为什么能做变量选择？", "conversation_id": answer["conversation_id"]},
        )
        assert follow_up.status_code == 200
        follow_up_body = follow_up.json()
        assert follow_up_body["conversation_id"] == answer["conversation_id"]
        assert follow_up_body["status"] in {"answered", "llm_error"}
        assert follow_up_body["graph"]["nodes"]

        conversations = client.get("/api/chat/conversations", headers=headers)
        assert conversations.status_code == 200
        assert any(item["id"] == answer["conversation_id"] and item["message_count"] >= 4 for item in conversations.json())

        conversation = client.get(f"/api/chat/conversations/{answer['conversation_id']}", headers=headers)
        assert conversation.status_code == 200
        assert len(conversation.json()["messages"]) >= 4

        unrelated = client.post("/api/chat/ask", headers=headers, json={"question": "我是谁"})
        assert unrelated.status_code == 200
        unrelated_body = unrelated.json()
        assert unrelated_body["status"] == "out_of_scope"
        assert unrelated_body["sources"] == []
        assert unrelated_body["related_questions"] == []
        assert unrelated_body["graph"]["nodes"] == []

        deleted = client.delete(f"/api/qa-pairs/{pair_id}", headers=admin_headers)
        assert deleted.status_code == 200


def test_graph_recommendations_and_history() -> None:
    with TestClient(app) as client:
        auth = client.post("/api/auth/login", json={"username": "tester_crud", "password": "password123"})
        if auth.status_code != 200:
            auth = client.post("/api/auth/register", json={"username": "tester_crud", "password": "password123"})
        token = auth.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        concepts = client.get("/api/graph/concepts?q=逻辑回归", headers=headers)
        assert concepts.status_code == 200
        concept_id = concepts.json()[0]["id"]

        recs = client.get(f"/api/graph/recommendations?concept_id={concept_id}", headers=headers)
        assert recs.status_code == 200
        assert len(recs.json()) == 3

        graph = client.get(f"/api/graph/subgraph?concept_id={concept_id}", headers=headers)
        assert graph.status_code == 200
        assert graph.json()["edges"]

        graph_list = client.get("/api/graph/concepts", headers=headers)
        assert graph_list.status_code == 200
        assert len(graph_list.json()) >= 20

        history = client.get("/api/history", headers=headers)
        assert history.status_code == 200
        if history.json():
            assert "answer" in history.json()[0]
            assert "conversation_id" in history.json()[0]

        clear = client.delete("/api/history", headers=headers)
        assert clear.status_code == 200


def test_admin_permissions_and_admin_apis() -> None:
    with TestClient(app) as client:
        student = client.post("/api/auth/register", json={"username": "plain_student", "password": "password123"})
        if student.status_code == 409:
            student = client.post("/api/auth/login", json={"username": "plain_student", "password": "password123"})
        student_headers = {"Authorization": f"Bearer {student.json()['token']}"}
        forbidden = client.get("/api/admin/users", headers=student_headers)
        assert forbidden.status_code == 403

        admin = client.post("/api/auth/login", json={"username": "admin", "password": "Admin@123456"})
        assert admin.status_code == 200
        assert admin.json()["role"] == "admin"
        admin_headers = {"Authorization": f"Bearer {admin.json()['token']}"}

        users = client.get("/api/admin/users", headers=admin_headers)
        assert users.status_code == 200
        assert any(user["role"] == "admin" for user in users.json())

        llm_config = client.get("/api/admin/llm-config", headers=admin_headers)
        assert llm_config.status_code == 200
        assert "api_key_preview" in llm_config.json()

        patched_llm = client.patch(
            "/api/admin/llm-config",
            headers=admin_headers,
            json={"base_url": "https://api.minimaxi.com/v1", "model": "MiniMax-M3"},
        )
        assert patched_llm.status_code == 200
        assert patched_llm.json()["model"] == "MiniMax-M3"

        llm_test = client.post("/api/admin/llm-config/test", headers=admin_headers)
        assert llm_test.status_code == 200
        assert "configured" in llm_test.json()

        chunks = client.get("/api/admin/chunks?q=ridge", headers=admin_headers)
        assert chunks.status_code == 200
        assert chunks.json()

        managed_username = f"managed_{uuid4().hex[:8]}"
        managed = client.post("/api/auth/register", json={"username": managed_username, "password": "password123"})
        assert managed.status_code == 200
        managed_user_id = next(user["id"] for user in client.get("/api/admin/users", headers=admin_headers).json() if user["username"] == managed_username)
        reset = client.patch(f"/api/admin/users/{managed_user_id}/password", headers=admin_headers, json={"password": "newpass123"})
        assert reset.status_code == 200
        assert client.post("/api/auth/login", json={"username": managed_username, "password": "newpass123"}).status_code == 200
        assert client.post(f"/api/admin/users/{managed_user_id}/logout", headers=admin_headers).status_code == 200
        assert client.delete(f"/api/admin/users/{managed_user_id}", headers=admin_headers).status_code == 200

        slug = f"acceptance-{uuid4().hex[:8]}"
        concept = client.post(
            "/api/admin/concepts",
            headers=admin_headers,
            json={
                "slug": slug,
                "name_cn": "验收知识点",
                "name_en": "Acceptance Concept",
                "aliases": ["验收节点"],
                "chapter": "验收",
                "description": "用于管理员 CRUD 自动化测试。",
            },
        )
        assert concept.status_code == 200
        concept_id = concept.json()["id"]

        patched_concept = client.patch(
            f"/api/admin/concepts/{concept_id}",
            headers=admin_headers,
            json={"description": "用于管理员 CRUD 自动化测试，已更新。"},
        )
        assert patched_concept.status_code == 200
        assert "已更新" in patched_concept.json()["description"]

        target_id = client.get("/api/graph/concepts?q=回归", headers=admin_headers).json()[0]["id"]
        edge = client.post(
            "/api/admin/edges",
            headers=admin_headers,
            json={
                "source_id": concept_id,
                "target_id": target_id,
                "relation_type": "测试关联",
                "evidence": "管理员 CRUD 测试关系。",
            },
        )
        assert edge.status_code == 200
        edge_id = edge.json()["id"]

        patched_edge = client.patch(
            f"/api/admin/edges/{edge_id}",
            headers=admin_headers,
            json={"relation_type": "测试更新"},
        )
        assert patched_edge.status_code == 200
        assert patched_edge.json()["relation_type"] == "测试更新"

        assert client.delete(f"/api/admin/edges/{edge_id}", headers=admin_headers).status_code == 200
        assert client.delete(f"/api/admin/concepts/{concept_id}", headers=admin_headers).status_code == 200


def test_llm_client_mock_success_and_failure(monkeypatch) -> None:
    evidence = [
        SourceOut(
            chunk_id="test",
            chapter="第6章",
            section="Ridge Regression",
            pdf_page=250,
            source_file="book.pdf",
            snippet="Ridge regression uses an L2 penalty.",
            summary="Ridge regression uses an L2 penalty.",
            score=10.0,
        )
    ]

    class FakeResponse:
        def __init__(self, fail: bool = False):
            self.fail = fail

        def raise_for_status(self) -> None:
            if self.fail:
                raise RuntimeError("boom")

        def json(self):
            return {"choices": [{"message": {"content": "模拟 MiniMax 回答"}}]}

    class FakeClient:
        def __init__(self, *args, fail: bool = False, **kwargs):
            self.fail = fail

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, *args, **kwargs):
            return FakeResponse(self.fail)

    monkeypatch.setenv("APP_DISABLE_LLM", "false")
    monkeypatch.setenv("MINIMAX_API_KEY", "mock-key")
    monkeypatch.setattr("httpx.AsyncClient", FakeClient)
    result = __import__("asyncio").run(LLMClient().answer("什么是岭回归？", evidence, []))
    assert result.mode == "minimax"
    assert result.content == "模拟 MiniMax 回答"

    class FailingClient(FakeClient):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, fail=True, **kwargs)

    monkeypatch.setattr("httpx.AsyncClient", FailingClient)
    failed = __import__("asyncio").run(LLMClient().answer("什么是岭回归？", evidence, []))
    assert failed.mode == "local_fallback"
    assert failed.error
