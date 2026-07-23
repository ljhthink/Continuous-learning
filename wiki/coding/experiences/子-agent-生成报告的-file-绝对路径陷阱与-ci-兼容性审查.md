---
title: 子 Agent 生成报告的 file:/// 绝对路径陷阱与 CI 兼容性审查
domain:
  - coding
type: experience
status: active
confidence: 0.8
date: '2026-07-24'
source_task: TKN-P0-ROUTE-A-001
---
## 背景

guardrail-enforcer 子 Agent 在生成 P0 审计报告时，自动使用了 `file:///D:/s0611/code/Continuous-learning/...` Windows 绝对路径引用 wiki 页面（如 `[ingest-workflow.md](file:///D:/s0611/code/Continuous-learning/wiki/coding/ingest-workflow.md)`）。子 Agent 在 Windows 本地环境运行，继承主 Agent 的本地路径上下文，不知道 CI 环境是 Linux，因此生成的 markdown 链接在 Linux CI 上被 lychee 识别为「File not found」，导致 docs-quality CI 失败。

这与手写文档中的绝对路径问题（已有卡片「lychee 链接检查 CI」记录）是同一类坑，但来源不同：手写文档是开发者主动写错，子 Agent 产出是自动生成——主 Agent 容易信任子 Agent 产出而跳过路径审查。

## 方案

1. **主 Agent 作为环境适配层**：接收子 Agent 产出的报告后，必须审查路径格式，将 `file:///D:/s0611/code/Continuous-learning/` 前缀替换为相对路径（如 `../../wiki/coding/...`）
2. **在子 Agent prompt 中预防**：启动子 Agent 时明确要求「使用相对路径，不要使用 file:/// 绝对路径，CI 环境是 Linux」
3. **CI 前本地预检**：提交前运行 `Select-String -Pattern "file:///" docs/reports/*.md` 扫描绝对路径

## 证据

- CI 失败日志：lychee 报告 2 个 ERROR，均为 `file:///D:/s0611/code/Continuous-learning/wiki/coding/...` 路径
- 修复 commit 146e01a：`file:///D:/s0611/code/Continuous-learning/` → `../../`，CI 16s 通过
- 修复方式与已有卡片「lychee 链接检查 CI」相同（绝对路径转相对路径），但发现路径不同（子 Agent 自动产出）

## 适用场景

**适用**：任何调用子 Agent（guardrail-enforcer、code-archaeologist、ac-verifier 等）生成 markdown 报告的工作流；Windows 开发环境 + Linux CI 的项目。

**不适用**：子 Agent 不产出文档的任务；纯 Linux 开发环境。

**经验**：子 Agent 继承主 Agent 的本地环境上下文，不知道 CI 环境差异。主 Agent 在接收子 Agent 报告后，应作为「环境适配层」审查路径格式，不能盲目信任子 Agent 产出的路径。
