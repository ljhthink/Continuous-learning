# 架构决策记录（ADR）索引

本目录记录本项目所有架构决策，遵循 [ADR-NNN-<short-title>.md] 命名规范。

生命周期：`Proposed → Accepted → Deprecated / Superseded`

## ADR 列表

| 编号 | 标题 | 状态 | 日期 |
| --- | --- | --- | --- |
| [ADR-001](ADR-001-knowledge-base-tech-stack.md) | 持续进化个人知识库系统整体技术栈 | Proposed | 2026-07-22 |
| [ADR-002](ADR-002-mcp-client-integration.md) | MCP 客户端集成策略（Claude Code / Trae CN / OpenCode） | Proposed | 2026-07-23 |
| [ADR-003](ADR-003-vcs-github-flow-branch-protection.md) | VCS + GitHub Flow + 分支保护策略 | Proposed | 2026-07-23 |
| [ADR-004](ADR-004-ci-docs-quality-workflow.md) | CI docs-quality workflow（markdownlint + lychee + consistency-check） | Proposed | 2026-07-23 |
| [ADR-005](ADR-005-public-vs-private-repository.md) | public 仓库决策（vs private + Pro） | Proposed | 2026-07-23 |
| [ADR-006](ADR-006-continuous-evolution-loop.md) | 持续进化闭环（config 函数化 + 两 tier 审核门禁 + /dream 老化） | Proposed | 2026-07-23 |
| [ADR-007](ADR-007-dependency-major-upgrade.md) | 依赖 MAJOR 升级（zod 3→4 / js-yaml 4→5 / TypeScript 5→7 / @types/node 22→26 / actions v4→v7） | Proposed | 2026-07-23 |

<!-- 新增 ADR 时在此追加一行，并保证文件名以 ADR-NNN- 开头 -->
