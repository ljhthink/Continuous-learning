# AGENTS.md · 知识库 Schema 与持续进化工作流规约

> 本文件是知识库的 **schema 层**（对应 Karpathy LLM Wiki 模式的第三层）。
> 它告诉**使用知识库的编码 Agent**（Claude Code / Trae CN / OpenCode）：
> 知识库如何组织、有哪些约定、Ingest/Query/Lint/持续进化 时应遵循什么工作流。
>
> **注意区分两套规则**：
>
> - `CLAUDE.md` 治理**知识库系统本身的开发过程**（开发 MCP server、Tauri GUI 时遵循）。
> - `AGENTS.md`（本文件）治理**知识库内容的使用与进化**（使用知识库辅助编码时遵循）。

---

## 1. 知识库总览

本知识库基于 Andrej Karpathy 的 LLM Wiki 模式，并扩展了四项能力：持续进化、被外部 Agent 调用、多领域分类、图形化多格式上传。

### 1.1 三层架构

| 层 | 位置 | 说明 | 谁负责 |
| --- | --- | --- | --- |
| Raw sources | `raw/` | 不可变原始资料（PDF/Word/Excel 等） | 用户投放，Agent 只读 |
| The wiki | `wiki/` | LLM 生成并维护的 markdown 知识库 | Agent 写、用户读 |
| The schema | `AGENTS.md`（本文件） | 结构约定与工作流规约 | 用户与 Agent 共同演进 |

### 1.2 双索引

| 索引 | 文件 | 导向 | 用途 |
| --- | --- | --- | --- |
| 内容索引 | `index.md` | 内容导向 | 按领域分组列出所有页面，LLM 回答前先读此文件定位 |
| 时间日志 | `log.md` | 时间导向 | append-only 记录 ingest/query/lint/experience 事件 |

### 1.3 三大操作 + 一项扩展

| 操作 | 说明 | 触发时机 |
| --- | --- | --- |
| Ingest | 摄入新资料，整理成 wiki 页，更新 index/log | 用户投放新文件或 Agent 发现新资料 |
| Query | 检索 wiki 并综合答案，带引用 | 用户提问或 Agent 编码时查询 |
| Lint | 健康检查：矛盾、孤儿页、过时声明、缺失交叉引用 | 定期或手动 |
| **Experience**（扩展） | 编码实践中沉淀可复用经验卡片 | 任务结束且发现可复用方案时 |

---

## 2. 目录结构约定

```text
Continuous-learning/
├── raw/                          # 不可变原始资料
│   ├── assets/                   # 图片、附件（Obsidian 下载设置指向此目录）
│   ├── pdf/
│   ├── docx/
│   └── xlsx/
├── wiki/                         # 知识库主体（Agent 写、用户读）
│   ├── coding/                   # 领域：编程
│   │   ├── _index.md             # 领域子索引（可选）
│   │   ├── *.md                  # 概念页、实体页、来源页
│   │   └── experiences/
│   │       ├── inbox/            # 待审核经验卡片（status=pending）
│   │       └── *.md              # 已正式经验页（status=active）
│   ├── emotions/                 # 领域：情感
│   ├── reading/                  # 领域：读书
│   └── <其他领域>/
├── index.md                      # 全局内容索引
├── log.md                        # 全局时间日志
└── AGENTS.md                     # 本文件（schema）
```

### 2.1 命名约定

- 文件名：kebab-case，如 `async-patterns.md`、`emotion-regulation-techniques.md`
- 目录名：kebab-case，代表领域，如 `coding/`、`machine-learning/`
- wiki 页标题：在 frontmatter `title` 字段定义，可含中文
- 经验卡片：`wiki/<domain>/experiences/inbox/<kebab-case-title>.md`

---

## 3. frontmatter Schema

每个 wiki 页**必须**包含 frontmatter。不同 `type` 有不同必填字段。

### 3.1 通用必填字段

```yaml
---
title: "页面标题"           # 字符串
domain: [coding]            # 字符串数组，至少一个领域
type: concept               # 枚举：concept | entity | source | experience
status: active              # 枚举：active | staging | pending | archived | rejected
date: 2026-07-22            # ISO 日期：创建或最后更新日期
---
```

### 3.2 按 type 的附加字段

| type | 附加必填字段 | 说明 |
| --- | --- | --- |
| `source` | `source_file` | 指向 `raw/` 下原始资料路径 |
| `experience` | `confidence`、`source_task` | confidence 为 0-1 浮点；source_task 为来源任务标识 |
| `concept` / `entity` | 无附加 | 通用 |

### 3.3 可选字段

```yaml
tags: [python, async]       # 横切标签，可跨领域
use_count: 0                # 被引用次数（老化机制用，由系统维护，Agent 不手动写）
related: [[wiki/coding/other-page]]  # 相关页面链接
```

### 3.4 状态机

```text
source/concept/entity:
  staging → active → archived

experience:
  pending（inbox） → active（正式） → archived（老化降级）
        ↓
      rejected（驳回，不进入正式库）
```

---

## 4. Ingest 工作流

### 4.1 何时 Ingest

- 用户投放新文件到 `raw/`
- Agent 在编码中发现有价值的网页/文档（经用户同意后）
- Tauri GUI 拖拽上传触发

### 4.2 Ingest 步骤（Agent 必须遵循）

1. **读取原始资料**：从 `raw/` 读取，或经解析管道（MinerU/office2md）转换。
2. **与用户讨论要点**（如为交互式 ingest）：确认重点与领域归属。
3. **判断领域**：根据内容确定 `domain`，若无合适领域则建议新建。
4. **写 summary 页**：在 `wiki/<domain>/` 下新建 markdown 页，含 frontmatter。
5. **更新实体/概念页**：若新资料涉及已有实体或概念，更新对应页面，标注新信息是否与旧声明矛盾。
6. **更新 `index.md`**：在对应领域分组下追加新页面条目。
7. **追加 `log.md`**：格式 `## [YYYY-MM-DD] ingest | <标题>`，记录 source、wiki 路径、影响的页面数。

### 4.3 Ingest 质量要求

- 一个 source 通常应 touch 5-15 个 wiki 页（更新交叉引用）。
- 发现矛盾时，在受影响页面显式标注「⚠️ 矛盾：[新 source] 与 [旧声明] 冲突，待裁决」。
- 不删除旧声明，而是追加新声明并标注来源。
- 原始资料永远不可变（写 `raw/`，不改 `raw/`）。

---

## 5. Query 工作流

### 5.1 检索策略（按规模分档）

| 规模 | 策略 | Agent 行为 |
| --- | --- | --- |
| 小（<200 页） | index.md 导航 | 先读 `index.md`，按领域定位，再钻取具体页面 |
| 中（200-5000） | qmd 混合检索 | 调用 MCP `kb_search`（BM25 + 向量 + 重排） |
| 大（>5000） | LanceDB 向量检索 | 调用 MCP `kb_search`（向量 + FTS5） |

### 5.2 Query 步骤（Agent 必须遵循）

1. **判断是否需要查知识库**：编码任务开始前，先查知识库是否已有相关知识。
2. **调用 `kb_search`**：传入查询语句与可选 domain 过滤。
3. **读取 top 结果**：用 `kb_get_page` 获取完整页面。
4. **综合答案带引用**：回答中标注来源页面路径，如「根据 [[wiki/coding/async-patterns]]」。
5. **回写有价值的发现**（可选）：若 Query 中产生了新的综合分析或发现，可作为新 wiki 页回写（见第 7 节）。

### 5.3 检索失败时

- 若 `kb_search` 无结果，明确告知用户「知识库中暂无相关知识」，不编造。
- 若 MCP server 不可用，回退到读 `index.md` + 直接读 `wiki/` 目录。

---

## 6. Lint 工作流

### 6.1 何时 Lint

- 定期（如每周）
- 大量 ingest 后
- 用户主动要求

### 6.2 Lint 检查项

| 检查项 | 说明 | 严重度 |
| --- | --- | --- |
| 矛盾 | 同一实体在不同页面有冲突声明 | 高 |
| 孤儿页 | 无入链的页面（experience 且 confidence 高除外） | 中 |
| 过时声明 | source 页面更新后，引用它的 wiki 页未同步 | 高 |
| 缺失交叉引用 | 页面间应建链但未建 | 中 |
| 数据缺口 | 重要概念被提及但无独立页面 | 低 |
| frontmatter 缺失 | 页面无 frontmatter 或必填字段不全 | 高 |

### 6.3 Lint 输出

调用 `kb_lint` tool，输出结构化报告，存档至 `docs/reports/YYYY-MM-DD-kb-lint-lint.md`。
Agent 应主动修复高严重度问题，中低严重度问题列出建议。

---

## 7. 持续进化工作流（核心扩展）

这是本知识库区别于普通 RAG 的关键：**编码实践中发现的更好方案，自动沉淀回知识库**。

### 7.1 何时写经验卡片

Agent 在完成一个编码任务后，若发现以下情况，**必须**写经验卡片：

- 发现了一个比知识库现有方案更好的实现
- 踩了一个坑，且这个坑有复用价值
- 总结出一个可复用的模式、决策、配置
- 验证了某个方案在特定场景下的有效性

### 7.2 经验卡片格式

```markdown
---
title: "Python 异步上下文管理器的正确用法"
domain: [coding]
type: experience
status: pending
confidence: 0.85
date: 2026-07-22
source_task: "task-async-refactor-001"
tags: [python, async, context-manager]
---

## 背景

<在什么任务中遇到了什么问题>

## 方案

<采用了什么方案，为什么好>

## 证据

<代码片段、测试结果、性能数据>

## 适用场景

<在什么情况下适用，什么情况下不适用>
```

### 7.3 写入流程

1. **Agent 调用 `kb_write_experience`**：传入 title、domain、content、confidence、source_task。
2. **写入 `wiki/<domain>/experiences/inbox/`**：status=pending。
3. **追加 `log.md`**：格式 `## [YYYY-MM-DD] experience | <标题>`，记录 inbox 路径、confidence、source_task。

### 7.4 审核门禁（两 tier）

| Tier | 条件 | 动作 | 占比 |
| --- | --- | --- | --- |
| Tier 1（自动） | confidence ≥ 0.8 且单域且非重复 | 自动提升为正式页（status=active，移出 inbox） | ~90% |
| Tier 2（人工） | confidence < 0.8 或跨域或疑似重复 | 进入人工审核队列 | ~10% |

**重复检测**：标题相似度 > 0.9 或内容嵌入相似度 > 0.92 视为疑似重复，进 Tier 2。

### 7.5 老化与淘汰

- 每次 `kb_get_page` 被调用时，`use_count` +1。
- 定期 `/dream` 整理时，`use_count` 长期为 0 且 `date` 超过 90 天的经验卡片，降级为 `archived`，移到 `wiki/<domain>/experiences/archive/`。
- archived 页仍可被检索，但不进 top 结果。

### 7.6 经验卡片质量自检（Agent 写入前）

- [ ] 是否真的可复用（不是一次性的 hack）？
- [ ] 是否包含可验证的证据（代码/测试/数据）？
- [ ] confidence 评估是否诚实？（0.9 表示高度确信，0.6 表示推测性）
- [ ] 是否标注了适用场景与不适用场景？
- [ ] 是否与知识库已有内容重复？（查 `kb_search` 确认）

---

## 8. 多领域分类规范

### 8.1 领域目录

`wiki/` 下每个一级目录是一个领域。常见领域：

| 领域 | 目录 | 说明 |
| --- | --- | --- |
| 编程 | `coding/` | 编程语言、框架、架构、DevOps |
| 情感 | `emotions/` | 心理、情绪、自我成长 |
| 读书 | `reading/` | 书籍笔记、读后感 |
| 学术 | `academic/` | 论文、研究方法 |
| 生活 | `life/` | 健康、旅行、爱好 |

### 8.2 多归属处理

- **主归属**：放在最相关的领域目录下（如 Python 异步模式放 `coding/`）。
- **横切归属**：通过 `tags` 实现（如 `tags: [python, async]`）。
- **frontmatter `domain` 字段**：数组，可填多个领域，但文件物理位置只在一个目录。

### 8.3 新建领域

- 当内容不属于任何现有领域时，新建目录。
- 在 `index.md` 中追加新领域分组。
- 在本文件第 8.1 节追加领域说明。

---

## 9. Agent 调用规约

### 9.1 MCP Tools 一览

| Tool | 何时用 | 副作用 |
| --- | --- | --- |
| `kb_search` | 编码前查知识、回答问题前检索 | 无 |
| `kb_get_page` | 需要读取完整页面 | 无 |
| `kb_ingest_source` | 用户投放新资料 | 写 wiki/staging/、追加 log |
| `kb_write_experience` | 任务结束发现可复用经验 | 写 inbox/、追加 log |
| `kb_list_categories` | 浏览知识库结构 | 无 |
| `kb_list_recent` | 了解最近动态 | 无 |
| `kb_lint` | 健康检查 | 无（只读分析） |
| `kb_health` | 运维状态查询 | 无 |

### 9.2 编码任务的标准流程

1. **任务开始**：先 `kb_search` 查知识库是否有相关知识。
2. **执行任务**：过程中如有疑问，再次 `kb_search`。
3. **任务结束**：若发现可复用经验，`kb_write_experience`。
4. **定期**：`kb_lint` 检查知识库健康度。

### 9.3 禁止行为

- ❌ 直接修改 `raw/` 下原始资料（不可变原则）。
- ❌ 跳过 frontmatter 直接写 wiki 页。
- ❌ 跳过 inbox 直接写正式经验页（必须经审核门禁）。
- ❌ 删除旧声明（应追加新声明并标注矛盾）。
- ❌ 编造知识库中不存在的内容（检索无果时明确告知）。

---

## 10. 与 CLAUDE.md 的关系

| 文件 | 治理对象 | 适用场景 |
| --- | --- | --- |
| `CLAUDE.md` | 知识库**系统**的开发过程 | 开发 MCP server、Tauri GUI、解析管道时 |
| `AGENTS.md`（本文件） | 知识库**内容**的使用与进化 | 使用知识库辅助编码、ingest 资料、写经验时 |

两者不冲突：开发知识库系统时遵循 CLAUDE.md；使用知识库时遵循 AGENTS.md。

---

## 11. Schema 演进

本文件（schema）由用户与 Agent 共同演进。修改本文件时：

1. 通过 PR 提交（不直接改 main）。
2. 在 PR 描述中说明修改原因与影响。
3. 更新后，Agent 在下次会话开始时重读本文件。
4. 重大变更（如改变 frontmatter schema）需同步更新已有 wiki 页或提供迁移脚本。
