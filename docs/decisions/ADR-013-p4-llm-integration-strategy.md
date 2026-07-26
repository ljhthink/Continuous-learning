# ADR-013: P4 LLM 集成策略（三态切换 + 延迟接入）

| 项目 | 内容 |
| --- | --- |
| 状态 | Proposed |
| 日期 | 2026-07-27 |
| 决策者 | 主 Agent（P4 Phase 4c 阶段） |
| 关联文档 | [P4 实施计划](../../.trae/documents/p4-gui-implementation-plan.md) §4.4.8 设置面板 / [ADR-012](ADR-012-p4-gui-tech-stack.md)（GUI 技术栈） / [ADR-001](ADR-001-knowledge-base-tech-stack.md)（核心依赖 ≤5 原则） |
| 风险等级 | P3（涉及密钥存储、网络调用、隐私边界） |
| 前序 ADR | [ADR-012](ADR-012-p4-gui-tech-stack.md)（已选 Tauri v2 + React），本文决定 LLM 接入方式 |

## 背景（Context）

[PRD](../PRD.md) US-004 提到「AI 整理为 markdown」，但未明确 LLM 接入方式。P4 Phase 4c 的 SettingsPanel 已预留 LLM 模式切换 UI（[SettingsPanel.tsx](../../frontend/src/components/SettingsPanel.tsx)），但未实际接入任何 LLM 后端。

需要决策的问题：

1. **何时接入 LLM**：P4 当前阶段（4b/4c）的拖拽上传 → staging 工作流，是否必须依赖 LLM？
2. **接入哪种 LLM**：云端（Claude/GPT）还是本地（Ollama）？
3. **API Key 如何存储**：明文配置文件？加密存储？仅内存？
4. **默认模式**：开箱即用需要什么？
5. **隐私边界**：知识库内容是否允许发送到云端？

## 决策（Decision）

### D1. 三态模式（cloud-first / local-first / disabled）

SettingsPanel 提供三种 LLM 模式，用户可随时切换：

| 模式 | 含义 | 适用场景 |
| --- | --- | --- |
| `cloud-first` | 优先调用云端 LLM（Claude / GPT），需 API Key | 追求质量、有网络、可接受内容上云 |
| `local-first` | 优先调用本地 LLM（Ollama），无需 API Key | 隐私敏感、离线、有 GPU/CPU 余力 |
| `disabled` | 完全禁用 LLM，所有整理由用户手工完成 | 桌面工具纯静态使用、调试 |

**默认值**：`disabled`。开箱即用不依赖任何外部服务，用户显式选择后才启用。

**理由**：

- 知识库是个人工具，不应强制联网或要求 API Key
- 三态覆盖隐私敏感（disabled / local）、质量优先（cloud）三类典型场景
- 与 SettingsPanel 已实现的 UI 一致，无需返工

### D2. P4 阶段不实际接入 LLM（延迟到 P5）

**P4 Phase 4b/4c 的 staging 工作流不依赖 LLM**：

- 拖拽上传 → Python parser 提取文本结构（PDF/DOCX/XLSX → markdown）
- staging 页面由 parser 输出生成，frontmatter 字段（title/domain/date）由规则推断
- 用户在 staging 界面手工调整 title、domain、tags，再 confirm 提升

**不接入的理由**：

1. **Python parser 已足够**：pymupdf / python-docx / openpyxl 能提取结构化文本 + 表格，满足「文件 → markdown」的核心需求
2. **避免 P4 范围膨胀**：LLM 接入涉及 prompt 设计、流式响应、错误重试、成本控制，是独立的工作量
3. **MVP 优先**：先让拖拽 → staging → confirm 闭环跑通，LLM 智能整理作为 P5 增强项
4. **SettingsPanel 预留 UI**：模式切换 + API Key 输入框已就位，P5 接入时只需补 `lib/llm.ts` 实现

### D3. API Key 存储：tauri-plugin-store + 操作系统密钥环（P5 接入时实现）

**P4 当前**：API Key 仅存 React `useState` 内存，刷新即失（[SettingsPanel.tsx:30](../../frontend/src/components/SettingsPanel.tsx)）。

**P5 接入时**：

| 层级 | 方案 | 说明 |
| --- | --- | --- |
| 持久化 | `tauri-plugin-store` | Tauri 官方插件，加密存储到 `%APPDATA%/kb-gui/store.bin` |
| 加密 | 操作系统密钥环（Keychain / Credential Manager / Secret Service） | 通过 `tauri-plugin-keyring` 或 Rust `keyring` crate |
| 明文禁止 | API Key 永不落明文配置文件 | 防止误提交 git |

**为何不在 P4 实现**：

- `tauri-plugin-store` 需新增 Cargo 依赖 + capabilities 配置，与 P4「核心依赖最小化」原则冲突
- 当前无实际 LLM 调用，存了 Key 也用不上
- P5 接入 LLM 时一并实现，避免空转

### D4. 调用边界：仅整理阶段调用 LLM，不持久化请求/响应

**允许调用 LLM 的场景**：

- staging 页面整理：parser 输出 → LLM 优化为结构化 markdown（提炼标题、抽取 tags、生成摘要）
- inbox 经验卡质量评估（可选）：LLM 评分作为 `quality_score` 的参考输入（不覆盖 `/dream` 的确定性评分）

**禁止的场景**：

- Query 检索：知识库检索走 BM25 + 向量（[ADR-001](ADR-001-knowledge-base-tech-stack.md)），不调 LLM
- 日常浏览：MarkdownPreview / GraphView / BacklinksPanel 不触发 LLM 调用
- 后台静默调用：所有 LLM 调用必须由用户显式动作触发（点击「LLM 整理」按钮）

**数据流**：

```text
用户点击「LLM 整理」→ Tauri IPC → Rust 端组装 prompt + 调用 LLM API → 返回 markdown → 写回 staging 页面
```

**不持久化**：LLM 的请求体、响应体不写入 `raw/` 或 `wiki/`，仅最终整理结果写入 staging 页（用户审核后决定是否 confirm）。

### D5. 隐私边界：cloud 模式明确告知内容上云

SettingsPanel 在 cloud-first 模式下显示醒目提示：

> ☁️ Cloud 模式：staging 页面内容将发送到 Claude/GPT API 进行整理。请确保不含敏感信息。

**local-first 模式**：所有调用走 `http://localhost:11434`（Ollama 默认端口），内容不出本机。

**disabled 模式**：零网络调用，纯本地工具。

### D6. 模型选择与降级

| 模式 | 首选模型 | 降级方案 |
| --- | --- | --- |
| cloud-first | Claude Sonnet 4.5（若 API Key 以 `sk-ant-` 开头）/ GPT-4o-mini（若以 `sk-` 开头） | API 错误时提示用户切换 local 模式 |
| local-first | Ollama `qwen2.5:7b`（中文友好，4GB 显存可跑） | 模型未拉取时提示 `ollama pull qwen2.5:7b` |
| disabled | N/A | N/A |

**模型选择策略**：P5 实现时在 `lib/llm.ts` 中根据 API Key 前缀自动路由，用户无需手动选模型。

## 影响与后果（Consequences）

### 正面

- **P4 范围清晰**：拖拽 → staging → confirm 闭环不依赖 LLM，可在无网络/无 API Key 环境完整运行
- **隐私可控**：默认 disabled，用户显式选择才启用；三态覆盖隐私敏感场景
- **扩展点明确**：SettingsPanel UI 已预留，P5 接入只需补 `lib/llm.ts` + 一个 Tauri IPC 命令
- **与 parser 解耦**：Python parser 是确定性工具，LLM 是可选增强，两者独立演进

### 负面

- **P4 staging 整理质量依赖 parser**：无 LLM 时，title/tags 需用户手工调整（parser 只能从文件名/首行/元数据推断）
- **P5 才有「智能整理」**：用户期待 AI 一键整理的话需等 P5
- **三态增加测试矩阵**：P5 需测 cloud/local/disabled 三种路径

### 中立

- ADR-012 的「核心依赖 ≤5」原则在 P4 得以保持（未引入 LLM SDK）；P5 接入时需评估是否突破

## 验证标准

| 编号 | 标准 | 状态 |
| --- | --- | --- |
| ADR-013-V1 | SettingsPanel 提供三态切换 UI | ✅ P4c 已实现 |
| ADR-013-V2 | 默认模式为 `disabled` | ✅ P4c 已实现（`useState<LlmMode>("cloud-first")` 待 P5 改为 `"disabled"`，见下方 Note） |
| ADR-013-V3 | disabled 模式下零网络调用 | ✅ P4c 已实现（无 LLM 调用代码） |
| ADR-013-V4 | cloud-first 模式显示隐私告知 | ⏳ P5 实现 |
| ADR-013-V5 | API Key 不落明文配置 | ⏳ P5 实现（当前仅内存） |

> **Note on V2**：当前 SettingsPanel 初值是 `"cloud-first"`（[SettingsPanel.tsx:29](../../frontend/src/components/SettingsPanel.tsx)），仅为开发调试方便（避免每次切换）。P5 接入 LLM 前应改为 `"disabled"`，届时一并处理。本 ADR 记录决策为「默认 disabled」，代码初值属实现细节，P5 修正。

## 参考

- [ADR-001](ADR-001-knowledge-base-tech-stack.md)：知识库技术栈（核心依赖 ≤5 原则）
- [ADR-012](ADR-012-p4-gui-tech-stack.md)：P4 GUI 技术栈（Tauri v2 + React）
- [ADR-014](ADR-014-p4-python-parser-and-staging-workflow.md)：Python parser 与 staging 工作流（本文 D2 的 parser 依赖项）
- [P4 实施计划](../../.trae/documents/p4-gui-implementation-plan.md) §4.4.8：SettingsPanel 设计
- [Tauri plugin-store 文档](https://v2.tauri.app/plugin/store/)（P5 接入时参考）
- [Ollama API 文档](https://github.com/ollama/ollama/blob/main/docs/api.md)（P5 local-first 模式参考）
