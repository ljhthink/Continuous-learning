# ADR-012: P4 GUI 技术栈（Tauri v2 + React + Vite + TailwindCSS）

| 项目 | 内容 |
| --- | --- |
| 状态 | Proposed |
| 日期 | 2026-07-26 |
| 决策者 | 主 Agent（P4 Phase 4a 启动阶段） |
| 关联文档 | [P4 实施计划](../../.trae/documents/p4-gui-implementation-plan.md) / [PRD](../PRD.md) US-004 / [ADR-001](ADR-001-knowledge-base-tech-stack.md)（核心依赖 ≤5 原则） |
| 风险等级 | P3（新框架 Tauri + 全新 frontend/ 目录） |
| 前序 ADR | [ADR-001](ADR-001-knowledge-base-tech-stack.md)（知识库技术栈，未涵盖 GUI） |

## 背景（Context）

[PRD](../PRD.md) US-004「图形化界面 + 多格式上传」要求交付桌面应用，支持拖拽 PDF/DOCX/XLSX、AI 整理为 markdown、staging 工作流、wiki 预览。P0-P3 已完成 MCP server（9 tools）+ 三层架构 + 持续进化闭环，但全部通过 CLI/MCP 交互，无 GUI。

P4 需选择 GUI 技术栈，约束条件：

1. **桌面应用**：需原生文件系统访问（拖拽上传、读写 wiki/）、原生窗口、跨平台（Windows/macOS）
2. **包体积**：知识库是个人工具，不应过重（Electron 基线 80MB+ 偏大）
3. **前端生态**：需 React 生态（组件库、markdown 渲染、图谱可视化）
4. **与现有 MCP server 集成**：MCP server 是 TypeScript，前端最好同语言
5. **核心依赖 ≤5 原则**（[ADR-001](ADR-001-knowledge-base-tech-stack.md)）：不引入过多框架

## 决策（Decision）

### D1. 桌面框架：Tauri v2（vs Electron / Next.js 桌面化）

| 维度 | Tauri v2 | Electron | Next.js + Tauri |
| --- | --- | --- | --- |
| 包体积 | 3-10MB（系统 WebView） | 80-150MB（内置 Chromium） | 同 Tauri |
| 内存 | 50-150MB | 200-400MB | 同 Tauri |
| 后端语言 | Rust（轻薄，仅 IPC） | Node.js | Rust + Node |
| 跨平台 | Win/Mac/Linux | Win/Mac/Linux | 同 Tauri |
| 文件系统/拖拽 | 原生 API + sidecar | 原生 | 原生 |
| 与 MCP 集成 | sidecar 启动 MCP server | child_process | 同 Tauri |

**选择 Tauri v2**：

- 体积优势显著（个人知识库无需 Chromium 运行时）
- Rust 后端极薄（4a 阶段仅 `greet` 占位命令，4b 加 5 个 IPC 命令）
- 系统 WebView（Windows: WebView2 / macOS: WKWebView）已预装，无额外依赖
- sidecar 机制可包装 Python 解析管道（4b）

**风险缓解**：Tauri Rust 门槛 → 后端保持极薄，复杂逻辑全部在前端 TS 或 MCP server。

### D2. 前端框架：React 19 + Vite 7 + TypeScript 5.8

| 维度 | 选择 | 理由 |
| --- | --- | --- |
| 框架 | React 19 | 生态最丰富（react-markdown / react-force-graph-2d / zustand） |
| 构建 | Vite 7 | Tauri 官方推荐，HMR 快 |
| 语言 | TypeScript 5.8 strict | 与 MCP server 同语言，类型安全 |
| 状态 | Zustand 5 | 轻量（<1KB），无 Provider 嵌套，适合中等规模 |

**未选择**：Next.js（SSR 对桌面应用无价值，且与 Tauri 集成复杂）、Vue（生态略弱于 React，特别是图谱可视化库）。

### D3. 样式：TailwindCSS 3.4 + CSS 变量（暗色主题）

- **TailwindCSS 3.4**：utility-first，与组件化契合，编译时移除未用样式
- **CSS 变量层**：所有颜色通过 `var(--bg-canvas)` 等变量绑定，主题切换只需改 `data-theme` 属性
- **暗色为主**：`data-theme="dark"` 为默认，亮色为可选切换
- **领域配色**：8 个领域固定色值（kb-system 紫 / coding 蓝 / ...），在 tailwind.config.js 与 GraphView 节点中复用

### D4. 图谱可视化：react-force-graph-2d（4c 阶段引入）

- **4a 阶段**：静态 SVG mock（手写布局算法），验证视觉编码与交互
- **4c 阶段**：替换为 `react-force-graph-2d`（MIT）+ `d3-force`，支持 force-directed 布局与大规模节点
- **降级策略**：<5000 节点用 SVG，>5000 降级 Canvas

### D5. 素材加载策略

- **字体**：CDN 加载 Google Fonts（Inter / Noto Sans SC / JetBrains Mono，OFL 1.1）
- **图标**：CDN 加载 Material Symbols Outlined（Apache 2.0）
- **License 凭证**：`frontend/assets/CREDITS.md` 记录所有素材来源与 License
- **离线支持**：4c 阶段按需本地化字体（当前 CDN 满足 4a 静态展示需求）

## 影响与后果（Consequences）

### 正面

- 包体积 <15MB（vs Electron 80MB+），适合个人工具分发
- 前后端同 TypeScript，MCP server 代码可复用类型定义
- 暗色主题通过 CSS 变量实现，切换零成本
- TailwindCSS + 领域配色系统，组件视觉一致

### 负面

- **Rust 学习曲线**：4b 的 IPC 命令需 Rust 实现，但极薄（5 个命令，每个 <20 行）
- **WebView 差异**：Windows WebView2 与 macOS WKWebView 渲染细节可能有差异，需双平台测试
- **CDN 依赖**：4a 阶段字体走 CDN，离线场景需 4c 本地化
- **Tauri #14134**：重复 drop 事件已知 bug，4b 用 `Set<string>` 去重缓解

### 风险等级与回退

- 本决策为 P3（新框架），但 4a 阶段仅静态组件，风险实际为 P1
- **回退方案**：若 Tauri Rust 门槛成为阻塞，可降级为 Electron + Next.js（保留 React 生态），代价是包体积 5-10 倍

## 验证（Verification）

Phase 4a 验收标准（本 ADR 对应）：

- [x] Tauri v2 项目初始化成功（src-tauri/ + Cargo.toml + tauri.conf.json）
- [x] React 19 + Vite 7 + TS 5.8 编译通过（`pnpm build` ✓ 249KB / 74KB gzip）
- [x] Rust 代码编译通过（`cargo check` ✓ 459 packages, 4min）
- [x] TailwindCSS 3.4 + CSS 变量暗色主题生效
- [x] 12 个组件（10 必需 + TopBar + StatusBar）静态版本渲染
- [x] CREDITS.md 记录所有素材 License
- [x] frontend-ci.yml CI 配置就绪

## 后续 ADR

- **ADR-013**（4c）：LLM 集成策略（cloud-first / local-first / disabled 三态）
- **ADR-014**（4b）：Python 解析管道集成（MinerU + office2md + PyInstaller sidecar）
