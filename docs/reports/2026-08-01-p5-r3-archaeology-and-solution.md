# P5-R3 源码考古与方案设计（第三轮修复）

| 项目 | 内容 |
| --- | --- |
| 日期 | 2026-08-01 |
| 阶段 | P5-R3（P5 验收三轮修复） |
| 执行 Agent | 主 Agent |
| 任务令牌 | TKN-P5-R3-ARCH-001 |
| 前序报告 | [P5-R2 考古](2026-08-01-p5-r2-archaeology.md)、[P5-R2 方案](2026-08-01-p5-r2-solution-design.md)、[P5-R2 反思](2026-08-01-p5-r2-subagent-reflection.md) |

## 1. 问题清单与根因

### 问题 1：LLM 整理提示"未找到 API Key"

**现象**：用户确认已点击"保存"/"测试连接"按钮，但 LLM 整理时仍提示"未找到 DeepSeek V4 的 API Key"。

**考古链路**：

- `FileList.tsx:175` → `loadApiKey(cloudProvider)` → `llm.ts:261` → Rust `load_api_key` (lib.rs:1069)
- `llm.ts:268-278`：catch 块捕获**所有** keyring 错误返回 `null`，包括非 NoEntry 的真实错误
- `FileList.tsx:176-180`：`if (!apiKey)` → 显示"未找到"

**根因**：`loadApiKey` 将 keyring 访问失败（非 NoEntry）与"未保存"（NoEntry）混为一谈，都返回 null。Windows Credential Manager 可能因 VaultSvc 服务问题返回非 NoEntry 错误，此时 key 已保存但读取失败，用户看到"未找到"。

**证据**：Rust `load_api_key` (lib.rs:1072-1076) 区分了 NoEntry（Ok(None)）与其他错误（Err），但前端 `loadApiKey` 的 catch 块将 Err 也降级为 null，丢失了区分。

### 问题 2：删除失败 "Path traversal detected"

**现象**：删除路径 `wiki/coding/2026数模国赛word模版-模版-记得修改命名-2` 时报 "Path traversal detected"。

**考古链路**：

- `MarkdownPreview.tsx:105` → `deletePage(currentPagePath, true)` → Rust `delete_page` (lib.rs:665)
- `delete_page:670` → `validate_inside(kb_root, page_path)` (lib.rs:252)
- `validate_inside:254`：`full = Path::new(base).join(path)` — path 无 .md 后缀
- `validate_inside:255`：`full.canonicalize()` **失败**（文件不存在，因实际文件有 .md 后缀）→ 回退到 `full.clone()`（无 `\\?\` 前缀）
- `validate_inside:256`：`base_resolved = base.canonicalize()` **成功** → 带 `\\?\` 前缀（Windows verbatim 路径）
- `validate_inside:258`：`resolved.starts_with(&base_resolved)` → **false**（`D:\...` 不 starts_with `\\?\D:\...`，因路径组件不同）

**根因（双重）**：

1. `delete_page` 不自动补 .md 后缀，而 `currentPagePath` 可能被 `handleWikiLinkClick` (MarkdownPreview:192) 或 `normalizeCacheKey` 去除了 .md
2. `validate_inside` 在 canonicalize 失败时，回退路径与 base_resolved 的 `\\?\` 前缀不一致，导致 starts_with 误报

### 问题 3：删除预设三个模型，只保留自定义配置

**现象**：SettingsPanel 有 provider 下拉框（deepseek/glm/kimi），用户要求移除，只保留自定义 baseUrl + model 输入。

**考古**：`SettingsPanel.tsx:231-241` provider `<select>` + `llm.ts:67-89` PROVIDERS 预设配置。

**根因**：UI 设计保留了预设 provider 选择，与用户"纯自定义"诉求不符。

### 问题 4：出链点击提示 "tool 'kb_get_page' returned error"

**现象**：新上传 PDF 预览中点击出链，提示 `⚠️ tool 'kb_get_page' returned error`。

**考古链路**：

- `MarkdownPreview.tsx:289` wikilink 点击 → `handleWikiLinkClick` (L189) → `setCurrentPagePath(normalized)` → `loadPage` (L118) → `callMcpTool("kb_get_page", ...)` (L157)
- Rust `call_mcp_tool` (lib.rs:908-916)：当 MCP 工具 exit_code=2（工具级错误）时，`error: Some(format!("tool '{}' returned error", tool_name))` — **丢弃了 MCP 工具返回的具体错误消息**
- MCP `kbGetPage` (read-only.ts:193-194)：页面不存在时返回 `errorResult("Page not found: ...")`，但这个错误消息被 Rust 端吞掉

**根因（双重）**：

1. `call_mcp_tool` (lib.rs:915) 丢弃了 MCP 工具的 error 字段内容，只说 "returned error"
2. 出链可能指向不存在的页面（LLM 整理生成的链接或 PDF 中的引用指向未创建的概念页），kb_get_page 返回 "Page not found" 但用户看不到这个原因

### 问题 5：新上传文档在知识图谱中不显示

**现象**：上传新文档后切到图谱视图，新文档不显示。

**考古链路**：

- `GraphView.tsx:218`：`callMcpTool("kb_get_graph", { include_statuses: ["active", "staging"] })` — 明确包含 staging，**不是**过滤问题
- `GraphView.tsx:191`：`useGraphStore()` — 共享 store
- `GraphView.tsx:213`：`useEffect` 仅在组件 mount 时加载一次，**无刷新机制**
- `graphStore`：图谱数据缓存，上传新文档后不失效

**根因**：GraphView 使用 graphStore 缓存数据，仅在 mount 时加载。用户上传文档后切换到图谱视图，组件可能已 mount（数据是旧的），不会重新请求 kb_get_graph。

### 问题 6：子 Agent 审核仍漏问题

**根因**：P5-R2 的 ac-verifier 将 TRAE-debugger **降级为 vitest mock IPC**（验收报告 AC-8 明确标注"降级"）。mock 无法发现：

- keyring Windows 特定性失败（问题 1）
- 路径 canonicalize `\\?\` 前缀不一致（问题 2）
- MCP 工具错误消息被吞（问题 4）
- graphStore 缓存不刷新（问题 5）

**教训**：连续两轮出现"降级"→"漏问题"→"用户发现"循环。本轮必须真正启动 Tauri 桌面模式做运行时验证，**禁止降级**。

## 2. 修复方案

### Fix 1：API Key 双层存储 + 错误透传

- `llm.ts saveApiKey`：先写 keyring，同时写 localStorage（base64 编码，非安全存储但保证可读）
- `llm.ts loadApiKey`：先试 keyring；若返回错误（非 NoEntry），降级读 localStorage；返回值携带错误信息
- `FileList.tsx handleOrganize`：当 loadApiKey 返回 null 时，区分"未保存"与"keyring 读取失败（已降级到 localStorage 但仍未找到）"
- Rust `load_api_key`：保持现状（已正确区分 NoEntry 与 Err）

### Fix 2：delete_page 补 .md + validate_inside 前缀修复

- `lib.rs delete_page`：开头自动补 .md 后缀（`if !page_path.ends_with(".md") { format!("{}.md", page_path) }`）
- `lib.rs validate_inside`：canonicalize 失败时，对 base_resolved 也去除 `\\?\` 前缀后比较（或用 `to_string_lossy().trim_start_matches(r"\\?\")` 统一）
- 双重保险：即使路径无 .md，补 .md 后 canonicalize 成功，前缀一致

### Fix 3：移除预设 provider，改为纯自定义

- `llm.ts`：`CloudProvider` 类型改为 `"custom"`；`PROVIDERS` 改为单条 custom 配置（baseUrl/model 为空，由用户填）
- `llmStore.ts`：`cloudProvider` 默认值改为 `"custom"`
- `SettingsPanel.tsx`：移除 provider `<select>` 下拉（L231-241）；baseUrl 和 model 输入框变为必填（placeholder 提示示例）
- keyring key 统一为 `"custom"`；迁移逻辑：首次加载时若 `"custom"` 无 key，尝试读旧 `"deepseek"` key 并迁移

### Fix 4：call_mcp_tool 错误透传 + 友好提示

- `lib.rs call_mcp_tool` (L915)：从 MCP 工具返回的 JSON 中提取 `error` 字段，包含在错误消息中：`format!("tool '{}' returned error: {}", tool_name, mcp_error)`
- `MarkdownPreview.tsx loadPage`：当错误包含 "Page not found" 时，显示友好提示"目标页面不存在（可能尚未创建）"

### Fix 5：GraphView 刷新机制

- `graphStore.ts`：添加 `invalidate()` 方法，清空缓存
- `FileList.tsx` 或上传成功后：调用 `useGraphStore.invalidate()` 使缓存失效
- `GraphView.tsx`：useEffect 依赖增加 `graphData === null` 检查，缓存失效后自动重新加载
- 或更简单：GraphView 切换到该视图时（view === "graph"）触发刷新

### Fix 6：反思与流程强化

- 本轮 ac-verifier **禁止降级** TRAE-debugger，必须启动 Tauri 桌面模式做真实运行时验证
- 验证清单新增：keyring save/load 往返、delete_page 路径补 .md、call_mcp_tool 错误透传、graphStore 刷新

## 2.1 实施中发现并追加的修复

在实施上述 6 项修复时，发现以下遗漏并追加修复：

### Fix 5-补：invalidate() 未被调用

**问题**：graphStore 定义了 `invalidate()` 方法，但**没有任何组件调用它**。上传/删除/确认/驳回 后图谱不会刷新。

**追加修复**：

- `DropZone.tsx`：上传成功后调用 `invalidateGraph()`
- `FileList.tsx`：confirm/reject/delete 后调用 `invalidateGraph()`
- `MarkdownPreview.tsx`：delete 后调用 `invalidateGraph()`
- 所有调用点添加 `invalidateGraph` 到 useCallback 依赖数组

### Fix 1-补：旧 provider API Key 迁移

**问题**：旧版用户可能在 "deepseek"/"glm"/"kimi" 下保存了 API Key。迁移到 "custom" 后，`loadApiKey("custom")` 找不到旧 Key。

**追加修复**：`llm.ts loadApiKey` 在 "custom" provider 无 Key 时，依次尝试从旧 provider（deepseek/glm/kimi）读取 Key 并迁移到 "custom"（keyring + localStorage 双层）。

### Fix 4-补：Rust 借用检查器修复

**问题**：`call_mcp_tool` 中 `mcp_error` 借用 `data` 但 `data` 被 move 到 `McpToolResult`，导致编译失败。

**追加修复**：将 `mcp_error` 转为 owned `String`（`.to_string()`）后再 move `data`。

### 测试更新

- `llm.test.ts`：
  - "三家厂商均已配置" → "custom + 三家旧厂商均已配置"（4 个 provider）
  - "saveApiKey 失败时抛错" → "saveApiKey keyring 失败时降级到 localStorage（不抛错）"
  - "非 Tauri 环境下 saveApiKey 抛错" → "非 Tauri 环境下 saveApiKey 降级到 localStorage（不抛错）"
  - 添加 localStorage mock（node 环境无 localStorage）
- `p5-r2-runtime-verify.test.ts`：移除未使用的 `callLlm` 导入，修复 `args.prompt` 类型断言
- `SettingsPanel.tsx`：移除未使用的 `PROVIDERS`、`CloudProvider`、`setCloudProvider` 导入

## 3. 实施顺序

1. Fix 2（delete_page + validate_inside）— 阻断级，优先
2. Fix 4（call_mcp_tool 错误透传）— 与 Fix 2 同文件
3. Fix 1（API Key 双层存储）— 阻断级
4. Fix 3（移除预设 provider）— UX 改进
5. Fix 5（GraphView 刷新）— UX 改进
6. 编译验证（tsc + cargo build + vitest）
7. guardrail-enforcer 审查
8. ac-verifier 验收（**禁止降级**，必须 Tauri 运行时验证）
