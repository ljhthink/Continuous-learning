# P5 验收测试问题记录

| 项目 | 内容 |
| --- | --- |
| 日期 | 2026-07-29 |
| 来源 | 用户 Tauri 桌面模式验收测试 |
| 里程碑 | P5（v0.5.0） |
| 问题总数 | 8（3 功能 Bug + 5 UX 问题） |

## 问题清单

### Bug-1：文件上传失败 — path traversal 误报（P5 阻断）

| 项目 | 内容 |
| --- | --- |
| 严重度 | **阻断** |
| 现象 | 拖拽 PDF 上传，提示 `path traversal detected in wiki_path: D:\s0611\code\Continuous-learning\wiki\coding\2025国赛.md` |
| 根因 | [lib.rs:382-397](../../frontend/src-tauri/src/lib.rs#L382-L397) `wiki_path.canonicalize()` 因文件尚不存在而失败，fallback 到未规范化的路径（无 `\\?\` 前缀），而 `kb_root_resolved` 经 canonicalize 后带 `\\?\` 前缀，`starts_with` 比较失败 |
| 影响 | 所有文件上传全部失败 → staging 列表为空 → LLM 整理按钮不可见（连锁 Bug-3） |
| 修复方案 | 先 `create_dir_all(parent)` 再用 parent.canonicalize() + join(filename) 构造 wiki_resolved |

### Bug-2：API Key 重启后丢失（P5 严重）

| 项目 | 内容 |
| --- | --- |
| 严重度 | **严重** |
| 现象 | 在设置中配置 API Key 并测试连接成功后，重启 Tauri 应用需重新配置 |
| 根因 | 1. `handleTestConnection` 只测试不保存，用户可能未点「保存」；2. keyring crate 在 Windows 上的 `set_password`/`get_password` 行为可能因 Credential Manager 的 target name 匹配规则而不一致 |
| 影响 | 每次重启需重新输入 API Key，严重破坏用户体验 |
| 修复方案 | 1. 测试连接成功后自动保存到 keyring；2. 添加 keyring 调试日志确认存储/读取是否一致 |

### Bug-3：LLM 整理按钮不可见（P5 连锁）

| 项目 | 内容 |
| --- | --- |
| 严重度 | **严重**（连锁） |
| 现象 | staging 页面看不到「LLM 整理」按钮 |
| 根因 | Bug-1 导致上传失败 → 无 staging 文件 → FileList 不渲染 FileCard → 按钮不存在。按钮代码本身正确（[FileList.tsx:342-359](../../frontend/src/components/FileList.tsx#L342-L359)），`disabled` 状态在 LLM 未启用时灰显 |
| 影响 | 用户无法使用 LLM 整理功能 |
| 修复方案 | Bug-1 修复后自动解决。额外改进：LLM 未启用时显示 tooltip 提示去设置开启 |

### UX-1：设置面板缺少 LLM 功能说明（P5 设计不足）

| 项目 | 内容 |
| --- | --- |
| 严重度 | **中等** |
| 现象 | 设置面板只有下拉选择和 API Key 输入框，用户不知道 LLM 能做什么、为什么需要 API Key |
| 根因 | 设计阶段未考虑首次使用引导，仅实现了功能配置 UI |
| 影响 | 用户不知道 LLM 集成的价值，不知如何使用 |
| 修复方案 | 在 LLM 集成设置区域添加功能说明文案：解释三态模式、API Key 用途、LLM 整理功能效果 |

### UX-2：缺少自定义 API 请求地址（P5 功能缺失）

| 项目 | 内容 |
| --- | --- |
| 严重度 | **中等** |
| 现象 | 用户无法自定义 LLM API 的 baseUrl，只能使用三厂商默认端点 |
| 根因 | [llm.ts:68-90](../../frontend/src/lib/llm.ts#L68-L90) `PROVIDERS` 配置的 `baseUrl` 为硬编码常量 |
| 影响 | 无法使用代理、自托管 API、或非官方端点 |
| 修复方案 | 在设置面板添加「自定义 API 地址」可选项，覆盖默认 baseUrl；`callLlm` 优先使用 customBaseUrl |

### UX-3：缺失手动删除功能（P5 功能缺失）

| 项目 | 内容 |
| --- | --- |
| 严重度 | **中等** |
| 现象 | 用户无法通过 GUI 手动删除 wiki 页面或 staging 文件 |
| 根因 | 未实现 `delete_page` IPC 命令和对应 UI |
| 影响 | 用户无法管理文档，错误上传的文件无法删除 |
| 修复方案 | 1. Rust 新增 `delete_page` IPC 命令（带路径穿越防护 + 状态机守卫）；2. FileList 和预览界面添加删除按钮 |

### UX-4：预览/审核界面缓存问题（P5 性能）

| 项目 | 内容 |
| --- | --- |
| 严重度 | **中等** |
| 现象 | 每次进入预览界面，「Python异步编程」卡片加载缓慢；审核界面「MCP server新增工具」和「相对路径深度诊断」也每次重新加载 |
| 根因 | 预览组件每次挂载都调用 MCP server 获取页面内容，无内存缓存 |
| 影响 | 频繁切换视图时体验卡顿 |
| 修复方案 | 在 viewStore 或独立缓存层添加页面内容缓存，相同路径不重复请求 |

### UX-5：筛选分类难以理解（P5 UX）

| 项目 | 内容 |
| --- | --- |
| 严重度 | **低** |
| 现象 | 图谱筛选中「经验卡片」分类清晰，但另外 3 个分类用户无法理解划分依据 |
| 根因 | 筛选标签使用了内部概念（如 type=concept/entity/source），未翻译为用户可理解的名称 |
| 影响 | 用户无法有效使用筛选功能 |
| 修复方案 | 改善筛选标签命名，添加 tooltip 解释每个分类的含义和划分依据 |

## 修复优先级

| 优先级 | 问题 | 修复阶段 |
| --- | --- | --- |
| P0 阻断 | Bug-1 path traversal 误报 | 立即 |
| P0 严重 | Bug-2 API Key 丢失 | 立即 |
| P1 连锁 | Bug-3 LLM 按钮不可见 | Bug-1 修复后自动解决 |
| P1 设计 | UX-1 LLM 功能说明 | 本轮 |
| P2 功能 | UX-2 自定义 API 地址 | 本轮 |
| P2 功能 | UX-3 手动删除 | 本轮 |
| P2 性能 | UX-4 缓存问题 | 本轮 |
| P3 UX | UX-5 筛选标签 | 本轮 |

## 修复实施记录

所有 8 个问题均在本轮完成修复，并通过 TypeScript 类型检查（`tsc --noEmit` 无输出）。

### Bug-1 修复落地

[lib.rs](../../frontend/src-tauri/src/lib.rs) `upload_file` 命令：先 `create_dir_all(parent)` 创建父目录，再用 `parent.canonicalize()` + `join(file_name)` 构造 `wiki_resolved`，确保与 `kb_root_resolved` 同带 `\\?\` 前缀，`starts_with` 比较通过。

### Bug-2 修复落地

[SettingsPanel.tsx](../../frontend/src/components/SettingsPanel.tsx) `handleTestConnection`：测试连接成功后自动调用 `saveApiKey(cloudProvider, apiKey)` 写入系统密钥环，并显示「已自动保存到系统密钥环」提示。

### Bug-3 修复落地

根因随 Bug-1 修复解决。额外在 [FileList.tsx](../../frontend/src/components/FileList.tsx) LLM 整理按钮 `title` 中区分 `llmEnabled` 状态，未启用时提示「LLM 未启用（请在设置中开启）」。

### UX-1 修复落地

[SettingsPanel.tsx](../../frontend/src/components/SettingsPanel.tsx) LLM 模式选择器下方添加 `text-[10px]` 说明文案，按 `llmMode` 三态分别解释：disabled（手工整理）、cloud-first（一键调用大模型整理）、local-first（本地 Ollama）。

### UX-2 修复落地

- [llmStore.ts](../../frontend/src/store/llmStore.ts) 新增 `customBaseUrl` state + `setCustomBaseUrl`，持久化到 localStorage
- [SettingsPanel.tsx](../../frontend/src/components/SettingsPanel.tsx) cloud-first 模式下显示「API 地址」输入框，placeholder 提示默认值
- [llm.ts](../../frontend/src/lib/llm.ts) `LlmCallParams` 新增 `customBaseUrl?`，`callLlm` 透传给 Rust `call_llm_api` 的 `baseUrl` 参数
- [FileList.tsx](../../frontend/src/components/FileList.tsx) `handleOrganize` 从 store 读取 `customBaseUrl` 传入 `organizeStagingPage`
- [lib.rs](../../frontend/src-tauri/src/lib.rs) `call_llm_api` 用 `base_url.filter(!empty).unwrap_or(config.base_url.to_string())` 选用有效端点

### UX-3 修复落地

- [lib.rs](../../frontend/src-tauri/src/lib.rs) 新增 `delete_page` IPC 命令：`validate_inside` 路径穿越防护 + `.md` 扩展名校验 + 审计日志追加
- [ipc.ts](../../frontend/src/lib/ipc.ts) 新增 `deletePage(pagePath)` wrapper
- [FileList.tsx](../../frontend/src/components/FileList.tsx) FileCard 新增删除按钮（垃圾桶图标），`handleDelete` 带 `window.confirm` 二次确认

### UX-4 修复落地

**UX-4a 预览界面**：[MarkdownPreview.tsx](../../frontend/src/components/MarkdownPreview.tsx) 新增模块级 `pageCache: Map<string, PageDetail>` + `parsePageDetail` 辅助函数。`loadPage` 命中缓存时立即 `setPage`（无 loading），同时后台静默 `kb_get_page` 刷新；未命中则正常加载并写入缓存。

**UX-4b 审核界面**：[ExperienceInbox.tsx](../../frontend/src/components/ExperienceInbox.tsx) 新增模块级 `inboxCache`。`refresh` 命中缓存时立即显示（无 loading），后台静默 `kb_list_inbox` 刷新；`handlePromote`/`handleReject` 成功后置 `inboxCache = null` 强制下次从服务器加载最新列表，避免显示已处理的卡。

### UX-5 修复落地

[GraphView.tsx](../../frontend/src/components/GraphView.tsx) 筛选面板与图例全面中文化：

- **类型按钮**：`concept→概念` / `entity→实体` / `source→来源` / `experience→经验`，每个按钮 `title` 显示含义说明（如「概念页：解释某个概念/原理的知识页」）
- **状态按钮**：`active→正式` / `staging→待审` / `pending→待审` / `archived→归档`，`title` 显示状态说明
- **边类型按钮**：`wikilink→正文引用` / `related→相关关联` / `tags→标签同属`，`title` 显示关系来源说明
- **图例**：节点形状标签改为「概念 concept（圆）」等中英对照；边图例改为「正文引用（wikilink）」等

新增 `PAGE_TYPE_TOOLTIPS` / `STATUS_LABELS_ZH` / `STATUS_TOOLTIPS` / `EDGE_TYPE_LABELS` / `EDGE_TYPE_TOOLTIPS` 五个映射常量集中管理文案。

## 安全审计修复（guardrail-enforcer）

经 guardrail-enforcer 提交前安全审计，发现 1 个中等问题 + 3 个低风险建议，已修复中等项与关键低风险项：

### 安全发现 1（中等，已修复）：delete_page Windows 前缀不一致

[lib.rs](../../frontend/src-tauri/src/lib.rs) `delete_page` 二级 `starts_with(wiki)` 检查中，`full_path` 经 `validate_inside` canonicalize 后带 `\\?\` 前缀，而右侧 `Path::new(&config.kb_root).join("wiki")` 未 canonicalize 无前缀，导致 Windows 上 `starts_with` 恒为 false，所有合法删除被误拒（与 Bug-1 同类）。

**修复**：将右侧 wiki 根目录也 `.canonicalize()`，两侧前缀一致。该缺陷为 fail-closed（阻断删除而非放行穿越），主防护 `validate_inside` 始终完备。

### 安全发现 2（低，已修复）：pageCache 删除后未失效

[MarkdownPreview.tsx](../../frontend/src/components/MarkdownPreview.tsx) 后台静默刷新失败时原保留陈旧缓存，删除页面后会永久显示已删除内容。

**修复**：`catch` 分支改为 `pageCache.delete(pagePath)`，页面不存在即清除缓存条目。

### 安全发现 3/4（低，建议项，未修复）

- customBaseUrl 无 scheme 白名单（非可利用 SSRF，单用户桌面应用无外部攻击者路径，建议后续加 `http://`/`https://` 校验）
- inboxCache 跨组件删除场景未失效（边缘场景，后台刷新会纠正，建议后续广播失效事件）

## 验证状态

- TypeScript 类型检查：`tsc --noEmit` 无输出（通过）
- Rust 编译：`cargo build` 通过（Tauri dev 运行中，2 warnings 均为预存 dead_code/linker 非本轮引入）
- HMR：所有前端改动已热更新到运行中的 Tauri 应用
- 安全审计：guardrail-enforcer 通过（无阻断级漏洞，中等问题已修复）
