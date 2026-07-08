# 文档索引

本文是 `docs/` 的入口索引。后续维护者或 AI Agent 不需要从根目录一份份猜，按这里的分类阅读即可。

## 新 Agent 接手

- `Agent接手指南.md`：最推荐先读。说明阅读顺序、当前状态、红线、验证命令、发布摘要流程。
- `架构与功能说明.md`：理解系统模块、数据模型、RAG 流程、权限边界和高风险修改点。
- `运维手册.md`：管理 VPS、Docker Compose、Caddy、备份、发布、回滚和故障排查。

## 课程交付与验收

- `实验报告.md`：课程实验报告正文。
- `实验报告.html`：实验报告 HTML 版本。
- `验收记录.md`：本地与公网验证结果、截图和课程交付物记录。
- `完成度评估.md`：当前完成度评分和剩余可选优化。
- `demo_questions.md`：演示问题集合。

## 质量与安全

- `对抗性审查.md`：无关问题、证据不足、权限、图谱、API Key 和公网部署的审查记录。
- `qa-screenshots/`：Playwright 和远程部署验收截图。

## 部署

- `部署方案.md`：部署方案、当前线上拓扑、Docker Compose 选择和线上验收。
- `运维手册.md`：实际日常维护命令，以这份为准。

## 项目背景

- `project/题目2.md`：原始题目要求。
- `project/PROJECT_CONSTRAINTS.md`：目标模式启动前的约束文件。
- `project/GOAL.md`：长跑任务契约。
- `project/CONTEXT.md`：项目上下文。

## 根目录文件职责

- `README.md`：项目首页，给人类和仓库访客快速理解项目。
- `AGENTS.md`：给 AI Agent 的规则手册，不写历史叙事。
- `docker-compose.yml`：独立服务器或本地 Docker HTTPS 入口。
- `docker-compose.server.yml`：当前 VPS 使用的入口，配合宿主机 Caddy。
- `Dockerfile.backend`、`frontend/Dockerfile`：镜像构建。
