# 运行时调试报告 · 模板

> 复制本模板新建 debug 报告，存档于 `docs/reports/YYYY-MM-DD-<bug>-debug.md`。
> 由主 Agent 调用 `TRAE-debugger` skill 后产出（CLAUDE.md 第八节）。

## 元信息

| 项目 | 内容 |
|---|---|
| 执行 Agent | 主 Agent（TRAE-debugger skill） |
| 任务令牌 | TKN-XXX-NNN |
| 任务域 | <bug-id> |
| 报告日期 | YYYY-MM-DD |
| 触发原因 | <ac-verifier 报告 / 用户要求 / 两轮修复未通过> |

## 1. 问题描述

### 1.1 症状

### 1.2 复现步骤

### 1.3 影响范围

## 2. 假设（Hypothesis）

列出对根因的初步假设（至少 3 个，按可能性排序）。

## 3. 插桩（Instrumentation）

描述在哪些位置加入日志、断点、metrics 收集。

## 4. 复现（Reproduction）

### 4.1 复现环境

### 4.2 复现结果与证据

附日志、截图、堆栈。

## 5. 分析（Analysis）

### 5.1 根因

### 5.2 否决的假设

| 假设 | 否决依据 |
|---|---|

## 6. 修复（Fix）

### 6.1 修复方案

### 6.2 修改的文件

## 7. 验证（Verification）

### 7.1 验证步骤

### 7.2 验证结果

- [ ] 原问题不再复现
- [ ] 回归测试通过
- [ ] 边界场景验证

## 8. 待澄清

若发现前置产出物存在矛盾、模糊点或信息缺失，在此明确标注。
