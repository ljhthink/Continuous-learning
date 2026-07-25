---
title: "图标素材资源"
domain: [design]
type: concept
status: active
date: 2026-07-25
tags: [design, icon, resources, assets, svg, material, logo]
related: [wiki/design/_index]
---

## 简介

图标素材在 Web、移动、桌面、UI/UX 各类项目中均承担**信息压缩**与**视觉识别**双重职责。本类资源核心诉求：

1. **风格一致性**：同项目所有图标需出自同一系列，避免风格混杂
2. **格式灵活**：SVG（矢量、可染色）优先，PNG/字体图标备选
3. **商用许可明确**：是否需署名、是否可二次修改、是否可商用
4. **中外差异感知**：国内项目偏好 iconfont，国际项目偏好 flaticon / Material Icons
5. **生态绑定意识**：Material Icons 与 Material Design 生态深度绑定

涵盖 3 个站点，按定位可分为：国际通用图标（flaticon）、国内图标平台（iconfont）、Material Design 官方图标（Material Icons）。

## 站点清单表

| 站点 | URL | 类型 | License 详情 | 适用场景 | 备注 |
| --- | --- | --- | --- | --- | --- |
| flaticon | <https://www.flaticon.com/> | 图标资源（可做 logo） | 免费需署名，付费免署名 | 通用图标、logo 素材 | 国际通用、风格多样 |
| iconfont | <https://www.iconfont.cn/collections> | 中国图标 logo 查询 | 阿里平台，免费使用 | 中文产品图标、国内项目 | 国内最大图标平台 |
| Material Icons | <https://fonts.google.com/icons> | Google 图标 | Apache 2.0 / MIT | Material Design 项目、Web 图标 | 与 Material 生态绑定 |

> ⚠️ License 免责声明：以上 License 信息为初步评估，实际使用前必须前往各站点官方 License 页面核实。flaticon 免费版署名要求与付费版条款需逐项核对。

## 同类站点深度对比

### 三大图标站对比

| 维度 | flaticon | iconfont | Material Icons |
| --- | --- | --- | --- |
| 风格定位 | 国际通用、风格多样 | 国内主流、风格统一 | Material Design 官方 |
| 内容数量级 | 800 万+ | 800 万+ | 2000+（精选） |
| 更新频率 | 高（社区上传） | 高（社区上传） | 中（Google 维护） |
| API 可用性 | 有（付费） | 有（阿里开放平台） | 无（直接下载） |
| 矢量格式 | SVG / PNG / EPS | SVG / PNG / font | SVG / font |
| 字体图标方案 | 有（flaticon font） | 有（Unicode 编码） | 有（Google Fonts） |
| 中文支持 | 仅搜索 | 完整 | 仅搜索 |
| 署名要求 | 免费版需署名 | 否 | 否（Apache 2.0） |
| 商用许可 | 免费（署名）/付费（免署名） | 宽松 | 宽松 |
| 生态绑定 | 无 | 无 | Material Design |
| 国内访问速度 | 慢（境外） | 快（阿里云） | 中 |

### 中外图标设计风格差异

| 维度 | 西方图标（flaticon / Material） | 中方图标（iconfont） |
| --- | --- | --- |
| 风格 | 简洁、几何、扁平 | 细节丰富、文化符号强 |
| 色彩 | 多单色 / Material 配色 | 多彩色、渐变 |
| 文化符号 | 通用国际化 | 含中国元素（红包、福字、春节） |
| 字体图标 Unicode | PUA（私有区） | PUA + 标准 Unicode |
| 业务图标覆盖 | 通用 | 电商、支付、物流等垂直行业丰富 |

## 选型决策矩阵

| 使用场景 | 推荐站点（优先级降序） | 推荐理由 |
| --- | --- | --- |
| Material Design 项目 | Material Icons | 官方图标与 Material 生态无缝集成 |
| 中文产品（电商/支付/物流） | iconfont | 垂直行业图标丰富、风格统一 |
| 国际化 Web 项目 | Material Icons / flaticon | Material 免署名，flaticon 风格更多 |
| 做 logo 素材 | flaticon | 支持 EPS 矢量、风格多样 |
| 需要彩色图标 | iconfont / flaticon | Material Icons 主要单色 |
| 需要字体图标方案 | iconfont / Material Icons | 都支持字体方案，可作图标字体加载 |
| 国内项目（访问速度优先） | iconfont | 阿里云加速，国内访问快 |
| 商用且不想署名 | Material Icons / iconfont | 都无署名要求 |
| 商用可接受署名 | flaticon 免费版 | 风格最丰富、可做 logo |
| 二次修改/染色 | Material Icons / iconfont | 提供 SVG 源码，可自由修改 |

## License 与商用注意事项

### License 分级

| 等级 | 含义 | 本类典型站点 |
| --- | --- | --- |
| 🟢 宽松 | 免费商用，无需署名 | Material Icons（Apache 2.0）、iconfont |
| 🟡 需署名 | 免费商用，但需署名 | flaticon 免费版 |
| 🟠 条件免费 | 部分免费，部分付费 | flaticon（付费 Premium 免署名） |

### 商用陷阱

1. **flaticon 免费版署名要求**：免费用户必须在产品显著位置（如 footer、credits 页）标注 "Icons made by [Author] from Flaticon"，并链接回原素材页。**省略署名属侵权**。
2. **flaticon Premium 订阅陷阱**：付费订阅期内下载的素材可在订阅结束后继续使用，但**订阅结束后不能再下载新素材**，且不可转售。
3. **iconfont 上传者授权差异**：iconfont 平台本身免费，但**个别上传者会标注额外限制**（如禁止商用、禁止修改），下载前必须查看素材详情页的 License 字段。
4. **Material Icons 生态绑定**：虽然 License 宽松，但图标风格高度 Material Design 化，**用于非 Material 项目会显得风格突兀**。
5. **flaticon 不可直接做 logo 注册**：flaticon 素材用于 logo 时，因素材为社区共享，**无法注册商标**（商标局会以"非独创"驳回）。需自己二次创作后才能注册。
6. **字体图标 Unicode 冲突**：flaticon 与 iconfont 的字体图标均使用 PUA（私有 Unicode 区），同页面同时加载两套字体可能产生 Unicode 冲突。
7. **SVG 中的隐藏 metadata**：从站点下载的 SVG 可能含编辑器 metadata（如 inkscape 命名空间），生产环境建议清理。

## 典型工作流

### 场景 1：Web 项目接入 Material Icons

1. 步骤 1：在 <https://fonts.google.com/icons> 搜索所需图标
2. 步骤 2：选择 Material Symbols（最新版）或 Material Icons（旧版）
3. 步骤 3：复制 SVG 代码或下载 SVG 文件
4. 步骤 4：在 HTML 中直接内联 SVG（推荐，便于染色）：

    ```html
    <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
      <path d="M..." />
    </svg>
    ```

5. 步骤 5：在 CSS 中通过 `currentColor` 控制图标颜色：

    ```css
    .icon { width: 24px; height: 24px; color: #333; }
    .icon:hover { color: #007bff; }
    ```

6. 步骤 6：若需字体方案，引入 Google Fonts CSS：

    ```html
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
    ```

### 场景 2：国内项目使用 iconfont 字体方案

1. 步骤 1：在 iconfont.cn 创建账号并登录
2. 步骤 2：搜索图标，点击"添加入库"将图标加入购物车
3. 步骤 3：进入购物车，点击"添加至项目"（无项目则新建）
4. 步骤 4：在项目页选择"Font class"或"Symbol"模式
5. 步骤 5：点击"下载至本地"，得到字体文件与 CSS
6. 步骤 6：在项目中引入 CSS：

    ```html
    <link rel="stylesheet" href="./iconfont/iconfont.css">
    ```

7. 步骤 7：使用图标：

    ```html
    <i class="iconfont icon-home"></i>
    ```

8. 步骤 8：在 footer 或 about 页标注 "图标来源于 iconfont.cn"

### 场景 3：用 flaticon 做 logo 素材

1. 步骤 1：在 flaticon.com 搜索关键词（如 "coffee"）
2. 步骤 2：使用过滤器选 SVG 格式
3. 步骤 3：免费版下载 SVG，**记录作者名**
4. 步骤 4：在 Illustrator / Figma 中打开 SVG
5. 步骤 5：**必须做显著二次创作**（改色、改形状、加文字、组合多元素），否则无法注册商标
6. 步骤 6：导出最终 logo SVG / PNG
7. 步骤 7：在产品 footer 或 about 页标注 "Original icon by [Author] from Flaticon - [URL]"

## 同领域分类

- [[wiki/design/image-resources]] — 图像素材
- [[wiki/design/video-resources]] — 视频素材
- [[wiki/design/animation-resources]] — 动画素材
- [[wiki/design/icon-resources]] — 图标素材
- [[wiki/design/font-resources]] — 字体素材
- [[wiki/design/color-resources]] — 颜色素材
- [[wiki/design/3d-model-resources]] — 3D 模型素材
- [[wiki/design/sound-resources]] — 声音素材

## 相关页面

- [[wiki/design/_index]] — 设计素材领域索引
- [[wiki/design/font-resources]] — 字体素材（图标与字体常配套使用）
- [[wiki/design/color-resources]] — 颜色素材（图标配色参考）
- [[wiki/design/image-resources]] — 图像素材
- [[wiki/resources/public-apis]] — 公益 API 索引

## 参考

- [ADR-009](../../docs/decisions/ADR-009-resources-and-design-domains.md) — 新建 design 领域的决策依据
