---
title: "三层架构：Raw / Wiki / Schema"
domain: [coding]
type: concept
status: active
date: 2026-07-24
tags: [kb-system, architecture, schema]
related: [[wiki/coding/dual-index-mechanism]], [[wiki/coding/frontmatter-schema]]
---

## 概念

本知识库基于 **三层架构**，灵感来自 Andrej Karpathy 的 LLM Wiki 模式。三层各司其职，共同保证「原始资料不可变、知识库可演进、规约可治理」。

| 层 | 位置 | 说明 | 谁负责 |
| --- | --- | --- | --- |
| Raw sources | `raw/` | 不可变原始资料（PDF / Word / Excel / 图片等） | 用户投放，Agent 只读 |
| The wiki | `wiki/` | LLM 生成并维护的 markdown 知识库 | Agent 写、用户读 |
| The schema | `AGENTS.md` | 结构约定与工作流规约 | 用户与 Agent 共同演进 |

## 设计意图

- **Raw 不可变**：原始资料作为「事实源」，永不修改。Agent 只能读取，不能写入或删除。这保证了任何 wiki 页的声明都可追溯到原始资料。
- **Wiki 可演进**：wiki 页是 LLM 对 raw 资料的解读与综合，可以更新、补充、矛盾标注。wiki 是「工作知识」，不是「原始事实」。
- **Schema 可治理**：`AGENTS.md` 定义 wiki 页的结构（frontmatter）、组织（领域目录）、工作流（ingest/query/lint/experience）。Schema 由用户与 Agent 共同演进，通过 PR 提交（AGENTS.md §11）。

## 与传统 RAG 的区别

| 特性 | 传统 RAG | 本知识库 |
| --- | --- | --- |
| 存储 | 向量索引 | markdown + git（向量仅作访问层加速） |
| 可读性 | 低（向量不可读） | 高（markdown 人类可读） |
| 可演进 | 难（需重新训练索引） | 易（直接编辑 markdown） |
| 可审计 | 弱 | 强（git history 提供完整变更链） |
| Schema 层 | 无 | 有（AGENTS.md 治理） |

## 关键约束

- ❌ 直接修改 `raw/` 下原始资料（不可变原则，AGENTS.md §9.3）。
- ❌ 跳过 frontmatter 直接写 wiki 页（AGENTS.md §3，§9.3）。
- ❌ 删除旧声明（应追加新声明并标注矛盾，AGENTS.md §4.3，§9.3）。

## 相关概念

- [[wiki/coding/dual-index-mechanism]] — 双索引如何导航 wiki 层。
- [[wiki/coding/frontmatter-schema]] — wiki 页的结构约定。
- [[wiki/coding/page-types-and-state-machine]] — wiki 页的四种类型。

## 来源

- `AGENTS.md` §1.1（三层架构定义）
- `docs/ARCH.md` §4（五层架构：L1 存储 / L2 索引 / L3 访问 / L4 GUI / L5 进化）
