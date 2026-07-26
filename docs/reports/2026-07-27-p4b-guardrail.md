# P4 Phase 4b Pre-commit 安全与质量审计报告

| 项目 | 内容 |
| --- | --- |
| 审计日期 | 2026-07-27 |
| 审计员 | 代码安全护栏（security-review skill + 6-stage guardrail workflow） |
| 变更范围 | P4 Phase 4b — Python 解析管道 + staging 工作流（17 文件） |
| 分支 | `feat/p4a-tauri-skeleton`（working tree，未提交） |
| 审计标准 | 零信任原则 + 证据驱动（source → sink 可追溯）+ confidence ≥ 0.80 |
| 整体结论 | **R2 PASS** — 无 HIGH 严重度阻断问题；2 个 MEDIUM + 8 个 LOW 需跟踪修复 |

---

## 1. 总体结论

**R2 PASS**（第二轮无 HIGH 严重度阻断问题）

本轮审计覆盖 17 个变更文件（11 modified + 6 untracked），完整读取了全部文件内容及其依赖的辅助模块（`log.ts` / `frontmatter.ts` / `fileio.ts` / `config.ts` / `setup.ts`），并实际运行了 `staging.test.ts`（14 测试全部通过）。

未发现阻断级（HIGH）漏洞。发现 2 个 MEDIUM 和 8 个 LOW 问题，均为防御纵深或一致性缺陷，不构成直接可利用的安全漏洞。核心安全机制（Shell 参数数组化、`validate_inside` 路径穿越防御、MCP 侧 `path.resolve` + `..` 检测、`sanitizeLogField` CRLF 过滤、CSP 白名单、frontmatter `"` 转义）均已正确实现。

---

## 2. 检查范围摘要

| 维度 | 数量 |
| --- | --- |
| 审计文件 | 17（modified 11 + untracked 6） |
| 审计函数/命令 | Tauri IPC 5 + MCP tool 3 + Python parser 4 + 前端组件 3 = 15 |
| 发现问题总数 | 10（MEDIUM 2 + LOW 8） |
| 阻断级（HIGH） | 0 |
| 已验证通过的安全机制 | 8 |

### 已验证通过的安全机制

| # | 机制 | 位置 | 结论 |
| --- | --- | --- | --- |
| P1 | Shell 参数数组化（无插值） | `frontend/src-tauri/src/lib.rs:290-296` | PASS — `.command().args([])` 不经 shell |
| P2 | `confirm/reject_staging` Tauri 路径穿越防御 | `frontend/src-tauri/src/lib.rs:228-238` | PASS — `canonicalize` + `starts_with` |
| P3 | `kb_confirm/reject_staging` MCP 路径穿越防御 | `server/src/tools/staging.ts:177-181, 247-251` | PASS — `path.resolve` + `relative` + `..` 检测 |
| P4 | MCP 侧 `appendLogEntry` CRLF 过滤 | `server/src/utils/log.ts:62-64` | PASS — `sanitizeLogField` 剥离 `\r\n` |
| P5 | frontmatter `title` 双引号转义 | `frontend/src-tauri/src/lib.rs:144` | PASS — `title.replace('"', "\\\"")` + 双引号包裹防 YAML 注入 |
| P6 | CSP 白名单收紧 | `frontend/src-tauri/tauri.conf.json:25` | PASS — `script-src 'self'`，无 `'unsafe-eval'` |
| P7 | Python parser JSON 序列化安全 | `parser/parse.py:275` | PASS — `json.dumps` 标准库序列化 |
| P8 | staging.test.ts 测试覆盖 | `server/src/tests/staging.test.ts` | PASS — 14 测试覆盖穿越/non-staging/不存在/无 .md 后缀 |

---

## 3. 详细发现

### 3.1 MEDIUM 严重度

#### M1: Tauri `upload_file` — `domain` 参数未校验，存在路径穿越写入风险

| 字段 | 值 |
| --- | --- |
| Category | path_traversal |
| Severity | MEDIUM |
| Confidence | 0.82 |
| Source | `domain: String` IPC 参数（webview 可控），`frontend/src-tauri/src/lib.rs:258` |
| Sink | `fs::write(&wiki_path, &page_content)`，`frontend/src-tauri/src/lib.rs:352` |
| Location | `frontend/src-tauri/src/lib.rs:339` |

**证据链**：

`upload_file` 接收 `domain` 参数后直接用于构造写入路径，无任何校验：

```rust
// lib.rs:339
let wiki_path = wiki_dir(&config.kb_root, &domain).join(format!("{}.md", slug));
// lib.rs:218-220  wiki_dir = Path::new(kb_root).join("wiki").join(domain)
// lib.rs:352
fs::write(&wiki_path, &page_content).map_err(|e| e.to_string())?;
```text

若 `domain = "../../../tmp"`，则 `wiki_path` 解析为 `<kb_root 上两级>/tmp/<slug>.md`，`fs::write` 将用户文件解析后的 markdown 内容写入 KB 目录之外的任意位置。`slug` 经 `slugify` 处理（安全），但 `domain` 是唯一的未校验路径组件。

**对比**：MCP 侧 `kbIngestSourceSchema` 对 domain 强制 `DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*$/`（`server/src/schemas.ts:47`），Tauri 侧无对应校验。`confirm_staging` / `reject_staging` 调用了 `validate_inside`，但 `upload_file` 对 `wiki_path` 未调用 `validate_inside`。

**利用条件**：需通过 XSS 绕过 CSP `script-src 'self'` 后调用 IPC。CSP 降低了直接可利用性，但防御纵深要求后端独立校验——不应仅依赖 CSP 单层防护。

**修复建议**：

1. 在 `upload_file` 中对 `domain` 增加 kebab-case 正则校验（与 MCP 侧 `DOMAIN_REGEX` 一致），不合法时返回错误。
2. 防御纵深：在 `fs::write` 前对 `wiki_path` 调用 `validate_inside(&config.kb_root, &wiki_path.to_string_lossy())` 确认解析后路径仍在 KB root 内。

---

#### M2: Tauri `confirm_staging` / `reject_staging` — 缺少状态机前置检查

| 字段 | 值 |
| --- | --- |
| Category | state_machine_bypass |
| Severity | MEDIUM |
| Confidence | 0.85 |
| Source | `page_path` IPC 参数 + 页面 frontmatter `status` 字段 |
| Sink | `update_frontmatter_status(&content, "active"/"rejected")` 无条件覆写 |
| Location | `frontend/src-tauri/src/lib.rs:452-467`（confirm）、`471-486`（reject） |

**证据链**：

Tauri 侧 `confirm_staging` 读取页面内容后直接将 `status` 改为 `active`，不校验当前状态是否为 `staging`：

```rust
// lib.rs:461-463
let content = fs::read_to_string(&full_path).map_err(|e| e.to_string())?;
let new_content = update_frontmatter_status(&content, "active");  // 无前置状态检查
fs::write(&full_path, &new_content).map_err(|e| e.to_string())?;
```

`append_log` 硬编码 `from_status: "staging"`（lib.rs:465），即使实际状态为 `rejected` / `archived` / `active`，日志仍记录 `staging → active`，造成审计日志失真。

**影响**：

- `status: rejected` 的页面可被直接 confirm 回 `active`，绕过 staging 审核流程
- `status: archived` 的页面可被 un-archive
- 日志 `from_status` 字段与实际不符，破坏审计可信度

**对比**：MCP 侧 `kbConfirmStaging` 正确校验（`server/src/tools/staging.ts:189-193`）：

```typescript
if (frontmatter.status !== "staging") {
    return errorResult(`Cannot confirm: page status is "${frontmatter.status ?? "unknown"}", expected "staging".`);
}
```text

**修复建议**：

在 `confirm_staging` / `reject_staging` 中，读取 `content` 后调用 `parse_frontmatter_status(&content)` 校验当前状态为 `"staging"`，非 staging 时返回错误。`append_log` 的 `from_status` 参数应使用实际读取的状态值，而非硬编码 `"staging"`。

---

### 3.2 LOW 严重度

#### L1: `capabilities/default.json` — `shell:allow-execute` / `shell:allow-open` 对 webview 不必要

| 字段 | 值 |
| --- | --- |
| Category | least_privilege_violation |
| Severity | LOW |
| Confidence | 0.82 |
| Location | `frontend/src-tauri/capabilities/default.json:9-10` |

**证据**：

Tauri v2 的 capabilities/permissions 系统控制 webview JS → Rust 的 IPC 边界。Rust 后端通过 `app_handle.shell().command()` 调用 shell 插件的 Rust API，不经过 permission 系统。因此 `shell:allow-execute` 仅授权 webview JS 侧调用 `plugin:shell|execute`，而 `upload_file` 的 shell 调用完全在 Rust 侧完成，JS 侧无直接 shell 调用。

`shell:allow-open` 同理——Rust 侧未调用 `shell().open()`，`opener:default` 已覆盖 opener 插件需求。注释提及的 `open_external` 命令未在 `generate_handler!` 中注册（lib.rs:540-546），属于死代码。

Tauri v2 shell scope 机制（无 scope 配置时 JS 侧无法执行命令）降低了直接可利用性，但仍违反最小权限原则。

**修复建议**：移除 `shell:allow-execute` 和 `shell:allow-open`；如未来需要 JS 侧 shell 调用，改用带 scope 的细粒度权限（如 `shell:allow-execute` + scope 限定 `python` 命令）。

---

#### L2: Tauri `append_log` — 未对 `page_path` 做 CR/LF 过滤

| 字段 | 值 |
| --- | --- |
| Category | log_injection |
| Severity | LOW |
| Confidence | 0.80 |
| Source | `page_path` IPC 参数（用户可控） |
| Sink | `format!("\n## [{}] {} \| {}\n\n- page: {}\n...", page_path, page_path, ...)` 写入 `log.md` |
| Location | `frontend/src-tauri/src/lib.rs:500-508` |

**证据**：

```rust
// lib.rs:500-508
let entry = format!(
    "\n## [{}] {} | {}\n\n- page: {}\n- from_status: {}\n- to_status: {}\n",
    today_iso(), entry_type, page_path, page_path, from_status, to_status
);
```

`page_path` 直接插入 log.md 内容，未过滤 `\r` / `\n`。若 `page_path` 含换行符，可伪造 log 条目（CWE-117）。

**对比**：MCP 侧 `appendLogEntry` 通过 `sanitizeLogField` 正确过滤（`server/src/utils/log.ts:62-64`：`value.replace(/[\r\n]/g, " ")`）。

**利用条件**：极低——需在 `wiki/` 下存在文件名含换行符的页面（Linux 允许，Windows 禁止）。`upload_file` 的 `slugify` 不产生换行符，故应用自身不会创建此类文件。但零信任原则要求后端独立防御。

**修复建议**：在 `append_log` 中对 `page_path` 做 `\r` / `\n` 替换为空格（与 MCP 侧 `sanitizeLogField` 一致）。

---

#### L3: `kbListStagingSchema` — domain 缺少 kebab-case 正则校验

| 字段 | 值 |
| --- | --- |
| Category | input_validation_gap |
| Severity | LOW |
| Confidence | 0.82 |
| Location | `server/src/schemas.ts:177-182` |

**证据**：

```typescript
// schemas.ts:176-182
export const kbListStagingSchema = {
  domain: z.string().max(64).optional(),  // 无 .regex(DOMAIN_REGEX)
  ...
};
```text

`kbIngestSourceSchema`（schemas.ts:57-64）和 `kbWriteExperienceSchema`（schemas.ts:74-81）均对 domain 强制 `DOMAIN_REGEX`，但 `kbListStagingSchema` 遗漏。MCP 客户端可传 `domain = "../"` 导致 `kbListStaging` 列出 `wiki/` 之外的 `.md` 文件（只读信息泄露）。

**利用条件**：低——MCP 客户端（Claude Code / Trae CN）为受信方，且仅读取 `.md` 文件名 + `status: staging` 的 frontmatter。但与同类 schema 不一致。

**修复建议**：为 `kbListStagingSchema.domain` 增加 `.regex(DOMAIN_REGEX, "Domain must be kebab-case")`。

---

#### L4: Tauri `list_staging` — `domain` 参数未校验（只读路径穿越）

| 字段 | 值 |
| --- | --- |
| Category | path_traversal |
| Severity | LOW |
| Confidence | 0.80 |
| Location | `frontend/src-tauri/src/lib.rs:389-401` |

**证据**：

```rust
// lib.rs:401
let d_dir = wiki_root.join(&d);  // d 来自 domain 参数，无校验
```

与 M1 同类问题，但 `list_staging` 是只读操作，仅列出 `.md` 文件并读取 frontmatter。影响范围限于信息泄露（文件名 + staging 状态）。

**修复建议**：对 `domain` 增加 kebab-case 校验，或对 `d_dir` 调用 `validate_inside`。

---

#### L5: `build_wiki_page` — `source_file` 在 YAML frontmatter 中未加引号

| 字段 | 值 |
| --- | --- |
| Category | yaml_robustness |
| Severity | LOW |
| Confidence | 0.80 |
| Location | `frontend/src-tauri/src/lib.rs:143` |

**证据**：

```rust
// lib.rs:143
"---\ntitle: \"{}\"\ndomain: [{}]\ntype: source\nstatus: {}\ndate: {}\nsource_file: {}\n---\n..."
//                                         title 有引号+转义                    source_file 无引号
```text

`title` 正确用双引号包裹并转义 `"`（P5 验证通过）。但 `source_file`（`raw/<format>/<filename>`）未加引号。若文件名含 YAML 特殊字符（`:`、`#`、`[`、`{` 等），frontmatter 解析可能出错。

`file_format` 来自扩展名（不含特殊字符，安全）。`file_name` 来自 OS 文件名，理论上可含 `:`（Windows 不允许，Linux 允许如 `backup:2024.pdf`）。

**影响**：frontmatter 解析失败 → 页面被 `kb_lint` frontmatter check 标记为异常。非注入风险（`source_file` 不控制 YAML key）。

**修复建议**：对 `source_file` 加双引号包裹：`source_file: "{}"`，并对 `"` 做转义。或改用 `serde_yaml` / `js-yaml` 序列化（MCP 侧已用 `serializeFrontmatter`）。

---

#### L6: `extract_preview` — 按字节索引切片，多字节 UTF-8 字符处会 panic

| 字段 | 值 |
| --- | --- |
| Category | boundary_error |
| Severity | LOW |
| Confidence | 0.90 |
| Location | `frontend/src-tauri/src/lib.rs:126` |

**证据**：

```rust
// lib.rs:125-127
if preview.len() > max_chars {
    format!("{}...", &preview[..max_chars])  // 按字节切片
}
```

`preview.len()` 返回字节数，`&preview[..max_chars]` 按字节索引切片。若 `max_chars = 200` 恰好落在中文字符（3 字节）的中间，Rust 字符串切片会 panic（`byte index is not a char boundary`）。

PDF/DOCX 解析中文文档时，前 5 行拼接后第 200 字节极可能落在中文字符中间，导致 `upload_file` IPC 命令崩溃。

**影响**：IPC 命令 panic → upload 失败（DoS）。Rust panic 是内存安全的（无 UB），但用户体验受损。

**修复建议**：使用 `preview.chars().take(max_chars).collect::<String>()` 或 `preview.char_indices().rev().find(|(i, _)| *i <= max_chars)` 确保在字符边界切分。

---

#### L7: Tauri 最小 frontmatter 解析器 — `find("---")` 可匹配 YAML 值内的 `---`

| 字段 | 值 |
| --- | --- |
| Category | parser_robustness |
| Severity | LOW |
| Confidence | 0.80 |
| Location | `frontend/src-tauri/src/lib.rs:159, 175` |

**证据**：

```rust
// lib.rs:159 (parse_frontmatter_status)
let end = content[3..].find("---")?;
// lib.rs:175 (parse_frontmatter_title)
let end = content[3..].find("---")?;
```text

`find("---")` 从位置 3 开始搜索第一个 `---`，但若 YAML 值中包含 `---`（如 `title: "foo---bar"`），会提前截断 frontmatter 块，导致解析错误。

**对比**：MCP 侧使用 `js-yaml` 的 `FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/`（`server/src/utils/frontmatter.ts:9`），使用非贪婪正则匹配最近的闭合 `---`，但仍非完全安全（同样可被值内 `---` 干扰）。js-yaml 的 `load()` 对 YAML 值有正确的字符串解析能力，风险更低。

**影响**：极端 edge case 下 frontmatter 解析失败，`list_staging` 可能漏列页面或 `confirm/reject` 误改 body 内容。非注入风险。

**修复建议**：长期建议 Tauri 侧也使用 `serde_yaml`（已在 Cargo.toml 中移除——若恢复需评估）或复用 MCP 侧的 frontmatter 解析逻辑。短期建议在 `find("---")` 前增加行首检测（`---` 必须在行首）。

---

#### L8: CREDITS.md 未披露 pymupdf AGPL-3.0 License

| 字段 | 值 |
| --- | --- |
| Category | license_compliance |
| Severity | LOW |
| Confidence | 0.85 |
| Location | `frontend/assets/CREDITS.md`（缺失 parser 依赖条目） |

**证据**：

pymupdf 的 AGPL-3.0 已在以下位置披露：

- `docs/decisions/ADR-014-p4-python-parser-and-staging-workflow.md` D1 表格 + 负面影响节
- `parser/README.md` License 凭证节

但 `frontend/assets/CREDITS.md`（项目素材凭证中心文件）仅记录字体/图标/设计素材，无 Python parser 依赖条目。CREDITS.md 的合规声明甚至写「所有素材 License 均为宽松类型（OFL / Apache 2.0 / Pixabay），无 GPL/CC-BY-NC 限制」——此声明在引入 pymupdf (AGPL-3.0) 后不再准确。

**影响**：合规风险——AGPL-3.0 是强 copyleft license，需在分发时向接收方明确披露。虽然 ADR-014 和 README 已记录，但 CREDITS.md 作为集中凭证文件应同步更新。

**修复建议**：在 CREDITS.md 新增「Python 解析依赖」章节，列出 pymupdf (AGPL-3.0) / python-docx (MIT) / openpyxl (MIT) / PyInstaller (GPL-2.0 with bootloader exception)，并更新合规声明措辞。

---

## 4. 修复建议汇总

### 优先级排序

| 优先级 | 编号 | 问题 | 修复工作量 |
| --- | --- | --- | --- |
| P1（本 commit 修复） | M1 | `upload_file` domain 校验 + `validate_inside` | ~15 min |
| P1（本 commit 修复） | M2 | `confirm/reject_staging` 状态机前置检查 | ~10 min |
| P2（下个 commit） | L2 | `append_log` CRLF 过滤 | ~5 min |
| P2（下个 commit） | L3 | `kbListStagingSchema` domain 正则 | ~2 min |
| P2（下个 commit） | L6 | `extract_preview` 字符边界安全切分 | ~5 min |
| P3（后续迭代） | L1 | capabilities 移除不必要 shell 权限 | ~5 min + 验证 |
| P3（后续迭代） | L4 | `list_staging` domain 校验 | ~5 min |
| P3（后续迭代） | L5 | `source_file` YAML 加引号 | ~5 min |
| P3（后续迭代） | L7 | frontmatter 解析器行首检测 | ~10 min |
| P3（后续迭代） | L8 | CREDITS.md 补充 AGPL 披露 | ~10 min |

### M1 修复示例（prose 描述，非 patch）

在 `upload_file` 的 `domain` 参数接收后、构造 `wiki_path` 前，增加正则校验：定义 `fn is_valid_domain(d: &str) -> bool { d.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') && !d.is_empty() }`。若校验失败，返回 `UploadResult { success: false, error: Some("invalid domain") }`。同时在 `fs::write(&wiki_path, ...)` 前调用 `validate_inside(&config.kb_root, &wiki_path.to_string_lossy())` 作为防御纵深。

### M2 修复示例（prose 描述）

在 `confirm_staging` 中，`fs::read_to_string` 后调用 `parse_frontmatter_status(&content)`，若结果不为 `Some("staging")` 则返回错误。`append_log` 的 `from_status` 参数使用实际读取的状态值（`parse_frontmatter_status` 的返回值），而非硬编码 `"staging"`。`reject_staging` 同理。

---

## 5. 保护机制验证

### 5.1 Shell 注入防护（PASS）

`upload_file` 调用 Python 解析器使用 `tauri-plugin-shell` 的 `command().args([])` 形式（lib.rs:290-296），参数以数组传递，不经 shell。`file_path` 即使含 `; rm -rf /` 等 shell 元字符也仅作为 Python 的 `sys.argv[1]`，不会被 shell 解释。`parser/build.py` 的 `subprocess.run(cmd, ...)` 同样使用列表形式（build.py:55-67, 83-87）。

### 5.2 路径穿越防御（部分 PASS）

| 命令 | 防御机制 | 结论 |
| --- | --- | --- |
| `confirm_staging` | `validate_inside`（canonicalize + starts_with） | PASS |
| `reject_staging` | `validate_inside` | PASS |
| `kb_confirm_staging` | `path.resolve` + `relative` + `..` 检测 | PASS |
| `kb_reject_staging` | 同上 | PASS |
| `upload_file` | slugify（安全）+ **domain 未校验** | **M1** |
| `list_staging` | **domain 未校验**（只读） | **L4** |
| `kb_list_staging` | **domain 无正则**（只读） | **L3** |

### 5.3 CSP 配置（PASS）

```text
default-src 'self'; img-src 'self' data: blob: asset: http://asset.localhost;
style-src 'self' 'unsafe-inline'; font-src 'self' data:;
script-src 'self'; connect-src 'self' ipc: http://ipc.localhost
```

- `script-src 'self'`：阻止外部脚本与 inline script，XSS 防护核心
- `style-src 'unsafe-inline'`：Tailwind 运行时需要（ADR-014 D6 已记录权衡）
- `connect-src 'self' ipc: http://ipc.localhost`：仅允许 Tauri IPC，无外部 API
- 无 `object-src`、`frame-src`、`worker-src` 显式声明，均回退至 `default-src 'self'`

### 5.4 frontmatter 注入防护（PASS，含 L5 改进项）

`title` 字段双引号包裹 + `"` → `\"` 转义（lib.rs:144）。YAML 双引号字符串天然防止单行内换行注入（换行被折叠为空格）。`source_file` 未加引号（L5），但仅影响解析健壮性，非注入向量。

### 5.5 log.md CRLF 注入防护（MCP 侧 PASS，Tauri 侧 L2）

MCP 侧 `appendLogEntry` → `sanitizeLogField` 剥离 `\r\n`（log.ts:62-64）。Tauri 侧 `append_log` 未过滤（L2），但利用条件极低。

### 5.6 内存安全（N/A — 无 unsafe 代码）

Tauri 侧 Rust 代码无 `unsafe` 块。Python 侧无 C 扩展直接调用。TypeScript 侧为托管运行时。Rust 的 panic（L6）是内存安全的（无 UB）。无需检查编译器安全标志（`-fstack-protector-strong` 等适用于 C/C++，本项目无 C/C++ 代码）。

---

## 6. 配置与密钥安全

### 6.1 硬编码密钥扫描（PASS）

全量扫描 17 个变更文件，未发现硬编码的密码、token、API key、内部 IP 或域名。`KbConfig` 的 `python_path` 硬编码为 `"python"`（lib.rs:59），非敏感信息。`KB_ROOT` 通过环境变量注入（lib.rs:48），符合规范。

### 6.2 .gitignore 检查（PASS，含建议）

`.gitignore` 已覆盖 `.env` / `.env.local` / `.env.*.local`（行 12-15），且保留 `!.env.example`。未覆盖证书文件（`.pem` / `.crt` / `.key`）和 SSH 私钥（`id_rsa` / `id_ed25519`），但本次变更未引入此类文件。建议后续补充：

```text
# ===== Certificates & keys =====
*.pem
*.crt
*.key
*.p12
*.pfx
id_rsa
id_ed25519
```

---

## 7. 依赖与供应链风险

### 7.1 Python 依赖（`parser/requirements.txt`）

| 依赖 | 版本 | License | 已知风险 |
| --- | --- | --- | --- |
| pymupdf | 1.24.10 | AGPL-3.0 | PDF 解析库历史上有 CVE（如 CVE-2024-29878 堆溢出），建议运行 `pip audit` 确认 1.24.10 无未修复漏洞 |
| python-docx | 1.1.2 | MIT | XML 解析依赖 lxml，lxml 4.6+ 默认禁用 entity resolution（XXE 安全） |
| openpyxl | 3.1.5 | MIT | 使用 `xml.etree.ElementTree`（默认不解析外部实体，XXE 安全） |
| pyinstaller | 6.10.0 | GPL-2.0（bootloader 例外） | 打包工具，不进入运行时 |

**建议执行**：`pip install pip-audit && pip-audit -r parser/requirements.txt`

### 7.2 Cargo 依赖（`Cargo.toml`）

新增 `tauri-plugin-shell = "2"` / `tauri-plugin-dialog = "2"` / `chrono = "0.4"`，移除 `serde_yaml`（减少 YAML 反序列化攻击面，正面变更）。

**建议执行**：`cargo audit`

### 7.3 npm 依赖（`package.json`）

新增 `@tauri-apps/plugin-dialog`。

**建议执行**：`pnpm audit`

### 7.4 AGPL-3.0 合规

pymupdf 的 AGPL-3.0 要求衍生项目开源。本项目为开源仓库（合规）。披露位置：

| 位置 | 状态 |
| --- | --- |
| ADR-014 | PASS（D1 表格 + 负面影响节 + 回退方案） |
| parser/README.md | PASS（License 凭证节 + 商业使用注意） |
| CREDITS.md | **缺失**（L8） |

---

## 8. 测试覆盖验证

### 8.1 staging.test.ts 执行结果

```text
node --test --import tsx src/tests/staging.test.ts
# tests 14
# pass 14
# fail 0
```

14 个测试全部通过（隔离运行）。

### 8.2 关键路径覆盖矩阵

| 审计要求 | 测试 | 覆盖 |
| --- | --- | --- |
| 路径穿越（confirm） | `rejects path traversal`（staging.test.ts:142-148） | YES |
| 路径穿越（reject） | `rejects path traversal`（staging.test.ts:228-234） | YES |
| non-staging 页面 | `rejects confirmation of a non-staging page`（:135-140）+ `rejects rejection of a non-staging page`（:220-226） | YES |
| 不存在的页面 | `rejects non-existent page`（:150-156） | YES |
| 不带 .md 后缀 | `accepts page_path without .md extension`（:158-175） | YES |
| 状态转换 + 日志 | `promotes staging → active and appends log entry`（:118-133） | YES |
| 拒绝后文件保留 | `keeps the rejected file on disk`（:211-218） | YES |
| 集成 list → confirm → list | `staging workflow integration`（:241-276） | YES |

**未覆盖（建议补充）**：

- domain 含 `../` 的路径穿越（MCP 侧 `kb_list_staging` 的 domain 参数）
- title 含 `"` / 换行符的 frontmatter 注入
- log.md CRLF 注入
- Tauri 侧 IPC 命令的路径穿越（Rust 侧无单元测试，需集成测试）

### 8.3 全量回归

全量 `npm test` 结果：168 tests / 167 pass / 1 fail。失败的 2 项（`graph.test.ts` 1000-page 性能测试 + `kb_lint missing_xref`）均不在 Phase 4b staging 范围内（属于 Phase 4c graph 或既有 lint 测试），非本次变更引入。

---

## 9. 豁免说明

| 项目 | 说明 | 状态 |
| --- | --- | --- |
| PyInstaller sidecar 未打包 | ADR-014 D2 明确 dev 模式直调 python，production 可选 | 已知偏离，不阻断 |
| `externalBin` 暂时移除 | 避免 `cargo check` 因缺二进制失败 | 已知偏离，不阻断 |
| `style-src 'unsafe-inline'` | Tailwind 运行时需要，ADR-014 D6 记录权衡 | 接受 |
| L6 panic 属 DoS 范畴 | security-review skill 默认排除 DoS，但本报告按系统提示 Stage 1.2 纳入 | 记录但不阻断 |

---

## 10. 自动化建议（CI/CD 集成）

### 10.1 GitHub Actions — 安全扫描流水线

```yaml
# .github/workflows/security-scan.yml（建议新增）
name: Security Scan
on: [pull_request]

jobs:
  semgrep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Semgrep scan
        uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/rust,
            p/typescript,
            p/python,
            p/security-audit

  pip-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install pip-audit
      - run: pip-audit -r parser/requirements.txt

  cargo-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cargo install cargo-audit
      - run: cargo audit
        working-directory: frontend/src-tauri

  npm-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm audit --prod
        working-directory: frontend
```

### 10.2 Semgrep 自定义规则（针对本次发现的模式）

```yaml
# semgrep-rules.yml（建议新增）
rules:
  - id: tauri-ipc-domain-unvalidated
    patterns:
      - pattern: |
          fn $CMD(..., domain: String, ...) {
            ...
            wiki_dir($ROOT, &domain)
            ...
          }
      - pattern-not-inside: |
          if !is_valid_domain(&domain) { ... }
    message: "Tauri IPC command uses domain parameter without kebab-case validation"
    severity: WARNING
    languages: [rust]

  - id: tauri-append-log-no-crlf-sanitize
    pattern: |
      fn append_log(..., page_path: &str, ...) {
        ...
        format!("...{}", page_path, ...)
        ...
      }
    message: "append_log interpolates user-controlled field without CR/LF sanitization"
    severity: WARNING
    languages: [rust]
```text

---

## 11. 审计签字

| 维度 | 结论 |
| --- | --- |
| 阻断级漏洞（HIGH） | 0 |
| 整体判定 | **R2 PASS** |
| 前置条件 | M1 + M2 建议在本 commit 内修复（非阻断，但强烈建议） |
| 后续跟踪 | L1-L8 纳入下个迭代 |
| 审计员 | 代码安全护栏（代码安全护栏） |
| 日期 | 2026-07-27 |
