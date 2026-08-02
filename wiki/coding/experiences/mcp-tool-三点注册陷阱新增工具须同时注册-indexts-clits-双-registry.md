---
title: MCP tool 三点注册陷阱：新增工具须同时注册 index.ts + cli.ts 双 registry
domain: [coding]
type: experience
status: active
confidence: 0.9
date: 2026-08-02
source_task: task-missing-features-2026-08-02
---

## 背景

在 Continuous-learning 知识库项目中，MCP server 工具可通过两条路径调用：MCP 协议（index.ts 的 server.tool 注册）和 CLI 子进程（cli.ts 的 TOOL_REGISTRY + SCHEMA_REGISTRY，供 Tauri Rust 后端调用）。

补全 kb_organize_staging 工具时，仅在 index.ts 注册 + cli.ts 顶部 import，但遗漏在 TOOL_REGISTRY 和 SCHEMA_REGISTRY 添加键。导致 MCP 路径可用、单元测试（直接 import 函数）通过，但 CLI 子进程路径报 `Unknown tool: kb_organize_staging`。该缺陷被 ac-verifier 运行时 CLI 验证发现（DEFECT-1）。

## 方案

新增 MCP 工具时必须同步注册三处：

1. `server/src/index.ts` — `server.tool(name, desc, schema, handler)`
2. `server/src/cli.ts` 的 `TOOL_REGISTRY` — 映射工具名 → handler 函数
3. `server/src/cli.ts` 的 `SCHEMA_REGISTRY` — 映射工具名 → `z.object(schema)` 用于输入校验

配套修复：

- cli.ts 的 `main()` 调用需用入口点守卫包裹，否则被单元测试 import 时会触发 `process.exit()`：

  ```typescript
  import { pathToFileURL } from "node:url";
  try {
    const isMainModule =
      !!process.argv[1] &&
      import.meta.url === pathToFileURL(process.argv[1]).href;
    if (isMainModule) {
      main().catch((err) => { console.error(err); process.exit(1); });
    }
  } catch { /* argv[1] missing → not entry point */ }
  ```

- `pathToFileURL` 处理 Windows 反斜杠 → file:/// URL 转换；try/catch + `!!process.argv[1]` 防止 eval/dynamic import 上下文（argv[1] 可能 undefined）抛错。
- 导出 TOOL_REGISTRY 和 SCHEMA_REGISTRY，补一条回归测试断言两者 keys 一致 + 含所有预期工具名。

## 证据

- 缺陷复现：修复前 `node cli.ts kb_organize_staging {...}` → exit=1 `Unknown tool`；修复后 → 正常执行。
- 回归测试 `server/src/tests/missing-features.test.ts` 的「CLI registry completeness」suite：断言 7 个关键工具名在两个 registry 都存在 + 两 registry keys 深度相等。该测试在修复前会失败（捕获 DEFECT-1）。
- 215 项单元测试全过（含 2 项新增 CLI registry 测试）。

## 适用场景

- 任何采用「MCP server + CLI 子进程桥接」双调用路径的项目（Tauri GUI 调 CLI 子进程 → Node MCP tool 是典型模式）。
- 新增 MCP 工具时的注册 checklist。
- Node.js ESM 模块需区分「直接运行」vs「被 import」时的入口点守卫模式。

不适用：纯 MCP 协议单路径项目（无 CLI 桥接）无需双 registry。
