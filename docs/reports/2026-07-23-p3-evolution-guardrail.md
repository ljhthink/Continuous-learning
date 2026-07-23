# 安全与质量审计报告 · P3 持续进化闭环

## 元信息

| 项目 | 内容 |
| --- | --- |
| 执行 Agent | guardrail-enforcer |
| 任务令牌 | TKN-P3-EVOLUTION-001 |
| 任务域 | p3-evolution（config 函数化 + kb_promote_experience + /dream 老化 + use_count 回写） |
| 报告日期 | 2026-07-23 |
| 审查范围 | 17 个文件：server/src/ 下 config.ts、dream.ts、index.ts、schemas.ts、tools/{lint,search,read-only,write}.ts、utils/{index-md,log}.ts、tests/{setup,p3-evolution}.ts、package.json；docs/ARCH.md、docs/decisions/ADR-006、docs/decisions/README.md、README.md |
| 风险等级 | P2（跨模块：config 公共接口 const→function + 新增第 9 个 MCP 工具 + kb_get_page 副作用契约变更） |
| 主 Agent 签发上下文 | 盲区 1：promote 的 writeFile→unlink 非原子，中途崩溃致 inbox/active 并存；盲区 2：kb_get_page use_count read-modify-write 非原子，多客户端并发丢更新 |

## 1. 审查依据

- 本次代码变更：工作区未 commit 变更（`git diff` + 2 个未跟踪新文件 dream.ts / p3-evolution.test.ts）
- 影响自检结果：主 Agent 提交的变更清单与 §9 自检结果（见任务令牌上下文）
- 相关 ADR：[ADR-006-continuous-evolution-loop.md](../decisions/ADR-006-continuous-evolution-loop.md)
- 接口契约：[ARCH.md](../ARCH.md) §3.1
- 规约依据：[AGENTS.md](../../AGENTS.md) §7.4（两 tier 审核）/ §7.5（老化淘汰）；[CLAUDE.md](../../CLAUDE.md) §19.4（不吞异常）/ §9（影响自检）/ §7.2（闭环）
- 测试框架与基础用例：[p3-evolution.test.ts](../../server/src/tests/p3-evolution.test.ts)（7 用例）
- 审查方法论：TRAE-code-review skill（Karpathy Guidelines、意图推断、问题扫描）+ TRAE-security-review skill（Pass A/B/C 源到汇追踪、严重度/置信度、硬排除过滤）

## 2. 代码质量审查（TRAE-code-review）

### 2.1 作者意图推断

本次变更意图为闭合 P3 持续进化生命周期：(a) 将 config 路径常量从模块加载求值改为调用时求值，消除测试子进程 workaround；(b) 实现 AGENTS.md §7.4 两 tier 审核门禁（kb_promote_experience）与 §7.5 老化机制（/dream 脚本 + kb_get_page use_count 自增）。整体属于防御性重构 + 新功能叠加，意图清晰，ADR-006 备选方案与后果分析充分。

### 2.2 Karpathy Guidelines 合规性

| 项 | 结论 | 说明 |
| --- | --- | --- |
| 命名 | 通过 | getKbRoot/getRawDir 等函数命名清晰；kbPromoteExperience/dream 语义准确；tier 变量名副其实 |
| 设计简洁性 | 通过 | config 函数化无过度抽象；lint/search hoist getKbRoot 注释说明充分；dream isMain guard 标准做法 |
| 错误处理 | 有条件通过 | lint/search/kb_list_categories 空 catch 已补 console.error；但 use_count 回写新增空 catch 遗漏（见 2.5-1）；dream 写入段无容错（见 2.5-2） |
| 假设显式化 | 通过 | config.ts 顶部注释显式说明"不可跨 KB_ROOT 切换缓存"；promote tier 判定注释引用 AGENTS.md §7.4 |

### 2.3 逻辑与性能

- **config 函数化性能**：每次调用读 `process.env.KB_ROOT` + `path.resolve`，微秒级，可忽略。lint.ts/search.ts 已正确 hoist 到循环外（[lint.ts:L193](../../server/src/tools/lint.ts#L193)、[search.ts:L62](../../server/src/tools/search.ts#L62)），lint-perf.test.ts 守护 1000 页 p50 < 1000ms。通过。
- **use_count 回写语义**：回写完整原始 body 而非 section 截断视图（[read-only.ts:L205-L212](../../server/src/tools/read-only.ts#L205-L212)），p3-evolution.test.ts 第 97-127 行验证 section 读不截断存储。通过。
- **dream 日期计算**：parseDateEpoch 对非数字返回 NaN，isOlderThan 对 NaN 返回 false（[dream.ts:L60-L66](../../server/src/dream.ts#L60-L66)），不会误降级。通过。

### 2.4 跨模块影响识别

- config const→function：所有引用方（lint/search/read-only/write/index-md/log）已改为函数调用，grep 确认无残留 `KB_ROOT`/`WIKI_DIR`/`RAW_DIR`/`INDEX_FILE`/`LOG_FILE` const 引用（唯一匹配为 lint-perf.test.ts 设置 `process.env.KB_ROOT`，属正常用法）。typecheck 通过佐证。通过。
- kb_get_page 副作用契约变更：ARCH.md §3.1 已从"无"改为"use_count+1 并回写"。通过。
- 新增第 9 工具 kb_promote_experience：index.ts 已注册，schemas.ts 已加 schema，ARCH.md §3.1 已加行。通过。

### 2.5 详细问题

| No. | 问题标题 | 严重度 | 建议修复 | 代码位置 |
| --- | --- | --- | --- | --- |
| Q1 | use_count 回写 catch 块为空，违反 CLAUDE.md §19.4「禁止空 catch 块」 | 中（必须修复） | 改为 `catch (err) { console.error("[kb-mcp] kb_get_page: failed to persist use_count:", err); }`。主 Agent 声称已补 console.error，lint.ts/search.ts/kb_list_categories 均已补，唯独此处遗漏，不一致 | [read-only.ts:L208-L212](../../server/src/tools/read-only.ts#L208-L212) |
| Q2 | dream 写入/移动段无 try-catch，单文件失败中断整个批量老化 | 中（必须修复） | 读取段（L103-108）有 try-catch continue，但写入段（ensureDir→writeFile→unlink→removePageFromIndex→appendLogEntry）无容错。磁盘满/权限错误会中断后续所有文件。应用 try-catch 包裹单文件处理，catch 中 console.error 并 continue | [dream.ts:L123-L156](../../server/src/dream.ts#L123-L156) |
| Q3 | kbPromoteExperience 未校验 frontmatter.type===experience && status===pending，可 promote 任意页面 | 中（必须修复） | promote 语义是 pending experience→active 状态迁移（AGENTS.md §7.4），但代码只检查 domain 存在，未校验 type/status。传入 concept 页面会将其移入 experiences/ 并改 status=active，破坏类型语义与文件组织。应在读取 frontmatter 后校验 `if (frontmatter.type !== "experience") return errorResult(...)` 及 `if (frontmatter.status !== "pending") return errorResult(...)` | [write.ts:L229-L246](../../server/src/tools/write.ts#L229-L246) |
| Q4 | promote writeFile→unlink 非原子，中途崩溃致 inbox/active 并存 | 低（建议修复） | ADR-006 已承认。建议 unlink 包 try-catch 记录（当前 unlink 失败会抛异常中断，但 active 已写入、index/log 未更新）。未来可改临时文件+rename 原子方案 | [write.ts:L281-L283](../../server/src/tools/write.ts#L281-L283) |
| Q5 | use_count 并发回写丢更新（read-modify-write 非原子） | 低（建议修复） | 个人 KB 单用户概率低，但 MCP 多客户端并发时丢计数。建议在 docs/integration/mcp-clients.md 补充"use_count 为 best-effort，并发可能丢计数"说明 | [read-only.ts:L205-L212](../../server/src/tools/read-only.ts#L205-L212) |
| Q6 | 文档不一致：package.json description 与 schemas.ts 注释仍写 "8 tools"，实际 9 个 | 低（建议修复） | index.ts 已改为"all tools"（不写数字），但此两处未同步。更新为"9 tools"或移除数字 | [package.json:L4](../../server/package.json#L4)、[schemas.ts:L4](../../server/src/schemas.ts#L4) |
| Q7 | ARCH.md §4.2 status 枚举缺少 rejected | 低（建议修复） | lint.ts VALID_STATUSES 含 rejected，本次新增 reject 功能，但 ARCH.md L137 仍写 `active/staging/pending/archived`（缺 rejected）。应补充 rejected | [ARCH.md:L137](../ARCH.md#L137) |
| Q8 | dream archivePath 无防御性 path.relative 检查 | 低（建议修复） | 输入受控（文件系统遍历，domain 来自 path.relative 第一段），分析安全，但 write.ts promote 对 active path 做了检查，dream 未做，防御性不一致。建议补充 `const relArchive = path.relative(wikiDir, archivePath);` 并在 relArchive 以 `..` 开头或为绝对路径时 continue（防御性检查） | [dream.ts:L127-L133](../../server/src/dream.ts#L127-L133) |
| Q9 | 测试覆盖缺口 | 低（建议补充） | 缺少：promote 路径遍历测试（inbox_path 含 `../`）、promote active 已存在冲突测试、use_count 回写失败降级测试（只读 FS）、dream 单文件失败不中断批量测试、promote 非 experience 页面拒绝测试（对应 Q3） | [p3-evolution.test.ts](../../server/src/tests/p3-evolution.test.ts) |

### 2.6 测试框架充分性

p3-evolution.test.ts 7 用例覆盖 config 动态切换、use_count 递增、section 不截断、promote auto/manual/reject、dream 老化。核心路径覆盖良好。但缺少边界/异常/对抗场景（见 Q9），尤其 Q3 对应的非 experience 页面拒绝测试缺失，导致业务逻辑缺陷未被测试发现。

## 3. 安全漏洞扫描（TRAE-security-review）

### 3.1 审计方法论

执行 Pass A（项目安全基线）→ Pass B（偏离映射）→ Pass C（源到汇追踪）。项目既有安全原语：`DOMAIN_REGEX` kebab-case 校验（schemas.ts）、`path.relative` + `startsWith("..")` + `isAbsolute` 路径遍历检查、`sanitizeIndexField`/`sanitizeLogField` CR/LF 剥离（CWE-117）、js-yaml v4 默认 safe load。

### 3.2 OWASP Top 10 / CWE 扫描结果

| 类别 | 扫描项 | 结论 | 证据 |
| --- | --- | --- | --- |
| CWE-22 路径遍历 | kbGetPage inbox_path→fullPath | 安全 | [read-only.ts:L188-L191](../../server/src/tools/read-only.ts#L188-L191) path.relative(kbRoot, fullPath) + startsWith("..") + isAbsolute 拦截 |
| CWE-22 路径遍历 | kbPromoteExperience inbox_path | 安全 | [write.ts:L219-L224](../../server/src/tools/write.ts#L219-L224) 同上检查 |
| CWE-22 路径遍历 | kbPromoteExperience active path（domain 来自 frontmatter，非 schema 校验） | 安全（defense-in-depth 充分） | domain 虽来自 frontmatter（可被手动篡改），但 [write.ts:L266-L269](../../server/src/tools/write.ts#L266-L269) 运行时 path.relative(wikiDir, activeFullPath) 拦截 `../` 与绝对路径。源（frontmatter.domain）→ 汇（path.join 构造路径）路径上存在运行时检查 |
| CWE-22 路径遍历 | dream archivePath（domain 来自文件系统遍历） | 安全 | [dream.ts:L95-L101](../../server/src/dream.ts#L95-L101) 路径来自 listMarkdownFiles(wikiDir) 遍历，domain 取 path.relative(wikiDir, file) 第一段，file 必在 wikiDir 内。无可达的 attacker-controlled 源 |
| CWE-117 注入 | index.md / log.md 写入 | 安全 | [index-md.ts:L38-L40](../../server/src/utils/index-md.ts#L38-L40) sanitizeIndexField 剥离 CR/LF；[log.ts:L60-L62](../../server/src/utils/log.ts#L60-L62) sanitizeLogField 剥离 CR/LF。appendLogEntry 对所有 key/value 调用 sanitize（[log.ts:L70-L72](../../server/src/utils/log.ts#L70-L72)） |
| CWE-94 代码注入 | YAML 解析 | 安全 | js-yaml v4 `yaml.load` 默认 DEFAULT_SAFE_SCHEMA，不实例化任意类型（[frontmatter.ts:L21](../../server/src/utils/frontmatter.ts#L21)） |
| CWE-78 命令注入 | 无 system/exec 调用 | N/A | 全部使用 node:fs 文件 API |
| CWE-89 SQL 注入 | 无数据库 | N/A | 纯文件系统知识库 |
| CWE-307/287 认证 | 本地 stdio MCP，无认证层 | N/A | 单机本地工具，零网络面（ARCH.md §6.1） |

**安全扫描结论：无 exploitable 安全漏洞。** 路径遍历防护采用 defense-in-depth（Zod kebab-case schema + 运行时 path.relative 双重检查），CWE-117 已被 sanitize 处理，无注入/密钥/供应链风险。

### 3.3 输入与边界审计

- **数值边界**：confidence 从 frontmatter 读取时仅 `typeof number` 检查，无 0-1 范围重新校验（kb_write_experience 写入时有 Zod .min(0).max(1)，但手动编辑 frontmatter 可绕过）。仅影响 tier 分类（confidence>=0.8），不影响安全。低风险，归入 Q5 类建议。
- **集合边界**：domains 数组有 Array.isArray + length===0 检查（[write.ts:L239-L246](../../server/src/tools/write.ts#L239-L246)）。充分。
- **状态机约束**：promote 未校验 type/status（Q3）；dream 校验 type===experience && status===active（[dream.ts:L110-L111](../../server/src/dream.ts#L110-L111)），充分。

### 3.4 执行安全审计（注入防护）

无 SQL/OS命令/代码/模板注入面。无 eval/Function/exec。YAML safe load。通过。

### 3.5 密钥与配置安全

- 本次变更无硬编码密钥、密码、token。config.ts 仅读 `process.env.KB_ROOT`（非敏感配置）。
- console.error 输出均为文件路径与错误对象，无密钥/PII/完整 SQL。
- 无新增依赖（dream.ts 用 node:url 内置模块），无供应链风险。
- 通过。

### 3.6 依赖与供应链风险

无新增依赖。建议定期执行 `npm audit`（既有要求，非本次变更引入）。

### 3.7 关于 TOCTOU 与原子性的安全定级

按 TRAE-security-review §8 硬排除规则：

- use_count TOCTOU 丢更新属"Race/TOCTOU without concrete reachable security impact"——丢失的是 best-effort 计数，不泄露数据、不提权、不 RCE，**不构成安全漏洞**，归为代码质量建议（Q5）。
- promote/dream 文件移动非原子性属数据完整性/健壮性问题，非安全漏洞，归为代码质量建议（Q4）。

二者在安全维度均不阻断，但在质量维度需关注（见 §2.5）。

## 4. 综合结论

- [ ] **通过**：可进入测试阶段
- [x] **有条件通过**：需修复 3 项中风险后重新提交 guardrail-enforcer 审查
- [ ] **阻断**：存在严重质量缺陷或高危安全漏洞

**安全维度**：通过。无可利用安全漏洞，路径遍历 defense-in-depth 充分，注入已防护，无密钥泄露。

**质量维度**：有条件通过。3 项中风险问题（Q1 空 catch 违反 §19.4、Q2 dream 无容错、Q3 promote 缺状态机校验）必须修复后方可进入 ac-verifier 测试阶段。6 项低风险/建议（Q4-Q9）不阻塞，但建议在本次或后续提交中修复。

## 5. 阻塞项与回退指令

结论为"有条件通过"，主 Agent 必须修复以下 3 项中风险问题后，按 CLAUDE.md §7.2 回退闭环重新提交 guardrail-enforcer 审查（修复后须从影响自检 + guardrail-enforcer 重新走完整闭环，不得仅重测未通过项）：

### 阻塞项 Q1：use_count 回写空 catch 违反 §19.4

**位置**：[read-only.ts:L208-L212](../../server/src/tools/read-only.ts#L208-L212)

**现状**：

```typescript
  try {
    await writeFile(fullPath, serializeFrontmatter(frontmatter, body));
  } catch {
    // Non-fatal: use_count persistence is best-effort.
  }
```

**修复建议**：

```typescript
  try {
    await writeFile(fullPath, serializeFrontmatter(frontmatter, body));
  } catch (err) {
    // Non-fatal: use_count persistence is best-effort, but surface the
    // failure to stderr per CLAUDE.md §19.4 (不吞异常).
    console.error("[kb-mcp] kb_get_page: failed to persist use_count:", err);
  }
```

**理由**：CLAUDE.md §19.4 明确"禁止空 catch 块"、"所有异常必须被记录或向上传播"。主 Agent 变更清单声称"空 catch 补 (err)+console.error"，lint.ts/search.ts/kb_list_categories 均已补，唯独此处遗漏，属不一致。

### 阻塞项 Q2：dream 写入/移动段无 try-catch

**位置**：[dream.ts:L123-L156](../../server/src/dream.ts#L123-L156)

**现状**：读取段（L103-108）有 try-catch continue，但写入段（ensureDir→writeFile→unlink→removePageFromIndex→appendLogEntry）无容错，任一 await 抛异常中断整个 dream()。

**修复建议**：将单文件降级处理包裹在 try-catch 中：

```typescript
    // Demote: status=archived, move to archive/, remove from index.md.
    try {
      const parts = normalized.split("/");
      const domain = parts[0];
      const slug = path.basename(file, ".md");
      const archivePath = path.join(
        wikiDir, domain, "experiences", "archive", `${slug}.md`
      );
      // ...（现有 archivePath 构造与检查）
      frontmatter.status = "archived";
      frontmatter.date = today;
      await ensureDir(path.dirname(archivePath));
      await writeFile(archivePath, serializeFrontmatter(frontmatter, body));
      await fs.unlink(file);
      await removePageFromIndex(oldRelPath);
      await appendLogEntry({ /* ... */ });
      report.demoted++;
      report.demoted_paths.push(archiveRelPath);
    } catch (err) {
      // One file's aging must not abort the whole batch.
      console.error(`[dream] failed to demote ${file}:`, err);
      continue;
    }
```

**理由**：dream 是批量维护操作，单文件失败（磁盘满、权限、并发修改）不应中断其余文件的老化。读取段已容错，写入段应一致。

### 阻塞项 Q3：promote 未校验 type===experience && status===pending

**位置**：[write.ts:L229-L246](../../server/src/tools/write.ts#L229-L246)

**现状**：promote 只检查 `domains.length > 0`，未校验 `frontmatter.type === "experience"` 与 `frontmatter.status === "pending"`。传入 concept/source 页面会将其移入 experiences/ 并改 status=active，破坏类型语义与文件组织（AGENTS.md §7.4 状态机：promote 是 pending→active 迁移）。

**修复建议**：在读取 frontmatter 后、action 分支前补充校验：

```typescript
  const content = await readFile(fullPath);
  const { frontmatter, body } = parseFrontmatter(content);

  // State-machine guard (AGENTS.md §7.4): promote/reject only applies to
  // pending experience cards. Rejecting any other type/status prevents
  // accidental migration of concept/source pages into experiences/.
  if (frontmatter.type !== "experience") {
    return errorResult(
      `Cannot promote/reject: expected type=experience, got type=${String(frontmatter.type)}.`
    );
  }
  if (frontmatter.status !== "pending") {
    return errorResult(
      `Cannot promote/reject: expected status=pending, got status=${String(frontmatter.status)}.`
    );
  }
```

**理由**：AGENTS.md §3.4 状态机规定 experience 的合法迁移为 pending→active→archived，rejected 仅从 pending 分支出发。promote 作为状态迁移操作必须校验前置状态，否则破坏状态机不变量。

## 6. 待澄清

1. **Q5 并发限制文档同步**：主 Agent 自问提到"use_count 回写未在 MCP 客户端集成文档同步说明"。建议确认 docs/integration/mcp-clients.md 是否需补充并发限制说明。此为低风险，不阻塞。
2. **Q3 与既有 ingest 路径一致性**：kb_ingest_source 写 staging 页（status=staging），若用户误对 staging 页调用 promote，Q3 修复后会正确拒绝。确认此为期望行为。
3. **前置产出物无矛盾**：ADR-006、ARCH.md §3.1、AGENTS.md §7.4/§7.5 与代码实现一致，未发现文档间矛盾。

## 7. 自动化建议（CI/CD 集成）

为防止 §2.5 中的问题复发，建议在 CI 中集成：

1. **空 catch 检测**（对应 Q1）：添加 ESLint 规则 `no-useless-catch` 或自定义规则检测无 console/error 报告的空 catch 块，CI 失败则禁止合并。
2. **状态机校验**（对应 Q3）：补充单元测试，对 promote 传入 type=concept / status=active 的页面断言返回 errorResult。
3. **路径遍历回归**（对应 Q8/Q9）：补充 promote inbox_path 含 `../`、domain 含 `../` 的对抗测试用例，纳入 CI。
4. **Semgrep 规则**：针对 `path.resolve` + `path.relative` 模式添加 Semgrep 规则，确保所有用户输入路径后有 traversal 检查。
5. **文档一致性**：`scripts/consistency-check.js` 已覆盖文件链接，建议扩展检查 package.json/schemas.ts 中的工具数与实际注册数一致。
