---
title: "Ingest 工作流：从 raw 到 wiki"
domain: [coding]
type: concept
status: active
date: 2026-07-24
tags: [kb-system, workflow, ingest]
related: [[wiki/coding/dual-index-mechanism]], [[wiki/coding/three-layer-architecture]], [[wiki/coding/frontmatter-schema]]
---

## 概念

Ingest 是把 `raw/` 下的不可变原始资料（PDF / Word / Excel 等）整理成 wiki 页的过程，是知识库的「入口」操作。

## 何时 Ingest

- 用户投放新文件到 `raw/`
- Agent 在编码中发现有价值的网页/文档（经用户同意后）
- Tauri GUI 拖拽上传触发

## Ingest 7 步流程（Agent 必须遵循）

1. **读取原始资料**：从 `raw/` 读取，或经解析管道（MinerU / office2md）转换。
2. **与用户讨论要点**（如为交互式 ingest）：确认重点与领域归属。
3. **判断领域**：根据内容确定 `domain`，若无合适领域则建议新建。
4. **写 summary 页**：在 `wiki/<domain>/` 下新建 markdown 页，含 frontmatter。
5. **更新实体/概念页**：若新资料涉及已有实体或概念，更新对应页面，标注新信息是否与旧声明矛盾。
6. **更新 `index.md`**：在对应领域分组下追加新页面条目。
7. **追加 `log.md`**：格式 `## [YYYY-MM-DD] ingest | <标题>`，记录 source、wiki 路径、影响的页面数。

## 质量要求

### 触达深度

一个 source 通常应 touch **5-15 个 wiki 页**（更新交叉引用）。仅写一张 summary 页是不够的。

### 矛盾处理

发现矛盾时，**不删除旧声明**，而是：

1. 在受影响页面显式标注「⚠️ 矛盾：[新 source] 与 [旧声明] 冲突，待裁决」
2. 追加新声明并标注来源
3. 触发 lint 高严重度告警

### 不可变原则

- 原始资料永远不可变（写 `raw/`，不改 `raw/`）。
- 旧声明永远不删除（追加新声明，标注矛盾）。

## 工具支持

### kb_ingest_source MCP 工具

```typescript
kbIngestSource({
  source_file: "raw/pdf/karpathy-llm-wiki.pdf",
  domain: "coding",
  summary: "Karpathy LLM Wiki 模式提出三层架构...",
  pages_to_update: ["wiki/coding/three-layer-architecture"]
})
```

副作用：写 `wiki/staging/`、追加 log.md。

### 解析管道

- PDF → MinerU → markdown
- Word → office2md → markdown
- Excel → office2md → markdown

解析管道在 `docs/ARCH.md` 中描述，当前阶段可能未全部实现。

## 与其他工作流的关系

| 工作流 | 输入 | 输出 | 触发 |
| --- | --- | --- | --- |
| Ingest | raw 资料 | wiki concept/entity/source 页 | 用户投放 |
| Experience | Agent 编码实践 | wiki experience 卡片（pending） | 任务结束 |
| Query | 用户提问 | 带引用的答案 | 任意时刻 |
| Lint | KB 当前状态 | 健康报告 | 定期 |

Ingest 与 Experience 的区别：Ingest 处理**外部资料**（raw → wiki），Experience 处理**内部实践**（编码 → wiki）。

## 相关概念

- [[wiki/coding/three-layer-architecture]] — Ingest 跨越 raw 与 wiki 两层。
- [[wiki/coding/dual-index-mechanism]] — Ingest 同时更新 index.md 与 log.md。
- [[wiki/coding/frontmatter-schema]] — summary 页的 frontmatter 结构。
- [[wiki/coding/continuous-evolution-review-gate]] — Experience 不走 Ingest，走门禁。
- [[wiki/coding/query-workflow]] — Ingest 产出的页面供 Query 检索使用。

## 来源

- `AGENTS.md` §4（Ingest 工作流）、§9.3（禁止行为）
- `server/src/tools/write.ts`（kbIngestSource 实现）
