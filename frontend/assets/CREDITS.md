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

## 合规声明

- 所有素材 License 均为 🟢 宽松类型（OFL / Apache 2.0 / Pixabay），无 GPL/CC-BY-NC 限制
- CDN 加载的字体仅在应用运行时从 Google Fonts 服务器获取，不随应用分发
- 后续若改为本地打包字体，需在 `fonts/` 目录下保留各字体的 LICENSE 文件副本

## 更新日志

| 日期 | 变更 | 操作者 |
| --- | --- | --- |
| 2026-07-26 | 初始创建，记录 CDN 字体 + Material Symbols | P4 Phase 4a |
