# 高级统计方法知识图谱智能问答系统

题目二课程项目成品实现。系统以 `ISLRv2_corrected_June_2023.pdf` 为主语料，提供中文多轮问答、教材 RAG 来源引用、知识图谱子图、问题推荐、用户登录、学习历史、管理员后台和可复现实验验证。

当前版本既支持本地演示，也已提供 Docker Compose 部署文件，可部署到 VPS。真实 API Key 只应放在本地或服务器 `.env` 中，不要写入代码、文档、报告或提交记录。

## 核心能力

- 多轮问答：问答工作台支持会话列表、连续追问、会话删除和逐轮证据面板。
- 可信 RAG：系统先判断问题是否属于高级统计方法课程范围；无关问题返回空证据状态，不展示伪来源、伪推荐或伪图谱。
- 教材检索：从英文文本型 PDF 抽取正文，按章节和页码切分，中文问题通过术语扩展检索英文教材证据。
- 向量 RAG：支持本地持久化向量索引，并可在 `auto`、`vector`、`hybrid`、`tfidf` 模式间切换；弱 VPS 或索引缺失时可自动降级。
- 中文回答：默认使用 MiniMax OpenAI-compatible Chat Completions；无 Key 或测试模式下使用本地证据降级回答。
- 知识图谱：内置 69 个知识点、336 条关系边，支持 Cytoscape 子图展示、节点点击和推荐问题。
- 历史记录：保存用户提问历史，点击可查看当时回答全文和引用来源。
- 收藏与笔记：用户可收藏有价值的回答，在"我的笔记"页面查看并编辑学习笔记。
- 管理后台：管理员可审计用户、问答对、知识点、图谱边、教材文本块和历史记录，可管理 LLM Base URL、模型和 API Key，也可修改学生密码、注销会话、删除账号。
- 参考书管理：管理员可上传新的 PDF 参考书、切换当前教材并重建文本块与向量索引。
- 性能观测：每轮回答返回检索、图谱、LLM 和总耗时；RAG 文本块、分词和文档频率使用进程内缓存。

## 项目结构

```text
.
├── backend/                 # FastAPI 后端
│   ├── app/
│   │   ├── routers/          # auth/chat/graph/history/admin/qa/system 路由
│   │   ├── rag.py            # 检索、范围判断、多轮上下文和性能统计
│   │   ├── llm.py            # MiniMax 调用与本地降级回答
│   │   ├── models.py         # SQLite 数据模型
│   │   ├── pdf_indexer.py    # PDF 抽取与文本块清洗
│   │   └── seed_data.py      # 知识点、图谱边和问答对种子数据
│   ├── requirements.txt
│   └── tests/
├── frontend/                 # React + TypeScript + Vite 前端
│   ├── e2e/visual-smoke.mjs  # Playwright 真实浏览器验收
│   └── src/
├── docs/
│   ├── README.md             # 文档索引
│   ├── Agent接手指南.md
│   ├── 架构与功能说明.md
│   ├── 运维手册.md
│   ├── qa-screenshots/       # 验收截图
│   ├── 部署方案.md
│   ├── 对抗性审查.md
│   ├── 完成度评估.md
│   ├── 验收记录.md
│   └── 实验报告.md
├── deliverables/             # 答辩 PPT 与演讲稿
├── scripts/                  # Windows PowerShell 启动与验证脚本
├── deploy/Caddyfile          # Docker Compose 自带 Caddy 入口
├── docs/project/             # 题目、目标、约束、上下文等过程性材料
├── Dockerfile.backend        # 后端镜像
├── docker-compose.yml        # 本机或独立服务器 HTTPS Compose
├── docker-compose.server.yml # 已有宿主机 Caddy 时使用
├── ISLRv2_corrected_June_2023.pdf
├── AGENTS.md
├── README.md
├── .env.example
└── .gitignore
```

不应提交或依赖的生成内容：`.env`、`.venv/`、`frontend/node_modules/`、`frontend/dist/`、`data/`、`__pycache__/`、`.pytest_cache/`。

## 技术栈

- 后端：FastAPI、SQLAlchemy、SQLite、pypdf、httpx。
- 前端：React、TypeScript、Vite、lucide-react、react-markdown、KaTeX、Cytoscape.js。
- LLM：MiniMax `MiniMax-M3`，OpenAI-compatible Chat Completions。
- 验证：pytest、Vite build、npm audit、Playwright Chromium。

## 环境变量

复制 `.env.example` 为 `.env`，再按需修改：

```powershell
Copy-Item .env.example .env
```

| 变量 | 说明 |
| --- | --- |
| `MINIMAX_BASE_URL` | MiniMax API 基础地址，默认 `https://api.minimaxi.com/v1`。 |
| `MINIMAX_MODEL` | LLM 模型名，当前默认 `MiniMax-M3`。 |
| `MINIMAX_API_KEY` | 真实 Key，只放 `.env`，不要提交。 |
| `APP_BOOTSTRAP_INDEX` | 是否启动时初始化种子数据和教材索引，默认 `true`。 |
| `APP_DATABASE_URL` | 数据库地址，默认 `sqlite:///data/app.db`。 |
| `APP_PDF_PATH` | 教材 PDF 路径，默认 `ISLRv2_corrected_June_2023.pdf`。 |
| `APP_RETRIEVAL_MODE` | 检索模式：`auto`、`vector`、`hybrid` 或 `tfidf`，默认 `auto`。 |
| `APP_REFERENCE_BOOKS_DIR` | 管理员上传参考书目录，默认 `data/reference_books`。 |
| `APP_VECTOR_INDEX_DIR` | 本地向量索引目录，默认 `data/vector_index`。 |
| `APP_MAX_REFERENCE_BOOK_MB` | 单个上传 PDF 大小上限，默认 `80`。 |
| `ADMIN_USERNAME` | 种子管理员用户名，默认 `admin`。 |
| `ADMIN_PASSWORD` | 种子管理员密码，默认 `Admin@123456`。 |
| `SITE_DOMAIN` | Docker Compose 自带 Caddy 时使用的域名。 |
| `COMPOSE_PROJECT_NAME` | Docker 项目名，建议 `advanced-stat-qa`。 |

自动化验证脚本会临时设置 `APP_DISABLE_LLM=true`，避免测试消耗外部 API。

## 本地启动

安装依赖：

```powershell
.\scripts\setup.ps1
```

启动后端：

```powershell
.\scripts\run_backend.ps1
```

另开一个终端启动前端：

```powershell
.\scripts\run_frontend.ps1
```

访问：

```text
http://127.0.0.1:5173
```

默认管理员账号来自 `.env`：`admin` / `Admin@123456`。普通用户可在登录页注册。

首次启动会创建 `data/app.db`，并从英文 PDF 构建教材文本块。当前验收规模：

- 知识点：69 个。
- 图谱边：336 条。
- 问答对：70 个。
- 教材文本块：1413 个。

检索模式说明：

- `auto`：向量索引存在时使用向量检索，否则降级到 TF-IDF。
- `vector`：只使用本地向量索引。
- `hybrid`：合并向量检索和 TF-IDF 结果。
- `tfidf`：使用原有轻量本地检索。

## 验证

完整验证：

```powershell
.\scripts\verify.ps1
```

验证内容：

- 后端健康检查和系统统计。
- 注册、登录、管理员问答对 CRUD、知识点 CRUD、图谱边 CRUD。
- RAG 问答、连续追问、来源引用、图谱子图。
- 历史记录全文展开。
- 普通学生权限边界。
- 前端 TypeScript/Vite 构建。
- npm audit 生产依赖审计。
- Playwright 桌面与移动端截图。

截图输出：

```text
docs/qa-screenshots/
```

## API 速查

所有业务接口都带 `/api` 前缀。

| 模块 | 路由 |
| --- | --- |
| 健康检查 | `GET /api/health` |
| 系统统计 | `GET /api/system/stats` |
| 注册/登录 | `POST /api/auth/register`、`POST /api/auth/login`、`GET /api/auth/me` |
| 问答 | `POST /api/chat/ask` |
| 会话 | `GET /api/chat/conversations`、`GET /api/chat/conversations/{id}`、`DELETE /api/chat/conversations/{id}` |
| 图谱 | `GET /api/graph/concepts`、`GET /api/graph/subgraph`、`GET /api/graph/recommendations` |
| 历史 | `GET /api/history`、`DELETE /api/history` |
| 问答对 | `GET /api/qa-pairs`；写入接口需要管理员 |
| 管理后台 | `/api/admin/*`；全部需要管理员 |
| 模型配置 | `GET/PATCH /api/admin/llm-config`、`POST /api/admin/llm-config/test` |

## 推荐演示流程

1. 使用管理员账号登录。
2. 在问答工作台提问：`岭回归和 Lasso 有什么区别？`
3. 继续追问：`那它为什么能做变量选择？`
4. 提问无关问题：`我是谁`，确认无来源、无推荐、无图谱。
5. 打开学习历史，点击一条记录查看全文和来源。
6. 打开知识图谱，点击节点观察子图和推荐问题。
7. 打开管理后台，查看系统总览、教材与索引、用户角色、文本块、知识点和图谱边。

## 教材选择

中文教材 PDF 是扫描图片型页面，不能稳定直接抽取正文；英文 `ISLRv2_corrected_June_2023.pdf` 是文本型 PDF，可稳定抽取正文、章节和页码。因此系统使用英文教材作为 RAG 主语料，通过中文术语扩展和中文回答保持中文学习体验。

## 部署

推荐使用 Docker Compose。仓库已包含两套入口：

- `docker-compose.yml`：包含 backend、frontend、Caddy，适合服务器上没有现成 Web 入口时直接占用 80/443。
- `docker-compose.server.yml`：只启动 backend/frontend，并绑定到 `127.0.0.1:18000`、`127.0.0.1:18080`，适合接入服务器已有 Caddy/Nginx。

当前 VPS 部署入口：

```text
https://aistudyassistant.bluesclawd.dev
```

### 自动部署（推荐）

本项目已配置 GitHub Actions 自动部署。每次 `git push` 到 `main` 分支时，会自动：

1. 打包项目代码
2. 通过 SSH 上传到 VPS
3. 停止旧容器、备份旧版本
4. 解压新版本、恢复 `.env`
5. 构建并启动新容器
6. 执行健康检查

配置方法见 `docs/部署方案.md`。

### 手动部署

如需手动部署，完整命令见 `docs/运维手册.md`。生产注意事项：必须更换管理员密码、通过服务器环境变量注入 API Key、持久化 Docker volume 中的数据库、使用 HTTPS 反代。

## 相关文档

- `AGENTS.md`：给后续 AI/开发者的项目规则。
- `docs/README.md`：文档索引。
- `docs/Agent接手指南.md`：给后续 Agent 的接手顺序、红线、验证和发布摘要。
- `docs/架构与功能说明.md`：系统架构、模块职责、数据模型和高风险边界。
- `docs/运维手册.md`：VPS、Docker、Caddy、备份、发布、回滚和故障排查。
- `docs/部署方案.md`：服务器和 Docker 部署规划。
- `docs/对抗性审查.md`：可信度、权限和视觉审查。
- `docs/完成度评估.md`：当前完成度评分和剩余优化。
- `docs/验收记录.md`：验证命令、截图和运行结果。
- `docs/实验报告.md`：课程报告正文。
- `deliverables/`：详尽答辩版 PPT、适中汇报版 PPT 和对应演讲稿。

## 安全说明

- 不要提交 `.env`、真实 API Key、运行数据库或构建产物。
- 聊天中曾暴露的 Key 若要对外提交或展示，建议在 MiniMax 控制台轮换。
- 对公网开放前必须修改默认管理员密码，并配置 HTTPS。
