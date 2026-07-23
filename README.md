# Continuous-learning · 持续进化个人知识库系统

> 基于 Andrej Karpathy 的 [LLM Wiki 模式](karpathy-LLM.md)，构建一个持续进化、可被编码 Agent 调用、多领域分类、带图形化界面的个人知识库。

## 这是什么

本系统在 Karpathy 的「LLM Wiki」模式（三层架构 raw/wiki/schema + Ingest/Query/Lint 三操作 + index.md/log.md 双索引）基础上，落地四点改进：

1. **持续进化**：编码实践中发现更好方案时，自动沉淀为经验卡片，经两 tier 审核门禁入库。
2. **可被外部 Agent 调用**：通过 MCP server（stdio 传输），Claude Code / Trae CN / OpenCode 等编码 Agent 可查询知识库。
3. **多领域分类**：编程、情感、读书等领域按目录树分类，frontmatter tags 实现横切多归属。
4. **图形化界面 + 多格式上传**：Tauri 桌面应用，拖拽 PDF/Word/Excel 由 AI 解析整理后入库。

## 快速上手

### 前置条件

- Git ≥ 2.40
- Node.js ≥ 22（运行 consistency-check）
- Python 3.11+（解析管道，P4 阶段需要）
- Obsidian ≥ 1.5（人工浏览 wiki，可选但推荐）

### 当前状态

本项目处于 **P3 完成 + 依赖升级完成阶段**。在 P1/P2 基础上（9 个 kb_* tools + 45 单元测试 + 37 MCP E2E + 边缘场景 + 性能基线），P3 完成了持续进化闭环（`kb_write_experience` + `kb_promote_experience` 两 tier 审核门禁 + `/dream` 老化，见 [ADR-006](docs/decisions/ADR-006-continuous-evolution-loop.md)），并合并了 6 个 Dependabot MAJOR 依赖升级（zod 3→4 / js-yaml 4→5 / TypeScript 5→7 / actions v4→v7，见 [ADR-007](docs/decisions/ADR-007-dependency-major-upgrade.md)）。L-2 技术债已在 P2 解决；DEF-001（TOCTOU 竞态）、DEF-002（`@hono/node-server` 路径不可达）为低风险遗留技术债。下一阶段 P4 GUI。

### 阅读顺序（新人入门）

1. **理解原方案**：阅读 [karpathy-LLM.md](karpathy-LLM.md) 了解 Karpathy LLM Wiki 模式。
2. **理解治理规则**：阅读 [CLAUDE.md](CLAUDE.md) 了解 AI 编程行为规则（最高准则）。
3. **理解需求**：阅读 [docs/PRD.md](docs/PRD.md) 了解四点改进的用户故事与验收标准。
4. **理解架构**：阅读 [docs/ARCH.md](docs/ARCH.md) 了解五层架构与前端素材库。
5. **理解技术选型**：阅读 [docs/decisions/ADR-001-knowledge-base-tech-stack.md](docs/decisions/ADR-001-knowledge-base-tech-stack.md) 了解技术栈决策。
6. **理解知识库规约**：阅读 [AGENTS.md](AGENTS.md) 了解知识库 schema 与持续进化工作流。

## 文档索引

### 项目核心文档

| 文档 | 类型 | 说明 |
| --- | --- | --- |
| [CLAUDE.md](CLAUDE.md) | 治理规则 | AI 编程行为规则（最高准则），治理知识库系统的开发过程 |
| [AGENTS.md](AGENTS.md) | 知识库 schema | 知识库使用与持续进化工作流规约，治理知识库内容的使用 |
| [karpathy-LLM.md](karpathy-LLM.md) | 原始方案 | Karpathy LLM Wiki 模式导论（本项目 baseline） |

### 设计文档（Diátaxis）

| 文档 | Diátaxis 类别 | 说明 |
| --- | --- | --- |
| [docs/PRD.md](docs/PRD.md) | How-to | 产品需求文档：四点改进的用户故事与验收标准 |
| [docs/ARCH.md](docs/ARCH.md) | Explanation | 架构设计：五层架构、MCP 接口、数据模型、工作流、前端素材库 |
| [docs/decisions/README.md](docs/decisions/README.md) | Explanation | ADR 索引 |
| [docs/decisions/ADR-001-knowledge-base-tech-stack.md](docs/decisions/ADR-001-knowledge-base-tech-stack.md) | Explanation | 技术栈决策：七决策点 A-G |
| [docs/decisions/ADR-002-mcp-client-integration.md](docs/decisions/ADR-002-mcp-client-integration.md) | Explanation | MCP 客户端集成决策（Claude Code/Trae CN/OpenCode） |
| [docs/decisions/ADR-003-vcs-github-flow-branch-protection.md](docs/decisions/ADR-003-vcs-github-flow-branch-protection.md) | Explanation | VCS + GitHub Flow + 分支保护策略 |
| [docs/decisions/ADR-004-ci-docs-quality-workflow.md](docs/decisions/ADR-004-ci-docs-quality-workflow.md) | Explanation | CI docs-quality workflow（markdownlint + lychee + consistency-check） |
| [docs/decisions/ADR-005-public-vs-private-repository.md](docs/decisions/ADR-005-public-vs-private-repository.md) | Explanation | public 仓库决策（vs private + Pro） |
| [docs/decisions/ADR-006-continuous-evolution-loop.md](docs/decisions/ADR-006-continuous-evolution-loop.md) | Explanation | 持续进化闭环（config 函数化 + 两 tier 审核门禁 + /dream 老化） |
| [docs/decisions/ADR-007-dependency-major-upgrade.md](docs/decisions/ADR-007-dependency-major-upgrade.md) | Explanation | 依赖 MAJOR 升级（zod 3→4 / js-yaml 4→5 / TypeScript 5→7 / actions v4→v7） |
| [docs/integration/mcp-clients.md](docs/integration/mcp-clients.md) | How-to | MCP 客户端集成指南 |
| [docs/reports/README.md](docs/reports/README.md) | Reference | 运行时报告索引 |
| [docs/reports/2026-07-22-knowledge-base-tech-selection.md](docs/reports/2026-07-22-knowledge-base-tech-selection.md) | Reference | 技术选型对比分析报告（选型依据） |
| [docs/templates/README.md](docs/templates/README.md) | How-to | 文档模板索引 |

### 治理与自动化

| 文件 | 说明 |
| --- | --- |
| [scripts/consistency-check.js](scripts/consistency-check.js) | 文档一致性检查脚本（CI 必需） |
| [.github/workflows/docs.yml](.github/workflows/docs.yml) | 文档质量 CI（markdownlint + consistency + lychee） |
| [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md) | PR 模板（含 P0-P3 风险等级） |
| [.github/dependabot.yml](.github/dependabot.yml) | 依赖监控 |
| [.markdownlint.json](.markdownlint.json) | markdownlint 配置 |
| [lychee.toml](lychee.toml) | 链接检查配置 |
| [.mcp.json](.mcp.json) | Claude Code 项目级 MCP 配置 |
| .trae/mcp.json | Trae CN 工作区 MCP 配置（用户经 Trae CN UI 创建，文件在 `.gitignore` 中排除，不入版本控制） |
| [opencode.json](opencode.json) | OpenCode 项目级 MCP 配置 |

## 架构一览

```text
┌─────────────────────────────────────────┐
│  用户                                    │
│   ├─ Tauri GUI（拖拽上传、审核经验）       │
│   └─ Obsidian（浏览图谱、Dataview）        │
├─────────────────────────────────────────┤
│  编码 Agent（Claude Code/Trae/OpenCode）  │
│   └─ MCP stdio                            │
├─────────────────────────────────────────┤
│  L3 访问层：MCP Server（9 tools）          │
│  L4 GUI 层：Tauri v2                       │
│  L5 进化层：AGENTS.md + Dream Loop         │
├─────────────────────────────────────────┤
│  L2 索引层：index.md + log.md + frontmatter│
│  L1 存储层：markdown + git                 │
└─────────────────────────────────────────┘
```

详见 [docs/ARCH.md](docs/ARCH.md)。

## 开发流程（遵循 CLAUDE.md）

所有代码变更必须遵循 [CLAUDE.md](CLAUDE.md) 的治理规则：

1. **规划**：调用万能激励引擎 + ralph skill 拆解任务。
2. **调研**：web-access 搜索 + tech-selection-researcher（涉及选型时）+ Context7（涉及 API/配置时）。
3. **探查**：code-archaeologist 理解现有代码。
4. **编码**：遵循 Karpathy Guidelines。
5. **自检**：变更影响自检清单。
6. **审查**：guardrail-enforcer 代码质量 + 安全审计。
7. **验收**：ac-verifier 分层测试 + 性能门禁 + 安全检查。
8. **提交**：Conventional Commits + GitHub Flow（功能分支 + Squash PR）。

风险分级（P0-P3）决定所需子 Agent 与文档，详见 [CLAUDE.md 第十六节](CLAUDE.md)。

## License

待定（项目处于设计阶段）。
