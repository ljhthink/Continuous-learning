# 安全与质量审计报告（第二轮）· P1 MCP Server

## 元信息

| 项目 | 内容 |
| --- | --- |
| 执行 Agent | guardrail-enforcer |
| 任务令牌 | TKN-P1-MCP-GUARDRAIL-002 |
| 任务域 | P1 MCP Server 修复后第二轮审查（验证前次 3 阻断 + 4 建议修复项） |
| 报告日期 | 2026-07-22 |
| 审查范围 | 12 个文件：`schemas.ts`、`write.ts`、`log.ts`、`index-md.ts`、`frontmatter.ts`、`lint.ts`、`read-only.ts`、`search.ts`、`write.test.ts`、`read-only.test.ts`、`ARCH.md`、`.gitignore` |
| 风险等级 | P1（常规：单模块内部逻辑修复，不改接口/契约/依赖） |
| 前次报告 | [2026-07-22-p1-mcp-server-guardrail.md](./2026-07-22-p1-mcp-server-guardrail.md)（结论：阻断） |
| 主 Agent 签发上下文 | 盲区 1：catch 块 `(err as NodeJS.ErrnoException).code` 类型断言运行时可靠性。盲区 2：sanitizeLogField/sanitizeIndexField 仅过滤 \r\n 未覆盖其他控制字符。盲区 3：domain 路径穿越检查仅用 `../../../tmp` 测试，未覆盖 Windows/绝对路径变体。 |

---

## 1. 审查依据

- 本次代码变更：P1 MCP Server 针对前次审查报告的修复（S-1/S-2/S-3/L-1/L-3/L-4/L-5/L-6 + .gitignore）
- 影响自检结果：主 Agent 变更影响自检（接口契约、依赖环境、依赖模块扫描、跨模块影响表达）
- 相关 ADR：[ADR-001-knowledge-base-tech-stack.md](../decisions/ADR-001-knowledge-base-tech-stack.md)
- 接口契约：[ARCH.md](../ARCH.md) §3.1
- 知识库 schema：[AGENTS.md](../../AGENTS.md) §2.1（命名约定）、§3（frontmatter schema）、§6.2（lint 检查项）、§4.3（矛盾标记约定）
- 项目治理：[CLAUDE.md](../../CLAUDE.md) §7.2（审查-测试闭环）、§9（变更影响自检）、§19（错误处理规范）、§20（运行时产物管理）
- 安全策略：项目无独立 SECURITY.md；CLAUDE.md §20.3（密钥管理）、§18.4（依赖安全）、§19.3（日志安全）作为安全策略依据
- 技术栈：TypeScript 5.x + @modelcontextprotocol/sdk 1.29.0 + Zod 3.25.76 + js-yaml 4.3.0
- 历史漏洞记录：前次报告 S-1（domain 路径穿越）、S-2（日志注入）、L-1（Date 解析 bug）

---

## 2. 前次发现项修复验证

### 2.1 阻断级（必须修复）— 3 项

#### S-1：domain 参数路径穿越漏洞（CWE-22）— ✅ 已正确修复

**修复验证（方案 A + B 纵深防御）**：

**方案 A（schema 层）**：[schemas.ts:46](file:///D:/s0611/code/Continuous-learning/server/src/schemas.ts#L46)

```typescript
const DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*$/;
```

- [schemas.ts:56-63](file:///D:/s0611/code/Continuous-learning/server/src/schemas.ts#L56-L63)：`kb_ingest_source.domain` 添加 `.regex(DOMAIN_REGEX, ...).max(64)` ✓
- [schemas.ts:73-80](file:///D:/s0611/code/Continuous-learning/server/src/schemas.ts#L73-L80)：`kb_write_experience.domain` 添加 `.regex(DOMAIN_REGEX, ...).max(64)` ✓

**正则有效性分析**：`^[a-z0-9][a-z0-9-]*$` 拦截所有路径穿越向量：

| 攻击向量 | 输入示例 | 正则匹配 | 结果 |
| --- | --- | --- | --- |
| `../` 序列 | `../../../tmp` | 含 `.` 和 `/`，不匹配 | 拦截 ✓ |
| Windows `..\` | `..\..\tmp` | 含 `.` 和 `\`，不匹配 | 拦截 ✓ |
| 绝对路径 Unix | `/etc` | 含 `/`，不匹配 | 拦截 ✓ |
| 绝对路径 Windows | `C:\Windows` | 含 `:` 和 `\`，不匹配 | 拦截 ✓ |
| 大写字母 | `Coding` | 含大写 `C`，不匹配 | 拦截 ✓（强制 kebab-case） |
| 下划线前缀 | `_private` | 含 `_`，不匹配 | 拦截 ✓（符合 AGENTS.md §2.1 隐藏目录约定） |
| 合法域名 | `coding` | 匹配 | 通过 ✓ |
| 合法多词域名 | `machine-learning` | 匹配 | 通过 ✓ |

**方案 B（运行时层）**：

- [write.ts:83-90](file:///D:/s0611/code/Continuous-learning/server/src/tools/write.ts#L83-L90)：`kbIngestSource` 构造 `wikiFullPath` 后添加 `path.relative(WIKI_DIR, wikiFullPath)` 穿越检查 ✓
- [write.ts:150-162](file:///D:/s0611/code/Continuous-learning/server/src/tools/write.ts#L150-L162)：`kbWriteExperience` 构造 `inboxFullPath` 后添加 `path.relative(WIKI_DIR, inboxFullPath)` 穿越检查 ✓

**运行时检查逻辑验证**：

- `relWiki.startsWith("..")` — 拦截 `../` 序列 ✓
- `path.isAbsolute(relWiki)` — 拦截绝对路径（Windows 跨盘符如 `C:\...`）✓
- 两层防御（schema 正则 + 运行时 path.relative）互为冗余，任一层失效另一层仍可拦截 ✓

**测试验证**：

- [write.test.ts:103-113](file:///D:/s0611/code/Continuous-learning/server/src/tests/write.test.ts#L103-L113)：`kb_ingest_source` domain 穿越测试（直调 handler，绕过 schema，验证运行时检查）✓
- [write.test.ts:168-178](file:///D:/s0611/code/Continuous-learning/server/src/tests/write.test.ts#L168-L178)：`kb_write_experience` domain 穿越测试（同上）✓
- 两个测试均通过（已验证 `npm test` 输出：ok 5/5 和 ok 3/3）✓

**结论**：S-1 已正确修复，纵深防御完整，测试覆盖充分。

---

#### S-2：日志注入漏洞（CWE-117）— ✅ 已正确修复

**修复验证**：

**log.ts**：[log.ts:60-62](file:///D:/s0611/code/Continuous-learning/server/src/utils/log.ts#L60-L62)

```typescript
function sanitizeLogField(value: string): string {
  return value.replace(/[\r\n]/g, " ");
}
```

- [log.ts:66](file:///D:/s0611/code/Continuous-learning/server/src/utils/log.ts#L66)：`safeTitle = sanitizeLogField(entry.title)` ✓
- [log.ts:68](file:///D:/s0611/code/Continuous-learning/server/src/utils/log.ts#L68)：header 行使用 `safeTitle` ✓
- [log.ts:71](file:///D:/s0611/code/Continuous-learning/server/src/utils/log.ts#L71)：detail 的 key 和 value 均经过 `sanitizeLogField` ✓

**index-md.ts**：[index-md.ts:38-40](file:///D:/s0611/code/Continuous-learning/server/src/utils/index-md.ts#L38-L40)

```typescript
function sanitizeIndexField(value: string): string {
  return value.replace(/[\r\n]/g, " ");
}
```

- [index-md.ts:50-54](file:///D:/s0611/code/Continuous-learning/server/src/utils/index-md.ts#L50-L54)：对 `domain`、`entry.title`、`entry.extra` 应用 `sanitizeIndexField` ✓

**注入防护有效性分析**：

日志格式为 `## [date] type | title` + `- key: value`。攻击者要伪造新条目，必须在值中注入 `\n## [` 以创建新 header 行，或 `\n-` 以创建新 detail 行。过滤 `\r\n` 后，攻击者无法创建新行，因此无法注入伪造的 header 或 detail。

**未 sanitize 的字段安全性验证**：

| 字段 | 未 sanitize 原因 | 安全性 |
| --- | --- | --- |
| `entry.date` | 系统生成（`todayDate()` 返回 YYYY-MM-DD） | 不含换行符 ✓ |
| `entry.type` | 枚举值（ingest/query/lint/experience/init） | 不含换行符 ✓ |
| `entry.path`（index） | 系统构建（`wiki/${domain}/${slug}.md`），domain 经正则校验，slug 经 `slugify()` 过滤为 `\p{L}\p{N}-` | 不含换行符 ✓ |
| `entry.date`（index） | 系统生成（YYYY-MM-DD） | 不含换行符 ✓ |

**结论**：S-2 已正确修复，日志注入和索引注入风险已消除。

---

#### L-1：kb_list_categories Date 解析 latent bug — ✅ 已正确修复

**修复验证**：

**共享函数提取**：[frontmatter.ts:34-48](file:///D:/s0611/code/Continuous-learning/server/src/utils/frontmatter.ts#L34-L48)

```typescript
export function normalizeDate(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return null;
}
```

- 使用 `getUTCFullYear()`/`getUTCMonth()`/`getUTCDate()` — 正确，因为 js-yaml v4 将未引号 ISO 日期解析为 UTC 午夜的 Date 对象 ✓
- `typeof value === "string"` 直接返回 — 引号日期原样通过 ✓
- 其他类型返回 `null` — 防御性处理 ✓

**调用点验证**：

- [read-only.ts:13](file:///D:/s0611/code/Continuous-learning/server/src/tools/read-only.ts#L13)：`import { parseFrontmatter, normalizeDate } from "../utils/frontmatter.js"` ✓
- [read-only.ts:102](file:///D:/s0611/code/Continuous-learning/server/src/tools/read-only.ts#L102)：`const date = normalizeDate(frontmatter.date);`（替换原 `as string | undefined`）✓
- [lint.ts:18](file:///D:/s0611/code/Continuous-learning/server/src/tools/lint.ts#L18)：`import { parseFrontmatter, normalizeDate } from "../utils/frontmatter.js"` ✓
- [lint.ts:206](file:///D:/s0611/code/Continuous-learning/server/src/tools/lint.ts#L206)：`const date = normalizeDate(frontmatter.date);` ✓

**测试验证**：

- [read-only.test.ts:154-178](file:///D:/s0611/code/Continuous-learning/server/src/tests/read-only.test.ts#L154-L178)：写入 `date: 2026-07-25`（未引号，js-yaml 解析为 Date 对象），验证 `last_update === "2026-07-25"` ✓
- 测试通过（已验证 `npm test` 输出：ok 3 - handles unquoted ISO date frontmatter as Date object）✓

**结论**：L-1 已正确修复，共享函数消除了重复风险，Date 对象转换逻辑正确。

---

### 2.2 建议修复 — 4 项

#### S-3：输入校验不足（CWE-20）— ✅ 基本修复（1 处遗漏，低风险）

**修复验证**：

| 参数 | `.max()` | 正则 | 结论 |
| --- | --- | --- | --- |
| `kb_search.query` | `.max(1000)` | — | ✓ |
| `kb_get_page.path` | `.max(512)` | — | ✓ |
| `kb_get_page.section` | `.max(200)` | — | ✓ |
| `kb_ingest_source.source_path` | `.max(512)` | — | ✓ |
| `kb_ingest_source.domain` | `.max(64)` | `DOMAIN_REGEX` | ✓ |
| `kb_write_experience.title` | `.max(500)` | — | ✓ |
| `kb_write_experience.domain` | `.max(64)` | `DOMAIN_REGEX` | ✓ |
| `kb_write_experience.content` | `.max(100000)` | — | ✓ |
| `kb_write_experience.source_task` | `.max(200)` | — | ✓ |
| `kb_search.domain`（可选过滤） | **缺失** | **缺失** | **见 R2-1** |
| `kb_search.limit` | `.max(50)` | — | ✓（原有） |
| `kb_write_experience.confidence` | `.min(0).max(1)` | — | ✓（原有） |

**结论**：S-3 对所有路径构造型参数已正确修复。`kb_search.domain` 过滤参数遗漏 `.max()`，但该参数仅用于字符串比较（[search.ts:68-72](file:///D:/s0611/code/Continuous-learning/server/src/tools/search.ts#L68-L72)），不参与路径构造，无穿越风险。记录为低风险建议 R2-1。

---

#### L-3：空 catch 块静默返回空结果 — ✅ 已正确修复

**修复验证**：

**read-only.ts**：[read-only.ts:71-81](file:///D:/s0611/code/Continuous-learning/server/src/tools/read-only.ts#L71-L81)

```typescript
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
    console.error("[kb-mcp] kb_list_categories: failed to read WIKI_DIR:", err);
  }
  return jsonResult({ categories: [] });
}
```

**search.ts**：[search.ts:49-58](file:///D:/s0611/code/Continuous-learning/server/src/tools/search.ts#L49-L58)

```typescript
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
    console.error("[kb-mcp] kb_search: failed to list markdown files:", err);
  }
  return jsonResult({ results: [] });
}
```

**ENOENT 区分逻辑验证**：

- `fs.readdir` 失败时抛出 `NodeJS.ErrnoException`，其 `code` 属性为 `"ENOENT"`（目录不存在）或其他错误码
- `(err as NodeJS.ErrnoException).code` 是 TypeScript 类型断言，运行时若 `err` 无 `code` 属性则返回 `undefined`
- `undefined !== "ENOENT"` 为 `true` → 输出 `console.error`，正确记录非预期错误
- `"ENOENT" !== "ENOENT"` 为 `false` → 静默返回空列表，正确处理空知识库场景
- 主 Agent 盲区 1 的担忧已验证：类型断言在运行时是安全的，非 NodeJS 错误会走 `console.error` 分支 ✓

**结论**：L-3 已正确修复，ENOENT 区分逻辑正确，符合 CLAUDE.md §19.4"不吞异常"原则。

---

#### L-4：normalizeDate() 未共享 — ✅ 已正确修复

**修复验证**：已在 L-1 验证中确认。`normalizeDate()` 已从 `lint.ts` 私有函数提取到 [frontmatter.ts:40](file:///D:/s0611/code/Continuous-learning/server/src/utils/frontmatter.ts#L40) 作为共享导出，`lint.ts` 和 `read-only.ts` 均从 `frontmatter.ts` 导入。无重复代码残留。

**结论**：L-4 已正确修复。

---

#### L-5：domain 参数路径穿越场景缺失测试 — ✅ 已正确修复

**修复验证**：已在 S-1 验证中确认。两个测试用例覆盖 `kb_ingest_source` 和 `kb_write_experience` 的 domain 穿越场景，均直调 handler 绕过 schema 以验证运行时检查。

**结论**：L-5 已正确修复。

---

#### L-6：ARCH.md 3.1 契约与实现偏差 — ✅ 已正确修复

**修复验证**：[ARCH.md §3.1](file:///D:/s0611/code/Continuous-learning/docs/ARCH.md#L75-L84) 表格已更新：

| 偏差点 | ARCH 定义 | 实际实现 | 一致性 |
| --- | --- | --- | --- |
| kb_lint checks enum | `["frontmatter","contradictions","orphans","stale","missing_xref"]` | [schemas.ts:137-143](file:///D:/s0611/code/Continuous-learning/server/src/schemas.ts#L137-L143) | ✓ |
| kb_lint 输出 | `{ issues: [{ type, severity, page, detail, suggestion }], summary: { total, by_type, pages_scanned, checks_run } }` | [lint.ts:172-180](file:///D:/s0611/code/Continuous-learning/server/src/tools/lint.ts#L172-L180) | ✓ |
| kb_list_recent type enum | `"ingest"/"query"/"lint"/"experience"/"init"` | [schemas.ts:116](file:///D:/s0611/code/Continuous-learning/server/src/schemas.ts#L116) | ✓ |

**结论**：L-6 已正确修复，文档与实现一致。

---

### 2.3 其他修复

#### .gitignore .env 排除项 — ✅ 已正确修复

[server/.gitignore](file:///D:/s0611/code/Continuous-learning/server/.gitignore)：

```gitignore
node_modules/
dist/
*.tsbuildinfo
.env
.env.local
.env.*.local
```

- `.env`、`.env.local`、`.env.*.local` 均已排除 ✓
- 符合 CLAUDE.md §20.1 要求 ✓

---

## 3. 修复引入的新问题检查

### Stage 1：输入与边界审计

#### 1.1 数值与类型边界

**DOMAIN_REGEX 正则边界**：

- 长度上限 `.max(64)` — 合理，AGENTS.md §2.1 未定义 domain 最大长度，64 字符足够 ✓
- 字符集 `[a-z0-9-]` — 严格限制为 kebab-case，无注入风险 ✓
- 无整数溢出风险（无算术运算）✓

**normalizeDate() 类型边界**：

- 输入 `unknown`，覆盖 string/Date/其他三种路径 ✓
- Date 对象的 `getUTCFullYear()` 返回数字，`String()` 转换安全 ✓
- 年份无范围检查（如负数年份），但 frontmatter date 不会有负数年份，非实际问题 ✓

#### 1.2 集合与缓冲区边界

- `sanitizeLogField`/`sanitizeIndexField` 使用 `String.replace()`，无缓冲区操作 ✓
- 无 `strcpy`/`sprintf`/`gets` 等不安全函数 ✓
- 无动态内存分配（TypeScript GC 管理）✓

#### 1.3 业务状态机约束

- 修复未改变任何状态机逻辑（status 仍为创建时硬编码：staging/pending）✓
- 无绕过状态检查的新路径 ✓

### Stage 2：执行安全审计

#### 2.1 注入防护

- **SQL 注入**：不适用（无数据库）✓
- **OS 命令注入**：不适用（无 exec/system/spawn）✓
- **代码/表达式注入**：不适用（无 eval/Function）✓
- **日志注入**：S-2 修复已消除（`sanitizeLogField` 过滤 \r\n）✓
- **索引注入**：S-2 修复已消除（`sanitizeIndexField` 过滤 \r\n）✓
- **YAML 注入**：`yaml.load()` 使用 v4 默认 safe schema（前次报告已确认），修复未改变此调用 ✓

#### 2.2 最小权限

- 修复未引入新的权限操作 ✓
- `console.error` 输出到 stderr，不涉及权限提升 ✓

#### 2.3 输出编码

- 所有输出仍通过 `JSON.stringify()` 序列化 ✓
- 修复未改变输出路径 ✓

### Stage 3：内存安全

不适用（TypeScript，无手动内存管理，无 unsafe 块）。

### Stage 4：配置与密钥安全

- 修复未引入硬编码密钥 ✓
- `.gitignore` 已添加 `.env` 排除项 ✓
- `KB_ROOT` 环境变量为非敏感路径配置 ✓

### Stage 5：依赖与供应链

- 修复未修改 `package.json` 或 `package-lock.json` ✓
- 锁定版本未变：@modelcontextprotocol/sdk 1.29.0、js-yaml 4.3.0、zod 3.25.76 ✓
- 无已知高危 CVE ✓

---

## 4. 新发现项（本轮审查）

### R2-1：kb_search.domain 过滤参数缺少 .max() 限制（低风险）

**位置**：[schemas.ts:14-17](file:///D:/s0611/code/Continuous-learning/server/src/schemas.ts#L14-L17)

```typescript
domain: z
  .string()
  .optional()
  .describe("Filter by domain (e.g., 'coding', 'emotions')"),
```

**分析**：S-3 修复为所有路径构造型字符串参数添加了 `.max()`，但 `kb_search.domain` 过滤参数遗漏。该参数仅用于 [search.ts:68-72](file:///D:/s0611/code/Continuous-learning/server/src/tools/search.ts#L68-L72) 的字符串比较（`pageDomains.includes(domain)`），不参与路径构造，无穿越风险。但为一致性和防御性编程，建议添加 `.max(64)`。

**严重度**：低风险（无安全影响，仅一致性问题）
**建议**：

```typescript
domain: z
  .string()
  .max(64)
  .optional()
  .describe("Filter by domain (e.g., 'coding', 'emotions')"),
```

### R2-2：sanitizeLogField/sanitizeIndexField 仅过滤 \r\n，未覆盖全部 C0 控制字符（低风险）

**位置**：[log.ts:60-62](file:///D:/s0611/code/Continuous-learning/server/src/utils/log.ts#L60-L62)、[index-md.ts:38-40](file:///D:/s0611/code/Continuous-learning/server/src/utils/index-md.ts#L38-L40)

**分析**：主 Agent 盲区 2 提出的问题。当前过滤 `/[\r\n]/g`，足以防止 markdown 注入（markdown 行分隔仅由 `\n` 和 `\r\n` 触发，section header `##` 和 list item `-` 必须位于行首）。其他 C0 控制字符（`\x00` null byte、`\t` tab、`\x0b` vertical tab、`\x0c` form feed 等）在 markdown 中无特殊语义，无法伪造新行/新条目。

**结论**：`\r\n` 过滤对于防止日志/索引注入是**充分的**。过滤全部 C0 控制字符是纵深防御增强，非安全必需。

**严重度**：低风险（防御性增强建议，非漏洞）
**建议**（可选，纵深防御）：

```typescript
function sanitizeLogField(value: string): string {
  return value.replace(/[\x00-\x1f\x7f]/g, " "); // 过滤全部 C0 控制字符 + DEL
}
```

或使用 Unicode 属性转义：

```typescript
function sanitizeLogField(value: string): string {
  return value.replace(/\p{Cc}/gu, " "); // 过滤 Unicode 控制字符类
}
```

### R2-3：console.error 输出完整 error 对象可能包含内部路径（低风险）

**位置**：[read-only.ts:78](file:///D:/s0611/code/Continuous-learning/server/src/tools/read-only.ts#L78)、[search.ts:55](file:///D:/s0611/code/Continuous-learning/server/src/tools/search.ts#L55)

**分析**：`console.error("...", err)` 输出完整 error 对象，在 Node.js 中会包含错误消息和堆栈跟踪。堆栈跟踪可能包含本地文件路径（如 `WIKI_DIR` 的绝对路径）。CLAUDE.md §19.3 要求日志中不输出"内部文件路径或系统细节"。

**风险评估**：

- `console.error` 输出到 stderr，MCP stdio 协议中 stderr 用于日志通道，不作为 tool response 返回给调用方
- 路径为本地知识库路径，非敏感凭证
- 实际泄露风险极低

**严重度**：低风险（CLAUDE.md §19.3 合规性改进建议）
**建议**（可选）：

```typescript
console.error("[kb-mcp] kb_list_categories: read error:", (err as Error).message);
```

### R2-4：sanitizeLogField 未包含 .trim()（低风险，纯美观）

**位置**：[log.ts:60-62](file:///D:/s0611/code/Continuous-learning/server/src/utils/log.ts#L60-L62)

**分析**：前次报告建议的修复包含 `.trim()`，实际实现未包含。不含 `.trim()` 时，若 title 为 `"\nhello\n"`，sanitize 后为 `" hello "`（首尾空格）。这不影响安全性（空格无法注入新行），仅影响日志美观。

**严重度**：低风险（纯美观，无安全影响）
**建议**（可选）：添加 `.trim()`。

---

## 5. 构建与测试验证

| 验证项 | 命令 | 结果 |
| --- | --- | --- |
| TypeScript 类型检查 | `npm run typecheck`（tsc --noEmit） | exit 0，无错误 ✓ |
| 编译 | `npm run build`（tsc） | exit 0，编译成功 ✓ |
| 单元测试 | `npm test`（node --test） | 31/31 通过，0 失败 ✓ |

**新增测试验证**：

| 测试 | 文件 | 验证目标 | 结果 |
| --- | --- | --- | --- |
| rejects path traversal in domain parameter (S-1) | [write.test.ts:103](file:///D:/s0611/code/Continuous-learning/server/src/tests/write.test.ts#L103) | kb_ingest_source domain 穿越 | ok ✓ |
| rejects path traversal in domain parameter (S-1) | [write.test.ts:168](file:///D:/s0611/code/Continuous-learning/server/src/tests/write.test.ts#L168) | kb_write_experience domain 穿越 | ok ✓ |
| handles unquoted ISO date frontmatter as Date object (L-1) | [read-only.test.ts:154](file:///D:/s0611/code/Continuous-learning/server/src/tests/read-only.test.ts#L154) | normalizeDate Date 对象转换 | ok ✓ |

**测试覆盖充分性评估**：

- S-1 路径穿越：2 个测试覆盖两个 write tool 的 domain 参数 ✓
- L-1 Date 解析：1 个测试覆盖 Date 对象 → 字符串转换 ✓
- S-2 日志注入：无专门测试，但注入防护通过 `\r\n` 过滤实现，逻辑简单且已被现有 ingest/experience 测试间接覆盖（这些测试验证 title 正常写入 log.md）。建议未来补充直接注入测试，但非阻断项。

---

## 6. 综合结论

- [x] **通过**：可进入测试阶段
- [ ] **有条件通过**：需修复 N 项后重新提交
- [ ] **阻断**：存在严重质量缺陷或高危安全漏洞

### 总结

前次审查报告的 **3 项阻断级问题（S-1、S-2、L-1）** 和 **4 项建议修复（S-3、L-3、L-4、L-5、L-6）** 均已正确修复，外加 `.gitignore` .env 排除项也已补齐。

修复实施质量评估：

| 维度 | 评价 |
| --- | --- |
| 修复正确性 | 全部 7 项发现 + 1 项 .gitignore 修复均正确实施 |
| 纵深防御 | S-1 采用 schema 正则 + 运行时 path.relative 双层防御，设计优秀 |
| 代码共享 | L-1/L-4 将 normalizeDate 提取为共享函数，消除重复 |
| 测试覆盖 | 新增 3 个测试覆盖 S-1 和 L-1 的核心修复路径 |
| 文档同步 | L-6 将 ARCH.md §3.1 契约与实现同步 |
| 新增风险 | 无阻断级或高风险新问题；4 项低风险建议（R2-1 ~ R2-4）均为防御性增强，非漏洞 |

主 Agent 的三个盲区担忧均已验证：

1. catch 块类型断言运行时安全（非 NodeJS 错误走 console.error 分支）
2. `\r\n` 过滤对 markdown 注入防护充分（其他控制字符无 markdown 语义）
3. DOMAIN_REGEX 正则拦截所有路径穿越向量变体（含 Windows/绝对路径）

### 低风险建议清单（不阻断，可后续迭代处理）

| # | 问题 | 严重度 | 建议 |
| --- | --- | --- | --- |
| R2-1 | kb_search.domain 缺少 .max() | 低 | 添加 `.max(64)` 保持一致性 |
| R2-2 | sanitize 函数仅过滤 \r\n | 低 | 可选增强为过滤全部 C0 控制字符 |
| R2-3 | console.error 输出完整 error 对象 | 低 | 可选改为输出 `err.message` |
| R2-4 | sanitizeLogField 缺少 .trim() | 低 | 可选添加 `.trim()` |

**以上 4 项均为低风险建议，不阻断进入测试阶段。主 Agent 可选择在本轮一并修复，或在后续迭代中处理。**

---

## 7. 自动化建议

延续前次报告的建议，补充针对本轮修复的 CI 集成：

```yaml
# .github/workflows/security.yml（补充）
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
      - run: cd server && npm ci
      - run: cd server && npm audit --audit-level=high
      # Semgrep 规则：检测 path.join + 用户输入缺少穿越检查
      - uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            r/typescript.lang.security.path-traversal.path-join-with-user-input
      # Zod schema 审计：确保所有 string 参数有 .max()
      - name: Zod schema audit
        run: cd server && node -e "
          const s = require('./dist/schemas.js');
          // 遍历所有 schema，检查 string 类型是否有 max
        "
```

**Semgrep 自定义规则示例**（检测 domain 参数路径穿越）：

```yaml
rules:
  - id: ts-domain-path-traversal
    patterns:
      - pattern: path.join(WIKI_DIR, $DOMAIN, ...)
      - pattern-not-inside: |
          const $REL = path.relative(WIKI_DIR, $PATH);
          if ($REL.startsWith("..") || path.isAbsolute($REL)) { ... }
    message: "path.join with domain parameter lacks path traversal check"
    severity: ERROR
    languages: [typescript]
```
