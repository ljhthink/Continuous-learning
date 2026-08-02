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

本项目处于 **P6+ 缺失功能补全完成阶段**（Karpathy LLM Wiki 模式实现度约 92%）。当前已落地 **17 个 MCP tools**（含 auto-xref 自动交叉引用、kb_write_answer 答案回写、kb_organize_staging LLM 整理、checkMissingConcept 缺失概念页检测），RAG 中文检索 + LLM 分类已修复，审核页/领域管理已落地，CI 定时维护（每日 lint + 每周 /dream）已就位。详见 [Karpathy 实现度分析报告 V2](docs/reports/2026-08-02-karpathy-implementation-analysis-v2.md)。在 P1/P2/P3 基础上（持续进化闭环 + 两 tier 审核门禁 + /dream 三阶段维护 + 6 个 Dependabot MAJOR 依赖升级），P4-P6 完成了 Tauri GUI、Python parser、staging 工作流、LLM 三态集成、RAG 修复、缺失功能补全。剩余 8% 缺口为 Karpathy 自述 optional 项（qmd/LanceDB/Web Clipper/Marp）+ Schema 层已同步。下一阶段按规模自适应策略演进。

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
| [docs/decisions/ADR-008-kb-content-layering-and-format-unification.md](docs/decisions/ADR-008-kb-content-layering-and-format-unification.md) | Explanation | 知识库内容分层与格式统一（experiences 表头修复 + kb-system 领域拆分 + thealgorithms 深化） |
| [docs/decisions/ADR-009-resources-and-design-domains.md](docs/decisions/ADR-009-resources-and-design-domains.md) | Explanation | 新建 resources 与 design 领域 + TheAlgorithms/素材资源沉淀策略 |
| [docs/decisions/ADR-010-ci-file-absolute-path-detection.md](docs/decisions/ADR-010-ci-file-absolute-path-detection.md) | Explanation | CI 新增 file:/// 绝对路径检测门禁 |
| [docs/decisions/ADR-011-duplicate-detection-and-quality-scoring.md](docs/decisions/ADR-011-duplicate-detection-and-quality-scoring.md) | Explanation | 经验卡重复检测与质量评分（Levenshtein + Sorensen-Dice + 4 维度 rubric） |
| [docs/decisions/ADR-012-p4-gui-tech-stack.md](docs/decisions/ADR-012-p4-gui-tech-stack.md) | Explanation | P4 GUI 技术栈（Tauri v2 + React + Vite + TailwindCSS） |
| [docs/decisions/ADR-013-p4-llm-integration-strategy.md](docs/decisions/ADR-013-p4-llm-integration-strategy.md) | Explanation | P4 LLM 集成策略（三态切换 + 延迟到 P5 接入） |
| [docs/decisions/ADR-014-p4-python-parser-and-staging-workflow.md](docs/decisions/ADR-014-p4-python-parser-and-staging-workflow.md) | Explanation | P4 Python parser 与 staging 工作流（pymupdf + Tauri IPC + MCP 工具） |
| [docs/integration/mcp-clients.md](docs/integration/mcp-clients.md) | How-to | MCP 客户端集成指南 |
| [docs/reports/README.md](docs/reports/README.md) | Reference | 运行时报告索引 |
| [docs/reports/2026-07-22-knowledge-base-tech-selection.md](docs/reports/2026-07-22-knowledge-base-tech-selection.md) | Reference | 技术选型对比分析报告（选型依据） |
| [docs/reports/2026-08-01-p5-r2-archaeology.md](docs/reports/2026-08-01-p5-r2-archaeology.md) | Reference | P5-R2 源码考古报告（9 问题根因分析） |
| [docs/reports/2026-08-01-p5-r2-solution-design.md](docs/reports/2026-08-01-p5-r2-solution-design.md) | Reference | P5-R2 方案设计文档（修复方案与实施顺序） |
| [docs/reports/2026-08-01-p5-r2-subagent-reflection.md](docs/reports/2026-08-01-p5-r2-subagent-reflection.md) | Reference | P5-R2 子 Agent 审核漏问题反思与流程改进 |
| [docs/reports/2026-08-01-p5-r3-archaeology-and-solution.md](docs/reports/2026-08-01-p5-r3-archaeology-and-solution.md) | Reference | P5-R3 考古与方案（API key 持久化、模型配置、图谱刷新） |
| [docs/reports/2026-08-01-p5-r3-guardrail.md](docs/reports/2026-08-01-p5-r3-guardrail.md) | Reference | P5-R3 安全与质量审计报告 |
| [docs/reports/2026-08-01-p5-r3-acceptance.md](docs/reports/2026-08-01-p5-r3-acceptance.md) | Reference | P5-R3 验收测试报告 |
| [docs/reports/2026-08-01-p5-r4-archaeology-and-solution.md](docs/reports/2026-08-01-p5-r4-archaeology-and-solution.md) | Reference | P5-R4 考古与方案（LLM 大文件截断 + 知识图谱不显示） |
| [docs/reports/2026-08-01-p5-r4-guardrail.md](docs/reports/2026-08-01-p5-r4-guardrail.md) | Reference | P5-R4 安全与质量审计报告 |
| [docs/reports/2026-08-01-p5-r4-acceptance.md](docs/reports/2026-08-01-p5-r4-acceptance.md) | Reference | P5-R4 验收测试报告 |
| [docs/reports/2026-08-01-p6-llm-enhancements-archaeology.md](docs/reports/2026-08-01-p6-llm-enhancements-archaeology.md) | Reference | P6 LLM 增强源码考古报告（流式/重试/分类/RAG 现状基线） |
| [docs/reports/2026-08-01-p6-llm-enhancements-decision-plan.md](docs/reports/2026-08-01-p6-llm-enhancements-decision-plan.md) | Reference | P6 LLM 增强决策计划（7 需求可行性 + 2 异议 + 实施方案，已审批） |
| [docs/reports/2026-08-01-p6-guardrail.md](docs/reports/2026-08-01-p6-guardrail.md) | Reference | P6 安全与质量审计报告（10 项盲区全验证，通过） |
| [docs/reports/2026-08-01-p6-acceptance.md](docs/reports/2026-08-01-p6-acceptance.md) | Reference | P6 验收测试报告（283 单元 + 5/6 E2E + 6 安全，有条件通过） |
| [docs/reports/2026-08-01-p6-def001-guardrail.md](docs/reports/2026-08-01-p6-def001-guardrail.md) | Reference | P6 DEF-001 增量安全审计报告（成本控制 UI 补齐，识别 H-1/H-2 阻断项） |
| [docs/reports/2026-08-01-p6-r4-h1h2-fix-guardrail.md](docs/reports/2026-08-01-p6-r4-h1h2-fix-guardrail.md) | Reference | P6-R4 H-1/H-2 修复安全审计报告（闭包陷阱 + 输入上限验证，通过） |
| [docs/reports/2026-08-01-p6-r4-h1h2-fix-acceptance.md](docs/reports/2026-08-01-p6-r4-h1h2-fix-acceptance.md) | Reference | P6-R4 H-1/H-2 修复验收测试报告（315 测试 + 6 Playwright 运行时，全部通过） |
| [docs/reports/2026-08-02-rag-classify-archaeology.md](docs/reports/2026-08-02-rag-classify-archaeology.md) | Reference | RAG 检索失效 + LLM 分类未触发源码考古报告（CJK 分词 + stale closure 根因 + 联网案例研究） |
| [docs/reports/2026-08-02-rag-classify-fix-guardrail.md](docs/reports/2026-08-02-rag-classify-fix-guardrail.md) | Reference | RAG 检索 + LLM 分类修复安全与质量审计（0 阻断 + 2 中风险非阻断，通过） |
| [docs/reports/2026-08-02-rag-classify-fix-acceptance.md](docs/reports/2026-08-02-rag-classify-fix-acceptance.md) | Reference | RAG 检索 + LLM 分类修复验收测试（197 服务端 + 283 前端 + 6 Playwright，有条件通过） |
| [docs/reports/2026-08-02-karpathy-implementation-analysis.md](docs/reports/2026-08-02-karpathy-implementation-analysis.md) | Reference | Karpathy LLM Wiki 模式实现度分析报告 V1（59 项功能点逐项核验，实现度约 75%，修复前基线） |
| [docs/reports/2026-08-02-karpathy-implementation-analysis-v2.md](docs/reports/2026-08-02-karpathy-implementation-analysis-v2.md) | Reference | Karpathy LLM Wiki 模式实现度分析报告 V2（修复后复审，实现度约 92%，识别 Schema 层同步债务） |
| [docs/reports/2026-08-02-missing-features-solution.md](docs/reports/2026-08-02-missing-features-solution.md) | Reference | Karpathy 缺失功能补全方案设计（6 项：文档对齐/定时维护/auto-xref/答案回写/概念检测/LLM整理） |
| [docs/reports/2026-08-02-missing-features-guardrail.md](docs/reports/2026-08-02-missing-features-guardrail.md) | Reference | 缺失功能补全安全与质量审计（0 阻断 + 0 高危 + 2 中危 M-1/M-2 已修复，通过） |
| [docs/reports/2026-08-02-missing-features-acceptance.md](docs/reports/2026-08-02-missing-features-acceptance.md) | Reference | 缺失功能补全验收测试（6/6 AC 通过 + 215 单元 + 16 新增测试，DEFECT-1 已修复） |
| [docs/reports/2026-08-02-review-domain-archaeology.md](docs/reports/2026-08-02-review-domain-archaeology.md) | Reference | 审核页/LLM 新领域建议/领域管理 源码考古与方案设计（3 问题根因 + 联网案例 + 方案） |
| [docs/reports/2026-08-02-review-domain-guardrail.md](docs/reports/2026-08-02-review-domain-guardrail.md) | Reference | 审核页/领域管理 R1 安全与质量审计（0 阻断 + 2 中风险 MED-1/MED-2，通过有条件） |
| [docs/reports/2026-08-02-review-domain-guardrail-r2.md](docs/reports/2026-08-02-review-domain-guardrail-r2.md) | Reference | 审核页/领域管理 R2 修复 delta 复审（MED-1/MED-2/LOW-3/LOW-4 修复后通过） |
| [docs/reports/2026-08-02-review-domain-acceptance.md](docs/reports/2026-08-02-review-domain-acceptance.md) | Reference | 审核页/领域管理验收测试（35/35 AC 通过 + 547 单元 + 5 E2E + 10 安全，通过） |
| [docs/templates/README.md](docs/templates/README.md) | How-to | 文档模板索引 |

### 治理与自动化

| 文件 | 说明 |
| --- | --- |
| [scripts/consistency-check.js](scripts/consistency-check.js) | 文档一致性检查脚本（CI 必需） |
| [scripts/hooks-deps-guard.js](scripts/hooks-deps-guard.js) | React Hooks 依赖数组守卫脚本（阻断 eslint-disable 压制 react-hooks 规则，CI 必需） |
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
│  L3 访问层：MCP Server（17 tools）         │
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
