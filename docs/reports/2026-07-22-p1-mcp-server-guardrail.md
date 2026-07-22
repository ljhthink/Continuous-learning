# 安全与质量审计报告 · P1 MCP Server

## 元信息

| 项目 | 内容 |
| --- | --- |
| 执行 Agent | guardrail-enforcer |
| 任务令牌 | TKN-P1-MCP-GUARDRAIL-001 |
| 任务域 | P1 MCP Server 全量源码（8 个 kb_* tools + 共享工具 + 测试） |
| 报告日期 | 2026-07-22 |
| 审查范围 | `server/src/` 下全部 14 个 `.ts` 源文件 + 4 个测试文件 + 2 个冒烟测试脚本 |
| 风险等级 | P1（常规：单模块内部逻辑，不改接口/契约/依赖） |
| 主 Agent 签发上下文 | 盲区 1：kb_list_categories 可能存在与 lint.ts 相同的 js-yaml Date 解析 latent bug。盲区 2：kb_lint 输出 schema 未在 ARCH.md 正式定义。 |

## 1. 审查依据

- 本次代码变更：`server/src/` 全量源码（greenfield P1 里程碑）
- 影响自检结果：主 Agent 变更影响自检（接口契约、依赖环境、依赖模块扫描、已知风险）
- 相关 ADR：[ADR-001-knowledge-base-tech-stack.md](../decisions/ADR-001-knowledge-base-tech-stack.md)
- 接口契约：[ARCH.md](../ARCH.md) 3.1 节
- 知识库 schema：[AGENTS.md](../../AGENTS.md) 3 节（frontmatter schema）、6.2 节（lint 检查项）、4.3 节（矛盾标记约定）
- 测试框架：`node:test` + `tsx`，28 个单元测试 + 2 个冒烟测试
- code-archaeologist 报告：不适用（greenfield 项目，无遗留代码）

## 2. 代码质量审查（TRAE-code-review）

### 2.1 Karpathy Guidelines 合规性

| 项 | 结论 | 说明 |
| --- | --- | --- |
| 命名 | 合格 | 文件 kebab-case，函数 camelCase，常量 UPPER_SNAKE。`kbHealth`/`kbSearch`/`kbIngestSource` 等命名清晰且与 ARCH 契约一致。私有 helper（`tokenize`/`slugify`/`normalizeDate`）命名准确。 |
| 设计简洁性 | 合格 | 职责分离清晰：`tools/`（MCP handler）、`utils/`（共享纯函数）、`schemas.ts`（Zod 校验）、`config.ts`（路径配置）。每个 tool 函数控制在 100 行以内。`markdown.ts` 提取共享函数避免重复（US-005a 重构）。 |
| 错误处理 | 需改进 | 多处空 `catch` 块静默吞异常（详见 2.2）。违反 Karpathy "不隐藏错误" 原则。 |
| 假设显式化 | 合格 | 注释引用 AGENTS.md / ARCH.md 章节号。`normalizeDate()` 有详细注释解释 js-yaml Date 解析行为。`todayDate()` 注释解释使用本地时区而非 UTC 的原因。 |

### 2.2 逻辑与性能

#### 发现 L-1：kb_list_categories 存在 js-yaml Date 解析 latent bug（高风险）

**位置**：[read-only.ts:94-95](../../server/src/tools/read-only.ts#L94-L95)

```typescript
const date = frontmatter.date as string | undefined;
if (date && (!lastUpdate || date > lastUpdate)) {
  lastUpdate = date;
}
```

**问题**：当 frontmatter 中 `date: 2026-07-20` 未加引号时，js-yaml v4 将其解析为 JavaScript `Date` 对象（UTC 午夜），而非字符串。`as string | undefined` 是 TypeScript 类型断言，不会在运行时执行任何转换。此时 `date` 实际是 `Date` 对象，`date > lastUpdate` 执行的是 `Date.toString()` 与字符串的字典序比较，结果为 `"Mon Jul 20 2026 00:00:00 GMT+0000 (Coordinated Universal Time)" > "2026-07-15"` —— 字典序上 `"M"` > `"2"`，所以任何 Date 对象都会"大于"任何 `YYYY-MM-DD` 格式的字符串，导致 last_update 总是被最后一个有 Date 类型 frontmatter 的页面覆盖。

**影响**：`kb_list_categories({ include_stats: true })` 返回的 `last_update` 值可能不正确。用户或 Agent 依赖此值判断领域活跃度时会得到错误信息。

**修复建议**：将 `lint.ts` 中的 `normalizeDate()` 提取到共享模块（如 `utils/frontmatter.ts` 或 `utils/date.ts`），在 `read-only.ts` 中同样调用：

```typescript
import { normalizeDate } from "../utils/frontmatter.js";
// ...
const date = normalizeDate(frontmatter.date);
if (date && (!lastUpdate || date > lastUpdate)) {
  lastUpdate = date;
}
```

#### 发现 L-2：missing_xref 检查 O(N^2) 复杂度（低风险，已知技术债）

**位置**：[lint.ts:474-505](../../server/src/tools/lint.ts#L474-L505)

双重循环遍历所有页面对。对于 N 个页面，最坏情况 N*(N-1)/2 次比较。当前规模 <200 页时可接受（最多约 19900 次比较），但 P2+ 阶段（200-5000 页）会显著变慢。主 Agent 已在已知风险中记录此技术债，不需当前修复，但应在 P2 规划中纳入优化。

#### 发现 L-3：空 catch 块静默返回空结果（中风险）

**位置**：

- [read-only.ts:72](../../server/src/tools/read-only.ts#L72)：`catch { return jsonResult({ categories: [] }); }`
- [search.ts:51](../../server/src/tools/search.ts#L51)：`catch { return jsonResult({ results: [] }); }`

**问题**：当 `listMarkdownFiles` 或 `fs.readdir` 因权限问题、磁盘错误等非 ENOENT 原因失败时，直接返回空结果而非报错。用户/Agent 无法区分"知识库确实为空"和"读取失败"。违反 CLAUDE.md 19.4 "不吞异常"原则。

**修复建议**：至少在 catch 块中 `console.error` 输出到 stderr，或区分 ENOENT（返回空）与其他错误（返回 errorResult）。

### 2.3 跨模块影响识别

主 Agent 影响自检结论正确：全 greenfield，`utils/markdown.ts` 被 `read-only.ts` 和 `lint.ts` 共享，无外部消费者。`helpers.ts` 的 `ToolResult` 接口索引签名 `[x: string]: unknown` 是 SDK 兼容性需求，非接口语义变更。

**发现 L-4：normalizeDate() 未共享导致重复风险（中风险）**

`lint.ts` 中的 `normalizeDate()` 是模块私有函数，未导出。`read-only.ts` 需要相同逻辑却无法复用（见 L-1）。应提取到共享 utils 模块。

### 2.4 测试框架充分性

**测试框架**：`node:test`（Node.js 内置）+ `tsx`（TypeScript 执行器），无需额外依赖。测试隔离策略正确：每个测试文件创建独立 temp KB，在 `before` 钩子中设置 `KB_ROOT` 后动态 import 模块。

**覆盖分析**：

| Tool | 单元测试数 | 覆盖场景 | 缺失场景 |
| --- | --- | --- | --- |
| kb_health | 3 | 总页数、index 状态、log 解析 | 无 |
| kb_list_categories | 2 | 列表、统计 | **Date 对象 frontmatter（L-1 bug 未被测试捕获）** |
| kb_list_recent | 2 | 默认、类型过滤 | 无 |
| kb_get_page | 4 | 正常、section 提取、不存在、路径穿越 | 无 |
| kb_search | 4 | 匹配、空查询、域过滤、limit | 无 |
| kb_ingest_source | 4 | 正常、非 markdown、路径穿越、不存在 | **domain 参数路径穿越（未测试）** |
| kb_write_experience | 2 | 正常、重复标题 | **domain 参数路径穿越（未测试）** |
| kb_lint | 6 | 全检查、各单项、选择性检查 | 无 |

**发现 L-5：domain 参数路径穿越场景缺失测试（高风险）**

`kb_ingest_source` 和 `kb_write_experience` 的测试未覆盖 `domain` 参数包含路径穿越序列（如 `../../../tmp`）的场景。这与 S-1 安全漏洞直接相关——如果有此类测试，漏洞会在测试阶段被发现。

### 2.5 接口契约一致性

**发现 L-6：ARCH.md 3.1 契约与实现存在 3 处偏差（中风险）**

| 偏差点 | ARCH 3.1 定义 | 实际实现 | 性质 |
| --- | --- | --- | --- |
| kb_lint checks enum | `["contradictions","orphans","stale","missing_xref"]` | 添加 `"frontmatter"` | 向后兼容扩展 |
| kb_lint 输出 | `{ issues: [{ type, page, detail, suggestion }] }` | 添加 `severity` 字段 + `summary` 对象 | 向后兼容扩展 |
| kb_list_recent type enum | `"ingest"/"query"/"lint"` | 添加 `"experience"` 和 `"init"` | 向后兼容扩展 |

所有偏差均为向后兼容扩展，不破坏现有消费者。但应在 ARCH.md 3.1 中同步更新定义，避免文档与实现脱节。主 Agent 已在两问回答中主动披露此问题。

## 3. 安全漏洞扫描（TRAE-security-review）

### 3.1 OWASP Top 10 / CWE 扫描结果

| # | 类别 | CWE | 标题 | 严重度 | 置信度 | 位置 |
| --- | --- | --- | --- | --- | --- | --- |
| S-1 | 路径穿越 | CWE-22 | `domain` 参数未做路径穿越校验，可写入任意文件系统位置 | **阻断** | 0.95 | [write.ts:83](../../server/src/tools/write.ts#L83)、[write.ts:143-149](../../server/src/tools/write.ts#L143-L149) |
| S-2 | 日志注入 | CWE-117 | `appendLogEntry` 中 title 和 detail 值未转义换行符，可注入伪造日志条目 | 高 | 0.90 | [log.ts:53-58](../../server/src/utils/log.ts#L53-L58) |
| S-3 | 输入校验不足 | CWE-20 | Zod schema 对 string 类型未设长度上限，`domain` 未做安全字符校验 | 中 | 0.85 | [schemas.ts:46-47](../../server/src/schemas.ts#L46-L47)、[schemas.ts:56-57](../../server/src/schemas.ts#L56-L57) |

### 3.2 输入与边界审计

#### Stage 1.1：数值与类型边界

**Zod schema 校验分析**：

| 参数 | Schema | 边界校验 | 结论 |
| --- | --- | --- | --- |
| kb_search.query | `z.string()` | 无长度限制 | 需改进 |
| kb_search.limit | `z.number().int().positive().max(50)` | 有上限 | 合格 |
| kb_get_page.path | `z.string()` | 无长度限制，无路径格式校验 | 需改进（已有运行时 path.relative 检查兜底） |
| kb_get_page.section | `z.string()` | 无长度限制 | 需改进（低风险，仅用于 regex 匹配） |
| kb_ingest_source.source_path | `z.string()` | 无长度限制 | 需改进（已有运行时 path.relative 检查兜底） |
| kb_ingest_source.domain | `z.string()` | **无任何校验** | **阻断级缺陷** |
| kb_write_experience.title | `z.string()` | 无长度限制 | 需改进 |
| kb_write_experience.domain | `z.string()` | **无任何校验** | **阻断级缺陷** |
| kb_write_experience.content | `z.string()` | 无长度限制 | 需改进（低风险，写入本地文件） |
| kb_write_experience.confidence | `z.number().min(0).max(1)` | 有范围校验 | 合格 |
| kb_write_experience.source_task | `z.string()` | 无长度限制 | 需改进（低风险） |
| kb_list_recent.limit | `z.number().int().positive().max(100)` | 有上限 | 合格 |
| kb_list_recent.type | `z.enum([...])` | 枚举校验 | 合格 |

**结论**：数值参数（limit、confidence）边界校验充分。字符串参数普遍缺少长度限制。`domain` 参数缺少安全字符校验是阻断级缺陷。

#### Stage 1.2：集合与缓冲区边界

- `listMarkdownFiles` 递归遍历目录，无深度限制。理论上可被恶意构造的深层符号链接目录树耗尽栈空间。但此函数操作的是本地知识库目录，且 `node:fs.readdir` 在遇到符号链接循环时不会无限递归（`withFileTypes` 返回 `Dirent`，符号链接的 `isDirectory()` 返回 false 在某些平台上）。实际风险低。
- `parseLog` 逐行解析，无行数上限。对于异常大的 log.md 文件，可能消耗大量内存。低风险（log.md 是 append-only 且由本系统控制写入）。
- `extractSnippet` 有 `SNIPPET_MAX_LEN = 200` 硬限制，防止超大 snippet。合格。

#### Stage 1.3：业务状态机约束

**frontmatter status 状态机**（AGENTS.md 3.4）：

```text
source/concept/entity: staging -> active -> archived
experience: pending -> active -> archived / rejected
```

**分析**：

- `kb_ingest_source` 创建页面时硬编码 `status: "staging"`，符合状态机入口。合格。
- `kb_write_experience` 创建卡片时硬编码 `status: "pending"`，符合状态机入口。合格。
- `kb_lint` 的 `checkFrontmatter` 验证 status 是否在 `VALID_STATUSES` 列表中，但**不验证状态转换合法性**（如从 `active` 直接跳到 `pending`）。这是设计选择而非缺陷——lint 是检查工具，状态转换由业务逻辑（审核门禁）控制，当前 P1 阶段审核门禁尚未实现。
- 无代码路径绕过状态检查直接修改 status 字段（status 写入仅在创建时通过 frontmatter 序列化）。合格。

### 3.3 执行安全审计（注入防护）

#### Stage 2.1：注入防护

**SQL/NoSQL 注入**：不适用。项目无数据库，使用 markdown 文件存储。

**OS 命令注入**：不适用。代码中无 `exec()`、`system()`、`spawn()` 调用（冒烟测试脚本中的 `spawn` 是测试代码，不在生产路径中）。

**代码/表达式注入**：不适用。代码中无 `eval()`、`Function()` 构造器、动态脚本加载。

**模板引擎注入**：不适用。项目无模板引擎。

**YAML 注入（CWE-502）**：

**位置**：[frontmatter.ts:21](../../server/src/utils/frontmatter.ts#L21)

```typescript
const frontmatter = (yaml.load(yamlText) ?? {}) as Record<string, unknown>;
```

**分析**：`js-yaml` v4.3.0（根据 package-lock.json 确认）的 `yaml.load()` 默认使用 `DEFAULT_SAFE_SCHEMA`，不支持 `!!js/function`、`!!js/regexp` 等危险类型。v4 中 `safeLoad()` 已被废弃并合并到 `load()`。因此当前代码**在运行时是安全的**。

**建议**（低风险）：虽然 v4 默认安全，但为防御性编程和意图清晰性，建议添加注释说明 "js-yaml v4 load() 默认使用 safe schema"，或显式传递 `{ schema: yaml.DEFAULT_SAFE_SCHEMA }`。此举可防止未来升级到不兼容版本时引入风险。

**日志注入（CWE-117）**：

详见 S-2 发现。`appendLogEntry` 中 `entry.title` 和 `entry.details` 的值直接拼入 markdown 格式的日志行，未过滤换行符。攻击者可通过 `title = "正常标题\n## [2026-07-22] ingest | 伪造条目\n- wiki: wiki/coding/fake"` 注入伪造日志条目。

**Markdown/索引注入**：

`addPageToIndex` 中 `domain` 直接用作 section header：`## ${domain}`。如果 `domain` 包含换行符，可注入伪造索引条目。与 S-1 同源。

#### Stage 2.2：最小权限检查

- MCP server 以 stdio 子进程方式运行，继承父进程（编码 Agent）的权限。无额外的权限提升操作。合格。
- 代码中无读取 `/etc/passwd`、`/etc/shadow` 等系统敏感文件的硬编码路径。合格。
- 无容器化部署配置（P1 阶段不涉及）。不适用。
- `KB_ROOT` 环境变量控制根目录，默认为 `process.cwd()/..`。可被环境变量覆盖。环境变量在 CLAUDE.md 20.3 中定义为可信输入。合格。

#### Stage 2.3：输出编码与特殊字符处理

- 所有 tool 输出通过 `JSON.stringify(data, null, 2)` 序列化为 JSON 文本。使用标准库序列化方法，未手工拼接 JSON 字符串。合格。
- `kb_get_page` 返回的 `body` 是原始 markdown 文本，未做 HTML 转义。但这是设计预期——消费者（编码 Agent）自行解析 markdown，MCP server 不负责 HTML 渲染。合格。
- `kb_search` 返回的 `snippet` 是从 body 中截取的子串，未做特殊字符转义。同上，合格。

### 3.4 密钥与配置安全

**Stage 4：配置与密钥安全**

- **硬编码密钥扫描**：全量源码中未发现任何 API key、password、token、secret 等硬编码敏感信息。`config.ts` 中仅包含路径配置和版本号。合格。
- **环境变量**：`KB_ROOT` 是唯一的运行时环境变量，用于配置知识库根目录路径。非敏感信息。合格。
- **`.gitignore`**：[server/.gitignore](../../server/.gitignore) 排除了 `node_modules/`、`dist/`、`*.tsbuildinfo`。但**缺少 `.env` 排除项**。虽然当前项目不使用 `.env` 文件，但 CLAUDE.md 20.1 要求 `.gitignore` 包含 `.env`。低风险建议。
- **日志脱敏**：代码中无日志输出敏感信息的路径。`console.error` 仅输出 `[kb-mcp] Server started` 和 fatal 错误信息。合格。

### 3.5 依赖与供应链风险

**Stage 5：依赖与供应链**

| 依赖 | 锁定版本 | 用途 | 已知风险 |
| --- | --- | --- | --- |
| `@modelcontextprotocol/sdk` | 1.29.0 | MCP 协议 SDK | 无已知高危 CVE。SDK 仍在快速迭代中（ADR-001 注明 6 个月迁移窗口）。 |
| `js-yaml` | 4.3.0 | YAML frontmatter 解析 | v4 默认 safe schema，无已知高危 CVE。 |
| `zod` | 3.25.76 | 输入校验 | 无已知高危 CVE。 |

**建议**：在 CI 中集成 `npm audit` 扫描（CLAUDE.md 18.4 要求）。当前 package.json 的 `scripts` 中无 audit 脚本，建议添加：

```json
"audit": "npm audit --audit-level=high"
```

**Dependabot**：CLAUDE.md 18.4 要求使用 Dependabot 监控依赖更新。需确认 `.github/dependabot.yml` 是否已配置对 `server/` 目录的监控。

## 4. 安全发现详解

### S-1：阻断级 - `domain` 参数路径穿越漏洞（CWE-22）

**严重度**：阻断（Blocking）

**置信度**：0.95

**源（Source）**：MCP tool 调用者（编码 Agent）通过 `kb_ingest_source` 和 `kb_write_experience` 的 `domain` 参数提供任意字符串。

**汇（Sink）**：`path.join(WIKI_DIR, domain, ...)` 的结果直接传入 `writeFile()` 和 `fs.copyFile()`。

**证据链**：

1. [schemas.ts:46-47](../../server/src/schemas.ts#L46-L47) — Zod schema 仅校验 `domain` 为 `z.string()`，无任何格式或字符限制：

```typescript
domain: z.string().describe("Target domain (e.g., 'coding')"),
```

1. [write.ts:83](../../server/src/tools/write.ts#L83) — `domain` 直接拼入文件路径：

```typescript
const wikiFullPath = path.join(WIKI_DIR, domain, `${slug}.md`);
```

1. [write.ts:101](../../server/src/tools/write.ts#L101) — 拼接后的路径直接写入文件，**无路径穿越检查**：

```typescript
await writeFile(wikiFullPath, serializeFrontmatter(frontmatter, body));
```

1. [write.ts:143-149](../../server/src/tools/write.ts#L143-L149) — `kb_write_experience` 同样存在此问题：

```typescript
const inboxFullPath = path.join(
  WIKI_DIR, domain, "experiences", "inbox", `${slug}.md`
);
// ... 后续直接 writeFile(inboxFullPath, ...)
```

**攻击示例**：

```text
kb_ingest_source({
  source_path: "raw/markdown/article.md",
  domain: "../../../tmp/evil"
})
```

`path.join(WIKI_DIR, "../../../tmp/evil", "article.md")` 解析为 `KB_ROOT/../../tmp/evil/article.md`，即写入知识库根目录上两级目录中。在 Windows 上同样有效。

对于 `kb_write_experience`，由于路径中固定包含 `experiences/inbox/` 子目录，攻击者需要更长的 `../` 序列，但仍然可以逃逸。

**对比**：同一文件中 `source_path` 参数有完善的路径穿越检查（[write.ts:41-45](../../server/src/tools/write.ts#L41-L45)），但 `domain` 参数完全缺失等价检查。`kb_get_page` 的 `path` 参数也有完善的检查（[read-only.ts:163-165](../../server/src/tools/read-only.ts#L163-L165)）。

**修复建议**：

方案 A（推荐，纵深防御）：在 Zod schema 中添加正则校验：

```typescript
domain: z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Domain must be kebab-case (lowercase alphanumeric with hyphens)")
  .max(64)
  .describe("Target domain (e.g., 'coding')")
```

方案 B（补充，运行时检查）：在 `write.ts` 中构造路径后添加穿越检查：

```typescript
const wikiFullPath = path.join(WIKI_DIR, domain, `${slug}.md`);
const relWiki = path.relative(WIKI_DIR, wikiFullPath);
if (relWiki.startsWith("..") || path.isAbsolute(relWiki)) {
  return errorResult(`Path traversal detected in domain: ${domain}`);
}
```

**建议同时实施方案 A 和方案 B**，实现纵深防御。

### S-2：高风险 - 日志注入漏洞（CWE-117）

**严重度**：高

**置信度**：0.90

**源**：`kb_ingest_source` 的 `source_path`（间接影响 `baseName`/`title`）和 `kb_write_experience` 的 `title` 参数，以及各种 `details` 值。

**汇**：[log.ts:53-58](../../server/src/utils/log.ts#L53-L58) 中的 `appendLogEntry`：

```typescript
const lines: string[] = [
  `## [${entry.date}] ${entry.type} | ${entry.title}`,
];
for (const [key, value] of Object.entries(entry.details)) {
  lines.push(`- ${key}: ${value}`);
}
```

**攻击示例**：

```text
kb_write_experience({
  title: "正常标题\n## [2026-07-22] ingest | 伪造来源\n- source: raw/fake.pdf\n- wiki: wiki/coding/fake",
  domain: "coding",
  content: "malicious",
  confidence: 0.9,
  source_task: "task-evil"
})
```

这会在 log.md 中注入一个伪造的 ingest 条目，使 `kb_list_recent` 和 `kb_health` 返回虚假信息。

**修复建议**：在 `appendLogEntry` 中过滤换行符：

```typescript
function sanitizeLogField(value: string): string {
  return value.replace(/[\r\n]/g, " ").trim();
}

// 使用：
lines.push(`## [${entry.date}] ${entry.type} | ${sanitizeLogField(entry.title)}`);
// ...
lines.push(`- ${sanitizeLogField(key)}: ${sanitizeLogField(value)}`);
```

同样应对 `addPageToIndex` 中的 `domain` 和 `entry.title` 做相同处理。

### S-3：中风险 - 输入校验不足（CWE-20）

**严重度**：中

**置信度**：0.85

**问题**：所有 string 类型 Zod schema 均未设置 `.max()` 长度限制。`domain` 参数缺少安全字符格式校验（与 S-1 同源但作为独立输入校验缺陷记录）。

**修复建议**：

```typescript
// schemas.ts 中为所有 string 参数添加合理的长度限制
query: z.string().max(1000).describe("Search query string"),
path: z.string().max(512).describe("Wiki page path..."),
source_path: z.string().max(512).describe("Path to raw source file..."),
domain: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(64).describe("Target domain..."),
title: z.string().max(500).describe("Experience title"),
content: z.string().max(100000).describe("Experience content..."),
source_task: z.string().max(200).describe("Source task identifier..."),
section: z.string().max(200).describe("Specific section heading..."),
```

## 5. kb_get_page 路径穿越检查完备性验证

主 Agent 要求重点验证 `kb_get_page` 和 `kb_ingest_source` 的 `path.relative` 检查是否完备。以下是逐向量验证：

| 攻击向量 | 输入示例 | path.relative 结果 | 检查结果 |
| --- | --- | --- | --- |
| `../` 序列 | `../../../etc/passwd` | `..\..\..\etc\passwd.md` | `startsWith("..")` -> 拦截 |
| 绝对路径 (Unix) | `/etc/passwd` | `..\..\..\etc\passwd.md` | `startsWith("..")` -> 拦截 |
| 绝对路径 (Windows 跨盘) | `C:\Windows\system32\config\SAM` | `C:\Windows\system32\config\SAM.md` | `path.isAbsolute()` -> 拦截 |
| 混合 `./` 和 `../` | `wiki/./.././../etc/passwd` | `..\..\etc\passwd.md` | `startsWith("..")` -> 拦截 |
| 空路径 | `""` | `""` | 不以 `..` 开头，不是绝对路径 -> **通过**（解析为 KB_ROOT/index.md，低风险） |
| 当前目录 | `.` | `""` | 同上 |

**结论**：`kb_get_page` 的路径穿越检查对于词法路径攻击是完备的。

**残余风险（低）**：符号链接攻击。如果 `wiki/` 目录下存在指向外部的符号链接，`path.resolve` 会解析符号链接，但 `path.relative` 计算的是词法相对路径，可能不反映实际解析后的路径。例如，如果 `wiki/coding/` 是指向 `/etc/` 的符号链接，则 `path = "wiki/coding/passwd"` 的 `path.relative` 结果为 `wiki\coding\passwd.md`（不以 `..` 开头），通过检查，但实际读取的是 `/etc/passwd`。

**风险评估**：MCP server 以编码 Agent 子进程方式运行，Agent 需先在文件系统中创建符号链接才能利用此漏洞。对于本地个人知识库场景，攻击者需已有文件系统写权限，风险较低。建议在 P2+ 阶段考虑使用 `fs.realpath` 做运行时解析验证。

## 6. 综合结论

- [ ] **通过**：可进入测试阶段
- [ ] **有条件通过**：需修复 N 项后重新提交
- [x] **阻断**：存在严重质量缺陷或高危安全漏洞

**阻断原因**：发现 1 项阻断级安全漏洞（S-1：`domain` 参数路径穿越）和 1 项高风险安全漏洞（S-2：日志注入）。根据 CLAUDE.md 7.2 节强制审查-测试闭环规则，主 Agent 必须立即停止后续步骤，无条件回退至编码阶段修复所有问题。

## 7. 阻塞项与回退指令

主 Agent 必须修复以下问题后重新提交审查：

### 必须修复（阻断级，阻止进入测试阶段）

| # | 问题 | 严重度 | 修复方案 | 验证标准 |
| --- | --- | --- | --- | --- |
| S-1 | `domain` 参数路径穿越 | 阻断 | Zod schema 添加 `domain` 正则校验 + write.ts 添加运行时 path.relative 检查 | 传入 `domain="../../../tmp"` 时返回 errorResult |
| S-2 | 日志注入 | 高 | `appendLogEntry` 和 `addPageToIndex` 中过滤换行符 | 传入含 `\n` 的 title 时 log.md 不出现伪造条目 |
| L-1 | kb_list_categories Date 解析 bug | 高 | 提取 `normalizeDate()` 到共享模块，在 read-only.ts 中调用 | frontmatter `date: 2026-07-20`（无引号）时 last_update 正确 |

### 建议修复（不阻断但强烈建议在本轮修复）

| # | 问题 | 严重度 | 修复方案 |
| --- | --- | --- | --- |
| S-3 | 输入校验不足 | 中 | 所有 string schema 添加 `.max()` 长度限制 |
| L-3 | 空 catch 块静默返回 | 中 | 添加 `console.error` 输出或区分错误类型 |
| L-5 | domain 路径穿越测试缺失 | 高 | 添加 `domain="../../../tmp"` 的测试用例 |
| L-6 | ARCH.md 契约偏差 | 中 | 更新 ARCH.md 3.1 同步实际实现 |

### 修复后要求

1. 修复完成后，主 Agent 必须重新执行第九节"变更影响自检与跨模块通知"的完整检查清单。
2. 重新提交给 `guardrail-enforcer` 进行审查（从本阶段重新开始完整闭环）。
3. 审查通过后，方可启动 `ac-verifier` 子 Agent。

## 8. 待澄清

### 8.1 ARCH.md 契约偏差

主 Agent 在两问回答中主动披露：kb_lint 的输出 schema（`{ issues: [{ type, severity, page, detail, suggestion }], summary: { total, by_type, pages_scanned, checks_run } }`）未在 ARCH.md 3.1 正式定义。

**guardrail-enforcer 意见**：输出结构设计合理（`severity` 和 `summary` 是有价值的扩展），但必须在 ARCH.md 3.1 中补充定义。建议主 Agent 在修复 S-1/S-2/L-1 的同时更新 ARCH.md。

### 8.2 ToolResult 索引签名 ADR

主 Agent 询问 `ToolResult` 的 `[x: string]: unknown` 索引签名是否应在 ADR 中记录。

**guardrail-enforcer 意见**：是的。这是 SDK 兼容性决策，影响所有 tool handler 的返回类型。建议在 ADR-001 中添加一条备注，或新建 ADR-002 专门记录此决策。理由：未来 SDK 升级可能移除此要求，届时需要知道哪些代码可以简化。

### 8.3 .gitignore 缺少 .env 排除项

`server/.gitignore` 排除了 `node_modules/`、`dist/`、`*.tsbuildinfo`，但缺少 `.env` 排除项。虽然当前项目不使用 `.env` 文件，但 CLAUDE.md 20.1 要求 `.gitignore` 包含 `.env`。建议添加。

## 9. 自动化建议

建议在 CI 管道中集成以下安全检查：

1. **`npm audit`**：在 `package.json` 添加 `"audit": "npm audit --audit-level=high"` 脚本，并在 GitHub Actions 中作为必需状态检查。
2. **Semgrep 规则**：针对 `path.join` + 用户输入的模式添加自定义规则，检测未做穿越检查的路径拼接。
3. **Zod schema 审计**：编写脚本扫描所有 Zod schema，确保 string 类型都有 `.max()` 限制。

```yaml
# .github/workflows/security.yml 示例
name: security
on: [pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: cd server && npm ci && npm audit --audit-level=high
```
