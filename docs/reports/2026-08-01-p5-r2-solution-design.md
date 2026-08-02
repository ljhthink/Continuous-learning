# P5-R2 方案设计文档

| 项目 | 内容 |
| --- | --- |
| 日期 | 2026-08-01 |
| 阶段 | P5-R2（P5 验收二轮修复） |
| 风险等级 | P2 跨模块（涉及 IPC 契约变更 + 缓存策略 + 删除功能扩展） |
| 依据 | [考古报告](2026-08-01-p5-r2-archaeology.md)、CLAUDE.md §2/§3/§7 |

## 工作流遵循

本方案严格遵循 CLAUDE.md 要求的工作流：

1. **§0 上下文重建**：已输出上下文重建摘要
2. **§1 强制规划调度**：已调用 `万能激励引擎` + `ralph` skill
3. **§2 联网调研**：已通过 `web-access` 搜索 LLM 自定义配置、PDF 解析完整性、Tauri keyring 一致性方案
4. **§3 源码考古**：已启动 `code-archaeologist` 产出 [考古报告](2026-08-01-p5-r2-archaeology.md)
5. **§4 深度思考**：通过 sequential-thinking 推理复杂问题（问题 3/4/6 根因与方案）
6. **§7 审查-测试闭环**：修复后将启动 `guardrail-enforcer` → `ac-verifier`（含 Playwright + TRAE-debugger）

---

## 问题与方案总览

| 编号 | 问题 | 优先级 | 根因 | 方案 |
| --- | --- | --- | --- | --- |
| 3 | PDF 解析内容不完整 | P0 阻断 | `handleOrganize` 只发送 `file.preview`（200 字符）给 LLM，非完整页面内容 | 调用 `kb_get_page` 获取完整 body 后再整理 |
| 4 | LLM 整理时找不到 API key | P0 严重 | 测试连接失败时 key 不保存 + `loadApiKey` 吞掉 keyring 错误 | 测试失败也保存 key + loadApiKey 区分 NoEntry 与真实错误 |
| 2 | 模型名无法自定义 | P1 | 模型名前后端硬编码，UI 为下拉框 | 复制 `customBaseUrl` 模式实现 `customModelName` |
| 1 | LLM 集成中国三厂商注释 | P1 | 文件头/分节头/行内注释提及具体厂商 | 删除厂商提及注释，保留代码逻辑 |
| 5 | 删除功能仅限 staging | P1 | `delete_page` 只删 wiki/.md，UI 仅 staging 卡片 | 扩展 `delete_page` 支持 raw/ + 预览界面入口 |
| 6 | 缓存仍卡顿 | P1 | 后台刷新触发 `setPage` → ReactMarkdown 重渲染 | 内容相同跳过 setPage + 消除 mock 闪烁 + 统一 key |
| 7 | 类型筛选难理解 | P2 | tooltip 不够明显 | 添加常驻帮助文本说明划分依据 |
| 8 | 测试不周全 | P2 | 无 Playwright 配置 + 未用 TRAE-debugger | 配置 Playwright + 用 TRAE-debugger 验证运行时 |
| 9 | 子 Agent 审核漏问题 | P2 | ac-verifier 跳过 E2E + 运行时验证 | 反思文档 + 流程改进 |

---

## 问题 3：PDF 解析内容不完整（P0 阻断）

### 根因（考古确认）

parser 本身文本提取完整（37 页 PDF → 26K 字符），完整内容已写入 wiki 页。问题在 [FileList.tsx:178](../../frontend/src/components/FileList.tsx#L175-L180) `handleOrganize`：

```typescript
const result = await organizeStagingPage(
  cloudProvider,
  apiKey,
  file.preview,    // ← 只传了 200 字符预览，非完整内容！
  customBaseUrl,
);
```

`file.preview` 来自 [lib.rs:425](../../frontend/src-tauri/src/lib.rs#L425) `extract_preview(&markdown_body, 200)`——只取前 5 行、最多 200 字符。

### 联网调研结论

PyMuPDF（当前使用）在纯文本提取上准确且快，多栏/表格场景 pdfplumber 更优，但当前 parser 已用 PyMuPDF + `find_tables()` 双管齐下，对 2025国赛.pdf 的提取已完整。**内容缺失不在 parser 层**，无需更换解析库。

### 方案

`handleOrganize` 在调用 LLM 前，先通过 `callMcpTool("kb_get_page", { page_path: file.id })` 获取完整页面 body，再传给 `organizeStagingPage`。

```typescript
// 修复后
const pageResult = await callMcpTool("kb_get_page", { page_path: file.id });
if (!pageResult.success || !pageResult.data) {
  setOrganizeError("无法读取页面完整内容，请重试");
  return;
}
const fullContent = (pageResult.data as { body: string }).body;
const result = await organizeStagingPage(
  cloudProvider, apiKey, fullContent, customBaseUrl, customModelName,
);
```

降级：若 `kb_get_page` 失败，回退到 `file.preview` 并提示用户"内容可能不完整"。

---

## 问题 4：LLM 整理时找不到 API key（P0 严重）

### 根因（考古确认）

keyring service/account 标识在存和读时完全一致（`"continuous-learning-kb"` + provider）。三个潜在故障点：

1. **故障点 1（最可能）**：[SettingsPanel.tsx:96](../../frontend/src/components/SettingsPanel.tsx#L96-L99) `saveApiKey` 仅在 `result.ok`（测试成功）时调用。若测试连接失败（如模型名不被接受、网络错误），**key 永远不会保存**。
2. **故障点 2**：[llm.ts:265-268](../../frontend/src/lib/llm.ts#L258-L269) `loadApiKey` 的 catch 分支吞掉所有 keyring 错误返回 null，无法区分"未保存"和"访问失败"。
3. **故障点 3**：provider 切换后 key 未重新保存（预期行为但缺 UX 引导）。

### 联网调研结论

Windows Credential Manager 凭据丢失常见原因：VaultSvc 服务停止、DPAPI 主密钥损坏、组策略禁止保存。但本项目 keyring 标识一致，更可能是故障点 1（测试失败不保存）。tauri-plugin-keyring-store 等替代方案存在，但当前 keyring crate v3 足够，无需更换。

### 方案

**修复故障点 1**：`handleTestConnection` 测试失败时仍保存 key（用户主动输入的 key 应尊重用户意图）。分离"验证"与"保存"语义：

```typescript
// 测试失败也保存 key（用户输入即应保存）
try {
  await saveApiKey(cloudProvider, apiKey);
  setKeySaved(true);
  if (result.ok) {
    setTestMessage(`${result.message}（已自动保存到系统密钥环）`);
  } else {
    setTestMessage(`${result.message}（Key 已保存，可稍后重试连接）`);
  }
} catch (saveErr) {
  setTestMessage(result.ok
    ? `${result.message}（保存到密钥环失败：${...}）`
    : `${result.message}（且保存到密钥环失败：${...}）`);
}
```

**修复故障点 2**：`loadApiKey` 区分 NoEntry 与真实错误，返回结构化结果：

```typescript
export interface LoadKeyResult {
  exists: boolean;
  key?: string;
  error?: string;  // keyring 访问失败时的真实错误
}
export async function loadApiKey(provider: CloudProvider): Promise<LoadKeyResult>
```

但此改动涉及 IPC 返回类型变更（P2 跨模块）。为降低风险，采用更小改动：`loadApiKey` 失败时 `console.error` 详细错误（而非 `console.warn` 吞掉），并向前端返回 `null` + 单独提供 `diagnoseApiKey` IPC 用于排查。

**修复故障点 3**：`handleOrganize` 找不到 key 时，提示用户当前 provider 名称并引导去设置检查。

---

## 问题 2：LLM 模型名自定义配置（P1）

### 根因（考古确认）

模型名在前后端均硬编码：[llm.ts:70-92](../../frontend/src/lib/llm.ts#L70-L92) `PROVIDERS.model` + [lib.rs:912-921](../../frontend/src-tauri/src/lib.rs#L909-L928) `get_provider_config`。UI 为 `<select>` 下拉框。`call_llm_api` 命令不接收 model 参数。

### 联网调研结论

业界通用模式：combobox（下拉 + 自定义输入），或文本输入框 + placeholder 提示默认值。本项目 `customBaseUrl` 已实现"文本输入框 + placeholder"模式，可直接复制此模式实现 `customModelName`，无需引入 combobox 组件库。

### 方案（完全复制 customBaseUrl 模式）

| 层级 | 改动 |
| --- | --- |
| `llmStore.ts` | 新增 `customModelName: string` + `setCustomModelName` + localStorage 持久化 |
| `SettingsPanel.tsx` | cloud-first 模式下新增「模型名」`<input>`，placeholder 显示 `PROVIDERS[cloudProvider].model` |
| `llm.ts` | `LlmCallParams` 新增 `customModelName?`；`callLlm` 透传给 IPC `model` 参数；`organizeStagingPage` 新增参数 |
| `FileList.tsx` | `handleOrganize` 从 store 读取 `customModelName` 传入 |
| `lib.rs` | `call_llm_api` 新增 `model: Option<String>` 参数；`effective_model` 优先自定义值；请求体改用 `effective_model` |

---

## 问题 1：删除 LLM 集成中国三厂商注释（P1）

### 根因（考古确认）

考古扫描 4 个文件，**未发现死代码注释**，所有提及 DeepSeek/GLM/Kimi 的注释均为说明性注释。但既然要支持自定义模型名（问题 2），这些硬编码厂商的注释就过时了。

### 方案

删除以下注释中提及具体厂商的部分（保留代码逻辑与通用说明）：

| 文件 | 行号 | 处理 |
| --- | --- | --- |
| `llm.ts` L1-15 | 文件头 doc | 改为通用说明，删除厂商列表 |
| `llm.ts` L23 | 类型注释 | 删除"（中国三厂商）" |
| `llm.ts` L66-68 | 分节头 | 删除"（研究结论，2026-07-28）" |
| `llm.ts` L94-97 | DEPRECATED_MODELS 说明 | 保留常量，注释改为通用"禁止使用的老版本模型名" |
| `SettingsPanel.tsx` L1-13 | 文件头 doc | 删除厂商列表 |
| `FileList.tsx` L7 | 行内注释 | 删除"调用中国三厂商 LLM" |
| `lib.rs` L890-899 | 分节头 | 删除厂商列表 |
| `lib.rs` L902 | 行内注释 | 删除"（中国三厂商）" |
| `lib.rs` L964 | 行内注释 | 删除"三厂商均支持" |

---

## 问题 5：删除功能扩展到所有已上传文档（P1）

### 根因（考古确认）

[delete_page](../../frontend/src-tauri/src/lib.rs#L647-L700) 只删除 `wiki/` 下的 `.md` 文件，明确不删除 `raw/` 原始文件（注释 L645 `Does NOT delete raw/ source files`）。删除按钮仅在 `FileCard`（staging 卡片）中渲染。

### 方案

1. **新增 `delete_raw_file` IPC 命令**：单独删除 `raw/` 文件，带路径穿越防护 + 审计日志。作为 immutable 原则的用户授权例外（二次确认）。
2. **扩展 `delete_page`**：新增可选参数 `delete_raw: bool`，为 true 时读取 frontmatter `source_file` 字段，删除对应 raw 文件。
3. **UI 入口扩展**：
   - `MarkdownPreview` 预览界面顶部添加删除按钮（复用 `deletePage` IPC）
   - `FileList` 删除按钮增加「同时删除原始文件」选项（confirm 对话框二次确认）
4. **缓存清理**：删除后通知前端 `pageCache.delete(path)`

---

## 问题 6：缓存仍卡顿（P1）

### 根因（考古确认）

缓存命中后立即显示（无 loading），但后台刷新 ~200ms 后触发 `setPage` 导致 **ReactMarkdown + rehypeHighlight 重渲染**。用户感知"加载一会"实为渲染延迟（大页面 100-500ms），非数据加载延迟。

### 方案

1. **内容相同跳过 setPage**：后台刷新结果与缓存内容相同时（`JSON.stringify` 比较），不调用 `setPage`，消除不必要的重渲染。
2. **消除初始 mock 闪烁**：`useState` 初始值改为从 `pageCache.get(currentPagePath)` 读取，无缓存时用空 PageDetail 而非 mockPageDetail。
3. **统一缓存 key**：所有导航点统一去 `.md` 后缀（`handleWikiLinkClick` 已去，`FileList.handlePreview` 需同步）。
4. **inboxCache 同理**：后台刷新结果与缓存相同时跳过 `setCards`。

---

## 问题 7：类型筛选说明（P2）

### 根因（考古确认）

`PAGE_TYPE_TOOLTIPS` 已实现（上轮 UX-5），但 tooltip 需 hover 才显示，不够明显。AGENTS.md §3 有官方定义但未在 UI 充分呈现。

### 方案

在 GraphView 筛选面板添加常驻帮助文本（一行简短说明），明确划分依据：

- **来源**：从 PDF/Word 等原始资料 ingest 生成的页面
- **概念**：解释抽象原理/模式/方法论的知识页
- **实体**：描述具体工具/库/框架/对象的页面
- **经验**：编码实践中沉淀的可复用方案/踩坑记录

---

## 问题 8：Playwright + TRAE-debugger 测试（P2）

### 根因（考古确认）

仅有 Vitest 单元测试，无 Playwright 配置，`package.json` 无 `test` 脚本。上轮 ac-verifier 跳过了 E2E 与运行时验证。

### 方案

1. **Playwright MCP 验证前端交互**（浏览器 dev 模式 + mock IPC）：
   - 验证 LLM 整理流程（mock callLlm 返回结构化内容）
   - 验证缓存命中不闪烁
   - 验证类型筛选说明显示
   - 验证删除按钮二次确认
2. **TRAE-debugger 验证 Tauri 桌面运行时**：
   - 插桩 keyring 存取日志，验证 save/load 一致性
   - 插桩 `call_llm_api` 参数日志，验证 customModelName 透传
   - 插桩 `handleOrganize` 内容长度日志，验证完整内容发送
3. **package.json 添加 test 脚本**：`"test": "vitest run"` + `"test:e2e": "playwright test"`（若配置 Playwright 框架）

---

## 问题 9：子 Agent 审核漏问题反思（P2）

### 根因（考古确认）

P5 验收只执行了 `tsc` + `cargo build` + guardrail-enforcer（静态分析），**未执行** Vitest 单元测试、Playwright E2E、TRAE-debugger 运行时验证。P4C ac-verifier 已标注"盲区：Tauri 桌面运行时未实测"，但 P5 未补齐。

### 流程改进

1. **ac-verifier 启动前必须提供「Tauri 桌面运行时验证清单」**，清单未完成不得标记通过
2. **强制 Playwright MCP 验证**：涉及前端交互的修复必须用 Playwright MCP 验证
3. **强制 TRAE-debugger 运行时验证**：涉及 IPC/keyring/parser 的修复必须用 TRAE-debugger 收集运行时证据
4. **反思文档**记录本轮漏问题的具体清单与改进措施

---

## 实施顺序

1. P0 问题 3（handleOrganize 完整内容）
2. P0 问题 4（API key 保存+错误处理）
3. P1 问题 2（customModelName）
4. P1 问题 1（删除注释）
5. P1 问题 5（删除功能扩展）
6. P1 问题 6（缓存优化）
7. P2 问题 7（类型说明）
8. P2 问题 8（Playwright+TRAE-debugger）
9. P2 问题 9（反思文档）

修复完成后按 CLAUDE.md §7 启动 guardrail-enforcer → ac-verifier 闭环。
