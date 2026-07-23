---
title: "Lint 工作流：健康检查"
domain: [coding]
type: concept
status: active
date: 2026-07-24
tags: [kb-system, workflow, lint, health-check]
related: [[wiki/coding/frontmatter-schema]], [[wiki/coding/multi-domain-classification]], [[wiki/coding/page-types-and-state-machine]]
---

## 概念

Lint 是对知识库当前状态的健康检查，发现矛盾、孤儿页、过时声明、缺失交叉引用等问题。是知识库的「自检」操作。

## 何时 Lint

- 定期（如每周）
- 大量 ingest 后
- 用户主动要求

## 6 大检查项

| 检查项 | 说明 | 严重度 |
| --- | --- | --- |
| 矛盾 | 同一实体在不同页面有冲突声明 | 高 |
| 孤儿页 | 无入链的页面（experience 且 confidence 高除外） | 中 |
| 过时声明 | source 页面更新后，引用它的 wiki 页未同步 | 高 |
| 缺失交叉引用 | 页面间应建链但未建 | 中 |
| 数据缺口 | 重要概念被提及但无独立页面 | 低 |
| frontmatter 缺失 | 页面无 frontmatter 或必填字段不全 | 高 |

## 严重度与处理

| 严重度 | 处理 | 谁负责 |
| --- | --- | --- |
| 高 | Agent 应**主动修复** | 主 Agent |
| 中 | 列出建议，由用户裁决 | Agent 提建议 |
| 低 | 仅记录，不强制修复 | 报告 |

## 工具支持

### kb_lint MCP 工具

```typescript
kbLint({
  checks: ["missing_xref", "orphan", "frontmatter"]  // 可选：指定检查项
})
```

返回：结构化 issues 列表，每个 issue 含 `type`、`page`、`detail`、`severity`。

### Lint 输出存档

调用 `kb_lint` 的输出存档至 `docs/reports/YYYY-MM-DD-kb-lint-lint.md`。

## L-2 优化（性能基线）

`missing_xref` 检查从 P1 的 O(N²) 两两配对扫描，优化为 P2 的 O(N×K) 倒排桶扫描（按 `${domain}::${tag}` 键）。1000 页规模下：

- p50 < 1s（内部基线，DEF-006 调优中）
- p95 < 2s（PRD US-006 硬阈值）

详见 `server/src/tests/lint-perf.test.ts`。

## Lint 与 markdownlint 的区别

| 维度 | kb_lint | markdownlint-cli2 |
| --- | --- | --- |
| 检查对象 | wiki 层**语义**（矛盾、孤儿、交叉引用） | markdown **格式**（MD022/MD032/MD047 等） |
| 触发时机 | 用户主动 / 定期 | 每次 PR（CI docs-quality） |
| 工具 | MCP `kb_lint` | `npx markdownlint-cli2 '**/*.md'` |
| 失败后果 | 报告问题，不阻断 | CI 失败，阻断合并 |
| 修复责任 | Agent（高严重度）/ 用户（中低） | 提交者必须修复 |

两者互补：markdownlint 保证格式合规（CI 强制），kb_lint 保证内容健康（建议性）。

## 跨模块影响检查

Lint 时还需检查：

- `parseLog` 正则是否兼容新 log type（如 `promote`）
- `readRecentLog` typeFilter 是否硬编码旧 type
- frontmatter 字段是否被代码硬依赖（如 `entry.type === "ingest"`）

这些是 DEF-005 类 bug 的根因：代码硬编码 type 值，新增 type 时未同步更新解析器。

## 相关概念

- [[wiki/coding/frontmatter-schema]] — frontmatter 缺失是高严重度 lint 项。
- [[wiki/coding/multi-domain-classification]] — 缺失交叉引用是中严重度 lint 项。
- [[wiki/coding/page-types-and-state-machine]] — 状态机违规是 lint 检查项。
- [[wiki/coding/dual-index-mechanism]] — Lint 事件写入 log.md。
- [[wiki/coding/query-workflow]] — Lint 保障 Query 检索结果的质量。

## 来源

- `AGENTS.md` §6（Lint 工作流）
- `server/src/tools/lint.ts`（kbLint 实现）
- `server/src/tests/lint-perf.test.ts`（L-2 性能基线）
- `docs/PRD.md` US-006（性能验收标准）
