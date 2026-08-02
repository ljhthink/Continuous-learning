# Karpathy 缺失功能补全 · 安全与质量审计报告

| 项目 | 内容 |
| --- | --- |
| 任务令牌 | TKN-KARPATHY-FIX-002 |
| 审计 Agent | guardrail-enforcer（代码安全护栏） |
| 日期 | 2026-08-02 |
| 上游方案 | [2026-08-02-missing-features-solution.md](2026-08-02-missing-features-solution.md) |
| 引用规约 | 全文使用相对路径引用代码（ADR-010） |
| 治理依据 | CLAUDE.md §7.2 审查-测试闭环、§10 guardrail-enforcer、§12 GitHub Flow、§19.4 错误处理、§20.3 密钥管理 |

---

## 1. 执行摘要

### 1.1 总体结论

| 严重度 | 数量 | 状态 |
| --- | --- | --- |
| 阻断级 (Blocking) | 0 | PASS |
| 高危 (High) | 0 | PASS |
| 中危 (Medium) | 2 | 有条件通过（建议修复，不阻断合并） |
| 低危/建议 (Low) | 3 | 记录备查 |

**合并就绪裁定：PASS**

本次变更未发现阻断级或高危安全漏洞。所有新增路径处理工具（`kb_write_answer`、`kb_organize_staging`、`runAutoXref`/`applyXrefWithAbsPaths`）均正确实施路径穿越防御（Zod schema 正则 + 运行时 `path.relative` 二次校验）。所有新增日志类型（`xref`、`writeback`、`organize`）均通过 `appendLogEntry` → `sanitizeLogField` 进行 CWE-117 日志注入防护。所有 frontmatter 写入均通过 `serializeFrontmatter`（`js-yaml dump()` + DEF-008 格式约定）。CI workflow 遵循最小权限原则（`contents: read`），无 `pull_request_target`，不自动 commit 到 main。

### 1.2 审查范围

| 维度 | 数量 |
| --- | --- |
| 审查文件数 | 11（7 个源码 + 1 个 CI workflow + 3 个文档） |
| 审查函数/方法数 | 12 个新增/修改函数 |
| 发现问题总数 | 5（0 阻断 + 0 高危 + 2 中危 + 3 低危） |

### 1.3 技术栈上下文

- 语言：TypeScript（Node.js ESM）
- 框架：@modelcontextprotocol/sdk（MCP JSON-RPC over stdio）
- 数据库：无（文件系统即数据库，markdown + YAML frontmatter）
- 部署：本地 MCP server + Tauri GUI 桌面应用 + GitHub Actions CI
- 依赖：js-yaml@5、zod@4（无新增依赖）

---

## 2. 审查发现汇总表

| ID | 严重度 | 文件:行号 | 问题描述 | 修复建议 |
| --- | --- | --- | --- | --- |
| M-1 | 中危 | `.github/workflows/kb-maintenance.yml:53,107-111,143-146` | CI workflow 在 shell `run:` 块中直接内联 `${{ }}` GitHub Actions 表达式，属于已知反模式。当前所有注入值（`inputs.task` 为 choice 枚举、`github.event_name`/`github.repository`/`github.ref_name`/`github.sha` 均为 GitHub 控制值）不可被攻击者控制，实际不可利用，但违反 GitHub Security Lab 最佳实践。 | 改用 `env:` 块传递上下文变量，shell 内仅引用 `$ENV_VAR`。示例见 §4.1。 |
| M-2 | 中危 | `server/src/schemas.ts:161-166` | `kbWriteAnswerSchema.cited_pages` 使用 `z.array(z.string().max(512))` ，未验证元素是否为合法 wiki 页路径格式。这些值直接写入 frontmatter `related` 字段。虽然 `serializeFrontmatter` → `js-yaml dump()` 会对 YAML 特殊字符正确转义（不构成注入漏洞），但缺乏格式校验是纵深防御缺口。 | 为 `cited_pages` 元素追加路径格式正则（如 `z.string().regex(/^wiki\/[a-z0-9-]+\/.+/)`），与 `domain` 校验风格一致。 |
| L-1 | 低危 | `server/src/schemas.ts:299` | `kbOrganizeStagingSchema.tags` 使用 `z.array(z.string().max(64))` ，未对单个 tag 格式做正则校验，与同 schema 中 `domain_suggestion` 的 `DOMAIN_REGEX` 校验风格不一致。不构成漏洞（`js-yaml dump()` 转义安全）。 | 可选：追加 tag 格式正则（如 `z.string().regex(/^[a-z0-9-]+$/)`）。 |
| L-2 | 低危 | `server/src/tools/write.ts:458` | `kbWriteAnswer` 将 `cited_pages` 原样写入 `frontmatter.related`，未规范化 `.md` 扩展名。AGENTS.md §3.3 约定 `related` 为纯路径数组（无 `.md` 后缀），但 caller 可能传入带 `.md` 的路径，导致数据格式不一致。 | 在写入前统一 strip `.md` 后缀：`cited_pages.map(p => p.replace(/\.md$/, ""))`。 |
| L-3 | 低危 | `server/src/tools/staging.ts:350-389` | `kbOrganizeStaging` 采用 read-modify-write 模式无文件锁（TOCTOU 窗口）。此模式与现有 `kbConfirmStaging`/`kbRejectStaging` 一致，非本次变更引入。 | 记录为已知技术债；如需修复应统一所有 staging 工具（超出本次范围）。 |

---

## 3. 审计焦点逐项验证

### 3.1 焦点 1：路径穿越防护（S-1/ADR-010）

**结论：PASS**

逐工具验证：

#### 3.1.1 `kbWriteAnswer`（[write.ts:405-417](../../server/src/tools/write.ts#L405-L417)）

```typescript
const inboxFullPath = path.join(wikiDir, domain, "experiences", "inbox", `${slug}.md`);
const relInbox = path.relative(wikiDir, inboxFullPath);
if (relInbox.startsWith("..") || path.isAbsolute(relInbox)) {
  return errorResult(`Path traversal detected in domain: ${domain}`);
}
```

- `domain` 经 Zod `DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*$/` 校验（[schemas.ts:47](../../server/src/schemas.ts#L47)），禁止 `/`、`\`、`..` 等穿越字符。
- `slug` 由 `slugify(title)` 生成（[write.ts:733-741](../../server/src/tools/write.ts#L733-L741)），`.replace(/[^\p{L}\p{N}-]/gu, "")` 移除所有非字母/数字/连字符字符，路径分隔符无法残留。
- 运行时 `path.relative` 二次校验确认解析后路径未逃逸 `wikiDir`。
- **双层防御完备。**

#### 3.1.2 `kbOrganizeStaging`（[staging.ts:340-345](../../server/src/tools/staging.ts#L340-L345)）

```typescript
const withExt = pagePath.endsWith(".md") ? pagePath : `${pagePath}.md`;
const fullPath = path.resolve(kbRoot, withExt);
const rel = path.relative(kbRoot, fullPath);
if (rel.startsWith("..") || path.isAbsolute(rel)) {
  return errorResult(`Path traversal detected: ${pagePath}`);
}
```

- `page_path` 来自用户输入，Zod schema 仅限制 `max(512)` 长度（无格式正则），但运行时 `path.resolve` + `path.relative` 校验兜底。
- 测试穿越路径 `../../../etc/passwd`：`path.resolve(kbRoot, "../../../etc/passwd.md")` 解析到 KB root 之外，`path.relative` 返回以 `..` 开头的字符串，被拦截。
- 测试绝对路径 `/etc/passwd`：`path.resolve` 保留绝对路径，`path.relative` 返回以 `..` 开头或绝对路径，被拦截。
- **运行时校验完备。**

#### 3.1.3 `runAutoXref` / `applyXrefWithAbsPaths`（[xref.ts:151-210](../../server/src/utils/xref.ts#L151-L210)）

- `applyXrefWithAbsPaths` 接收 `candidatesWithAbs`，其中 `absPath` 来自 `loadAllPages()` 的 `PageInfo.absPath`（[pages.ts:57-81](../../server/src/utils/pages.ts#L57-L81)），由 `listMarkdownFiles(getWikiDir())` 文件系统遍历生成——**非用户输入**，是可信路径。
- `newPage.absPath` 在 `kbIngestSource` 中由 `path.join(wikiDir, domain, `${slug}.md`)` 构造（[write.ts:173](../../server/src/tools/write.ts#L173)），`domain` 和 `slug` 均已校验。
- `updateNewPageRelated` 接收 `newPageAbsPath`（同上，已校验）和 `candidatePaths`（来自 `touched` 列表，源自 `PageInfo.relPath`，文件系统生成）。
- **无用户控制路径到达文件操作。**

#### 3.1.4 Windows 路径规范化（`\\?\` 前缀）

- `getKbRoot()`（[config.ts:23-27](../../server/src/config.ts#L23-L27)）使用 `path.resolve(process.env.KB_ROOT)` 或 `path.resolve(process.cwd(), "..")`，`path.resolve` 不添加 `\\?\` 前缀。
- 所有 `path.relative` 比较的两端（KB root 与用户路径）均经 `path.resolve`/`path.join` 处理，规范化方式一致。
- **不存在 `\\?\` 前缀不一致导致穿越校验绕过的风险。**

### 3.2 焦点 2：注入漏洞防护

**结论：PASS**

#### 3.2.1 日志注入（CWE-117）

所有新增日志类型均通过 `appendLogEntry`（[log.ts:67-80](../../server/src/utils/log.ts#L67-L80)），该函数对 `title`、`details` 的 key 和 value 均调用 `sanitizeLogField`（[log.ts:62-64](../../server/src/utils/log.ts#L62-L64)），strip CR/LF 防止伪造日志条目。

| 新增日志类型 | 调用位置 | 用户输入字段 | sanitize 路径 |
| --- | --- | --- | --- |
| `xref` | [write.ts:264-276](../../server/src/tools/write.ts#L264-L276) | `touched`（文件系统路径，非用户输入） | `appendLogEntry` → `sanitizeLogField` |
| `writeback` | [write.ts:481-492](../../server/src/tools/write.ts#L481-L492) | `source_query`（用户输入） | 调用前 `.replace(/[\r\n]+/g, " ")` 预处理 + `appendLogEntry` → `sanitizeLogField` 双重防护 |
| `organize` | [staging.ts:397-406](../../server/src/tools/staging.ts#L397-L406) | `updated_fields`（硬编码字符串）、`domain_suggestion`（Zod regex 校验） | `appendLogEntry` → `sanitizeLogField` |

- `writeback` 日志的 `source_query` 字段在调用 `appendLogEntry` 前已做 `.replace(/[\r\n]+/g, " ")`（[write.ts:488](../../server/src/tools/write.ts#L488)），是纵深防御的体现。
- **日志注入防护完备。**

#### 3.2.2 Frontmatter 注入

所有 frontmatter 写入均通过 `serializeFrontmatter`（[frontmatter.ts:61-86](../../server/src/utils/frontmatter.ts#L61-L86)），使用 `js-yaml` 的 `dump()` 函数（`flowLevel: 1`, `lineWidth: -1`, `noRefs: true`）。`js-yaml dump()` 会对 YAML 特殊字符（`:`, `#`, `"`, `'`, `\n`, `[`, `]`, `{`, `}` 等）正确转义。

关键验证点：

- `kbWriteAnswer` 的 `source_task` 字段（[write.ts:426](../../server/src/tools/write.ts#L426)）：`query-writeback:${provenanceQuery}`，`provenanceQuery` 已 strip CR/LF。即使残留 YAML 特殊字符，`dump()` 会被引号包裹转义。
- `kbWriteAnswer` 的 `related` 字段（[write.ts:458](../../server/src/tools/write.ts#L458)）：`cited_pages.slice()`，值来自用户输入。`dump()` 以 flow 风格 `related: [...]` 序列化，含特殊字符的元素会被双引号包裹。经分析 `js-yaml@5.2.1` 的 `dump` 行为：含换行符的字符串在 flow 上下文中使用双引号 + `\n` 转义序列，无法逃逸 YAML 结构。
- **Frontmatter 注入防护完备。**

#### 3.2.3 代码/命令注入

- 全量扫描 7 个变更源码文件，未发现 `eval()`、`Function()` 构造器、`child_process.exec()`、`system()` 或任何动态代码执行调用。
- 唯一的 `.exec()` 匹配是 `headingRe.exec(p.body)`（[lint.ts:518](../../server/src/tools/lint.ts#L518)），是 `RegExp.prototype.exec()` 正则方法，非命令执行。
- **无代码/命令注入风险。**

### 3.3 焦点 3：输入验证（Zod schemas）

**结论：PASS（含 1 个中危纵深防御建议 M-2）**

| Schema | 字段 | 校验规则 | 评价 |
| --- | --- | --- | --- |
| `kbWriteAnswerSchema` | `title` | `z.string().max(500)` | 合理 |
| | `domain` | `z.string().regex(DOMAIN_REGEX).max(64)` | 路径穿越防御完备 |
| | `content` | `z.string().max(100000)` | 100KB 上限合理 |
| | `confidence` | `z.number().min(0).max(1)` | 边界正确 |
| | `source_query` | `z.string().max(1000)` | 合理 |
| | `cited_pages` | `z.array(z.string().max(512)).min(2).max(50)` | min(2) 门控正确；缺路径格式正则（M-2） |
| `kbOrganizeStagingSchema` | `page_path` | `z.string().max(512)` | 运行时校验兜底 |
| | `title` | `z.string().max(500).optional()` | 合理 |
| | `tags` | `z.array(z.string().max(64)).max(20).optional()` | 缺格式正则（L-1） |
| | `description` | `z.string().max(500).optional()` | 合理 |
| | `domain_suggestion` | `z.string().regex(DOMAIN_REGEX).max(64).optional()` | 完备 |
| `kbIngestSourceSchema` | `auto_xref` | `z.boolean().optional()` | 合理 |
| `kbLintSchema` | `checks` | `z.array(z.enum([..., "missing_concept"])).optional()` | 枚举完备 |
| `kbListRecentSchema` | `type` | enum 含 `writeback`、`xref` | 与新日志类型对齐 |

### 3.4 焦点 4：幂等性

**结论：PASS**

#### 3.4.1 auto-xref 幂等性

`applyXrefWithAbsPaths` 在写入前检查候选页是否已含新页链接（[xref.ts:166-174](../../server/src/utils/xref.ts#L166-L174)）：

```typescript
const alreadyLinked =
  body.includes(newPageLink) ||
  body.includes(`[[${newPageBasename}]]`) ||
  body.includes(`[[${newPageBasename}|`);
if (alreadyLinked) {
  skipped.push(c.path);
  continue;
}
```

- 三种链接形式检测：完整 relPath、basename、basename+alias。
- `frontmatter.related` 数组追加前检查 `!existingRelated.includes(newPage.relPath)`（[xref.ts:196](../../server/src/utils/xref.ts#L196)）。
- `updateNewPageRelated` 检查 `toAdd.length === 0` 时提前返回不写盘（[xref.ts:232](../../server/src/utils/xref.ts#L232)）。
- **重复运行 auto-xref 不会产生重复链接或重复写盘。幂等性保证。**

#### 3.4.2 `kb_organize_staging` 幂等性

- `date` bump 每次调用更新为当天日期——这是预期行为（`date` 语义为"创建或最后更新日期"，AGENTS.md §3.1），不构成幂等性问题。
- 重复调用传入相同 `title`/`tags`/`description` 会覆盖为相同值——等价幂等。
- **幂等性可接受。**

### 3.5 焦点 5：错误隔离

**结论：PASS**

auto-xref 实现了三层错误隔离，符合 CLAUDE.md §19.4（不吞异常 + Graceful Degradation）：

| 层级 | 位置 | 错误处理 | 效果 |
| --- | --- | --- | --- |
| 单候选页 | [xref.ts:161-206](../../server/src/utils/xref.ts#L161-L206) | `try/catch` per candidate，`console.error` + push to `skipped` + `continue` | 单页失败不中断批次 |
| 新页 related 回写 | [xref.ts:278-283](../../server/src/utils/xref.ts#L278-L283) | `try/catch`，`console.error` + 继续 | related 回写失败不阻断主流程 |
| auto-xref 整体 | [write.ts:239-283](../../server/src/tools/write.ts#L239-L283) | `try/catch`，`console.error` + `xrefSummary` 置空 + 继续 | auto-xref 失败不阻断 ingest 主流程 |

- 所有 `catch` 块均通过 `console.error` 输出到 stderr（MCP 使用 stdout，stderr 不污染协议）。
- **无空 catch 块（§19.4 禁止）。错误隔离完备。**

### 3.6 焦点 6：密钥与凭据安全

**结论：PASS**

- 全量扫描 7 个变更源码文件 + 1 个 CI workflow，未发现硬编码的 API key、密码、token、内部 IP 或域名。
- `getKbRoot()`（[config.ts:23-27](../../server/src/config.ts#L23-L27)）通过 `process.env.KB_ROOT` 环境变量获取路径——非硬编码。
- CI workflow `.github/workflows/kb-maintenance.yml` 未引用任何 `secrets.*` 或 `GITHUB_TOKEN`。
- `.gitignore`（[.gitignore:12-14](../../.gitignore#L12-L14)）已排除 `.env`、`.env.local`、`.env.*.local`。
- **无密钥泄露风险。**

### 3.7 焦点 7：CI workflow 安全

**结论：PASS（含 1 个中危建议 M-1）**

| 检查项 | 状态 | 说明 |
| --- | --- | --- |
| 最小权限 | PASS | `permissions: contents: read`（[kb-maintenance.yml:37-38](../../.github/workflows/kb-maintenance.yml#L37-L38)），仅读权限 |
| 无 `pull_request_target` | PASS | 触发器仅 `schedule` + `workflow_dispatch`（[L21-35](../../.github/workflows/kb-maintenance.yml#L21-L35)） |
| 无 untrusted input 注入 shell | PASS（有建议） | `inputs.task` 为 `choice` 枚举（固定 3 选项），`github.*` 均为 GitHub 控制值。但使用 `${{ }}` 直接内联 shell 是反模式（M-1） |
| 不自动 commit 到 main | PASS | 仅 `upload-artifact@v4` 上传报告，不 `git push`（符合 CLAUDE.md §12 GitHub Flow） |
| 报告仅 artifact | PASS | `retention-days: 90`，`if-no-files-found: warn`（[L161-170](../../.github/workflows/kb-maintenance.yml#L161-L170)） |
| 超时限制 | PASS | `timeout-minutes: 15`（[L73](../../.github/workflows/kb-maintenance.yml#L73)） |
| 失败重试 | PASS | 幂等 job 重试 1 次（`kb_lint` 只读、`/dream` 已幂等），符合 CronSignal 建议 |
| `set -euo pipefail` | PASS | 两个 run step 均有（[L97, L132](../../.github/workflows/kb-maintenance.yml#L97)） |

### 3.8 焦点 8：DEF-008 frontmatter 格式

**结论：PASS**

所有新增 frontmatter 写入均使用 `serializeFrontmatter`（[frontmatter.ts:61-86](../../server/src/utils/frontmatter.ts#L61-L86)）：

| 调用点 | 文件:行号 | 使用 `serializeFrontmatter` |
| --- | --- | --- |
| `kbIngestSource` | [write.ts:199](../../server/src/tools/write.ts#L199) | YES |
| `kbWriteExperience` | [write.ts:341](../../server/src/tools/write.ts#L341) | YES |
| `kbWriteAnswer` | [write.ts:466](../../server/src/tools/write.ts#L466) | YES |
| `kbOrganizeStaging` | [staging.ts:389](../../server/src/tools/staging.ts#L389) | YES |
| `applyXrefWithAbsPaths` | [xref.ts:200](../../server/src/utils/xref.ts#L200) | YES |
| `updateNewPageRelated` | [xref.ts:235](../../server/src/utils/xref.ts#L235) | YES |

`serializeFrontmatter` 满足 DEF-008 / ADR-008 决策 1 全部约定：

| 约定 | 实现 | 验证 |
| --- | --- | --- |
| 顶层数组 flow 风格 | `flowLevel: 1` | `domain: [coding]` |
| 禁止换行 | `lineWidth: -1` | 标量值单行 |
| ISO 日期无引号 | regex 后处理 strip `'YYYY-MM-DD'` → `YYYY-MM-DD` | [frontmatter.ts:77-80](../../server/src/utils/frontmatter.ts#L77-L80) |
| `---` 后空行 | `---\n\n${normalizedBody}` | [frontmatter.ts:85](../../server/src/utils/frontmatter.ts#L85) |

### 3.9 焦点 9：中危遗留项

**结论：记录备查，不阻断**

- **localStorage 明文存储**：前端 Tauri GUI 代码（`frontend/src/`）可能使用 localStorage 存储 LLM 配置（API key 明文）。此为前端范畴，不在本次 server 端审计范围内。建议后续在前端代码审计中跟进。
- **fallback 机制**：未发现新的 fallback 逻辑引入安全降级。auto-xref 的 best-effort fallback（失败不阻断 ingest）是设计意图，非安全问题。

---

## 4. 修复建议

### 4.1 M-1：CI workflow 表达式注入反模式

**当前代码**（[kb-maintenance.yml:53,107-111](../../.github/workflows/kb-maintenance.yml#L53)）：

```yaml
TASK="${{ inputs.task }}"
# ...
echo "| 仓库 | ${{ github.repository }} |"
echo "| 分支 | ${{ github.ref_name }} |"
```

**建议修复**：改用 `env:` 块传递上下文变量：

```yaml
env:
  INPUT_TASK: ${{ inputs.task }}
  GH_EVENT_NAME: ${{ github.event_name }}
  GH_REPOSITORY: ${{ github.repository }}
  GH_REF_NAME: ${{ github.ref_name }}
  GH_SHA: ${{ github.sha }}
run: |
  TASK="$INPUT_TASK"
  echo "| 仓库 | $GH_REPOSITORY |"
  echo "| 分支 | $GH_REF_NAME |"
```

**风险说明**：当前所有 `${{ }}` 注入值均为 GitHub 控制值或固定枚举，实际不可利用。此修复是最佳实践对齐，不阻断合并。

### 4.2 M-2：`cited_pages` 路径格式校验

**当前代码**（[schemas.ts:161-166](../../server/src/schemas.ts#L161-L166)）：

```typescript
cited_pages: z
  .array(z.string().max(512))
  .min(2)
  .max(50)
```

**建议修复**：追加路径格式正则：

```typescript
cited_pages: z
  .array(
    z.string()
      .max(512)
      .regex(/^wiki\/[a-z0-9][a-z0-9-]*\/.+/, "cited_pages must be wiki/<domain>/<page> format")
  )
  .min(2)
  .max(50)
```

**风险说明**：`js-yaml dump()` 已对 YAML 特殊字符正确转义，不构成注入漏洞。此修复是纵深防御加固，不阻断合并。

### 4.3 L-2：`related` 字段 `.md` 后缀规范化

**建议修复**（[write.ts:458](../../server/src/tools/write.ts#L458)）：

```typescript
// 当前
related: cited_pages.slice(),

// 建议
related: cited_pages.map(p => p.replace(/\.md$/, "")),
```

### 4.4 L-1：tags 格式校验（可选）

**建议修复**（[schemas.ts:299](../../server/src/schemas.ts#L299)）：

```typescript
// 当前
tags: z.array(z.string().max(64)).max(20).optional(),

// 建议
tags: z.array(
  z.string().max(64).regex(/^[a-z0-9][a-z0-9-]*$/, "Tag must be kebab-case")
).max(20).optional(),
```

---

## 5. 保护机制验证

### 5.1 原子写保护（DEF-001）

| 工具 | 写入标志 | TOCTOU 保护 |
| --- | --- | --- |
| `kbWriteAnswer` | `"wx"` (create-only) | PASS — EEXIST/EPERM 友好提示 |
| `kbIngestSource` | `"wx"` | PASS |
| `kbWriteExperience` | `"wx"` | PASS |
| `kbOrganizeStaging` | `"w"` (overwrite) | 正确 — 更新操作需覆写，非 create |
| `applyXrefWithAbsPaths` | `"w"` (overwrite) | 正确 — 更新已存在页面 |

### 5.2 状态机约束

| 工具 | 前置状态校验 | 状态转换 |
| --- | --- | --- |
| `kbOrganizeStaging` | `status === "staging"` | staging → staging（仅更新元数据） |
| `kbWriteAnswer` | 无（新建文件） | → pending（inbox） |
| `kbConfirmStaging` | `status === "staging"` | staging → active |
| `kbRejectStaging` | `status === "staging"` | staging → rejected |
| `kbPromoteExperience` | `type === "experience" && status === "pending"` | pending → active/rejected |

- 所有状态转换均经过合法性检查，无绕过路径。
- `kbWriteAnswer` 不自动 promote（走 inbox 两 tier 门禁），符合 AGENTS.md §9.3。

### 5.3 日志脱敏（§19.3）

- 所有日志经 `sanitizeLogField` strip CR/LF（CWE-117 防护）。
- 无密钥、密码、令牌、完整 SQL 输出到日志。
- `source_query` 在日志中保留全文（最多 1000 字符），但已 strip 换行符。不含密钥（是用户查询语句）。

---

## 6. 豁免说明

无豁免项。所有发现均按标准流程处理。

---

## 7. 合并就绪裁定

### 最终裁定：**PASS**

| 门禁项 | 结果 |
| --- | --- |
| 阻断级漏洞 | 0 |
| 高危漏洞 | 0 |
| 路径穿越防护 | PASS — 所有新工具双层防御（Zod regex + 运行时 path.relative） |
| 注入防护 | PASS — 日志 CWE-117 + frontmatter YAML 转义 + 无代码注入 |
| 输入验证 | PASS（M-2 建议加固） |
| 幂等性 | PASS — auto-xref 三层去重检测 |
| 错误隔离 | PASS — 单页失败不中断批次 |
| 密钥安全 | PASS — 无硬编码凭据 |
| CI 安全 | PASS（M-1 建议加固） |
| DEF-008 格式 | PASS — 全部使用 `serializeFrontmatter` |
| 依赖安全 | PASS — 无新增依赖 |

**中危项（M-1、M-2）不阻断合并**，建议在后续迭代中修复以对齐最佳实践。如需在合并前修复，参考 §4 修复建议。

---

## 8. 自动化建议（CI/CD 集成）

### 8.1 Semgrep 规则补充

现有 `.github/workflows/security.yml` 已配置 Semgrep 扫描前端 XSS。建议追加 server 端规则：

```yaml
# 追加到 .github/workflows/security.yml 的 Semgrep custom rules
- id: ts-path-traversal-relative
  patterns:
    - pattern: path.relative($ROOT, $USER_PATH)
    - pattern-not-inside: |
        if ($REL.startsWith("..") || path.isAbsolute($REL)) {
          ...
        }
  message: "path.relative result must be checked for traversal (S-1/ADR-010)"
  languages: [typescript]
  severity: WARNING
  paths:
    include:
      - "server/src/**/*.ts"

- id: gh-actions-expression-injection
  patterns:
    - pattern: ${{ $EXPR }}
    - pattern-inside: |
        run: |
          ...
  message: "Avoid ${{ }} in shell scripts — use env: block (GitHub Security Lab)"
  languages: [yaml]
  severity: WARNING
  paths:
    include:
      - ".github/workflows/*.yml"
```

### 8.2 npm audit 定期执行

建议在 `kb-maintenance.yml` 的 `full-audit` task 中追加：

```yaml
- name: Run npm audit
  if: matrix.task == 'full-audit'
  working-directory: server
  run: npm audit --audit-level=moderate
```

当前依赖（`js-yaml@5.2.1`、`zod@4.4.3`、`@modelcontextprotocol/sdk@^1.0.0`）均为最新主版本，无已知未修复漏洞。

---

**审计报告结束。**
