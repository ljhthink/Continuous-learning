# 安全与质量审计报告 · P2 三 Agent 集成 + L-2 算法优化

## 元信息

| 项目 | 内容 |
|---|---|
| 执行 Agent | guardrail-enforcer |
| 任务令牌 | TKN-P2-INTEGRATION-GUARDRAIL-001 |
| 任务域 | P2 三 Agent 接入验证 + L-2 `checkMissingXref` 算法优化 + 测试/性能脚本 + 客户端配置 |
| 报告日期 | 2026-07-23 |
| 风险等级 | P1（单模块内部算法优化 + 测试/开发脚本 + 客户端配置文件；无接口/契约/依赖变更） |
| 审计依据 | [CLAUDE.md](../../CLAUDE.md) §7.2、§9、§10、§16 / [AGENTS.md](../../AGENTS.md) §6.2 / [ADR-002](../decisions/ADR-002-mcp-client-integration.md) / [P1 验收报告](./2026-07-22-p1-mcp-server-acceptance.md) |
| 上游产出物 | ADR-002、P1 验收报告（安全基线：CWE-22 路径穿越 + CWE-117 日志注入）、PRD US-002/US-006、测试框架 `server/src/tests/` |
| 主 Agent 签发上下文 | 盲区 1：(a) runner 用 `checks as never` 桥接 env→CheckName 联合类型；(b) Windows `--import tsx` 子进程 + `import.meta.url` 路径解析；(c) 性能基线吞吐含子进程启动开销。盲区 2：未在 Step 1 察觉 `config.ts` 模块加载期 `KB_ROOT` 捕获会阻塞 scale 测试，导致 Step 8 返工；N=1000 p95=942ms 距 1000ms 测试天花板较近，慢 CI 单次迭代可能 flake。 |

### 工具可用性说明（替代声明）

CLAUDE.md §10 规定 guardrail-enforcer 须调用 `TRAE-code-review` skill（代码质量审查）与 `TRAE-security-review` skill（安全漏洞扫描）。**本环境中这两个 skill 均不可用**，故按以下方式替代，并在此显式记录：

- **代码质量审查**：已调用 [`karpathy-guidelines`](../../CLAUDE.md) §6 skill 回顾原则，并由 guardrail-enforcer 逐文件人工对照审查（命名/设计/错误处理/逻辑正确性/性能/可维护性/跨模块影响/测试充分性）。
- **安全漏洞扫描**：由 guardrail-enforcer 按本角色系统提示的六阶段流程（输入边界/执行安全/内存安全/配置密钥/供应链/综合报告）执行**人工结构化扫描**，覆盖 OWASP Top 10 / CWE-22 / CWE-78 / CWE-89 / CWE-117 / CWE-502 / CWE-798 等。

---

## 1. 总体结论

### **通过**

- **无阻断级（Blocking）安全漏洞**：无 SQL/命令/代码/模板注入；无硬编码密钥/令牌；无新增依赖；P1 已建立的 CWE-22（路径穿越）+ CWE-117（日志注入）防护在本轮变更中**无回归**。
- **生产代码变更（`checkMissingXref` 重写）正确**：O(N²)→O(N×K) 倒排桶算法语义等价性证明成立，正确性测试（语义等价 + 去重）通过；`kbLint` 签名与 MCP tool 契约未变。
- **生产性能门禁满足**：N=1000 50 次迭代 p95=968ms（missing_xref）/ 892ms（all checks），均 < 2s PRD 门禁（[PRD](../../PRD.md) US-006）。
- **1 项中风险质量发现（M-1）**：`lint-perf.test.ts` 测试 3 为单样本基准、1000ms 天花板过紧，在负载下可观察到失败（详见 §4.2）。该问题不构成安全阻断，生产性能亦达标，但**应在接入 CI 前稳定化**，否则将导致 CI 间歇性红。建议主 Agent 在 ac-verifier 阶段或之前处理。

> 关于"通过"判定的依据：本角色系统提示规定阻断级仅限 SQL 注入、硬编码密钥、命令注入等安全漏洞。M-1 为测试可靠性问题（非安全漏洞、非生产缺陷、隔离运行可通过、生产性能达标），不达阻断阈值。已将 M-1 作为强建议项移交 ac-verifier 重点关注（ac-verifier 职责含运行全测试套件与性能门禁，§11）。

---

## 2. 检查范围摘要

| 维度 | 数量 |
|---|---|
| 审计文件数 | 13（生产 1 + 测试/开发 4 + 客户端配置 2 + 文档 6） |
| 审计函数/接口 | `checkMissingXref`（重写）、`kbLint`（未改，回归验证）、`lint-scale-runner`（新）、`runScale`（新）、`verify-mcp-clients`（新） |
| 阻断级问题 | 0 |
| 高风险问题 | 0 |
| 中风险问题 | 1（M-1 测试 flaky） |
| 低风险/建议 | 5（L-1～L-5） |
| 独立复核命令 | `npm run build`✓ / `npm test`（隔离 34/34✓，并行负载下 33/34⚠）/ `node verify-mcp-clients.mjs` 9/9✓ / `node perf-baseline.mjs`✓ / `node scripts/consistency-check.js`✓ |

### 变更清单确认（对照主 Agent 自检）

| 文件 | 类型 | 审计结论 |
|---|---|---|
| [lint.ts](../../server/src/tools/lint.ts) `checkMissingXref` L451-519 | 生产（重写） | 正确，语义等价，见 §3 |
| [lint-scale-runner.ts](../../server/src/tests/lint-scale-runner.ts) | 测试/新 | 边界基本安全，见 §4.1 L-1/L-2 |
| [lint-perf.test.ts](../../server/src/tests/lint-perf.test.ts) | 测试/改 | 测试 3 flaky，见 §4.2 M-1 |
| [perf-baseline.mjs](../../server/perf-baseline.mjs) | 开发/改 | spawn 安全，见 §3.2 |
| [verify-mcp-clients.mjs](../../server/verify-mcp-clients.mjs) | 开发/新 | spawn 安全，见 §3.2/L-4 |
| [.mcp.json](../../.mcp.json) | 配置/新 | 无密钥，见 §5 |
| [opencode.json](../../opencode.json) | 配置/新 | 无密钥，见 §5 |
| docs（ADR-002/集成指南/README/ARCH/索引） | 文档 | 一致性检查通过 ✓ |

---

## 3. 阶段一：输入与边界审计（范围检查）

### 3.1 数值与类型边界

**[lint-scale-runner.ts:39](../../server/src/tests/lint-scale-runner.ts#L39)** — `ITERATIONS` 环境变量解析：

```ts
const iterations = Math.max(1, parseInt(process.env.ITERATIONS ?? "1", 10));
```

- 合法路径：未设 → 默认 "1" → `1`；设为 "50" → `50`。调用方（test 不设；perf 设 `String(50)`）均传合法数字串。
- **退化路径（低风险 L-1）**：若 `ITERATIONS="abc"`，`parseInt`→`NaN`，`Math.max(1, NaN)`→`NaN`。随后 `for (let i=0; i<NaN; i++)` 不执行（`0 < NaN` 为 false），`latencies=[]`，`percentile([],p)`→0，`error_rate`：`NaN > 0` 为 false → 0。输出 `JSON.stringify({iterations: NaN, ...})`→`{"iterations":null,...}`。**不崩溃、不注入、无越界**，但产生误导性退化输出。运行时安全（kbLint 未被调用），仅影响度量正确性。→ 见 §6 L-1 修复建议。

**[lint-scale-runner.ts:45](../../server/src/tests/lint-scale-runner.ts#L45)** — `CHECKS` 环境变量 + `as never` 类型桥接：

```ts
const checks = checksEnv ? (checksEnv.split(",").filter(Boolean) as never) : undefined;
```

- 运行时安全验证：`checks` 传入 `kbLint({checks})`，在 [lint.ts:85-87](../../server/src/tools/lint.ts#L85) 中 `requested` 进入 `enabled = new Set(requested)`，而后续 5 项检查均以 `enabled.has("frontmatter")` 等字面量键门控（[lint.ts:142-156](../../server/src/tools/lint.ts#L142)）。**未知 check 名（如 "foobar"）仅作为 Set 成员存在，永不匹配任何 `enabled.has(...)`，故静默 no-op**。即使 `CHECKS` 含路径穿越串/注入载荷，也仅作 Set 键比较，不参与文件路径/SQL/命令/模板构造。→ 无注入风险。
- 静态类型安全：`as never` 绕过 `CheckName` 联合类型检查。主 Agent 已在注释中显式说明该取舍。→ 见 §6 L-2 建议（可导出 `CheckName` 类型做类型安全解析，非阻断）。

### 3.2 集合与缓冲区边界

**[lint.ts `checkMissingXref` L488-516](../../server/src/tools/lint.ts#L488)** — 桶内配对循环：

```ts
for (let i = 0; i < bucket.length; i++) {
  const a = bucket[i];
  for (let j = i + 1; j < bucket.length; j++) {
    const b = bucket[j];
```

- 索引 `i`、`j` 均以 `bucket.length` 严格上界约束，`j` 从 `i+1` 起，无越界可能。`bucket[i]`/`bucket[j]` 访问安全。
- `seenPairs`（Set）、`buckets`（Map）、`linkTargets`（Map）均通过安全容器方法访问。无裸指针/指针运算（TS/Node 语义）。
- **无 C/C++ 不安全函数**（`strcpy`/`sprintf`/`gets`）：N/A（TypeScript）。

**[lint-scale-runner.ts:33-37](../../server/src/tests/lint-scale-runner.ts#L33)** — `percentile` 函数：

```ts
const idx = Math.ceil((p / 100) * sorted.length) - 1;
return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
```

- `Math.max(0, Math.min(idx, len-1))` 双向钳制，保证索引 ∈ [0, len-1]。空数组守卫 `if (sorted.length === 0) return 0`。→ 边界安全。

### 3.3 业务状态机约束

- 本轮变更无业务状态机迁移。`lint` check 选择由 `enabled` Set 成员判定（见 §3.1），未知 check 名为 no-op，不存在绕过状态检查路径。
- `LINK_GRAPH_SKIP_STATUSES`（pending/archived 跳过）在 [lint.ts:475](../../server/src/tools/lint.ts#L475) 通过 `p.status ?? ""` 守卫，与 P1 `checkOrphans` 一致。未改动，无回归。

---

## 4. 阶段二：执行安全审计（指令与数据隔离）

### 4.1 注入防护

| 注入类型 | 结论 | 证据 |
|---|---|---|
| SQL/NoSQL（CWE-89） | N/A | 项目无数据库（P1 已确认），lint.ts 仅做文件系统扫描 + 内存集合运算 |
| **OS 命令注入（CWE-78）** | **通过** | 全部 spawn 均用**参数数组形式**，无 shell。`Select-String -Pattern "shell"` 扫描 4 个变更文件 + server 全量 `.ts`/`.mjs`：**零命中** `shell:true`。具体见下 §4.2 |
| 代码/表达式注入（CWE-94） | 通过 | 无 `eval`/`Function()`/动态 `require`/远程脚本加载 |
| 模板引擎注入 | N/A | 无模板引擎 |
| YAML 反序列化（CWE-502） | 通过（P1 已验） | `js-yaml` v4 默认 safe schema，本轮未触碰 frontmatter 解析路径 |

### 4.2 子进程 spawn 逐处审查（CWE-78 核心）

| 位置 | 调用形式 | shell? | 参数来源 | 结论 |
|---|---|---|---|---|
| [lint-perf.test.ts:182](../../server/src/tests/lint-perf.test.ts#L182) | `spawnSync(process.execPath, ["--import","tsx", runnerPath], {env,encoding,timeout})` | 否 | `process.execPath`（node）+ `runnerPath`（`fileURLToPath(new URL("./lint-scale-runner.ts", import.meta.url))`，源自模块自身 URL，非用户输入） | 安全 |
| [perf-baseline.mjs:230](../../server/perf-baseline.mjs#L230) | `spawnSync(process.execPath, ["dist/tests/lint-scale-runner.js"], {env,encoding,timeout})` | 否 | `process.execPath` + 字面量串 | 安全 |
| [verify-mcp-clients.mjs:173](../../server/verify-mcp-clients.mjs#L173) | `spawn(cfg.command, cfg.args, {stdio,env})` | 否 | `cfg.command`/`cfg.args` 来自**已提交的开发者配置文件**（`.mcp.json`/`opencode.json`/内联 Trae 模板） | 安全（信任假设见 L-4） |

- **无 `shell:true`**：经 `Select-String` 全量扫描确认。所有 spawn 均为直接 exec（无 shell 元字符展开面）。
- `verify-mcp-clients.mjs` 的 `cfg.command` 取自 JSON 配置：威胁模型为"受信任的已提交开发配置"，非生产代码处理不可信输入。即便配置被篡改，无 shell 意味着无元字符注入，仅能执行指定程序路径（信任边界内可接受）。→ L-4 建议在脚本注释显式声明该信任假设。

### 4.3 最小权限

- MCP server 以 `node` 启动（非 root），无特权操作。配置 `command: "node"`。
- 无容器安全上下文（本轮无 Dockerfile 变更）。
- `verify-mcp-clients.mjs` 用临时 fixture KB（`KB_ROOT: TMP`）覆盖配置中的 KB_ROOT，隔离验证，不触碰真实知识库。

### 4.4 输出编码与特殊字符

- runner 输出：`process.stdout.write(JSON.stringify({...}) + "\n")`（[lint-scale-runner.ts:75](../../server/src/tests/lint-scale-runner.ts#L75)）—— **标准库序列化，非字符串拼接**。安全。
- `verify-mcp-clients.mjs` 解析：`JSON.parse(trimmed)` 置于 try/catch（[L147-156](../../server/verify-mcp-clients.mjs#L147)），非 JSON 行被跳过。安全。
- `lint.ts` 的 `jsonResult`（[helpers.ts:20](../../server/src/tools/helpers.ts#L20)）同样用 `JSON.stringify`。无 JSON 拼接。

---

## 5. 阶段四：配置与密钥安全

### 5.1 配置文件扫描

| 文件 | 内容 | 密钥/令牌? | 结论 |
|---|---|---|---|
| [.mcp.json](../../.mcp.json) | `command:"node"` + `args:[<dist/index.js 绝对路径>]` + `env:{KB_ROOT:<项目绝对路径>}` | 无 | 通过 |
| [opencode.json](../../opencode.json) | `command:["node", <dist/index.js>]` + `environment:{KB_ROOT:<项目路径>}` | 无 | 通过 |

- **无硬编码密钥/密码/令牌/API Key/内部 IP**。`KB_ROOT` 为本机项目路径，ADR-002 D2 已显式记录其为机器特定、个人 KB 单机使用可接受。
- 全变更集扫描：无 `password=`/`token=`/`secret=`/`api_key`/`AKIA` 等模式。

### 5.2 .gitignore 与敏感文件

- [server/.gitignore](../../server/.gitignore) 排除 `.env`/`.env.local`/`.env.*.local`/`node_modules`/`dist`。✓
- 项目根**无 `.gitignore`**（L-5 建议）。当前根目录无 `.env` 文件（配置用路径而非密钥），不构成泄露，但建议补根级 `.gitignore` 作纵深防御（超出 P2 范围）。

---

## 6. 阶段五：依赖与供应链风险

- [package.json](../../server/package.json) 依赖**未变更**：运行时 3 个（`@modelcontextprotocol/sdk` / `js-yaml` / `zod`）、开发 4 个，与 P1 基线完全一致。**无新增依赖**。
- `lint-scale-runner.ts` 仅 `import { kbLint } from "../tools/lint.js"`（既有链）+ `node:` 内建（`process`/`child_process` 间接无）。无新外部包。
- 锁文件：`package.json` 未变 → 锁文件无需变更（本地无 `.git` 可 diff，以 package.json deps 集合等同 P1 为证据）。
- P1 已知的 `@hono/node-server` moderate 漏洞（经 SDK 传递依赖，本项目 stdio 不用 `serve-static`，未进运行时路径）—— 本轮未升级 SDK，状态不变，不阻断。

---

## 7. 阶段三：内存安全与运行时保护

- 语言为 TypeScript/Node.js，无手动内存管理、无 `unsafe` 块、无 FFI。本阶段 N/A。
- 编译安全标志：TS→JS，`tsc --noEmit` strict 模式通过（`npm run build` exit 0）。无 `-fstack-protector` 等系统级标志适用。
- `Set`/`Map` 增长由页数 N 与桶数 N×K 约束，来源为本地知识库（非不可信远端输入），无无界增长风险。N=1000 实测内存稳定。

---

## 8. P1 安全基线回归验证（重点）

本轮变更须确认 P1 已建立的防护未被破坏：

| P1 防护 | 位置 | 本轮是否触碰 | 回归? |
|---|---|---|---|
| CWE-22 路径穿越（`kb_get_page`/`kb_ingest_source`/`kb_write_experience` domain + source_path） | `read.ts`/`ingest.ts`/`write.ts` + SDK schema 正则 | 否（仅改 `lint.ts` 内部算法） | 无回归 ✓ |
| CWE-117 日志注入（`\r\n` 过滤） | `write.ts` sanitizeLogField | 否 | 无回归 ✓ |
| lint.ts 文件扫描边界 | `listMarkdownFiles(WIKI_DIR)` 仅遍历 wiki 目录 | 否（`checkMissingXref` 只消费已加载的 `pages` 数组与 `linkTargets` 索引，不新增文件路径构造） | 无回归 ✓ |
| `kbLint` 公共签名 | [lint.ts:82](../../server/src/tools/lint.ts#L82) | 否（`args.checks?: CheckName[]` 未变） | 无回归 ✓ |
| MCP tool 契约 | `index.ts` tool 注册 | 否 | 无回归 ✓ |

**结论**：P2 变更隔离在 `checkMissingXref` 内部算法 + 测试/开发脚本 + 配置文件，未触及任何安全敏感路径。P1 安全基线完整保留。

---

## 9. 代码质量审查（Karpathy Guidelines 对照）

### 9.1 生产代码：`checkMissingXref` 重写

| 原则 | 评估 |
|---|---|
| 简单性（Simplicity First） | ✓ 用最小改动实现 O(N×K)：倒排桶 + `seenPairs` 去重，无投机抽象、无用不上的可配置项 |
| 外科手术式变更（Surgical Changes） | ✓ 仅重写 `checkMissingXref`（L451-519），`lint.ts` 其余 ~450 行未动 |
| 命名 | ✓ `seenPairs`/`buckets`/`pairKey`/`lo`/`hi` 语义清晰 |
| 错误处理 | ✓ `linkTargets.get()` 用可选链 `aLinks?.has()`，缺省安全 |
| 逻辑正确性 | ✓ 语义等价证明（见下 §9.2） |
| 性能 | ✓ O(Σ\|bucket\|²)，现实分布 K≪N；实测 N=1000 p95=968ms（50 迭代） |
| 可维护性 | ✓ 注释含复杂度推导 + 语义等价证明 + 为何不用 in-process import 的理由 |

### 9.2 语义等价性独立验证

旧 O(N²) 条件：`A.domains ∩ B.domains ≠ ∅ ∧ A.tags ∩ B.tags ≠ ∅ ∧ ¬cross-linked`。
新 O(N×K) 条件：A、B 同现于某 `domain::tag` 桶 ⟺ `∃ d∈A.domains∩B.domains, ∃ t∈A.tags∩B.tags`（因 d、t 独立，共享域 ∃ + 共享标签 ∃ ⟺ 组合 (d,t) ∃）。**等价性成立**。

- `tags.length===0` 跳过：纯优化（无标签则 `A.tags∩B.tags=∅`，本就不会被标记），无语义变化。
- `LINK_GRAPH_SKIP_STATUSES` 跳过：与 P1 `checkOrphans` 一致，非新增。
- 去重：`seenPairs` 以 `${lo}::${hi}`（relPath 排序）为键，正确合并多桶共现对。测试 2 验证。

### 9.3 测试框架充分性

| 测试 | 覆盖 | 评估 |
|---|---|---|
| test 1 语义等价 | 6 页，验 exactly 2 issues、正确配对、不同域/无标签不误报 | ✓ 充分 |
| test 2 去重 | 2 页共享 2 桶，验 exactly 1 issue | ✓ 充分 |
| test 3 规模 | 1000 页，验 `pages_scanned===1000` + `p95<1000ms` | ⚠ 见 M-1 |
| 交叉链接抑制 | 未在新测试显式覆盖（test 1 页面无链接） | P1 `lint.test.ts` test 6 覆盖；可接受 |
| status 跳过 | 未在 missing_xref 显式覆盖 | `checkOrphans` 覆盖同机制；可接受 |

**总评**：正确性与去重覆盖充分；规模测试存在可靠性缺陷（M-1）。

---

## 10. 阶段六：综合发现（按严重度）

### 阻断级（Blocking）
无。

### 高风险（High-risk）
无。

### 中风险（Medium-risk）

#### M-1：`lint-perf.test.ts` 测试 3 为非确定性基准，负载下失败

- **位置**：[lint-perf.test.ts:201-204](../../server/src/tests/lint-perf.test.ts#L201)
- **证据**：
  - 主 Agent 声称 "34/34 pass，p95=942ms"。
  - guardrail-enforcer **并行**运行 `npm run build`（tsc）+ `npm test` 时，test 3 失败：`1000-page missing_xref scan p95=1044.94ms, expected < 1000ms`（33/34）。
  - **隔离**重跑 `npm test`：34/34 通过。
  - 50 迭代稳定基线（`perf-baseline.mjs`）：N=1000 missing_xref **p95=968.68ms，p99=995.18ms**；all checks p95=892.19ms。
- **根因**：测试 3 用单样本（`ITERATIONS` 默认 1，`latencies` 仅 1 元素，p50=p95=p99=该单值）对照 **1000ms** 天花板。而 50 迭代 p99 已达 995ms，意味着约 1% 的单次运行 >995ms；负载下（如 CI 同机跑 tsc/lint）单样本轻易突破 1000ms。注释自称"generous 1000ms ceiling"实则过紧。
- **影响**：CI 间歇性红，阻断 PR（CLAUDE.md §12.3 要求 `npm test` 为必需状态检查）。非安全/非生产缺陷；生产性能达标（p95=968ms < 2s PRD 门禁）。
- **修复建议**（任选其一，推荐 a）：
  - **(a) 多样本 + 中位数**：设 `ITERATIONS=9`，断言 `stats.p50 < 1000`（中位数比单样本稳健，仍能捕获 O(N²) 回归——O(N²) 旧实现 N=1000 missing_xref 项 ~150ms，但总时间被 I/O 主导，差异需更大 N 或更松阈值；参见 (c)）。
  - **(b) 抬高天花板**：`stats.p95 < 1800`（仍 < 2s PRD，且 50 迭代 p99=995ms 有充足余量；O(N²) 回归在 N=1000 难以仅凭总时间区分，故此选项更偏"防 flake"而非"防算法回归"）。
  - **(c) 算法级回归守卫**：若要严格区分 O(N²) vs O(N×K)，应单独度量 `missing_xref` 阶段耗时（需在 `lint.ts` 暴露分阶段计时或在 runner 内对比 missing_xref-only 与 frontmatter-only 的差值），而非依赖含 I/O 的总时间。
- **处置**：不阻断 guardrail；**强建议在 ac-verifier 阶段或之前稳定化**。

### 低风险/建议（Low-risk/Recommendation）

#### L-1：`lint-scale-runner.ts` `ITERATIONS` 非数字输入产生退化输出
- **位置**：[lint-scale-runner.ts:39](../../server/src/tests/lint-scale-runner.ts#L39)
- **风险**：`parseInt("abc")→NaN→Math.max(1,NaN)→NaN`，输出 `{"iterations":null}`，不崩溃不注入，仅度量失真。调用方均传合法值。
- **修复**：
  ```ts
  const parsed = parseInt(process.env.ITERATIONS ?? "1", 10);
  const iterations = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
  ```

#### L-2：`checks as never` 绕过静态类型检查
- **位置**：[lint-scale-runner.ts:45](../../server/src/tests/lint-scale-runner.ts#L45)
- **风险**：运行时安全（未知 check 名被 `enabled` Set 门控为 no-op），但静态类型安全被绕过。主 Agent 已注释说明。
- **修复（可选）**：从 `lint.ts` 导出 `CheckName`/`ALL_CHECKS`，runner 内用 `ALL_CHECKS.includes(c)` 过滤后传入，去掉 `as never`。

#### L-3：桶键 `${domain}::${tag}` 分隔符理论碰撞
- **位置**：[lint.ts:479](../../server/src/tools/lint.ts#L479)
- **风险**：若 domain/tag 含 `::`，键可能碰撞导致误并桶。但 AGENTS.md §2.1 规定 domain/tag 为 kebab-case（无冒号），纯理论。
- **修复（可选）**：用 `\u0000` 或复合键对象作分隔符。

#### L-4：`verify-mcp-clients.mjs` spawn `cfg.command` 信任假设未显式注释
- **位置**：[verify-mcp-clients.mjs:173](../../server/verify-mcp-clients.mjs#L173)
- **风险**：`cfg.command`/`cfg.args` 取自配置 JSON。无 shell 故无元字符注入，但若配置被篡改可执行任意程序。威胁模型为受信任已提交配置，可接受。
- **修复（可选）**：在 spawn 前断言 `cfg.command === "node"` 且 `cfg.args[0]` 以 `dist/index.js` 结尾，并注释信任假设。

#### L-5：项目根无 `.gitignore`
- **位置**：项目根
- **风险**：当前无 `.env`/密钥文件，不构成泄露。`server/.gitignore` 已覆盖 server 目录敏感文件。
- **修复（可选，超出 P2 范围）**：补根级 `.gitignore` 排除 `.env*`/`logs/`/`tmp/` 等作纵深防御。

---

## 11. 防护机制验证

| 声称的防护 | 验证方式 | 结论 |
|---|---|---|
| TypeScript strict 编译 | `npm run build`（tsc） | exit 0 ✓ |
| 单元测试 | `npm test`（隔离） | 34/34 ✓（并行负载下 33/34，见 M-1） |
| 三客户端配置可启动 server | `node verify-mcp-clients.mjs` | 9/9 断言 ✓ |
| 性能门禁 p95 < 2s | `node perf-baseline.mjs` | N=1000 p95=968ms ✓ |
| 文档一致性 | `node scripts/consistency-check.js` | 通过 ✓ |
| 无 shell 注入面 | `Select-String "shell"` 全量扫描 | 零命中 ✓ |
| 无硬编码密钥 | 全变更集人工扫描 | 无 ✓ |
| 无新增依赖 | `package.json` 对照 P1 | 一致 ✓ |
| P1 CWE-22/CWE-117 防护 | 变更范围分析（未触安全敏感路径） | 无回归 ✓ |

---

## 12. 豁免

| 项 | 说明 |
|---|---|
| `as never` 类型桥接 | 主 Agent 已在代码注释显式说明取舍（运行时安全、静态类型绕过）。记录为 L-2，不阻断。 |
| 绝对路径配置 | ADR-002 D2 显式决策：个人 KB 单机使用，绝对路径是三客户端唯一通用可靠方式。机器特定可接受，迁移步骤文档化于集成指南 §4。不阻断。 |
| `.trae/mcp.json` 不入库 | ADR-002 D4 显式决策：Trae CN denylist 安全设计，用户经 UI 创建。verify 脚本用内联等价配置验证功能。不阻断。 |

---

## 13. 自动化建议（CI/CD 集成）

1. **测试稳定性**：M-1 修复后，将 `cd server && npm test` 设为 PR 必需状态检查（CLAUDE.md §12.3）。建议在 CI 中先 `npm run build` 再 `npm test` 串行执行（避免并行 tsc 争用导致基准测试 flake）。
2. **依赖扫描**：在 `.github/workflows/` 加 `npm audit --audit-level=high` 步骤（CLAUDE.md §18.4），跟踪 P1 已知 `@hono/node-server` moderate 状态。
3. **配置回归**：将 `node verify-mcp-clients.mjs`（9 断言）纳入 CI，防止 server 改动破坏三客户端配置兼容性。
4. **性能回归**：将 `node perf-baseline.mjs` 的 N=1000 p95 与基线（968ms）对比，下降 >50% 失败、>20% 警告（CLAUDE.md §11）。建议用多迭代 p95 而非单样本。
5. **Semgrep 规则建议**（可选）：加规则禁止 `spawn*({shell:true})` 与 `as never` 用于外部输入桥接，固化本轮安全边界。

---

## 14. 结论与后续

- **guardrail 结论**：**通过**。无阻断级安全漏洞；生产代码变更正确；P1 安全基线无回归；生产性能门禁达标。
- **须关注项**：M-1（测试 3 flaky）应在 CI 接入前稳定化，建议移交 ac-verifier 在运行全测试套件与性能门禁时重点验证。
- **闭环流转**：guardrail 通过 → 主 Agent 可启动 `ac-verifier`（CLAUDE.md §7.2 第 3 步）。ac-verifier 须基于 PRD US-002/US-006 验收标准执行分层验证，并特别关注 M-1 的测试稳定性。
