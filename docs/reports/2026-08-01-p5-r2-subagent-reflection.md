# P5-R2 子 Agent 审核漏问题反思报告

| 项目 | 内容 |
| --- | --- |
| 日期 | 2026-08-01 |
| 阶段 | P5-R2（P5 验收二轮修复） |
| 执行 Agent | 主 Agent（反思发起方） |
| 任务令牌 | TKN-P5-R2-REFLECTION-001 |
| 依据 | [考古报告](2026-08-01-p5-r2-archaeology.md)、[方案设计](2026-08-01-p5-r2-solution-design.md)、CLAUDE.md §7 |

## 1. 背景

P5 验收一轮（2026-07-29）经过 `guardrail-enforcer` + `ac-verifier` 两个子 Agent 审核并标记"13/13 AC 通过"。但用户在桌面模式验收时发现 **8 个问题**（3 bug + 5 UX），其中多个为功能阻断级（P0）。本报告反思为何子 Agent 审核未能发现这些问题。

## 2. 漏问题清单

| 编号 | 问题 | 严重度 | 漏审环节 | 实际发现者 |
| --- | --- | --- | --- | --- |
| 3 | LLM 整理只发送 200 字符 preview，非完整内容 | P0 阻断 | ac-verifier 未做 E2E | 用户 |
| 4 | 测试连接失败时 API Key 不保存 | P0 严重 | guardrail-enforcer 未审业务逻辑路径 | 用户 |
| 5 | 删除功能仅限 staging，无法删除 active 页面 | P1 | ac-verifier 未覆盖删除场景矩阵 | 用户 |
| 6 | 缓存命中后后台刷新触发重渲染，仍卡顿 | P1 | ac-verifier 未做运行时性能验证 | 用户 |
| 2 | 模型名前后端硬编码，无法自定义 | P1 | ac-verifier 未对照需求验证可配置性 | 用户 |
| 1 | LLM 集成注释提及具体厂商（过时） | P1 | guardrail-enforcer 未审注释一致性 | 用户 |
| 7 | 类型筛选无说明，用户不理解划分依据 | P2 | ac-verifier 未做可用性验证 | 用户 |
| 8 | 无 Playwright/TRAE-debugger 运行时验证 | P2 | ac-verifier 跳过 E2E + 运行时 | 用户 |

## 3. 根因分析

### 3.1 ac-verifier 跳过了 E2E 与运行时验证（核心根因）

P5 一轮 ac-verifier 报告明确标注"盲区：Tauri 桌面运行时未实测"，但**主 Agent 未要求补齐**，ac-verifier 也未强制阻断。这导致：

- **问题 3 未被发现**：`handleOrganize` 只传 `file.preview`（200 字符）给 LLM。单元测试 mock 了 IPC，验证了"调用成功"，但从未验证"传入的内容是完整的"。只有真实运行 upload → organize 流程才能发现。
- **问题 5 未被发现**：`delete_page` 注释明确写了 "Does NOT delete raw/ source files"，但 ac-verifier 未对照需求"用户可删除已上传文档"验证覆盖范围。
- **问题 6 未被发现**：缓存命中后后台刷新触发 `setPage` → ReactMarkdown 重渲染。只有运行时性能 profile 才能发现 100-500ms 渲染延迟。

**违反 CLAUDE.md §11**："涉及前端交互时必须调用 Playwright MCP"——本轮未调用。

### 3.2 guardrail-enforcer 聚焦安全边界，未审业务逻辑路径

guardrail-enforcer 按 CLAUDE.md §10 执行 TRAE-code-review + TRAE-security-review，重点在：

- 路径穿越防护（已验证）
- XSS 转义（已验证）
- 注入防护（已验证）
- 密钥硬编码（已验证）

但**未审业务逻辑正确性**：

- **问题 4 未被发现**：`handleTestConnection` 中 `saveApiKey` 仅在 `result.ok` 时调用。这是业务逻辑 bug（测试失败 → key 不保存 → 整理时找不到 key），非安全问题。guardrail-enforcer 的职责是安全+质量，但 TRAE-code-review 未覆盖"状态机完整性"（测试失败路径的副作用）。
- **问题 1 未被发现**：注释提及具体厂商属于"文档过时"，guardrail-enforcer 未审注释与代码语义一致性。

### 3.3 主 Agent 未提供「Tauri 桌面运行时验证清单」

CLAUDE.md §7.3 要求主 Agent 启动 ac-verifier 前提供完整上下文。本轮主 Agent 提供了 PRD AC + guardrail 报告，但**未提供**：

- Tauri 桌面运行时验证清单（upload → organize → confirm → delete 全流程）
- 上一轮 ac-verifier 标注的"盲区"补齐要求
- 性能基线（缓存命中渲染延迟阈值）

ac-verifier 在缺少清单的情况下，按"通过 static analysis + unit test 即可"的最低标准执行，导致系统性盲区。

### 3.4 单元测试的虚假安全感

144 个单元测试全过，但单元测试的本质是 **mock 隔离**：

- `llm.test.ts` mock 了 `invoke`，验证"调用 call_llm_api 时参数正确"，但**不验证 FileList 传给 organizeStagingPage 的内容是否完整**。
- `viewStore.test.ts` 验证状态机，但**不验证 MarkdownPreview 缓存命中后的重渲染行为**。

单元测试绿 ≠ 功能正确。只有 E2E（真实组件树 + 真实 IPC 或 mock IPC）才能发现集成层 bug。

### 3.5 需求追溯缺失

ac-verifier 未对照 P5 需求逐条验证：

- 需求"用户可删除已上传文档" → 实际只支持 staging 删除（问题 5）
- 需求"LLM 模型可配置" → 实际模型名硬编码（问题 2）
- 需求"类型筛选可用" → 实际用户不理解分类（问题 7）

## 4. 流程改进措施

### 4.1 强制 E2E 验证（Playwright MCP）

**规则**：涉及前端交互（按钮、表单、视图切换、模态框）的修复，ac-verifier **必须**调用 Playwright MCP 验证：

- 浏览器 dev 模式启动 vite（`pnpm dev`）
- Playwright 导航到对应视图，模拟用户操作
- 验证可见行为（按钮出现/消失、文本变化、错误提示）

**落地**：本轮 ac-verifier 将用 Playwright MCP 验证：

1. SettingsPanel 自定义模型名输入
2. FileList LLM 整理按钮（mock callLlm）
3. MarkdownPreview 删除按钮 + 二次确认
4. GraphView 类型筛选帮助文本显示

### 4.2 强制运行时验证（TRAE-debugger）

**规则**：涉及 IPC / keyring / parser / 缓存的修复，ac-verifier **必须**调用 TRAE-debugger 收集运行时证据：

- 插桩 `console.log` 验证参数透传（customModelName 是否到达 Rust 端）
- 插桩 keyring 存取日志，验证 save/load 一致性
- 插桩 `handleOrganize` 内容长度，验证完整 body 发送

**落地**：本轮 ac-verifier 将用 TRAE-debugger 验证：

1. `call_llm_api` 收到的 `model` 参数 = 用户输入的 customModelName
2. `save_api_key` → `load_api_key` 往返一致性（同 provider）
3. `handleOrganize` 发送的内容长度 > 200 字符（完整 body）

### 4.3 主 Agent 启动 ac-verifier 前必须提供验证清单

**规则**：主 Agent 启动 ac-verifier 时，必须附带「验证清单」，列出：

- 上一轮标注的盲区（必须本轮补齐）
- 用户可感知的功能点（必须 E2E 验证）
- 性能敏感路径（必须运行时验证）
- 需求追溯矩阵（每条需求 → 对应验证方式）

**落地**：本轮启动 ac-verifier 时将附上清单（见下文 §5）。

### 4.4 guardrail-enforcer 增加业务逻辑路径审查

**规则**：guardrail-enforcer 的 TRAE-code-review 阶段，除安全边界外，还需审查：

- 状态机完整性（成功/失败路径是否都有正确的副作用）
- 需求覆盖度（代码是否实现了需求的所有分支）
- 注释一致性（注释是否与代码当前行为一致）

**落地**：本轮 guardrail-enforcer 将重点审查：

1. `handleTestConnection` 失败路径是否保存 key
2. `delete_page` 是否支持 raw 文件删除
3. 注释中是否还有过时厂商提及

### 4.5 区分"编译通过"与"功能正确"

**规则**：`tsc` + `cargo build` + `vitest` 通过只是**准入条件**，不是**验收条件**。验收必须包含：

- 至少 1 个 E2E 场景（Playwright MCP）
- 至少 1 个运行时证据（TRAE-debugger，若涉及 IPC/状态）
- 需求追溯（每条 AC 有对应验证结果）

## 5. 本轮 ac-verifier 验证清单

以下清单将随 ac-verifier 启动时提供，确保本轮不重蹈覆辙：

| AC | 验证方式 | 预期 |
| --- | --- | --- |
| 问题 1：注释清理 | 静态搜索 `rg "三厂商"` | 0 匹配 |
| 问题 2：模型名自定义 | Playwright MCP 输入框 + TRAE-debugger IPC 参数 | customModelName 透传到 Rust |
| 问题 3：PDF 完整内容 | TRAE-debugger 插桩 handleOrganize 内容长度 | > 200 字符 |
| 问题 4：Key 保存 | Playwright MCP 模拟测试失败 + TRAE-debugger keyring | Key 已保存 |
| 问题 5：删除 active 页面 | Playwright MCP 预览界面删除按钮 | 删除后切回 upload 视图 |
| 问题 6：缓存不重渲染 | TRAE-debugger 插桩 setPage 调用次数 | 内容相同时不调用 |
| 问题 7：类型筛选说明 | Playwright MCP 读取帮助文本 | "概念=原理/方法..." 可见 |
| 问题 8：Playwright + TRAE-debugger | 本清单本身即验证 | 全部执行 |

## 6. 总结

P5 一轮审核失败的根因是 **重静态轻运行时、重单测轻 E2E、重安全轻业务**。子 Agent 按最低标准执行，主 Agent 未补齐验证清单。本轮改进通过强制 Playwright MCP + TRAE-debugger + 验证清单三管齐下，确保审核闭环不再流于形式。

> **教训**：单元测试绿 ≠ 功能正确。没有运行时证据的"通过"是虚假安全感。P8 的标准是端到端闭环——证据在哪？
