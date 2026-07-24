# 验收测试报告 · DEF-008 frontmatter 格式统一

## 元信息

| 项目 | 内容 |
| --- | --- |
| 执行 Agent | ac-verifier |
| 任务令牌 | TKN-DEF-008-ACCEPTANCE-001 |
| 任务域 | DEF-008（frontmatter 格式统一，ADR-008 决策 1） |
| 报告日期 | 2026-07-24 |
| 分支 | `fix/def-008-frontmatter-format` |
| Commits | `9296927`（初始实现）、`064eb6a`（采纳 guardrail-enforcer R2 反馈） |
| 风险等级 | P1 常规（单模块内部逻辑优化，不改接口/契约/依赖） |
| 上游 guardrail 报告 | `docs/reports/2026-07-24-def-008-guardrail.md`（通过，0 阻断） |
| 测试框架 | node:test + node:assert/strict + tsx |
| 主 Agent 签发上下文 | **盲区 1**：5 个调用点端到端集成测试未显式断言格式。**盲区 2**：4 张 experience 卡片手动 Edit 修复，未通过 MCP 工具重新生成验证一致性。 |

---

## 1. 摘要（Summary）

- **功能/迭代**：DEF-008 frontmatter 格式统一（ADR-008 决策 1）
- **日期**：2026-07-24
- **总体结论**：**通过**
- **测试用例总数**：82（17 单元 + 11 集成/E2E/极端 + 54 既有回归）
- **通过**：82
- **失败**：0
- **阻塞/无法验证**：0

本次验收覆盖 ADR-008 决策 1 的全部 9 条验收标准。`serializeFrontmatter` 的 5 个调用点均输出一致的新格式（flow 风格数组、无引号日期、frontmatter 后空行）。4 张存量卡片已修复。往返安全与稳态固定点在单元和集成两层验证通过。性能无回退（serializeFrontmatter 单次 19.6µs，占 kb_get_page 端到端耗时的 0.28%）。安全专项（ReDoS、YAML 注入、密钥检查）全部通过。全量回归测试 82/82 通过。

---

## 2. 验收标准覆盖矩阵（Acceptance Criteria Coverage Matrix）

| AC ID | 验收标准 | 测试用例 ID | 结果 | 证据 |
| --- | --- | --- | --- | --- |
| AC-1 | `serializeFrontmatter` 输出单行 flow 风格数组 `domain: [coding]` | TC-U01, U08, U09, I01-I05, E01, edge-colon | **PASS** | `server/src/tests/frontmatter.test.ts` ok 1/8/9；`server/src/tests/frontmatter-integration.test.ts` ok 1-5/7/8；4 卡片 shell 检查 flow=True |
| AC-2 | ISO 日期无引号 `date: 2026-07-24` | TC-U02, U05, I01-I05, E01, edge-colon | **PASS** | `frontmatter.test.ts` ok 2/5（含反向断言 doesNotMatch quoted）；`frontmatter-integration.test.ts` ok 1-5/7/8；4 卡片 quotedDate=False |
| AC-3 | frontmatter 与 body 间有空行（MD022） | TC-U03, U04, I01-I05, E01, edge-blank, edge-empty | **PASS** | `frontmatter.test.ts` ok 3/4；`frontmatter-integration.test.ts` ok 1-5/7/9/10；4 卡片 blankLine=True |
| AC-4 | 5 个调用点输出格式一致 | TC-I01-I05, E01 | **PASS** | `frontmatter-integration.test.ts` ok 1-5（5 调用点各自断言 3 不变量）+ ok 7（E2E 全链路） |
| AC-5 | 4 张存量卡片已修复 | TC-S01-S04 | **PASS** | shell 检查 4 文件：flow=True, block=False, quotedDate=False, blankLine=True；git diff 确认 3 项修改 |
| AC-6 | 往返安全：serialize→parse 等价 | TC-U07, U11-U17 | **PASS** | `frontmatter.test.ts` ok 7（完整字段往返）+ ok 11-17（normalizeDate + parseFrontmatter 回归） |
| AC-7 | 稳态固定点：多次写回不漂移 | TC-U10, I06 | **PASS** | `frontmatter.test.ts` ok 10（3 轮 serialize→parse 收敛）；`frontmatter-integration.test.ts` ok 6（kb_get_page 3 次写回格式+body 不漂移） |
| AC-8 | 无回归 | TC-R01（全量套件）+ I07 | **PASS** | 82/82 通过，0 失败；`frontmatter-integration.test.ts` ok 11（kb_search 检索新格式卡片） |
| AC-9 | AGENTS.md §3.1.1 已追加格式约定 | TC-D01 | **PASS** | `AGENTS.md` L93-104：§3.1.1 含 4 行约定表格 + 说明段落，引用 DEF-008/ADR-008 |

---

## 3. 分层测试详情（Layered Test Details）

### 3.1 静态分析

| 工具 | 命令 | 新告警 | 基线告警 | 结果 |
| --- | --- | --- | --- | --- |
| TypeScript | `npm run typecheck`（`tsc --noEmit`） | 0 | 0 | **PASS** |
| 密钥扫描 | `git diff main...HEAD \| Select-String api_key\|token\|secret\|password` | 0 | 0 | **PASS** |

### 3.2 单元测试

| 框架 | 用例数 | 通过 | 失败 | 覆盖范围 | 结果 |
| --- | --- | --- | --- | --- | --- |
| node:test | 17 | 17 | 0 | 4 格式不变量 + 往返安全 + 稳态固定点 + 边界（空数组/多域/冒号标题） | **PASS** |

**单元测试充分性审查**：

`server/src/tests/frontmatter.test.ts`（17 个测试，3 个 describe 块）覆盖充分：

- **正向断言 + 反向断言**：AC-1（flow 数组）有 `assert.match(/^domain: \[coding\]$/m)` 正向 + `assert.doesNotMatch(/^  - coding$/m)` 反向；AC-2（无引号日期）有正向 + `doesNotMatch(/date: ['"]...['"]/)` 反向。符合 test-architect 等价类划分要求。
- **边界值分析**：空数组 `domain: []`（ok 8）、多域 `domain: [coding, academic]`（ok 9）、confidence 浮点（ok 6）、冒号标题需保留引号（ok 5）。
- **往返安全**：ok 7 覆盖完整 frontmatter 字段集（title/domain/type/status/confidence/date/source_task/tags）的 serialize→parse 等价性。
- **稳态固定点**：ok 10 验证 3 轮 serialize→parse→serialize 收敛（s2 === s3）。
- **guardrail 建议 2 已采纳**：稳态测试已存在（ok 10），且集成层补充了 ok 6（kb_get_page 3 次写回）。

**结论**：单元测试充分，无需补充。

### 3.3 集成测试

| 场景 | 用例 ID | 结果 | 证据 |
| --- | --- | --- | --- |
| kb_write_experience 写入后 3 不变量 | TC-I01 | **PASS** | `frontmatter-integration.test.ts` ok 1 |
| kb_ingest_source 写入后 3 不变量 | TC-I02 | **PASS** | `frontmatter-integration.test.ts` ok 2 |
| kb_promote_experience promote 后 3 不变量 | TC-I03 | **PASS** | `frontmatter-integration.test.ts` ok 3 |
| kb_promote_experience reject 后 3 不变量 | TC-I04 | **PASS** | `frontmatter-integration.test.ts` ok 4 |
| kb_get_page 写回 use_count 后 3 不变量（含旧格式规范化） | TC-I05 | **PASS** | `frontmatter-integration.test.ts` ok 5 |
| kb_get_page 3 次写回稳态固定点 | TC-I06 | **PASS** | `frontmatter-integration.test.ts` ok 6 |

集成测试通过 `assertFormatInvariants()` 辅助函数对每个调用点写入磁盘的实际文件内容断言 3 个格式不变量（flow 数组、无引号日期、空行分隔）。TC-I05 特别用 `setup.writePage`（旧 js-yaml 默认格式：block 数组 + 引号日期 + 无空行）播种页面，验证 kb_get_page 写回路径能将旧格式规范化为新格式。

### 3.4 端到端测试

| 流程 | 用例 ID | 结果 | 证据 |
| --- | --- | --- | --- |
| write experience → get page → promote → get page 全链路格式一致性 | TC-E01 | **PASS** | `frontmatter-integration.test.ts` ok 7 |
| kb_search 检索新格式卡片（title + body + domain 过滤） | TC-I07 | **PASS** | `frontmatter-integration.test.ts` ok 11 |

TC-E01 覆盖完整生命周期 4 个阶段，每个阶段读取磁盘文件断言 3 不变量，并验证 body 内容在写回→promote→写回后不丢失。这直接消除了主 Agent 盲区 1（端到端路径格式漂移）。

### 3.5 极端场景

| 场景 | 用例 ID | 结果 | 证据 |
| --- | --- | --- | --- |
| 标题含 YAML 冒号字符 → 引号保留，date 无引号 | TC-edge-colon | **PASS** | `frontmatter-integration.test.ts` ok 8 |
| body 以多个空行开头 → 折叠为恰好一个空行 | TC-edge-blank | **PASS** | `frontmatter-integration.test.ts` ok 9 |
| body 为空字符串 → 不崩溃，`---\n\n$` 结尾 | TC-edge-empty | **PASS** | `frontmatter-integration.test.ts` ok 10 |
| 空数组 domain（单元层） | TC-U08 | **PASS** | `frontmatter.test.ts` ok 8 |
| 多元素数组（单元层） | TC-U09 | **PASS** | `frontmatter.test.ts` ok 9 |

---

## 4. 性能回退检查

| 指标 | 测量值 | 阈值 | 结果 |
| --- | --- | --- | --- |
| `serializeFrontmatter` 单次耗时（100k 次迭代） | 19.606µs/call | < 1ms（guardrail 评估） | **PASS** |
| `kb_get_page` 1000 次写回端到端耗时 | 6.914ms/call | — | 基线参考 |
| `serializeFrontmatter` 占 `kb_get_page` 耗时比 | 0.28%（19.6µs / 6914µs） | < 50% 回退 | **PASS** |
| 1000 次写回后格式不变 | flow=true, unquotedDate=true, blankLine=true | 格式不漂移 | **PASS** |

**分析**：DEF-008 新增的开销为正则替换（`/^(\s*date:\s*)'(\d{4}-\d{2}-\d{2})'$/gm`）和 body 前导换行去除（`body.replace(/^\n+/, "")`），两者均为 O(n) 线性扫描，n < 1KB。serializeFrontmatter 单次 19.6µs，在 kb_get_page 的 6.9ms 端到端耗时中占 0.28%，不可能造成 20%（警告）或 50%（失败）级别的性能回退。无性能基线文件存在，本次生成初版基线数据。

---

## 5. 安全审计结果

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 正则 ReDoS 风险 | **PASS** | 对抗输入（100k 字符 `date: '999...9'`）：0.115ms，远低于 5ms 阈值。正则 `/^(\s*date:\s*)'(\d{4}-\d{2}-\d{2})'$/gm` 为固定宽度数字组，无嵌套量词，无灾难性回溯。 |
| YAML 注入防护 | **PASS** | 6 种恶意 title 全部安全往返（js-yaml 自动引号转义），无 frontmatter 突破：`evil: injected_key`、`evil\n---\nbreakout`、`evil: [array]`、`evil: {object}`、`!!python/object/apply:os.system`、`title: 'a']\n_domain`。所有情况下 `---` 围栏数 = 2（无突破）。 |
| 密钥/敏感信息泄露 | **PASS** | `git diff main...HEAD` 中 0 个 api_key/token/secret/password 匹配。 |
| YAML 炸弹防护 | **PASS** | `noRefs: true`（本次新增）禁止 YAML 锚点/引用扩展，防止 `&anchor` / `*alias` 炸弹。 |
| 路径遍历防护 | **PASS** | 5 个调用点的文件操作均有 `path.relative` 检查（`read-only.ts:188-190`、`write.ts:93-96/178-181/303-306`），不受本次修改影响。 |
| js-yaml 安全 schema | **PASS** | js-yaml v5 `load()` 默认不实例化任意类型；`parseFrontmatter` 已有 try/catch（DEF-003）。 |

**guardrail 建议 1（正则精确化）已采纳**：commit `064eb6a`（R2）已将正则从 `\w[\w-]*`（匹配任意键）收窄为 `date:`（仅匹配 date 键），提升防御深度。guardrail 建议 3（JSDoc 注释修正）也已采纳，JSDoc 已更新为 js-yaml v5 行为描述。

---

## 6. 回归测试结果

| 套件 | 总数 | 通过 | 失败 | 结果 |
| --- | --- | --- | --- | --- |
| 全量测试套件（`npm test`） | 82 | 82 | 0 | **PASS** |

**说明**：lint-perf（DEF-006 已知 flaky）本次运行通过（p50 阈值在 Windows 环境噪声下波动，属既有技术债，非 DEF-008 引入）。除 lint-perf 外所有测试稳定通过。

**kb_search 检索验证**（TC-I07）：在 temp KB 中用 `kb_write_experience` 创建新格式卡片 → promote → `kb_search` 按 body token 检索成功、按 title 检索成功、domain 过滤成功。证明 frontmatter 格式变化不影响 `kb_search`（`parseFrontmatter` 的 `load()` 能正确解析 flow 和 block 两种 YAML 风格）。

---

## 7. 缺陷列表

| ID | 严重度 | 关联 AC | 描述 | 复现步骤 | 证据 |
| --- | --- | --- | --- | --- | --- |
| — | — | — | 无缺陷 | — | — |

本次验收未发现任何缺陷。

---

## 8. 未覆盖项与风险

| 项目 | 原因 | 风险 |
| --- | --- | --- |
| 真实 KB 上 4 张卡片的 `kb_search` 端到端检索 | 测试用 temp KB 隔离，未在真实 KB 上运行 kb_search | 极低——`kb_search` 逻辑基于 `parseFrontmatter` + 全文搜索，frontmatter 格式变化不影响 body 内容；集成测试 TC-I07 已在 temp KB 验证新格式卡片可被检索 |
| main 分支性能基线对比 | 未切换到 main 分支运行旧实现基准 | 低——serializeFrontmatter 单次 19.6µs，新增操作（正则 + body.replace）均为 O(n) 线性，开销在微秒级，占 kb_get_page 端到端 0.28% |
| 嵌套 frontmatter 结构 | 当前 schema 为扁平结构（AGENTS.md §3），无嵌套对象 | 低——`flowLevel: 1` 仅影响顶层；若未来 schema 演化为嵌套，需重新评估 `flowLevel` 和日期正则的缩进匹配 |

---

## 9. 测试用例设计文档

### 9.1 测试用例汇总

| 测试用例 ID | AC ID | 技术 | 输入/前置条件 | 动作 | 预期行为 | 测试层级 |
| --- | --- | --- | --- | --- | --- | --- |
| TC-U01 | AC-1 | 等价类 | domain=["coding"], tags=["python"...] | serializeFrontmatter | `domain: [coding]` 单行 flow，无 block 风格 | 单元 |
| TC-U02 | AC-2 | 等价类 | date="2026-07-24" | serializeFrontmatter | `date: 2026-07-24` 无引号 | 单元 |
| TC-U03 | AC-3 | 等价类 | body="## 背景" | serializeFrontmatter | `---\n\n## 背景` 有空行 | 单元 |
| TC-U04 | AC-3 | 边界值 | body="\n\n## Body" | serializeFrontmatter | 折叠为恰好一个空行 | 单元 |
| TC-U05 | AC-2 | 反向 | title="Note: Important" | serializeFrontmatter | title 保留引号，date 无引号 | 单元 |
| TC-U06 | 边界 | 边界值 | confidence=0.85 | serializeFrontmatter | `confidence: 0.85` 无引号 | 单元 |
| TC-U07 | AC-6 | 往返 | 完整 frontmatter 字段集 | serialize→parse | 字段等价 | 单元 |
| TC-U08 | AC-1 | 边界值 | domain=[] | serializeFrontmatter | `domain: []` | 单元 |
| TC-U09 | AC-1 | 等价类 | domain=["coding","academic"] | serializeFrontmatter | `domain: [coding, academic]` | 单元 |
| TC-U10 | AC-7 | 稳态 | 完整 fm + body | 3 轮 serialize→parse | s2===s3 收敛 | 单元 |
| TC-U11-13 | AC-6 | 辅助 | string/Date/null | normalizeDate | 正确转换 | 单元 |
| TC-U14-17 | AC-6 | 回归 | unquoted/quoted/malformed/no-fm | parseFrontmatter | 正确解析或降级 | 单元 |
| TC-I01 | AC-4 | 集成 | kb_write_experience 调用 | 读文件验证 | 3 不变量满足 | 集成 |
| TC-I02 | AC-4 | 集成 | kb_ingest_source 调用 | 读文件验证 | 3 不变量满足 | 集成 |
| TC-I03 | AC-4 | 集成 | kb_promote_experience promote | 读 active 文件 | 3 不变量满足 | 集成 |
| TC-I04 | AC-4 | 集成 | kb_promote_experience reject | 读 inbox 文件 | 3 不变量满足 | 集成 |
| TC-I05 | AC-4 | 集成 | 旧格式页面 + kb_get_page 写回 | 读文件验证 | 旧格式被规范化 | 集成 |
| TC-I06 | AC-7 | 稳态 | kb_get_page 3 次写回 | 对比文件内容 | 格式+body 不漂移 | 集成 |
| TC-E01 | AC-4 | E2E | write→get→promote→get | 每阶段读文件 | 4 阶段格式一致 | E2E |
| TC-I07 | AC-8 | 回归 | 新格式卡片 + kb_search | 检索 | title/body/domain 过滤均命中 | E2E |
| TC-edge-colon | AC-1/2/3 | 极端 | title 含冒号 | serializeFrontmatter | 引号保留，3 不变量满足 | 集成 |
| TC-edge-blank | AC-3 | 极端 | body 多空行开头 | serializeFrontmatter | 折叠为一个空行 | 集成 |
| TC-edge-empty | AC-3 | 极端 | body="" | serializeFrontmatter | 不崩溃，`---\n\n$` | 集成 |

---

## 10. 最终结论

**通过。**

ADR-008 决策 1 的全部 9 条验收标准均满足，每条标准有对应的自动化测试用例和具体证据支撑。82 个测试全部通过，0 失败，0 缺陷。性能无回退，安全专项全部通过。guardrail-enforcer 的 3 项改进建议（正则精确化、稳态测试、JSDoc 修正）均已在 commit `064eb6a`（R2）中采纳。

主 Agent 签发的两个盲区均已消除：

- **盲区 1**（端到端格式漂移）：TC-I01-I05 + TC-E01 在 5 个调用点的真实 MCP 路径上显式断言 3 个格式不变量，TC-I06 验证 kb_get_page 多次写回稳态。
- **盲区 2**（手动 Edit 与 MCP 生成一致性）：TC-I01 验证 `kb_write_experience` 生成的卡片格式与手动修复的 4 张卡片格式一致（同一 `assertFormatInvariants` 函数断言相同不变量），消除双轨风险。

本轮 DEF-008 开发周期闭合，可进入合并流程。
