# 终局收尾目标清单

本文记录当前阶段的目标契约。此前“向量 RAG、管理后台拆分、问答对分页、参考书管理”目标已经实现并部署；本阶段聚焦文档一致性、前端细节打磨、最终课程报告和上线验收。

## 当前基线

- 公网地址：`https://aistudyassistant.bluesclawd.dev`。
- 自动部署：`main` 分支 push 后由 GitHub Actions 上传到 VPS 并重建 Docker 服务。
- 当前主语料：`ISLRv2_corrected_June_2023.pdf`。
- 当前数据规模：69 个知识点、336 条图谱边、70 个以上问答对、1413 个教材文本块。
- 当前检索架构：支持 `auto`、`vector`、`hybrid`、`tfidf`；本地向量索引位于 `backend/app/vector_index.py`，索引数据保存到 `data/vector_index/`。
- 当前管理后台：已拆为总览、教材与索引、用户与权限、模型 API、问答对、文本块、知识点、图谱边、历史审计。
- 当前问答对管理：服务端分页，支持搜索、类型筛选和页大小切换。
- 当前教材管理：管理员可上传 PDF、切换当前参考书并重建文本块与向量索引。
- 当前新增前端收尾点：问答工作台侧栏会话支持打开、重命名、删除；问答输入框和问答对筛选条已做比例打磨。
- 当前 `deliverables/`：旧 PPT 和演讲稿已由用户清空，不应自动恢复；最终项目报告已生成。
- 最终报告模板：`docs/小学期-作业-模板-2026.doc`；最终报告：`deliverables/高级统计方法知识图谱智能问答系统_项目报告.docx`，Word 统计 18 页。

## P0：文档真实一致

1. 全面同步 `README.md`、`AGENTS.md`、`docs/Agent接手指南.md`、`docs/架构与功能说明.md`、`docs/运维手册.md`、`docs/部署方案.md`、`docs/对抗性审查.md`、`docs/验收记录.md`、`docs/完成度评估.md` 和 `docs/实验报告.md`。
2. 清除过期事实：例如“只有 TF-IDF”、“架构文档为空”、“旧 PPT 仍存在”、“后端测试 5 passed”等。
3. 保持 `AGENTS.md` 克制，只写后续实现必须遵守的稳定规则，不追加历史叙事。
4. 文档必须说明向量索引、参考书运行数据、会话重命名 API、视觉验收截图和当前交付物状态。

## P0：前端产品细节打磨

1. 问答工作台输入框应是紧凑、稳定的小型提问区域，不能显得笨重。
2. 会话侧栏应支持类似 ChatGPT 的更多菜单，让用户无需先进入会话即可管理会话。
3. 问答对管理页筛选条的搜索框、下拉框和查询按钮比例要协调，按钮文字不能截断。
4. 长用户名、移动端布局、长列表、按钮和输入框都不能出现明显溢出、重叠或比例失衡。
5. 打磨优先级是课程学习工具和管理控制台的清晰度、可扫描性和可信感，不追求营销页式炫技。

## P0：最终课程报告

1. 以 `docs/小学期-作业-模板-2026.doc` 为重参考模板，最终项目报告已生成到 `deliverables/高级统计方法知识图谱智能问答系统_项目报告.docx`。
2. 最终成品必须为 10 页以上，内容要覆盖题目背景、需求分析、系统设计、数据模型、RAG 与向量索引、知识图谱、管理后台、部署运维、测试验收、总结展望。
3. 报告必须反映当前真实系统，不得沿用旧报告里的过期描述。
4. 报告中不得出现真实 `MINIMAX_API_KEY`、服务器管理员密码或其他敏感信息。
5. 使用 `python-docx` 生成或编辑，并尽量渲染检查页面布局。

## P0：验证与上线

1. 完成功能和文档后运行：

```powershell
.\scripts\verify.ps1
```

2. 必须人工检查关键 Playwright 截图，尤其是：
   - `desktop-follow-up.png`
   - `desktop-qa-pagination.png`
   - `desktop-student-boundary.png`
   - `mobile-out-of-scope.png`
3. 本地验证通过后，谨慎 staging，排除用户明确删除的旧交付物以外的无关文件。
4. push 到 `main` 后等待 GitHub Actions 自动部署成功。
5. 线上至少检查：

```bash
curl -fsS https://aistudyassistant.bluesclawd.dev/api/health
curl -fsS https://aistudyassistant.bluesclawd.dev/api/system/stats
```

6. 公网应能打开前端，系统统计应包含 `retrieval_mode`、`vector_index_ready`、`active_book` 和 `index_status`。

## 完成定义

只有同时满足以下条件，才算本阶段完成：

- 文档与代码、截图、部署事实一致。
- 前端明确问题已修复，并通过真实截图检查。
- 最终报告 DOCX 已生成且页面不少于 10 页。
- 本地完整验证通过。
- 代码已提交推送，VPS 自动部署成功。
- 公网健康检查和系统统计检查通过。
