---
title: js-yaml 5 MAJOR 升级：load() 空字符串行为变化与 try/catch 降级
domain:
  - coding
type: experience
status: active
confidence: 0.9
date: '2026-07-24'
source_task: TKN-DEPS-UPGRADE-001
---
## 背景

将 js-yaml 从 v4 升级到 v5（MAJOR）时，`load("")` 的行为发生变化：v4 对空字符串返回 `undefined`，v5 抛出 `YAMLException`（"expected a document, but the input is empty"）。项目中 `parseFrontmatter` 直接调用 `load(yamlText)` 未加保护，导致空 frontmatter block（`---\n\n---\n`）在 `kb_get_page` / `kb_promote_experience` / `/dream` 三个调用点崩溃。

此问题由 ac-verifier 在验收阶段发现（DEF-003），主 Agent 在 breaking change 边界测试上不够主动。

## 方案

在 `parseFrontmatter` 中用 try/catch 包裹 `load()`，捕获所有 `YAMLException`（空字符串、语法错误、重复键），降级为空 frontmatter 对象：

```typescript
import { load, dump } from "js-yaml";  // v5 命名导入，无 default export

let frontmatter: Record<string, unknown> = {};
try {
  frontmatter = (load(yamlText) ?? {}) as Record<string, unknown>;
} catch (err) {
  console.error(`[frontmatter] malformed YAML, degrading to empty: ${err instanceof Error ? err.message : String(err)}`);
  frontmatter = {};
}
```

关键点：

1. `catch {}` 无条件捕获所有同步 throw，覆盖所有 YAMLException 场景
2. `?? {}` 额外处理 `load` 返回 null/undefined（如 YAML 内容仅为 `null`）
3. catch 块加 `console.error` 日志（CLAUDE.md §19.4 不吞异常），与项目其他路径一致

## 证据

- js-yaml 5 默认使用 `CORE_SCHEMA`（源码验证 `DEFAULT_CONSTRUCTOR_OPTIONS.schema: CORE_SCHEMA`），无 `!!js/function` 等 unsafe tag，无 RCE 风险（CWE-502 不成立）
- 3 个调用点逐一验证：读取操作尽力返回 body、写操作状态机 fail-fast、批处理安全跳过、lint 显式报告
- 单元测试覆盖空 block + malformed YAML 语法错误（未闭合 flow sequence）两个场景
- guardrail 两轮 + ac-verifier 验收通过

## 适用场景

**适用**：任何依赖 MAJOR 升级含 breaking behavior change 的库；YAML/JSON 解析场景的健壮性加固。

**不适用**：YAML 内容本身是安全可信的内部数据且无空值可能时，try/catch 是冗余的。

**经验**：依赖大版本升级时，主 Agent 应主动针对库的 breaking change changelog 逐项构造边界测试（空值、语法错误、类型变化），而非等 ac-verifier 发现。
