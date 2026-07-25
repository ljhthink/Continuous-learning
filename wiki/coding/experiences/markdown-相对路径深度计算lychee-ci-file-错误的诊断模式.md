---
title: markdown 相对路径深度计算：lychee CI file:/// 错误的诊断模式
domain:
  - coding
type: experience
status: active
confidence: 0.9
date: '2026-07-26'
source_task: TKN-P3-DREAM-DEDUP-001
---
## 背景

P3 PR #30（feat(p3): /dream dedup + quality scoring）首次 CI 运行失败，lychee 链接检查报告：

```text
[ERROR] <file:///home/runner/work/Continuous-learning/docs/decisions/ADR-011-duplicate-detection-and-quality-scoring.md> (at 39:148) | File not found
```

错误信息中出现 `file:///` 绝对路径，初看像是 ADR-010 的 file:/// 绝对路径问题，但实际根因不同。

## 方案

### 诊断模式：file:/// 错误的两种类型

lychee CI 报告 `file:///` 错误时，需区分两种根因：

| 类型 | 症状 | 根因 | 修复 |
| --- | --- | --- | --- |
| 绝对路径（ADR-010） | `file:///D:/...` 或 `file:///C:/...` | 手写或子 Agent 生成 Windows 绝对路径 | 改为相对路径 |
| 相对路径深度错误 | `file:///home/runner/work/<repo>/...`（跑到仓库外） | 相对路径多了一层 `../` | 减少一层 `../` |

### 相对路径深度计算公式

markdown 链接中的相对路径是相对于**文件所在目录**的：

```text
文件路径：wiki/kb-system/continuous-evolution-review-gate.md
文件所在目录：wiki/kb-system/

../              → wiki/
../../           → 仓库根目录（Continuous-learning/）
../../docs/      → docs/ ✅
../../../docs/   → 仓库根目录的上一级 ❌（lychee 解析为 file:///home/runner/work/...）
```

### 诊断步骤

1. 看错误信息中的绝对路径：`file:///home/runner/work/<repo>/<path>` 表示路径跑出仓库根目录
2. 计算文件所在目录到目标的正确 `../` 层数：`depth = 文件目录深度 - 目标目录深度`
3. 对比同目录其他文件的相对路径写法（如 `wiki/design/*.md` 用 `../../docs/decisions/`）
4. 减少多余的 `../`

## 证据

PR #30 修复 commit 9bb3ab9：

```diff
- [ADR-011](../../../docs/decisions/ADR-011-duplicate-detection-and-quality-scoring.md)
+ [ADR-011](../../docs/decisions/ADR-011-duplicate-detection-and-quality-scoring.md)
```

文件 `wiki/kb-system/continuous-evolution-review-gate.md` 在 `wiki/kb-system/` 目录下，正确相对路径是 `../../docs/decisions/`（2 层 `../`），但初版写了 `../../../docs/decisions/`（3 层 `../`），导致 lychee 在 Linux CI 上解析为 `file:///home/runner/work/Continuous-learning/docs/decisions/...`（跑到仓库根目录的上一级），报 File not found。

对比同目录下其他文件（如 `wiki/design/*.md`）的相对路径写法，确认正确深度是 `../../docs/decisions/`。

CI 修复后第三次运行成功（run 30177766414，conclusion=success）。

## 适用场景

- markdown 文档中添加跨目录链接时
- lychee CI 报告 `file:///home/runner/work/...` 错误时（区别于 `file:///D:/...` 绝对路径错误）
- 子 Agent 生成报告引用其他目录文件时

## 不适用场景

- 链接目标是同目录文件（直接写文件名，无需 `../`）
- 链接目标是子目录文件（用 `./child/file.md` 或 `child/file.md`）
- 链接目标是外部 URL（lychee 直接发 HTTP 请求）

## 关联

- ADR-010（CI file:/// 绝对路径检测门禁）— 检测绝对路径类型，不检测相对路径深度错误
- ADR-011（P3 PR #30 触发此坑）
- 现有经验卡：lychee-链接检查-ci绝对路径node-modules-引用与裸-url-的处理（聚焦绝对路径，本卡补充相对路径深度错误）
- 现有经验卡：子-agent-生成报告的-file-绝对路径陷阱与-ci-兼容性审查（聚焦子 Agent 生成的绝对路径，本卡补充手写相对路径深度错误）
