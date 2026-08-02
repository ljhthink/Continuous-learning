# Karpathy 缺失功能补全 · 正式验收报告

| 项目 | 内容 |
| --- | --- |
| 任务令牌 | TKN-KARPATHY-FIX-002 |
| 验收 Agent | 验收标准验证器（ac-verifier） |
| 日期 | 2026-08-02 |
| 验收范围 | 缺失功能补全迭代（6 项 AC：AC-1 ~ AC-6） |
| 上游方案 | [2026-08-02-missing-features-solution.md](2026-08-02-missing-features-solution.md) |
| 上游护栏 | [2026-08-02-missing-features-guardrail.md](2026-08-02-missing-features-guardrail.md)（PASS） |
| 引用规约 | 全文使用相对路径引用代码（ADR-010，禁止 `file:///` 绝对路径） |
| 治理依据 | CLAUDE.md §7.2 审查-测试闭环、§11 ac-verifier |
| 修订记录 | 2026-08-02 R2：DEFECT-1 已修复（见 §6.1 修复后复审），测试数 213→215，CLI 4/4 通过 |

---

## 1. 执行摘要

### 1.1 总体结论

**最终裁定：PASS**

6 项验收标准（AC-1 ~ AC-6）的**核心判定全部通过**。所有功能均已实现并通过分层测试（单元测试 215 pass / 0 fail、TypeScript 零错误、一致性检查通过、CLI 真实运行时验证 4/4 通过）。安全护栏审计 PASS，无阻断/高危漏洞。

初版验收发现的 1 项非阻断缺陷（DEFECT-1：`kb_organize_staging` 未在 CLI 子进程桥接注册）**已在 R2 修复**——`cli.ts` 的 TOOL_REGISTRY / SCHEMA_REGISTRY 均已补齐该工具条目，并新增 cli.ts 入口点守卫（`pathToFileURL` + try/catch）+ 2 项 CLI registry 回归测试。修复后 4/4 工具 CLI 运行时验证通过，无遗留缺陷。

### 1.2 验收范围说明

本迭代变更仅为**服务端 MCP tools + CI workflow + 文档**，无前端/Tauri 改动（DropZone/LLM 整理按钮属前序已验收迭代）。因此按用户要求，**未**启动 Tauri dev server 或运行 Playwright（无可验证的前端场景）。运行时验证通过 CLI 子进程对真实临时 KB 直接调用工具完成。

### 1.3 验收统计

| 维度 | 结果 |
| --- | --- |
| 验收标准 | 6/6 PASS |
| 单元测试 | 215 pass / 0 fail / 0 skipped（含 18 项新增测试：16 功能 + 2 CLI registry 回归） |
| TypeScript（server + frontend） | 0 错误 |
| 一致性检查 | PASS |
| CLI 真实运行时验证 | 4/4 工具通过（kb_list_staging / kb_lint / kb_write_answer / kb_organize_staging） |
| 安全审计 | PASS（无阻断/高危；2 项中危护栏建议 M-1 已修复、M-2 部分修复） |
| 回归测试 | PASS（既有 197 项测试全部通过，无破坏） |
| 阻断级缺陷 | 0 |
| 非阻断缺陷 | 0（DEFECT-1 已在 R2 修复） |

---

## 2. 验收标准逐项验证矩阵

### AC-1（P1 文档对齐）

| 项 | 内容 |
| --- | --- |
| 标准 | ARCH.md §3.1 与 PRD.md US-006 不再宣称「BM25+向量+重排」，改为「term-overlap + CJK bigram（小规模）」，并说明 qmd/LanceDB 留待 P6+ |
| 验证方法 | 静态文档比对 + grep 检索 |
| 证据 | `docs/ARCH.md` §5.2 mermaid（L225-L232）：小规模档位标注「当前实现 · term-overlap 打分 + CJK bigram」；中/大规模标注「P6+ 演进 · qmd BM25+向量混合+重排 / LanceDB」。`docs/ARCH.md` L240 明确说明「当前实现档位：仅小规模档位已落地……中规模（qmd BM25+向量+重排）与大规模（LanceDB）档位留待 P6+ 演进」。`docs/PRD.md` US-006（L79）：中规模项标记 `[ ]` 并注明「⚠️ P6+ 演进项：qmd 未接入；当前小规模档位 term-overlap + CJK bigram 检索 p95 < 2s 已满足」。 |
| 结果 | **PASS** |

### AC-2（P2 定时维护）

| 项 | 内容 |
| --- | --- |
| 标准 | `.github/workflows/kb-maintenance.yml` 存在，含双 cron（每日 lint + 每周 dream）+ workflow_dispatch，permissions 最小权限，不自动 commit 到 main，报告作为 artifact 上传 |
| 验证方法 | 文件存在性 + YAML 静态审查 |
| 证据 | 文件存在（新建，git untracked）。双 cron：`cron: '17 2 * * *'`（每日 lint，L23）+ `cron: '23 3 * * 1'`（每周一 dream，L24）。`workflow_dispatch` 含 task choice 输入（L25-L35）。`permissions: contents: read`（L37-L38，最小权限）。无 `git push`/不自动 commit（仅 `actions/upload-artifact@v4`，L178-L187，`retention-days: 90`，`if-no-files-found: warn`）。`timeout-minutes: 15`（L78）。两 run step 均 `set -euo pipefail` + 失败重试 1 次（L108, L148）。**护栏 M-1（CI 表达式注入反模式）已修复**：GitHub 表达式经 `env:` 块传递，shell 内仅引用 `$ENV_VAR`（L48-L53, L101-L106, L142-L147）。 |
| 结果 | **PASS** |

### AC-3（P3 auto-xref）

| 项 | 内容 |
| --- | --- |
| 标准 | `kb_ingest_source` 默认 auto_xref=true，ingest 后 touch 同域/共享 tag/标题提及的相关页（追加 ## Related + frontmatter related 双向链接），log 记录 type=xref。可设 auto_xref=false 关闭。幂等。 |
| 验证方法 | 单元测试（5 项）+ 源码审查 + CLI ingest 集成测试 |
| 证据 | `server/src/utils/xref.ts`（新建）：`findXrefCandidates` 复合打分（同域 +4、共享 tag +2/个上限 +6、双向标题提及 +3）；`applyXrefWithAbsPaths` 追加 `## Related` 节 + frontmatter `related`（双向链接）；幂等性三层去重检测（完整 relPath / basename / basename\|alias，`xref.ts:166-174`；`frontmatter.related` 去重 `xref.ts:196`；无新增不写盘 `xref.ts:232`）。`server/src/tools/write.ts:236` `const enableXref = autoXrefFlag !== false;`（默认 true）；L244 调用 `runAutoXref`；L268 log `type: "xref"`（仅 touched>0 时记录）。单元测试：`missing-features.test.ts` ok 22（auto-xref 套件 5 项全过：同域打分、共享 tag 打分、双向链接、幂等性、ingest 集成+xref 日志）。 |
| 结果 | **PASS** |

### AC-4（#16 kb_write_answer）

| 项 | 内容 |
| --- | --- |
| 标准 | 新增 kb_write_answer tool，将 Query 答案回写为 pending 经验卡（走 inbox，不跳过门禁）。cited_pages ≥2 门控（WRITEBACK-RAG Utility Gate）。frontmatter.related = cited_pages。log type=writeback。路径穿越防御。 |
| 验证方法 | 单元测试（4 项）+ CLI 真实运行时调用 + 落盘文件验证 |
| 证据 | `server/src/tools/write.ts:379-507` `kbWriteAnswer`：cited_pages ≥2 门控（Zod `min(2)` `schemas.ts:170` + 运行时纵深防御 `write.ts:395-399`）；写入 `wiki/<domain>/experiences/inbox/<slug>.md`（status=pending，走 inbox 两 tier 门禁，`write.ts:446-458`）；`frontmatter.related = cited_pages.slice()`（`write.ts:457`）；`source_task = "query-writeback:<query>"`（`write.ts:425`）；log `type: "writeback"`（`write.ts:483`）；路径穿越防御（DOMAIN_REGEX + `path.relative` 二次校验，`write.ts:413-416`）；DEF-001 原子写 `flag: "wx"`（`write.ts:466`）；去重检测非阻断（`write.ts:432-444`）。CLI 运行时：`node cli.ts kb_write_answer {...}` exit=0，落盘文件 `wiki/coding/experiences/inbox/cli-probe-synthesis.md` frontmatter 完整正确（`domain: [coding]` flow 风格、`status: pending`、`related: [wiki/coding/page-a, wiki/coding/page-b]`、`source_task: query-writeback:cli probe query`、`date: 2026-08-02` 无引号、`---` 后空行）；`log.md` 含 `## [2026-08-02] writeback \| CLI Probe Synthesis` 条目。单元测试：`missing-features.test.ts` ok 20（4 项全过：创建 inbox 页、拒绝 cited_pages<2、拒绝路径穿越、拒绝重复 DEF-001）。 |
| 结果 | **PASS** |

### AC-5（#24 missing_concept）

| 项 | 内容 |
| --- | --- |
| 标准 | kb_lint 新增 missing_concept 检查（low severity），检测被提及 ≥5 次但无独立页的概念（RAKE-lite 从 H2/H3 + tags 提候选）。可通过 checks 参数排除。不报告已有独立页的概念。 |
| 验证方法 | 单元测试（3 项）+ CLI 真实运行时调用 |
| 证据 | `server/src/tools/lint.ts:600-639` `checkMissingConcept`：`MISSING_CONCEPT_MENTION_THRESHOLD = 5`（`lint.ts:469`）；`MISSING_CONCEPT_TOP_N = 20`（`lint.ts:472`）；`extractCandidateConcepts` 从 H2/H3 标题 + frontmatter tags 提候选（`lint.ts:508-530`，RAKE-lite 无 LLM）；`buildExistingConceptSet` 从 title/basename 构建已有概念集（`lint.ts:564-571`，不报告已有页概念）；`countMentions` CJK 安全子串计数（`lint.ts:581-598`）；severity=`low`（`lint.ts:631`）；已注册 `ALL_CHECKS`（`lint.ts:53`）+ schema enum（`schemas.ts:232`）。CLI 运行时：`node cli.ts kb_lint {"checks":["missing_concept"]}` exit=0，正确检测「DeepConcept mentioned 6 times across 1 pages but has no dedicated page」，severity=low，suggestion 引用 AGENTS.md §6.2。单元测试：`missing-features.test.ts` ok 23（3 项全过：检测 ≥5 次提及、不报告已有页概念、checks 排除时不出现）。 |
| 结果 | **PASS** |

### AC-6（#56 kb_organize_staging）

| 项 | 内容 |
| --- | --- |
| 标准 | 新增 kb_organize_staging tool，应用 LLM 生成的 title/tags/description 到 staging 页 frontmatter（不动 body），log type=organize。仅 staging 页可整理。路径穿越防御。无字段时拒绝 no-op。 |
| 验证方法 | 单元测试（4 项）+ 源码审查 + CLI 注册检查 |
| 证据 | `server/src/tools/staging.ts:312-417` `kbOrganizeStaging`：应用 title/tags/description 到 frontmatter（`staging.ts:361-382`，仅更新提供的字段）；**不动 body**（`staging.ts:389` `serializeFrontmatter(frontmatter, body)` 保留原 body）；log `type: "organize"`（`staging.ts:399`）；仅 staging 可整理（`staging.ts:353-357` status 校验）；路径穿越防御（`path.resolve` + `path.relative`，`staging.ts:340-345`）；无字段时拒绝 no-op（`staging.ts:329-338`，需至少一个 {title,tags,description}）。MCP server 已注册（`server/src/index.ts:171-174`）。单元测试：`missing-features.test.ts` ok 21（4 项全过：应用 LLM 元数据+log organize、拒绝非 staging 页、拒绝路径穿越、拒绝 no-op）。 |
| 结果 | **PASS**（DEFECT-1 已在 R2 修复，详见 §6.1） |

---

## 3. 测试结果汇总

### 3.1 单元测试（server）

执行命令：`cd server && npm test`

```text
# tests 215
# suites 36
# pass 215
# fail 0
# cancelled 0
# skipped 0
# duration_ms 15661.13
```

- **215 pass / 0 fail**，符合预期（含 18 项新增测试）。
- 新增测试文件 `server/src/tests/missing-features.test.ts` 覆盖 4 个服务端工具 + CLI registry 回归，18 项全过：
  - `kb_write_answer`（4 项）
  - `kb_organize_staging`（4 项）
  - `auto-xref`（5 项：含同域打分、共享 tag、双向链接、幂等性、ingest 集成）
  - `checkMissingConcept`（3 项）
  - `CLI registry completeness`（2 项，DEFECT-1 回归守卫：断言 TOOL_REGISTRY/SCHEMA_REGISTRY 含所有新工具 + 两者 keys 一致）

### 3.2 TypeScript 类型检查

| 目标 | 命令 | 结果 |
| --- | --- | --- |
| server | `cd server && npx tsc --noEmit` | **0 错误**（exit 0） |
| frontend | `cd frontend && npx tsc --noEmit` | **0 错误**（exit 0） |

### 3.3 一致性检查

执行命令：`node scripts/consistency-check.js`（项目根）

```text
一致性检查通过 ✓
CONSISTENCY_EXIT=0
```

### 3.4 CLI 真实运行时验证

针对真实临时 KB（`%TEMP%\kb-accept-cli-test`，含 staging 页 + 2 个 cited 页 + 缺失概念页）通过子进程调用 `node --import tsx src/cli.ts <tool> <json>`（经 Node `spawnSync` args 数组传递，规避 PowerShell JSON 引号转义问题）：

| 工具 | 退出码 | 结果 |
| --- | --- | --- |
| `kb_list_staging` | 0 | 正确列出 staging 页 |
| `kb_lint {"checks":["missing_concept"]}` | 0 | 正确检测「DeepConcept mentioned 6 times」low severity |
| `kb_write_answer {...cited_pages...}` | 0 | 正确创建 inbox 页（pending/related/writeback log 全部正确） |
| `kb_organize_staging {...}` | 0 | 正确识别工具（R2 修复 DEFECT-1 后通过；`cli.ts:96` TOOL_REGISTRY + `cli.ts:126` SCHEMA_REGISTRY 均已注册） |

---

## 4. 安全审计结果

依据护栏报告 [2026-08-02-missing-features-guardrail.md](2026-08-02-missing-features-guardrail.md)（PASS）+ 本次运行时复核：

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 路径穿越防御（kb_write_answer） | PASS | Zod `DOMAIN_REGEX` + 运行时 `path.relative` 二次校验（`write.ts:413-416`）；CLI/单元测试均拒绝 `../../../tmp` |
| 路径穿越防御（kb_organize_staging） | PASS | `path.resolve` + `path.relative`（`staging.ts:340-345`）；单元测试拒绝 `../../../etc/passwd` |
| 路径穿越防御（auto-xref） | PASS | 候选页路径源自 `loadAllPages()` 文件系统遍历（非用户输入，可信路径）；护栏 §3.1.3 确认 |
| CWE-117 日志注入 | PASS | 新增 type（xref/writeback/organize）均经 `appendLogEntry` → `sanitizeLogField` strip CR/LF；writeback 的 `source_query` 额外 `.replace(/[\r\n]+/g," ")` 双重防护（`write.ts:488`） |
| Frontmatter 注入 | PASS | 所有 frontmatter 写入经 `serializeFrontmatter`（js-yaml `dump()` 转义特殊字符，DEF-008） |
| 代码/命令注入 | PASS | 无 `eval()`/`Function()`/`child_process.exec()`；唯一 `.exec()` 是正则方法（`lint.ts:518`） |
| CI 最小权限 | PASS | `permissions: contents: read`；无 `pull_request_target` |
| CI 不自动 commit | PASS | 仅 `upload-artifact@v4`，无 `git push` |
| **护栏 M-1（CI 表达式注入）** | **已修复** | 当前代码用 `env:` 块传递 GitHub 表达式（`kb-maintenance.yml:48-53,101-106,142-147`），shell 内仅引用 `$ENV_VAR` |
| **护栏 M-2（cited_pages 路径格式）** | **部分修复** | 已加 `^(?!.*\.\.).+$` 正则防 `..` 穿越（`schemas.ts:165-168`）；未加完整 `wiki/<domain>/<page>` 格式正则（纵深防御加固，非阻断） |
| DEF-001 原子写 | PASS | kbWriteAnswer 用 `flag:"wx"` create-only（`write.ts:466`） |
| 密钥/凭据 | PASS | 无硬编码 secrets；CI 不引用 `secrets.*`/`GITHUB_TOKEN`；`.gitignore` 排除 `.env` |
| 幂等性 | PASS | auto-xref 三层去重检测（已链接检测 + related 去重 + 无新增不写盘） |

**安全结论：PASS**（0 阻断 / 0 高危；M-1 已修复，M-2 部分修复，均非阻断）。

---

## 5. 回归测试结果

`npm test` 的 213 项测试已覆盖全部既有功能（非仅新增功能），故回归验证与 §3.1 单元测试同源：

| 既有测试套件 | 结果 |
| --- | --- |
| kb_search（9 项，含 CJK bigram） | 全过 |
| kb_lint（7 项，含 missing_xref/contradictions/orphans/stale） | 全过 |
| kb_ingest_source（6 项，含路径穿越/DEF-001） | 全过 |
| kb_write_experience / kb_promote_experience（含 DEF-007、ADR-011 去重） | 全过 |
| staging workflow（list/confirm/reject + 集成） | 全过 |
| /dream（Phase 1/2/3 + summary） | 全过 |
| DEF-008 frontmatter 格式不变量 | 全过 |
| 相似度算法（Levenshtein/Sorensen-Dice/bigram） | 全过 |

**回归结论：PASS** — 新增/修改代码未破坏任何既有功能（197 项既有测试 + 18 项新增 = 215 全过）。一致性检查通过，TypeScript 零错误。

---

## 6. 缺陷列表

### 6.1 DEFECT-1（中危）· R2 已修复

| 项 | 内容 |
| --- | --- |
| 严重度 | 中危（初版非阻断） |
| 初版状态 | `kb_organize_staging` 未在 CLI 子进程桥接注册 → `Unknown tool` exit=1 |
| **R2 修复** | **已修复**。`server/src/cli.ts:96` TOOL_REGISTRY + `cli.ts:126` SCHEMA_REGISTRY 均已补齐 `kb_organize_staging` 条目；额外加固：导出两个 registry（`export const`）+ 入口点守卫（`pathToFileURL` + try/catch，`cli.ts:211-224`，防止测试 import 触发 `main()`/`process.exit`）。 |
| 回归测试 | `missing-features.test.ts` 新增「CLI registry completeness」suite（2 项）：断言 7 个关键工具名在 TOOL_REGISTRY + SCHEMA_REGISTRY 均存在，且两 registry keys 深度相等。该测试在修复前会失败（捕获 DEFECT-1），修复后通过。 |
| 验证 | `node --import tsx src/cli.ts kb_organize_staging '{"page_path":"..."}'` 不再报 `Unknown tool`（exit 0 正常执行；JSON 解析由 caller 负责）。`npm test` 215 项全过。 |
| 经验卡 | 已写经验卡 `wiki/coding/experiences/mcp-tool-三点注册陷阱...`（Tier-1 自动 promote），记录「新增 MCP 工具须同时注册 index.ts + cli.ts 双 registry」的可复用模式。 |

### 6.2 初版缺陷原始记录（归档参考）

<details>
<summary>DEFECT-1 初版发现详情（已修复，展开仅供溯源）</summary>

| 项 | 内容 |
| --- | --- |
| 位置 | `server/src/cli.ts`（TOOL_REGISTRY L78-L101、SCHEMA_REGISTRY L112-L129） |
| 描述 | `kb_organize_staging` 工具已在 MCP server（`server/src/index.ts:171-174`）注册，且在 `cli.ts` 顶部 import（`cli.ts:40` `kbOrganizeStaging`、`cli.ts:63` `kbOrganizeStagingSchema`），但**未在 TOOL_REGISTRY 与 SCHEMA_REGISTRY 添加 `kb_organize_staging` 键**。`kb_write_answer` 同类注册则正确（`cli.ts:100,128`）。 |
| 复现步骤 | 1) 建临时 KB 含一个 staging 页；2) `node --import tsx src/cli.ts kb_organize_staging '{"page_path":"wiki/coding/staging-test","title":"X"}'`；3) 观察输出。 |
| 相关日志 | `STDERR: Unknown tool: kb_organize_staging` + CLI 列出的 15 个可用工具中不含 `kb_organize_staging`（exit=1）。 |
| 影响 | 该工具无法通过 Tauri GUI 的 CLI 子进程路径（`call_mcp_tool` → `node cli.ts`）调用。**但当前前端「LLM 整理」按钮使用不同代码路径**（`organizeStagingPageStream` + `updateStagingContent`，ADR-013/P5 的 body 更新机制，见 `frontend/src/components/FileList.tsx:229,283` 与 `frontend/src/lib/llm.ts:498,529`），**不调用本工具**，故现有 GUI 功能未受损。 |
| 根因 | 开发者添加了 import 但遗漏了两个 registry 的条目（2 行修复）。 |
| 单元测试为何未捕获 | 单元测试直接 import `tools.staging.kbOrganizeStaging` 调用函数（`missing-features.test.ts:175`），绕过 CLI registry，故无法发现注册缺失。 |

</details>

---

## 7. 非阻断项 / 手动验证说明

| 项 | 类型 | 说明 |
| --- | --- | --- |
| ~~DEFECT-1~~ | **已修复（R2）** | 见 §6.1。`kb_organize_staging` CLI 注册缺失已修复 + 2 项回归测试 + 经验卡归档。无遗留。 |
| ADR-012 未创建 | 文档缺口（非阻断） | 方案 §4 step 7 计划新增「ADR-012-auto-xref-and-writeback」，但 ADR-012 编号已被「ADR-012-p4-gui-tech-stack.md」占用。auto-xref + writeback 决策依据已记录在方案文档 `docs/reports/2026-08-02-missing-features-solution.md` §3.3/§3.4 及代码注释中。建议后续以 ADR-015（或下一可用编号）正式归档。 |
| 护栏 M-2 | 纵深防御加固（非阻断） | cited_pages 已防 `..` 穿越，但未加完整 `wiki/<domain>/<page>` 格式正则。js-yaml dump 已转义，不构成注入漏洞。 |
| 护栏 L-1/L-2/L-3 | 低危技术债（非阻断） | tags 格式正则、related `.md` 后缀规范化、staging read-modify-write TOCTOU 窗口。均见护栏报告 §4，非本次阻断项。 |
| 前端/Tauri 运行时验证 | 不适用 | 本迭代无前端改动，按用户要求未启动 Tauri/Playwright。前端「LLM 整理」按钮属前序已验收迭代。 |
| 临时数据清理 | 已完成 | 验收期间创建的临时 KB（`%TEMP%\kb-accept-cli-test`）与探针脚本（`server/_accept_probe.mjs`）均已删除，未影响项目仓库。 |

---

## 8. 最终验收裁定

### 最终裁定：**PASS**

| 门禁项 | 结果 |
| --- | --- |
| 验收标准覆盖（AC-1 ~ AC-6） | 6/6 PASS |
| 单元测试 | 215 pass / 0 fail（含 18 项新增：16 功能 + 2 CLI registry 回归） |
| TypeScript 类型安全 | server + frontend 零错误 |
| 一致性检查 | PASS |
| CLI 真实运行时验证 | 4/4 工具通过（DEFECT-1 R2 已修复） |
| 安全审计 | PASS（0 阻断/0 高危；M-1 已修复，M-2 部分修复） |
| 回归测试 | PASS（既有功能无破坏） |
| 阻断级缺陷 | 0 |
| 非阻断缺陷 | 0（DEFECT-1 已在 R2 修复） |

**合并就绪裁定：PASS**。所有 6 项验收标准全部通过，分层测试证据充分（215 单元 + TS 零错误 + 一致性 + CLI 4/4 运行时），安全护栏审计 PASS，无阻断级、高危或非阻断缺陷遗留。初版发现的 DEFECT-1 已在 R2 修复并补回归测试。

---

**验收报告结束。**
