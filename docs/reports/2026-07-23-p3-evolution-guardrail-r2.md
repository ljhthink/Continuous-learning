# 安全与质量审计报告 · P3 持续进化闭环（第二轮复审）

## 元信息

| 项目 | 内容 |
| --- | --- |
| 执行 Agent | guardrail-enforcer |
| 任务令牌 | TKN-P3-EVOLUTION-002 |
| 任务域 | p3-evolution（Q1/Q2/Q3 修复复审） |
| 报告日期 | 2026-07-23 |
| 前序报告 | [2026-07-23-p3-evolution-guardrail.md](2026-07-23-p3-evolution-guardrail.md)（TKN-P3-EVOLUTION-001，结论：有条件通过） |
| 审查范围 | 4 个文件：[server/src/tools/read-only.ts](../../server/src/tools/read-only.ts)（Q1）、[server/src/dream.ts](../../server/src/dream.ts)（Q2）、[server/src/tools/write.ts](../../server/src/tools/write.ts)（Q3）、[server/src/tests/p3-evolution.test.ts](../../server/src/tests/p3-evolution.test.ts)（新增 2 反向用例）；输入边界审计延伸至 [server/src/schemas.ts](../../server/src/schemas.ts)、[server/src/index.ts](../../server/src/index.ts)、[server/src/config.ts](../../server/src/config.ts)、[server/src/tools/helpers.ts](../../server/src/tools/helpers.ts) |
| 风险等级 | P2（跨模块；见 [ADR-006](../decisions/ADR-006-continuous-evolution-loop.md)） |
| 测试基线 | `npm test`：43 通过 / 0 失败 / 0 跳过（9237ms）—— 复审独立复核确认 |
| 审查方法论 | TRAE-code-review skill（意图推断 / Mermaid / 问题扫描 / 自审交叉验证 fallback）+ TRAE-security-review skill（Pass A/B/C 源到汇追踪 / 严重度置信度 / §8 硬排除） |
| 主 Agent 签发上下文 | 盲区 1：Q3 是否误伤合法"重新审核"场景、reject 后是否无复活路径、Q3 是否覆盖所有非法 type/status 组合；盲区 2：Q2 try-catch 是否掩盖应中止的严重错误、是否存在"writeFile 成功但 unlink 失败致 active/archive 双份"的数据不一致风险；盲区 3：kb_promote_experience 作为对外 MCP tool 的输入信任边界 |

## 1. 审查依据

- 本次代码变更：工作区未 commit 变更（Q1/Q2/Q3 修复增量 + 2 新增测试），通过 `git diff` 与逐文件 Read 核实
- 影响自检结果：主 Agent 提交的 §9 自检（无接口/契约/依赖变更，Q3 为收紧契约非破坏性）
- 相关 ADR：[ADR-006-continuous-evolution-loop.md](../decisions/ADR-006-continuous-evolution-loop.md)
- 规约依据：[AGENTS.md](../../AGENTS.md) §7.4（两 tier 审核 / 状态机 pending→active→archived，rejected 终态）/ §7.5（老化）；[CLAUDE.md](../../CLAUDE.md) §7.2（闭环）/ §9（影响自检）/ §10（guardrail 强制）/ §19.4（不吞异常 / graceful degradation）/ §20.4（任务令牌）
- 第一轮阻塞项：Q1（空 catch）/ Q2（dream 无容错）/ Q3（promote 无状态机校验）
- 测试框架与基础用例：[p3-evolution.test.ts](../../server/src/tests/p3-evolution.test.ts)（43 用例，含本轮新增 2 个反向用例）

## 2. 作者意图推断（TRAE-code-review Step 3）

本次变更是**防御性补强**，意图为闭合第一轮 guardrail-enforcer 识别的 3 个中风险缺陷：

- Q1：kb_get_page use_count 回写空 catch 增加日志 —— 落实 CLAUDE.md §19.4「不吞异常」
- Q2：/dream demote 段整体 try-catch —— 落实「单卡失败不中断批量老化」的 graceful degradation
- Q3：kb_promote_experience 增加 type/status 状态机校验 —— 落实 AGENTS.md §7.4 状态机不变量

意图清晰，与第一轮修复建议逐条对应。因属防御性重构，"缺失校验"类发现的判定门槛相应提高。

## 3. 逐条根因消除复核（核心）

> 复审标准：不只验证"加了代码"，而是验证"问题根因消除 + 未引入新缺陷"。

### 3.1 Q1：use_count 回写空 catch 违反 §19.4 —— 已闭合

**位置**：[read-only.ts:L208-L215](../../server/src/tools/read-only.ts#L208-L215)

**第一轮现状**：`catch { /* Non-fatal */ }` 空块，无日志。

**修复后代码**：

```typescript
  try {
    await writeFile(fullPath, serializeFrontmatter(frontmatter, body));
  } catch (err) {
    // Non-fatal: use_count persistence is best-effort, but surface real
    // failures (e.g., read-only filesystem during a CI lint pass) to stderr
    // instead of silently swallowing them (CLAUDE.md §19.4 "不吞异常").
    console.error(`[kb-mcp] kb_get_page: failed to persist use_count for ${fullPath}:`, err);
  }
```

**根因消除验证**：

- [x] catch 捕获 `err` 并 `console.error` 输出 —— §19.4「禁止空 catch 块 / 所有异常必须被记录或向上传播」满足
- [x] 保留 best-effort 语义（错误不上抛，读操作仍返回内容）—— 与 ADR-006 D2「写失败非致命」一致
- [x] 日志含 `fullPath` 上下文，优于第一轮建议（便于定位），与既有 [kb_list_categories:L123](../../server/src/tools/read-only.ts#L123) `console.error(... ${file}:, err)` 模式一致
- [x] 注释显式引用 §19.4，假设显式化

**结论**：Q1 根因消除。✅

### 3.2 Q2：dream 写入/移动段无 try-catch —— 已闭合

**位置**：[dream.ts:L123-L167](../../server/src/dream.ts#L123-L167)

**第一轮现状**：读取段（L103-108）有 try-catch continue，但写入段（ensureDir→writeFile→unlink→removePageFromIndex→appendLogEntry）无容错，单卡失败中断整个 batch。

**修复后代码**：demote 段整体包裹于 `try { ... } catch (err) { console.error(...); continue; }`，try 体覆盖 archivePath 构造、frontmatter 改写、ensureDir、writeFile、unlink、removePageFromIndex、appendLogEntry、report 计数全段。

**根因消除验证**：

- [x] 单卡任一步失败被捕获，`continue` 跳到 for 循环下一文件 —— 「单卡失败不中断 batch」目标达成
- [x] catch 内 `console.error(`[dream] failed to demote ${file}:`, err)` 落实 §19.4 不吞异常
- [x] try 范围正确：`report.demoted++` / `report.demoted_paths.push` 在 try 内，仅全部成功才计数 —— 不会虚报 demoted 数
- [x] 与读取段（L103-108）容错策略一致

**主 Agent 自问 2 担忧复核 —— 多步非原子性的数据一致性**：

demote 操作顺序为 `writeFile(archive) → unlink(active) → removePageFromIndex → appendLogEntry`。在 try-catch 容错下，逐一推演中间失败态：

| 失败点 | 状态 | 下次 dream 自愈性 | 定级 |
| --- | --- | --- | --- |
| writeFile(archive) 失败 | archive 未写、active 仍在、index 仍指向 active | 完全自愈（下次重试） | 低 |
| unlink(active) 失败 | archive 已写、active 仍在（双份）、index 仍指向 active | 自愈（下次 writeFile 覆盖 archive + unlink 成功 + removePageFromIndex 清理） | 低 |
| removePageFromIndex 失败 | active 已删、archive 在、index 仍指向已删 active（悬空链接） | **不可自愈**，需 lint orphans 检测清理 | 低 |
| appendLogEntry 失败 | 文件已移动、index 已清，仅缺日志 | 功能一致，日志缺失 | 低 |

- 上述均为 **graceful degradation**（§19.4），操作员可通过 stderr `[dream] failed to demote ${file}` 发现
- 「unlink 成功后 removePageFromIndex 失败致 index 悬空」是真实的中间不一致态，但属**第一轮 Q4 已定性的非原子性数据健壮性问题**（ADR-006 后果段已承认「promote/dream 文件移动非原子，当前无事务，未来可加 journal」），**非本次 Q2 修复引入的新缺陷**，亦非安全漏洞（无 RCE / 数据泄露 / 提权，输入无 attacker-controlled 源）
- lint 工具具备 orphans 检测（AGENTS.md §6.2），可清理悬空索引条目

**结论**：Q2 根因消除（单卡失败中断 batch 已解决）。多步非原子性的数据一致性属已知低风险（Q4 同类，ADR 已承认），不阻断，记为低风险建议 R1。✅

### 3.3 Q3：promote 未校验 type===experience && status===pending —— 已闭合

**位置**：[write.ts:L232-L246](../../server/src/tools/write.ts#L232-L246)

**第一轮现状**：promote 只检查 `domains.length > 0`，未校验 type/status，可把 concept/source 页面移入 experiences/ 并改 status=active，破坏状态机。

**修复后代码**：

```typescript
  if (frontmatter.type !== "experience") {
    return errorResult(
      `Cannot ${action}: page type is "${frontmatter.type ?? "unknown"}", expected "experience". Only experience cards go through the review gate.`
    );
  }
  if (frontmatter.status !== "pending") {
    return errorResult(
      `Cannot ${action}: page status is "${frontmatter.status ?? "unknown"}", expected "pending". Only inbox-pending experience cards can be promoted or rejected.`
    );
  }
```

**根因消除验证**：

- [x] type 与 status 双重校验，位于 readFile/parseFrontmatter 之后、action 分支之前 —— 正确卡位
- [x] 错误信息含实际值与期望值，fail-fast 清晰（§19.4）
- [x] 校验对 promote 与 reject 两个 action 均生效（在 action 分支前）

**主 Agent 自问 1 担忧复核 —— 是否误伤合法"重新审核"场景**：

独立对照 AGENTS.md §3.4 / §7.4 状态机：

```text
experience: pending(inbox) → active(正式) → archived(老化降级)
                  ↓
              rejected(终态，不进正式库)
```

逐一验证 Q3 校验对所有 type/status 组合的判定：

| 输入页面 | Q3 判定 | 是否符合状态机 |
| --- | --- | --- |
| type=experience, status=pending → promote | 通过 → active | ✅ 合法迁移 |
| type=experience, status=pending → reject | 通过 → rejected | ✅ 合法迁移 |
| type=experience, status=active → promote/reject | 拒绝（status!==pending） | ✅ active 不应 re-promote/re-reject |
| type=experience, status=archived → promote/reject | 拒绝 | ✅ archived 仅由 dream 老化产生 |
| type=experience, status=rejected → promote/reject | 拒绝 | ✅ rejected 是终态，无复活路径 |
| type=concept/entity/source → promote/reject | 拒绝（type!==experience） | ✅ 非经验卡不进审核门禁 |

- **rejected 无复活路径是设计预期**：AGENTS.md §7.4 明确「rejected（驳回，不进入正式库）」。若需"复活"，应重新 `kb_write_experience` 创建新 pending 卡片，而非 promote 旧 rejected 卡片
- Q3 校验**完全覆盖所有非法 type/status 组合**，不误伤任何合法场景
- 不会误伤 kb_ingest_source 写入的 staging 页（type=source, status=staging → 被 type 校验拒绝，符合预期）

**结论**：Q3 根因消除，状态污染路径闭合。✅

## 4. 代码质量审查（TRAE-code-review）

### 4.1 Karpathy Guidelines 合规性

| 项 | 结论 | 说明 |
| --- | --- | --- |
| 命名 | 通过 | Q1/Q2/Q3 均为 surgical 改动，无新命名引入；catch 变量 `err` 与既有模式一致 |
| 设计简洁性 | 通过 | Q1 仅补日志；Q2 整体 try-catch 无过度抽象；Q3 双 if 校验直白，无冗余抽象 |
| 错误处理 | 通过 | Q1/Q2 catch 均含 console.error；Q3 fail-fast errorResult。三处均落实 §19.4 |
| 假设显式化 | 通过 | Q1 注释引用 §19.4 + 解释 best-effort；Q2 注释解释 batch 容错理由；Q3 注释引用 AGENTS.md §7.4 + 解释状态机不变量 |
| Surgical changes | 通过 | 三处修复均最小侵入，未改动无关逻辑 |

### 4.2 逻辑与回归

- **Q1**：catch 行为变更不影响成功路径，读操作返回内容语义不变。无回归。
- **Q2**：try-catch 仅改变失败路径行为（continue 而非抛出中断），成功路径 report 计数逻辑不变。无回归。
- **Q3**：收紧契约——非法输入返回 isError。合法调用者（kb_write_experience 写入的 pending experience）行为不变。是对 ADR-006 D3 契约的强制实现，非破坏性。无回归。
- **跨模块影响**：Q1/Q2/Q3 修复均未改函数签名/路由/数据结构。kb_get_page / dream / kb_promote_experience 的调用者（[index.ts](../../server/src/index.ts) MCP 注册、p3-evolution.test.ts）不受成功路径行为变更影响。

### 4.3 测试充分性

新增 2 个反向用例（[p3-evolution.test.ts:L226-L288](../../server/src/tests/p3-evolution.test.ts#L226-L288)）：

| 用例 | 覆盖 | 断言 |
| --- | --- | --- |
| `refuses non-experience page` | Q3 type 校验（type=concept, status=pending → promote） | `isError===true` + `/expected "experience"/` |
| `refuses non-pending experience` | Q3 status 校验（type=experience, status=active → reject） | `isError===true` + `/expected "pending"/` |

- 两用例直接对应 Q3 修复的两条校验分支，断言精确
- 全量 43 测试通过（含 P1 原有 31 + P3 新增 10 + 本轮新增 2），0 失败
- **测试缺口（低风险，不阻断）**：第一轮 Q9 列出的 promote 路径遍历测试、active 已存在冲突测试、use_count 回写失败降级测试、dream 单文件失败不中断批量测试，本轮未补。建议后续提交补齐

### 4.4 自审交叉验证（fallback 模式）

对每个发现重新挑战「这真的是问题吗」：

- Q1/Q2/Q3 根因消除：经逐行复核确认，非虚报
- R1（dream index 悬空）：真实存在，但属 Q4 同类已知低风险，ADR 已承认，需 lint 清理 → 保留为低风险建议
- R2（console.error 绝对路径）：§19.3 针对结构化日志，console.error 是 stderr 运维通道且既有模式一致 → 保留为低风险建议，不升级
- R3（handler action 非穷尽）：MCP 路径有 Zod enum 保护，仅测试直接 import 可达 → 保留为低风险防御性建议
- R4（文档不一致）：第一轮 Q6/Q7 已记录，本轮未修复 → 保留为低风险追踪项

## 5. 安全漏洞扫描（TRAE-security-review）

### 5.1 Pass A — 项目安全基线

既有安全原语：`DOMAIN_REGEX` kebab-case 校验（[schemas.ts:L47](../../server/src/schemas.ts#L47)）、`path.relative` + `startsWith("..")` + `isAbsolute` 路径遍历检查、`sanitizeIndexField`/`sanitizeLogField` CR/LF 剥离（CWE-117）、js-yaml v4 safe load（CWE-94）、Zod schema 输入校验。

### 5.2 Pass B — 偏离映射

- Q1 修复：catch + console.error，沿用项目既有模式（与 kb_list_categories L123 一致），无偏离
- Q2 修复：try-catch + console.error + continue，沿用 dream 读取段既有模式，无偏离
- Q3 修复：type/status 校验 + errorResult，沿用项目既有 errorResult 模式，且**新增**状态机防御层，补齐了第一轮识别的缺失校验

三处修复均未引入绕过既有安全原语的新处理路径。

### 5.3 Pass C — 源到汇追踪

| 候选 | 源 | 汇 | 路径上的防御 | 结论 |
| --- | --- | --- | --- | --- |
| C1：Q3 状态污染路径是否仍存在 | MCP 客户端 inbox_path + 文件 frontmatter（type/status 可篡改） | writeFile(activeFullPath) + fs.unlink（文件移动 + 状态改写） | Zod inbox_path max(512) → path.relative 遍历检查 → fileExists → parseFrontmatter → **Q3 type/status 校验（新增）** → action 分支 | **状态污染路径已闭合**，无可利用漏洞 |
| C2：Q2 try-catch 后 active/archive 双份 | 无 attacker-controlled 源（dream 输入来自文件系统遍历） | 文件系统状态 | N/A | §8 硬排除：数据完整性问题，非安全漏洞（无 RCE/泄露/提权），不报告 |
| C3：Q1 console.error 输出 fullPath | fullPath（本地 KB 路径） | stderr | N/A | §8.4：非 secret/credential/PII，Logging non-PII business values is safe，不报告 |
| C4：frontmatter.domain 篡改致路径遍历 | frontmatter.domain（可手动篡改为 `../..`） | path.join(wikiDir, domain, ...) | Q3 校验后 → L282-L285 `path.relative(wikiDir, activeFullPath)` + `startsWith("..")` + `isAbsolute` 运行时拦截 | defense-in-depth 充分，无可利用漏洞（第一轮 §3.2 已确认） |
| C5：action 非 promote/reject 被当 reject | MCP 客户端 action 参数 | reject 分支（status=rejected + writeFile） | [schemas.ts:L110-L114](../../server/src/schemas.ts#L110-L114) `z.enum(["promote","reject"])` 在 MCP SDK 层拦截非法值，handler 不被调用 | MCP 路径下不可达；测试直接 import 为受控输入。无可利用漏洞，记为低风险防御性建议 R3 |

### 5.4 输入边界审计（主 Agent 自问 3 重点）

kb_promote_experience 作为对外 MCP tool 的输入信任边界，逐参数审计：

| 参数 | Zod 层（第一道） | Handler 层（第二道） | 评估 |
| --- | --- | --- | --- |
| `inbox_path` | `z.string().max(512)` | path.resolve + path.relative + startsWith("..") + isAbsolute 遍历检查（L219-L224）+ fileExists（L225-L227）+ Q3 type/status 校验（L232-L246） | 充分，多层 defense-in-depth |
| `action` | `z.enum(["promote","reject"])` | if(action==="promote") {...} // else reject | MCP 路径充分；handler 内 action 非穷尽（R3 低风险建议） |
| frontmatter.type | N/A（文件内容） | Q3 `!== "experience"` 校验 | 充分 |
| frontmatter.status | N/A（文件内容） | Q3 `!== "pending"` 校验 | 充分 |
| frontmatter.domain | N/A（文件内容） | L282-L285 path.relative 运行时遍历检查 | 充分 |
| frontmatter.confidence | N/A（文件内容） | `typeof number` 检查（无 0-1 范围重校验） | 仅影响 tier 标签，不影响安全（第一轮 §3.3 已定级低风险） |

**输入边界结论**：Q3 修复使 kb_promote_experience 的输入信任边界完整闭合。inbox_path 经 Zod + 遍历检查 + 存在性 + 类型/状态四层校验；action 经 Zod enum 兜底。无未校验的 attacker-controlled 输入可达危险汇。

### 5.5 安全扫描结论

**无 exploitable 安全漏洞。** Q1/Q2/Q3 修复未引入新安全缺陷；Q3 修复闭合了第一轮识别的状态污染路径。所有候选均在 §8 硬排除范围内或被现有 defense-in-depth 拦截。无注入 / 密钥 / 供应链风险（无新增依赖，dream.ts 用 node:url 内置模块）。

## 6. 回归风险评估

| 维度 | 评估 |
| --- | --- |
| 成功路径行为变更 | Q1/Q2 不变；Q3 仅对非法输入收紧（合法调用者不变） |
| 接口/契约 | 无签名/路由/数据结构变更；Q3 是对 ADR-006 D3 契约的强制实现 |
| 依赖/环境 | 无新增/删除/升级 |
| 跨模块调用者 | index.ts MCP 注册、p3-evolution.test.ts 均不受成功路径影响 |
| 测试 | 43/0 通过，无回归 |
| 既有安全原语 | 未被绕过，Q3 反而补强 |

**回归风险：低。**

## 7. 综合结论

- [x] **通过**：可进入 ac-verifier 测试阶段
- [ ] 有条件通过
- [ ] 阻断

**安全维度**：通过。无 exploitable 漏洞，Q3 状态污染路径已闭合，输入边界完整，无新缺陷引入。

**质量维度**：通过。Q1/Q2/Q3 三个中风险阻塞项根因均真正消除（非仅"加了代码"），surgical changes，无逻辑错误，无回归，测试覆盖修复路径。43/0 测试通过。

**复审结论**：第一轮"有条件通过"的 3 项中风险阻塞项（Q1/Q2/Q3）均已闭合，本轮未发现新的阻断级或高风险问题。**主 Agent 可进入 ac-verifier 验收测试阶段。**

## 8. 低风险建议（不阻断，供后续提交追踪）

| No. | 建议 | 严重度 | 位置 | 说明 |
| --- | --- | --- | --- | --- |
| R1 | dream demote 多步非原子性：unlink 成功后 removePageFromIndex 失败致 index 悬空链接 | 低 | [dream.ts:L144-L147](../../server/src/dream.ts#L144-L147) | 与第一轮 Q4 同类，ADR-006 已承认无事务。建议未来加 journal，或将 removePageFromIndex 单独 try-catch（失败仅记日志不中断）。lint orphans 可清理悬空条目 |
| R2 | console.error 输出绝对本地路径 | 低 | [read-only.ts:L214](../../server/src/tools/read-only.ts#L214)、[dream.ts:L165](../../server/src/dream.ts#L165) | §19.3 针对结构化日志，console.error 为 stderr 运维通道且与既有模式一致，非敏感信息（非 secret/PII）。建议未来统一日志脱敏（输出相对路径） |
| R3 | kbPromoteExperience handler 内 action 非穷尽检查 | 低 | [write.ts:L254-L339](../../server/src/tools/write.ts#L254-L339) | MCP 路径有 Zod enum 保护；若测试直接 import 传 action="foo" 会落入 reject 段。建议加 `else return errorResult("Unknown action")` 增强防御深度 |
| R4 | 第一轮 Q6/Q7 文档不一致未修复 | 低 | [schemas.ts:L4](../../server/src/schemas.ts#L4)（"8 tools"）、ARCH.md §4.2 status 枚举缺 rejected | 本轮聚焦 Q1/Q2/Q3，文档不一致未同步。建议后续提交一并修复 |
| R5 | 测试缺口（第一轮 Q9 遗留） | 低 | [p3-evolution.test.ts](../../server/src/tests/p3-evolution.test.ts) | 缺 promote 路径遍历测试、active 已存在冲突测试、use_count 回写失败降级测试、dream 单文件失败不中断批量测试。建议后续补齐 |

## 9. 待澄清

1. **R1 自愈边界**：dream「unlink 成功 + removePageFromIndex 失败」的 index 悬空态需 lint 清理，建议主 Agent 确认 lint orphans 检测能覆盖此场景（预期可覆盖，因 active 文件已不存在而 index 仍引用）。此为低风险，不阻塞本轮。
2. **Q3 与既有 ingest 路径一致性**：kb_ingest_source 写 staging 页（type=source, status=staging），误对 staging 页调 promote 会被 Q3 正确拒绝。此为期望行为，无需澄清。
3. **前置产出物无矛盾**：ADR-006、ARCH.md §3.1、AGENTS.md §7.4/§7.5 与 Q1/Q2/Q3 修复实现一致，未发现文档间矛盾。

## 10. 自动化建议（CI/CD 集成）

延续第一轮建议，针对本轮修复模式补充：

1. **状态机校验回归测试**（对应 Q3）：本轮新增 2 反向用例已纳入 CI。建议扩展为参数化测试，覆盖 type∈{concept,entity,source,undefined} × status∈{active,archived,rejected,staging,undefined} 全组合，防止状态机退化。
2. **空 catch 检测**（对应 Q1）：ESLint `no-useless-catch` + 自定义规则检测无 console/error 报告的 catch 块，CI 失败禁止合并。
3. **批量容错测试**（对应 Q2）：补充 dream 单文件失败不中断批量测试（mock writeFile 抛错，断言后续文件仍被处理）。
4. **Semgrep 规则**：针对 MCP tool handler 的 frontmatter type/status 校验模式添加规则，确保所有状态迁移操作前置校验。
5. **文档一致性扩展**：`scripts/consistency-check.js` 扩展检查 schemas.ts 注释工具数与 index.ts 实际注册数一致（对应 R4）。
