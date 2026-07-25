# 架构决策记录（ADR）索引

本目录记录本项目所有架构决策，遵循 [ADR-NNN-<short-title>.md] 命名规范。

生命周期：`Proposed → Accepted → Deprecated / Superseded`

## ADR 列表

| 编号 | 标题 | 状态 | 日期 |
| --- | --- | --- | --- |
| [ADR-001](ADR-001-knowledge-base-tech-stack.md) | 持续进化个人知识库系统整体技术栈 | Accepted | 2026-07-22 |
| [ADR-002](ADR-002-mcp-client-integration.md) | MCP 客户端集成策略（Claude Code / Trae CN / OpenCode） | Accepted | 2026-07-23 |
| [ADR-003](ADR-003-vcs-github-flow-branch-protection.md) | VCS + GitHub Flow + 分支保护策略 | Accepted | 2026-07-23 |
| [ADR-004](ADR-004-ci-docs-quality-workflow.md) | CI docs-quality workflow（markdownlint + lychee + consistency-check） | Accepted | 2026-07-23 |
| [ADR-005](ADR-005-public-vs-private-repository.md) | public 仓库决策（vs private + Pro） | Accepted | 2026-07-23 |
| [ADR-006](ADR-006-continuous-evolution-loop.md) | 持续进化闭环（config 函数化 + 两 tier 审核门禁 + /dream 老化） | Accepted | 2026-07-23 |
| [ADR-007](ADR-007-dependency-major-upgrade.md) | 依赖 MAJOR 升级（zod 3→4 / js-yaml 4→5 / TypeScript 5→7 / @types/node 22→26 / actions v4→v7） | Accepted | 2026-07-23 |
| [ADR-008](ADR-008-kb-content-layering-and-format-unification.md) | 知识库内容分层与格式统一（experiences 表头修复 + kb-system 领域拆分 + thealgorithms 深化） | Accepted | 2026-07-24 |
| [ADR-009](ADR-009-resources-and-design-domains.md) | 新建 resources 与 design 领域 + TheAlgorithms/素材资源沉淀策略 | Accepted | 2026-07-25 |
| [ADR-010](ADR-010-ci-file-absolute-path-detection.md) | CI 新增 file:/// 绝对路径检测门禁 | Accepted | 2026-07-25 |
| [ADR-011](ADR-011-duplicate-detection-and-quality-scoring.md) | 经验卡重复检测与质量评分（Levenshtein + Sorensen-Dice + 4 维度 rubric） | Proposed | 2026-07-26 |

<!-- 新增 ADR 时在此追加一行，并保证文件名以 ADR-NNN- 开头 -->
