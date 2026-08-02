# P6 LLM 增强能力决策计划文档

| 项目 | 内容 |
| --- | --- |
| 任务令牌 | TKN-P6-DECISION-001 |
| 日期 | 2026-08-01 |
| 状态 | **已审批**（Approved） |
| 前置考古 | [2026-08-01-p6-llm-enhancements-archaeology.md](2026-08-01-p6-llm-enhancements-archaeology.md) |
| 设计依据 | [ADR-013](../decisions/ADR-013-p4-llm-integration-strategy.md) D2/D4/D6 |
| 引用规约 | 全文使用相对路径引用代码（禁止 file:/// 绝对路径） |

---

## 0. 执行摘要

本文档针对用户提出的 7 项 LLM 增强需求进行可行性判定与方案设计。经源码考古与网络调研，结论如下：

| # | 需求 | 可行性 | 是否提出异议 | 工作量 | 建议阶段 |
| --- | --- | --- | --- | --- | --- |
| 1 | 流式响应（Streaming） | ✅ 可行 | 否 | 中 | P6-R1 |
| 2 | 错误重试机制 | ✅ 可行 | 否 | 小 | P6-R1 |
| 3 | finish_reason 截断检测 | ✅ 可行 | 否 | 小 | P6-R1 |
| 4 | 降级方案 | ⚠️ 部分可行 | **是** | 中 | P6-R2 |
| 5 | 成本控制 | ✅ 可行 | 否 | 小 | P6-R1 |
| 6 | LLM 自动分类（含增删改权限） | ⚠️ 部分可行 | **是** | 中 | P6-R3 |
| 7 | RAG 对话窗口 | ✅ 可行 | 否（附注） | 大 | P6-R4 |

**核心异议摘要**（详见 §3）：

1. **降级方案**：完整的 local-first（Ollama）降级是独立大工作量，当前完全未实现。本次只实现 cloud 模式内的优雅降级（流式→非流式、重试→单次、限流→提示切换厂商），Ollama 集成推迟到 P7。
2. **LLM 自动分类的增删改权限**：给予 LLM 自主新增/修改/删除分类的权限风险过高（幻觉可能删除重要分类，且分类属 schema 层应由人治理）。改为「LLM 建议 + 用户确认」模式：LLM 可推荐领域并**提议**新分类，但创建/删除必须用户显式确认。

---

## 1. 项目现状基线（考古结论摘要）

基于 [考古报告](2026-08-01-p6-llm-enhancements-archaeology.md)，当前 LLM 集成层的关键事实：

| 维度 | 现状 | 证据 |
| --- | --- | --- |
| 调用方式 | 一次性请求/响应，无流式 | `frontend/src-tauri/src/lib.rs:1047` 请求体无 `stream` 字段 |
| 重试 | 无任何重试机制 | `frontend/src-tauri/src/lib.rs:1061` 单次 `send().await` |
| 截断检测 | 无 | `lib.rs:1080` 直接取 `content`，不检查 `finish_reason` |
| 成本控制 | 无（P5-R4 已移除 max_tokens） | `lib.rs:1050` 注释说明移除原因 |
| 事件机制 | Tauri v2 事件系统就绪但完全未用 | 全项目无 `app_handle.emit` / `listen` |
| `call_llm_api` 签名 | 无 `AppHandle` 参数，无法 emit | `lib.rs:1012` |
| 领域分类 | 硬编码 8 域联合类型，无 LLM 自动分类 | `frontend/src/types/index.ts:9` |
| 检索能力 | 关键词子串匹配（非 BM25/向量） | `server/src/tools/search.ts:84` |
| 知识库规模 | ~37 页（小规模，<200） | `index.md:3` |
| local-first | 仅 UI 占位，未实现 | `frontend/src/components/FileList.tsx:174` 直接报错 |

---

## 2. 可行性判定与异议

### 2.1 流式响应（Streaming）— ✅ 可行

**判定**：完全可行，基础设施已就绪。

**依据**：

- Tauri v2 内置事件系统，`capabilities/default.json` 的 `core:default` 已含 `core:event:allow-listen` 权限（考古 §4.5）
- Rust `reqwest` 支持 `Response::bytes_stream()` 流式读取 SSE
- 前端 `@tauri-apps/api/event` 的 `listen` 可接收后端 emit
- `<pre>` 标签天然支持增量内容渲染

**网络调研结论**：Tauri 官方 recipes 与社区实践均确认 reqwest stream + `app_handle.emit` 是 Tauri v2 流式响应的标准方案。

### 2.2 错误重试机制 — ✅ 可行

**判定**：完全可行，标准模式。

**依据**：

- 指数退避 + 抖动（exponential backoff with jitter）是业界共识
- 针对 429（限流）尊重 `Retry-After` 响应头
- 针对 5xx（服务端错误）自动重试
- 针对 4xx（客户端错误，除 429）不重试（请求有问题，重试无意义）

**网络调研结论**：OpenAI SDK、Anthropic SDK 均采用此模式，Rust 生态有 `backoff` crate 可选，但手写循环更轻量且无新依赖。

### 2.3 finish_reason 截断检测 — ✅ 可行

**判定**：完全可行，实现简单。

**依据**：

- OpenAI 兼容 API 响应含 `finish_reason` 字段：`stop`（正常结束）、`length`（达到 max_tokens 截断）、`tool_calls`（工具调用）、`content_filter`（内容过滤）
- P5-R4 移除 max_tokens 后，截断主要由模型上下文上限触发，但仍需检测
- 检测到 `length` 时，可提示用户「内容可能不完整」或自动续写

### 2.4 降级方案 — ⚠️ 部分可行（提出异议）

**判定**：cloud 模式内的降级可行；完整的 cloud→local 降级**不可行**（本次范围内）。

> **⚠️ 异议：完整的 local-first（Ollama）降级不在本次范围**

**理由**：

1. **当前 local-first 完全未实现**：`FileList.tsx:174` 直接报错"暂不支持"，Rust 端 `call_llm_api` 不区分模式，无 Ollama HTTP 调用代码
2. **Ollama 集成是独立大工作量**：涉及检测 Ollama 是否运行、模型是否拉取、不同的 API 格式（Ollama 非 OpenAI 兼容部分）、本地资源管理
3. **ADR-013 D6 将 local-first 列为独立模式**，非降级目标，强行耦合会增加复杂度
4. **用户期望的降级可能是「cloud 失败时自动切 local」**，但这需要 local 模式已就绪才有意义

**本次实现的降级范围**（cloud 模式内）：

| 降级路径 | 触发条件 | 行为 |
| --- | --- | --- |
| 流式 → 非流式 | SSE 连接失败/解析错误 | 回退到一次性请求 |
| 重试 → 单次 | 重试次数耗尽 | 返回最后一次错误 |
| 限流 → 提示切换 | 429 且 Retry-After 过长 | 提示用户切换其他厂商 |
| cloud → disabled | API Key 缺失/无效 | 明确报错，不静默失败 |

**推迟到 P7**：Ollama local-first 完整集成（独立的 ADR + 实施计划）。

### 2.5 成本控制 — ✅ 可行

**判定**：完全可行，但需谨慎处理与 P5-R4 移除 max_tokens 的关系。

**依据**：

- OpenAI 兼容 API 响应含 `usage.total_tokens` / `usage.prompt_tokens` / `usage.completion_tokens`
- 可在 Rust 端解析 usage 并 emit 给前端显示
- 可配置 `max_tokens` 上限（用户可选启用）

> **与 P5-R4 的协调**：P5-R4 移除 max_tokens 是因为硬编码 4096 导致大文件截断。成本控制方案改为：
>
> - `max_tokens` 改为**用户可选配置**（默认不设上限，用户可启用并设值）
> - 强制解析 `usage` 统计 token 消耗
> - 前端显示每次调用的 token 用量与累计用量
> - 提供「日累计上限告警」（软限制，超限提示而非硬中断）

### 2.6 LLM 自动分类（含增删改权限）— ⚠️ 部分可行（提出异议）

**判定**：LLM 推荐领域可行；**给予 LLM 自主增删改分类权限不可行**（反对）。

> **⚠️ 异议：不应给予 LLM 自主新增/修改/删除分类的权限**

**理由**：

1. **分类是 schema 层，应由人治理**
   - [AGENTS.md](../../AGENTS.md) §8.1 明确：「`wiki/` 下每个一级目录是一个领域」，领域定义属于知识库 schema
   - AGENTS.md §11：「Schema 演进由用户与 Agent 共同演进，重大变更需通过 PR」
   - 让 LLM 自主改分类等于让 LLM 改 schema，违背 schema 治理原则

2. **幻觉风险**
   - LLM 可能幻觉出无意义分类名（如 `misc`、`other`、`temp`）
   - LLM 可能「合并」或「删除」它认为「重复」的分类，导致已有页面孤儿化
   - 删除分类目录会导致该分类下所有页面的物理路径失效

3. **不可逆操作风险**
   - 文件系统删除是不可逆的（除非有 git），LLM 自主删除分类目录可能造成数据丢失
   - 即使有 git 回滚，频繁的分类变动会污染提交历史

4. **已有约束**
   - [AGENTS.md](../../AGENTS.md) §9.3 禁止行为：「❌ 跳过 frontmatter 直接写 wiki 页」「❌ 删除旧声明」
   - 赋予 LLM 自主分类操作会违反这些约束

**替代方案：LLM 建议 + 用户确认**（推荐）：

| 能力 | LLM 角色 | 用户角色 |
| --- | --- | --- |
| 文档归类 | LLM 分析内容后**推荐**最匹配的已有领域 | 用户确认或改选 |
| 提议新分类 | LLM 若认为无合适领域，可**提议**新分类名+描述 | 用户决定是否创建 |
| 修改分类 | LLM 检测到分类不合理时可**提示** | 用户决定是否调整 |
| 删除分类 | **不支持 LLM 发起** | 仅用户手动操作（需二次确认） |

**实现方式**：

- 新增 `classify_domain` IPC 命令：输入文件标题+预览内容，输出推荐领域+置信度+（可选）新分类提议
- DropZone 上传后若用户未选领域，调用 `classify_domain` 自动推荐，用户可一键接受或改选
- 领域白名单从后端 `kb_list_categories` 动态获取（已有领域）+ AGENTS.md 标准领域
- 新分类提议在前端显示「LLM 建议新建分类：xxx，是否创建？」按钮，用户点击才真正创建目录

### 2.7 RAG 对话窗口 — ✅ 可行（附注）

**判定**：完全可行，但需明确检索策略。

**依据**：

- 现有 `kb_search`（关键词匹配）+ `kb_get_page`（取完整内容）+ `callLlm`（LLM 生成）三件套已足够实现 RAG
- 新建 `ChatPanel` 组件即可，无需引入额外依赖
- Tauri 事件机制（P6-R1 实现）可用于对话流式响应

> **附注：无需向量检索**

**理由**：

1. **当前知识库 ~37 页**，属 AGENTS.md §5.1 的「小规模（<200 页）」
2. AGENTS.md §5.1 明确：「小规模用 index.md 导航」，关键词检索足够
3. 引入 FAISS/LanceDB + embedding 模型会：
   - 突破 ADR-001「核心依赖 ≤5」原则
   - 增加 embedding API 调用成本（或本地模型体积）
   - 增加索引维护复杂度（增量更新、重建）
4. **当知识库增长到 200+ 页时再评估**引入向量检索

**RAG 实现策略**（前端编排，无需改 MCP server）：

```text
用户提问
  → callMcpTool("kb_search", {query: 用户问题, limit: 5})  检索 top-5 相关页
  → 对每个结果 callMcpTool("kb_get_page", {path})  获取完整 body
  → 拼接 context：将 5 个页面的 title+body 作为参考资料
  → 构造 prompt：system「根据以下参考资料回答用户问题，引用来源路径」+ context + 用户问题
  → callLlmStream 生成回答（流式渲染）
  → 回答中标注引用：[[wiki/xxx/page]] 形式
```

**注意副作用**：`kb_get_page` 每次调用自增 `use_count` 并写回文件（考古 §3.4）。RAG 批量检索会触发 5 次文件写。**缓解**：新增 `kb_get_page_noop` 或在 `kb_get_page` 加 `increment_use_count: bool` 参数，RAG 场景设为 false。或接受此副作用（RAG 检索本身也是「使用」，use_count +1 合理）。

---

## 3. 异议详述

### 3.1 异议一：降级方案范围

**用户原话**：「6. 降级方案」

**我的异议**：完整的 cloud→local 降级需要 local-first（Ollama）模式已实现，但当前 local-first 仅 UI 占位（`FileList.tsx:174` 直接报错"暂不支持"）。Ollama 集成是独立大工作量，涉及：

- 检测 Ollama 服务是否运行（`http://localhost:11434/api/tags`）
- 模型管理与拉取提示
- Ollama API 与 OpenAI 兼容 API 的差异处理
- 本地资源（CPU/GPU/内存）管理

**建议**：

- 本次（P6）实现 cloud 模式内的优雅降级（见 §2.4 表格）
- P7 单独立项实现 local-first Ollama 集成
- 届时再实现 cloud↔local 自动降级

**请用户确认**：是否同意将完整 local-first 降级推迟到 P7？

### 3.2 异议二：LLM 自主分类权限

**用户原话**：「给予LLM新增，修改和删除分类的权限」

**我的异议**：给予 LLM 自主增删改分类权限风险过高，理由见 §2.6。核心风险：

1. 幻觉导致无意义分类或误删
2. 删除分类目录导致页面路径失效
3. 违背 AGENTS.md schema 治理原则（§8.1、§11）
4. 不可逆操作无安全网

**建议**：改为「LLM 建议 + 用户确认」模式（见 §2.6 表格）。LLM 可以推荐领域、提议新分类，但所有写操作（创建目录、删除目录、移动页面）必须用户显式确认。

**请用户确认**：是否同意采用「LLM 建议 + 用户确认」模式替代「LLM 自主增删改」？

---

## 4. 实施方案详述

### 4.1 P6-R1：流式响应 + 重试 + 截断检测 + 成本控制（基础层）

**目标**：改造 `call_llm_api` 为流式+重试+可观测的 LLM 调用基础设施。

#### 4.1.1 Rust 端改造（`frontend/src-tauri/src/lib.rs`）

**改造点 1：`call_llm_api` 签名加 `AppHandle`**

```rust
#[tauri::command]
async fn call_llm_api(
    app_handle: AppHandle,   // ← 新增，Tauri 自动注入
    provider: String,
    api_key: String,
    prompt: String,
    system_prompt: Option<String>,
    base_url: Option<String>,
    model: Option<String>,
    stream: Option<bool>,        // ← 新增，是否流式（默认 true）
    max_tokens: Option<u32>,     // ← 新增，可选上限
) -> Result<LlmResponse, String> {
    // ...
}
```

**改造点 2：请求体加 `stream: true` + 可选 `max_tokens`**

```rust
let mut body = serde_json::json!({
    "model": effective_model,
    "messages": messages,
    "stream": stream.unwrap_or(true),  // 默认流式
});
if let Some(mt) = max_tokens {
    body["max_tokens"] = serde_json::json!(mt);
}
```

**改造点 3：重试循环（指数退避 + 抖动）**

```rust
let max_retries = 3;
let mut attempt = 0;
let mut last_error = String::new();

loop {
    attempt += 1;
    match send_llm_request(&client, &url, &api_key, &body, stream.unwrap_or(true), &app_handle).await {
        Ok(resp) => return Ok(resp),
        Err(e) if is_retryable(&e) && attempt <= max_retries => {
            let delay = compute_backoff(attempt, &e);  // 429 尊重 Retry-After
            app_handle.emit("llm-retry", &RetryEvent { attempt, delay_ms: delay, error: &e })?;
            tokio::time::sleep(Duration::from_millis(delay)).await;
            last_error = e;
        }
        Err(e) => return Err(e),
    }
}
```

**可重试错误判定**：HTTP 429、5xx、网络超时、连接重置。不重试：4xx（除 429）、API Key 无效。

**改造点 4：流式 SSE 解析 + emit**

```rust
let mut response = client.post(&url)
    .header("Authorization", format!("Bearer {}", api_key))
    .json(&body)
    .send().await?;

let mut full_content = String::new();
let mut stream = response.bytes_stream();
while let Some(chunk) = stream.next().await {
    let chunk = chunk?;
    // 解析 SSE: "data: {json}\n\n"
    for line in chunk.split(|b| *b == b'\n') {
        if let Some(json_str) = line.strip_prefix(b"data: ") {
            if json_str == b"[DONE]" { break; }
            let delta: serde_json::Value = serde_json::from_slice(json_str)?;
            if let Some(token) = delta["choices"][0]["delta"]["content"].as_str() {
                full_content.push_str(token);
                app_handle.emit("llm-token", token)?;
            }
            // 检测 finish_reason
            if let Some(reason) = delta["choices"][0]["finish_reason"].as_str() {
                app_handle.emit("llm-finish-reason", reason)?;
            }
            // 解析 usage（最后一个 chunk 含 usage）
            if let Some(usage) = delta.get("usage") {
                app_handle.emit("llm-usage", usage)?;
            }
        }
    }
}
app_handle.emit("llm-done", &full_content)?;
```

**改造点 5：降级（流式失败回退非流式）**

```rust
// 流式请求失败时，自动回退到非流式
if stream.unwrap_or(true) {
    match try_stream_request(...).await {
        Ok(result) => return Ok(result),
        Err(StreamError::ConnectionFailed | StreamError::ParseError(_)) => {
            app_handle.emit("llm-degrade", "stream → non-stream")?;
            // 回退到非流式请求
            return try_non_stream_request(...).await;
        }
        Err(e) => return Err(e.into()),
    }
}
```

**改造点 6：截断检测**

检测到 `finish_reason == "length"` 时：

- emit `llm-truncated` 事件
- 前端显示「⚠️ 内容可能被截断（达到 token 上限）」提示
- 提供「续写」按钮（将已有内容作为 context，请求 LLM 继续）

#### 4.1.2 前端改造（`frontend/src/lib/llm.ts`）

**新增 `callLlmStream` 函数**：

```typescript
import { listen } from "@tauri-apps/api/event";

export interface LlmStreamCallbacks {
  onToken?: (token: string) => void;
  onRetry?: (attempt: number, delayMs: number, error: string) => void;
  onUsage?: (usage: { total_tokens: number; prompt_tokens: number; completion_tokens: number }) => void;
  onTruncated?: () => void;
  onDegrade?: (from: string, to: string) => void;
}

export async function callLlmStream(
  params: LlmCallParams,
  callbacks: LlmStreamCallbacks,
): Promise<LlmCallResult> {
  const unlisteners: Array<() => void> = [];

  if (callbacks.onToken) {
    unlisteners.push(await listen<string>("llm-token", (e) => callbacks.onToken!(e.payload)));
  }
  if (callbacks.onRetry) {
    unlisteners.push(await listen("llm-retry", (e) => {
      const r = e.payload as { attempt: number; delay_ms: number; error: string };
      callbacks.onRetry!(r.attempt, r.delay_ms, r.error);
    }));
  }
  // ... 其他事件监听

  try {
    const result = await callLlm({ ...params, stream: true });
    return result;
  } finally {
    unlisteners.forEach((un) => un());
  }
}
```

**向后兼容**：保留原 `callLlm` 函数（非流式），`stream` 参数默认 undefined 时由 Rust 端决定。

#### 4.1.3 UI 改造（`frontend/src/components/FileList.tsx`）

`LlmOrganizeModal` 改为流式渲染：

```typescript
const [streamingContent, setStreamingContent] = useState("");
const [isStreaming, setIsStreaming] = useState(false);
const [usage, setUsage] = useState<{ total_tokens: number } | null>(null);
const [truncated, setTruncated] = useState(false);

const handleOrganize = useCallback(async (file: StagingFile) => {
  setIsStreaming(true);
  setStreamingContent("");
  setTruncated(false);

  const result = await callLlmStream(
    { provider, apiKey, prompt, systemPrompt, baseUrl, model },
    {
      onToken: (token) => setStreamingContent((prev) => prev + token),
      onUsage: (u) => setUsage(u),
      onTruncated: () => setTruncated(true),
    },
  );

  setIsStreaming(false);
  if (result.success) {
    setOrganizeResult({ path: file.id, content: streamingContent, fileName: file.name });
  }
}, [...]);
```

渲染：`<pre>` 显示 `streamingContent`，底部显示 token 用量与截断提示。

#### 4.1.4 成本控制 UI

- SettingsPanel 新增「成本控制」区：
  - 可选 `max_tokens` 输入框（默认空=不限）
  - 「日累计 token 上限」输入框（默认空=不限，超限提示）
- LlmOrganizeModal 底部显示：`本次消耗：1,234 tokens | 今日累计：12,345 tokens`
- token 累计存 localStorage（`llm-usage-daily-{date}`）

---

### 4.2 P6-R2：降级方案完善（cloud 模式内）

**目标**：实现 §2.4 表格中的 4 条降级路径。

| 降级路径 | 实现位置 | 细节 |
| --- | --- | --- |
| 流式 → 非流式 | `lib.rs` `call_llm_api` | SSE 失败时回退非流式请求，emit `llm-degrade` |
| 重试 → 单次 | `lib.rs` 重试循环 | 3 次后返回错误，前端显示「重试耗尽，请检查网络」 |
| 限流 → 提示切换 | `lib.rs` + 前端 | 429 且 Retry-After > 60s 时 emit `llm-rate-limit`，前端提示「厂商限流，建议切换其他厂商」 |
| cloud → disabled | 前端 `callLlm` | API Key 缺失时直接报错「请先在设置中配置 API Key」 |

**前端降级提示组件**：在 LlmOrganizeModal 底部显示降级状态条（黄色提示）。

---

### 4.3 P6-R3：LLM 自动分类（建议+确认模式）

**目标**：实现 §2.6 的「LLM 建议 + 用户确认」分类流程。

#### 4.3.1 新增 `classify_domain` IPC 命令（`lib.rs`）

```rust
#[tauri::command]
async fn classify_domain(
    app_handle: AppHandle,
    provider: String,
    api_key: String,
    title: String,
    preview: String,           // 前 2000 字符
    existing_domains: Vec<String>,  // 从 kb_list_categories 获取
    base_url: Option<String>,
    model: Option<String>,
) -> Result<ClassifyResult, String> {
    let system_prompt = format!(
        "你是一个文档分类助手。根据文档标题和内容，从以下已有领域中选择最匹配的一个：\n{}\n\n\
         如果没有合适领域，可以提议新分类（需提供分类名和描述）。\n\
         返回 JSON：{{\"domain\": \"...\", \"confidence\": 0.0-1.0, \"new_domain_proposal\": null | {{\"name\": \"...\", \"description\": \"...\"}}, \"reason\": \"...\"}}",
        existing_domains.join(", ")
    );
    // 调用 call_llm_api（非流式，分类不需要流式）
    // 解析 JSON 返回
}
```

#### 4.3.2 DropZone 集成（`frontend/src/components/DropZone.tsx`）

```typescript
const handleUpload = useCallback(async (files: File[]) => {
  // ... 现有上传逻辑

  for (const file of files) {
    await uploadFile(file, currentDomain);

    // 若用户未选领域，LLM 自动推荐
    if (!currentDomain) {
      const existingDomains = await callMcpTool("kb_list_categories");
      const result = await classifyDomain({
        provider, apiKey, title: file.name, preview: extractedText.slice(0, 2000),
        existingDomains, baseUrl, model,
      });

      // 显示推荐结果，用户确认
      showClassifySuggestion(result);
      // result.domain = "coding", confidence = 0.92
      // 用户点击「接受」→ setDomain(result.domain)
      // 用户点击「改选」→ 手动选择
      // 若 result.new_domain_proposal → 显示「建议新建分类：xxx，是否创建？」
    }
  }
}, [...]);
```

#### 4.3.3 新分类创建流程（用户确认）

```typescript
async function createNewDomain(name: string, description: string) {
  // 二次确认
  if (!confirm(`确认创建新分类「${name}」？\n描述：${description}`)) return;

  // 1. 创建 wiki/<name>/ 目录（通过 IPC 调用 Rust 创建目录）
  await invoke("create_domain_directory", { name });

  // 2. 更新 index.md（追加 ## <name> 分组）
  await invoke("update_index_add_domain", { name });

  // 3. 提示用户手动更新 AGENTS.md §8.1（不自动改 schema 文件）
  showInfo("新分类已创建。请手动在 AGENTS.md §8.1 追加领域说明。");

  // 4. 设置当前领域
  setDomain(name);
}
```

**安全约束**：

- LLM 永远不能直接调用 `create_domain_directory`，只能返回提议
- 创建目录需用户二次确认
- 删除分类**不支持 LLM 发起**，仅用户手动操作
- AGENTS.md（schema 文件）不自动修改，提示用户手动更新

---

### 4.4 P6-R4：RAG 对话窗口

**目标**：新增 ChatPanel 组件，实现基于知识库的问答。

#### 4.4.1 新增 `ChatPanel` 组件（`frontend/src/components/ChatPanel.tsx`）

```typescript
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: Array<{ path: string; title: string; snippet: string }>;
  usage?: { total_tokens: number };
}

function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);

  const handleSend = async () => {
    const question = input.trim();
    if (!question || streaming) return;

    // 1. 添加用户消息
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setStreaming(true);

    // 2. RAG 检索
    const searchResults = await callMcpTool("kb_search", { query: question, limit: 5 });
    const citations = searchResults.results;

    // 3. 获取完整内容（构造 context）
    const pages = await Promise.all(
      citations.slice(0, 3).map((r) => callMcpTool("kb_get_page", { path: r.path }))
    );
    const context = pages.map((p) => `## ${p.title}\n路径: ${p.path}\n\n${p.body}`).join("\n\n---\n\n");

    // 4. 构造 prompt
    const systemPrompt = `你是知识库助手。根据以下参考资料回答用户问题。\n\n参考资料：\n${context}\n\n要求：\n1. 回答需引用来源，格式 [[路径]]\n2. 若参考资料不足以回答，明确说明\n3. 简洁准确`;

    // 5. 流式生成回答
    let assistantContent = "";
    setMessages((prev) => [...prev, { role: "assistant", content: "", citations }]);

    await callLlmStream(
      { provider, apiKey, prompt: question, systemPrompt, baseUrl, model },
      {
        onToken: (token) => {
          assistantContent += token;
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], content: assistantContent };
            return next;
          });
        },
      },
    );

    setStreaming(false);
  };

  return (
    <div className="chat-panel">
      <div className="messages">{messages.map(renderMessage)}</div>
      <div className="input-area">
        <input value={input} onChange={(e) => setInput(e.target.value)}
               onKeyDown={(e) => e.key === "Enter" && handleSend()} />
        <button type="button" onClick={handleSend} disabled={streaming}>发送</button>
      </div>
    </div>
  );
}
```

#### 4.4.2 视图集成（`frontend/src/App.tsx`）

```typescript
type ViewName = "preview" | "edit" | "graph" | "backlinks" | "chat";  // ← 新增 chat

function MainContent({ view }: { view: ViewName }) {
  switch (view) {
    case "preview": return <MarkdownPreview />;
    case "edit": return <Editor />;
    case "graph": return <GraphView />;
    case "backlinks": return <BacklinksPanel />;
    case "chat": return <ChatPanel />;  // ← 新增
  }
}
```

TopBar 新增「对话」切换按钮（chat 图标）。

#### 4.4.3 引用渲染

回答中的 `[[wiki/xxx/page]]` 渲染为可点击链接，点击后切换到 preview 视图并加载该页面。

#### 4.4.4 检索副作用处理

`kb_get_page` 会自增 `use_count`（考古 §3.4）。RAG 场景每次对话触发 3 次 `kb_get_page`，即 3 次文件写。

**决策**：接受此副作用。理由：

- RAG 检索本身是「使用」页面，use_count +1 语义合理
- `/dream` 老化降级依赖 use_count，RAG 检索的页面被频繁使用，不应降级，use_count +1 符合预期
- 3 次文件写性能可接受（SSD 上 <10ms）

若未来性能成为问题，再加 `increment_use_count: bool` 参数优化。

---

## 5. 风险分析

| 风险 | 严重度 | 缓解措施 |
| --- | --- | --- |
| 流式 SSE 解析在 Windows 上有兼容问题 | 中 | 充分测试 Windows/macOS；降级到非流式作为兜底 |
| 重试导致用户等待时间过长 | 中 | 最多 3 次，每次 emit `llm-retry` 让用户感知；提供「取消」按钮 |
| LLM 分类准确率不足 | 中 | 显示置信度，低置信度（<0.7）不自动推荐，让用户手动选 |
| RAG 检索质量受限于关键词匹配 | 中 | 当前 37 页足够；知识库增长后引入向量检索 |
| token 用量统计不准（部分厂商不返回 usage） | 低 | 解析失败时不显示用量，不阻塞主流程 |
| 流式渲染导致前端性能问题（长内容频繁 setState） | 低 | 使用 `requestAnimationFrame` 批量更新，或节流 50ms |
| ChatPanel 与现有视图切换状态丢失 | 中 | messages 存入 Zustand store，跨视图保持 |

---

## 6. 实施路线图

```
P6-R1（基础层，所有后续依赖）
  ├─ Rust: call_llm_api 加 AppHandle + stream + 重试 + 截断检测 + usage 解析
  ├─ 前端: callLlmStream + 事件监听
  ├─ UI: LlmOrganizeModal 流式渲染 + 用量显示 + 截断提示
  └─ 测试: 流式/重试/截断/降级 单元测试 + 集成测试

P6-R2（降级完善，依赖 R1）
  ├─ 4 条降级路径实现
  ├─ 前端降级提示组件
  └─ 测试: 各降级路径覆盖

P6-R3（LLM 自动分类，依赖 R1 的 call_llm_api）
  ├─ Rust: classify_domain IPC
  ├─ 前端: DropZone 集成 + 分类建议 UI
  ├─ 新分类创建流程（用户确认）
  └─ 测试: 分类准确率 + 新分类创建 + 安全约束

P6-R4（RAG 对话，依赖 R1 的 callLlmStream）
  ├─ ChatPanel 组件
  ├─ App.tsx 视图集成
  ├─ RAG 编排（search + get_page + LLM）
  ├─ 引用渲染与跳转
  └─ 测试: RAG 全链路 + 引用准确性
```

**预计工作量**：R1（2-3 天）、R2（0.5 天）、R3（1-2 天）、R4（2-3 天），合计 5-8 天。

---

## 7. 测试策略

### 7.1 单元测试

| 模块 | 测试项 |
| --- | --- |
| Rust `call_llm_api` | 流式 SSE 解析、重试逻辑（429/5xx/4xx）、截断检测、usage 解析、降级回退 |
| 前端 `callLlmStream` | 事件监听/取消、token 拼接、错误处理 |
| `classify_domain` | 已有领域推荐、新分类提议、JSON 解析容错 |
| ChatPanel | 消息状态管理、引用渲染 |

### 7.2 集成测试（Playwright + Tauri dev server）

遵循 project_memory 约束：**ac-verifier 必须使用 Playwright + Tauri dev server 进行真实运行时验证，禁止 mock IPC**。

| 场景 | 验证点 |
| --- | --- |
| 流式整理 | LLM 整理时 token 逐步出现，非一次性 |
| 重试 | 模拟 429（mock server 或断网）后自动重试 |
| 截断 | max_tokens 设小值，检测截断提示 |
| 降级 | SSE 失败回退非流式 |
| 自动分类 | 上传未选领域的文件，LLM 推荐领域 |
| 新分类提议 | LLM 提议新分类，用户确认后创建目录 |
| RAG 对话 | 提问后检索相关页面并生成带引用的回答 |
| 引用跳转 | 点击引用切换到对应页面预览 |

### 7.3 安全测试

| 场景 | 验证点 |
| --- | --- |
| LLM 不能自主创建分类 | classify_domain 只返回提议，无 IPC 调用 create_domain_directory |
| LLM 不能删除分类 | 无 delete_domain IPC；删除仅用户手动 |
| 新分类创建二次确认 | confirm 弹窗拦截 |
| API Key 不泄露 | 流式事件不含 API Key |

---

## 8. 待用户确认事项

请用户对以下事项逐一确认：

1. **异议一（降级方案）**：是否同意将完整 local-first（Ollama）降级推迟到 P7，本次只实现 cloud 模式内的降级？
   - [ ] 同意推迟
   - [ ] 不同意，本次必须实现 Ollama（工作量将显著增加）

2. **异议二（LLM 分类权限）**：是否同意采用「LLM 建议 + 用户确认」模式替代「LLM 自主增删改」？
   - [ ] 同意改为建议模式
   - [ ] 不同意，必须给予 LLM 自主权（需进一步讨论安全机制）

3. **RAG 检索策略**：是否同意当前使用关键词检索（kb_search），暂不引入向量检索？
   - [ ] 同意，知识库增长后再评估
   - [ ] 不同意，必须引入向量检索（工作量将增加）

4. **实施顺序**：是否同意按 R1→R2→R3→R4 顺序实施？
   - [ ] 同意
   - [ ] 需调整顺序（请说明）

5. **max_tokens 配置**：是否同意改为用户可选配置（默认不限）？
   - [ ] 同意
   - [ ] 应有默认上限（请建议值）

---

## 9. 审批

| 角色 | 状态 | 日期 | 备注 |
| --- | --- | --- | --- |
| 编制（主 Agent） | ✅ 已完成 | 2026-08-01 | 基于考古报告与网络调研 |
| 审批（用户） | ✅ 已审批 | 2026-08-01 | 确认全部 3 项关键决策：①降级推迟 Ollama 到 P7 ②LLM 分类用建议+确认模式 ③RAG 用关键词检索 |

**审批后行动**：

- 用户确认后，按 §6 路线图开始实施
- 每个 R 阶段完成后产出验收报告（docs/reports/）
- 实施过程遵循 CLAUDE.md 开发规约与 AGENTS.md 内容规约

---

*文档结束。所有结论可在 [考古报告](2026-08-01-p6-llm-enhancements-archaeology.md) 与引用的源文件中复现验证。*
