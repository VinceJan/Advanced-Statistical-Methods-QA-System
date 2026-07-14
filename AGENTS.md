# AGENTS.md

本文件是给后续 AI/开发者的项目规则手册。不要把它写成变更日志；只保留会影响后续实现、验证和部署判断的稳定事实。

## 项目定位

- 这是题目二课程项目：高级统计方法知识图谱智能问答系统。
- 当前主语料是 `ISLRv2_corrected_June_2023.pdf`；中文扫描教材已移除，不作为 RAG 输入。
- 系统默认中文界面、中文回答；教材证据可以来自英文 PDF。
- 当前交付形态包括本地演示和 VPS Docker 部署；公网地址为 `https://aistudyassistant.bluesclawd.dev`。

## 运行方式

- 安装依赖：`.\scripts\setup.ps1`
- 启动后端：`.\scripts\run_backend.ps1`
- 启动前端：`.\scripts\run_frontend.ps1`
- 完整验证：`.\scripts\verify.ps1`
- 前端地址：`http://127.0.0.1:5173`
- 后端地址：`http://127.0.0.1:8000`

## 关键环境变量

- `.env` 必须保留在本地，不提交。
- `MINIMAX_API_KEY` 只能写入 `.env` 或服务器环境变量，不要写入 README、报告、截图说明或源码。
- `APP_DISABLE_LLM=true` 用于测试禁用外部 LLM。
- `APP_DATABASE_URL` 默认 `sqlite:///data/app.db`。
- `APP_PDF_PATH` 默认 `ISLRv2_corrected_June_2023.pdf`。
- `APP_RETRIEVAL_MODE` 默认 `auto`，可选 `auto`、`vector`、`hybrid`、`tfidf`。
- `APP_REFERENCE_BOOKS_DIR` 默认 `data/reference_books`，用于管理员上传参考书。
- `APP_VECTOR_INDEX_DIR` 默认 `data/vector_index`，用于本地向量索引。
- `APP_MAX_REFERENCE_BOOK_MB` 默认 `80`。
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` 用于种子化管理员账号。
- `SITE_DOMAIN` / `COMPOSE_PROJECT_NAME` 用于 Docker/Caddy 部署。

## 架构边界

- 后端入口：`backend/app/main.py`。
- 数据模型：`backend/app/models.py`。
- RAG、范围判断、多轮上下文、性能统计：`backend/app/rag.py`。
- MiniMax 调用和本地降级回答：`backend/app/llm.py`。
- PDF 抽取和清洗：`backend/app/pdf_indexer.py`。
- 本地向量索引构建与检索：`backend/app/vector_index.py`。
- 种子知识点、图谱边和问答对：`backend/app/seed_data.py`。
- 运行时 LLM 配置：`backend/app/app_config.py` 与 `system_config` 表。
- 前端主界面：`frontend/src/main.tsx`。
- 前端 API 封装：`frontend/src/api.ts`。
- 前端类型：`frontend/src/types.ts`。

## 文档入口

- 新 Agent 接手时**必读**顺序：
  1. `README.md`
  2. `AGENTS.md`
  3. **`docs/Agent接手指南.md`**（⚠️ 必读：阅读顺序、当前状态、红线、验证命令、发布摘要流程）
  4. `docs/架构与功能说明.md`
  5. `docs/运维手册.md`
  6. `docs/对抗性审查.md`
  7. `docs/验收记录.md`
- 文档总索引：`docs/README.md`。
- 题目、目标、约束和上下文等过程性材料统一放在 `docs/project/`，不要再移回根目录。
- 日常部署、发布、回滚、备份和故障排查以 `docs/运维手册.md` 为准。
- 架构、模块职责、数据表、问答流程和扩展方向以 `docs/架构与功能说明.md` 为准。

## 功能不变量

- 无关问题必须返回 `out_of_scope`，且 `sources=[]`、`related_questions=[]`、`graph.nodes=[]`、`graph.edges=[]`。
- 证据不足问题必须返回 `insufficient_evidence`，不能编造来源。
- 每一轮多轮追问都必须重新计算来源、推荐问题和知识图谱，不能沿用上一轮证据。
- 清晰无关问题不能被多轮上下文污染，例如连续追问后再问“我是谁”仍应拒答。
- 历史记录必须能查看当时回答全文和当时来源。
- 会话列表必须允许用户打开、重命名和删除自己的会话；会话写入接口必须校验当前用户所有权。
- 收藏与笔记：用户可收藏回答，在"我的笔记"页面查看并编辑学习笔记；笔记内容仅自己可见。
- 普通学生不能看到管理后台和问答对管理入口；后端写入型管理接口必须校验管理员角色。
- 管理员后台至少覆盖用户角色、学生删除/注销/改密、LLM API 配置、问答对入口、文本块检索/重建、知识点 CRUD、图谱边 CRUD、历史审计。
- 回答区必须支持 Markdown/KaTeX，不能把明显 PDF 抽取乱码直接展示为最终答案。
- 图谱使用 Cytoscape.js，避免恢复手写 SVG 布局。

## 数据和生成物

- `data/` 是运行数据库和索引缓存目录，已被 `.gitignore` 忽略。
- `frontend/dist/` 是构建产物，已被 `.gitignore` 忽略。
- `.venv/`、`frontend/node_modules/`、`__pycache__/`、`.pytest_cache/` 均不属于源码。
- `docs/qa-screenshots/` 是验收截图，可以作为课程项目证据保留。
- Docker 入口包括 `Dockerfile.backend`、`frontend/Dockerfile`、`docker-compose.yml`、`docker-compose.server.yml`、`deploy/Caddyfile`。
- `deliverables/` 仅保存本地课程交付物；最终报告为本地文件 `高级统计方法知识图谱项目报告_重制版.docx`，不提交到公开代码仓库。答辩 PPT 可按需用 `scripts/make_ppt_decks.py` 重新生成。

## 根目录规则

- 根目录只保留项目入口、运行入口和仓库级配置，例如 `README.md`、`AGENTS.md`、`.env.example`、`.gitignore`、`.dockerignore`、`Dockerfile.backend`、`docker-compose.yml`、`docker-compose.server.yml`、教材 PDF 和关键脚本目录。
- 课程过程文档、目标契约、上下文、验收、运维、架构说明放入 `docs/` 或 `docs/project/`。
- Dockerfile 和 Compose 文件保留在根目录是刻意设计，方便服务器部署和 Docker 构建上下文，不要仅为“看起来整齐”移动它们。

## 验证要求

完成任何功能修改后至少运行：

```powershell
.\scripts\verify.ps1
```

该脚本会先清理 8000/5173 端口，再运行后端测试、前端构建、npm audit 和 Playwright 视觉冒烟。不要只用“能打开页面”代替验证。

## 文档同步要求

- 改 API、环境变量、数据模型、部署方式时，同步更新 `README.md`、`docs/部署方案.md` 或相关 docs。
- 改线上部署、发布、回滚、备份、域名、端口或 Caddy/Nginx 反代时，同步更新 `docs/运维手册.md`。
- 改模块职责、数据流、表结构或核心架构时，同步更新 `docs/架构与功能说明.md`。
- 改多轮问答、RAG 可信度、权限边界、视觉验收时，同步更新 `docs/对抗性审查.md` 和 `docs/验收记录.md`。
- 不要在 `AGENTS.md` 追加历史叙事；只写后续实现必须遵守的规则。
