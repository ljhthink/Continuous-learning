# 文档与规则一致性审计报告 · P1-P3 里程碑

> 依据 CLAUDE.md §14.2，在 P3 里程碑闭合 + 依赖升级合并后执行专项一致性审计。
> 模板：[consistency-audit-template.md](../templates/consistency-audit-template.md)

## 元信息

| 项目 | 内容 |
| --- | --- |
| 审计日期 | 2026-07-24 |
| 审计范围 | P1（知识库核心）+ P2（MCP 接入）+ P3（持续进化）+ 依赖 MAJOR 升级（PR #9） |
| 审计员 | 主 Agent |
| 审计基线 | commit 991b262（PR #9 squash merge） |
| 任务令牌 | TKN-MILESTONE-AUDIT-001 |

## 1. ADR 与实际代码一致性

| ADR | 决策点 | 实际实现 | 一致性 | 偏差说明 |
| --- | --- | --- | --- | --- |
| ADR-001 | 七决策点技术栈（TS/Node/MCP/zod/js-yaml/obsidian/git） | server/ + 9 tools + stdio 传输 | ✅ | 无 |
| ADR-002 | 三 Agent 集成（Claude Code/Trae CN/OpenCode） | .mcp.json + .trae/mcp.json + opencode.json | ✅ | 无 |
| ADR-003 | GitHub Flow + 分支保护 | main 保护已启用（squash only + docs-quality 必需） | ✅ | 无 |
| ADR-004 | CI docs-quality（markdownlint + lychee + consistency-check） | .github/workflows/docs.yml 三 job | ✅ | 无 |
| ADR-005 | public 仓库 | github.com/ljhthink/Continuous-learning public | ✅ | 无 |
| ADR-006 | 持续进化闭环（config 函数化 + 两 tier + /dream 老化） | kb_write_experience + kb_promote_experience + dream.ts | ✅ | /dream 仅老化，去重/合并/质量评分见 D4 后续增强（已知） |
| ADR-007 | 依赖 MAJOR 升级 | zod 4.4.3 / js-yaml 5.2.1 / TS 7.0.2 / @types/node 26.1.1 / actions v7 | ✅ | DEF-002 @hono 路径不可达列为后续技术债（已知） |

## 2. PRD 功能完整性

| US | 验收标准 | 实现状态 | 测试状态 | 偏差 |
| --- | --- | --- | --- | --- |
| US-001 持续进化 | 6 项（5 完成 + 1 部分） | 5✅ + 1⚠️ | p3-evolution.test.ts 9 用例通过 | /dream 仅老化（ADR-006 D4 已声明） |
| US-002 外部 Agent 调用 | 5 项全完成 | 5✅ | P2 集成验收通过（人工半部分残留） | 无 |
| US-003 多领域分类 | 5 项全完成 | 5✅ | frontmatter/index/tags 验证通过 | 无 |
| US-004 GUI | 0 项（P4 未启动） | ❌ 未启动 | N/A | 符合规划（P4 阶段） |
| US-005 健康检查 | 3 项全完成 | 3✅ | lint.test.ts 7 用例通过 | 无 |
| US-006 检索质量基线 | 2 项（1 完成 + 1 部分） | 1✅ + 1⚠️ | 性能基线 p95 < 2s 满足 | qmd 未接入（当前 BM25+向量满足门禁） |

**结论**：US-004 为 P4 规划范围，未启动符合预期。US-001/US-006 的部分完成项均在对应 ADR 中明确声明为后续增强，非缺陷。

## 3. ARCH 与代码结构一致性

| 组件 | ARCH 描述 | 实际路径 | 一致性 |
| --- | --- | --- | --- |
| MCP Server | 9 个 tools，stdio 传输 | server/src/index.ts 注册 9 tools（kb_search/get_page/ingest_source/write_experience/promote_experience/list_categories/list_recent/lint/health） | ✅ |
| TypeScript | 7.x | package.json typescript@^7.0.2 | ✅ |
| 索引层 | index.md + log.md + frontmatter | wiki/ + index.md + log.md + frontmatter.ts | ✅ |
| 存储层 | markdown + git | wiki/*.md + git | ✅ |

## 4. 文档索引有效性

- [x] `README.md` 文档索引中每个相对链接指向的文件真实存在（consistency-check.js 验证通过）
- [x] `docs/decisions/README.md` 包含所有 `ADR-*.md`（7 个 ADR 全部登记）
- [x] `docs/templates/README.md` 包含所有 `*-template.md`（6 根模板 + 4 报告模板）
- [x] `docs/reports/` 报告命名基本符合 `YYYY-MM-DD-<task>-<type>.md`（见 §6 偏差 D4）

## 5. 引用链接可达性

- [x] ADR 中的引用链接可达（lychee CI 通过，run 30028452062 SUCCESS）
- [x] reports 中的链接可达（本轮修复 file:///D:/ 绝对路径 → ../../server/ 相对路径）

## 6. 发现的偏差与修复计划

| 偏差 | 严重度 | 修复项 | 状态 |
| --- | --- | --- | --- |
| D1: README.md「当前状态」写 P2 完成 + 8 tools + 31 测试（实际 P3 完成 + 9 tools + 45 测试） | 高 | 更新为 P3 完成 + 依赖升级完成 + 9 tools + 45 测试 | ✅ 已修复 |
| D2: 7 个 ADR 状态均「Proposed」，但已随 PR 合并，应为「Accepted」（§17.3） | 中 | ADR-001~007 status 字段 + decisions/README.md 索引 Proposed→Accepted | ✅ 已修复 |
| D3: PRD 验收复选框全未勾，与已通过验收报告不符 | 中 | US-001/002/003/005/006 已完成项勾选 [x]，部分完成项加注释 | ✅ 已修复 |
| D4: 4 个 R2 报告命名带 `-r2` 后缀，不符合严格 `{archaeology,guardrail,acceptance,debug,audit}` type 后缀 | 低 | consistency-check.js 宽松通过；R2 为「聚焦复审」合法场景，建议在模板约定中显式允许 `-rN` 后缀，不改名（避免破坏链接） | 📝 记录，不改名 |
| D5: ADR-001 关联文档链接误指向 `../templates/prd-template.md`（模板）而非 `../PRD.md`（实际文档） | 中 | 改为 `../PRD.md` / `../ARCH.md` | ✅ 已修复 |

## 7. 审计结论

- [x] **通过**：可进入下一里程碑（P4 GUI）

所有高/中严重度偏差（D1/D2/D3/D5）已修复并通过 markdownlint + consistency-check 验证。低严重度偏差 D4 记录在案，建议后续在模板约定中显式允许 R2 聚焦复审的 `-rN` 后缀，不强行改名以避免链接断裂。

**遗留技术债（非本次审计范围，已知）**：

- DEF-001/DEF-004：TOCTOU 竞态（kb_write_experience 重复检测），低严重度，修复方案 `fs.writeFile flag:'wx'`
- DEF-002：`@hono/node-server` 路径遍历，stdio 不可达，需等 `@modelcontextprotocol/sdk` 升级
- PERF-001：lint-perf 测试阈值 flaky（p50 1000ms 受 I/O 噪声），PRD 门禁 p95<2s 仍满足
- ADR-006 D4：`/dream` 去重/合并/质量评分未实现，仅老化

**下一步建议**：本审计已闭合，建议进入「激活真实知识库」阶段——ingest 项目自身决策与 P1-P3 经验为首批真实 wiki 内容，跑通端到端 ingest/query/lint/经验沉淀闭环，用真实数据验证工作流。
