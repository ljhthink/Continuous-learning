---
title: MCP server 新增工具后客户端描述符缓存过期：需重连刷新才能发现
domain:
  - coding
type: experience
status: pending
confidence: 0.8
date: '2026-07-24'
source_task: TKN-MILESTONE-AUDIT-001
---
## 背景

为 MCP server 新增第 9 个工具 `kb_promote_experience`（P3 阶段）并合并后，发现 Trae CN 客户端的 MCP 工具描述符仍只列出 8 个工具（P3 前的快照）。代码与 `dist/index.js` 均正确注册 9 个工具（`server.tool("kb_promote_experience", ...)`），但客户端无法发现新增工具，导致 US-001 的「高 confidence 自动提升」无法经 MCP 调用验证。

## 方案

1. **区分代码问题与客户端缓存问题**：先用 `Select-String server/dist/index.js -Pattern 'kb_promote_experience'` 确认构建产物已注册新工具；若 dist 正确则为客户端描述符缓存过期
2. **客户端刷新**：重启 Trae CN / 重新连接 MCP server，触发工具列表重新发现（描述符文件在 `~/.trae-cn/mcps/<server>/tools/*.json`）
3. **验证**：刷新后描述符目录应出现新工具的 `.json` 文件

## 证据

- `server/src/index.ts:84` + `server/dist/index.js:36` 均注册 `kb_promote_experience`
- 描述符目录仅 8 个 `.json`（缺 `kb_promote_experience.json`）
- 8 个可用工具经 `run_mcp` 调用 `kb_health` 验证均响应正常

## 适用场景

**适用**：任何开发 MCP server 并新增工具的场景；使用 Trae CN / Claude Code 等 MCP 客户端的开发者。

**不适用**：工具从未在代码中注册（那不是缓存问题，是代码遗漏）。

**经验**：新增 MCP 工具后，若客户端调用报「tool not found」，优先检查客户端工具列表缓存（需重连/重启刷新），而非怀疑代码。用 `kb_health` 这种无参工具作为连通性探针最快。
