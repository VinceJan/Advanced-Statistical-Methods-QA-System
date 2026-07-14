# 终局收尾项目约束

本文锁定当前阶段的稳定事实、红线、技术取舍和验收口径。若本文与 `docs/project/题目2.md` 或 `AGENTS.md` 冲突，以题目硬性要求和 `AGENTS.md` 项目红线为准。

## 稳定事实

- 项目类型：题目二课程项目，“高级统计方法课程知识图谱智能问答系统”。
- 默认语言：中文界面、中文回答；教材证据可以来自英文 PDF。
- 当前主语料：`ISLRv2_corrected_June_2023.pdf`，中文扫描教材已不作为 RAG 输入。
- 当前部署：公网 `https://aistudyassistant.bluesclawd.dev`，VPS 目录 `/opt/advanced-stat-qa/app`，Compose 文件 `docker-compose.server.yml`，宿主机 Caddy 反代。
- 自动部署：push 到 `main` 分支触发 `.github/workflows/deploy.yml`，上传源码包到 VPS，恢复服务器 `.env`，重建 Docker 容器并健康检查。
- 当前数据规模：69 个知识点、336 条图谱边、70 个以上问答对、1413 个教材文本块。
- 当前主要技术：FastAPI、SQLite、SQLAlchemy、React、TypeScript、Vite、Cytoscape.js、MiniMax OpenAI-compatible Chat Completions。
- 当前检索架构：`APP_RETRIEVAL_MODE` 支持 `auto`、`vector`、`hybrid`、`tfidf`；本地向量索引保存在 `data/vector_index/`，TF-IDF fallback 必须保留。
- 当前参考书管理：上传文件保存在 `data/reference_books/`，属于运行数据，不提交 Git。
- 当前 `deliverables/` 中旧 PPT 和演讲稿已由用户清空；看到旧 PPT 删除不要恢复，除非用户明确要求。
- 最终报告模板为 `docs/小学期-作业-模板-2026.doc`；本地最终报告为 `deliverables/高级统计方法知识图谱项目报告_重制版.docx`，已线下提交，不纳入公开代码仓库。

## 不可破坏的不变量

- 无关问题必须返回 `out_of_scope`，且 `sources=[]`、`related_questions=[]`、`graph.nodes=[]`、`graph.edges=[]`。
- 证据不足问题必须返回 `insufficient_evidence`，不能编造教材来源。
- 每一轮多轮追问都必须重新计算来源、推荐问题和知识图谱，不能沿用上一轮证据。
- 连续追问后再问“我是谁”等清晰无关问题，仍必须拒答，不能被上下文污染。
- 历史记录必须能查看当时回答全文和当时来源。
- 收藏与笔记只能由本人查看和编辑。
- 用户只能查看、重命名和删除自己的会话。
- 普通学生不能看到管理后台和问答对管理入口；后端所有写入型管理接口必须校验管理员角色。
- 回答区必须支持 Markdown/KaTeX。
- 图谱使用 Cytoscape.js，不恢复手写 SVG 布局。
- `.env`、真实 `MINIMAX_API_KEY`、运行数据库、上传教材、向量索引和构建产物不得提交 Git。

## 前端打磨约束

- 本项目是课程学习工具和管理控制台，不是营销 landing page。
- 视觉目标是克制、清晰、可信、信息密度适中。
- 保留现有深青色品牌骨架和 lucide-react 图标体系，不为审美偏好引入第二套图标库。
- 问答工作台输入区应紧凑，避免大面积笨重输入框。
- 会话侧栏管理动作应就地完成，至少支持打开、重命名和删除。
- 问答对管理筛选条应有稳定比例，搜索框、下拉框、查询按钮不能截断或拥挤。
- 长用户名、长标题、长文件名和移动端视口必须有截断或换行策略。
- 页面改动必须用 Playwright 截图人工检查。

## 报告约束

- 最终报告应基于 `docs/小学期-作业-模板-2026.doc` 的格式和课程语境。
- 成品必须 10 页以上。
- 内容必须反映当前真实系统，包括向量索引 RAG、TF-IDF fallback、参考书管理、会话管理、管理后台拆分、VPS 自动部署和完整验收。
- 不得把旧报告中的“SVG 图谱”“只有本地混合检索”“后端测试 5 passed”等过期事实带入最终报告。
- 报告不得包含真实密钥、服务器管理员密码或可泄露线上配置的敏感细节。
- 生成后尽量渲染检查，至少确认页数、标题层级、表格和段落无明显错位。

## 测试与验收约束

完成功能修改后至少运行：

```powershell
.\scripts\verify.ps1
```

该脚本应覆盖：

- 后端 pytest。
- 前端 TypeScript/Vite 构建。
- npm audit。
- Playwright 桌面与移动端视觉烟测。
- 会话侧栏更多菜单。
- 问答对分页与筛选条。
- 管理后台关键模块。
- 学生权限边界。
- 学生端知识图谱搜索。

线上部署后必须验证：

```bash
curl -fsS https://aistudyassistant.bluesclawd.dev/api/health
curl -fsS https://aistudyassistant.bluesclawd.dev/api/system/stats
```

还必须确认公网统计中 `vector_index_ready=true` 或能解释并修复未就绪原因。

## 文档同步约束

- 改 API 时同步 `README.md`、`docs/架构与功能说明.md`、`docs/验收记录.md`。
- 改环境变量、Docker、VPS 数据目录、上传教材保存方式时，同步 `.env.example`、`docs/运维手册.md`、`docs/部署方案.md`。
- 改管理后台、权限边界或用户操作流程时，同步 README、`docs/架构与功能说明.md`、`docs/对抗性审查.md`、`docs/验收记录.md`。
- 改报告或课程交付物状态时，同步 README、`docs/README.md`、`docs/验收记录.md` 和必要的接手说明；公开仓库不保留线下已提交的最终报告。
- 不要把历史叙事追加到 `AGENTS.md`；`AGENTS.md` 只写后续实现必须遵守的稳定规则。

## 当前不做

- 不恢复用户已经删除的 `deliverables/` 旧文件。
- 不训练新大模型。
- 不默认 OCR 中文扫描教材。
- 不默认迁移到 Neo4j 或 PostgreSQL。
- 不为页面“更炫”牺牲课程工具的清晰度、可复现性和弱 VPS 可运行性。
