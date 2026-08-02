# P5-R4 考古与方案报告

> 任务令牌：TKN-P5-R4-ARCHAELOGY-001  
> 日期：2026-08-01  
> 范围：LLM 整理大文件内容缺失 + 知识图谱不显示新入库页面

---

## 1. 问题描述

| # | 问题 | 严重度 |
| --- | --- | --- |
| 1 | 对于内容较大的文件，LLM 整理后缺失大量内容 | 高（功能不可用） |
| 2 | 上传的数学建模文件被划分至编程领域，虽可搜索入库，但知识图谱中不显示 | 高（功能不可用） |

---

## 2. 考古分析

### 2.1 问题 1：LLM 整理大文件内容缺失

**调用链路**：`FileList.handleOrganize` → `kb_get_page`（读取完整 body）→ `organizeStagingPage` → `callLlm` → `invoke("call_llm_api")` → Rust `call_llm_api` → HTTP POST → LLM API

**前端无截断**：

- `handleOrganize`（[FileList.tsx:166-223](../../frontend/src/components/FileList.tsx#L166-L223)）：通过 `kb_get_page` 读取完整 body，传给 `organizeStagingPage`
- `organizeStagingPage`（[llm.ts:376-391](../../frontend/src/lib/llm.ts#L376-L391)）：直接将 `rawContent` 作为 `prompt` 传给 `callLlm`，无截断
- `callLlm`（[llm.ts:169-187](../../frontend/src/lib/llm.ts#L169-L187)）：直接传给 `invoke("call_llm_api")`，无截断

**根因：Rust 后端 `max_tokens: 4096` 硬截断**

[lib.rs:1044-1050](../../frontend/src-tauri/src/lib.rs#L1044-L1050)：

```rust
let body = serde_json::json!({
    "model": effective_model,
    "messages": messages,
    "reasoning_effort": "max",     // ← 消耗输出 token 用于推理
    "max_tokens": 4096,             // ← 硬上限：约 2000-3000 中文字符
});
```

- `max_tokens: 4096`：LLM 输出最多 4096 token（≈2000-3000 中文字符）。大文件整理需要输出完整结构化 wiki 页面（含 frontmatter + 所有小节），轻松超过此限制。
- `reasoning_effort: "max"`：DeepSeek V4 等推理模型在生成答案前消耗大量 token 进行内部推理，进一步挤占输出预算。
- **截断是静默的**：API 返回 200 OK，`finish_reason: "length"` 被忽略，前端不知道内容被截断。

**联网研究结论**（[OpenAI 官方文档](https://help.openai.com/zh-hans-cn/articles/5072518)）：

- `max_tokens` 是硬上限而非目标长度，截断时 API 仍返回 200 OK
- 对于长内容生成任务，应设置足够大的 `max_tokens` 或省略（使用模型默认最大值）
- `reasoning_effort` 控制推理 token 数量，对内容生成任务应设为 `low` 或 `none`

### 2.2 问题 2：知识图谱不显示新入库页面

**现象**：用户上传两份数学建模文件，可被搜索和入库，但知识图谱中不显示。

**直接运行 kb_get_graph 验证**：

```bash
node --import tsx src/cli.ts kb_get_graph '{"include_statuses":["active","staging"]}'
```

输出中发现问题节点：

```json
{
  "id": "wiki/coding/2025国赛",
  "title": "2025国赛",
  "domain": "uncategorized",  // ← 应为 "coding"
  "type": null,                // ← 应为 "source"
  "status": null               // ← 应为 "active"
}
```

**domain/type/status 全为 null** → GraphView 三维过滤器全部排除：

- `filterDomains.has("uncategorized")` → false（"uncategorized" 不在 DOMAIN_COLORS 中）
- `filterTypes.has(null)` → false（null 不在 ALL_TYPES 中）
- `filterStatuses.has(null)` → false（null 不在 ALL_STATUSES 中）

**根因：`update_frontmatter_status` 丢失尾部换行符导致 frontmatter 损坏**

读取实际文件 [wiki/reading/2025国赛.md](../../wiki/reading/2025国赛.md)：

```yaml
---
title: 2025国赛
domain: [coding]
type: source
status: active
date: 2026-08-01
source_file: raw/pdf/2025国赛.pdf
use_count: 1---                # ← 换行符丢失！
```

`use_count: 1---` —— `use_count` 字段值与 frontmatter 结束标记 `---` 粘连在同一行。

**损坏路径追踪**：

1. `upload_file` 创建文件（Rust `build_wiki_page`），frontmatter 正确
2. `kb_get_page` 读取页面时通过 `serializeFrontmatter` 回写 `use_count: 1`，frontmatter 正确（js-yaml `dump` 添加尾部换行符）
3. `confirm_staging` 调用 `update_frontmatter_status` 更新 `status: staging → active`

[lib.rs:212-236](../../frontend/src-tauri/src/lib.rs#L212-L236) `update_frontmatter_status`：

```rust
let new_yaml = yaml
    .lines()                    // lines() 不保留尾部空行
    .map(|line| { ... })
    .collect::<Vec<_>>()
    .join("\n");                // join("\n") 不添加尾部换行符！
format!("---{}---{}", new_yaml, &content[yaml_end + 3..])
//                  ^^^^ new_yaml 不以 \n 结尾，直接拼接 ---
```

`join("\n")` 不添加尾部换行符 → `new_yaml` 最后一个字段后无 `\n` → `format!` 拼接 `---` 时产生 `use_count: 1---`。

**parseFrontmatter 解析失败**：`use_count: 1---` 不是合法的 YAML 行，也不是独立的 `---` 结束标记。解析器无法正确识别 frontmatter 边界，返回空 frontmatter → domain/type/status 全为 null。

### 2.3 问题 2b：文件被划分至编程领域

[DropZone.tsx:76](../../frontend/src/components/DropZone.tsx#L76)：

```typescript
const domain: Domain = currentDomain ?? "coding";  // 默认 "coding"
```

用户未选择领域时，默认归入 "coding"。这是 UX 问题而非 bug，但导致数学建模文件被错误分类。

---

## 3. 修复方案

### Fix 1：移除 max_tokens 限制 + 降级 reasoning_effort

```rust
// Before
let body = serde_json::json!({
    "model": effective_model,
    "messages": messages,
    "reasoning_effort": "max",
    "max_tokens": 4096,
});

// After
let body = serde_json::json!({
    "model": effective_model,
    "messages": messages,
    // P5-R4: 移除 max_tokens 限制（让模型使用默认最大输出）
    // 移除 reasoning_effort（内容生成任务不需要深度推理，且会消耗输出 token）
});
```

同时更新系统提示词，强调保留全部内容。

### Fix 2：修复 update_frontmatter_status 尾部换行符

```rust
// Before
format!("---{}---{}", new_yaml, &content[yaml_end + 3..])

// After
format!("---{}\n---{}", new_yaml, &content[yaml_end + 3..])
```

添加 `\n` 确保 YAML 内容与结束标记 `---` 之间有换行符。

### Fix 3：修复已损坏的文件

扫描 wiki/ 下所有 .md 文件，修复 `use_count: N---` 为 `use_count: N\n---`。

### Fix 4：GraphView 防御性处理 null domain/type/status

在 GraphView 过滤逻辑中，对 null domain/type/status 的节点采用默认值而非排除：

- `domain: null` → 视为 "uncategorized" 并包含在过滤器中
- `type: null` → 视为 "source"（staging 页面默认类型）
- `status: null` → 视为 "active"（保守包含而非排除）

### Fix 5：DropZone 领域选择 UX 改进

当 `currentDomain` 为 null 时，显示提示而非默认 "coding"。

---

## 4. 实施顺序

1. Fix 2（update_frontmatter_status）— 阻断级，优先
2. Fix 3（修复已损坏文件）— 数据修复
3. Fix 1（max_tokens + reasoning_effort）— 功能修复
4. Fix 4（GraphView 防御性处理）— 鲁棒性增强
5. Fix 5（DropZone UX）— 体验改进
