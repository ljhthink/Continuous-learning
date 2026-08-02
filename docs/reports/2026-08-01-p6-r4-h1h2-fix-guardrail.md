# P6-R4 H-1/H-2 修复 — 增量代码审查 + 安全审计报告

> **任务令牌**：TKN-P6-R4-GUARDRAIL-001
> **执行 Agent**：guardrail-enforcer（代码安全护栏）
> **审查日期**：2026-08-01
> **审查依据**：CLAUDE.md 第十节（代码审查与安全审计）
> **Skills 调用**：TRAE-code-review + TRAE-security-review
> **审查对象**：上一轮 guardrail（TKN-P6-DEF001-GUARDRAIL-001）识别的 H-1/H-2 阻断级问题修复

---

## 1. 总体结论：通过

H-1（useCallback 依赖缺失）和 H-2（输入上限验证缺失）两个阻断级问题均已正确修复。修复逻辑完整、边界覆盖充分、未引入新问题。上一轮 L-1/L-2/L-3 非阻断项仍可接受。**可进入测试阶段（ac-verifier）。**

| 维度 | 结论 | 说明 |
|---|---|---|
| H-1 修复正确性 | 通过 | 两个 useCallback 依赖数组均已补全 maxTokens，闭包陷阱消除 |
| H-2 修复正确性 | 通过 | max 属性 + Math.min 硬钳制，7 类边界全部覆盖 |
| React hooks 合规 | 通过 | 无新增 exhaustive-deps 违规 |
| 安全审计（注入/XSS/溢出/密钥） | 通过 | 无阻断级安全漏洞，无新增攻击面 |
| 回归风险 | 通过 | tsc 零错误，283 测试通过，无功能回归 |
| L-1/L-2/L-3 状态 | 可接受 | 三个非阻断项状态未变，仍为下迭代优化项 |

---

## 2. 审查范围

### 2.1 本次变更文件

| # | 文件 | 变更类型 | 改动概要 |
|---|---|---|---|
| 1 | `frontend/src/components/FileList.tsx` | 已提交文件工作区修改 | L274 useCallback 依赖数组补全 `maxTokens` |
| 2 | `frontend/src/components/ChatPanel.tsx` | 新文件（untracked） | L201 useCallback 依赖数组补全 `maxTokens` |
| 3 | `frontend/src/components/SettingsPanel.tsx` | 已提交文件工作区修改 | L328/L333/L344/L349 两个 number input 添加 `max={4294967295}` + `Math.min` 硬钳制 |

### 2.2 追踪验证文件（未修改，用于数据流验证）

| # | 文件 | 验证目的 |
|---|---|---|
| 4 | `frontend/src/store/llmStore.ts` | maxTokens/dailyTokenLimit store 类型 + 持久化逻辑 |
| 5 | `frontend/src/lib/llm.ts` | maxTokens → Tauri IPC 透传链路（L214/L297） |
| 6 | `frontend/src-tauri/src/lib.rs` | Rust 端 `max_tokens: Option<u32>` 类型边界（L1037/L1079） |
| 7 | `frontend/src/lib/ragUtils.ts` | renderContent escapeHtml XSS 防御验证 |
| 8 | `frontend/src/lib/html-utils.ts` | escapeHtml 转义表完整性验证 |
| 9 | `.gitignore` | 敏感文件排除验证 |

### 2.3 审查统计

- **审查文件数**：3 个变更文件 + 6 个追踪验证文件 = 9 个
- **审查函数数**：handleOrganize / handleSend / handleCitationClick / setMaxTokens onChange / setDailyTokenLimit onChange / callLlm / callLlmStream / call_llm_api(Rust) / renderContent / escapeHtml
- **发现问题数**：0 个阻断级 / 0 个高风险 / 0 个中等风险 / 3 个低风险（L-1/L-2/L-3 延续项，非本次引入）

---

## 3. H-1 修复验证：useCallback 依赖数组补全 maxTokens

### 3.1 FileList.tsx 验证

**变更位置**：`frontend/src/components/FileList.tsx` L274

**修复前**（上一轮 guardrail 报告 H-1 证据）：

```tsx
[tauriEnv, llmMode, cloudProvider, customBaseUrl, customModelName],
```

**修复后**（当前代码 L274）：

```tsx
[tauriEnv, llmMode, cloudProvider, customBaseUrl, customModelName, maxTokens],
```

**验证结论**：通过。

- L235 `handleOrganize` 内使用 `maxTokens ?? undefined` 传入 `organizeStagingPageStream`
- L274 依赖数组已包含 `maxTokens`
- 当用户在 SettingsPanel 修改 maxTokens 后，Zustand store 触发组件重渲染，`useCallback` 检测到 `maxTokens` 变化，重建 `handleOrganize` 回调，新回调捕获最新 maxTokens 值
- 闭包陷阱已消除，用户设置的成本控制上限能即时生效

### 3.2 ChatPanel.tsx 验证

**变更位置**：`frontend/src/components/ChatPanel.tsx` L201

**修复后**（当前代码 L193-207）：

```tsx
}, [
    input,
    streaming,
    tauriEnv,
    llmMode,
    cloudProvider,
    customBaseUrl,
    customModelName,
    maxTokens,          // L201: H-1 修复
    addUserMessage,
    addAssistantMessage,
    appendToLastAssistant,
    finalizeLastAssistant,
    setStreaming,
]);
```

**验证结论**：通过。

- L164 `handleSend` 内使用 `maxTokens: maxTokens ?? undefined` 传入 `callLlmStream`
- L201 依赖数组已包含 `maxTokens`
- 闭包陷阱已消除

### 3.3 React hooks 全面扫描（回归检查）

对三个变更文件中所有 `useCallback` 和 `useEffect` 进行 exhaustive-deps 检查：

| 文件 | Hook | 使用的外部变量 | 依赖数组 | 结论 |
|---|---|---|---|---|
| FileList.tsx | `refresh` (L91) | tauriEnv | `[tauriEnv]` | 通过 |
| FileList.tsx | `handleConfirm` (L113) | tauriEnv, refresh, invalidateGraph | `[tauriEnv, refresh, invalidateGraph]` | 通过 |
| FileList.tsx | `handleReject` (L130) | tauriEnv, refresh, invalidateGraph | `[tauriEnv, refresh, invalidateGraph]` | 通过 |
| FileList.tsx | `handlePreview` (L147) | setCurrentPagePath, setView | `[setCurrentPagePath, setView]` | 通过 |
| FileList.tsx | `handleDelete` (L157) | tauriEnv, refresh, invalidateGraph | `[tauriEnv, refresh, invalidateGraph]` | 通过 |
| FileList.tsx | `handleOrganize` (L184) | tauriEnv, llmMode, cloudProvider, customBaseUrl, customModelName, maxTokens | `[tauriEnv, llmMode, cloudProvider, customBaseUrl, customModelName, maxTokens]` | 通过 |
| FileList.tsx | `handleAdopt` (L278) | organizeResult, refresh | `[organizeResult, refresh]` | 通过 |
| ChatPanel.tsx | `handleCitationClick` (L60) | setCurrentPagePath, setView | `[setCurrentPagePath, setView]` | 通过 |
| ChatPanel.tsx | `handleSend` (L71) | input, streaming, tauriEnv, llmMode, cloudProvider, customBaseUrl, customModelName, maxTokens, addUserMessage, addAssistantMessage, appendToLastAssistant, finalizeLastAssistant, setStreaming | 全部包含 (L193-207) | 通过 |
| ChatPanel.tsx | `handleKeyDown` (L210) | handleSend | `[handleSend]` | 通过 |

**结论**：无新增 React hooks 违规。所有 useCallback 依赖数组完整。

---

## 4. H-2 修复验证：输入上限验证

### 4.1 修复内容

**文件**：`frontend/src/components/SettingsPanel.tsx`

**maxTokens input**（L325-337）：

```tsx
<input
  type="number"
  min={0}
  max={4294967295}                    // L328: H-2 修复 — HTML 软上限
  value={maxTokens ?? ""}
  onChange={(e) => {
    const v = e.target.value;
    // H-2: 钳制到 [0, u32::MAX]，防止超出 Rust u32 反序列化范围
    setMaxTokens(v === "" ? null : Math.max(0, Math.min(4294967295, Math.floor(Number(v) || 0))));
  }}
  placeholder="不限"
/>
```

**dailyTokenLimit input**（L341-353）：同上结构，`max={4294967295}` + `Math.min(4294967295, ...)` 硬钳制。

### 4.2 边界用例逐一验证

表达式求值顺序（由内向外）：
`Number(v)` → `|| 0`（NaN 容错）→ `Math.floor()`（取整）→ `Math.min(4294967295, ...)`（上限钳制）→ `Math.max(0, ...)`（下限钳制）

| # | 输入值 | Number(v) | \|\| 0 | Math.floor | Math.min(MAX,..) | Math.max(0,..) | 最终结果 | 预期行为 | 结论 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `""` | — | — | — | — | — | `null` | 空字符串=不限 | 通过 |
| 2 | `"0"` | 0 | 0 | 0 | 0 | 0 | `0` | 0（L-1 语义歧义，非阻断） | 通过(附注) |
| 3 | `"-5"` | -5 | -5 | -5 | -5 | 0 | `0` | 负数钳制为 0 | 通过 |
| 4 | `"3.7"` | 3.7 | 3.7 | 3 | 3 | 3 | `3` | 小数向下取整 | 通过 |
| 5 | `"5000000000"` | 5e9 | 5e9 | 5e9 | 4294967295 | 4294967295 | `4294967295` | 超 u32::MAX 钳制 | 通过 |
| 6 | `"abc"` | NaN | 0 | 0 | 0 | 0 | `0` | 非数字→0（L-1，非阻断） | 通过(附注) |
| 7 | `"1e10"` | 1e10 | 1e10 | 1e10 | 4294967295 | 4294967295 | `4294967295` | 科学计数法钳制 | 通过 |
| 8 | `"1e-5"` | 0.00001 | 0.00001 | 0 | 0 | 0 | `0` | 极小值→0（L-1，非阻断） | 通过(附注) |
| 9 | `"4294967295"` | 4294967295 | 4294967295 | 4294967295 | 4294967295 | 4294967295 | `4294967295` | 边界值精确通过 | 通过 |
| 10 | `"4294967296"` | 4294967296 | 4294967296 | 4294967296 | 4294967295 | 4294967295 | `4294967295` | 超 1 钳制 | 通过 |
| 11 | `"Infinity"` | Infinity | Infinity | Infinity | 4294967295 | 4294967295 | `4294967295` | 无穷大钳制 | 通过 |
| 12 | `"-Infinity"` | -Infinity | -Infinity | -Infinity | -Infinity | 0 | `0` | 负无穷钳制 | 通过 |

**结论**：H-2 修复正确。所有边界用例均被正确钳制到 [0, 4294967295] 范围内，不会超出 Rust `Option<u32>` 的反序列化范围。

**附注**：用例 2/6/8 中非数字/极小值输入被钳制为 0 而非 null，属于上一轮已识别的 L-1（maxTokens=0 语义歧义），非本次引入，非阻断。

### 4.3 HTML max 属性 vs onChange 硬钳制

主 Agent 在自问中提到「HTML number input 的 max 属性仅是软提示，浏览器仍允许用户输入超出 max 的值」。此判断正确。

**验证结论**：双层防护策略正确。

- **第一层（软提示）**：`max={4294967295}` — 浏览器在用户使用步进按钮时不超出 max，但手动键入可超出
- **第二层（硬钳制）**：onChange 中 `Math.min(4294967295, ...)` — 无论用户输入何种值，均强制钳制到合法范围
- 两层结合确保：即使用户通过粘贴、拖放、浏览器扩展等方式输入超范围值，store 中存储的值始终在 [0, 4294967295] 内

### 4.4 u32 类型边界对齐验证

| 层 | 类型 | 范围 | 代码位置 |
|---|---|---|---|
| 前端 input | HTML number | JS Number（2^53 安全整数） | SettingsPanel.tsx L325 |
| 前端 store | `number \| null` | JS Number | llmStore.ts L27 |
| 前端 API 层 | `number \| undefined` → `number \| null` | JS Number | llm.ts L214/L297 |
| Tauri IPC | JSON number | serde_json f64 → u32 | lib.rs L1037 |
| Rust 后端 | `Option<u32>` | 0..=4294967295 | lib.rs L1037 |
| LLM API 请求体 | `max_tokens: number` | API 厂商限制 | lib.rs L1080 |

**验证结论**：H-2 的钳制上限 4294967295 = `u32::MAX`，与 Rust 端 `Option<u32>` 精确对齐。经 `Math.min` 钳制后，任何值都不会导致 Rust 端 serde 反序列化失败。

---

## 5. 安全审计专项

### Stage 1：输入与边界审计

| 检查项 | 结论 | 证据 |
|---|---|---|
| 1.1 数值边界 | 通过 | H-2 修复后 maxTokens/dailyTokenLimit 有 `min={0}` + `max={4294967295}` 双层限制 + onChange `Math.max(0, Math.min(4294967295, ...))` 硬钳制。12 类边界用例全部通过（见 §4.2） |
| 1.2 集合/缓冲区 | 通过 | 无数组/缓冲区操作，无 strcpy/sprintf/gets 使用 |
| 1.3 状态机约束 | 通过 | maxTokens/dailyTokenLimit 无状态机语义，null 表示「不限」的约定全链路一致（store → llm.ts → Tauri IPC → Rust None） |

### Stage 2：执行安全审计

| 检查项 | 结论 | 证据 |
|---|---|---|
| 2.1 注入防护 | 通过 | 无 SQL/NoSQL/OS命令/代码/模板注入。maxTokens 为 number 类型，经 Tauri IPC 类型安全传递（serde 反序列化），不参与任何字符串拼接查询 |
| 2.2 最小权限 | 通过 | 无新增权限请求。maxTokens 仅影响 LLM API 请求体（`body["max_tokens"]`，lib.rs L1080），不涉及文件系统/进程/网络配置操作 |
| 2.3 输出编码 | 通过 | SettingsPanel input 为 `type="number"`，`value={maxTokens ?? ""}` 渲染 number 或空字符串，无 HTML 注入风险。ChatPanel 的 `dangerouslySetInnerHTML` 使用 `renderContent`，该函数先调用 `escapeHtml`（转义 `& < > " ' /` 六类字符，遵循 OWASP 推荐），后续 regex 替换仅添加受控 HTML 标签，属性值来自已转义内容，无法突破属性边界（见 §5.1 详细分析） |

### Stage 3：内存安全（Rust 端）

| 检查项 | 结论 | 证据 |
|---|---|---|
| 3.1 类型安全 | 通过 | `Option<u32>` 类型安全，serde 反序列化对非法值报错而非 UB。H-2 钳制确保值始终在 u32 范围内 |
| 3.2 无 unsafe | 通过 | max_tokens 处理路径（lib.rs L1037-1080）无 unsafe 代码块 |

### Stage 4：配置与密钥安全

| 检查项 | 结论 | 证据 |
|---|---|---|
| 4.1 硬编码密钥 | 通过 | 本次变更无硬编码密钥/密码/token/API Key。maxTokens/dailyTokenLimit 为用户偏好配置，非敏感信息 |
| 4.2 敏感配置 | 通过 | maxTokens/dailyTokenLimit 存储在 localStorage（非敏感偏好），API Key 仍走 keyring（未改动，ADR-013 V7） |
| 4.3 .gitignore | 通过 | `.gitignore` 包含 `.env`、`.env.local`、`.env.*.local`、`!.env.example`（L11-15），敏感文件已排除 |

### Stage 5：依赖与供应链

| 检查项 | 结论 | 证据 |
|---|---|---|
| 5.1 依赖变更 | 通过 | 本次 H-1/H-2 修复未引入新依赖，无 package.json/Cargo.toml 变更 |

### 5.1 XSS 深度分析：renderContent + dangerouslySetInnerHTML

ChatPanel.tsx L381-383 使用 `dangerouslySetInnerHTML` 渲染 LLM 回答：

```tsx
dangerouslySetInnerHTML={{
  __html: renderContent(message.content),
}}
```

`renderContent`（ragUtils.ts L91-120）处理顺序：

1. **escapeHtml(content)** — 首先转义所有 HTML 特殊字符（`&` → `&amp;`、`<` → `&lt;`、`>` → `&gt;`、`"` → `&quot;`、`'` → `&#x27;`、`/` → `&#x2F;`）
2. `[[wiki/xxx]]` → `<a href="#" data-citation="..." class="citation-link">...</a>`
3. ` ```code``` ` → `<pre><code>...</code></pre>`
4. `` `code` `` → `<code>...</code>`
5. `**text**` → `<strong>...</strong>`
6. `\n` → `<br>`

**安全分析**：

- 步骤 1 的 escapeHtml 是第一道防线，所有用户可控内容（LLM 生成的回答）中的 HTML 特殊字符均被转义
- 步骤 2 中 `data-citation="${trimmed}"` 的 `trimmed` 来自已转义内容。由于 `"` 已被转义为 `&quot;`，攻击者无法通过 `[[page" onclick="alert(1)]]` 突破属性边界。浏览器解析 `data-citation="page&quot; onclick=&quot;alert(1)"` 时，`&quot;` 在属性值内被解码为字面字符 `"`，但不终止属性（属性终止符是 HTML 源码中的字面 `"`，不是解码后的值）
- 步骤 3-6 的 regex 替换仅添加受控 HTML 标签，标签内容来自已转义文本，无注入风险
- 引用链接通过 `data-citation` 属性 + 事件委托处理（ChatPanel.tsx L373-378），不使用 `href="javascript:"`，无 JavaScript 伪协议注入风险

**结论**：XSS 防御完整。此为 P6-R4 新增代码，但不在 H-1/H-2 修复范围内，作为安全审计一部分确认无风险。

---

## 6. 主 Agent 自问答复验证

### 6.1 自问 1：「最没有把握的事情」

**主 Agent 顾虑 1**：H-1 修复逻辑简单，但现有单元测试使用 mock store，未覆盖「maxTokens 变化后 callback 是否重新创建」的真实 React 组件生命周期场景。

**guardrail-enforcer 验证**：

- H-1 修复的**代码正确性**已验证通过（§3.1/§3.2）。`maxTokens` 已在两个 useCallback 依赖数组中，React 会在 maxTokens 变化时重建回调，这是 React hooks 的保证行为。
- **测试覆盖缺口确实存在**：283 个单元测试使用 mock store，未模拟「maxTokens 变化 → 组件重渲染 → useCallback 重建」的真实生命周期。此为测试覆盖问题，非代码缺陷。
- **建议**：在 ac-verifier 阶段补充 React Testing Library 集成测试，验证「修改 maxTokens → handleOrganize/handleSend 使用新值」。此为非阻断建议。

**结论**：代码修复正确，测试覆盖缺口为非阻断建议项。

**主 Agent 顾虑 2**：H-2 修复使用 u32::MAX 作为 max 上限。HTML number input 的 max 属性仅是软提示，依赖 onChange Math.min 做硬钳制，不确定是否所有边界情况都被正确处理。

**guardrail-enforcer 验证**：§4.2 已对 12 类边界用例逐一验证，全部通过。双层防护策略（max 软提示 + Math.min 硬钳制）正确可靠。

**结论**：H-2 修复覆盖所有边界情况，硬钳制可靠。

### 6.2 自问 2：「最大的遗憾 / 未意识到的事情」

**主 Agent 顾虑**：H-1 是 React 常见陷阱，本应在 DEF-001 初次实现时就避免。`Math.min(4294967295, Math.floor(Number(v) || 0))` 的执行顺序导致 NaN → 0 而非 null，可能不是用户预期。

**guardrail-enforcer 验证**：

- 主 Agent 对 NaN → 0 的执行顺序分析**完全正确**：`Number("abc")` = NaN → `NaN || 0` = 0 → `Math.floor(0)` = 0 → `Math.min(4294967295, 0)` = 0 → `Math.max(0, 0)` = 0 → `setMaxTokens(0)`。
- 此行为属于上一轮已识别的 **L-1（maxTokens=0 语义歧义）**，非本次引入，非阻断。用户输入非数字字符串后看到「0」而非「不限」，是 UX 瑕疵，不影响安全性。
- **建议**（非阻断）：可将 `n === 0` 也视为 null，使 0 与空字符串行为一致。但需评估 max_tokens=0 是否有合法业务场景（如测试 API 连通性时发送最小请求）。

**结论**：主 Agent 的分析准确。NaN → 0 是 L-1 的延续，仍为非阻断。

---

## 7. L-1/L-2/L-3 非阻断项状态确认

| 编号 | 问题 | 上一轮结论 | 本轮状态 | 是否仍可接受 | 理由 |
|---|---|---|---|---|---|
| L-1 | maxTokens=0 语义歧义 | 非阻断（P2 建议） | 未修复，状态未变 | 可接受 | UX 瑕疵，非安全漏洞。0/NaN/极小值 → 0，用户需手动清空才能恢复「不限」。建议下迭代将 0 视为 null |
| L-2 | `_persist` 方法暴露在 store 公共接口 | 非阻断（P2 建议） | 未修复，状态未变 | 可接受 | 代码风格问题。`_` 前缀约定内部使用，TypeScript 不阻止但不影响安全性。建议改用 Zustand persist 中间件 |
| L-3 | dailyTokenLimit 告警逻辑未实现 | 非阻断（P3 下迭代） | 未修复，状态未变 | 可接受 | maxTokens 单次上限已完整实现核心成本控制。dailyTokenLimit 仅存储未实现告警，属增强功能，需额外基础设施（日期滚动、token 累加、跨会话持久化） |

**总结**：三个非阻断项状态未变，仍可接受。H-1/H-2 修复未恶化任何现有问题。

---

## 8. 回归检查

| 检查项 | 结论 | 证据 |
|---|---|---|
| TypeScript 类型检查 | 通过 | tsc --noEmit 零错误（主 Agent 报告） |
| 单元测试 | 通过 | 283 tests passed, 11 test files, 零失败（主 Agent 报告） |
| 依赖模块影响 | 通过 | FileList/ChatPanel/SettingsPanel 被 App.tsx 引用，改动均为组件内部逻辑（依赖数组 + 输入校验），不影响外部调用方 |
| 接口/契约变更 | 无 | 未修改函数签名、API 路由、数据结构、环境变量 |
| 依赖变更 | 无 | 无新增/删除/升级依赖 |
| 跨模块影响 | 无 | bug 修复，非接口变更 |

---

## 9. 数据流追踪（H-2 修复后全链路验证）

```text
用户操作                 前端 input                前端 store              前端 API 层              Tauri IPC              Rust 后端
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
留空(不限)    → v="" → null          → maxTokens=null  → ?? undefined → ?? null → invoke({maxTokens:null}) → Option<u32>=None → 不注入 max_tokens      ✅
输入 4096     → v="4096" → 4096      → maxTokens=4096  → ?? undefined → ?? null → invoke({maxTokens:4096}) → Option<u32>=Some(4096) → body["max_tokens"]=4096 ✅
输入 0        → v="0" → 0            → maxTokens=0     → ?? undefined → ?? null → invoke({maxTokens:0})    → Option<u32>=Some(0) → body["max_tokens"]=0    ⚠️(L-1)
输入 5e9      → v="5e9" → 4294967295 → maxTokens=MAX   → ?? undefined → ?? null → invoke({maxTokens:MAX})  → Option<u32>=Some(MAX) → body["max_tokens"]=MAX  ✅ (H-2 修复)
输入 "abc"    → v="abc" → 0          → maxTokens=0     → ?? undefined → ?? null → invoke({maxTokens:0})    → Option<u32>=Some(0) → body["max_tokens"]=0    ⚠️(L-1)
输入 -5       → v="-5" → 0           → maxTokens=0     → ?? undefined → ?? null → invoke({maxTokens:0})    → Option<u32>=Some(0) → body["max_tokens"]=0    ⚠️(L-1)
```

**关键对比**：H-2 修复前，输入 5e9 会导致 `invoke({maxTokens:5000000000})` → Rust serde 反序列化 `Option<u32>` 失败。修复后，`Math.min(4294967295, ...)` 钳制为 4294967295，反序列化成功。

---

## 10. 审查结论与建议

### 10.1 最终结论

**通过。** H-1/H-2 两个阻断级问题均已正确修复，修复逻辑完整、边界覆盖充分、未引入新问题。可进入 ac-verifier 测试阶段。

### 10.2 修复验证清单

| 编号 | 问题 | 修复内容 | 验证结果 | 阻断? |
|---|---|---|---|---|
| H-1 | useCallback 依赖缺失 maxTokens | FileList L274 + ChatPanel L201 依赖数组添加 maxTokens | 通过 — 闭包陷阱消除 | 原阻断，已解除 |
| H-2 | 输入无上限验证 | SettingsPanel 两个 input 添加 max + Math.min 上限校验 | 通过 — 12 类边界全覆盖 | 原阻断，已解除 |

### 10.3 非阻断项清单（延续，不阻塞本次审查）

| 优先级 | 编号 | 问题 | 建议 | 阻断? |
|---|---|---|---|---|
| P2（建议） | L-1 | maxTokens=0 语义歧义 | 将 0 视为 null（不限）或给出 UI 提示 | 否 |
| P2（建议） | L-2 | `_persist` 暴露 | 改为模块私有函数或使用 Zustand persist 中间件 | 否 |
| P3（下迭代） | L-3 | dailyTokenLimit 告警未实现 | 实现日累计 token 统计 + 超限软提示 | 否 |
| P2（建议） | 新增 | H-1 测试覆盖缺口 | ac-verifier 阶段补充 React Testing Library 集成测试，验证 maxTokens 变化后回调重建 | 否 |

---

## 11. CI/CD 自动化建议

1. **React hooks exhaustive-deps 强制检查**：在 CI 中启用 `eslint-plugin-react-hooks` 的 `exhaustive-deps` 规则为 `error`，可在 PR 阶段自动捕获 H-1 类依赖缺失问题：

   ```yaml
   # .github/workflows/lint.yml
   - name: ESLint (react-hooks/exhaustive-deps)
     run: pnpm lint -- --rule '{"react-hooks/exhaustive-deps": "error"}'
   ```

2. **输入边界自动化测试**：添加针对 maxTokens/dailyTokenLimit 的边界测试用例（空字符串 / 0 / 负数 / 超大值 / 小数 / NaN / 科学计数法 / Infinity），确保 Number 解析 + Math.min 钳制逻辑不回归。

3. **跨层类型一致性检查**：前端 `maxTokens: number | null` ↔ Rust `Option<u32>` 的类型边界应添加集成测试，验证钳制后值能正确通过 serde 反序列化。

---

## 12. 审查声明

- 本报告基于 H-1/H-2 修复的 3 个变更文件 + 6 个追踪验证文件的静态审查。
- 所有代码引用使用相对路径（CLAUDE.md §14.1，ADR-010），可在仓库中直接定位。
- 283 单元测试通过 + tsc 零错误已确认（主 Agent 报告）。
- H-1 测试覆盖缺口（useCallback 依赖重建场景）为非阻断建议项，建议在 ac-verifier 阶段补充。
- L-1/L-2/L-3 三个非阻断项状态未变，经评估仍可接受。
- 本审查未发现任何阻断级或高风险问题，未引入新攻击面。
