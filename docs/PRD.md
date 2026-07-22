# 持续进化个人知识库系统 · 产品需求文档（PRD）

> 基于 [PRD 模板](templates/prd-template.md) 创建。技术选型见 [ADR-001](decisions/ADR-001-knowledge-base-tech-stack.md)。

## 1. 背景

用户在 Andrej Karpathy 的 LLM Wiki 模式（见 [karpathy-LLM.md](../karpathy-LLM.md)）基础上，希望构建一个持续进化的个人知识库系统。Karpathy 原方案已具备三层架构、三大操作、双索引的完整骨架，但缺少：编码实践中自动沉淀经验、被外部 Agent 调用、图形化多格式上传三项能力。本 PRD 定义这四点改进的需求与验收标准。

## 2. 目标与非目标

**目标**：
- 在保留 Karpathy markdown + git 内核的前提下，落地四点改进。
- 知识库可被 OpenCode / Trae / Claude Code 等编码 Agent 经 MCP 调用。
- 持续进化机制有防污染保障，知识库随使用越来越精准而非越来越脏。

**非目标**（明确不做）：
- 不构建多用户云端 SaaS（本地优先）。
- 不用向量数据库替代 markdown 作为主存储。
- 不做实时协同编辑（git 已足够）。
- 不在本期实现大规模（>5000 页）向量检索（留待 P5 按需演进）。

## 3. 用户故事与验收标准

### US-001: 编码实践中自动沉淀经验（持续进化）
- **作为** 编码 Agent（Claude Code/Trae/OpenCode），**我希望** 在完成任务后发现可复用经验时能自动沉淀到知识库，**以便** 下次遇到同类问题时不再重复踩坑。
- **验收标准**：
  - [ ] Agent 完成一个任务后，若产生可复用经验，能通过 MCP `kb_write_experience` tool 写入 `wiki/<domain>/experiences/inbox/`
  - [ ] 经验卡片含 frontmatter：`status=pending` / `domain` / `confidence` / `date` / `source_task`
  - [ ] 高 confidence（≥0.8）单域经验经自动审核门禁提升为 `wiki/<domain>/` 正式页
  - [ ] 低 confidence 或跨域经验进入人工审核队列
  - [ ] 所有经验卡片经 git，可回滚
  - [ ] 每日/按需 `/dream` 整理：去重、合并、质量评分、老化低 use_count 条目

### US-002: 可被外部 Agent 调用
- **作为** 外部编码 Agent，**我希望** 经 MCP 查询知识库并获取带引用的答案，**以便** 在编码时复用已有知识。
- **验收标准**：
  - [ ] MCP server 以 stdio 传输暴露，本地零网络面
  - [ ] 至少暴露 tools：`kb_search` / `kb_get_page` / `kb_ingest_source` / `kb_list_categories` / `kb_list_recent` / `kb_lint`
  - [ ] Claude Code、Trae CN、OpenCode 三者均能配置并成功调用 `kb_search` 返回结果
  - [ ] 检索结果带页面路径引用
  - [ ] 断网时本地检索（index.md / qmd）仍可用

### US-003: 多领域分类管理
- **作为** 用户，**我希望** 编程、情感、读书等不同领域知识分类存放，**以便** 按领域浏览与检索。
- **验收标准**：
  - [ ] `wiki/` 下按领域建目录树（coding/ emotions/ reading/ ...）
  - [ ] 每个 wiki 页含 frontmatter `domain`（可多归属）+ `type`（concept/entity/source/experience）+ `status`
  - [ ] `index.md` 按领域分组列出所有页面
  - [ ] Obsidian Dataview 可按 domain/type/status 生成动态视图
  - [ ] 一篇笔记可同时归属多个领域（经 tags 实现）

### US-004: 图形化界面 + 多格式上传
- **作为** 用户，**我希望** 在 GUI 中拖拽 PDF/Word/Excel 文件，由 AI 解析整理后写入知识库，**以便** 无需命令行即可摄入资料。
- **验收标准**：
  - [ ] Tauri 桌面应用，支持 Windows/macOS
  - [ ] 拖拽 PDF/DOCX/XLSX 到界面，触发解析管道（MinerU / office2md）
  - [ ] AI 整理生成 markdown wiki 页（含 frontmatter），先入 staging 待确认
  - [ ] 用户确认后写入 `wiki/` 并更新 index/log，原始文件存 `raw/`
  - [ ] GUI 内可预览 wiki 页（Obsidian 兼容 markdown）
  - [ ] 原始文件不可变（Karpathy 原则）

### US-005: 健康检查（Lint）
- **作为** 用户，**我希望** 定期检查知识库健康度，**以便** 发现矛盾、孤儿页、过时声明。
- **验收标准**：
  - [ ] `kb_lint` tool 检测：页面间矛盾、孤儿页（无入链）、缺失交叉引用、过时声明
  - [ ] 输出结构化报告，标注问题页与建议
  - [ ] 可手动或定时触发

### US-006: 检索质量基线
- **验收标准**：
  - [ ] 小规模（<200 页）index.md 检索，LLM 先读索引再钻取，准确率人工评估 ≥80%
  - [ ] 中规模接入 qmd 后，混合检索 P95 延迟 < 2s（含重排）

## 4. 非功能需求

| 维度 | 要求 |
|---|---|
| 性能 | MCP `kb_search` P95 < 2s（中规模）；index.md 小规模即时 |
| 安全 | 上传文件经解析后才入 wiki；原始文件不可变；无硬编码密钥；结构化日志不输出敏感信息 |
| 隐私 | 默认本地优先；云 LLM 整理可选，隐私敏感回退本地 Ollama |
| 可观测性 | log.md 记录 ingest/query/lint 时间线；MCP 操作可追踪 |
| 可维护性 | 核心依赖 ≤5；存储层零锁定（纯 markdown+git） |
| 兼容性 | 与 Obsidian + Dataview 兼容；与 git 工作流兼容 |

### 前端设计素材需求
GUI（US-004）需在 P4 阶段访问设计素材网站下载资源后再进行界面设计。素材库清单与用途见 [ARCH 第 7 节 前端设计素材库](ARCH.md#7-前端设计素材库)。

## 5. 风险与依赖

| 风险 | 等级 | 缓解 |
|---|---|---|
| 持续进化污染知识库 | 中高 | 两 tier 审核门禁 + 老化机制 + git 回滚 |
| MCP 生态演化 | 中 | 锁定 SDK 稳定版，薄封装 |
| Tauri Rust 门槛 | 中 | 降级 Next.js + Node |
| LLM 整理质量 | 中 | staging 审核 + 保留 raw |

## 6. 里程碑

| 里程碑 | 验收 | 风险 |
|---|---|---|
| P0 基础设施 | CI 跑通 | P2 |
| P1 知识库核心 | 1 PDF→1 wiki 页 | P2 |
| P2 MCP 接入 | 三 Agent 调用成功 | P2 |
| P3 持续进化 | 任务→经验卡片→正式页 | P2 |
| P4 GUI | 拖拽入库 | P3 |
| P5 集成验收 | 四点全过 | P3 |

## 7. 验收标准汇总（供 ac-verifier）

US-001～US-006 全部验收标准通过 + 性能基线 + 安全检查 + 回归无问题，方可闭合。
