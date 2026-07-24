# DEF-001 修复 · ac-verifier 验收测试与分层验证报告

> **任务令牌**：TKN-DEF-001-002
> **执行 Agent**：ac-verifier
> **验证范围**：DEF-001 kb_write_experience / kb_ingest_source / kb_promote_experience TOCTOU 竞态修复（P1 常规）
> **结论**：**全部通过且无回归** — 本轮开发周期闭合

## 元信息

| 项目 | 内容 |
| --- | --- |
| 执行 Agent | ac-verifier |
| 任务令牌 | TKN-DEF-001-002 |
| 任务域 | DEF-001 TOCTOU 竞态修复验收 |
| 报告日期 | 2026-07-24 |
| 风险等级 | P1 常规 |
| 验证对象 | server/src/utils/fileio.ts / server/src/tools/write.ts / server/src/tests/write.test.ts（3 文件，+151/-24） |
| 调用 Skill | test-architect |
| 调用 MCP | mcp_Sequential_Thinking（EPERM 与并发测试充分性推理） |
| 前置审计 | [2026-07-24-def-001-guardrail.md](2026-07-24-def-001-guardrail.md)（guardrail-enforcer，结论：通过） |
| 最终结论 | 全部通过且无回归 — 闭合 |

## 0. 主 Agent 签发上下文（盲区与脆弱点）

主 Agent 在启动本验证前提供了两个自问答复（CLAUDE.md §7.3）。ac-verifier 评估如下：

### 0.1 疑虑一：EPERM 权衡的可测试性

**主 Agent 担心**：`isAlreadyExistsError` 同时匹配 EEXIST 和 EPERM。Windows 上 `flag:'wx'` 命中已存在文件可能报 EPERM（被占用），但真正权限错误也会被误报为 already exists。担心测试无法区分这两种 EPERM 场景。

**ac-verifier 评估结论**：无需补充 EPERM 模拟测试，现有验证已充分。依据：

1. **单测环境限制**：测试用 `os.tmpdir()` 临时目录，用户完全控制权限。要模拟"真正权限失败"的 EPERM，需让目标目录不可写（POSIX `chmod 000` 或 Windows ACL 拒绝）。但 Windows `chmod` 行为与 POSIX 不同，跨平台 CI 下行为不稳定，无法构造可复现的稳定测试。
2. **函数逻辑已被白盒覆盖**：`isAlreadyExistsError`（[write.ts:399-403](../../server/src/tools/write.ts#L399-L403)）逻辑极简——`!(err instanceof Error) || !("code" in err)` 返回 false；否则 `code === "EEXIST" || code === "EPERM"`。三个分支（非 Error、无 code 属性、有 code 匹配/不匹配）均已被静态审查覆盖。
3. **安全性质已确认**：guardrail 报告 §3.3 已确认这是**可用性权衡而非安全漏洞**——误报只影响错误消息文本，不影响 O_EXCL 原子性或路径遍历防护，攻击者无法利用 EPERM 误报绕过校验或获取权限。
4. **间接路径覆盖**：现有测试通过"文件已存在 → EEXIST → already exists 友好错误"路径（[write.test.ts:115-132](../../server/src/tests/write.test.ts#L115-L132)）间接验证了 helper 的 already-exists 转换逻辑。EEXIST 与 EPERM 走同一转换分支，覆盖等价。

**结论**：单测难稳定模拟真实 EPERM，且函数逻辑已被白盒覆盖。在 §9"未覆盖项与风险"中记录此权衡。

### 0.2 疑虑二：跨进程真实并发测试缺失

**主 Agent 遗憾**：没加跨进程真实并发测试，现有测试只验证"文件已存在 → already exists 错误"（白盒覆盖 wx 失败路径）。`flag:'wx'` 原子性由 OS 保证，但应用层没有并发证明。

**ac-verifier 评估结论**：OS 级原子性保证 + already-exists 路径覆盖已构成充分验收，并发测试是 nice-to-have 非必须。依据：

1. **OS 内核保证**：`flag:'wx'` = `O_WRONLY | O_CREAT | O_EXCL`，POSIX 标准与 Node.js 官方文档均保证"检查不存在 + 创建"在内核原子完成，无时间窗口。应用层并发测试验证的是 OS 原语而非应用代码。
2. **语义等价性**：应用层能证明的是"`wx` 失败时正确转换为 already exists 错误"，已被现有单测覆盖（第二次写同 title → EEXIST → friendly error）。单测的"第二次写 → EEXIST"本质等价于"并发中后到者看到前到者创建的文件 → EEXIST"，因为 O_EXCL 语义对串行和并发一致。
3. **复杂度收益比**：真实并发测试需 `worker_threads`/`child_process` 协调 N 个线程同时调用同 title，复杂度高，且测试的是 OS 而非应用代码。
4. **与 guardrail 一致**：guardrail 报告 §3.4 得出相同结论——测试充分，并发测试是 nice-to-have 非必须。

**结论**：不阻断。在 §9"未覆盖项与风险"中记录并发测试缺失为低风险，并附 guardrail 建议的 `worker_threads` 可选补充方案。

## 1. 验证依据

| 依据 | 来源 |
| --- | --- |
| 代码变更 | `git diff HEAD`（3 文件 + 索引，+151/-24） |
| PRD 验收标准 | ADR-008 后续任务清单 DEF-001（[ADR-008:141](../../docs/decisions/ADR-008-kb-content-layering-and-format-unification.md)）+ 主 Agent 扩展（8 条） |
| 约定文档 | AGENTS.md §4.2/§7.4（ingest/write/promote 工作流）、CLAUDE.md §19.4（不吞异常）、CLAUDE.md §11（验收测试门禁） |
| 前置审计 | [2026-07-24-def-001-guardrail.md](2026-07-24-def-001-guardrail.md)（通过，主 Agent 已修复中等建议项"注释措辞与代码行为矛盾"） |
| 测试框架 | server/src/tests/（node:test + node:assert/strict） |
| 安全策略 | CLAUDE.md §18-20（依赖安全、错误处理、密钥管理）；CWE-367 TOCTOU（核心修复目标） |
| 调研依据 | WebSearch 确认 Node.js 官方文档：flag 'wx' = O_EXCL 原子创建（guardrail 报告已引用） |

## 2. 验收标准解析与可验证断言

从 ADR-008 DEF-001 定义 + 主 Agent 扩展，提取 8 条验收标准，转换为可验证断言：

| AC ID | 验收标准 | 可验证断言（Given/When/Then） |
| --- | --- | --- |
| AC-1 | TOCTOU 消除 | Given kbWriteExperience，when 创建 inbox 卡片，then 不再使用 fileExists 预检查 + writeFile 两步操作，改用 fs.writeFile flag:'wx' 原子创建 |
| AC-2 | 同类 TOCTOU 一并修复 | Given kbIngestSource 与 kbPromoteExperience promote 分支，when 创建文件，then 同样使用 flag:'wx' 原子创建，无 fileExists 预检查 |
| AC-3 | 对外行为不变 | Given 三处已存在文件场景，when 触发创建，then 错误消息文本与修复前完全一致（"Page already exists at..." / "Experience already exists at..." / "Active experience already exists at..."） |
| AC-4 | 错误处理合规 | Given 非 already-exists 的写入错误，when 被 catch，then `throw err` 重新抛出（不吞异常），由 MCP SDK 自动捕获转为错误响应 |
| AC-5 | 向后兼容 | Given fileio.ts writeFile 既有调用方，when 不传 flag 参数，then 行为与修复前一致（默认 'w' 覆盖写） |
| AC-6 | 测试覆盖 | Given 3 个函数的 already-exists 路径，then 均有测试覆盖（kbIngestSource 新测试 + kbPromoteExperience promote 新测试 + kbWriteExperience 既有测试） |
| AC-7 | typecheck 通过 | Given `npm run typecheck`，then 退出码 0，无类型错误 |
| AC-8 | 无回归 | Given 全量 npm test，then 现有测试不因 DEF-001 改动而失败 |

**无需手工澄清项**：8 条验收标准全部可自动验证，无歧义。

## 3. 测试用例设计文档

采用等价类划分、边界值分析、状态迁移、路径覆盖技术设计测试用例：

| 测试用例 ID | AC ID | 技术 | 输入 / 前置条件 | 动作 | 预期行为 | 测试层级 |
| --- | --- | --- | --- | --- | --- | --- |
| TC-DEF001-001 | AC-1,3,6 | 等价类（已存在文件） | 同 slug 的 markdown 源已 ingest 一次 | 第二次 kbIngestSource 同 slug | isError=true + /already exists/i | 单元 |
| TC-DEF001-002 | AC-2,3,6 | 等价类（已存在文件） | 同 title 的 inbox 卡片已 write 一次 | 第二次 kbWriteExperience 同 title | isError=true + /already exists/i | 单元 |
| TC-DEF001-003 | AC-2,3,6 | 等价类 + 状态迁移 | 卡片 A 已 promote→active；卡片 B 同 title 在 inbox | promote 卡片 B | isError=true + /already exists/i | 单元 |
| TC-DEF001-004 | AC-3 | 边界值（消息文本字节级） | 三处错误场景 | 触发并断言消息文本 | 与修复前字符串完全一致 | 白盒（代码 diff） |
| TC-DEF001-005 | AC-5 | 等价类（默认 flag） | 6 处既有 writeFile 调用点 | 不传 flag 调用 | 默认 'w' 覆盖写，行为不变 | 白盒 + 既有集成测试 |
| TC-DEF001-006 | AC-4 | 路径覆盖（非 already-exists 分支） | isAlreadyExistsError 输入：非 Error / 无 code / 其他 errno | 静态分析 3 分支 | 非 already-exists → throw err | 白盒 |
| TC-DEF001-007 | AC-1,2 | 路径覆盖（成功创建路径） | 新 slug/title | 首次创建 | 文件创建 + index.md + log.md 更新 | 集成（既有测试） |
| TC-DEF001-008 | AC-1,2 | 边界值（路径遍历防护保留） | domain="../../../tmp" | kbIngestSource/kbWriteExperience | isError + /traversal/i | 单元（既有 S-1） |
| TC-DEF001-009 | AC-2 | 状态迁移（非法迁移阻断） | rejected 卡片 | promote | isError + /expected "pending"/ | 单元（既有 DEF-007） |
| TC-DEF001-010 | AC-7 | 静态分析 | tsc --noEmit | typecheck | 退出码 0 | 静态 |
| TC-DEF001-011 | AC-8 | 回归 | 全量 npm test | 运行 | DEF-001 相关全过，无新回归 | 回归 |

**边界值与等价类说明**：

- **等价类划分**：创建场景分三类——(a) 目标不存在（成功创建）、(b) 目标已存在（EEXIST/EPERM → friendly error）、(c) 非 already-exists 错误（throw err）。三类均已覆盖。
- **边界值**：本修复核心是"存在性"二元边界，无数值/长度边界。"已存在"边界由 TC-001/002/003 覆盖，"不存在"边界由既有成功路径测试覆盖。
- **状态迁移**：promote 路径涉及 pending→active 状态机。TC-003 覆盖"active 已存在"冲突，TC-009 覆盖"rejected→promote 非法迁移"。
- **路径覆盖**：isAlreadyExistsError 的 3 个分支（非 Error / 无 code / code 匹配判断）+ 3 处 try/catch 的成功/失败两分支，均由白盒分析 + 单测覆盖。

## 4. 分层测试详情

### 4.1 静态分析层

| 工具 | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| TypeScript Compiler | `npm run typecheck`（`tsc --noEmit`） | ✅ 通过 | 退出码 0，无输出（无类型错误）。TS1308 修复（[write.test.ts:103](../../server/src/tests/write.test.ts#L103) `it()` 回调改 async）已生效 |

**静态安全扫描**：项目未配置 Semgrep/Snyk。guardrail-enforcer 已调用 TRAE-security-review 完成 OWASP/CWE 扫描（结论：无可利用漏洞）。ac-verifier 复核确认 diff 中无硬编码密钥、无网络端点、无依赖变更。

### 4.2 单元测试层

| 框架 | 用例总数 | 通过 | 失败 | 结果 |
| --- | --- | --- | --- | --- |
| node:test + node:assert/strict | 54 | 53 | 1（与 DEF-001 无关） | ✅ DEF-001 相关全过 |

**DEF-001 专项测试执行结果**：

| 测试用例 | 测试名 | 结果 | 耗时 | 证据 |
| --- | --- | --- | --- | --- |
| TC-DEF001-001 | `rejects duplicate page slug atomically via flag 'wx' (DEF-001)` | ✅ Pass | 39.1ms | [write.test.ts:115-132](../../server/src/tests/write.test.ts#L115-L132) |
| TC-DEF001-002 | `rejects duplicate experience title`（既有，隐式覆盖 DEF-001） | ✅ Pass | 12.4ms | [write.test.ts:166-185](../../server/src/tests/write.test.ts#L166-L185) |
| TC-DEF001-003 | `promote fails atomically when active card already exists (DEF-001 flag:'wx')` | ✅ Pass | 52.6ms | [write.test.ts:383-421](../../server/src/tests/write.test.ts#L383-L421) |
| TC-DEF001-007 | `creates wiki page with staging status and updates index + log` | ✅ Pass | 58.2ms | 验证成功路径 index.md/log.md 更新 |
| TC-DEF001-008 | `rejects path traversal in domain parameter (S-1)` | ✅ Pass | 7.2ms | 遍历防护保留 |
| TC-DEF001-009 | `DEF-007: reject then promote is blocked (state machine)` | ✅ Pass | 21.3ms | 状态机非法迁移阻断 |

**write.test.ts 全量结果**：kb_ingest_source suite 6/6、kb_write_experience suite 3/3、kb_promote_experience suite 6/6、kb_list_recent type:reject integration 1/1，全部通过。

**唯一失败项分析（TC-DEF001-011 回归判定）**：

| 失败测试 | 位置 | 失败原因 | 与 DEF-001 关系 |
| --- | --- | --- | --- |
| `completes 1000-page scan well under 2s PRD threshold (scale sanity)` | [lint-perf.test.ts:208](../../server/src/tests/lint-perf.test.ts#L208) | `1000-page missing_xref scan p50=1313.28ms, expected < 1000ms`（I/O 抖动） | **无关** — 见 §7 回归测试详析 |

### 4.3 集成测试层

write.test.ts 使用真实文件系统（`createTempKB` 创建临时 KB），本质为集成测试。跨模块链路验证：

| 集成场景 | 链路 | 结果 | 证据 |
| --- | --- | --- | --- |
| kbIngestSource 成功创建 → index.md + log.md 更新 | write.ts → fileio.ts.writeFile('wx') → index-md.ts.addPageToIndex → log.ts.appendLogEntry | ✅ Pass | [write.test.ts:45-73](../../server/src/tests/write.test.ts#L45-L73) 断言 index.md 含 article、log.md 含 ingest |
| kbIngestSource 已存在 → 不更新 index/log（原子性） | writeFile('wx') EEXIST → catch → return errorResult（不执行 addPageToIndex/appendLogEntry） | ✅ Pass | [write.test.ts:115-132](../../server/src/tests/write.test.ts#L115-L132) 第二次 ingest 返回错误，未污染 index |
| kbWriteExperience 成功 → log.md 更新（不入 index.md） | write.ts → writeFile('wx') → appendLogEntry | ✅ Pass | [write.test.ts:140-164](../../server/src/tests/write.test.ts#L140-L164) |
| kbPromoteExperience promote 成功 → active 创建 + inbox unlink + index/log | writeFile('wx') → fs.unlink(inbox) → addPageToIndex → appendLogEntry | ✅ Pass | [write.test.ts:240-266](../../server/src/tests/write.test.ts#L240-L266) |
| kbPromoteExperience promote active 已存在 → 不 unlink inbox | writeFile('wx') EEXIST → catch → return errorResult（不执行 unlink） | ✅ Pass | [write.test.ts:383-421](../../server/src/tests/write.test.ts#L383-L421) inbox 卡片保留 |
| 跨模块集成：write.ts → log.ts → read-only.ts | kbListRecent typeFilter 按 reject/experience 过滤 | ✅ Pass | [write.test.ts:428-484](../../server/src/tests/write.test.ts#L428-L484) DEF-007 集成测试，证明 DEF-001 改动未破坏跨模块链路 |

**事务边界/部分失败分析**（与 guardrail §4.2.1 一致）：

- promote 中 `writeFile('wx')` 成功后 `fs.unlink(inbox)`，若进程崩溃则 active 已创建但 inbox 未删。**这是既有问题**（原 fileExists→writeFile→unlink 同样有），**非 DEF-001 引入**。
- DEF-001 实际使该场景**更安全**：旧代码会覆盖已存在 active 文件（数据丢失），新代码拒绝覆盖（EEXIST → friendly error，保留两个副本）。
- 不阻断验收（既有架构问题，超出 DEF-001 范围）。

### 4.4 端到端测试

本任务无前端交互（MCP server 工具层），按 CLAUDE.md §11 跳过 Playwright E2E。write.test.ts 的真实文件系统集成测试已覆盖端到端数据一致性（创建→索引→日志→查询闭环）。

## 5. 极端/边缘场景评估

| 场景 | 覆盖方式 | 结果 | 说明 |
| --- | --- | --- | --- |
| 文件已存在（EEXIST） | TC-DEF001-001/002/003 | ✅ 已覆盖 | 三函数均验证 |
| 路径遍历 | 既有 S-1 测试 | ✅ 已覆盖 | DEF-001 未修改路径校验，防护保留 |
| 非 markdown source | 既有测试 | ✅ 已覆盖 | kbIngestSource 拒绝 .pdf |
| 状态机违规（reject 后 promote） | 既有 DEF-007 测试 | ✅ 已覆盖 | 非法迁移被阻断 |
| 真实 EPERM（权限失败） | 评估：单测难稳定模拟 | ⚠️ 不阻断 | 见 §0.1，可用性权衡非安全漏洞，白盒已覆盖 helper 逻辑 |
| 跨进程并发竞态 | 评估：OS 原子性保证 | ⚠️ 不阻断 | 见 §0.2，O_EXCL 内核级原子，nice-to-have 非必须 |
| 空值/超长输入 | 既有 slugify 处理 | ✅ 已覆盖 | slugify 对空标题 fallback `experience-${Date.now()}` |
| 文件系统部分失败（promote unlink 前 crash） | 既有架构问题 | ⚠️ 不阻断 | 非 DEF-001 引入，新代码更安全 |

## 6. 性能回退检查

**性能基线**：DEF-001 无既有性能基线。按 CLAUDE.md §11 对涉及函数 kbWriteExperience 执行计时测试生成首版基线。

**方法**：30 次采样（含 2 次 warmup），独立临时 KB，`performance.now()` 计时，单次 kbWriteExperience 调用（含 writeFile('wx') + appendLogEntry）。

**首版基线结果**：

| 指标 | 值 |
| --- | --- |
| 采样数 N | 30 |
| p50 | 4.285 ms |
| p95 | 5.130 ms |
| p99 | 5.213 ms |
| min | 3.486 ms |
| max | 5.577 ms |
| mean | 4.379 ms |

**性能回退判定**：

- DEF-001 改动只涉及文件创建的 flag 参数（fileExists 预检查 → writeFile flag:'wx'），**不改性能热路径**。
- 实际上 DEF-001 **减少**了一次 I/O（移除 fileExists 的 `fs.access` 调用），性能预期持平或略优。
- 首版基线绝对值在合理范围（单次创建 < 6ms），无性能异常。
- 无既有基线对比，但无回退风险（改动方向是减少 I/O）。

**结论**：✅ 无性能回退。首版基线已生成，可供后续 DEF 对比。

**临时脚本清理**：计时脚本 `_perf_baseline_def001.ts` 已在测试后删除，未污染仓库（git status 确认无残留）。

## 7. 回归测试结果

| 测试套件 | 总数 | 通过 | 失败 | 结果 |
| --- | --- | --- | --- | --- |
| 全量 npm test | 54 | 53 | 1 | ⚠️ 唯一失败与 DEF-001 无关 |

**失败项归因分析**：

| 项 | 内容 |
| --- | --- |
| 失败测试 | `completes 1000-page scan well under 2s PRD threshold (scale sanity)` |
| 位置 | [lint-perf.test.ts:208](../../server/src/tests/lint-perf.test.ts#L208) |
| 失败信息 | `1000-page missing_xref scan p50=1313.28ms, expected < 1000ms` |
| 归属 | DEF-006（lint-perf p50 阈值调优，Windows 环境噪声 flaky） |
| ADR-008 记录 | [ADR-008:145](../../docs/decisions/ADR-008-kb-content-layering-and-format-unification.md) 明确登记 DEF-006 为"Windows 环境噪声 flaky" |
| 代码路径关联 | 该测试用 `spawnSync` 启动子进程扫描 1000 页 missing_xref，**不调用** write.ts 的 kbIngestSource/kbWriteExperience/kbPromoteExperience，**不调用** fileio.ts.writeFile。与 DEF-001 代码路径无交集 |
| 失败性质 | I/O 抖动（测试注释 [lint-perf.test.ts:183-188](../../server/src/tests/lint-perf.test.ts#L183-L188) 说明正常值 ~860ms，Windows 并发负载下 p95 曾 flake 至 1044ms） |
| 结论 | **既有 flaky，非 DEF-001 引入的回归** |

**回归判定证据链**：

1. 失败测试的代码路径（kb_lint missing_xref 扫描）与 DEF-001 改动（write.ts/fileio.ts 文件创建）无调用关系。
2. ADR-008 在 DEF-001 之前已登记 DEF-006 为已知 flaky（"Windows 环境噪声 flaky"）。
3. 失败信息是性能阈值（p50 > 1000ms），非功能断言失败，符合 flaky 特征。
4. DEF-001 相关的 3 个测试套件（kb_ingest_source 6/6、kb_write_experience 3/3、kb_promote_experience 6/6）全部通过，无功能回归。

**结论**：✅ DEF-001 未引入新回归。唯一失败是 DEF-006 既有 flaky，与本任务无关。

## 8. 安全专项验证

### 8.1 CWE-367 TOCTOU 竞态（核心修复目标）

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| kbIngestSource fileExists 预检查已移除 | ✅ | [write.ts:108-125](../../server/src/tools/write.ts#L108-L125) 移除 `if (await fileExists(...))`，改用 `writeFile(..., "wx")` + try/catch |
| kbWriteExperience fileExists 预检查已移除 | ✅ | [write.ts:193-209](../../server/src/tools/write.ts#L193-L209) 同上模式 |
| kbPromoteExperience promote fileExists 预检查已移除 | ✅ | [write.ts:312-329](../../server/src/tools/write.ts#L312-L329) 同上模式 |
| flag:'wx' = O_EXCL 原子创建 | ✅ | [fileio.ts:23-30](../../server/src/utils/fileio.ts#L23-L30) `fs.writeFile(filePath, content, { encoding, flag })`，flag='wx' 透传 |
| 残留 TOCTOU 模式（fileExists 后跟 writeFile 创建） | ✅ 无 | Select-String 确认 write.ts 剩余 2 处 fileExists（[L53](../../server/src/tools/write.ts#L53) 源文件存在检查、[L246](../../server/src/tools/write.ts#L246) inbox 存在检查）后跟 readFile 读取，非 writeFile 创建，不构成 TOCTOU |

**结论**：CWE-367 TOCTOU 竞态已完全修复，无残留竞态窗口。

### 8.2 敏感信息泄露检查

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 错误消息不含密钥/令牌/密码 | ✅ | 三处 errorResult 只含 wiki 相对路径（如 `wiki/coding/article.md`），无凭证 |
| 错误消息不含系统绝对路径 | ✅ | 路径来自系统计算的 wikiRelPath/inboxRelPath/activeRelPath（相对路径），非绝对路径 |
| throw err 不直接输出给终端用户 | ✅ | throw err 抛出的原始 Node.js 错误由 MCP SDK 捕获转换（既有架构，非 DEF-001 引入） |
| 日志不含敏感信息 | ✅ | DEF-001 未修改日志逻辑；appendLogEntry 的 details 含 inbox/wiki 相对路径 + confidence，无凭证 |

### 8.3 其他安全检查（复核 guardrail）

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| CWE-22 路径遍历 | ✅ 未受影响 | DEF-001 未修改路径校验；3 处 path.relative + startsWith("..") 检查保留（[L93-96](../../server/src/tools/write.ts#L93-L96)、[L178-181](../../server/src/tools/write.ts#L178-L181)、[L303-306](../../server/src/tools/write.ts#L303-L306)） |
| CWE-703 异常处理不当 | ✅ 无风险 | throw err 重新抛出非 already-exists 错误，符合 CLAUDE.md §19.4 "不吞异常" |
| 硬编码密钥 | ✅ 无 | diff 中无任何凭证字符串 |
| 依赖/供应链 | ✅ 无风险 | 无 package.json/package-lock.json 变更 |

## 9. 验收标准覆盖矩阵

| AC ID | 验收标准 | 测试用例 ID | 结果 | 证据 |
| --- | --- | --- | --- | --- |
| AC-1 | TOCTOU 消除（kbWriteExperience 改用 flag:'wx'） | TC-DEF001-002, TC-DEF001-006 | ✅ Pass | [write.ts:193-209](../../server/src/tools/write.ts#L193-L209) fileExists 移除 + writeFile('wx')；测试 12.4ms 通过 |
| AC-2 | 同类 TOCTOU 一并修复（kbIngestSource/kbPromoteExperience promote） | TC-DEF001-001, TC-DEF001-003 | ✅ Pass | [write.ts:108-125](../../server/src/tools/write.ts#L108-L125) + [write.ts:312-329](../../server/src/tools/write.ts#L312-L329)；测试 39.1ms/52.6ms 通过 |
| AC-3 | 错误消息文本完全保留 | TC-DEF001-001/002/003 | ✅ Pass | diff 字节级确认 3 处消息文本与修复前一致；测试断言 /already exists/i 通过 |
| AC-4 | 错误处理合规（非 already-exists 错误 rethrow） | TC-DEF001-006 | ✅ Pass | [write.ts:124](../../server/src/tools/write.ts#L124)/[208](../../server/src/tools/write.ts#L208)/[328](../../server/src/tools/write.ts#L328) `throw err`；isAlreadyExistsError 白盒覆盖 3 分支 |
| AC-5 | 向后兼容（writeFile 可选 flag，默认 'w'） | TC-DEF001-005 | ✅ Pass | Select-String 确认 9 处 fileio.writeFile 调用：3 处传 'wx'，6 处不传（read-only.ts:209、write.ts:360 reject、index-md.ts×3、dream.ts:145）用默认 'w'；既有集成测试通过 |
| AC-6 | 3 函数 already-exists 路径测试覆盖 | TC-DEF001-001/002/003 | ✅ Pass | kbIngestSource 新测试 + kbWriteExperience 既有测试 + kbPromoteExperience promote 新测试，三函数均覆盖 |
| AC-7 | typecheck 通过 | TC-DEF001-010 | ✅ Pass | `tsc --noEmit` 退出码 0，无输出 |
| AC-8 | 无回归 | TC-DEF001-011 | ✅ Pass | 53/54 通过，唯一失败是 DEF-006 既有 flaky（lint-perf p50 噪声），与 DEF-001 代码路径无交集 |

## 10. 缺陷列表

| 缺陷 ID | 严重度 | 相关 AC | 描述 | 复现步骤 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 无 | — | — | DEF-001 修复未引入任何新缺陷 | — | — |

**既有缺陷（非 DEF-001 引入，记录供追踪）**：

| 缺陷 ID | 严重度 | 描述 | 归属 | 处置 |
| --- | --- | --- | --- | --- |
| DEF-006 | 低（flaky） | lint-perf 1000 页 missing_xref 扫描 p50=1313ms 超 1000ms 阈值（Windows I/O 噪声） | 既有技术债 | ADR-008 已登记，独立任务处置，不阻断 DEF-001 |
| 既有-1 | 低 | promote 中 writeFile('wx') 成功后 unlink(inbox) 前崩溃 → active 已创建但 inbox 未删 | 既有架构问题 | 非 DEF-001 引入（原代码同样有），新代码更安全（拒绝覆盖）。建议后续 P2 任务审计 |

## 11. 未覆盖项与风险

| 未覆盖项 | 原因 | 风险评估 | 缓解/建议 |
| --- | --- | --- | --- |
| 真实 EPERM（权限失败）场景测试 | 单测环境难稳定模拟：Windows chmod 行为与 POSIX 不同，跨平台 CI 不稳定 | 低 — guardrail 确认为可用性权衡非安全漏洞，误报只影响错误消息文本，不影响 O_EXCL 原子性或路径遍历防护 | isAlreadyExistsError 逻辑极简已被白盒覆盖；guardrail §6.2 建议后续可用 `process.platform === 'win32'` 区分 EPERM（低优先级优化） |
| 跨进程真实并发竞态测试 | O_EXCL 原子性由 OS 内核保证，应用层并发测试验证的是 OS 而非应用代码 | 低 — 现有"第二次写→EEXIST"测试语义等价于并发后到者；guardrail 确认测试充分 | 可选：用 `worker_threads` 构造 N 线程同 title 并发，验证只一个成功（nice-to-have，非必须） |
| MCP SDK 错误响应脱敏 | MCP SDK 是否在错误响应中暴露 throw err 的原始错误（含 errno/path）取决于 SDK 版本 | 低 — 既有架构问题，非 DEF-001 引入 | guardrail §6.3 建议：后续 P1 任务审计 MCP SDK 错误响应行为，必要时在 dispatcher 层加脱敏中间件 |
| promote unlink 前崩溃的部分失败 | 需进程崩溃注入，单测难复现 | 低 — 既有问题，新代码更安全 | 后续 P2 任务审计 promote 事务性 |

## 12. 主 Agent 自问答复总结

| 自问 | 主 Agent 顾虑 | ac-verifier 结论 | 是否阻断 |
| --- | --- | --- | --- |
| EPERM 权衡可测试性 | 测试无法区分 Windows 锁定 EPERM 与真正权限失败 EPERM | 无需补充 EPERM 模拟测试：单测难稳定模拟，函数逻辑已被白盒覆盖，guardrail 确认为可用性权衡非安全漏洞 | 否 |
| 并发测试缺失 | 没加跨进程真实并发测试，应用层无并发证明 | OS 级原子性保证 + already-exists 路径覆盖已构成充分验收：O_EXCL 是内核原子操作，单测"第二次写→EEXIST"语义等价于并发后到者 | 否 |

两项顾虑均评估为**不阻断**，与 guardrail-enforcer 结论一致。

## 13. 综合结论

- [x] **全部通过且无回归 — 本轮开发周期闭合**

### 13.1 结论依据

| 维度 | 结论 | 关键证据 |
| --- | --- | --- |
| AC-1 TOCTOU 消除 | ✅ Pass | [write.ts:193-209](../../server/src/tools/write.ts#L193-L209) fileExists 移除 + writeFile('wx') |
| AC-2 同类 TOCTOU 修复 | ✅ Pass | kbIngestSource/promote 同模式修复，2 新测试通过 |
| AC-3 错误消息保留 | ✅ Pass | diff 字节级确认 3 处消息文本一致 |
| AC-4 不吞异常 | ✅ Pass | 3 处 throw err + isAlreadyExistsError 白盒覆盖 |
| AC-5 向后兼容 | ✅ Pass | 9 处调用点：3 传 'wx'，6 用默认 'w'，既有测试通过 |
| AC-6 测试覆盖 | ✅ Pass | 3 函数 already-exists 路径均有测试 |
| AC-7 typecheck | ✅ Pass | tsc --noEmit 退出码 0 |
| AC-8 无回归 | ✅ Pass | 53/54，唯一失败是 DEF-006 flaky 无关 |
| 性能回退 | ✅ Pass | 首版基线 p50=4.285ms，无热路径变更，实际减少 I/O |
| 安全（CWE-367） | ✅ Pass | TOCTOU 完全消除，无残留竞态窗口 |
| 安全（信息泄露） | ✅ Pass | 错误消息只含相对路径，无凭证 |
| 任务令牌验证 | ✅ Pass | 本报告元信息包含 TKN-DEF-001-002 |

### 13.2 声明

**DEF-001（kb_write_experience / kb_ingest_source / kb_promote_experience TOCTOU 竞态修复）通过 ac-verifier 分层验收验证。全部 8 条验收标准通过，无性能回退，无安全漏洞，无 DEF-001 引入的回归。唯一失败测试（lint-perf）经归因分析确认为 DEF-006 既有 flaky，与本任务代码路径无交集。**

**本轮开发周期闭合。主 Agent 无需回退修复。**

### 13.3 跟进建议（不阻断，供主 Agent 后续任务参考）

1. **README 索引更新**：本报告已生成，建议主 Agent 在 `docs/reports/README.md` 追加 acceptance 报告索引条目（CLAUDE.md §14）。
2. **DEF-006 处置**：lint-perf flaky 为独立技术债，建议在 DEF-006 任务中调优 p50 阈值或改用更稳定的性能断言策略。
3. **并发测试（可选）**：若希望增加信心，可按 guardrail §6.4 建议用 `worker_threads` 补充跨进程并发测试（nice-to-have）。
4. **EPERM 平台判断（可选）**：guardrail §6.2 建议 `process.platform === 'win32'` 时才匹配 EPERM，POSIX 上只匹配 EEXIST（低优先级优化）。
