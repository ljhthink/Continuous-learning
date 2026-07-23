---
title: "双索引机制：内容索引 + 时间日志"
domain: [coding]
type: concept
status: active
date: 2026-07-24
tags: [kb-system, indexing, navigation]
related: [[wiki/coding/three-layer-architecture]], [[wiki/coding/ingest-workflow]]
---

## 概念

本知识库维护**两套互补索引**，分别从「内容」与「时间」两个维度导航 wiki 层：

| 索引 | 文件 | 导向 | 用途 |
| --- | --- | --- | --- |
| 内容索引 | `index.md` | 内容导向 | 按领域分组列出所有页面，LLM 回答前先读此文件定位 |
| 时间日志 | `log.md` | 时间导向 | append-only 记录 ingest / query / lint / experience 事件 |

## 内容索引（index.md）

### 结构

```markdown
# 知识库索引
> 最后更新：YYYY-MM-DD · 总页数：N

## <domain>
- [[wiki/<domain>/<page>]] · 一句话摘要 · YYYY-MM-DD

## experiences（最近正式经验卡片）
- [[wiki/<domain>/experiences/<page>]] · 标题 · confidence=0.x · YYYY-MM-DD
```

### 维护规则

- **领域分组**：每个 `## <domain>` 段对应一个领域目录。
- **经验卡片单独成段**：`## experiences` 段统一列出所有正式经验卡片，不按领域重复（AGENTS.md §4.2 step 6）。
- **header 自动刷新**：`updateIndexHeader(files.length, todayDate())` 由工具调用维护，不手写。
- **条目格式**：`- [[路径]] · 标题 · 日期`（概念/实体/来源页）；经验卡片追加 `confidence=0.x`。

### 何时更新

- Ingest 新资料后（AGENTS.md §4.2 step 6）
- 提升经验卡片后（AGENTS.md §7.3）
- 删除或重命名页面后

## 时间日志（log.md）

### 结构

```markdown
## [YYYY-MM-DD] <type> | <title>

- <key>: <value>
- <key>: <value>
```

### 事件类型

| type | 触发时机 | 关键 details |
| --- | --- | --- |
| `init` | KB 初始化 | — |
| `ingest` | 摄入新资料 | source, wiki_path, pages_affected |
| `experience` | 写入经验卡片到 inbox | inbox_path, confidence, source_task |
| `promote` | 提升经验卡片为正式 | promoted, from_inbox, tier, confidence |
| `reject` | 驳回经验卡片 | inbox_path, reason |
| `lint` | 健康检查 | issues_found, severity |
| `query` | 检索（可选记录） | query_text, top_results |

### 格式合规要求（DEF-005 修复）

- heading `## [date] type | title` 后必须空行再接 list（MD022/MD032）
- `type` 用 `promote` 而非 `experience`（避免 write+promote 同标题触发 MD024）
- 文件以 `\n` 结尾（MD047）
- `sanitizeLogField` 防护 `\r\n` 注入（CWE-117）

## 与单索引的区别

传统知识库通常只有内容索引。本知识库增加时间日志的原因：

1. **可追溯**：每个 wiki 页的变更都能在 log.md 找到对应事件。
2. **可审计**：Agent 的每次 ingest/promote/lint 都留痕，便于回查。
3. **可恢复**：配合 git history，可任意时点回放 KB 状态。

## 相关概念

- [[wiki/coding/three-layer-architecture]] — 双索引属于 L2 索引层。
- [[wiki/coding/ingest-workflow]] — ingest 同时更新两个索引。
- [[wiki/coding/continuous-evolution-review-gate]] — promote 事件由门禁触发。

## 来源

- `AGENTS.md` §1.2（双索引定义）、§4.2 step 7、§7.3
- `docs/ARCH.md` §4（L2 索引层）
