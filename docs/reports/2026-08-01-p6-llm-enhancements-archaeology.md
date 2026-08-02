# P6 LLM 增强能力源码考古与探查报告

| 项目 | 内容 |
| --- | --- |
| 任务令牌 | TKN-P6-ARCHAEOLOGY-001 |
| 执行 Agent | code-archaeologist |
| 日期 | 2026-08-01 |
| 考古范围 | LLM 集成层 / 领域分类系统 / 知识库检索系统 / Tauri 事件机制 |
| 项目根 | `D:\s0611\code\Continuous-learning` |
| 引用规约 | 全文使用相对路径引用代码（禁止 file:/// 绝对路径） |
| 设计背景 | [ADR-013](../../docs/decisions/ADR-013-p4-llm-integration-strategy.md) D2 明确将「流式响应、错误重试、成本控制」列为 LLM 接入的独立工作量，本报告即为该工作的前置考古 |

---

## 0. 系统架构速览

```text
React 前端 (webview)
  ├── components/         UI 组件（TopBar / CategoryTree / DropZone / FileList / SearchBar / ...）
  ├── store/              Zustand 状态（viewStore / llmStore / graphStore）
  ├── lib/llm.ts          LLM 调用封装 → Tauri IPC
  ├── lib/ipc.ts          Tauri IPC 封装（upload/list_staging/callMcpTool/...）
  └── types/index.ts      Domain 联合类型 + DOMAIN_COLORS/LABELS
        ↕ Tauri IPC (invoke)
Rust 后端 (src-tauri/src/lib.rs)
  ├── upload_file / list_staging / confirm/reject/delete   文件 staging 工作流
  ├── call_mcp_tool   spawn `node --import tsx cli.ts`      MCP 工具桥接（~200ms 启动开销/次）
  └── call_llm_api    reqwest → OpenAI 兼容端点            LLM 调用（一次性，无流式）
        ↕ spawn subprocess
Node MCP Server (server/src/)
  ├── tools/search.ts     kb_search（关键词子串匹配，非 BM25/向量）
  ├── tools/read-only.ts  kb_get_page / kb_list_categories / kb_health
  ├── tools/graph.ts      kb_get_graph
  └── cli.ts              CLI 入口（Zod 校验 → 调用 handler → stdout JSON）
```

**关键架构特征**：

- 前端不直接发 HTTP（CSP `connect-src 'self' ipc: http://ipc.localhost`，见 `frontend/src-tauri/tauri.conf.json`），所有外部请求经 Rust 中转
- API Key 经 `keyring` crate 存操作系统密钥环，不暴露到 webview（[ADR-013](../../docs/decisions/ADR-013-p4-llm-integration-strategy.md) V7）
- MCP 工具通过「每次 spawn Node 子进程」调用，无长驻 server 进程

---

## 1. 模块一：LLM 集成层

### 1.1 模块职责

将原始 markdown 内容发送给 OpenAI 兼容端点，返回结构化 wiki 页面。当前仅用于 staging 页面整理（一键 LLM 整理），不支持对话/问答。

**调用链**：

```text
FileList.handleOrganize (frontend/src/components/FileList.tsx:166)
  → loadApiKey(cloudProvider) (frontend/src/lib/llm.ts:281)
  → callMcpTool("kb_get_page") 获取完整 body (frontend/src/lib/ipc.ts:190)
  → organizeStagingPage (frontend/src/lib/llm.ts:379)
    → callLlm (frontend/src/lib/llm.ts:172)
      → invoke("call_llm_api") (Tauri IPC)
        → call_llm_api (frontend/src-tauri/src/lib.rs:1011)
          → reqwest::Client POST /chat/completions (一次性请求)
  → setOrganizeResult(content)  一次性塞入 modal
  → handleAdopt → updateStagingContent (写回 wiki 页面)
```

### 1.2 关键依赖

| 依赖 | 位置 | 用途 |
| --- | --- | --- |
| `reqwest` (rustls-tls) | `frontend/src-tauri/Cargo.toml` | HTTP 客户端，180s 超时 |
| `keyring` crate | `frontend/src-tauri/Cargo.toml` | API Key 跨平台密钥环存储 |
| `@tauri-apps/api/core` invoke | `frontend/src/lib/llm.ts:152` | 前端→Rust IPC 调用 |
| `useLlmStore` (Zustand) | `frontend/src/store/llmStore.ts` | LLM 模式/provider/baseUrl/model 全局状态（localStorage 持久化） |
| `PROVIDERS` 常量 | `frontend/src/lib/llm.ts:67` | 厂商默认配置（custom 为空，由用户填） |

### 1.3 请求/响应处理流程（重点：是否支持流式）

**`call_llm_api`**（`frontend/src-tauri/src/lib.rs:1011-1090`）：

```rust
// 请求体（L1047-1054）—— 无 stream 字段，一次性请求
let body = serde_json::json!({
    "model": effective_model,
    "messages": messages,
    // P5-R4: 已移除 max_tokens（大文件整理时内容被截断）
});

let resp = client.post(&url)
    .header("Authorization", format!("Bearer {}", api_key))
    .json(&body)
    .send().await?;   // 阻塞等待完整响应

let content = json["choices"][0]["message"]["content"].as_str()?;  // 一次性取完
```

| 维度 | 现状 | 证据 |
| --- | --- | --- |
| 流式 | **不支持**。请求体无 `stream: true`，用 `resp.json()` 一次性读取 | `lib.rs:1047` 请求体、`lib.rs:1080` 响应解析 |
| 错误处理 | HTTP 非 2xx → 返回错误消息（截断 500 字符）；JSON 解析失败 → 错误；missing content → 错误 | `lib.rs:1071-1089` |
| 重试 | **无任何重试机制**。网络抖动/限流直接返回错误 | `lib.rs:1061-1068` 单次 send |
| 超时 | 180s 硬编码 | `lib.rs:1057` |
| 成本控制 | **无**。已移除 `max_tokens`，无 token 计数，无费用估算 | `lib.rs:1050-1053` 注释说明移除原因 |
| 截断 | 无主动截断；依赖模型默认最大输出 | `lib.rs:1050-1053` |

### 1.4 LlmOrganizeModal 如何展示 LLM 结果

`LlmOrganizeModal`（`frontend/src/components/FileList.tsx:470-557`）：

```tsx
// 一次性渲染完整 content 到 <pre> 标签
<pre className="...whitespace-pre-wrap...">
  {content}
</pre>
```

- **不支持流式渲染**：`content` 是 `handleOrganize` 中 `await organizeStagingPage(...)` 的完整返回值（`FileList.tsx:200-212`），调用期间只显示 spinner（`organizing` 状态，`FileList.tsx:403-407`）
- 用户必须等待 LLM 完整返回后才能看到任何内容，大文件整理时 UI 长时间无反馈

### 1.5 API Key 加载和传递链路

```text
SettingsPanel (frontend/src/components/SettingsPanel.tsx:71)
  → loadApiKey(cloudProvider) (frontend/src/lib/llm.ts:281)
    → invoke("load_api_key", {provider})  ← Tauri IPC
      → load_api_key (lib.rs:1111)  ← keyring::Entry::get_password
    → 失败降级: localStorage.getItem(`llm-key-${provider}`)  ← base64 编码
    → "custom" 无 key 时尝试从 deepseek/glm/kimi 迁移 (llm.ts:309-340)
  → setApiKey(saved)  存入 SettingsPanel 局部 state

调用 LLM 时:
FileList.handleOrganize (FileList.tsx:181)
  → loadApiKey(cloudProvider)  重新从 keyring/localStorage 读取
  → organizeStagingPage(provider, apiKey, ...)  (llm.ts:379)
    → callLlm({provider, apiKey, ...})  (llm.ts:172)
      → invoke("call_llm_api", {provider, apiKey, prompt, ...})
        → call_llm_api(provider, api_key, ...)  (lib.rs:1012)
          → Authorization: Bearer {api_key}  (lib.rs:1063)
```

**注意**：API Key 不进 `llmStore`（敏感数据不进全局 store），每次调用时从 keyring 现取（`FileList.tsx:181`）。

### 1.6 潜在风险点

| 风险 | 位置 | 说明 |
| --- | --- | --- |
| 无重试导致偶发失败 | `lib.rs:1061` | 网络抖动/厂商限流（429）直接报错，用户需手动重试 |
| 180s 超时无进度反馈 | `lib.rs:1057` + `FileList.tsx:178` | 大文件整理时 spinner 转满 180s 无任何 token 输出，用户体验差 |
| 移除 max_tokens 无成本控制 | `lib.rs:1050` | 大量整理任务可能产生高额 API 费用，无用量追踪 |
| localStorage 降级存 base64 Key | `llm.ts:254` | keyring 失败时 API Key 以 base64 存 localStorage，非安全存储 |
| local-first 模式未实现 | `FileList.tsx:174-177` | `local-first` 模式直接报错"暂不支持"，Ollama 集成仅 UI 占位 |
| 错误消息可能泄露响应体 | `lib.rs:1076-1077` | 非 2xx 时返回前 500 字符响应体，可能含敏感信息 |

### 1.7 扩展点

> **流式响应扩展点**

1. **Rust 端**（`frontend/src-tauri/src/lib.rs:1011` `call_llm_api`）：
   - 请求体加 `"stream": true`
   - 改用 `reqwest::Response::bytes_stream()` 流式读取 SSE
   - **需新增 `app_handle: AppHandle` 参数**（当前签名无此参数，而 `upload_file`/`call_mcp_tool` 都有）
   - 逐 chunk 解析 `data: {...}` → `app_handle.emit("llm-token", chunk)` 推送前端
   - 结束时 `emit("llm-done", full_content)`

2. **前端监听**（`frontend/src/lib/llm.ts:172` `callLlm`）：
   - 改为返回一个异步迭代器或回调，内部用 `@tauri-apps/api/event` 的 `listen("llm-token", ...)` 接收
   - 新增 `callLlmStream(params, onToken)` 函数，保持 `callLlm` 向后兼容

3. **UI 渲染**（`frontend/src/components/FileList.tsx:470` `LlmOrganizeModal`）：
   - `content` state 改为增量拼接：`onToken(token) => setContent(prev => prev + token)`
   - `<pre>` 标签已支持增量渲染，只需让 content 逐步增长即可

> **重试扩展点**

- `lib.rs:1061` `client.post().send().await` 外层包重试循环（建议指数退避，最多 3 次，针对 429/5xx）

> **截断/成本控制扩展点**

- `lib.rs:1047` 请求体重新加回 `max_tokens`（可配置，默认值如 8192）
- 新增 token 用量统计：解析响应的 `usage.total_tokens`，emit 给前端显示

---

## 2. 模块二：领域分类系统

### 2.1 模块职责

管理知识库的领域分类，包括领域类型定义、颜色/标签映射、上传时领域选择、左侧分类树展示。

### 2.2 关键依赖

| 依赖 | 位置 | 用途 |
| --- | --- | --- |
| `Domain` 联合类型 | `frontend/src/types/index.ts:9-17` | 8 个硬编码领域 |
| `DOMAIN_COLORS` | `frontend/src/types/index.ts:35-44` | 领域→颜色映射 |
| `DOMAIN_LABELS` | `frontend/src/types/index.ts:47-56` | 领域→中文名映射 |
| `useViewStore.currentDomain` | `frontend/src/store/viewStore.ts:18` | 当前选中领域（全局状态） |
| `kb_list_categories` | `server/src/tools/read-only.ts:74` | 后端动态扫描 `wiki/` 目录返回领域列表 |

### 2.3 Domain 类型是硬编码还是可动态扩展？

**硬编码联合类型**（`frontend/src/types/index.ts:9-17`）：

```typescript
export type Domain =
  | "kb-system"
  | "coding"
  | "resources"
  | "design"
  | "emotions"
  | "reading"
  | "academic"
  | "life";
```

- `DOMAIN_COLORS` 和 `DOMAIN_LABELS` 都是 `Record<Domain, string>`，与联合类型**强绑定**
- 后端 `kb_list_categories`（`server/src/tools/read-only.ts:80-84`）是动态扫描 `wiki/` 目录，返回**任意**领域名
- `CategoryTree.tsx:56-64` 用 `c.name as Domain` 强转后查 `DOMAIN_COLORS`/`DOMAIN_LABELS`，找不到时 fallback 到 `#888` / 原名

**实际 wiki 目录**（6 个，缺 `academic` 和 `life`）：

```text
coding / design / emotions / kb-system / reading / resources
```

### 2.4 新增/修改/删除领域需要改动哪些文件？

| 步骤 | 文件 | 改动 |
| --- | --- | --- |
| 1 | `wiki/<new-domain>/` | 新建目录 |
| 2 | `frontend/src/types/index.ts:9` | `Domain` 联合类型加 `\| "new-domain"` |
| 3 | `frontend/src/types/index.ts:35` | `DOMAIN_COLORS` 加配色 |
| 4 | `frontend/src/types/index.ts:47` | `DOMAIN_LABELS` 加中文名 |
| 5 | `AGENTS.md` §8.1 | 领域说明表追加行 |
| 6 | `index.md` | 新增 `## <new-domain>` 分组标题 |
| 7 | 无需改 `CategoryTree.tsx` | 它从后端动态加载（`CategoryTree.tsx:42`） |
| 8 | 无需改 `DropZone.tsx` | 领域来自 `currentDomain` state |

### 2.5 上传时领域如何确定？

`DropZone.tsx:78`：

```typescript
const domain: Domain = currentDomain ?? "coding";
```

- **用户选择**：用户在左侧 `CategoryTree` 点击领域 → `setDomain()` 写入 `viewStore.currentDomain`
- **默认值**：未选择时硬编码默认 `"coding"`，并显示警告（`DropZone.tsx:229-232`）
- **无 LLM 自动分类**：领域完全由用户在上传前手动选择

### 2.6 index.md 中领域分组如何维护？

`index.md` 采用 `## <domain>` 二级标题分组（`index.md:9, 21, 42, 49`），由 **Agent ingest 时手动追加**（[AGENTS.md](../../AGENTS.md) §4.2 步骤 6：「更新 `index.md`：在对应领域分组下追加新页面条目」）。无自动化同步机制。

### 2.7 潜在风险点

| 风险 | 位置 | 说明 |
| --- | --- | --- |
| Domain 硬编码与后端动态扫描脱节 | `types/index.ts:9` vs `read-only.ts:80` | 后端扫描出 `types` 未定义的领域时，颜色/标签 fallback 到默认值，UI 不一致 |
| `as Domain` 强转不安全 | `CategoryTree.tsx:57` | 后端返回任意 string 直接 `as Domain`，绕过类型检查 |
| 默认领域 "coding" 硬编码 | `DropZone.tsx:78` | 未选择领域时所有文件默认归入编程，与其他领域不相关的内容也会进 coding |
| index.md 手动维护易遗漏 | `AGENTS.md` §4.2 | 新增页面可能忘记更新 index.md，导致内容索引过时 |

### 2.8 扩展点

> **LLM 自动分类扩展点**

1. **新增 IPC 命令** `classify_domain`（`frontend/src-tauri/src/lib.rs`）：
   - 接收文件标题 + 预览内容
   - 调用 LLM 返回领域名（限定白名单）
   - 复用 `call_llm_api` 的 provider/apiKey 链路

2. **DropZone 上传流程**（`frontend/src/components/DropZone.tsx:75` `handleUpload`）：
   - `upload_file` 成功后，若 `currentDomain === null`，调用 `classify_domain` 自动推断
   - 返回结果让用户确认或自动填入

3. **领域白名单**：从后端 `kb_list_categories` 动态获取已有领域 + AGENTS.md 定义的标准领域，拼成 prompt 让 LLM 选择

> **领域动态扩展扩展点**

- `types/index.ts:9` `Domain` 改为 `string` 别名（`export type Domain = string`）
- `DOMAIN_COLORS`/`DOMAIN_LABELS` 改为 `Record<string, string>` + 后端返回领域时附带颜色/标签
- 或保持硬编码但增加「未识别领域」的统一 fallback 样式

---

## 3. 模块三：知识库检索系统

### 3.1 模块职责

提供知识库内容检索能力，供 SearchBar 组件（搜索跳转）和未来 RAG 对话使用。

### 3.2 关键依赖

| 依赖 | 位置 | 用途 |
| --- | --- | --- |
| `kbSearch` | `server/src/tools/search.ts:35` | 检索入口 |
| `kbGetPage` | `server/src/tools/read-only.ts:176` | 获取完整页面 |
| `callMcpTool` | `frontend/src/lib/ipc.ts:190` | 前端→MCP 工具桥接 |
| `SearchBar` | `frontend/src/components/SearchBar.tsx:19` | 搜索 UI（下拉列表） |
| `cli.ts` TOOL_REGISTRY | `server/src/cli.ts:74` | 工具名→handler 映射 |

### 3.3 kb_search 的输入输出格式与检索能力

**输入**（`server/src/schemas.ts:12-26`）：

```typescript
{ query: string, domain?: string, limit?: number }  // limit 默认 10，最大 50
```

**输出**（`server/src/tools/search.ts:28-33`）：

```typescript
{ results: [{ path: string, title: string, snippet: string, score: number }] }
```

**检索算法**（`server/src/tools/search.ts:43-101`）—— **简单关键词子串匹配，非 BM25/向量/重排**：

```typescript
// tokenize: 按标点空白分词，CJK 整段保留（无分词）
const terms = tokenize(query);

// 评分: title 匹配权重 3x，body 匹配权重 1x
for (const term of terms) {
  if (titleLower.includes(term)) score += TITLE_WEIGHT;   // 3
  score += BODY_WEIGHT * countOccurrences(bodyLower, term); // 1 × 次数
}
```

| 维度 | 现状 | AGENTS.md 目标 |
| --- | --- | --- |
| BM25 | **未实现** | §5.1 中规模（200-5000页）应有 BM25 |
| 向量检索 | **未实现** | §5.1 大规模（>5000页）应有 LanceDB 向量 |
| 重排 | **未实现** | §5.1 中规模应有重排 |
| 当前策略 | 全量扫描 + 子串匹配（<200 页适用） | §5.1 小规模策略 |

### 3.4 检索结果是否包含足够上下文供 LLM 回答？

**不够**。`kb_search` 只返回 `snippet`（200 字符摘要，`search.ts:25`）。要做 RAG 需要：

1. `kb_search` 获取 top-N 结果路径
2. 对每个路径调用 `kb_get_page`（`read-only.ts:176`）获取完整 `body`
3. 拼接 body 作为 context 传给 LLM

**注意副作用**：`kb_get_page` 每次调用会自增 `use_count` 并写回文件（`read-only.ts:205-215`），RAG 场景批量调用会导致大量文件写操作。

### 3.5 是否有现成的搜索/问答 UI 组件可复用？

| 组件 | 位置 | 能力 | 可复用性 |
| --- | --- | --- | --- |
| `SearchBar` | `frontend/src/components/SearchBar.tsx:19` | 关键词搜索 + 下拉结果列表 + 点击跳转预览 | **搜索框可复用**；但非对话 UI，需新建对话组件 |
| 无对话组件 | — | 项目中无任何 chat/conversation 组件 | **需新建** |

`SearchBar` 已实现：Cmd/Ctrl+K 聚焦（`SearchBar.tsx:30`）、debounce 300ms（`SearchBar.tsx:52`）、调用 `callMcpTool("kb_search")`（`SearchBar.tsx:55`）。

### 3.6 MCP server 如何被 Tauri 后端调用？

`call_mcp_tool`（`frontend/src-tauri/src/lib.rs:836-959`）：

```rust
// 白名单校验（lib.rs:851-863）
const TOOL_WHITELIST: &[&str] = &["kb_search", "kb_get_page", ...];

// spawn 子进程（lib.rs:895-908）
let output = app_handle.shell()
    .command("node")
    .args(["--import", "tsx", &cli_path, &tool_name, &args_json])
    .current_dir(&server_dir)
    .output().await?;

// 解析 stdout JSON（lib.rs:916-958）
// exit 0 = 成功, exit 2 = 工具级错误, exit 1 = 子进程崩溃
```

- 每次调用 spawn 一个新 Node 进程，**~200ms 启动开销**（`cli.ts:23` 注释）
- `args_json` 作为单个 argv 元素传递，无 shell 注入风险
- 前端封装：`callMcpTool(toolName, args)`（`frontend/src/lib/ipc.ts:190`）

### 3.7 潜在风险点

| 风险 | 位置 | 说明 |
| --- | --- | --- |
| 子串匹配无语义理解 | `search.ts:84-87` | "异步" 搜不到 "async"，无同义词/语义近似 |
| CJK 无分词 | `search.ts:113-118` | 中文查询整段作为一个 term，"Python异步编程" 只能精确子串匹配 |
| kb_get_page 副作用 | `read-only.ts:205-215` | RAG 批量检索会触发大量 use_count 写操作，影响性能 |
| 200ms × N 次子进程开销 | `lib.rs:895` | RAG 对话每次需 kb_search + N×kb_get_page，累计延迟显著 |
| 搜索结果无分页 | `search.ts:101` | 仅 `slice(0, limit)`，无 offset 分页 |

### 3.8 扩展点

> **RAG 对话扩展点**

1. **新建对话组件** `frontend/src/components/ChatPanel.tsx`：
   - 消息列表（user/assistant）+ 输入框
   - 复用 `callMcpTool("kb_search")` 检索 + `callMcpTool("kb_get_page")` 取完整内容
   - 调用 `callLlm` / `callLlmStream` 生成回答

2. **检索增强**（`server/src/tools/search.ts`）：
   - 新增 `kb_search_rag` 工具：内部先 kb_search 再批量 kb_get_page，返回拼接 context
   - 或在前端编排：先 search 再 get_page（当前架构更简单）

3. **对话窗口位置**（`frontend/src/App.tsx:82` MainContent）：
   - 方案 A：新增 `"chat"` 视图（`ViewName` 加 `"chat"`，`App.tsx:102` MainContent 加分支）
   - 方案 B：右侧栏 `RightPanel`（`App.tsx:138`）加对话面板
   - 方案 C：独立 modal（类似 `SettingsPanel`）

> **检索质量扩展点**

- `search.ts:84` 评分逻辑可替换为 BM25（引入 `rank-bm25` 或手写）
- 中规模可引入向量检索（`server/src/` 新增 embedding + LanceDB）
- 但当前知识库 ~37 页（`index.md:3`），小规模策略足够，无需过度工程

---

## 4. 模块四：Tauri 事件机制

### 4.1 模块职责

提供 Rust 后端 → React 前端的事件推送能力，是流式 token 推送的基础设施。

### 4.2 关键依赖

| 依赖 | 位置 | 用途 |
| --- | --- | --- |
| `tauri = "2"` | `frontend/src-tauri/Cargo.toml` | Tauri v2 核心（事件系统内置） |
| `tauri-plugin-shell` | `frontend/src-tauri/Cargo.toml` | spawn 子进程（已用于 call_mcp_tool） |
| `capabilities/default.json` | `frontend/src-tauri/capabilities/default.json` | 权限配置 |

### 4.3 Tauri v2 是否支持后端向前端推送事件？

**支持**。Tauri v2 内置事件系统：

- 后端：`app_handle.emit("event-name", payload)` 或 `window.emit(...)`
- 前端：`import { listen } from "@tauri-apps/api/event"` → `listen("event-name", callback)`

**但当前代码完全未使用自定义事件推送**。全项目搜索 `emit`/`listen`（Tauri 事件 API）结果：

| 使用点 | 类型 | 说明 |
| --- | --- | --- |
| `DropZone.tsx:51` `webview.onDragDropEvent` | Tauri webview 内置事件 | 拖拽文件事件，非自定义推送 |
| `App.tsx:57` `window.addEventListener` | DOM 事件 | 键盘快捷键，非 Tauri 事件 |
| 其余 | DOM 事件 | 无任何 `app_handle.emit` 或 `@tauri-apps/api/event` 的 `listen` |

### 4.4 现有代码是否已使用事件机制？

**否**。所有 IPC 都是「前端 invoke → 后端返回」的请求/响应模式，无后端主动推送。

### 4.5 capabilities 配置

`frontend/src-tauri/capabilities/default.json`：

```json
{
  "permissions": [
    "core:default",        // 包含 core:event:default（emit/listen 权限）
    "opener:default",
    "shell:allow-execute",
    "shell:allow-open",
    "dialog:default",
    "dialog:allow-open"
  ]
}
```

- `core:default` 在 Tauri v2 中包含事件监听权限（`core:event:allow-listen`）
- 后端 `emit` 不需要额外权限配置
- **结论：事件推送基础设施已就绪，无需修改 capabilities**

### 4.6 潜在风险点

| 风险 | 位置 | 说明 |
| --- | --- | --- |
| call_llm_api 无 AppHandle 参数 | `lib.rs:1012` | 无法调用 `emit`，需新增参数 |
| 事件名无命名规范 | — | 需约定 `llm-token`/`llm-done`/`llm-error` 等事件名 |
| 流式 chunk 顺序保证 | — | Tauri emit 是有序的，但需确保 Rust 端按序 emit |

### 4.7 扩展点

> **流式 token 推送扩展点**

1. **Rust 端**（`frontend/src-tauri/src/lib.rs:1011` `call_llm_api`）：

   ```rust
   // 签名加 app_handle
   async fn call_llm_api(
       app_handle: AppHandle,   // ← 新增
       provider: String,
       // ...
   ) -> Result<String, String> {
       // 请求体加 "stream": true
       // resp.bytes_stream() 逐 chunk 读取 SSE
       // 解析 "data: {json}" → emit("llm-token", delta)
       // 结束 emit("llm-done", full_content)
   }
   ```

2. **前端监听**（新增 `frontend/src/lib/llm.ts` 函数）：

   ```typescript
   import { listen } from "@tauri-apps/api/event";

   export async function callLlmStream(
     params: LlmCallParams,
     onToken: (token: string) => void,
   ): Promise<LlmCallResult> {
     const unlisten = await listen<string>("llm-token", (event) => {
       onToken(event.payload);
     });
     const result = await callLlm(params);  // invoke 触发流式
     unlisten();
     return result;
   }
   ```

3. **注册 handler**（`lib.rs:1146` `invoke_handler`）：
   - `call_llm_api` 已注册，签名变更后自动生效（Tauri 自动注入 `AppHandle`）

---

## 5. 扩展点汇总表

| 增强能力 | 扩展位置（相对路径:行号） | 改动要点 |
| --- | --- | --- |
| **流式 token 推送** | `frontend/src-tauri/src/lib.rs:1011` (call_llm_api) | 加 `app_handle` 参数 + `stream:true` + `bytes_stream()` + `emit("llm-token")` |
| **流式前端监听** | `frontend/src/lib/llm.ts:172` (callLlm) | 新增 `callLlmStream(params, onToken)`，用 `@tauri-apps/api/event` 的 `listen` |
| **流式 UI 渲染** | `frontend/src/components/FileList.tsx:470` (LlmOrganizeModal) | `content` state 增量拼接 `onToken(t => setContent(p => p+t))` |
| **错误重试** | `frontend/src-tauri/src/lib.rs:1061` (send().await) | 外层包重试循环（指数退避，3 次，针对 429/5xx） |
| **成本控制/截断** | `frontend/src-tauri/src/lib.rs:1047` (请求体) | 加回 `max_tokens`（可配置）+ 解析 `usage.total_tokens` 统计 |
| **LLM 自动分类** | `frontend/src/components/DropZone.tsx:75` (handleUpload) | upload 成功后若未选领域，调用 LLM 推断领域 |
| **领域动态扩展** | `frontend/src/types/index.ts:9` (Domain 联合类型) | 改为 `string` 别名或新增领域时同步改 3 处常量 |
| **RAG 对话检索** | `server/src/tools/search.ts:35` (kbSearch) | 新增 `kb_search_rag` 或前端编排 search+get_page |
| **对话窗口 UI** | `frontend/src/App.tsx:102` (MainContent) | `ViewName` 加 `"chat"`，新增 `ChatPanel.tsx` 组件 |
| **对话输入框** | `frontend/src/components/SearchBar.tsx:19` | 可复用搜索框样式，但需新建对话消息列表组件 |

---

## 6. 风险点汇总

| 风险 | 模块 | 严重度 | 位置 |
| --- | --- | --- | --- |
| 无重试机制，偶发失败需手动重试 | LLM | 高 | `frontend/src-tauri/src/lib.rs:1061` |
| 180s 超时无进度反馈 | LLM | 高 | `frontend/src-tauri/src/lib.rs:1057` + `frontend/src/components/FileList.tsx:178` |
| 移除 max_tokens 无成本控制 | LLM | 中 | `frontend/src-tauri/src/lib.rs:1050` |
| localStorage 降级存 base64 API Key | LLM | 中 | `frontend/src/lib/llm.ts:254` |
| local-first 模式未实现 | LLM | 中 | `frontend/src/components/FileList.tsx:174` |
| Domain 硬编码与后端动态扫描脱节 | 领域 | 中 | `frontend/src/types/index.ts:9` vs `server/src/tools/read-only.ts:80` |
| `as Domain` 强转不安全 | 领域 | 低 | `frontend/src/components/CategoryTree.tsx:57` |
| 默认领域 "coding" 硬编码 | 领域 | 低 | `frontend/src/components/DropZone.tsx:78` |
| 检索无语义理解/CJK 无分词 | 检索 | 中 | `server/src/tools/search.ts:84,113` |
| kb_get_page 检索副作用（use_count 写） | 检索 | 中 | `server/src/tools/read-only.ts:205` |
| MCP 子进程 200ms×N 累计延迟 | 检索 | 中 | `frontend/src-tauri/src/lib.rs:895` |
| call_llm_api 无 AppHandle 无法 emit | 事件 | 高 | `frontend/src-tauri/src/lib.rs:1012` |

---

## 7. 推荐实施路径

基于考古发现，建议 P6 增强按以下顺序实施（依赖关系从下到上）：

```text
第一步：Tauri 事件基础设施
  └─ call_llm_api 加 AppHandle 参数 + emit 能力
     （前置：所有流式功能的基础）

第二步：流式响应 + 重试
  └─ call_llm_api 加 stream:true + bytes_stream + 重试循环
  └─ 前端 callLlmStream + LlmOrganizeModal 流式渲染
     （用户可感知的体验提升）

第三步：成本控制
  └─ 请求体加 max_tokens + usage 统计
     （防止高额费用）

第四步：LLM 自动分类
  └─ classify_domain IPC + DropZone 集成
     （减少手动操作）

第五步：RAG 对话
  └─ ChatPanel 组件 + kb_search + kb_get_page 编排 + callLlmStream
     （最大工作量，依赖前四步）
```

---

*报告结束。所有结论均可在引用的源文件中复现验证。*
