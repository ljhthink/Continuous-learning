---
title: "Query 工作流：检索与综合答案"
domain: [coding]
type: concept
status: active
date: 2026-07-24
tags: [kb-system, workflow, query, search, retrieval]
related: [[wiki/coding/dual-index-mechanism]], [[wiki/coding/multi-domain-classification]]
---

## 概念

Query 是从 wiki 层检索知识并综合成带引用的答案的过程。是知识库的「出口」操作。

## 检索策略（按规模分档）

| 规模 | 策略 | Agent 行为 |
| --- | --- | --- |
| 小（<200 页） | index.md 导航 | 先读 `index.md`，按领域定位，再钻取具体页面 |
| 中（200-5000） | qmd 混合检索 | 调用 MCP `kb_search`（BM25 + 向量 + 重排） |
| 大（>5000） | LanceDB 向量检索 | 调用 MCP `kb_search`（向量 + FTS5） |

## Query 5 步流程（Agent 必须遵循）

1. **判断是否需要查知识库**：编码任务开始前，先查知识库是否已有相关知识。
2. **调用 `kb_search`**：传入查询语句与可选 domain 过滤。
3. **读取 top 结果**：用 `kb_get_page` 获取完整页面（不仅是摘要）。
4. **综合答案带引用**：回答中标注来源页面路径，如「根据 [[wiki/coding/async-patterns]]」。
5. **回写有价值的发现**（可选）：若 Query 中产生新的综合分析或发现，可作为新 wiki 页回写。

## 工具支持

### kb_search MCP 工具

```typescript
kbSearch({
  query: "Python 异步上下文管理器的正确用法",
  domain: "coding",        // 可选：领域过滤
  top_k: 5                 // 可选：返回结果数
})
```

返回：top 结果的路径、标题、摘要、score。

### kb_get_page MCP 工具

```typescript
kbGetPage({
  path: "wiki/coding/async-patterns",
  section: "Background"    // 可选：仅读某一节
})
```

副作用：`use_count` +1（用于老化机制，见 [[wiki/coding/continuous-evolution-review-gate]]）。

### kb_list_categories / kb_list_recent

- `kb_list_categories`：浏览知识库领域结构。
- `kb_list_recent`：了解最近动态（基于 log.md）。

## 检索失败时

- 若 `kb_search` 无结果：**明确告知用户「知识库中暂无相关知识」，不编造**（AGENTS.md §9.3）。
- 若 MCP server 不可用：回退到读 `index.md` + 直接读 `wiki/` 目录。

## 引用规范

### 显式引用

回答中必须标注来源：

```markdown
根据 [[wiki/coding/async-patterns]]，Python 异步上下文管理器的正确用法是...

详见 [Karpathy LLM Wiki 模式](wiki/coding/three-layer-architecture)。
```

### 多源综合

当答案综合自多个 wiki 页时，逐条标注：

```markdown
- 三层架构定义见 [[wiki/coding/three-layer-architecture]]
- frontmatter 字段见 [[wiki/coding/frontmatter-schema]]
- 状态转移见 [[wiki/coding/page-types-and-state-machine]]
```

## 性能要求（PRD US-006）

- 1000 页规模下，`missing_xref` 扫描完成时间 p95 < 2s（PRD 硬阈值）
- p50 < 1s（内部基线，DEF-006 调优中）

## 与其他工作流的关系

| 工作流 | 触发 Query 的场景 |
| --- | --- |
| Ingest | 之前先查是否已有相关页面（避免重复） |
| Experience | 写入前查 `kb_search` 确认非重复 |
| Lint | 不直接触发 Query |
| 编码任务 | 任务开始前 + 过程中有疑问时 |

## 相关概念

- [[wiki/coding/dual-index-mechanism]] — Query 先读 index.md 定位。
- [[wiki/coding/multi-domain-classification]] — domain 过滤加速检索。
- [[wiki/coding/continuous-evolution-review-gate]] — Query 触发 use_count 累加。

## 来源

- `AGENTS.md` §5（Query 工作流）、§5.3（检索失败时）、§9.3（禁止编造）
- `server/src/tools/read-only.ts`（kbSearch / kbGetPage 实现）
- `docs/PRD.md` US-006（性能验收标准）
