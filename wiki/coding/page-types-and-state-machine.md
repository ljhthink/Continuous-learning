---
title: "页面类型与状态机"
domain: [coding]
type: concept
status: active
date: 2026-07-24
tags: [kb-system, frontmatter, state-machine]
related: [[wiki/coding/frontmatter-schema]], [[wiki/coding/continuous-evolution-review-gate]]
---

## 概念

wiki 层的每个 markdown 页都属于**四种类型**之一，每种类型有独立的**状态机**控制其生命周期。

## 四种页面类型

| type | 用途 | 附加必填字段 | 示例 |
| --- | --- | --- | --- |
| `concept` | 通用概念页 | 无 | `three-layer-architecture.md` |
| `entity` | 实体页（具体项目/工具/人） | 无 | `zod-library.md` |
| `source` | 来源页（指向 raw 资料） | `source_file` | `pdf-karpathy-llm-wiki.md` |
| `experience` | 经验卡片（可复用方案） | `confidence`, `source_task` | `js-yaml-5-major-升级...md` |

## 状态机

### concept / entity / source 的状态

```text
staging → active → archived
```

- `staging`：草稿，尚未审核。
- `active`：正式生效，可被检索和引用。
- `archived`：过时或被取代，仍可检索但不进 top 结果。

### experience 的状态（更严格）

```text
pending（inbox） → active（正式） → archived（老化降级）
      ↓
    rejected（驳回，不进入正式库）
```

- `pending`：写入 `wiki/<domain>/experiences/inbox/`，等待审核门禁。
- `active`：通过 promote 后移到 `wiki/<domain>/experiences/`，可被检索。
- `archived`：`use_count` 长期为 0 且 `date` 超过 90 天，由 `/dream` 降级。
- `rejected`：被 reject 动作驳回，文件保留在 inbox 但 frontmatter 标记 `status: rejected`。

## 状态转移触发

| 当前状态 | 目标状态 | 触发动作 | 工具 |
| --- | --- | --- | --- |
| staging | active | 人工或 Agent 审核 | 手动编辑 frontmatter |
| active | archived | 过时降级 | 手动 / `/dream` |
| pending | active | promote（Tier 1 auto / Tier 2 manual） | `kb_promote_experience` |
| pending | rejected | reject | `kb_promote_experience` |
| active (experience) | archived | `use_count=0` + 90 天 | `/dream` |

## 状态机守卫

`kb_promote_experience` 在执行前验证：

- `frontmatter.type === "experience"`（否则拒绝，防止误提升概念页）
- `frontmatter.status === "pending"`（否则拒绝，防止重复 promote 已 active 的卡片）

这两个守卫保护 KB 状态机不被破坏（CLAUDE.md §19.4 Fail Fast）。

## frontmatter 必填字段

### 通用必填

```yaml
---
title: "页面标题"
domain: [coding]
type: concept
status: active
date: 2026-07-24
---
```

### 按 type 的附加字段

- `source`：`source_file: raw/pdf/xxx.pdf`
- `experience`：`confidence: 0.85`、`source_task: task-xxx`

### 可选字段

- `tags: [python, async]` — 横切标签
- `use_count: 0` — 引用计数（系统维护，不手写）
- `related: [[wiki/coding/other-page]]` — 相关页面链接

## 相关概念

- [[wiki/coding/frontmatter-schema]] — 字段定义与命名约定。
- [[wiki/coding/continuous-evolution-review-gate]] — experience 类型的门禁机制。
- [[wiki/coding/lint-workflow]] — 状态机违规是 lint 检查项之一。

## 来源

- `AGENTS.md` §3（frontmatter Schema）、§7.4-7.5（门禁与老化）
- `server/src/tools/write.ts`（kbPromoteExperience 状态守卫）
