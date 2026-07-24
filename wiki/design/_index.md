---
title: "设计素材领域索引"
domain: [design]
type: concept
status: active
date: 2026-07-25
tags: [design, resources, index, assets, creative]
---

## 简介

本领域收录**设计素材资源**，覆盖图像、视频、动画、图标、字体、颜色、3D 模型、声音共 8 大类，约 30 个站点。按 ADR-009 决策 3 建立。

### 领域定位

| 边界 | 说明 |
| --- | --- |
| 本领域包含 | 视觉/听觉设计素材的入口、选型、License 注意事项 |
| 本领域不包含 | 代码库 entity（如 GSAP 的 API 文档归 `wiki/coding/`）、API 字典（归 `wiki/resources/`） |
| 与 `coding/` 区分 | `coding/` 放代码与开发资源；`design/` 放设计向素材 |
| 与 `resources/` 区分 | `resources/` 放外部数据源索引（如 API）；`design/` 放创作素材 |

### 核心价值

本领域不是简单的"书签列表"，而是提供：

1. **选型决策矩阵**：按使用场景推荐合适站点
2. **License 总览**：商用许可的快速参考，避免误用侵权
3. **跨分类对比**：同类站点的横向对比（如 pixabay vs unsplash vs pexels）

## 分类页清单

8 张分类页按资源类型分组，每页含站点清单表、选型决策矩阵、License 标注：

| 分类 | 文件 | 涵盖站点数 | 重点维度 |
| --- | --- | --- | --- |
| 图像素材 | [[wiki/design/image-resources]] | 5 | 商用 license / 风格定位（摄影 vs 纹理 vs 像素） |
| 视频素材 | [[wiki/design/video-resources]] | 2 | 转场 vs 背景视频 / GIF 与贴纸 |
| 动画素材 | [[wiki/design/animation-resources]] | 2 | 工具库 vs 在线平台 / Web 动画 vs UI 动画 |
| 图标素材 | [[wiki/design/icon-resources]] | 3 | 商用限制 / 中外图标差异 |
| 字体素材 | [[wiki/design/font-resources]] | 4 | 中英文字体差异 / 商用 license |
| 颜色素材 | [[wiki/design/color-resources]] | 5 | 配色方案 vs 颜色字典 vs 渐变生成器 |
| 3D 模型素材 | [[wiki/design/3d-model-resources]] | 8 | 免费 vs 付费 / 写实 vs 风格化 / PBR 贴图 / HDRI |
| 声音素材 | [[wiki/design/sound-resources]] | 5 | VFX vs 背景音乐 vs 环境音 / 商用 license |

> ⚠️ **状态说明**：上表为规划清单，分类页内容待 Phase 3 创作。当前仅有本索引页（_index.md）已建立，分类页文件尚不存在。点击链接将跳转到待创建的占位页。

## 完整站点总览

按资源类型分组，列出全部 30 个站点：

### 图像类（5 站）

| 站点 | URL | 类型 | 初步 License | 适用场景 |
| --- | --- | --- | --- | --- |
| pixabay | <https://pixabay.com/zh/> | 综合素材（照片+插画+矢量） | Pixabay License（免费商用，无需署名） | 通用图片需求首选 |
| texturelabs | <https://texturelabs.org/> | 纹理素材 | CC-BY（需署名） | Photoshop 纹理叠加、材质贴图 |
| pexels | <https://www.pexels.com/> | 摄影向照片 | Pexels License（免费商用，无需署名） | 高质量摄影感照片 |
| unsplash | <https://unsplash.com/> | 电影感照片+矢量插画 | Unsplash License（免费商用，无需署名） | 高端摄影感、电影质感 |
| spriters-resource | <https://www.spriters-resource.com/> | 老式像素游戏素材 | 版权复杂，需逐个检查 | 像素风游戏开发、复古风格 |

### 视频类（2 站）

| 站点 | URL | 类型 | 初步 License | 适用场景 |
| --- | --- | --- | --- | --- |
| mixkit | <https://mixkit.co/free-stock-video/> | 免费视频素材 | Mixkit License（免费商用，部分需署名） | 转场、背景视频 |
| giphy | <https://giphy.com/> | GIF 与贴纸 | 免费使用，API 有速率限制 | 社交媒体、表情包、动图 |

### 动画类（2 站）

| 站点 | URL | 类型 | 初步 License | 适用场景 |
| --- | --- | --- | --- | --- |
| GSAP | <https://github.com/greensock/GSAP> | JavaScript 动画库 | 标准免费，部分插件付费（如 SplitText） | Web 动画、ScrollTrigger 滚动效果 |
| lottiefiles | <https://lottiefiles.com/> | UI 动画平台 | 免费 + 付费混合 | UI 微动画、After Effects 导出 Lottie JSON |

### 图标类（3 站）

| 站点 | URL | 类型 | 初步 License | 适用场景 |
| --- | --- | --- | --- | --- |
| flaticon | <https://www.flaticon.com/> | 图标资源（可做 logo） | 免费需署名，付费免署名 | 通用图标、logo 素材 |
| iconfont | <https://www.iconfont.cn/collections> | 中国图标 logo 查询 | 阿里平台，免费使用 | 中文产品图标、国内项目 |
| Material Icons | <https://fonts.google.com/icons> | Google 图标 | Apache 2.0 / MIT | Material Design 项目、Web 图标 |

### 字体类（4 站）

| 站点 | URL | 类型 | 初步 License | 适用场景 |
| --- | --- | --- | --- | --- |
| Google Fonts | <https://fonts.google.com/> | 开源字体（含中英文） | 各字体独立开源 license | Web 字体首选、英文开源字体 |
| dafont | <https://www.dafont.com/> | 英文字体 | 个人免费，商用需逐个检查 | 英文装饰字体、个性字体 |
| fontzone | <https://www.fontzone.net/> | 英文字体 | 类似 dafont，需逐个检查 | 英文字体备选 |
| zimon | <https://zimon.cc/tool> | 中文字体 | 需逐个检查 | 中文字体下载 |

### 颜色类（5 站）

| 站点 | URL | 类型 | 初步 License | 适用场景 |
| --- | --- | --- | --- | --- |
| colorhunt | <https://colorhunt.co/> | 配色方案 | 免费使用 | 配色灵感、四色配色方案 |
| color-hex | <https://www.color-hex.com/> | 颜色字典 | 免费使用 | 查特定 hex 色的配色、渐变、阴影 |
| uigradients | <https://uigradients.com/> | 渐变色素材 | 免费使用 | CSS 渐变灵感 |
| grabient | <https://www.grabient.com/> | 渐变色生成器 | 免费使用 | 可视化调整渐变 |
| picular | <https://picular.co/> | 颜色联想 | 免费使用 | 关键词联想颜色（如"海洋"→蓝色系） |

### 3D 模型类（8 站）

| 站点 | URL | 类型 | 初步 License | 适用场景 |
| --- | --- | --- | --- | --- |
| sketchfab | <https://sketchfab.com/> | 3D 模型平台 | 免费 + 付费混合，CC 许可 | 在线预览 3D 模型、CC 许可模型 |
| cubebrush | <https://cubebrush.co/> | basemesh 基础模型 | 免费 + 付费混合 | 基础模型、雕刻起点 |
| gumroad | <https://gumroad.com/> | 3D 工具包与插件 | 付费为主 | 3D 工具包、插件、教程 |
| opengameart | <https://opengameart.org/> | 免费游戏美术资源 | CC 许可（CC0/CC-BY 等） | 游戏美术、开源项目 |
| blenderkit | <https://www.blenderkit.com/> | Blender 模型/材质/贴图/HDR | 免费 + 付费混合 | Blender 工作流集成 |
| quixel megascans | <https://quixel.com/megascans> | 写实场景扫描级模型贴图 | Epic 用户免费 | 写实场景、电影级贴图 |
| polyhaven | <https://polyhaven.com/> | 免费 HDRI 资源 | CC0（完全免费） | HDRI 环境、免费模型、贴图 |
| cgbookcase | <https://www.cgbookcase.com/> | PBR 贴图资源 | 免费商用 | PBR 贴图、材质库 |

### 声音类（5 站）

| 站点 | URL | 类型 | 初步 License | 适用场景 |
| --- | --- | --- | --- | --- |
| pixabay sound-effects | <https://pixabay.com/zh/sound-effects/> | VFX 音效 | Pixabay License（免费商用） | 通用音效 |
| mixkit sound-effects | <https://mixkit.co/free-sound-effects/> | 免费音效 | Mixkit License（免费商用） | UI 音效、转场音效 |
| freemusicarchive | <https://freemusicarchive.org/> | 免费背景音乐 | CC 许可（各曲目独立） | 背景音乐、配乐 |
| freesound | <https://freesound.org/> | 环境音/按钮音/氛围音 | CC 许可（各声音独立） | 环境音、UI 音效 |
| 99sounds | <https://99sounds.org/sounds/> | 分类好的声音包 | 免费商用 | 声音包、合成器预设 |

> ⚠️ **License 免责声明**：以上 License 信息为基于公开资料的**初步评估**，实际使用前**必须**前往各站点官方 License 页面核实。站点 License 可能随时变更。

## 跨分类选型决策矩阵

按常见使用场景推荐合适站点：

| 使用场景 | 推荐站点（优先级降序） | 推荐理由 |
| --- | --- | --- |
| 找免费商用照片（无需署名） | pixabay / unsplash / pexels | 三大免费照片站，license 宽松 |
| 做网页背景视频 | mixkit / giphy | mixkit 适合背景视频，giphy 适合 GIF |
| 做 Web 滚动动画 | GSAP | ScrollTrigger 是 Web 滚动动画的事实标准 |
| 做 UI 微动画 | lottiefiles / GSAP | Lottie 适合 AE 导出，GSAP 适合代码控制 |
| 做 logo 与产品图标 | flaticon / iconfont | flaticon 国际通用，iconfont 适合中文产品 |
| 做 Material Design 图标 | Material Icons | Google 官方，与 Material 生态深度集成 |
| 找英文字体 | Google Fonts / dafont | Google Fonts 开源可商用，dafont 装饰性强 |
| 找中文字体 | zimon / Google Fonts（中文部分） | zimon 专注中文字体 |
| 做配色方案 | colorhunt / uigradients | colorhunt 四色方案，uigradients 渐变 |
| 关键词联想颜色 | picular | 输入关键词联想颜色，适合概念阶段 |
| 找免费 3D 模型 | polyhaven / sketchfab / opengameart | polyhaven CC0，sketchfab 有 CC 许可区 |
| 做写实场景贴图 | quixel megascans / cgbookcase | megascans 扫描级，cgbookcase 免费 PBR |
| 找免费 HDRI | polyhaven | CC0 完全免费，质量高 |
| 找环境音效 | freesound / 99sounds | freesound CC 许可丰富，99sounds 分类清晰 |
| 找背景音乐 | freemusicarchive / pixabay sound-effects | freemusicarchive CC 许可，pixabay 免费商用 |
| 做复古像素游戏 | spriters-resource / opengameart | 像素游戏素材专站 |

## License 与商用注意事项总览

### License 分级

| 等级 | 含义 | 典型站点 |
| --- | --- | --- |
| 🟢 宽松 | 免费商用，无需署名 | pixabay、unsplash、pexels、polyhaven、Material Icons |
| 🟡 需署名 | 免费商用，但需署名 | texturelabs（CC-BY）、flaticon 免费版 |
| 🟠 条件免费 | 部分免费，部分付费 | sketchfab、lottiefiles、cubebrush、blenderkit |
| 🔴 付费为主 | 大部分内容付费 | gumroad、quixel megascans（非 Epic 用户） |
| ⚠️ 需逐个检查 | License 不统一，需逐素材核实 | spriters-resource、dafont、fontzone、zimon、freemusicarchive、freesound |

### 商用注意事项

1. **免费不等于无配额**：部分站点有 API 速率限制（如 giphy）或下载量限制
2. **署名要求差异**：CC-BY 要求显著署名，CC0 不要求，需逐站确认
3. **CC 许可变体**：CC-BY（署名）、CC-BY-SA（署名-相同方式共享）、CC-BY-NC（署名-非商用）等，商用场景务必排除 NC
4. **平台 vs 素材 License**：平台本身的 License 不等同于平台内每个素材的 License（如 sketchfab 上有 CC0 也有 All Rights Reserved）
5. **Quixel 特殊规则**：megascans 对 Unreal Engine 用户免费，其他引擎/软件需付费订阅
6. **字体商用陷阱**：dafont/fontzone 上个人免费 ≠ 商用免费，必须检查每个字体的商用 license

## 使用场景快速索引

按项目类型快速定位所需资源：

### Web 开发项目

- **图片**：pixabay / unsplash / pexels
- **图标**：Material Icons / flaticon
- **字体**：Google Fonts
- **动画**：GSAP（ScrollTrigger）/ lottiefiles
- **颜色**：uigradients / grabient

### 游戏开发项目

- **2D 像素**：spriters-resource / opengameart
- **3D 模型**：sketchfab / cubebrush / polyhaven
- **PBR 贴图**：cgbookcase / quixel megascans
- **HDRI**：polyhaven
- **音效**：freesound / 99sounds
- **背景音乐**：freemusicarchive

### UI/UX 设计项目

- **图标**：flaticon / iconfont / Material Icons
- **字体**：Google Fonts / zimon（中文）
- **颜色**：colorhunt / color-hex / picular
- **动画**：lottiefiles
- **图片**：unsplash（电影感）/ pexels（摄影感）

### 视频/影视项目

- **背景视频**：mixkit
- **音效**：pixabay sound-effects / mixkit sound-effects
- **背景音乐**：freemusicarchive / 99sounds
- **贴图材质**：texturelabs / quixel megascans

### 3D 渲染/建筑可视化

- **3D 模型**：sketchfab / cubebrush
- **PBR 贴图**：cgbookcase / quixel megascans / polyhaven
- **HDRI**：polyhaven
- **Blender 集成**：blenderkit

## 状态与后续计划

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| Phase 1（已完成） | ✅ 完成 | 领域目录与索引页（本文件）已建立 |
| Phase 3（计划） | ⏳ 待开始 | 逐张创作 8 张分类页，每页含详细站点清单表、选型决策矩阵、License 标注 |

### Phase 3 创作顺序建议

按使用频率与价值密度排序：

1. `image-resources.md` — 图片素材是最常用资源
2. `icon-resources.md` — 图标在各类项目中频繁使用
3. `font-resources.md` — 字体 License 陷阱多，价值密度高
4. `color-resources.md` — 配色决策对设计影响大
5. `3d-model-resources.md` — License 分级复杂，需详细说明
6. `sound-resources.md` — 声音素材 License 需仔细甄别
7. `animation-resources.md` — GSAP/Lottie 技术性强
8. `video-resources.md` — 站点较少，可快速完成

## 相关页面

- [[wiki/resources/public-apis]] — 同属"外部资源索引"范畴，但 public-apis 是开发资源而非设计素材
- [[wiki/kb-system/multi-domain-classification]] — 多领域分类规范
- [[wiki/coding/thealgorithms-python]] — Python 算法实现（GSAP 等 JS 库的 entity 页未来可归 coding/）
- [[wiki/coding/experiences/lychee-链接检查-ci绝对路径node-modules-引用与裸-url-的处理]] — 外部 URL 在 CI 中的处理经验

## 参考

- [ADR-009](../../docs/decisions/ADR-009-resources-and-design-domains.md) — 新建 resources 与 design 领域的决策依据
- [AGENTS.md §8.1](../../AGENTS.md) — 领域目录规范
