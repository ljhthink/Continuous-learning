# MCP 客户端集成指南

> 本文档说明如何为 Claude Code、Trae CN、OpenCode 三个编码 Agent 配置 MCP server，使其能调用知识库的 8 个 `kb_*` tools。
>
> 对应 PRD [US-002](../PRD.md) 第 3 条验收标准，决策依据见 [ADR-002](../decisions/ADR-002-mcp-client-integration.md)。

## 1. 概述

知识库 MCP server（`continuous-learning-kb` v0.1.0）以 stdio 传输暴露 8 个 tools：`kb_search` / `kb_get_page` / `kb_ingest_source` / `kb_write_experience` / `kb_list_categories` / `kb_list_recent` / `kb_lint` / `kb_health`。三个编码 Agent 各有独立的 MCP 配置文件位置与格式：

| Agent | 配置文件 | 顶层键 | command 形式 | env 字段 |
|---|---|---|---|---|
| Claude Code | `.mcp.json`（项目根） | `mcpServers` | `command: "node"` + `args: [...]` | `env: { ... }` |
| Trae CN | `.trae/mcp.json`（项目根） | `mcpServers` | `command: "node"` + `args: [...]` | `env: { ... }` |
| OpenCode | `opencode.json`（项目根） | `mcp` | `command: ["node", ...]`（数组） | `environment: { ... }` |

三份配置文件均已提交到本仓库，使用绝对路径（见 §4 路径可移植性说明）。

## 2. 前置条件

- **Node.js ≥ 22**（运行 MCP server）
- **MCP server 已编译**：在 `server/` 目录执行 `npm install && npm run build`，生成 `server/dist/index.js`
- **知识库已初始化**：项目根含 `wiki/`、`raw/`、`index.md`、`log.md`（本仓库已包含）
- **Trae CN 用户**：在 设置 > MCP 中启用"启用项目级 MCP"开关（设置项 `trae.mcp.enableWorkspaceMcp: true`）

## 3. 各客户端配置详解

### 3.1 Claude Code（`.mcp.json`）

Claude Code 读取项目根的 `.mcp.json` 文件。本仓库已提供：

```json
{
  "mcpServers": {
    "continuous-learning-kb": {
      "command": "node",
      "args": ["D:\\s0611\\code\\Continuous-learning\\server\\dist\\index.js"],
      "env": {
        "KB_ROOT": "D:\\s0611\\code\\Continuous-learning"
      }
    }
  }
}
```

**使用方式**：在项目根目录打开 Claude Code，它会自动加载 `.mcp.json`。首次使用时会提示信任该 MCP server。

**替代配置方式**（CLI）：

```bash
claude mcp add continuous-learning-kb --scope project -e KB_ROOT=D:\s0611\code\Continuous-learning -- node D:\s0611\code\Continuous-learning\server\dist\index.js
```

### 3.2 Trae CN（`.trae/mcp.json`）

> ⚠️ **重要**：`.trae/mcp.json` 受 Trae CN 保护（在 denylist 中），模型与脚本无法自动创建。**必须由用户手动创建**。

**前置**：在 设置 > MCP 中启用"启用项目级 MCP"开关。

**方式 A — 通过 Trae CN UI（推荐）**：

1. 打开 Trae CN，进入 设置 > MCP
2. 点击 添加 > 手动添加
3. 点击 原始配置（JSON） 按钮
4. 粘贴以下内容：

```json
{
  "mcpServers": {
    "continuous-learning-kb": {
      "command": "node",
      "args": ["D:\\s0611\\code\\Continuous-learning\\server\\dist\\index.js"],
      "env": {
        "KB_ROOT": "D:\\s0611\\code\\Continuous-learning"
      }
    }
  }
}
```

5. 点击 确认。Trae CN 会写入 `.trae/mcp.json` 并加载 server。

**方式 B — 手动创建文件**：

在项目根创建 `.trae/mcp.json`（需先建 `.trae/` 目录），内容同上。

**验证加载**：重启 Trae CN，在 设置 > MCP 列表中应看到 `continuous-learning-kb` 状态为绿色（已连接）。

### 3.3 OpenCode（`opencode.json`）

OpenCode 读取项目根的 `opencode.json` 文件。本仓库已提供：

```json
{
  "mcp": {
    "continuous-learning-kb": {
      "type": "local",
      "command": ["node", "D:\\s0611\\code\\Continuous-learning\\server\\dist\\index.js"],
      "enabled": true,
      "environment": {
        "KB_ROOT": "D:\\s0611\\code\\Continuous-learning"
      }
    }
  }
}
```

**注意**：OpenCode 的 `command` 是数组（`["node", "<path>"]`），与 Claude Code / Trae CN 的 `command: "node"` + `args: [...]` 分离形式不同。`type: "local"` 表示 stdio 传输；`enabled: true` 必须显式设置。

**使用方式**：在项目根目录打开 OpenCode，它会自动加载 `opencode.json`。

## 4. 路径可移植性说明

当前三份配置使用**绝对路径**（`D:\\s0611\\code\\Continuous-learning\\...`），适用于本机。迁移到其他机器或目录时：

| 场景 | 处理方式 |
|---|---|
| 同机迁移项目目录 | 更新三份配置中的 `D:\\s0611\\code\\Continuous-learning` 为新路径 |
| 跨机器迁移 | 同上；确保 Node.js ≥ 22 已安装，`server/dist/index.js` 已编译 |
| 跨 OS（Windows → macOS/Linux） | 路径分隔符改为正斜杠 `/`，移除盘符 `D:`，如 `/Users/<user>/code/Continuous-learning/server/dist/index.js` |
| 多人协作 | 各自维护本地配置（不入库），或改用环境变量展开（仅 Claude Code 支持 `${VAR}`） |

**环境变量展开（仅 Claude Code）**：Claude Code 的 `.mcp.json` 支持 `${VAR}` 语法。可改为：

```json
{
  "mcpServers": {
    "continuous-learning-kb": {
      "command": "node",
      "args": ["${KB_PROJECT_ROOT}\\server\\dist\\index.js"],
      "env": {
        "KB_ROOT": "${KB_PROJECT_ROOT}"
      }
    }
  }
}
```

使用前在 shell 中 `set KB_PROJECT_ROOT=D:\s0611\code\Continuous-learning`。**Trae CN 与 OpenCode 未文档化支持 `${VAR}` 展开**，因此本仓库默认使用绝对路径以保证三客户端一致。

## 5. 验证步骤

### 5.1 自动化验证（脚本）

```powershell
cd D:\s0611\code\Continuous-learning\server
npm run build                  # 确保 dist 最新
node verify-mcp-clients.mjs    # 验证三配置（9 断言）
```

脚本会：
1. 解析 `.mcp.json`、`opencode.json` 实际文件 + Trae CN 内联模板（因 `.trae/mcp.json` 受保护）
2. 对每个配置：用其 `command/args/env` spawn server，发 JSON-RPC `initialize` → `tools/list` → `tools/call kb_search`
3. 断言：server 启动成功 + tools/list 含 kb_search + kb_search 返回非空结果

**预期输出**：`9 passed, 0 failed`。

### 5.2 人工验证（三 Agent UI）

自动化脚本证明"配置可启动 server"，但 Agent UI 的配置加载逻辑与脚本不同。需在三个 Agent 中各手动触发一次 kb_search 确认：

**Claude Code**：
1. 在项目根打开 Claude Code
2. 对话中输入：`用 kb_search 搜索知识库中关于 async 的内容`
3. 确认返回非空结果（应含 `wiki/coding/async-patterns`）

**Trae CN**：
1. 确认 `.trae/mcp.json` 已创建（见 §3.2）
2. 重启 Trae CN
3. 在 solo_agent 或 IDE 模式对话中触发同样查询
4. 确认返回非空结果

**OpenCode**：
1. 在项目根打开 OpenCode
2. 触发同样查询
3. 确认返回非空结果

三处均成功即满足 PRD US-002 第 3 条。建议截图或贴响应文本作为验收证据。

## 6. 故障排查

| 症状 | 可能原因 | 解决方法 |
|---|---|---|
| server 未启动 | `server/dist/index.js` 不存在 | `cd server && npm install && npm run build` |
| `node` 命令未找到 | Node.js 未安装或不在 PATH | 安装 Node.js ≥ 22，确认 `node --version` 可用 |
| tools/list 为空 | server 启动失败 | 在 `server/` 执行 `node dist/index.js` 手动启动，查看 stderr 错误 |
| kb_search 返回空 | `KB_ROOT` 指向空知识库 | 确认 `KB_ROOT/wiki/` 下有 `.md` 文件；本仓库已含 `wiki/coding/async-patterns.md` |
| Trae CN 未加载配置 | 未启用"项目级 MCP"开关 | 设置 > MCP > 启用项目级 MCP（`trae.mcp.enableWorkspaceMcp: true`） |
| Trae CN 配置丢失 | `.trae/mcp.json` 被覆盖 | 重新按 §3.2 创建；该文件受 Trae CN 保护，不会随 git 同步 |
| 路径含反斜杠转义错误 | JSON 中 `\` 需转义为 `\\` | 确认配置中路径写为 `D:\\s0611\\...` 而非 `D:\s0611\...` |

## 7. 相关文档

- [PRD](../PRD.md) US-002（可被外部 Agent 调用）
- [ARCH](../ARCH.md) §3.1（MCP 接口契约）、§10（P2 演进路线）
- [ADR-002](../decisions/ADR-002-mcp-client-integration.md)（MCP 客户端集成决策）
- [AGENTS.md](../../AGENTS.md) §9（Agent 调用规约）
- 验收报告：`docs/reports/2026-07-23-p2-integration-acceptance.md`
