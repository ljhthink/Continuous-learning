# P5-R2 源码考古报告

| 项目 | 内容 |
| --- | --- |
| 日期 | 2026-08-01 |
| 考古范围 | P5 验收 9 项问题源码定位 |
| 考古员 | code-archaeologist |
| 考古方法 | 静态代码审计 + 运行时 parser 验证（只读，未修改任何代码或数据） |

---

## 问题 1：LLM 注释清理

### 1.1 注释位置清单

对 4 个目标文件逐行扫描所有 `//` 注释行，筛选出提及 "DeepSeek/GLM/Kimi/中国三厂商" 的注释：

| 文件 | 行号 | 注释内容 | 类型 |
| --- | --- | --- | --- |
| ../../frontend/src/lib/llm.ts#L1-L15 | L1-15 | 文件头 doc 注释：`适配中国三厂商最新旗舰（2026-07-28 网络搜索确认）：DeepSeek V4 / GLM-5.2 / Kimi K3` | 说明性 |
| ../../frontend/src/lib/llm.ts#L23 | L23 | `/** Cloud 模式下可选的模型提供商（中国三厂商） */` | 说明性 |
| ../../frontend/src/lib/llm.ts#L66-L68 | L66-68 | 分节头：`// 厂商配置（研究结论，2026-07-28）` | 说明性 |
| ../../frontend/src/lib/llm.ts#L94-L97 | L94-97 | `禁止使用的老版本模型名（用于运行时校验...）旧模型名 deepseek-chat / deepseek-reasoner 已于 2026-07-24 停用` | 说明性 |
| ../../frontend/src/store/llmStore.ts | — | 无 LLM 厂商相关注释（仅有 localStorage 降级说明 L60） | N/A |
| ../../frontend/src/components/SettingsPanel.tsx#L1-L13 | L1-13 | 文件头 doc 注释：`P5 已实际接入 LLM（ADR-013 V6-V8），适配中国三厂商最新旗舰：DeepSeek V4 / GLM-5.2 / Kimi K3` | 说明性 |
| ../../frontend/src/components/FileList.tsx#L7 | L7 | `P5（ADR-013）：新增 "LLM 整理" 按钮 — 调用中国三厂商 LLM 将原始 markdown 整理为结构化 wiki 页面` | 说明性 |
| ../../frontend/src-tauri/src/lib.rs#L890-L899 | L890-899 | 分节头注释块：`LLM 集成（P5, ADR-013）...适配中国三厂商最新旗舰...DeepSeek V4 / GLM-5.2 / Kimi K3` | 说明性 |
| ../../frontend/src-tauri/src/lib.rs#L902 | L902 | `/// LLM provider 配置（中国三厂商）` | 说明性 |
| ../../frontend/src-tauri/src/lib.rs#L964 | L964 | `// 三厂商均支持 reasoning_effort，思考模式开到 max 提升整理质量` | 说明性 |

### 1.2 分析结论

**未发现任何"注释掉的死代码"**。所有提及 DeepSeek/GLM/Kimi 的注释均为说明性注释，分为三类：

1. **文件头 doc 注释**（llm.ts L1-15、SettingsPanel.tsx L1-13、FileList.tsx L1-11、lib.rs L890-899）：描述模块用途和适配的厂商列表
2. **分节头注释**（llm.ts L66-68、lib.rs L902）：标记代码段落
3. **行内说明注释**（llm.ts L23、L94-97、lib.rs L964）：解释类型用途和设计决策

**建议**：这些说明性注释有文档价值，主 Agent 可酌情保留。若用户要求"清理"，应理解为清理过时信息（如模型版本号可能需要更新），而非删除注释。唯一需要关注的是 llm.ts L94-97 的 `DEPRECATED_MODELS` 说明——该常量本身是活跃代码（运行时校验用），注释仅说明其用途。

---

## 问题 2：LLM 模型名自定义配置

### 2.1 当前实现

**模型名是"预设下拉"，不是"自由输入"。** 模型名在前后端均硬编码，用户无法自定义。

#### 前端 PROVIDERS 常量（硬编码模型名）

../../frontend/src/lib/llm.ts#L70-L92：

```typescript
export const PROVIDERS: Record<CloudProvider, ProviderConfig> = {
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-v4-pro",    // ← 硬编码
    name: "DeepSeek V4",
    ...
  },
  glm: {
    model: "glm-5.2",            // ← 硬编码
    ...
  },
  kimi: {
    model: "kimi-k3",            // ← 硬编码
    ...
  },
};
```

#### 前端 UI：下拉选择框（非自由输入）

../../frontend/src/components/SettingsPanel.tsx#L231-L243：用户通过 `<select>` 下拉框选择厂商（deepseek/glm/kimi），模型名由 PROVIDERS 常量决定，无文本输入框。

#### Rust 后端：get_provider_config（硬编码模型名）

../../frontend/src-tauri/src/lib.rs#L909-L928：

```rust
fn get_provider_config(provider: &str) -> Result<LlmProviderConfig, String> {
    match provider {
        "deepseek" => Ok(LlmProviderConfig {
            base_url: "https://api.deepseek.com/v1",
            model: "deepseek-v4-pro",    // ← 硬编码
        }),
        "glm" => Ok(LlmProviderConfig {
            model: "glm-5.2",            // ← 硬编码
        }),
        "kimi" => Ok(LlmProviderConfig {
            model: "kimi-k3",            // ← 硬编码
        }),
        ...
    }
}
```

#### call_llm_api 命令：不接收 model 参数

../../frontend/src-tauri/src/lib.rs#L938-L967：`call_llm_api` 的参数列表为 `(provider, api_key, prompt, system_prompt, base_url)`——**没有 model 参数**。请求体中的 `"model": config.model` 直接使用 `get_provider_config` 返回的硬编码值。

### 2.2 customBaseUrl 已实现的参考模式

customBaseUrl（上轮新增）的完整实现链路可作为 customModelName 的参考：

| 层级 | customBaseUrl 实现位置 | customModelName 需新增 |
| --- | --- | --- |
| Store 状态 | ../../frontend/src/store/llmStore.ts#L22-L23 `customBaseUrl: string` + `setCustomBaseUrl` | 新增 `customModelName: string` + `setCustomModelName` |
| Store 持久化 | llmStore.ts L47 `customBaseUrl: parsed.customBaseUrl ?? defaults.customBaseUrl` | 同模式追加 |
| SettingsPanel UI | ../../frontend/src/components/SettingsPanel.tsx#L245-L256 `<input>` 文本框 | 新增模型名 `<input>` |
| LlmCallParams | ../../frontend/src/lib/llm.ts#L49-L50 `customBaseUrl?: string` | 新增 `customModelName?: string` |
| callLlm 透传 | ../../frontend/src/lib/llm.ts#L172 `baseUrl: params.customBaseUrl ?? ""` | 新增 `model: params.customModelName ?? ""` |
| organizeStagingPage | ../../frontend/src/lib/llm.ts#L306 `customBaseUrl?: string` | 新增 `customModelName?: string` |
| FileList 调用 | ../../frontend/src/components/FileList.tsx#L175-L180 传入 `customBaseUrl` | 传入 `customModelName` |
| Rust IPC 参数 | ../../frontend/src-tauri/src/lib.rs#L944 `base_url: Option<String>` | 新增 `model: Option<String>` |
| Rust 优先使用自定义值 | ../../frontend/src-tauri/src/lib.rs#L946-L949 `base_url.filter(!empty).unwrap_or(config.base_url)` | `model.filter(!empty).unwrap_or(config.model)` |
| Rust 请求体 | lib.rs L962 `"model": config.model` | 改为 `"model": effective_model` |

### 2.3 改造点清单

1. **llmStore.ts**：新增 `customModelName` state + setter + localStorage 持久化
2. **SettingsPanel.tsx**：cloud-first 模式下新增「模型名」`<input>` 文本框（placeholder 显示 PROVIDERS 默认值）
3. **llm.ts**：`LlmCallParams` 新增 `customModelName?`；`callLlm` 透传给 IPC 的 `model` 参数；`organizeStagingPage` 新增参数
4. **FileList.tsx**：`handleOrganize` 从 store 读取 `customModelName` 传入 `organizeStagingPage`
5. **lib.rs**：`call_llm_api` 新增 `model: Option<String>` 参数；`effective_model` 优先使用自定义值；请求体改用 `effective_model`

---

## 问题 3：PDF 解析完整性

### 3.1 parser/parse.py 实现

../../parser/parse.py#L42-L82 `parse_pdf` 函数：

```python
def parse_pdf(file_path: str) -> dict:
    import fitz  # pymupdf
    doc = fitz.open(file_path)
    for page_num, page in enumerate(doc, 1):
        text = page.get_text("text")       # ← 纯文本提取
        if text.strip():
            pages.append(f"## 第 {page_num} 页\n\n{text.strip()}")
        tables = page.find_tables()         # ← 基本表格检测
        for table_idx, table in enumerate(tables):
            rows = table.extract()
            ...
```

| 维度 | 实现情况 | 缺失 |
| --- | --- | --- |
| 解析库 | pymupdf (fitz) v1.24.10 | — |
| 页数限制 | 无限制，遍历所有页 | — |
| 文本提取 | `page.get_text("text")` 按阅读顺序 | — |
| 表格提取 | `page.find_tables()` + markdown 格式化 | 复杂表格可能遗漏 |
| 图片提取 | 无 | 不提取图片、不 OCR |
| 多栏布局 | 无专门处理 | `get_text("text")` 可能交错多栏文本 |
| 页面跳过 | 空白页跳过（L56 `if text.strip()`） | — |

### 3.2 运行时验证（只读测试）

对 `raw/pdf/2025国赛.pdf`（2.4MB）实际运行 parser：

| 指标 | 值 |
| --- | --- |
| PDF 页数 | 37 |
| 提取页面段数 | 36（1 页空白跳过） |
| markdown 字符数 | 26,273 |
| markdown 字节数 | 63,745 |
| JSON 输出字节数 | 65,841 |
| 内容完整性 | 从第 1 页到第 37 页完整提取，末尾内容正常 |

**结论**：parser 本身的文本提取是完整的，37 页全部提取。内容缺失不在 parser 层。

### 3.3 内容缺失根因：LLM 整理只发送 200 字符 preview

**这是最关键的发现。** ../../frontend/src/components/FileList.tsx#L175-L180 `handleOrganize` 函数：

```typescript
const result = await organizeStagingPage(
  cloudProvider,
  apiKey,
  file.preview,    // ← 只传了 200 字符的预览，非完整内容！
  customBaseUrl,
);
```

`file.preview` 来源：../../frontend/src-tauri/src/lib.rs#L425 `extract_preview(&markdown_body, 200)` ——只取前 5 行、最多 200 字符。

而 `organizeStagingPage`（../../frontend/src/lib/llm.ts#L302-L315）将这个 200 字符的 preview 作为 `prompt` 发送给 LLM：

```typescript
export async function organizeStagingPage(
  provider, apiKey, rawContent, customBaseUrl
): Promise<LlmCallResult> {
  return callLlm({
    provider,
    apiKey,
    prompt: rawContent,    // ← 只有 200 字符的 preview
    systemPrompt: STAGING_SYSTEM_PROMPT,
    customBaseUrl,
  });
}
```

**影响**：用户上传一个 37 页的 PDF（26K 字符），点击"LLM 整理"后，LLM 只收到前 200 字符，无法整理完整内容。这才是"PDF 解析内容不完整"的真正根因。

### 3.4 lib.rs 调用链路

../../frontend/src-tauri/src/lib.rs#L329-L359 `upload_file` 中的 parser 调用：

```rust
let parser_output = app_handle
    .shell()
    .command(&config.python_path)
    .args([&config.parser_path, &file_path])
    .output()           // ← 捕获全部 stdout，无截断
    .await
    ...
let stdout = String::from_utf8_lossy(&parser_output.stdout).to_string();
let parser_result: ParserOutput = serde_json::from_str(&stdout)...
```

| 检查项 | 结果 |
| --- | --- |
| stdout 截断 | 无。`String::from_utf8_lossy` 捕获全部输出 |
| ParserOutput.markdown 长度限制 | 无。`markdown: Option<String>` 无长度约束（lib.rs L75） |
| 完整内容写入 wiki 页 | 是。lib.rs L414-422 `build_wiki_page(..., &markdown_body, ...)` 写入完整 markdown |
| preview 截断 | 是，但仅用于卡片显示。lib.rs L425 `extract_preview(&markdown_body, 200)` |

**结论**：lib.rs 调用链路无截断问题。完整内容已写入 wiki 页文件。问题在于 FileList.tsx L178 读取的是 `file.preview`（200 字符）而非完整页面内容。

### 3.5 修复建议

`handleOrganize` 应读取完整页面内容（通过 `callMcpTool("kb_get_page", { page_path: file.id })` 或新增 IPC 命令 `read_staging_content`），而非使用 200 字符的 preview。

---

## 问题 4：API key 找不到

### 4.1 存储路径

**SettingsPanel 测试连接成功后自动保存**（上轮 Bug-2 修复）：

../../frontend/src/components/SettingsPanel.tsx#L87-L110 `handleTestConnection`：

```typescript
const result = await testConnection(cloudProvider, apiKey, customBaseUrl);
if (result.ok) {
    await saveApiKey(cloudProvider, apiKey);  // ← 保存到 keyring
    setKeySaved(true);
}
```

**SettingsPanel 手动保存按钮**：

../../frontend/src/components/SettingsPanel.tsx#L113-L127 `handleSaveKey`：

```typescript
await saveApiKey(cloudProvider, apiKey);
```

**keyring 存储**（../../frontend/src-tauri/src/lib.rs#L1012-L1018）：

```rust
fn save_api_key(provider: String, api_key: String) -> Result<(), String> {
    let entry = keyring::Entry::new("continuous-learning-kb", &provider)
        ...
    entry.set_password(&api_key)
}
```

- Service name: `"continuous-learning-kb"`（硬编码常量）
- Account name: `provider` 字符串（"deepseek" / "glm" / "kimi"）
- keyring crate 版本：v3（Cargo.toml 确认）

### 4.2 读取路径

**FileList LLM 整理时读取**：

../../frontend/src/components/FileList.tsx#L167-L174 `handleOrganize`：

```typescript
const apiKey = await loadApiKey(cloudProvider);
if (!apiKey) {
    setOrganizeError(`未找到 ${PROVIDERS[cloudProvider].name} 的 API Key，请先在设置中保存`);
    return;
}
```

**keyring 读取**（../../frontend/src-tauri/src/lib.rs#L1024-L1032）：

```rust
fn load_api_key(provider: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new("continuous-learning-kb", &provider)
        ...
    match entry.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("failed to load API key: {}", e)),
    }
}
```

### 4.3 标识一致性分析

| 维度 | 存储时 | 读取时 | 一致？ |
| --- | --- | --- | --- |
| Service name | `"continuous-learning-kb"` (lib.rs L1013) | `"continuous-learning-kb"` (lib.rs L1025) | 是 |
| Account name | `cloudProvider` (SettingsPanel L99) | `cloudProvider` (FileList L168) | 是 |
| cloudProvider 来源 | `useLlmStore().cloudProvider` | `useLlmStore().cloudProvider` | 是（同一全局 store） |
| keyring crate API | `set_password` | `get_password` | 是（同一 Entry） |

**service/account 标识在存和读时完全一致。** 不存在 Windows Credential Manager target name 不匹配问题。

### 4.4 根因分析：三个潜在故障点

#### 故障点 1（最可能）：测试连接失败导致 key 未保存

../../frontend/src/components/SettingsPanel.tsx#L96-L99：`saveApiKey` 仅在 `result.ok`（测试成功）时调用。若测试连接失败（如模型名 `deepseek-v4-pro` 不被 API 接受、网络错误、自定义 baseUrl 错误），**key 永远不会保存到 keyring**。

用户流程：输入 Key → 点"测试连接" → 测试失败 → Key 未保存 → 去 FileList 点"LLM 整理" → `loadApiKey` 返回 null → "未找到 API Key"。

#### 故障点 2：loadApiKey 吞掉 keyring 错误

../../frontend/src/lib/llm.ts#L258-L269：

```typescript
export async function loadApiKey(provider: CloudProvider): Promise<string | null> {
    try {
        const result = (await invoke("load_api_key", { provider })) as string | null;
        return result;
    } catch (err) {
        console.warn(`[llm] load_api_key failed for ${provider}:`, err);
        return null;  // ← 任何 keyring 错误都返回 null，与"未保存"无法区分
    }
}
```

如果 keyring 访问失败（如 Windows Credential Manager 权限问题、keyring crate v3 兼容性问题），用户看到"未找到 API Key"而非真实的错误信息。

#### 故障点 3：provider 切换后 key 未重新保存

用户为 deepseek 保存了 key，然后切换到 glm，glm 没有 key。此时点"LLM 整理"会用 `cloudProvider="glm"` 去 keyring 查找，自然找不到。这是预期行为但缺少 UX 引导。

### 4.5 修复建议

1. **故障点 1**：即使用户只点"保存"不点"测试连接"，也应能保存 key（已有 `handleSaveKey` 按钮，但用户可能不知道）。建议在"测试连接"失败时仍提供"强制保存"选项
2. **故障点 2**：`loadApiKey` 应区分 "NoEntry"（未保存）和真实错误（keyring 访问失败），向前端返回不同信号
3. **故障点 3**：FileList 的 `handleOrganize` 在找不到 key 时，提示用户当前 provider 名称，引导去设置面板检查

---

## 问题 5：删除功能扩展

### 5.1 当前 delete_page 实现

../../frontend/src-tauri/src/lib.rs#L647-L700 `delete_page` 命令：

```rust
fn delete_page(page_path: String, config: State<'_, KbConfig>) -> Result<(), String> {
    let full_path = validate_inside(&config.kb_root, &page_path)?;
    // 只允许删除 .md 文件
    if !full_path.extension().map_or(false, |e| e == "md") {
        return Err("只能删除 .md 文件".to_string());
    }
    // 只允许删除 wiki/ 目录下的文件
    let wiki_root = Path::new(&config.kb_root).join("wiki").canonicalize()...;
    if !full_path.starts_with(&wiki_root) {
        return Err("只能删除 wiki/ 目录下的页面".to_string());
    }
    fs::remove_file(&full_path)?;
    // 追加审计日志
    ...
}
```

| 限制 | 说明 |
| --- | --- |
| 文件类型 | 仅 `.md`（lib.rs L655） |
| 目录范围 | 仅 `wiki/` 下（lib.rs L663-669） |
| raw/ 原始文件 | 不删除（注释明确说明 L645：`Does NOT delete raw/ source files (immutable principle)`） |
| 审计日志 | 追加 `log.md`（lib.rs L682-697） |

### 5.2 当前 UI 入口

../../frontend/src/components/FileList.tsx#L411-L425：删除按钮（垃圾桶图标）仅在 `FileCard` 组件中渲染。`FileCard` 仅在 `FileList`（staging 文件列表）中使用。

```tsx
<button onClick={onDelete} title="删除文件">
    <span className="material-symbols-outlined">delete</span>
</button>
```

| UI 位置 | 有删除按钮？ |
| --- | --- |
| FileList staging 卡片 | 是（FileList.tsx L411-425） |
| MarkdownPreview 预览界面 | 否 |
| GraphView 图谱节点右键菜单 | 否（只有跳转/聚焦/复制路径） |
| ExperienceInbox 审核队列 | 否（只有 Promote/Reject） |
| raw/ 原始文件 | 无任何管理界面 |

### 5.3 扩展方案

"删除已上传文档"的完整语义应为：

| 操作 | 当前 | 需扩展 | 实现方式 |
| --- | --- | --- | --- |
| 删除 wiki staging 页 | 已实现 | — | `delete_page` |
| 删除 wiki active 页 | 已实现（delete_page 不区分 staging/active） | 需 UI 入口 | MarkdownPreview 添加删除按钮 |
| 删除 raw/ 原始文件 | 未实现 | 新增 IPC `delete_raw_file` | 需打破 immutable 原则的例外授权 |
| 清理 pageCache | 未实现 | MarkdownPreview `pageCache.delete(path)` | 删除后通知前端清缓存 |
| 清理 inboxCache | 已实现（promote/reject 时置 null） | — | — |
| 删除经验卡片 | 未实现 | 新增 IPC 或复用 reject | ExperienceInbox 添加删除按钮 |

**raw/ 删除的注意点**：AGENTS.md §9.3 禁止修改 raw/。但用户上传错误文件后需要删除原始文件。建议新增 `delete_raw_file` IPC 命令，带二次确认 + 审计日志，作为 immutable 原则的用户授权例外。

---

## 问题 6：缓存策略缺陷

### 6.1 MarkdownPreview 缓存

../../frontend/src/components/MarkdownPreview.tsx#L43 模块级缓存：

```typescript
const pageCache = new Map<string, PageDetail>();
```

缓存命中逻辑（L81-L104）：

```typescript
const cached = pageCache.get(pagePath);
if (cached) {
    setPage(cached);        // 立即显示缓存
    setLoading(false);
    // 后台静默刷新
    callMcpTool("kb_get_page", { page_path: pagePath })
        .then((result) => {
            if (result.success && result.data) {
                const pageDetail = parsePageDetail(data, pagePath);
                pageCache.set(pagePath, pageDetail);
                setPage(pageDetail);   // ← 触发 ReactMarkdown 重渲染
            }
        })
        .catch(() => { pageCache.delete(pagePath); });
    return;
}
```

### 6.2 ExperienceInbox 缓存

../../frontend/src/components/ExperienceInbox.tsx#L28 模块级缓存：

```typescript
let inboxCache: { cards: ExperienceCard[] } | null = null;
```

缓存命中逻辑（L44-L61）：与 MarkdownPreview 同模式——立即显示缓存 + 后台静默刷新。

### 6.3 缺陷分析

| 缺陷 | 位置 | 影响 | 严重度 |
| --- | --- | --- | --- |
| **初始 state 为 mockPageDetail** | MarkdownPreview.tsx L68 `useState<PageDetail>(mockPageDetail)` | 组件挂载到缓存命中之间有一帧显示 mock 数据（闪烁） | 中 |
| **后台刷新触发 ReactMarkdown 重渲染** | MarkdownPreview.tsx L96 `setPage(pageDetail)` | 即使缓存命中，200ms 后后台刷新完成触发 `setPage`，ReactMarkdown + rehypeHighlight 重新解析 markdown（大页面耗时 100-500ms），用户感知"加载一会" | 高 |
| **无持久化缓存** | 两者均为模块级变量 | 应用重启后缓存丢失，首次进入必加载 | 中 |
| **缓存 key 不一致** | MarkdownPreview.tsx L143 wikilink 去 `.md` 后缀；FileList.tsx L128 保留 `.md` | 同一页面通过不同路径导航时缓存未命中（`wiki/coding/foo` vs `wiki/coding/foo.md`） | 中 |
| **inboxCache 后台刷新不设 loading** | ExperienceInbox.tsx L48 `setLoading(false)` | 后台刷新期间列表可能变化但无指示 | 低 |
| **后台刷新失败清除缓存** | MarkdownPreview.tsx L101 `pageCache.delete(pagePath)` | 网络瞬时错误导致缓存被清除，下次进入需重新加载 | 低 |

**"Python异步编程"卡片仍加载的根因**：缓存命中后立即显示（无 loading），但后台刷新 ~200ms 后触发 `setPage` 导致 ReactMarkdown 重新渲染。用户感知的"加载一会"不是数据加载延迟，而是 **ReactMarkdown + rehypeHighlight 的渲染延迟**。大页面（含代码块）的语法高亮渲染尤其耗时。

**"mcp server新增工具"和"相对路径深度诊断"卡片**：考古确认这两张经验卡当前 `status: active`（已从 inbox promote 为正式页），不再出现在 ExperienceInbox 审核队列中。用户若仍看到加载，可能是在 MarkdownPreview 中查看这些页面（通过图谱跳转），同样受 ReactMarkdown 重渲染影响。

### 6.4 修复建议

1. **消除不必要的后台重渲染**：后台刷新结果与缓存内容相同时（deep equal），不调用 `setPage`
2. **消除初始 mock 闪烁**：`useState` 初始值改为从 `pageCache.get(currentPagePath)` 读取
3. **统一缓存 key**：所有路径导航点统一去 `.md` 后缀或统一保留
4. **ReactMarkdown 渲染优化**：使用 `useMemo` 缓存渲染结果，或引入 `react-markdown` 的 `memo` 支持

---

## 问题 7：类型筛选说明

### 7.1 type 官方定义

来源：../../AGENTS.md §3.1 + §3.2 frontmatter schema

| type | 附加必填字段 | 状态机 | 官方定义 |
| --- | --- | --- | --- |
| `concept` | 无附加 | staging → active → archived | 通用概念页，解释某个概念/原理 |
| `entity` | 无附加 | staging → active → archived | 实体页，描述具体对象/工具/库 |
| `source` | `source_file` | staging → active → archived | 从原始资料（PDF/Word 等）ingest 生成的页面 |
| `experience` | `confidence`、`source_task` | pending → active → archived（→ rejected） | 编码实践中沉淀的可复用方案/踩坑记录 |

### 7.2 GraphView 中的实现

../../frontend/src/components/GraphView.tsx#L89-L94 `PAGE_TYPE_TOOLTIPS`（上轮 UX-5 已实现）：

```typescript
const PAGE_TYPE_TOOLTIPS: Record<PageType, string> = {
  concept: "概念页：解释某个概念/原理的知识页（如「异步编程模式」）",
  entity: "实体页：描述具体对象/工具/库的知识页（如「Python asyncio 库」）",
  source: "来源页：从原始资料（PDF/Word 等）ingest 生成的页面",
  experience: "经验卡片：编码实践中沉淀的可复用方案/踩坑记录",
};
```

节点形状编码（GraphView.tsx L44-78）：concept=圆 / entity=方 / source=菱 / experience=三角

### 7.3 划分依据与典型例子

| type | 划分依据 | 典型例子（来自 wiki/） |
| --- | --- | --- |
| concept | 抽象知识：原理、模式、方法论 | 异步编程模式、图遍历 BFS/DFS 模式 |
| entity | 具体对象：工具、库、框架 | Python asyncio 库、react-force-graph-2d |
| source | 原始资料摄入：PDF/DOCX/XLSX 解析后生成 | 2026数模国赛word模版（`source_file: raw/docx/...`） |
| experience | 实践沉淀：编码中踩的坑/可复用方案 | MCP server 新增工具后客户端缓存过期、markdown 相对路径深度计算 |

### 7.4 现状评估

`PAGE_TYPE_TOOLTIPS` 已在上轮 UX-5 修复中添加，筛选按钮的 `title` 属性已设置（GraphView.tsx L874）。用户 hover 按钮可看到说明。**此问题已基本解决**，若需进一步增强可考虑在筛选面板添加常驻 `?` 帮助图标。

---

## 问题 8：测试覆盖缺口

### 8.1 现有测试

**仅 Vitest 单元测试，无 E2E 测试。**

| 测试文件 | 测试内容 |
| --- | --- |
| ../../frontend/src/lib/**tests**/llm.test.ts | LLM 集成（callLlm/testConnection/STAGING_SYSTEM_PROMPT/三态模式，39 用例） |
| ../../frontend/src/lib/**tests**/graph-filter-integration.test.ts | 图谱筛选集成 |
| ../../frontend/src/lib/**tests**/html-utils.test.ts | HTML 转义工具 |
| ../../frontend/src/lib/**tests**/node-radius-contract.test.ts | 节点半径契约 |
| ../../frontend/src/store/**tests**/viewStore.test.ts | 视图切换状态机（11 用例） |

package.json scripts 中**无 `test` 脚本**：

```json
{
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
}
```

### 8.2 Playwright 配置

**无 Playwright 配置，无 Playwright 依赖。**

- 搜索 `playwright*` 文件：无结果
- package.json devDependencies 中无 `@playwright/test`
- 仅有 vitest + @vitest/ui

### 8.3 现有 TRAE-debugger 报告

| 报告 | 验证方式 | 验证内容 |
| --- | --- | --- |
| ../../docs/reports/2026-07-28-p4-fix-r5-debug.md | Playwright MCP（浏览器 dev 模式） | nodeRadius/筛选/LLM 模式切换 |
| ../../docs/reports/2026-07-28-p4-fix-r6-debug.md | Playwright MCP（浏览器 dev 模式） | 同 r5，补充验证 |

这些 debug 报告使用的是 **Playwright MCP**（通过 MCP 协议驱动浏览器），不是项目集成的 Playwright 测试框架。且均在**浏览器 dev 模式**（非 Tauri 桌面环境）下验证，使用 mock 数据。

### 8.4 覆盖缺口

| 问题场景 | 有单元测试？ | 有 E2E 测试？ | 缺口 |
| --- | --- | --- | --- |
| 文件上传（PDF/DOCX/XLSX 拖拽） | 否 | 否 | 完全无覆盖 |
| LLM 整理（staging → organize → adopt） | llm.test.ts 有 callLlm 单元测试 | 否 | 无端到端测试 |
| API key 保存/读取（keyring） | 否 | 否 | 完全无覆盖 |
| 删除页面 | 否 | 否 | 完全无覆盖 |
| 图谱交互（键盘/鼠标/筛选） | graph-filter-integration 有筛选测试 | 否 | 交互无 E2E |
| 缓存命中/失效 | 否 | 否 | 完全无覆盖 |
| Tauri 桌面运行时行为 | 否 | 否 | P4C ac-verifier 明确标注"盲区：Tauri 桌面运行时未实测" |

**关键缺口**：所有涉及 Tauri IPC（upload_file, call_llm_api, save/load_api_key, delete_page, call_mcp_tool）的功能均无自动化测试覆盖。单元测试仅覆盖纯函数和 store 逻辑，无法验证 IPC 参数序列化、Rust 端处理、keyring 交互等运行时行为。

---

## 问题 9：子 Agent 审核漏问题

### 9.1 上轮验证状态

../../docs/reports/2026-07-29-p5-acceptance-issues.md#L177-L182 "验证状态" 部分：

| 验证项 | 结果 | 证据 |
| --- | --- | --- |
| TypeScript 类型检查 | `tsc --noEmit` 无输出（通过） | 静态分析 |
| Rust 编译 | `cargo build` 通过（2 warnings 非本轮引入） | 静态分析 |
| HMR | 前端改动已热更新到运行中的 Tauri 应用 | 手动观察 |
| 安全审计 | guardrail-enforcer 通过（无阻断级漏洞） | 静态代码审查 |

### 9.2 跳过的强制步骤

| 步骤 | 是否执行 | 说明 |
| --- | --- | --- |
| TypeScript 类型检查 | 是 | tsc --noEmit |
| Rust 编译检查 | 是 | cargo build |
| guardrail-enforcer 安全审计 | 是 | 静态代码审查 |
| **Vitest 单元测试** | **未提及** | package.json 无 test 脚本，可能未运行 |
| **Playwright E2E** | **未执行** | 项目无 Playwright 配置 |
| **TRAE-debugger 运行时验证** | **未执行** | 无 debug 报告（r5/r6 为 P4 阶段，非 P5） |
| **Tauri 桌面环境测试** | **未执行** | HMR 仅验证前端渲染，未验证 IPC/keyring/parser 运行时 |

### 9.3 根因

1. **ac-verifier 的验证范围限于静态分析 + 单元测试**：P5 验收报告（../../docs/reports/2026-07-28-p5-integration-acceptance-acceptance.md）由 test-architect skill 产出，其验证方法为"后端 192 + 前端 143 = 335 测试用例"——全部是 Vitest 单元测试。6 项"阻断/无法自动验证"均标注为"手动测试项"但未实际执行。

2. **P4C ac-verifier 已明确标注盲区**：../../docs/reports/2026-07-27-p4c-ac-verifier.md 元信息中写明"盲区：Tauri 桌面运行时未实测、macOS 未验证、PDF 解析 DLL 未跑"。但这些盲区在 P5 验收时未被补齐。

3. **guardrail-enforcer 只做安全审计**：guardrail 报告检查的是代码安全漏洞（路径穿越、XSS、日志注入等），不覆盖功能正确性和运行时行为。

4. **无强制 E2E 门禁**：项目无 Playwright 配置，CI 无 E2E 步骤，ac-verifier 无 E2E 验证手段。P5 修复的 8 个问题（Bug-1 path traversal 误报、Bug-2 API key 丢失、UX-4 缓存等）均需 Tauri 桌面运行时验证，但仅通过 `tsc` + `cargo build` + 代码审查"通过"。

5. **r6 debug 报告的误导**：../../docs/reports/2026-07-28-p4-fix-r6-debug.md 使用 Playwright MCP 在**浏览器 dev 模式**下验证，使用 **mock 数据**，且记录的模型选项为旧值（"deepseek/claude/gpt"），与当前代码（"deepseek/glm/kimi"）不一致。该报告验证的是 P4 阶段代码，不能代表 P5 修复的运行时行为。

---

## 风险清单

| 风险 | 严重度 | 影响范围 | 证据 |
| --- | --- | --- | --- |
| LLM 整理只发送 200 字符 preview，完整内容丢失 | 阻断 | 所有 LLM 整理功能 | FileList.tsx L178 `file.preview` |
| 测试连接失败时 API key 不保存，用户无感知 | 高 | API key 管理 | SettingsPanel.tsx L96 仅 `result.ok` 时保存 |
| loadApiKey 吞掉 keyring 错误，无法区分"未保存"和"访问失败" | 高 | API key 读取诊断 | llm.ts L266-268 catch 返回 null |
| 缓存命中后后台刷新触发 ReactMarkdown 重渲染 | 中 | 预览界面性能 | MarkdownPreview.tsx L96 `setPage` |
| 缓存 key 不一致（.md 后缀）导致缓存未命中 | 中 | 预览界面性能 | MarkdownPreview.tsx L143 vs FileList.tsx L128 |
| 模型名硬编码，用户无法自定义 | 中 | LLM 灵活性 | lib.rs L912-921 + llm.ts L70-92 |
| delete_page 不删除 raw/ 原始文件 | 中 | 文档管理 | lib.rs L645 注释 + L655 仅 .md |
| 无 E2E 测试，IPC/keyring/parser 运行时行为无覆盖 | 中 | 质量保证 | package.json 无 test 脚本 + 无 Playwright |
| 初始 useState 为 mockPageDetail 导致闪烁 | 低 | 预览界面 UX | MarkdownPreview.tsx L68 |
| parser 不提取图片/不 OCR/不处理多栏 | 低 | PDF 解析完整性 | parse.py L55 `get_text("text")` |
