# 下一阶段项目约束

本文用于下一轮 goal 目标模式启动前锁定范围、红线、技术取舍和验收口径。若本文与 `docs/project/题目2.md` 或 `AGENTS.md` 冲突，以题目硬性要求和 `AGENTS.md` 项目红线为准。

## 已阅读与当前判断

- 已读 `docs/Agent接手指南.md`：确认当前项目已本地可运行、VPS Docker 部署、GitHub Actions 自动部署，且修改后最低验证为 `.\scripts\verify.ps1`。
- 已读 `docs/project/题目2.md`：题目明确要求“利用教材 PDF 构建文本向量数据库”，推荐 Sentence-BERT、Chroma/FAISS 等工具。
- 已读 `README.md`、`AGENTS.md`、`docs/运维手册.md`、`docs/部署方案.md`、`docs/对抗性审查.md`、`docs/验收记录.md`、`docs/完成度评估.md`、`docs/project/CONTEXT.md`。
- 已检查关键代码：`backend/app/rag.py`、`backend/app/pdf_indexer.py`、`backend/app/models.py`、`backend/app/routers/admin.py`、`frontend/src/main.tsx`、`frontend/src/api.ts`、`frontend/src/styles.css`、`scripts/verify.ps1`。
- 已发现 `docs/架构与功能说明.md` 当前为 0 字节且处于 git modified 状态。该文件是接手必读文档，下一阶段实际实现前必须先确认是否需要从历史或用户改动中恢复，不得擅自覆盖。
- 当前工作区已有多项与本次目标整理无关的未提交改动和新增文件，后续实现不得误删或回滚用户已有工作。

## 稳定事实

- 项目类型：题目二课程项目，“高级统计方法课程知识图谱智能问答系统”。
- 默认语言：中文界面、中文回答；教材证据可以来自英文 PDF。
- 当前主语料：`ISLRv2_corrected_June_2023.pdf`，中文扫描教材已不作为 RAG 输入。
- 当前部署：公网 `https://aistudyassistant.bluesclawd.dev`，VPS 目录 `/opt/advanced-stat-qa/app`，Compose 文件 `docker-compose.server.yml`，宿主机 Caddy 反代。
- 自动部署：push 到 `main` 分支触发 `.github/workflows/deploy.yml`，上传源码包到 VPS，恢复服务器 `.env`，重建 Docker 容器并健康检查。
- 当前数据规模：69 个知识点、336 条图谱边、70 个问答对、1413 个教材文本块。
- 当前主要技术：FastAPI、SQLite、SQLAlchemy、React、TypeScript、Vite、Cytoscape.js、MiniMax OpenAI-compatible Chat Completions。
- 当前后端检索不是向量数据库，而是 `rag.py` 中基于 token、TF-IDF、章节加权和中文术语扩展的本地检索。

## 不可破坏的不变量

- 无关问题必须返回 `out_of_scope`，且 `sources=[]`、`related_questions=[]`、`graph.nodes=[]`、`graph.edges=[]`。
- 证据不足问题必须返回 `insufficient_evidence`，不能编造教材来源。
- 每一轮多轮追问都必须重新计算来源、推荐问题和知识图谱，不能沿用上一轮证据。
- 连续追问后再问“我是谁”等清晰无关问题，仍必须拒答，不能被上下文污染。
- 历史记录必须能查看当时回答全文和当时来源。
- 收藏与笔记只能由本人查看和编辑。
- 普通学生不能看到管理后台和问答对管理入口；后端所有写入型管理接口必须校验管理员角色。
- 回答区必须支持 Markdown/KaTeX。
- 图谱使用 Cytoscape.js，不恢复手写 SVG 布局。
- `.env`、真实 `MINIMAX_API_KEY`、运行数据库、上传教材、向量索引和构建产物不得提交 Git。

## 向量 RAG 技术约束

- 必须新增真正的向量数据库或向量索引路径，满足题目“文本向量数据库”的要求。
- 现有 TF-IDF / 本地混合检索必须保留为 fallback，以适配弱 VPS、依赖安装失败或向量索引未就绪场景。
- 推荐抽象检索接口，例如：
  - `Retriever`：统一输入问题，输出 `SourceOut` 列表和检索元信息。
  - `TfidfRetriever`：封装现有本地检索。
  - `VectorRetriever`：封装 FAISS/Chroma + embedding 模型。
  - `HybridRetriever`：可先向量召回，再用现有关键词得分或阈值重排。
- 检索模式应可配置，优先通过环境变量和管理员后台展示/切换。推荐值：`tfidf`、`vector`、`hybrid`、`auto`。
- 向量模型选择必须考虑中文问题到英文教材的跨语言检索能力、离线/首次下载成本、Docker 镜像体积和 VPS 内存。
- 若使用 FAISS，需确认 Windows 本地、Linux Docker、GitHub Actions 构建均可安装；若使用 Chroma，需确认依赖体积和运行内存不会压垮 VPS。
- 如果大模型或 embedding 模型依赖外部 API，必须提供本地或降级路径，不能让核心演示依赖不稳定外部服务。
- 向量索引文件应保存在 `data/` 或 Docker volume 下，并记录索引版本、embedding 模型、教材文件、文本块签名和创建时间。
- 重建索引失败不能删除旧可用索引；应采用“先构建新索引，成功后切换”的策略。

## 教材与参考书管理约束

- `APP_PDF_PATH` 继续作为默认教材路径，保证现有部署不需要立即迁移也能启动。
- 新增管理员参考书管理时，不允许让用户输入任意服务器绝对路径读取文件。
- 上传或指定教材必须限制文件类型、文件大小和存储目录，目标目录应位于 `data/` 或专门的运行数据目录。
- 数据库应能表达多个教材资源，但同一时刻可以先只支持一个启用的 RAG 主语料。
- 参考书切换必须触发或提示重建文本块和向量索引，并保留清晰状态。
- 文本块应能追溯到教材资源，不应只依赖 `source_file` 字符串。
- 若未来支持多本书联合检索，必须在来源中显示具体教材名、章节和页码。
- 新功能上线后，README、`.env.example`、运维手册和架构文档必须同步说明数据保存、备份和重建方式。

## 管理后台与前端信息架构约束

- 管理后台应从“所有模块堆在一个页面”调整为“总览 + 模块化子视图”。
- 问答对管理必须分页，默认每页数量建议 10、20 或 25；搜索和筛选变化时应重置到第一页。
- 文本块、历史审计、知识点、图谱边等长列表也应避免一次性铺满；至少在前端分页，数据量更大时再扩展后端分页。
- “系统状态”中的关键指标应可点击进入对应模块，例如知识点图谱、问答对、文本块、用户、LLM、教材。
- 管理后台要优先使用表格、分页、分栏表单、抽屉/模态编辑等产品 UI 模式，而不是继续增加大卡片堆叠。
- `frontend/src/main.tsx` 可以逐步拆分，但拆分应服务于当前重构，不做无关大清洗。
- 保留 lucide-react，因为项目已经使用该图标库，避免为审美偏好引入第二套图标。
- 设计风格应是课程学习工具和管理控制台：克制、清晰、信息密度适中；不要改成营销 landing page。

## Design Taste Frontend 使用边界

- 用户希望使用 Design Taste Frontend 和主动审美判断来发现改进点；下一阶段应把它作为视觉审查参考。
- 该 skill 自身说明不主要服务 dashboard、data table、admin panel，因此本项目不能机械套用 landing page 规则。
- 可以吸收的部分：审查现有视觉债务、按钮对比度、形状一致性、颜色一致性、空/加载/错误状态、移动端折叠、文本不溢出、避免装饰性卡片过多。
- 不应吸收的部分：为后台界面追求高方差营销视觉、复杂动效、过度 hero 化、无关大图背景。
- 对管理后台这类密集产品 UI，优先考虑 Fluent/Carbon/Atlassian 这类后台体验原则，但除非必要，不引入大型设计系统依赖。

## 后端 API 与数据模型约束

- 改 API 时同步 `frontend/src/api.ts`、`frontend/src/types.ts`、README 和相关文档。
- 改数据模型时要考虑已有线上 SQLite 数据迁移。当前项目没有 Alembic，若新增字段/表，需要实现兼容性的启动迁移或安全创建逻辑。
- 删除或重建文本块、向量索引、教材记录前必须保证不会误删用户、历史、问答对、知识点和图谱边。
- 后台重建索引接口必须仅管理员可用。
- 上传教材、重建索引、切换检索模式等高风险操作应有明确返回信息和前端确认/状态提示。
- 性能统计应继续返回检索耗时、图谱耗时、LLM 耗时和总耗时；新增向量检索后应补充检索模式和索引状态。

## 测试与验收约束

- 完成功能修改后至少运行：

```powershell
.\scripts\verify.ps1
```

- 向量 RAG 必须新增或扩展测试，覆盖：
  - 向量索引可构建。
  - 中文问题能检索到英文教材相关块。
  - 向量模式不可用时能降级到 TF-IDF。
  - 无关问题仍无来源、无推荐、无图谱。
  - 多轮追问仍重新计算来源和图谱。
- 管理后台重构必须通过 Playwright 真实浏览器截图检查：
  - 桌面问答工作台。
  - 问答对分页与编辑。
  - 管理总览。
  - 教材/索引管理。
  - 知识点和图谱边管理。
  - 文本块搜索。
  - 用户管理。
  - 移动端关键流程。
- 线上部署后必须验证：

```bash
curl -fsS https://aistudyassistant.bluesclawd.dev/api/health
curl -fsS https://aistudyassistant.bluesclawd.dev/api/system/stats
```

- 还必须在公网前端人工或 Playwright 检查：
  - 管理员登录。
  - “我是谁”返回 `out_of_scope` 且空来源/空图谱。
  - “岭回归和 Lasso 有什么区别？”返回来源和图谱。
  - 管理后台关键模块能打开。
  - 当前检索模式和教材状态显示正确。

## 文档同步约束

- 改 RAG 架构、检索模式、向量库或索引流程时，必须同步 `docs/架构与功能说明.md`、`docs/对抗性审查.md`、`docs/验收记录.md`、README。
- 改环境变量、Docker、GitHub Actions、VPS 数据目录、上传教材保存方式时，必须同步 `.env.example`、`docs/运维手册.md`、`docs/部署方案.md`。
- 改管理后台、权限边界或用户操作流程时，必须同步 README、`docs/架构与功能说明.md`、`docs/验收记录.md`。
- 如果课程报告或 PPT 需要体现向量数据库 RAG，则同步 `docs/实验报告.md` 和 `deliverables/`，并按项目既有脚本重新生成。
- 不要把历史叙事追加到 `AGENTS.md`；`AGENTS.md` 只写后续实现必须遵守的稳定规则。

## 推荐实施顺序

1. 保护现场：检查 git 状态，确认 `docs/架构与功能说明.md` 0 字节问题和已有未提交 deliverables 改动，不误覆盖用户工作。
2. 先做设计：明确检索接口、向量库选择、教材资源模型、管理后台信息架构和验证样例。
3. 后端优先：实现教材资源模型、索引状态、可切换检索接口、向量索引构建和降级路径。
4. 前端跟进：重构管理后台为总览 + 子视图，完成问答对分页、教材/索引管理和状态展示。
5. 测试扩展：补齐后端测试和 Playwright 视觉烟测。
6. 文档同步：更新 README、架构、运维、对抗性审查、验收记录。
7. 本地验证：运行完整验证，检查截图。
8. 发布上线：合并到 `main` 后等待自动部署，完成公网验收。

## 当前不做

- 当前轮不改业务代码。
- 当前轮不启动服务、不重建索引、不部署 VPS。
- 下一阶段也不训练新大模型。
- 不默认 OCR 中文扫描教材。
- 不默认迁移到 Neo4j 或 PostgreSQL，除非后续设计证明必要。
- 不为了页面“更炫”牺牲课程工具的清晰度、可复现性和弱 VPS 可运行性。
