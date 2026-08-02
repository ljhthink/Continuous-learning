# 安全与质量审计报告 · P5-R2（P5 验收二轮修复）

## 元信息

| 项目 | 内容 |
| --- | --- |
| 执行 Agent | guardrail-enforcer |
| 任务令牌 | TKN-P5-R2-GUARDRAIL-001 |
| 任务域 | P5-R2（P5 验收二轮修复：删除功能扩展 + 模型名自定义 + LLM 整理完整内容 + 缓存优化 + 注释清理） |
| 报告日期 | 2026-08-01 |
| 审查范围 | 14 个源码文件（Rust 后端 lib.rs + 7 个 TS/TSX 前端组件/库 + 1 个测试文件 + package.json + Cargo.toml + README.md + log.md） |
| 风险等级 | P2 跨模块（涉及 IPC 契约扩展 + 缓存策略 + 删除功能含 raw 文件删除） |
| 主 Agent 签发上下文 | 盲区：delete_page 的 source_file 可被用户篡改的路径穿越风险；handleDelete 状态一致性；handleOrganize 降级提示缺失。遗憾：上轮未强制 ac-verifier 做 Playwright 运行时验证导致 8 问题漏到用户验收。 |

## 1. 审查依据

- 本次代码变更：工作区 `git diff HEAD`（14 个代码文件 + 文档），未提交
- 影响自检结果：主 Agent 第九节自检（无接口签名变更、无新依赖、无 BREAKING CHANGE）
- 相关 ADR：ADR-013（P4 LLM 集成策略：三态切换 + keyring）、ADR-014（P4 Python parser 与 staging 工作流）
- code-archaeologist 报告：[2026-08-01-p5-r2-archaeology.md](2026-08-01-p5-r2-archaeology.md)（9 问题根因分析）
- 方案设计：[2026-08-01-p5-r2-solution-design.md](2026-08-01-p5-r2-solution-design.md)
- 子 Agent 反思：[2026-08-01-p5-r2-subagent-reflection.md](2026-08-01-p5-r2-subagent-reflection.md)
- 测试框架与基础用例：vitest 144 用例全过、tsc --noEmit 无错误、cargo build exit 0（Playwright E2E 尚未执行，将在 ac-verifier 阶段补齐）
- 安全策略文件：CLAUDE.md §18（依赖管理）、§19（可观测性与错误处理）、§20（密钥与环境变量管理）、`.gitignore`
- 历史漏洞记录：DEF-001 TOCTOU race（commit e6e2d3b，已修复）、DEF-007 log type 修正、DEF-008 frontmatter 格式统一

## 2. 代码质量审查

### 2.1 Karpathy Guidelines 合规性

| 项 | 结论 | 说明 |
| --- | --- | --- |
| 命名 | ✅ 通过 | `parse_frontmatter_source_file`、`pageContentEqual`、`normalizeCacheKey`、`cardsEqual`、`effective_base`/`effective_model` 命名清晰自解释，意图明确 |
| 设计简洁性 | ✅ 通过 | customModelName 完全复刻 customBaseUrl 已验证的模式（store → IPC → Rust），无重复发明；缓存优化用纯函数 `pageContentEqual`/`cardsEqual` 抽取比较逻辑，可测试 |
| 错误处理 | ⚠️ 基本通过 | handleOrganize 降级到 preview 时仅 `console.warn`，用户无感知（见 L-1）；loadApiKey 错误日志已细化（区分 NoEntry 与真实错误），本轮修复到位 |
| 假设显式化 | ✅ 通过 | 注释清晰标注每个修复对应考古报告问题编号（P5-R2 问题 X），安全假设在 delete_page doc comment 中显式声明 |

### 2.2 逻辑与性能

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| handleOrganize 完整内容获取 | ✅ 已修复 | [FileList.tsx:L182-L193](../../frontend/src/components/FileList.tsx#L182-L193) 调用 `kb_get_page` 获取完整 body，不再用 200 字符 preview |
| 缓存重渲染优化 | ✅ 已修复 | [MarkdownPreview.tsx:L100-L104](../../frontend/src/components/MarkdownPreview.tsx#L100-L104) `pageContentEqual` 比较后条件 setPage；[ExperienceInbox.tsx:L64-L70](../../frontend/src/components/ExperienceInbox.tsx#L64-L70) `cardsEqual` 同理 |
| 缓存 key 统一 | ✅ 已修复 | `normalizeCacheKey` 去除 `.md` 后缀，解决路径形式不一致导致缓存未命中 |
| mock 闪烁消除 | ✅ 已修复 | `useState` 初始值从缓存读取（MarkdownPreview L67、ExperienceInbox L40） |
| 测试失败也保存 key | ✅ 已修复 | [SettingsPanel.tsx:L90-L105](../../frontend/src/components/SettingsPanel.tsx#L90-L105) 无论 `result.ok` 均调用 `saveApiKey` |
| customModelName 透传链路 | ✅ 完整 | store → SettingsPanel UI → LlmCallParams → callLlm → IPC model 参数 → Rust effective_model → 请求体。全链路无断点 |
| delete_page raw 文件删除 | ⚠️ 安全可控 | 路径穿越防护完备（见 §3.2），TOCTOU 窗口存在但桌面应用威胁模型下可接受（见 L-4） |

### 2.3 跨模块影响识别

| 影响面 | 结论 | 说明 |
| --- | --- | --- |
| IPC 契约 | ✅ 无破坏 | `delete_page` 的 `delete_raw` 参数和 `call_llm_api` 的 `model` 参数在前一轮已扩展，本轮未改签名；`deletePage` IPC 封装新增但复用已有命令 |
| 依赖模块 | ✅ 无破坏 | MarkdownPreview import `deletePage`（已在 ipc.ts 导出）；`setView`（已在 viewStore 导出） |
| 缓存模块级变量 | ⚠️ 需关注 | `pageCache`（MarkdownPreview）和 `inboxCache`（ExperienceInbox）为模块级 Map/变量，跨组件实例保留。promote/reject/delete 后已正确清除（inboxCache=null / pageCache.delete），但应用生命周期内无上限，长期使用可能内存增长。建议未来加 LRU 上限（低优先级） |
| 注释清理 | ✅ 验证完整 | `rg "三厂商" frontend/src frontend/src-tauri/src` 返回 0 匹配，所有源码中"三厂商"引用已清除 |

### 2.4 测试框架充分性

| 检查项 | 结论 | 说明 |
| --- | --- | --- |
| vitest 单元测试 | ✅ 144 用例全过 | llm.test.ts 新增 AC-5 用例验证 customBaseUrl 透传；测试描述更新（"三厂商"→"所有 provider"） |
| customModelName 透传测试 | ⚠️ 缺失 | llm.test.ts 验证了 `baseUrl: ""` 透传，但**未验证 `model` 字段透传**。建议补充 `customModelName` 透传断言 |
| delete_page 测试 | ❌ 缺失 | delete_page IPC（含 raw 文件删除、路径穿越防护）无任何单元测试或集成测试覆盖。鉴于 Rust 端 IPC 测试需 Tauri 运行时，建议在 ac-verifier 阶段用 Playwright + TRAE-debugger 补齐 |
| 缓存优化测试 | ❌ 缺失 | `pageContentEqual`/`cardsEqual`/`normalizeCacheKey` 为纯函数，可单测但未覆盖 |
| tsc --noEmit | ✅ 无错误 | TypeScript 类型检查通过 |
| cargo build | ✅ exit 0 | Rust 编译通过 |

## 3. 安全漏洞扫描

### 3.1 OWASP Top 10 / CWE 扫描结果

| OWASP 类别 | CWE | 结论 | 证据 |
| --- | --- | --- | --- |
| A01 权限失控 | CWE-862 | ✅ 无风险 | delete_page 路径限制在 wiki/ 下 + .md 扩展名；raw 删除限制在 raw/ 下。无权限绕过路径 |
| A02 加密失败 | CWE-319 | ⚠️ 中风险 | customBaseUrl 无 HTTPS scheme 校验，API Key 可能经明文 HTTP 传输（见 M-1） |
| A03 注入 | CWE-78/89/94 | ✅ 无风险 | 无 SQL、无 shell 执行、无 eval；日志注入已防护（sanitize_log_field，CWE-117） |
| A04 不安全设计 | CWE-209 | ✅ 低风险 | LLM API 错误消息含 500 字符响应片段，但仅本地显示，帮助诊断（见 L-7） |
| A05 安全配置 | CWE-16 | ✅ 无风险 | .gitignore 正确排除 .env/*.log；无硬编码密钥 |
| A06 易受攻击的组件 | CWE-1035 | ✅ 无风险 | 本轮无新依赖引入（package.json 仅加 scripts，Cargo.toml 无内容变更） |
| A07 认证失败 | N/A | ✅ N/A | 本地桌面应用，无用户认证 |
| A08 完整性失败 | CWE-345 | ⚠️ 低风险 | delete_page raw 文件删除存在 TOCTOU 窗口（见 L-4），但 remove_file 不跟随符号链接，桌面应用威胁模型下可接受 |
| A09 日志监控 | CWE-778 | ✅ 通过 | delete_page 追加审计日志（log.md），含 deleted_path + deleted_raw + reason |
| A10 SSRF | CWE-918 | ⚠️ 中风险 | customBaseUrl 允许任意 URL，可向内部端点发请求（见 M-1） |

### 3.2 输入与边界审计（Stage 1）

#### 1.1 数值与类型边界

| 输入参数 | 来源 | 校验 | 结论 |
| --- | --- | --- | --- |
| `delete_page.page_path` | 前端 IPC | `validate_inside(kb_root, page_path)` canonicalize + starts_with | ✅ 路径穿越防护完备 |
| `delete_page.delete_raw` | 前端 IPC | `Option<bool>`，`unwrap_or(false)` 默认不删 raw | ✅ 类型安全 |
| `source_file`（frontmatter） | 用户可编辑的 markdown | `parse_frontmatter_source_file` 提取 → `Path::join` → parent canonicalize + starts_with(raw_root) | ✅ 防护完备（见下方详细分析） |
| `call_llm_api.model` | 前端 IPC（localStorage） | `filter(!empty).unwrap_or(config.model)` | ✅ 空值降级到默认 |
| `call_llm_api.base_url` | 前端 IPC（localStorage） | `filter(!empty).unwrap_or(config.base_url)` | ⚠️ 无 scheme 校验（见 M-1） |
| `call_llm_api.api_key` | 前端 IPC（keyring） | 仅用于 Authorization header，不持久化到日志 | ✅ 安全 |
| `call_llm_api.prompt` | 前端（wiki 页面 body） | 作为 JSON body 的 content 字段发送 | ✅ JSON 序列化，无注入风险 |

**source_file 路径穿越防护详细分析**（审查重点 1）：

```
source_file（用户可篡改） → Path::join(kb_root, source_file)
  → parent.canonicalize()（解析符号链接）
  → join(file_name)
  → starts_with(raw_root.canonicalize())？
  → exists()？
  → remove_file()
```

| 攻击向量 | 防护结果 |
| --- | --- |
| `source_file: ../../../etc/passwd` | `parent` canonicalize 为 `/etc`，`/etc/passwd` 不 starts_with `kb_root/raw/` → **阻断** ✅ |
| `source_file: /etc/passwd`（绝对路径） | Rust `Path::join` 遇绝对路径替换 base → `parent` 为 `/etc` → 同上 **阻断** ✅ |
| `source_file: raw/../../../etc/passwd` | canonicalize 解析 `..` → `/etc/passwd` → 不 starts_with raw_root → **阻断** ✅ |
| `source_file` 含符号链接指向 raw/ 外 | `parent.canonicalize()` 解析符号链接 → 实际路径不在 raw/ 下 → **阻断** ✅ |
| `source_file` 本身为符号链接 | `remove_file` 不跟随符号链接，仅删除链接本身 → **安全** ✅ |

**结论**：source_file 路径穿越防护完备，所有攻击向量均被 `starts_with(raw_root)` 检查阻断。

#### 1.2 集合与缓冲区边界

- Rust 端全部使用安全 API（`fs::read_to_string`、`fs::remove_file`、`serde_json`），无 `unsafe` 块，无原始指针，无 `strcpy`/`sprintf`。
- 错误响应截断使用 `text.chars().take(500).collect()`（lib.rs L1034），按字符边界截断，UTF-8 安全。
- 前端无 `dangerouslySetInnerHTML`，React JSX 自动转义。

#### 1.3 业务状态机约束

- `delete_page` 不区分页面状态（staging/active/archived），可删除任意 wiki/ 下 .md 文件。这是设计意图（函数注释明确"Works for both staging and active pages"），无状态机绕过问题。
- 删除后追加审计日志，可追溯。

### 3.3 执行安全审计（Stage 2：指令与数据隔离）

#### 2.1 注入防护

| 注入类型 | 结论 | 证据 |
| --- | --- | --- |
| SQL/NoSQL 注入 | ✅ N/A | 项目无数据库查询 |
| OS 命令注入 | ✅ 无风险 | delete_page 不 spawn 进程；upload_file 用 tauri-plugin-shell 固定参数列表（已审计）；call_llm_api 用 reqwest 结构化 JSON |
| 代码/表达式注入 | ✅ 无风险 | 无 eval()、无 Function()、无动态脚本加载 |
| 模板引擎注入 | ✅ N/A | 无模板引擎 |
| 日志注入 | ✅ 已防护 | `sanitize_log_field` 剥离 CR/LF（CWE-117），delete_page 的 title/page_path/deleted_raw 均经净化 |

#### 2.2 最小权限检查

| 检查项 | 结论 | 说明 |
| --- | --- | --- |
| 数据库账户 | N/A | 无数据库 |
| OS 服务账户 | ✅ | Tauri 桌面应用以当前用户权限运行，非 root/admin |
| 容器化特权 | N/A | 非容器部署 |
| 不必要权限 | ✅ | delete_page 仅操作 wiki/ 和 raw/ 目录，无 /etc/passwd 等系统文件访问 |

#### 2.3 输出编码与特殊字符处理

| 输出上下文 | 结论 | 证据 |
| --- | --- | --- |
| HTML | ✅ | React JSX 自动转义，无 dangerouslySetInnerHTML |
| JavaScript | ✅ | 无动态 JS 拼接 |
| URL | ✅ | base_url 直接传给 reqwest，不经 URL 拼接用户输入（路径部分固定 `/chat/completions`） |
| JSON | ✅ | 使用 `serde_json::json!` 宏构造请求体，标准库序列化 |
| 日志 | ✅ | `sanitize_log_field` 剥离 CR/LF |

### 3.4 密钥与配置安全（Stage 4）

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| 硬编码密钥 | ✅ 无 | rg 扫描源码无 API Key/密码/Token；PROVIDERS 仅含 base_url 和 model 名（非敏感） |
| API Key 存储 | ✅ 正确 | 经 keyring crate 存操作系统密钥环（Windows Credential Manager / macOS Keychain / Linux Secret Service），不进 localStorage |
| API Key 传输 | ✅ 正确 | 经 Tauri IPC（本地）传到 Rust 端，仅在 reqwest Authorization header 中使用，不持久化到日志 |
| API Key 日志泄露 | ✅ 无 | call_llm_api 错误处理仅记录状态码和响应片段，不记录 api_key（lib.rs L1031 注释明确） |
| customBaseUrl 存储 | ✅ 可接受 | localStorage 存储用户偏好（URL 非敏感），注释标注"非敏感" |
| .gitignore | ✅ 正确 | 排除 `.env`、`.env.local`、`.env.*.local`、`*.log`、`logs/`、`node_modules/`、`target/` |
| 前端无服务端密钥 | ✅ | 前端代码无服务端 API Key/数据库密码 |

### 3.5 依赖与供应链风险（Stage 5）

| 检查项 | 结论 | 说明 |
| --- | --- | --- |
| package.json 新依赖 | ✅ 无 | 仅新增 `"test": "vitest run"` 和 `"test:watch": "vitest"` 脚本，无新 npm 包 |
| Cargo.toml 新依赖 | ✅ 无 | git diff 无内容变更（仅 CRLF 行尾归一化），无新 crate |
| 已知漏洞依赖 | ✅ 未引入 | 本轮无新依赖，无需 `npm audit` / `cargo audit` |
| 锁文件 | ✅ | Cargo.lock 已存在（Rust 项目）；pnpm-lock.yaml 已存在（前端项目） |

### 3.6 内存安全与运行时保护（Stage 3）

| 检查项 | 结论 | 说明 |
| --- | --- | --- |
| unsafe 代码块 | ✅ 无 | lib.rs 全部为 safe Rust，无 `unsafe` 块 |
| 原始指针/FFI | ✅ 无 | 无原始指针解引用，无 FFI 边界 |
| 编译器安全标志 | ⚠️ 缺失 | Cargo.toml 无 `[profile.release]` 配置（无 `panic=abort`、无 `overflow-checks=true`、无 `strip=true`）。此为既有状态，非本轮引入（见 L-3） |
| 栈保护/ASLR | ✅ | Rust 默认启用 stack overflow protection；Tauri 构建链默认启用 PIE |

## 4. 综合结论

- [x] **通过（附强化建议）**：可进入测试阶段。无阻断级漏洞，无高危漏洞。1 项中风险（customBaseUrl 缺 HTTPS 校验，既有问题非本轮引入）和若干低风险建议项，不阻断当前开发周期。
- [ ] **有条件通过**：需修复 N 项后重新提交
- [ ] **阻断**：存在严重质量缺陷或高危安全漏洞

**结论依据**：

1. **无阻断级漏洞**：无 SQL/命令/代码注入，无硬编码密钥，路径穿越防护完备（source_file 所有攻击向量均被阻断），日志注入已防护。
2. **密钥管理正确**：API Key 经 keyring 存操作系统密钥环，不进 localStorage，不进日志。
3. **核心修复到位**：handleOrganize 完整内容获取、缓存重渲染优化、customModelName 透传链路、测试失败也保存 key、注释清理——均正确实现。
4. **中风险项为既有问题**：customBaseUrl HTTPS 校验缺失（M-1）在 P5 UX-2 上轮引入，本轮未恶化。建议作为强化项在后续修复。
5. **测试缺口需 ac-verifier 补齐**：delete_page、缓存优化、customModelName 透传缺自动化测试，但主 Agent 已规划在 ac-verifier 阶段用 Playwright + TRAE-debugger 补齐运行时验证。

## 5. 发现项详情与修复建议

### M-1（中风险）：customBaseUrl 缺少 HTTPS scheme 校验 — SSRF / API Key 泄露风险

- **位置**：[lib.rs:L988-L995](../../frontend/src-tauri/src/lib.rs#L988-L995)、[llm.ts:L165-L166](../../frontend/src/lib/llm.ts#L165-L166)、[llmStore.ts:L22](../../frontend/src/store/llmStore.ts#L22)
- **描述**：`customBaseUrl` 存储在 localStorage，经 IPC 传到 `call_llm_api`，无 URL scheme 校验。若 localStorage 被篡改（共享电脑、XSS 绕过 CSP），API Key 和 wiki 内容可被发送到任意 HTTP 端点（含内网地址），构成 SSRF + 凭证泄露。
- **既有状态**：此问题在 P5 UX-2（上轮）引入，本轮未恶化。桌面应用威胁模型下（用户自行配置、Tauri CSP 防 XSS）可利用性有限。
- **修复建议**：

```rust
// lib.rs call_llm_api 中，计算 effective_base 后添加：
let effective_base = base_url
    .filter(|u| !u.trim().is_empty())
    .unwrap_or_else(|| config.base_url.to_string());
// P5-R2 guardrail M-1: 强制 HTTPS（允许 localhost/127.0.0.1 明文用于本地测试）
if !effective_base.starts_with("https://")
    && !effective_base.starts_with("http://localhost")
    && !effective_base.starts_with("http://127.0.0.1")
{
    return Err("API 地址必须使用 HTTPS（本地测试可用 http://localhost）".to_string());
}
```

### L-1（低风险）：handleOrganize 降级到 preview 时无用户可见提示

- **位置**：[FileList.tsx:L186-L188](../../frontend/src/components/FileList.tsx#L186-L188)
- **描述**：`kb_get_page` 失败或返回空 body 时，`fullContent` 降级为 200 字符 preview，仅 `console.warn`。用户不知道 LLM 收到的是不完整内容，可能误以为整理结果质量差是 LLM 能力问题。
- **修复建议**：降级时设置 `setOrganizeError` 或在模态框中标注"内容不完整（仅前 200 字符）"。

### L-2（低风险）：pageContentEqual 未比较 frontmatter 变化

- **位置**：[MarkdownPreview.tsx:L48-L50](../../frontend/src/components/MarkdownPreview.tsx#L48-L50)
- **描述**：`pageContentEqual` 仅比较 `body`/`title`/`path`。若 frontmatter 的 `status`/`tags`/`date` 变化但 body 不变，`setPage` 被跳过，frontmatter 卡片显示陈旧数据。
- **修复建议**：将 `status` 纳入比较（frontmatter 中最常变化的字段）：

```typescript
function pageContentEqual(a: PageDetail, b: PageDetail): boolean {
  return a.body === b.body && a.title === b.title
    && a.path === b.path && a.status === b.status;
}
```

### L-3（低风险）：Cargo.toml 缺少 [profile.release] 安全强化配置

- **位置**：[Cargo.toml](../../frontend/src-tauri/Cargo.toml)（既有状态，非本轮引入）
- **描述**：无 `[profile.release]` 配置，未显式启用 `overflow-checks`、`strip`、`panic = "abort"`。
- **修复建议**（低优先级，后续迭代）：

```toml
[profile.release]
overflow-checks = true   # 整数溢出检查（防御性）
strip = true             # 去除调试符号（减小体积 + 增加逆向难度）
panic = "abort"          # panic 时直接终止（防止 panic 后继续执行）
```

### L-4（低风险）：delete_page raw 文件删除的 TOCTOU 窗口

- **位置**：[lib.rs:L706-L712](../../frontend/src-tauri/src/lib.rs#L706-L712)
- **描述**：`canonicalize()` 检查与 `remove_file()` 非原子操作。理论上检查后删除前文件系统可被替换。
- **缓解因素**：① `fs::remove_file` 不跟随符号链接（仅删除链接本身）；② `raw_resolved` 从 canonical 父目录 + 文件名构造，路径已固定；③ 桌面应用单用户模型，攻击者与受害者同一主体。
- **结论**：桌面应用威胁模型下可接受，无需修复。若未来转为多用户服务端则需重新评估。

### L-5（低风险）：parse_frontmatter_source_file 简单解析器可能被混淆

- **位置**：[lib.rs:L194-L207](../../frontend/src-tauri/src/lib.rs#L194-L207)
- **描述**：逐行匹配 `source_file:` 前缀的简单解析器，不处理 YAML 块标量（`|`/`>`）或嵌套结构。理论上可在 frontmatter 其他字段的块标量值中注入 `source_file:` 行。
- **缓解因素**：提取的值仍经 `starts_with(raw_root)` 路径穿越检查，即使解析被混淆也无法删除 raw/ 外文件。
- **结论**：defense-in-depth 覆盖此风险，可接受。

### L-6（低风险）：MarkdownPreview handleDelete 删除中无全局导航锁

- **位置**：[MarkdownPreview.tsx:L74-L95](../../frontend/src/components/MarkdownPreview.tsx#L74-L95)
- **描述**：删除按钮 `disabled={deleting}` 防止重复点击，但用户可在删除期间通过图谱视图点击其他页面导航。删除完成后 `setView("upload")` 会覆盖用户的新导航。
- **影响**：纯 UX 问题，非安全问题。useCallback 闭包捕获的 `currentPagePath` 确保删除目标正确。
- **结论**：可接受，建议未来加全局 loading overlay 防止导航竞争。

### L-7（低风险）：call_llm_api 错误响应包含外部 API 返回内容

- **位置**：[lib.rs:L1029-L1035](../../frontend/src-tauri/src/lib.rs#L1029-L1035)
- **描述**：LLM API 错误时，响应正文（最多 500 字符）包含在错误消息中返回前端。
- **缓解因素**：① 仅本地显示（不经网络外传）；② 响应来自外部 LLM API（非内部系统）；③ 截断按字符边界（UTF-8 安全）；④ 帮助用户诊断模型名/Key 错误。
- **结论**：可接受。

## 6. 保护机制验证

| 保护机制 | 声称启用 | 实际验证 | 结论 |
| --- | --- | --- | --- |
| 路径穿越防护（validate_inside） | 是 | lib.rs L252-262 canonicalize + starts_with | ✅ 有效 |
| wiki/ 目录限制 | 是 | lib.rs L677-683 canonicalize wiki_root + starts_with | ✅ 有效 |
| raw/ 目录限制 | 是 | lib.rs L702-711 canonicalize raw_root + starts_with | ✅ 有效 |
| .md 扩展名限制 | 是 | lib.rs L673 `extension() == "md"` | ✅ 有效 |
| 日志注入防护 | 是 | lib.rs L281-283 sanitize_log_field 剥离 CR/LF | ✅ 有效 |
| API Key keyring 持久化 | 是 | lib.rs L1057-1063 keyring::Entry::set_password | ✅ 有效 |
| API Key 不入日志 | 是 | lib.rs L1031 注释 + 代码仅记录 status + truncated text | ✅ 有效 |
| reqwest rustls-tls | 是 | Cargo.toml L25 `features = ["json", "rustls-tls"]` | ✅ 有效 |
| Tauri CSP | 是 | lib.rs L17 注释引用 tauri.conf.json + capabilities/ | ✅ 声明有效（未在本轮变更范围内验证配置文件） |

## 7. 待澄清

| 编号 | 待澄清项 | 状态 |
| --- | --- | --- |
| Q-1 | customBaseUrl HTTPS 校验（M-1）是否在本轮修复或标记为已知接受？ | 主 Agent 需确认：是作为技术债务记录后续修复，还是本轮立即修复 |
| Q-2 | delete_page 和缓存优化的运行时验证（Playwright + TRAE-debugger）尚未执行 | 主 Agent 已规划在 ac-verifier 阶段补齐，guardrail 阶段不阻断 |
| Q-3 | customModelName 透传缺单元测试（§2.4） | 建议主 Agent 在进入 ac-verifier 前补充 `model` 字段透传断言 |

## 8. 豁免声明

| 豁免项 | 理由 | 状态 |
| --- | --- | --- |
| raw/ 文件删除打破 AGENTS.md §9.3 不可变原则 | 用户授权例外（前端二次确认 + delete_raw=true 显式参数），审计日志记录 deleted_raw | ✅ 记录，不阻断 |

## 9. 自动化建议（CI/CD 集成）

建议将以下检查集成到 CI pipeline，防止回归：

```yaml
# .github/workflows/security.yml（示例片段）
- name: Rust 安全检查
  run: |
    cd frontend/src-tauri
    cargo clippy -- -W clippy::all -D warnings
    cargo audit  # 依赖漏洞扫描（需安装 cargo-audit）

- name: 前端安全扫描
  run: |
    cd frontend
    pnpm audit --prod
    npx eslint src/ --ext .ts,.tsx --max-warnings 0

- name: Semgrep 自定义规则（路径穿越 + 密钥泄露）
  run: |
    npx semgrep --config p/rust --config p/typescript \
      --exclude-rule eslint-equivalent frontend/src frontend/src-tauri/src
```

建议补充的 Semgrep 自定义规则（针对 delete_page source_file 模式）：

```yaml
rules:
  - id: tauri-delete-page-source-file-validation
    patterns:
      - pattern: parse_frontmatter_source_file(...)
      - pattern-not-inside: |
          if raw_resolved.starts_with(&raw_root) {
            ...
          }
    message: "source_file 提取后必须经 starts_with(raw_root) 校验"
    languages: [rust]
    severity: ERROR
```

---

**审计员声明**：本报告基于对 14 个变更文件的逐行静态审查，遵循零信任原则，所有发现均引用具体文件路径与行号。未发现阻断级漏洞。中风险项（M-1）为既有问题，建议后续迭代修复。测试缺口（delete_page、缓存优化运行时验证）需 ac-verifier 阶段补齐。本审计未执行运行时动态验证，运行时行为正确性由 ac-verifier 负责。
