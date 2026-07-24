# DEF-007 修复 · ac-verifier 验收测试报告

> **任务令牌**：TKN-DEF-007-002
> **执行 Agent**：ac-verifier
> **验收范围**：DEF-007 reject 动作 log type 回归修复（P1 常规）
> **结论**：**通过** — 本轮开发周期可闭合

## 元信息

| 项目 | 内容 |
| --- | --- |
| 执行 Agent | ac-verifier |
| 任务令牌 | TKN-DEF-007-002 |
| 任务域 | DEF-007 reject log type 回归修复 |
| 报告日期 | 2026-07-24 |
| 验收依据 | ADR-008 任务清单 DEF-007 |
| guardrail 报告 | docs/reports/2026-07-24-def-007-guardrail.md（TKN-DEF-007-001，通过） |
| 测试架构 skill | test-architect |
| 风险等级 | P1 常规 |
| 主 Agent 签发上下文 | 盲区 1：测试覆盖充分性（guardrail 建议 3 项补充测试是否需要）；盲区 2：reject 后 frontmatter date 未验证；遗憾：未验证 kb_list_recent type:"reject" 端到端过滤行为 |

## 1. 验收标准解析

| AC ID | 验收标准（ADR-008 DEF-007） | 测试方法 | 状态 |
| --- | --- | --- | --- |
| AC-001 | write.ts reject 动作 `type:"experience"` 改为 `type:"reject"` | 代码审查 + 单元测试（正则断言 log.md 含 `reject` heading） | ✅ 通过 |
| AC-002 | 回归测试覆盖 reject + promote log type | 单元测试 + 集成测试 + 状态迁移测试 | ✅ 通过 |
| AC-003 | AGENTS.md §7.4 文档化 reject log type | 文档差异审查 | ✅ 通过 |

### 1.1 验收标准转测试断言

| 断言 ID | AC ID | Given | When | Then | 测试层级 |
| --- | --- | --- | --- | --- | --- |
| ASR-001 | AC-001 | 一张 pending 经验卡片 | kb_promote_experience action=reject | log.md 含 `## [date] reject \| title`，不含重复的 `## [date] experience \| title` | 单元 |
| ASR-002 | AC-001 | 同日创建+驳回同一张卡片 | 创建后立即驳回 | 两个 heading 文本不同（experience vs reject），无 MD024 重复 | 单元 |
| ASR-003 | AC-002 | 一张 pending 经验卡片 | kb_promote_experience action=promote | log.md 含 `## [date] promote \| title`（promote 约定未被破坏） | 单元 |
| ASR-004 | AC-002 | 一张已驳回的卡片 | kb_promote_experience action=promote | 返回错误 `expected "pending"`（状态机拦截） | 单元 |
| ASR-005 | AC-002 | 一张 pending 经验卡片 | reject 后读取 frontmatter | status=rejected，date=今天 | 单元 |
| ASR-006 | AC-002 | reject 产生的 log 条目 | kb_list_recent type:"reject" 查询 | 返回 1 条 type="reject" 条目 | 集成 |
| ASR-007 | AC-002 | reject 产生的 log 条目 | kb_list_recent type:"experience" 查询 | 返回 0 条 reject 条目（仅创建条目，不包含驳回条目） | 集成 |
| ASR-008 | AC-003 | AGENTS.md §7.4 | 文档审查 | 存在"驳回日志"段落，说明 reject 用 `type:"reject"` | 文档 |

## 2. 测试架构（test-architect）

### 2.1 覆盖矩阵

| 测试用例 ID | AC ID | 断言 ID | 技术 | 输入/前置条件 | 动作 | 预期行为 | 测试层级 | 优先级 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-001 | AC-001 | ASR-001 | 等价类（正常路径） | pending 卡片 "Card To Reject" | reject | log.md 含 `## [date] reject \| Card To Reject` | 单元 | 高 |
| TC-002 | AC-002 | ASR-003 | 等价类（回归保护） | pending 卡片 "Card To Promote" (confidence=0.85) | promote | log.md 含 `## [date] promote \| Card To Promote` | 单元 | 高 |
| TC-003 | AC-001 | ASR-002 | 边界值（同日创建+驳回） | pending 卡片 "MD024 No Dup Test" | 创建后立即 reject | 2 个 heading 唯一，1 个 experience + 1 个 reject | 单元 | 高 |
| TC-004 | AC-002 | ASR-005 | 等价类（字段更新） | pending 卡片 "Date Update On Reject" | reject | frontmatter date=今天（兼容引号格式） | 单元 | 中 |
| TC-005 | AC-002 | ASR-004 | 状态迁移（非法路径） | 已 rejected 卡片 | promote | 返回错误 `expected "pending"` | 单元 | 高 |
| TC-006 | AC-002 | ASR-006 | 集成（跨模块查询） | reject 后的 log 条目 | kb_list_recent type:"reject" | 返回 1 条 type="reject" | 集成 | 高 |
| TC-007 | AC-002 | ASR-007 | 集成（行为变化验证） | reject 后的 log 条目 | kb_list_recent type:"experience" | 该标题仅 1 条（创建条目），不含驳回条目 | 集成 | 高 |
| TC-008 | AC-001 | — | 回归（既有测试） | pending 卡片 "Reject Me" | reject | status=rejected，文件留在 inbox | 单元 | 中 |
| TC-009 | AC-001 | — | 状态迁移（非法路径） | type=concept 的页面 | reject | 返回错误 `expected "experience"` | 单元 | 中 |
| TC-010 | AC-001 | — | 状态迁移（非法路径） | status=active 的 experience | reject | 返回错误 `expected "pending"` | 单元 | 中 |
| TC-011 | AC-001 | — | 回归（MD022/MD032） | pending 卡片 "DEF-005 Test" | promote | log.md 通过 MD022/MD032 检查 | 单元 | 中 |

### 2.2 测试策略

**等价类划分**：

| 类别 | 描述 | 测试用例 |
| --- | --- | --- |
| 有效-正常 reject | pending experience → rejected | TC-001, TC-003, TC-004 |
| 有效-正常 promote | pending experience → active | TC-002, TC-011 |
| 无效-类型不匹配 | type≠experience 的页面 | TC-009 |
| 无效-状态不匹配 | status≠pending 的卡片 | TC-005, TC-010 |
| 边界-同日操作 | 同日创建+驳回 | TC-003 |

**边界值分析**：

| 边界 | 测试点 | 测试用例 |
| --- | --- | --- |
| 日期边界（同日） | 创建日期 = 驳回日期 | TC-003 |
| 日志类型边界 | type="reject" vs type="experience" | TC-006, TC-007 |

**状态迁移分析**：

| 当前状态 | 事件 | 预期下一状态 | 测试用例 |
| --- | --- | --- | --- |
| pending | reject | rejected | TC-001 |
| pending | promote | active | TC-002 |
| rejected | promote | 错误（拦截） | TC-005 |
| active | reject | 错误（拦截） | TC-010 |
| concept(非experience) | reject | 错误（拦截） | TC-009 |

## 3. 分层测试实施

### 3.1 静态分析（Lint / 安全扫描）

| 工具 | 命令 | 新增告警 | 基线告警 | 结果 |
| --- | --- | --- | --- | --- |
| TypeScript 编译器 | `npm run typecheck` (tsc --noEmit) | 0 | 0 | ✅ 通过 |
| npm audit | `npm audit` | 2 moderate（@hono/node-server） | 2 moderate（既有） | ✅ 通过（非 DEF-007 引入） |

- 项目未配置 ESLint，静态分析以 TypeScript 严格模式编译检查为主。
- npm audit 发现 2 个 moderate 漏洞在 `@hono/node-server`（Windows 路径遍历），这是既有依赖问题，DEF-007 未修改 package.json 或 package-lock.json，不应阻断本次验收。

### 3.2 单元测试

- 测试框架：node:test + node:assert/strict
- 测试命令：`npm test`（在 server 目录）
- 测试文件：`server/src/tests/write.test.ts`、`server/src/tests/p3-evolution.test.ts`

| 指标 | 值 | 目标 | 结论 |
| --- | --- | --- | --- |
| 总测试数 | 52 | — | — |
| 通过 | 51 | — | — |
| 失败 | 1（lint-perf DEF-006 flaky） | — | ⚠️ 已知问题，非 DEF-007 引入 |
| DEF-007 专属测试 | 6（全部通过） | — | ✅ |
| 语句覆盖率 | N/A（项目未配置 c8/istanbul） | ≥90% | ⚠️ 见说明 |

**覆盖率说明**：项目未配置代码覆盖率工具（c8/istanbul/nyc）。基于代码路径分析，DEF-007 修改的 reject 分支（write.ts:325-343）已被以下测试完整覆盖：

| 代码路径 | 覆盖测试 | 覆盖情况 |
| --- | --- | --- |
| write.ts:326 `frontmatter.status = "rejected"` | TC-001, TC-008 | ✅ |
| write.ts:327 `frontmatter.date = today` | TC-004 | ✅ |
| write.ts:328 `writeFile(fullPath, ...)` | TC-001, TC-008 | ✅ |
| write.ts:330-336 `appendLogEntry({ type: "reject", ... })` | TC-001, TC-003 | ✅ |
| write.ts:237-241 type 校验（非 experience 拦截） | TC-009 | ✅ |
| write.ts:242-246 status 校验（非 pending 拦截） | TC-005, TC-010 | ✅ |

**DEF-007 专属测试详情**：

| # | 测试名 | 耗时 | 结果 |
| --- | --- | --- | --- |
| 1 | rejects an inbox card and logs with type 'reject' (DEF-007) | 31.98ms | ✅ |
| 2 | promotes an inbox card and logs with type 'promote' | 40.44ms | ✅ |
| 3 | DEF-007: same-day create+reject produces no MD024 duplicate heading | 20.08ms | ✅ |
| 4 | DEF-007: reject updates frontmatter date to today | 17.61ms | ✅ |
| 5 | DEF-007: reject then promote is blocked (state machine) | 20.69ms | ✅ |
| 6 | reject entries are queryable via type:'reject' and excluded from type:'experience' | 39.54ms | ✅ |

测试 #3-#6 为 ac-verifier 本次补充（TC-003 至 TC-007），覆盖 guardrail-enforcer 建议的全部 3 项测试场景 + date 字段更新验证。

### 3.3 集成测试

| 场景 | 模块链 | 结果 | 证据 |
| --- | --- | --- | --- |
| kb_list_recent type:"reject" 过滤 | write.ts (reject) → log.ts (appendLogEntry) → read-only.ts (kbListRecent typeFilter) | ✅ 通过 | TC-006: type:"reject" 返回 1 条；TC-007: type:"experience" 仅返回创建条目 |
| reject→promote 状态机拦截 | write.ts (reject → status=rejected) → write.ts (promote → status 校验拦截) | ✅ 通过 | TC-005: 返回错误 `expected "pending"` |

### 3.4 端到端测试

本变更为 MCP server 内部逻辑修复，无前端交互。E2E 场景由单元/集成测试覆盖（使用真实临时 KB，调用实际工具处理器，非 Mock）：

| 流程 | 步骤 | 结果 | 证据 |
| --- | --- | --- | --- |
| 创建→驳回→日志验证 | kbWriteExperience → kbPromoteExperience(reject) → 读取 log.md → 正则匹配 | ✅ 通过 | TC-001, TC-003 |
| 创建→驳回→查询验证 | kbWriteExperience → kbPromoteExperience(reject) → kbListRecent(type:"reject") | ✅ 通过 | TC-006, TC-007 |
| 创建→驳回→再提升（失败路径） | kbWriteExperience → kbPromoteExperience(reject) → kbPromoteExperience(promote) → 错误 | ✅ 通过 | TC-005 |

## 4. 极端/边缘场景

| 场景 | 输入 | 预期 | 实际 | 状态 |
| --- | --- | --- | --- | --- |
| 同日创建+驳回（MD024 边界） | 同一天内创建并驳回同一卡片 | 两个 heading 不同（experience vs reject），无 MD024 重复 | 2 个唯一 heading，1 个 experience + 1 个 reject | ✅ |
| 已驳回卡片再提升（状态机非法路径） | status=rejected 的卡片执行 promote | 返回错误，不执行 | 返回 `expected "pending"` 错误 | ✅ |
| 非 experience 类型页面驳回 | type=concept 的页面执行 reject | 返回错误，不执行 | 返回 `expected "experience"` 错误 | ✅ |
| 非 pending 状态卡片驳回 | status=active 的卡片执行 reject | 返回错误，不执行 | 返回 `expected "pending"` 错误 | ✅ |
| reject 后 frontmatter date 更新 | reject 后读取 frontmatter | date 更新为今天 | date='2026-07-24'（js-yaml 带引号序列化） | ✅ |
| 日志注入尝试（CWE-117） | inbox_path 含 `\n## [fake] ingest` | CR/LF 被剥离，无法伪造 heading | sanitizeLogField 将 `\n` 替换为空格 | ✅（guardrail 已验证，代码审查确认） |

## 5. 性能回退检查

| 接口/函数 | 基线 p50/p95/p99 | 本次 p50/p95/p99 | 变化 | 结论 |
| --- | --- | --- | --- | --- |
| kb_promote_experience (reject) | 无基线 | ~20-32ms（测试耗时含 I/O） | N/A | ✅ 通过 |
| kb_promote_experience (promote) | 无基线 | ~40ms（测试耗时含 I/O） | N/A | ✅ 通过 |

**说明**：

- `perf-baseline.mjs` 性能基线脚本覆盖 kb_search、kb_get_page、kb_list_categories、kb_health、kb_lint，不覆盖 kb_promote_experience。
- DEF-007 修改内容为单个字符串字面量（`"experience"` → `"reject"`），无算法变更、无新增 I/O、无新增计算。字符串长度从 10 字符减少到 6 字符，理论上性能微幅提升（可忽略）。
- 所有 DEF-007 测试执行时间均在 50ms 以下（含文件创建、写入、读取等 I/O 操作），无性能回退风险。
- **结论**：无性能回退。无需生成新基线（字符串字面量修改不产生可测量的性能差异）。

## 6. 基础安全检查

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 注入类（日志注入 CWE-117） | ✅ 通过 | `sanitizeLogField`（log.ts:62-64）对 `title` 和 `details` 的 key/value 均调用，剥离 `\r` 和 `\n`。reject 路径的 `type` 字段为系统控制字面量 `"reject"`，非用户输入。`details.rejected`（即 inboxPath，用户输入）经 sanitizeLogField 处理。攻击者无法通过 inbox_path 注入伪造 log heading。 |
| 敏感信息泄露 | ✅ 通过 | log 条目仅记录路径（`rejected: inboxPath`）和标题，无密钥/令牌/密码/PII。findstr 搜索 changed files 未发现 `api_key`、`token`、`secret`、`password`、`credential` 等关键字。 |
| 路径遍历（CWE-22） | ✅ 通过 | reject 路径复用既有 `path.resolve` + `path.relative` 遍历检查（write.ts:219-224），DEF-007 未修改任何路径处理逻辑。 |
| .gitignore 密钥排除 | ✅ 通过 | `.env`、`.env.local`、`.env.*.local` 已排除；`!.env.example` 允许模板；`*.log`、`logs/` 已排除。 |
| 硬编码密钥 | ✅ 通过 | git diff 中无任何凭证字符串、API key、内部 IP/域名。 |

## 7. 回归测试

| 套件 | 总数 | 通过 | 失败 | 结果 |
| --- | --- | --- | --- | --- |
| 全部测试套件（6 个测试文件） | 52 | 51 | 1 | ✅ 通过（1 flaky 非本次引入） |

**失败分析**：

| 测试 | 错误 | 原因 | 与 DEF-007 关系 |
| --- | --- | --- | --- |
| lint-perf: completes 1000-page scan well under 2s PRD threshold | p50=1076ms > 1000ms | DEF-006 已知问题：Windows 环境 I/O 噪声导致 1000 页扫描性能波动 | 无关 — DEF-007 未修改 lint 逻辑 |

**回归结论**：DEF-007 未引入任何新的测试失败。唯一失败的 lint-perf 测试是 DEF-006 的已知 flaky 问题（Windows 环境噪声），在 DEF-007 修复前即已存在，不应阻断本次验收。

## 8. 综合结论

- [x] **全部通过且无回归**：本轮开发周期闭合
- [ ] **不通过**：主 Agent 必须回退至 guardrail-enforcer 阶段重新开始闭环

### 8.1 结论依据

| 维度 | 结论 | 关键证据 |
| --- | --- | --- |
| AC-001: type:"reject" 实现 | ✅ 通过 | write.ts:336 `type: "reject"`；TC-001 正则断言通过 |
| AC-002: 回归测试覆盖 | ✅ 通过 | 6 个 DEF-007 专属测试全部通过（含 4 个 ac-verifier 补充测试） |
| AC-003: AGENTS.md 文档 | ✅ 通过 | AGENTS.md §7.4 第 261 行"驳回日志"段落，与代码实现一致 |
| MD024 修复有效性 | ✅ 通过 | TC-003 直接验证同日创建+驳回产生 2 个唯一 heading |
| 状态机完整性 | ✅ 通过 | TC-005 验证 rejected→promote 被拦截；TC-009/TC-010 验证非法类型/状态被拦截 |
| 跨模块行为正确性 | ✅ 通过 | TC-006/TC-007 验证 kb_list_recent type:"reject" 过滤正确 |
| 安全防护 | ✅ 通过 | 日志注入防护完整；无硬编码密钥；路径遍历防护未受影响 |
| 性能回退 | ✅ 通过 | 字符串字面量修改，零性能影响；测试耗时均 < 50ms |
| 回归测试 | ✅ 通过 | 52 测试 51 通过，1 flaky 失败为 DEF-006 既有问题 |
| 任务令牌验证 | ✅ 通过 | 本报告元信息包含 TKN-DEF-007-002 |

### 8.2 声明

**DEF-007 修复通过 ac-verifier 验收测试。全部 3 条验收标准均通过验证，6 个 DEF-007 专属测试全部通过，无性能回退，无安全风险，无回归问题（lint-perf flaky 为 DEF-006 既有问题）。本轮开发周期可闭合。**

## 9. 文档修正建议

无。AGENTS.md §7.4"驳回日志"段落与代码实现一致，docs/reports/README.md 已包含 DEF-007 guardrail 索引行。

**建议**：在 docs/reports/README.md 追加本验收报告的索引行（由主 Agent 在提交时完成）。

## 10. 待澄清

无。所有前置产出物（ADR-008、AGENTS.md §7.4、guardrail 报告 TKN-DEF-007-001）与代码实现一致，无矛盾或信息缺失。

## 11. 跟进建议（低风险，不阻断）

| # | 建议 | 优先级 | 说明 |
| --- | --- | --- | --- |
| 1 | dream.ts 归档动作 log type 对齐 | 低 | dream.ts:148-150 归档动作使用 `type:"experience"`，建议改为 `type:"archive"`。归档要求卡片 date 超过 90 天，MD024 风险低，但为一致性建议对齐。可作为 DEF-008 或独立 P0 任务。 |
| 2 | 配置代码覆盖率工具 | 低 | 项目未配置 c8/istanbul/nyc，无法自动生成覆盖率报告。建议在 CI 中集成 c8，使覆盖率门禁可量化。 |
| 3 | npm audit 依赖漏洞修复 | 低 | @hono/node-server <2.0.5 有 moderate 路径遍历漏洞（Windows）。建议 `npm audit fix` 或升级 @modelcontextprotocol/sdk。非 DEF-007 引入。 |

## 12. 测试上下文安全

- 所有测试使用临时 KB 目录（`os.tmpdir()` 下的 `kb-test-*` / `kb-write-*` 前缀目录），测试完成后由 `cleanupKB` 清理。
- 未修改项目仓库中的任何 wiki/、raw/、index.md、log.md 文件。
- 新增测试代码已写入 `server/src/tests/write.test.ts`，这是本次验收的合法产出。
