# ADR-001: 持续进化个人知识库系统整体技术栈

| 项目 | 内容 |
| --- | --- |
| 状态 | Accepted |
| 日期 | 2026-07-22 |
| 决策者 | 主 Agent（基于 tech-selection-researcher 报告） |
| 关联文档 | [PRD](../PRD.md) / [ARCH](../ARCH.md) / [选型报告](../reports/2026-07-22-knowledge-base-tech-selection.md) |
| 风险等级 | P3（引入新框架/中间件，新建架构） |
| Baseline | [karpathy-LLM.md](../../karpathy-LLM.md) LLM Wiki 模式 |

## 背景（Context）

本项目目标是在 Andrej Karpathy 的 LLM Wiki 模式（三层架构：raw sources / wiki / schema；三操作：Ingest / Query / Lint；双索引 index.md + log.md；载体 markdown + git + Obsidian）基础上，落地用户提出的四点改进：① 持续进化（编码实践中自动沉淀更好方案）；② 可被外部 Agent（OpenCode / Trae / Claude Code）调用；③ 多领域分类；④ 图形化界面 + 多格式文件上传（PDF/Word/Excel）由 AI 整理。

tech-selection-researcher 已完成七决策点（A-G）的系统化调研，结论见 [选型报告](../reports/2026-07-22-knowledge-base-tech-selection.md)。本 ADR 固化其推荐组合为正式决策。

**核心张力**：AnythingLLM / RAGFlow 等现成 GUI 工具用向量库存储，违背 Karpathy "wiki 是持久复利、人类可读、vendor-neutral 产物"的核心理念。本决策明确**保留 markdown + git 为唯一存储层**，向量索引仅作访问层加速。

## 决策（Decision）

采用**混合分层架构**——Karpathy 原方案是其 100% 子集。五层技术栈如下：

| 层 | 选型 | 一句理由 |
| --- | --- | --- |
| 存储 | markdown + git + Obsidian | Karpathy 内核，人类可读、可版本控制、vendor-neutral |
| Agent 访问 | MCP server（优先复用 enquire-mcp，自建用 TypeScript SDK） | 2026 年五大编码 Agent 全线接入 MCP，标准化零锁定 |
| 人工浏览 | Obsidian + Dataview | 原方案载体，图谱视图 |
| GUI 管理 | Tauri v2（降级 Next.js + Node） | 3-10MB vs Electron 120-200MB，Rust 直访 FS |
| 检索 | index.md → qmd → LanceDB 分档 | 小零依赖 / 中 Karpathy 钦定 / 大嵌入式无服务进程 |

文件解析：PDF → MinerU（pipeline + vlm 双引擎，Apache 2.0 风格许可）；Word/Excel → office2md（内含 mammoth / pandas）。

持续进化：四件套——AGENTS.md 规则（任务结束强制写经验卡片）+ MCP `kb_write_experience` tool + `/dream` 定期整理 + 定期 Lint。防污染用两 tier 审核门禁（90% 高 confidence 自动 / 10% 低 confidence 人工）+ git 可回滚 + `use_count/confidence` 老化。

分类：目录树（领域主归属）+ frontmatter tags（横切多归属）+ Dataview（动态视图）。排除数据库索引（违背 markdown+git 约束）。

## 各子决策与备选（Alternatives）

### A. 部署形态 → ④ 混合分层

| 方案 | 否决理由 |
| --- | --- |
| ① 纯本地（无 GUI） | 无法满足改进④多格式上传 GUI |
| ② 本地优先 + 轻量 Web | 实为④的子集，未解耦存储与访问 |
| ③ Web 服务前后端分离 | 开发成本高，存储层脱离 Obsidian，远程访问非刚需 |
| **④ 混合分层** ✅ | Karpathy 是其子集，四层解耦可独立替换，降级退化为①仍完整可用 |

### B. GUI 技术栈 → Tauri v2

| 方案 | 否决理由 |
| --- | --- |
| Electron | 120-200MB 包体积、150-400MB 内存，违背轻量约束 |
| Next.js Web | 需后端中转 FS，非桌面原生 |
| **Tauri v2** ✅ | 3-10MB、40-80MB 内存、<200ms 启动、Rust 直访 FS、默认安全隔离 |

降级触发：2 周内 Tauri 原型无法跑通或 Rust 门槛过高 → 切 Next.js + Node 纯 TS 栈。

### C. 文件解析 → MinerU + office2md

| 方案 | 否决理由 |
| --- | --- |
| unstructured OSS | 质量低于 MinerU，云版付费 |
| LlamaParse | 云依赖，违背隐私可选约束 |
| marker | 仅 PDF |
| **MinerU（PDF）+ office2md（Word/Excel）** ✅ | MinerU 95.39 准确度、Apache 2.0 许可（2026-04 已解除 AGPLv3 否决）、内置 MCP |

### D. MCP server → enquire-mcp 优先

| 方案 | 否决理由 |
| --- | --- |
| obsidian-mcp (Rust) | Rust 二次开发门槛，无内置重排 |
| markdown-vault-mcp | 社区较小（18★） |
| **enquire-mcp** ✅ | 44 tools、BM25+向量+BGE 重排、HNSW+int8、PDF+OCR、MIT、serve 时零云调用、SLSA-3 |

自建扩展（`kb_write_experience` / `kb_lint`）用 TypeScript SDK（Tier 1 参考实现，Zod 类型安全）。

### E. 检索 → 分档递进

| 规模 | 选型 | 理由 |
| --- | --- | --- |
| 小（<200 页） | index.md | Karpathy 原方案默认，零依赖 |
| 中（200-5000） | qmd | Karpathy 钦定，BM25+向量+LLM 重排 |
| 大（>5000） | LanceDB | 嵌入式无服务进程，10w-100w 规模 |

### F. 持续进化 → 四件套

| 方案 | 否决理由 |
| --- | --- |
| git hook 自动整理 | 防污染弱 |
| 仅 AGENTS.md 规则 | 自动化不足 |
| **AGENTS.md + MCP ingest + /dream + Lint** ✅ | Dream Loop 两 tier 门禁 + 三层记忆（inbox/wiki/archive）防污染 |

### G. 分类 → 目录树 + tags + Dataview

排除数据库索引（违背 markdown+git 约束，锁定工具链）。

## 后果（Consequences）

**正面**：

- 与 Karpathy 原方案 100% 兼容，知识库永远可被 git 版本控制、可被人直接阅读。
- 多 Agent 调用经 MCP 标准化，零锁定。
- 五层解耦，任一层可独立替换或降级。

**负面 / 代价**：

- Tauri 后端需基础 Rust 能力（缓解：后端极薄，复杂逻辑放 TS/Python）。
- MCP 生态快速演化（2026-07-28 候选规范 + SDK v2 转无状态），需关注 6 个月迁移窗口。
- 持续进化需持续维护审核门禁，否则知识库被低质量经验污染。

**需同步更新**：

- ARCH 文档落地五层架构详设。
- AGENTS.md 落地知识库 schema 与进化工作流。
- PRD 落地四点改进验收标准。

## 参考

- [选型报告](../reports/2026-07-22-knowledge-base-tech-selection.md)（含全部可追溯链接）
- [Karpathy LLM Wiki 原方案](../../karpathy-LLM.md)
- [CLAUDE.md](../../CLAUDE.md) 治理规则
