# 安全与质量审计报告 · P4 Phase 4a（Tauri 骨架 + 设计系统 + 10 静态组件）

> 由 `guardrail-enforcer`（代码安全护栏）子 Agent 产出，遵循 CLAUDE.md §10 + §20.4 规约。
> 本报告覆盖代码质量审查（等效 TRAE-code-review）与安全漏洞扫描（等效 TRAE-security-review）双重职责。

## 元信息

| 项目 | 内容 |
| --- | --- |
| 执行 Agent | guardrail-enforcer（代码安全护栏） |
| 任务令牌 | TKN-P4-GUI-4A-001（主 Agent 未显式签发，本报告按 §20.4 补登，需主 Agent 追认） |
| 任务域 | P4 Phase 4a · Tauri v2 + React 19 + Vite 7 + TailwindCSS 3.4 桌面骨架 |
| 报告日期 | 2026-07-26 |
| 审查范围 | frontend/ 全量新增（17 配置/源码 + 12 组件 + 1 CI + 1 ADR + README 更新 + CREDITS） |
| 风险等级 | P3（新框架 Tauri + 全新 frontend/ 目录；但 4a 仅静态组件，实际暴露面按 P1 审计） |
| 主 Agent 签发上下文 | 盲区①TS 类型运行时行为未测；盲区②暗色主题 CSS 变量绑定完整性；盲区③tauri dev 未实际运行；盲区④GraphView SVG mock 设计意图符合性。遗憾：未运行 tauri dev、CSP=null 待收紧、CI tauri-check 依赖系统包可能拖慢。 |

## 1. 审查依据

- 本次代码变更：`frontend/`（全新目录，untracked）+ `.github/workflows/frontend-ci.yml`（新增）+ `docs/decisions/ADR-012-*.md`（新增）+ `docs/decisions/README.md`（修改）
- 影响自检结果：主 Agent 自检「无接口/契约变更、无依赖增删、无跨模块 BREAKING」——经核验属实
- 相关 ADR：`docs/decisions/ADR-012-p4-gui-tech-stack.md`（Proposed）、`docs/decisions/ADR-001-knowledge-base-tech-stack.md`（Accepted，决策 B 已预选 Tauri v2）
- 安全策略文件：`CLAUDE.md` §10（guardrail 强制）、§18（依赖管理）、§19（错误处理）、§20（配置与密钥）、§20.4（任务令牌）；`AGENTS.md`（frontmatter schema 与领域分类）
- code-archaeologist 报告：无（全新目录，无遗留代码需考古）
- 测试框架与基础用例：无（4a 为静态组件骨架，主 Agent 未提供测试用例；按 §16.2 P0 快速审查标准，4a 静态 UI 可不强制 ac-verifier，但需在 4b 接入 IPC 前补齐）

## 2. 代码质量审查（等效 TRAE-code-review）

### 2.1 Karpathy Guidelines 合规性

| 项 | 结论 | 说明 |
| --- | --- | --- |
| 命名 | ✅ | 组件 PascalCase、函数 camelCase、常量 UPPER_SNAKE_CASE、文件 kebab-case，与 AGENTS.md §2.1 一致 |
| 设计简洁性 | ✅ | 每组件单一职责；App.tsx 拆分 MainContent/RightPanel/GraphStats/StatRow 子组件合理；viewStore 自定义路由无 React Router 嵌套，符合 ADR-012 D2 决策 |
| 错误处理 | ⚠️ | 见 2.2「非空断言」中风险；GraphView 已对 layout 缺失做 `if (!source \|\| !target) return null` 防御（GraphView.tsx:210, 251），但 nodes.find().! 断言未防御 |
| 假设显式化 | ✅ | 每个组件头部 JSDoc 标注 P4 计划段落、4a/4b/4c 阶段边界、数据源；mockData.ts 标注「基于 P3 完成时真实 KB 拓扑」 |

### 2.2 逻辑与性能

| 编号 | 严重度 | 位置 | 问题 | 证据 |
| --- | --- | --- | --- | --- |
| Q-1 | 中 | `frontend/src/components/GraphView.tsx:91` | 非空断言 `mockGraphData.nodes.find((n) => n.id === e.source)!.domain` 两次。当前 mock 引用完整（已脚本验证 missing_source_refs/missing_target_refs 均空），但 4b/4c 接入真实 MCP 数据后，若边引用了已删除节点，运行时崩溃（Cannot read 'domain' of undefined）。 | `visibleEdges` 过滤器内联 find+! |
| Q-2 | 中 | `frontend/src/components/GraphView.tsx:238` | 同上，`mockGraphData.nodes.find((n) => n.id === focusedNodeId)!.inDegree` 非空断言。 | 脉冲外环 r 计算 |
| Q-3 | 中 | `frontend/src/components/StatusBar.tsx:21` | `Object.values(summary.domains).reduce((a, b) => a + b, 0) - 37 + 4` 硬编码 37（节点数）与 4（经验卡数）做反向减法。若 domains 统计或节点数变化，计算错误。应为 `mockCategories.reduce((a,c)=>a+c.experienceCount,0)`。 | totalExperiences 计算 |
| Q-4 | 中 | `frontend/src/data/mockData.ts:148-155` | summary 与实际 edges 数组不一致：声明 `totalEdges:56 / byEdgeType.wikilink:40`，但脚本实测 `wikilink=44 / related=12 / tags=4 / total=60`。StatusBar 与 GraphStats 显示的统计数与实际渲染边数不符（显示 56 但 SVG 实际画 60 条边）。 | 脚本验证：nodes=37（含 2 个 StagingFile id 被误匹配，实际 GraphNode=37 ✓）、wikilink_actual=44 |
| Q-5 | 低 | `frontend/src/components/LogTimeline.tsx:66` | `key={idx}` 使用数组索引作 key。mock 静态可接受，但 4c 接入 kb_list_recent 后若列表重排会导致 React 渲染错位。建议用 `entry.date + entry.title` 组合键。 | filtered.map key |
| Q-6 | 低 | `frontend/src/components/TopBar.tsx:11-16` 与 `frontend/src/components/CategoryTree.tsx:12-17` | `VIEW_BUTTONS`/`VIEW_SWITCHER` 常量内容完全重复。建议提取到 `@/types` 或 `@/constants`。 | 两处定义相同 4 项 |
| Q-7 | 低 | `frontend/src/components/GraphView.tsx:91` | 性能：对每条边执行两次 `nodes.find`（O(n)），56 边×37 节点×2=4144 次查找，4a 可接受；4c 大规模数据需改为 Map<id,node> 查找。 | visibleEdges 过滤 |

### 2.3 跨模块影响识别

- `frontend/` 为全新目录，与现有 MCP server（`mcp-server/`）、`wiki/` 内容物理隔离。4a 仅 import mock 数据，不调用 MCP/不读写 wiki/。✅
- `mockData.ts` 是 P3 KB 拓扑的静态快照副本，不修改 `wiki/` 原始内容。✅
- `.github/workflows/frontend-ci.yml` 触发路径 `frontend/**`，与 `docs.yml` 触发路径 `**/*.md` 不冲突；但 ADR-012 与 README.md 是 .md，会触发 docs.yml markdownlint+lychee+consistency-check，属预期。✅
- ADR-012 与 ADR-001 决策 B（Tauri v2）一致，未引入冲突；`package.json` dependencies 正好 5 个（@tauri-apps/api、@tauri-apps/plugin-opener、react、react-dom、zustand），符合 ADR-001「核心依赖 ≤5」原则。✅

### 2.4 测试框架充分性

- 4a 阶段主 Agent 未提供测试用例。按 CLAUDE.md §16.2，4a 静态 UI 骨架属 P1 实际暴露面，可暂不强制 ac-verifier，但 **4b 接入 IPC 前**必须补齐组件单测（react-testing-library）+ 类型契约测试。
- 已完成的构建验证：`pnpm build`（tsc + vite build，249KB/74KB gzip）✅、`cargo check`（459 packages，4min）✅、修复 2 处 TS6133 ✅。
- **缺口**：未运行 `tauri dev` 实际启动窗口；未运行 `pnpm audit`/`cargo audit`。

## 3. 安全漏洞扫描（等效 TRAE-security-review）

### 3.1 OWASP Top 10 / CWE 扫描结果

| OWASP | CWE | 严重度 | 位置 | 结论 |
| --- | --- | --- | --- | --- |
| A03 注入 | — | — | 全量 | 4a 无 SQL/NoSQL/命令/代码/模板注入面。Rust `greet`（lib.rs:3-5）用 `format!` 拼接 `name` 但仅返回 String，不执行；无 `eval`/`new Function`/`system`/`exec`（已 grep 确认）。✅ |
| A03 XSS | CWE-79 | 低 | MarkdownPreview.tsx:154-199 renderInline | React JSX 自动转义所有插值；无 `dangerouslySetInnerHTML`/`innerHTML`/`document.write`（已 grep 确认空）。4c 接入 react-markdown 时需确认 rehype-raw 默认关闭。✅ |
| A05 安全配置错误 | CWE-693 | 高 | tauri.conf.json:24-26 | `"csp": null` 允许任意远程脚本/inline script/eval。4a 静态 UI 无外部输入处理，风险可控；但 **4b/4c 接入 IPC 与用户内容后必须收紧**为显式 CSP 白名单。见 S-1。 |
| A05 安全配置错误 | CWE-732 | 中 | frontend-ci.yml | 未显式设置 `permissions:`，GitHub Actions PR 事件默认 `contents:read` 但 push 事件默认 `contents:write`。构建 job 不需要 write 权限。见 S-2。 |
| A08 软件完整性 | CWE-353 | 中 | index.html:10-21 | Google Fonts/Material Symbols CDN 加载无 `integrity` SRI 属性。CDN 被劫持可注入恶意 CSS/JS。桌面应用风险低于 Web，但仍是隐患。见 S-3。 |
| A09 日志/监控 | — | — | 全量 | 4a 无结构化日志（前端 console 无），无敏感信息输出。✅ |
| A07 认证失败 | — | — | SettingsPanel.tsx:17,97-103 | apiKey 仅存 React state，4a 不持久化、不外传。placeholder `sk-...` 为提示非真值。4c 接入 tauri-plugin-store 时需加密存储。✅（4a） |
| A02 加密失败 | CWE-312 | 低 | SettingsPanel.tsx:97 | apiKey 输入框 `type="password"` 正确遮蔽。4c 持久化需用 OS keychain/加密 store。✅（4a） |

### 3.2 输入与边界审计（Stage 1）

#### 1.1 数值与类型边界
- App.tsx:39-43 快捷键 `["1","2","3","4"].includes(e.key)` 后 `parseInt(e.key,10)-1`，includes 已限定范围，索引 0-3 落在 views 数组内。✅
- GraphView.tsx:33 `nodeRadius = Math.max(6, Math.min(24, Math.sqrt(inDegree+1)*4))`，上下界 [6,24] 显式 clamp。✅
- GraphView.tsx:52 `localR = Math.min(60, domainNodes.length*8)`，上界 60。✅
- FileList.tsx:20-24 `formatSize` 三档边界正确（<1024 B / <1MB KB / else MB）。✅
- StatusBar.tsx:21 硬编码 37+4 反向减法，见 Q-3。⚠️

#### 1.2 集合与缓冲区边界
- GraphView.tsx:91,238 非空断言 `!`，见 Q-1/Q-2。⚠️
- GraphView.tsx:210,251 `if (!source\|\|!target) return null` / `if (!pos) return null` 已防御 layout 缺失。✅
- MarkdownPreview.tsx:159 `while (remaining.length>0)` 循环，每轮 `remaining.slice(...)` 必推进，无死循环。✅
- SearchBar.tsx:52 `slice(0,10)` 限制结果数。✅
- ExperienceInbox.tsx:16 `mockExperienceCards[selectedIdx]` 返回 `ExperienceCard \| undefined`，line 59 `{selected && (...)}` 已防御 undefined。✅

#### 1.3 业务状态机约束
- types/index.ts PageStatus/ViewName/GraphMode 枚举与 AGENTS.md §3.4 状态机一致。✅
- MarkdownPreview.tsx:46-53 仅区分 active / 非 active 两态（staging/pending/archived/rejected 统一 warning 样式），4a 简化可接受。✅
- GraphView.tsx:269-272 区分 archived（fillOpacity 0.2）/ staging（dash 4 2）/ pending（dash 2 2）/ 默认。✅
- 无绕过状态机的直接字段修改路径（viewStore 通过 set 方法封装）。✅

### 3.3 执行安全审计（Stage 2）

- **注入防护**：无 SQL 拼接、无 `system`/`exec`、无 `eval`/`Function`、无模板引擎注入。Rust `greet` 返回 String 不执行。✅
- **最小权限**：
  - Tauri capabilities `core:default + opener:default`。`opener` 插件 4a 未实际调用（lib.rs:10 init 但前端无 invoke），可移除但属 Tauri 默认模板，风险低。见 S-4。
  - frontend-ci.yml 未设 `permissions`，见 S-2。
  - 容器化：N/A（桌面应用，非容器部署）。
- **输出编码**：React JSX 自动转义；LogTimeline.tsx:80 与 GraphView.tsx:156 的 `color-mix(in srgb, ${...} 15%, transparent)` 插值源为硬编码 CSS 变量/色值，非用户输入。✅
- **Rust 内存安全（Stage 3）**：lib.rs/main.rs 极薄（<20 行），无 `unsafe`、无 FFI、无裸指针。`format!` 宏返回 String 无泄漏。Cargo.toml 未显式配置 LTO/strip（Release 构建建议补 `[profile.release] lto=true`，低风险建议）。✅

### 3.4 密钥与配置安全（Stage 4）

- **硬编码密钥扫描**：已 grep `password|secret|token|api[_-]?key|sk-[a-zA-Z0-9]{20}|Bearer `，仅命中 SettingsPanel.tsx 的 apiKey 变量声明与 input（预期，初始空串，无真值）。✅
- **敏感配置**：tauri.conf.json identifier `com.ljh.continuous-learning` 是反向域名应用标识，非敏感。无内部 IP/域名硬编码。✅
- **.gitignore**：已覆盖 `.env`/`.env.local`/`.env.*.local`/`!.env.example`、`node_modules/`、`dist/`、`target/`、`*.log`、`logs/`。✅
- **锁文件提交状态**：`pnpm-lock.yaml` 与 `Cargo.lock` 存在但 `git ls-files` 返回空（frontend/ 整体 untracked）。**commit 时必须 `git add` 这两个锁文件**，否则违反 CLAUDE.md §18.3「所有依赖必须提交锁文件」。见 S-5。
- **CDN SRI**：见 S-3。

### 3.5 依赖与供应链风险（Stage 5）

- `package.json` dependencies 5 个（符合 ADR-001 ≤5）：@tauri-apps/api ^2、@tauri-apps/plugin-opener ^2、react ^19.1.0、react-dom ^19.1.0、zustand ^5.0.14。均为活跃维护、宽松 License（MIT/Apache-2.0）、广泛采用。✅
- 版本范围用 `^`（允许 minor 升级），pnpm-lock.yaml 锁定具体版本保证可复现。CLAUDE.md §18.5 建议关键依赖固定版本，但锁文件已满足可复现性。✅
- **未运行 `pnpm audit`/`cargo audit`**：建议主 Agent 执行 `cd frontend && pnpm audit` 与 `cd frontend/src-tauri && cargo audit`。见 S-6。
- **Dependabot**：CLAUDE.md §18.4 要求配置。需确认 `.github/dependabot.yml` 是否已纳入 frontend/npm 与 cargo 生态系统监控。见 S-7。
- Cargo.toml 依赖：tauri 2、tauri-plugin-opener 2、serde 1、serde_json 1，均成熟。✅

## 4. 综合结论

- [x] **通过**（R2 复审 2026-07-26：§5.1 低成本项已修复并经本 Agent 实读代码验证）
- [ ] **有条件通过**
- [ ] **阻断**

**判定依据**：
- 无 blocking 级安全漏洞（无注入、无硬编码密钥、无命令执行、无 XSS 转义缺口）。
- 1 项高风险（S-1 CSP null）在 4a 静态阶段风险可控，已锁定为 4b 必修项，不构成 4a 阻断。
- §5.1 三项低成本中风险（S-2 CI 权限、Q-3 StatusBar 硬编码、Q-4 mock summary 不一致）已于 R2 修复并经本 Agent 实读代码验证通过；S-5（锁文件 git add）为主 Agent commit 时承诺项。
- 代码质量整体良好：TS strict 全开、无 any 滥用、React hooks 依赖数组正确、错误处理基本到位。
- 修复未引入新安全问题：三处变更均为数值/配置修正，不涉及新输入处理、新依赖、新执行路径。

## 5. 阻塞项与回退指令

> R2 结论为「通过」，不触发 CLAUDE.md §7.2 全量回退闭环。4a 阶段可进入测试/合并；以下项按阶段修复并复检（S-5 为 commit 前必做，§5.2 为 4b 硬门禁，§5.3 为 4c 建议）。

### 5.1 4a 阶段建议立即修复（commit 前低成本修正）

| 编号 | 类型 | 问题 | 修复建议 | R2 状态 |
| --- | --- | --- | --- | --- |
| S-5 | 中·配置 | pnpm-lock.yaml / Cargo.lock 未 git add | `git add frontend/pnpm-lock.yaml frontend/src-tauri/Cargo.lock`，确保提交 | ⏳ 主 Agent 承诺 commit 时执行 |
| S-2 | 中·CI | frontend-ci.yml 未设 permissions | 顶层加 `permissions: { contents: read }` | ✅ R2 已修复验证（frontend-ci.yml:13-14） |
| Q-4 | 中·数据 | mockData.ts summary 与 edges 数组不一致（56/40 vs 60/44） | 将 summary 改为 `totalEdges:60, byEdgeType:{wikilink:44,related:12,tags:4}` | ✅ R2 已修复验证（mockData.ts:150-151，44+12+4=60 一致） |
| Q-3 | 中·代码 | StatusBar 硬编码 37+4 反向减法 | 改为 `mockCategories.reduce((a,c)=>a+c.experienceCount,0)` | ✅ R2 已修复验证（StatusBar.tsx:8,21，结果=4 正确） |

### 5.2 4b 阶段必须修复（接入 IPC 前）

| 编号 | 类型 | 问题 | 修复建议 |
| --- | --- | --- | --- |
| S-1 | 高·配置 | tauri.conf.json `csp: null` | 改为显式 CSP，如 `"csp": "default-src 'self'; img-src 'self' data: https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'"`（4c 本地化字体后可进一步收紧） |
| Q-1/Q-2 | 中·健壮性 | GraphView 非空断言 `!` | 改为 `const srcNode = nodes.find(...); if (!srcNode) return null;` 防御式；或预建 `Map<id, node>` |
| S-6 | 低·供应链 | 未跑 audit | 4b 接入真实数据前执行 `pnpm audit` + `cargo audit` 并纳入 CI |

### 5.3 4c 阶段建议修复

| 编号 | 类型 | 问题 | 修复建议 |
| --- | --- | --- | --- |
| S-3 | 中·完整性 | CDN 无 SRI | 4c 字体本地化后消除；或为 CDN link 加 `integrity` + `crossorigin` |
| S-4 | 低·权限 | opener 插件未使用 | 4c 若仍不用则从 Cargo.toml/capabilities 移除 opener |
| Q-5 | 低·React | LogTimeline key={idx} | 改用 `entry.date+entry.title` 组合键 |
| Q-6 | 低·重复 | TopBar/CategoryTree 常量重复 | 提取到 `@/constants/views.ts` |
| Q-7 | 低·性能 | GraphView find O(n) | 预建 Map<id,node> |
| S-7 | 低·供应链 | Dependabot 覆盖 | 确认 `.github/dependabot.yml` 含 npm + cargo 生态 |

## 6. 保护机制验证

| 机制 | 配置位置 | 验证结果 |
| --- | --- | --- |
| TS strict | tsconfig.json:18 `strict:true` + `noUnusedLocals/Parameters/FallthroughCases` | ✅ 生效，`pnpm build` tsc 通过 |
| React StrictMode | main.tsx:7 `<React.StrictMode>` | ✅ 启用，开发期双调用帮助发现副作用 |
| 路径别名 | tsconfig.json:25 `@/*` + vite.config.ts:14 alias | ✅ 一致 |
| Tauri 窗口约束 | tauri.conf.json:18-21 minWidth 1200/minHeight 720 | ✅ 防止窗口过小布局错乱 |
| .gitignore 覆盖 | .gitignore | ✅ 覆盖 env/dist/target/log/node_modules |
| Cargo 锁文件 | frontend/src-tauri/Cargo.lock | ⚠️ 存在但未 git add（S-5） |
| pnpm 锁文件 | frontend/pnpm-lock.yaml | ⚠️ 存在但未 git add（S-5） |
| Tauri CSP | tauri.conf.json:25 `csp:null` | ❌ 未启用（S-1，4a 容忍 4b 必修） |
| Rust unsafe | lib.rs/main.rs | ✅ 无 unsafe 块 |
| 编译安全标志 | Cargo.toml | ⚠️ 未配 `[profile.release] lto/strip`，低风险建议 |

## 7. 跨模块影响评估

| 维度 | 结论 |
| --- | --- |
| MCP server | ✅ 无影响。frontend/ 4a 仅 import mock，不调用 MCP。4b/4c 通过 sidecar/IPC 集成时再评估。 |
| wiki/ 内容 | ✅ 无影响。mockData.ts 是只读快照，不写 wiki/。 |
| docs.yml CI | ✅ 不冲突。frontend-ci.yml 触发 `frontend/**`；docs.yml 触发 `**/*.md`。ADR-012/README.md 会触发 docs.yml 属预期。 |
| ADR-012 vs ADR-001 | ✅ 一致。ADR-001 决策 B 已预选 Tauri v2，ADR-012 细化。核心依赖 5 个符合 ≤5。 |
| consistency-check | ✅ ADR-012 文件名合规 `ADR-NNN-<title>.md`；README.md 已追加索引行；报告全用相对路径（无绝对路径）。 |
| 任务令牌（§20.4） | ⚠️ 主 Agent 启动本子 Agent 时未签发任务令牌。本报告已补登 `TKN-P4-GUI-4A-001`，需主 Agent 追认。后续启动子 Agent 必须前置签发。 |

## 8. 待澄清

1. **ADR-012 状态为 Proposed**：按 §17.3，需 PR 评审通过后才 Accepted。本审计仅审查 ADR 内容完整性（备选方案✓、后果✓、验证✓、回退✓），不替代 PR 评审。合并前需更新 `docs/decisions/README.md` 状态为 Accepted。
2. **ADR-001「核心依赖 ≤5」的统计口径**：是针对单个子模块还是整个项目？frontend 5 个 + MCP server 现有依赖若合计超 5 是否违规？需主 Agent 澄清。当前判定 frontend 子模块维度合规。
3. **4a 是否需 ac-verifier**：CLAUDE.md §16.2 P1 需 ac-verifier，但 4a 为静态 UI 骨架无业务逻辑。建议 4a 跳过 ac-verifier，4b 接入 IPC 前补齐。需主 Agent 确认。
4. **tauri dev 未实际运行**：主 Agent 自述盲区。`cargo check` 仅验证编译，不验证窗口启动/WebView 渲染/拖拽事件。建议在合并前至少手动运行一次 `tauri dev` 截图存证。

## 9. 自动化建议（CI/CD 集成）

在 `frontend-ci.yml` 中追加安全扫描 job，作为 4b 前置门禁：

```yaml
  security-scan:
    name: Security Audit
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: frontend } }
    permissions: { contents: read }
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v7
        with: { node-version: '20', cache: 'pnpm', cache-dependency-path: 'frontend/pnpm-lock.yaml' }
      - run: pnpm install --frozen-lockfile
      - name: pnpm audit
        run: pnpm audit --prod --audit-level=high
        continue-on-error: true   # 4a 告警不阻断，4b 改为 false
      - name: tsc strict check
        run: pnpm exec tsc --noEmit
      - uses: dtolnay/rust-toolchain@stable
      - name: cargo audit
        run: cargo install cargo-audit --locked && cargo audit
        working-directory: frontend/src-tauri
        continue-on-error: true   # 4a 告警不阻断，4b 改为 false
      - name: Semgrep (TS/TSX)
        uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/typescript,
            p/react,
            p/owasp-top-ten
          paths: frontend/src
```

4b 阶段将 `continue-on-error` 改为 `false` 以强制门禁。

---

## 10. R2 复审记录（2026-07-26）

主 Agent 针对 R1「有条件通过」结论修复了 §5.1 全部 3 项代码低成本中风险，并提交 R2 复审。本 Agent 按零信任原则实读修复后代码逐项核验：

| 编号 | 验证文件:行 | 核验内容 | 结论 |
| --- | --- | --- | --- |
| S-2 | frontend-ci.yml:13-14 | 顶层 `permissions: contents: read` 位于 `on` 之后 `defaults` 之前，作用于全 job；构建与 cargo check 不需 write | ✅ 通过 |
| Q-3 | StatusBar.tsx:8,21 | 新增 `mockCategories` import 且已使用（无 TS6133 未用风险）；`reduce` 公式正确；mockCategories 中仅 coding=4 其余=0，结果=4 | ✅ 通过 |
| Q-4 | mockData.ts:150-151 | `totalEdges:60`、`wikilink:44`；44+12+4=60 与 totalEdges 自洽，与 R1 脚本实测 edges 数组吻合 | ✅ 通过 |

**回归检查**：三处变更均为数值/配置修正，未触及输入处理、依赖、执行路径、状态机，无新安全面引入。主 Agent 报告 `pnpm build` 通过（tsc strict + vite build），与本 Agent 静态审查结论一致。

**结论升级**：R1「有条件通过」→ R2「通过」。4a 阶段可进入测试/合并流程。

**遗留项（不阻塞 4a，按阶段处理）**：
- S-5：commit 时必须 `git add` 两个锁文件（主 Agent 承诺，未验证前不视为完成）
- S-1/Q-1/Q-2/S-6：锁定 4b 接入 IPC 前硬门禁（见 §5.2）
- S-3/S-4/Q-5/Q-6/Q-7/S-7：4c 阶段建议项（见 §5.3）

**待澄清项**：§8 的 4 项待澄清仍需主 Agent 在合并前回应（尤其第 4 项 `tauri dev` 实际启动验证）。
