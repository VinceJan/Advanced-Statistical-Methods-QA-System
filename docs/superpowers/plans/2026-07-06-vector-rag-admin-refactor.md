# Vector RAG And Admin Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real vector-index RAG path with TF-IDF fallback, improve admin information architecture, add paginated QA/text management and administrator-controlled reference-book indexing, then verify locally, visually, and on VPS.

**Architecture:** Keep the current FastAPI + SQLite + React stack. Add a small, deterministic local vector index that stores hashed embedding vectors on disk under `data/vector_index/`, then expose a retriever interface that can run in `tfidf`, `vector`, `hybrid`, or `auto` mode. Keep the first production slice conservative so the weak VPS remains deployable and the existing guardrails stay intact.

**Tech Stack:** FastAPI, SQLAlchemy, SQLite, pypdf, React, TypeScript, Vite, Cytoscape.js, Playwright, PowerShell verification scripts.

---

## File Structure

- Modify `backend/app/models.py`: add reference-book and index-job tables, add optional `text_chunks.book_id`.
- Modify `backend/app/database.py` or bootstrap path: add idempotent SQLite migrations for new columns/tables because Alembic is not present.
- Create `backend/app/retrieval.py`: move TF-IDF retrieval helpers and add shared retriever result types.
- Create `backend/app/vector_index.py`: build/load/search hashed vector index persisted under `data/vector_index/`.
- Modify `backend/app/rag.py`: delegate retrieval to retriever selection while preserving guardrails and response shape.
- Modify `backend/app/pdf_indexer.py`: accept a PDF path/book record and support safe rebuild into text chunks.
- Modify `backend/app/settings.py`: add retrieval mode, upload directory, vector index directory and upload size limits.
- Modify `backend/app/routers/admin.py`: add reference-book upload/list/activate/rebuild/status endpoints and paginated admin list endpoints.
- Modify `backend/app/routers/qa_pairs.py`: add server-side pagination and preserve existing unpaginated compatibility if needed.
- Modify `backend/app/routers/system.py`: expose retrieval/index/book status in system stats.
- Modify `backend/app/schemas.py`: add schemas for paginated results, reference books and index status.
- Modify `frontend/src/types.ts`: add matching types.
- Modify `frontend/src/api.ts`: add paginated APIs and reference-book APIs.
- Modify `frontend/src/main.tsx`: add admin subviews, clickable overview metrics, QA pagination and reference-book/index UI.
- Modify `frontend/src/styles.css`: add table, tabs, pagination, admin layout and upload/status styles.
- Modify `backend/tests/test_app.py`: add behavior tests for retrieval mode fallback, vector index search, book endpoints and pagination.
- Modify `frontend/e2e/visual-smoke.mjs`: add coverage for admin subviews, QA pagination and reference-book/index status.
- Modify docs after implementation: `README.md`, `.env.example`, `docs/运维手册.md`, `docs/部署方案.md`, `docs/对抗性审查.md`, `docs/验收记录.md`, `docs/架构与功能说明.md`.

## Task 1: Protect Baseline And Add Failing Backend Tests

**Files:**
- Modify: `backend/tests/test_app.py`

- [ ] **Step 1: Record current dirty-worktree context**

Run:

```powershell
git status --short
```

Expected: shows existing unrelated deliverables/docs changes plus this plan. Do not revert unrelated files.

- [ ] **Step 2: Add failing tests for pagination, vector mode metadata and admin-only book management**

Add tests that exercise public behavior:

```python
def test_qa_pairs_support_pagination(admin_token: str):
    response = client.get("/api/qa-pairs?page=1&page_size=10", headers=auth(admin_token))
    assert response.status_code == 200
    body = response.json()
    assert body["page"] == 1
    assert body["page_size"] == 10
    assert body["total"] >= 50
    assert len(body["items"]) <= 10


def test_system_stats_exposes_retrieval_status(admin_token: str):
    response = client.get("/api/system/stats", headers=auth(admin_token))
    assert response.status_code == 200
    body = response.json()
    assert body["retrieval_mode"] in {"tfidf", "vector", "hybrid", "auto"}
    assert "vector_index_ready" in body
    assert "active_book" in body


def test_reference_books_are_admin_only(user_token: str, admin_token: str):
    student = client.get("/api/admin/reference-books", headers=auth(user_token))
    assert student.status_code == 403
    admin = client.get("/api/admin/reference-books", headers=auth(admin_token))
    assert admin.status_code == 200
    body = admin.json()
    assert isinstance(body, list)
    assert any(book["is_active"] for book in body)
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest backend\tests -q
```

Expected: FAIL because pagination currently returns a plain list and reference-book/retrieval-status fields do not exist.

## Task 2: Implement Data Model, Migrations And Reference Book Baseline

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/database.py`
- Modify: `backend/app/bootstrap.py`
- Modify: `backend/app/schemas.py`

- [ ] **Step 1: Add models**

Add `ReferenceBook` and `IndexJob` models with fields for display name, filename, storage path, active flag, page count, chunk count, index status, error message and timestamps.

- [ ] **Step 2: Add idempotent SQLite migrations**

On startup, create missing tables and add `text_chunks.book_id` if absent using `PRAGMA table_info` and `ALTER TABLE`.

- [ ] **Step 3: Seed default reference book**

During bootstrap, ensure a `ReferenceBook` row exists for `ISLRv2_corrected_June_2023.pdf`; mark it active when no active book exists.

- [ ] **Step 4: Run backend tests**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest backend\tests -q
```

Expected: tests still fail only where retrieval status/API endpoints are not implemented.

## Task 3: Implement Retriever Interface And Lightweight Vector Index

**Files:**
- Create: `backend/app/retrieval.py`
- Create: `backend/app/vector_index.py`
- Modify: `backend/app/rag.py`
- Modify: `backend/app/pdf_indexer.py`
- Modify: `backend/app/settings.py`

- [ ] **Step 1: Extract TF-IDF retrieval without changing behavior**

Move tokenization, query expansion, scoring and source formatting into `TfidfRetriever`. Keep scores and snippets compatible with current responses.

- [ ] **Step 2: Add deterministic vector index**

Implement hashed bag-of-terms vectors with L2 normalization, persisted as JSON or pickle under `data/vector_index/<book-or-all>.json`. This is a local vector index, not just TF-IDF scoring, and remains lightweight enough for the VPS.

- [ ] **Step 3: Add search modes**

Implement:

```text
tfidf: current lexical retriever
vector: vector index only, falling back to empty if not ready
hybrid: vector candidates plus TF-IDF reranking/merge
auto: vector if ready, otherwise TF-IDF
```

- [ ] **Step 4: Preserve guardrails**

Keep `out_of_scope`, `insufficient_evidence`, source clearing, graph clearing, multi-turn contextualization and performance fields.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest backend\tests -q
```

Expected: retrieval-related tests pass or move to API endpoint failures only.

## Task 4: Add Admin APIs For Books, Indexes And Pagination

**Files:**
- Modify: `backend/app/routers/admin.py`
- Modify: `backend/app/routers/qa_pairs.py`
- Modify: `backend/app/routers/system.py`
- Modify: `backend/app/schemas.py`

- [ ] **Step 1: Add paginated response schema**

Return `{"items": [...], "total": n, "page": p, "page_size": s}` for paginated requests. Preserve old array response when no pagination params are supplied if frontend compatibility requires it.

- [ ] **Step 2: Add reference book endpoints**

Implement:

```text
GET /api/admin/reference-books
POST /api/admin/reference-books/upload
PATCH /api/admin/reference-books/{id}/activate
POST /api/admin/reference-books/{id}/rebuild
GET /api/admin/reference-books/{id}/index-status
```

- [ ] **Step 3: Add safe upload constraints**

Only accept `.pdf`, store under a controlled `data/reference_books/` directory, reject oversized files according to settings, and never read arbitrary user-provided absolute paths.

- [ ] **Step 4: Add system stats fields**

Expose `retrieval_mode`, `vector_index_ready`, `active_book`, `active_book_chunks`, `index_status`.

- [ ] **Step 5: Run backend tests and verify GREEN**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest backend\tests -q
```

Expected: backend tests pass.

## Task 5: Refactor Frontend Admin IA And QA Pagination

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Add types and APIs**

Add `Paginated<T>`, `ReferenceBook`, `IndexStatus` and API methods for paginated QA/admin data and reference-book management.

- [ ] **Step 2: Add QA pagination**

Update `QAManager` to show page size, current range, previous/next controls and filters. Reset page to 1 when filters change.

- [ ] **Step 3: Split admin into subviews**

Add an internal admin tab state with views: overview, users, model, books, qa, graph, chunks, histories. Make overview metrics clickable.

- [ ] **Step 4: Add reference-book UI**

Show active book, upload PDF control, activate button, rebuild button, index status and retrieval mode.

- [ ] **Step 5: Improve dense-list presentation**

Use tables or compact rows for users, QA, chunks, graph edges and histories. Keep mobile stacking behavior.

- [ ] **Step 6: Run frontend build**

Run:

```powershell
Push-Location frontend; npm run build; Pop-Location
```

Expected: build succeeds.

## Task 6: Expand Visual Smoke And Documentation

**Files:**
- Modify: `frontend/e2e/visual-smoke.mjs`
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `docs/架构与功能说明.md`
- Modify: `docs/运维手册.md`
- Modify: `docs/部署方案.md`
- Modify: `docs/对抗性审查.md`
- Modify: `docs/验收记录.md`

- [ ] **Step 1: Add visual smoke coverage**

Capture admin overview, QA pagination, reference-book/index panel and mobile layout.

- [ ] **Step 2: Rebuild `docs/架构与功能说明.md` if still empty**

If the file is still 0 bytes, reconstruct stable architecture documentation from current code and new implementation. If user content appears meanwhile, preserve it and patch in the new architecture sections.

- [ ] **Step 3: Update docs**

Document retrieval modes, vector index storage, reference-book upload path, backup requirements, validation commands and online deployment checks.

- [ ] **Step 4: Run full local verification**

Run:

```powershell
.\scripts\verify.ps1
```

Expected: backend tests, frontend build, npm audit and Playwright smoke all pass.

## Task 7: Deploy And Public Verification

**Files:**
- No code changes expected after this task unless verification reveals defects.

- [ ] **Step 1: Commit and push after local verification passes**

Run normal git staging/commit/push only after reviewing `git diff` and excluding unrelated user changes.

- [ ] **Step 2: Wait for GitHub Actions deployment**

Confirm the deployment workflow completes.

- [ ] **Step 3: Public health checks**

Run:

```bash
curl -fsS https://aistudyassistant.bluesclawd.dev/api/health
curl -fsS https://aistudyassistant.bluesclawd.dev/api/system/stats
```

Expected: health is ok and stats include active book/retrieval/vector fields.

- [ ] **Step 4: Public functional smoke**

Verify on the public site:

```text
管理员登录
“我是谁” => out_of_scope, no sources, no graph
“岭回归和 Lasso 有什么区别？” => answered, sources, graph
管理后台总览和教材/索引子视图可打开
问答对分页可翻页
```

## Self-Review

- Spec coverage: vector RAG, switchable retrieval, admin refactor, QA pagination, reference-book management, frontend polish, local verification, Playwright visual smoke and VPS verification are covered.
- Placeholder scan: no `TBD` or open-ended implementation placeholders remain; tasks name exact files, endpoints and commands.
- Type consistency: schemas and frontend types use `Paginated<T>`, `ReferenceBook`, `IndexStatus`, and retrieval mode values `tfidf|vector|hybrid|auto`.
