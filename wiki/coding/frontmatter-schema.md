---
title: "frontmatter Schema 规约"
domain: [coding]
type: concept
status: active
date: 2026-07-24
tags: [kb-system, frontmatter, yaml, schema]
related: [[wiki/coding/page-types-and-state-machine]], [[wiki/coding/multi-domain-classification]]
---

## 概念

每个 wiki 页**必须**包含 frontmatter（YAML 元数据块）。frontmatter 是页面结构的「身份证」，决定页面类型、状态、归属与可检索性。

## 通用必填字段

```yaml
---
title: "页面标题"           # 字符串，可含中文
domain: [coding]            # 字符串数组，至少一个领域
type: concept               # 枚举：concept | entity | source | experience
status: active              # 枚举：active | staging | pending | archived | rejected
date: 2026-07-24            # ISO 日期：创建或最后更新日期
---
```

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `title` | string | 必填，非空 | 页面标题，可含中文 |
| `domain` | string[] | 必填，≥1 项 | 领域归属，见 [[wiki/coding/multi-domain-classification]] |
| `type` | enum | 必填 | `concept` / `entity` / `source` / `experience` |
| `status` | enum | 必填 | 见 [[wiki/coding/page-types-and-state-machine]] |
| `date` | date | 必填，ISO `YYYY-MM-DD` | 创建或最后更新日期 |

## 按 type 的附加必填字段

| type | 附加必填字段 | 说明 |
| --- | --- | --- |
| `source` | `source_file` | 指向 `raw/` 下原始资料路径，如 `raw/pdf/karpathy-llm-wiki.pdf` |
| `experience` | `confidence`、`source_task` | `confidence` 为 0-1 浮点；`source_task` 为来源任务标识 |
| `concept` / `entity` | 无附加 | 通用 |

## 可选字段

```yaml
tags: [python, async]                # 横切标签，可跨领域
use_count: 0                         # 被引用次数（系统维护，Agent 不手写）
related: [[wiki/coding/other-page]]  # 相关页面链接
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `tags` | string[] | 横切标签，用于跨领域检索（如 `tags: [python, async]`） |
| `use_count` | number | 系统维护，每次 `kb_get_page` 调用 +1；Agent 不手写 |
| `related` | string[] | 相关页面 wiki 链接，用于构建交叉引用图 |

## 命名约定

- **文件名**：kebab-case，如 `async-patterns.md`、`emotion-regulation-techniques.md`
- **目录名**：kebab-case，代表领域，如 `coding/`、`machine-learning/`
- **title 字段**：可含中文，但文件名必须 kebab-case
- **经验卡片**：`wiki/<domain>/experiences/inbox/<kebab-case-title>.md`（pending）→ `wiki/<domain>/experiences/<kebab-case-title>.md`（active）

## YAML 安全解析（DEF-003 修复）

`parseFrontmatter` 使用 js-yaml 5 的 `load()` 解析。js-yaml 5 的 CORE_SCHEMA 默认移除了不安全 tag（如 `!!js/function`）。但 `load("")` 在 v5 会抛 YAMLException（v4 返回 undefined），因此必须 try/catch 降级为空 frontmatter，防止工具崩溃（CLAUDE.md §19.4 不吞异常，记录日志后降级）。

## 常见错误

| 错误 | 后果 | 修复 |
| --- | --- | --- |
| 缺 frontmatter | lint 报「frontmatter 缺失」高严重度 | 补全必填字段 |
| `type` 值非法 | 工具拒绝处理 | 限定为四种枚举之一 |
| `date` 格式错 | 解析失败 | 用 `YYYY-MM-DD` |
| `domain` 不是数组 | 类型错误 | 用 `[coding]` 而非 `coding` |
| `confidence` 超出 0-1 | 门禁误判 | 限定 `[0, 1]` 浮点 |
| `source_file` 路径不存在 | source 页失效 | 验证 raw 路径 |

## 相关概念

- [[wiki/coding/page-types-and-state-machine]] — type 与 status 的状态机。
- [[wiki/coding/multi-domain-classification]] — domain 字段的使用规范。
- [[wiki/coding/lint-workflow]] — frontmatter 缺失是高严重度 lint 项。

## 来源

- `AGENTS.md` §3（frontmatter Schema）、§2.1（命名约定）
- `server/src/utils/frontmatter.ts`（parseFrontmatter / serializeFrontmatter）
