# ADR-002: MCP 客户端集成策略（Claude Code / Trae CN / OpenCode）

| 项目 | 内容 |
|---|---|
| 状态 | Proposed |
| 日期 | 2026-07-23 |
| 决策者 | 主 Agent（P2 三 Agent 接入验证） |
| 关联文档 | [PRD](../PRD.md) US-002 / [ARCH](../ARCH.md) §3.1、§10 / [集成指南](../integration/mcp-clients.md) |
| 风险等级 | P2（跨模块：新增 3 个外部系统配置文件） |
| 前序 ADR | [ADR-001](ADR-001-knowledge-base-tech-stack.md)（技术栈，含 MCP server 选型） |

## 背景（Context）

PRD [US-002](../PRD.md) 第 3 条要求：「Claude Code、Trae CN、OpenCode 三者均能配置并成功调用 `kb_search` 返回结果」。这是 P2 里程碑的核心验收标准。

P1 已实现 MCP server（`continuous-learning-kb` v0.1.0，8 个 `kb_*` tools，stdio 传输，通过 31 单元测试 + 36 MCP E2E + 19 边缘场景）。P2 需让三个外部编码 Agent 能发现并调用该 server。

**核心张力**：

1. 三客户端的 MCP 配置文件位置与格式**不一致**：
   - Claude Code：`.mcp.json`，`mcpServers` 键，`command/args` 分离
   - Trae CN：`.trae/mcp.json`，`mcpServers` 键，`command/args` 分离（且受 Trae CN denylist 保护，模型无法创建）
   - OpenCode：`opencode.json`，`mcp` 键，`command` 为数组，`environment` 字段
2. 路径策略：三客户端对环境变量 `${VAR}` 展开支持不一致（仅 Claude Code 文档化支持），需选择统一的路径表达方式
3. 验证深度：自动化脚本可证明"配置可启动 server"，但 Agent UI 的配置加载逻辑独立，需人工验证补足

## 决策（Decision）

### D1. 三客户端均采用项目级配置文件（非全局）

三份配置文件均放在项目根：
- `.mcp.json`（Claude Code）
- `.trae/mcp.json`（Trae CN，由用户经 Trae CN UI 手动创建）
- `opencode.json`（OpenCode）

**理由**：知识库绑定本项目目录；克隆即得配置；不污染全局环境；与 ADR-001 的"本地优先"原则一致。

### D2. `command/args` 使用绝对路径

三份配置中 server 入口路径写为绝对路径：`D:\\s0611\\code\\Continuous-learning\\server\\dist\\index.js`，`KB_ROOT` 同样为绝对路径。

**理由**：个人知识库单机使用；三客户端对 `${VAR}` 展开支持不一致（Claude Code 支持，Trae CN/OpenCode 未文档化），绝对路径是三客户端唯一通用的可靠方式。`KB_ROOT` 显式设置避免依赖 server 默认推导（`process.cwd()/..`，在不同 Agent 启动 CWD 下有歧义）。

### D3. 三份配置文件提交到 git

`.mcp.json`、`opencode.json` 直接提交；`.trae/mcp.json` 因受 Trae CN 保护不入库，集成指南提供精确模板由用户创建。

**理由**：个人 KB，机器特定路径可接受；集成指南文档化迁移方法缓解可移植性顾虑。

### D4. Trae CN 配置由用户经 UI 创建

`.trae/mcp.json` 在 Trae CN 的 denylist 中（与 `.vscode`、`.git` 同级保护），模型与脚本无法自动创建。用户需通过 Trae CN UI（设置 > MCP > 添加 > 手动添加 > 原始配置 JSON）创建，或手动创建文件。

**理由**：Trae CN 的安全设计，防止恶意脚本注入 MCP 配置。集成指南提供精确模板与步骤。

### D5. 验证采用自动化 + 人工双闭环

- **自动化**（`server/verify-mcp-clients.mjs`，9 断言）：解析每份配置的 `command/args/env`，spawn server，发 JSON-RPC `initialize` → `tools/list` → `tools/call kb_search`，断言响应。证明"配置三元组功能完整"。
- **人工**：用户在三个 Agent UI 中各触发一次 `kb_search`，确认返回非空结果。证明"Agent 真正加载了配置"。

**理由**：自动化可回归但不能覆盖 Agent 配置加载逻辑（如 `trae.mcp.enableWorkspaceMcp` 开关、OpenCode `type: "local"` 解析）；人工验证贴近真实使用但不可回归。双闭环互补。

## 备选方案（Alternatives）

| 方案 | 否决理由 |
|---|---|
| 全局配置（`~/.claude.json`、Trae CN 用户级、`~/.config/opencode/`） | 知识库绑定项目目录；全局配置会污染其他项目；克隆项目后无配置 |
| 环境变量 `${VAR}` 展开（仅 Claude Code 支持） | Trae CN 与 OpenCode 未文档化支持，三客户端不一致；用户需额外设环境变量，增加摩擦 |
| 发布 npm 包用 `npx` 启动 | 个人 KB 无需发布；增加发布维护成本；`npx` 首次下载有延迟 |
| 单一配置文件 + 转换脚本生成三份 | 三客户端格式差异小（仅 OpenCode `command` 数组与 `environment` 字段名不同），维护三份直配比维护转换脚本更简单 |
| 仅人工验证，无自动化脚本 | 不可回归；改 server 后无法快速复验三配置 |
| 仅自动化验证，无人工 | 不能证明 Agent UI 真能加载配置（Agent 加载逻辑与脚本 spawn 不同） |

## 后果（Consequences）

### 正向

- 三客户端配置即用，克隆仓库后仅需 `npm run build` 即可启用
- 自动化脚本可纳入 CI 回归，防止 server 改动破坏配置兼容性
- 集成指南文档化全部步骤与故障排查，降低使用门槛

### 负向

- 路径机器特定（`D:\\s0611\\code\\Continuous-learning\\...`），迁移需手动更新
- `.trae/mcp.json` 不入库，新机器需用户手动创建（增加一次性摩擦）
- 绝对路径在跨 OS 场景需手改（Windows 反斜杠 → Unix 正斜杠）

### 缓解

- 集成指南 §4 详细说明迁移步骤与跨 OS 路径转换
- Claude Code 用户可选改用 `${KB_PROJECT_ROOT}` 环境变量展开（集成指南 §4 提供）
- `verify-mcp-clients.mjs` 对 Trae CN 使用内联等价配置做功能验证（不依赖 `.trae/mcp.json` 文件存在），用户创建文件后真实 Agent 加载由人工验证确认

## 验证

- **自动化**：`cd server && node verify-mcp-clients.mjs`（9 断言，预期全过）
- **人工**：三 Agent UI 各触发 `kb_search`，确认返回结果（见 [集成指南 §5.2](../integration/mcp-clients.md#52-人工验证三-agent-ui)）
- **报告**：`docs/reports/2026-07-23-p2-integration-acceptance.md`

## 生命周期

- **Proposed**：本 ADR 随 P2 PR 提交
- **Accepted**：PR 合并后转为 Accepted
- **Superseded**：若未来引入第四个 Agent 或改用 npm 包分发，新建 ADR-003 取代
