# ADR-014: P4 Phase 4b — Python 解析管道 + staging 工作流

| 项目 | 内容 |
| --- | --- |
| 状态 | Accepted |
| 日期 | 2026-07-27 |
| 决策者 | 主 Agent（P4 Phase 4b 实施阶段） |
| 关联文档 | [P4 实施计划](../../.trae/documents/p4-gui-implementation-plan.md) / [ADR-012](ADR-012-p4-gui-tech-stack.md)（Tauri v2 技术栈） |
| 风险等级 | P2（新组件 + 跨语言集成，但无既有代码破坏风险） |
| 前序 ADR | [ADR-012](ADR-012-p4-gui-tech-stack.md)（P4 GUI 技术栈，已预留 sidecar 机制） |

## 背景（Context）

[ADR-012](ADR-012-p4-gui-tech-stack.md) 决定使用 Tauri v2 + React 19 + Vite 7 作为 P4 GUI 技术栈，并预留了 `tauri-plugin-shell` sidecar 机制以集成 Python 解析管道。Phase 4a 完成了 Tauri 骨架 + 12 个静态组件 + 暗色主题（PR #33）。

Phase 4b 需完成：

1. **文件解析管道**：用户拖拽 PDF/DOCX/XLSX → 解析为 markdown → 写入 `wiki/<domain>/<slug>.md` (status=staging)
2. **staging 工作流**：FileList 显示 staging 页面 → 用户确认（→ active）/ 拒绝（→ rejected）
3. **MCP server 扩展**：外部 Agent 也能通过 MCP 查询/确认 staging 页面

原计划（[P4 实施计划](../../.trae/documents/p4-gui-implementation-plan.md)）使用 MinerU + office2md + PyInstaller sidecar。但实施时发现：

- **MinerU 过重**：MinerU 依赖 PyTorch + 多个 ML 模型（数 GB），不适合个人知识库轻量场景
- **office2md 维护停滞**：社区方案，无持续维护，与 python-docx/openpyxl 重叠
- **PyInstaller sidecar 打包耗时**：pymupdf 的 native 依赖（PyMuPDFb）体积大，首次打包 10+ 分钟
- **dev 模式不需要 sidecar**：宿主机已装 Python 3.12，可直接 `python parser/parse.py`

## 决策（Decision）

### D1. 解析库：pymupdf + python-docx + openpyxl（替代 MinerU + office2md）

| 格式 | 库 | License | 体积 | 能力 |
| --- | --- | --- | --- | --- |
| PDF | pymupdf (fitz) | AGPL-3.0 | ~15MB | 文本提取 + 表格检测 + 元数据 |
| DOCX | python-docx | MIT | ~1MB | 段落 + 标题层级 + 表格 |
| XLSX | openpyxl | MIT | ~2MB | 多工作表 → markdown 表格 |
| MD | 透传 | - | 0 | 直接透传 + 标题提取 |

**理由**：

- 三个库都是各自格式的 Python 标准方案，文档完善、社区活跃
- 总体积 <20MB（MinerU 单库数 GB）
- AGPL-3.0 对个人知识库（开源仓库）合规
- 与 [ADR-001](ADR-001-knowledge-base-tech-stack.md) 「核心依赖 ≤5」原则兼容

**风险缓解**：若未来需商业闭源分发，可替换为 pdfplumber（BSD）+ python-docx + openpyxl。

### D2. 集成方式：dev 模式直调 `python`，production 模式可选 PyInstaller sidecar

| 模式 | 调用方式 | 优势 | 适用场景 |
| --- | --- | --- | --- |
| Dev（默认） | `python parser/parse.py <file>` | 无打包开销，调试方便 | 本地开发、个人使用 |
| Production（可选） | PyInstaller sidecar binary | 无需宿主 Python，可独立分发 | 公开发布、企业部署 |

**实现细节**：

- `KbConfig` 结构体持有 `python_path` + `parser_path`，默认 `"python"` + `<kb_root>/parser/parse.py`
- `upload_file` IPC 命令通过 `tauri-plugin-shell` 调用，参数以数组形式传递（无 shell 插值，防注入）
- `parser/build.py` 提供 PyInstaller 打包脚本，输出 `frontend/src-tauri/binaries/parser-<target-triple>.exe`
- `tauri.conf.json` 的 `bundle.externalBin` 配置在 dev 模式下不启用（避免 `cargo check` 因缺二进制失败）

**理由**：dev 模式覆盖 90% 个人使用场景，production sidecar 作为可选项降低日常迭代成本。

### D3. Tauri IPC 命令（5 个）

| 命令 | 参数 | 作用 | 安全 |
| --- | --- | --- | --- |
| `upload_file` | `file_path, domain` | 复制到 raw/，调 Python 解析，写 staging wiki 页 | 路径校验、shell 参数数组化 |
| `list_staging` | `domain?` | 列出所有 staging 页面 | 只读 |
| `confirm_staging` | `page_path` | staging → active，追加 log | 路径 traversal 校验 |
| `reject_staging` | `page_path` | staging → rejected，追加 log | 路径 traversal 校验 |
| `get_kb_config` | - | 返回 KB root + parser 路径 | 只读 |

**Rust 实现要点**：

- `upload_file` 接受 `AppHandle` 参数以调用 `tauri-plugin-shell`
- `validate_inside(base, path)` 用 `canonicalize()` + `starts_with` 防路径穿越（ADR-010）
- frontmatter 解析用最小字符串扫描（不引 serde_yaml），与 server-side MCP server 共享 schema
- `append_log` 写入 `log.md`，格式与 AGENTS.md §4.4 一致（`## [YYYY-MM-DD] confirm | <title>`）

### D4. MCP server 扩展（3 个工具）

为保持 Tauri GUI 与外部 MCP Agent 的一致性，MCP server 也实现 3 个对应工具：

| MCP 工具 | 对应 Tauri IPC | 作用 |
| --- | --- | --- |
| `kb_list_staging` | `list_staging` | 列出 staging 页面 |
| `kb_confirm_staging` | `confirm_staging` | staging → active |
| `kb_reject_staging` | `reject_staging` | staging → rejected |

**实现要点**：

- 复用 `parseFrontmatter` / `serializeFrontmatter` / `appendLogEntry` 等已有 utils
- `kb_confirm_staging` 额外调用 `updateIndexHeader` 刷新 index.md（Tauri 侧未做，因为 GUI 不依赖 index.md）
- 路径 traversal 防御与 Tauri 侧一致（`path.relative` + `..` 检测）
- `kb_list_staging` 不递归 `experiences/` 子目录（staging sources 是顶层页面）

### D5. 前端集成：双模式 + IPC wrapper

| 环境 | 行为 |
| --- | --- |
| Tauri | 监听 `onDragDropEvent` 获取文件路径 → 调 `upload_file` IPC；点击选择走 `@tauri-apps/plugin-dialog` |
| 浏览器 dev | HTML5 拖拽 + `<input type=file>`，但 `upload_file` 需要 OS 路径 → 显示「请在 Tauri 应用中上传」 |

**实现**：

- `src/lib/ipc.ts` — `invoke()` 懒加载 + `isTauri()` 检测（`window.__TAURI_INTERNALS__`）
- `src/components/DropZone.tsx` — 三态（idle / uploading / success / error），Tauri 拖拽 + dialog 双路径
- `src/components/FileList.tsx` — 启动时 `list_staging`，confirm/reject 后刷新，浏览器 dev 回退到 mock

### D6. CSP 收紧

`tauri.conf.json` 的 CSP 从 `null`（任意）收紧为：

```text
default-src 'self';
img-src 'self' data: blob: asset: http://asset.localhost;
style-src 'self' 'unsafe-inline';
font-src 'self' data:;
script-src 'self';
connect-src 'self' ipc: http://ipc.localhost
```

- `style-src 'unsafe-inline'`：Tailwind 运行时需要内联样式
- `img-src ... asset:`：Tauri asset 协议（未来 4c 接入图片预览）
- `connect-src ipc:`：Tauri IPC 通信

### D7. capabilities 权限

`capabilities/default.json` 新增权限：

- `tauri-plugin-dialog`（`dialog:default` + `dialog:allow-open`）— 文件选择对话框
- `tauri-plugin-shell`（`shell:allow-execute` + `shell:allow-open`）— 调用 Python 解析器

未授予 `shell:allow-execute` 之外的更危险权限（如 `fs:write` 全路径），保持最小权限原则。

## 影响（Consequences）

### 正面

- **拖拽上传打通**：Phase 4b 完成 PDF/DOCX/XLSX → markdown 全链路
- **双入口一致**：Tauri GUI 与 MCP server 共享 staging 工作流，外部 Agent 也能 confirm/reject
- **dev 体验好**：直调 `python` 无需打包，迭代快
- **路径安全**：所有 IPC 命令均有 traversal 防御
- **测试覆盖**：14 个 staging 单元测试 + 58 个回归测试全部通过

### 负面

- **dev 依赖 Python 3.12**：宿主机需预装 Python + `pip install -r parser/requirements.txt`
- **AGPL-3.0 合规**：pymupdf 要求衍生项目开源（本项目已开源，合规）
- **PyInstaller sidecar 未自动化**：production 分发需手动 `python parser/build.py` 并改 `tauri.conf.json`
- **无 OCR**：扫描版 PDF 无法解析（需 OCR 时可后续接入 tesseract 或 MinerU）

### 风险等级与回退

- 本决策为 P2（跨语言集成），但 dev 模式不破坏既有代码，风险实际为 P1
- **回退方案 1**：若 pymupdf AGPL 不可接受，替换为 pdfplumber（BSD，功能略弱但无 license 限制）
- **回退方案 2**：若 Python 依赖成为阻塞，可改用 Node.js 原生解析（pdf-parse + mammoth + xlsx），代价是 XLSX 公式支持弱

## 验证（Verification）

Phase 4b 验收标准：

- [x] `parser/parse.py` 支持 PDF/DOCX/XLSX/MD 四格式，输出结构化 JSON
- [x] `parser/requirements.txt` 列出 4 个依赖（pymupdf / python-docx / openpyxl / pyinstaller）
- [x] `parser/build.py` PyInstaller 打包脚本就绪（dev 模式可不用）
- [x] Tauri 5 个 IPC 命令（`upload_file` / `list_staging` / `confirm_staging` / `reject_staging` / `get_kb_config`）`cargo check` 通过
- [x] MCP server 3 个新工具（`kb_list_staging` / `kb_confirm_staging` / `kb_reject_staging`）注册并测试通过
- [x] 14 个 staging 单元测试 + 58 个回归测试全部通过
- [x] 前端 DropZone + FileList 接入 IPC，TypeScript 类型检查通过
- [x] `tauri.conf.json` CSP 从 null 收紧为白名单
- [x] `capabilities/default.json` 新增 dialog + shell 权限
- [x] `src/lib/ipc.ts` IPC wrapper 提供 Tauri/浏览器双模式检测

## 后续 ADR

- **ADR-013**（4c）：LLM 集成策略（cloud-first / local-first / disabled 三态）
- **ADR-015**（4c 后期）：OCR 集成策略（若需扫描版 PDF 支持）
