# 素材清单与 License 凭证（P4 GUI）

> 本文件记录 P4 GUI 所有外部素材的来源、License 与用途，确保合规可追溯。
> 新增素材时必须在此追加条目。

## 字体（Google Fonts，OFL 1.1）

| 字体 | 用途 | 来源 | License | 加载方式 |
| --- | --- | --- | --- | --- |
| Inter | UI 主字体（正文/按钮/导航） | <https://fonts.google.com/specimen/Inter> | OFL 1.1 | CDN（index.html） |
| Noto Sans SC | 中文回退字体 | <https://fonts.google.com/specimen/Noto+Sans+SC> | OFL 1.1 | CDN（index.html） |
| JetBrains Mono | 代码块/等宽数字 | <https://fonts.google.com/specimen/JetBrains+Mono> | OFL 1.1 | CDN（index.html） |

**OFL 1.1 要点**：允许商用、修改、再分发，但禁止单独售字体本身。字体可嵌入文档。

## 图标（Material Symbols，Apache 2.0）

| 图标集 | 用途 | 来源 | License | 加载方式 |
| --- | --- | --- | --- | --- |
| Material Symbols Outlined | 全应用图标（upload_file / hub / search / settings 等） | <https://fonts.google.com/icons> | Apache 2.0 | CDN（index.html） |

**Apache 2.0 要点**：允许商用、修改、再分发，需在 NOTICE 中保留版权声明。

## 设计参考

| 资源 | 用途 | 来源 | License |
| --- | --- | --- | --- |
| huashu-design skill | 4 个高保真原型设计指导 | 内置 skill | 项目内 |

## 待下载素材（Phase 4b/4c 按需）

以下素材在 P4 计划 §4.5.1 列为「必备」，但 Phase 4a 静态版本未实际使用（DropZone 用 Material Symbols 替代 Lottie）。将在后续阶段按需下载到本目录：

| 素材 | 计划用途 | 来源 | License | 目标路径 |
| --- | --- | --- | --- | --- |
| 上传 Lottie 动画 | DropZone loading 态 | LottieFiles | OFL/Free | `animations/upload.json` |
| 空状态插画 | FileList 空状态 | Pixabay | Pixabay License | `illustrations/empty-upload.svg` |
| 字体本地化（可选） | 离线支持 | Google Fonts | OFL 1.1 | `fonts/Inter/`、`fonts/NotoSansSC/`、`fonts/JetBrainsMono/` |

## 自有素材

| 素材 | 用途 | 路径 |
| --- | --- | --- |
| Tauri 默认图标 | 应用图标（占位，4c 替换） | `src-tauri/icons/` |

## Python 解析依赖（P4 Phase 4b）

> L8 修复：pymupdf 的 AGPL-3.0 是强 copyleft license，需在分发时向接收方明确披露。
> 详见 [ADR-014](../../docs/decisions/ADR-014-p4-python-parser-and-staging-workflow.md) 与 [parser/README.md](../../parser/README.md)。

| 依赖 | 版本 | License | 用途 | 风险评估 |
| --- | --- | --- | --- | --- |
| pymupdf | 1.24.10 | **AGPL-3.0**（非商业免费） | PDF 解析 | 强 copyleft：衍生项目需开源。本项目为开源仓库，合规。商业闭源分发需购买商业 License 或改用 pdfplumber (BSD) |
| python-docx | 1.1.2 | MIT | DOCX 解析 | 无风险 |
| openpyxl | 3.1.5 | MIT | XLSX 解析 | 无风险 |
| PyInstaller | 6.10.0 | GPL-2.0（bootloader 例外） | 打包为 sidecar | bootloader 例外允许商业分发；仅打包工具，不进入运行时 |

**AGPL-3.0 合规措施**：

- 本项目仓库已开源（符合 AGPL-3.0 衍生项目开源要求）
- ADR-014 已记录 license 权衡与回退方案（pdfplumber BSD）
- 商业闭源分发场景需替换 pymupdf 为 pdfplumber（详见 ADR-014 负面影响节）

## 合规声明

- GUI 素材（字体/图标/动画/插画）License 均为 🟢 宽松类型（OFL / Apache 2.0 / Pixabay），无 GPL/CC-BY-NC 限制
- **Python 解析依赖含 AGPL-3.0（pymupdf）**，详见上表与 ADR-014
- CDN 加载的字体仅在应用运行时从 Google Fonts 服务器获取，不随应用分发
- 后续若改为本地打包字体，需在 `fonts/` 目录下保留各字体的 LICENSE 文件副本

## 更新日志

| 日期 | 变更 | 操作者 |
| --- | --- | --- |
| 2026-07-26 | 初始创建，记录 CDN 字体 + Material Symbols | P4 Phase 4a |
| 2026-07-27 | L8 修复：补充 Python 解析依赖 License 凭证（pymupdf AGPL-3.0 披露） | P4 Phase 4b |
