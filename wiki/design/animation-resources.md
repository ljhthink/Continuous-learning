---
title: "动画素材资源"
domain: [design]
type: concept
status: active
date: 2026-07-25
tags: [design, animation, gsap, lottie, motion, resources, assets, web, ui]
related: [wiki/design/_index]
---

## 简介

动画素材涵盖 **Web 滚动动画、UI 微动画、过渡效果**等场景，是现代 Web 与移动端交互的关键。本类资源核心诉求：

1. **工具库 vs 在线平台区分**：GSAP 是 JavaScript 代码库，lottiefiles 是设计资源平台
2. **Web 动画 vs UI 动画分工**：GSAP 擅长 Web 滚动与时间轴动画，lottiefiles 擅长 UI 微动画
3. **技术门槛差异大**：GSAP 需编码能力，lottiefiles 可拖拽使用
4. **生态与社区支持**：GSAP 是 Web 动画事实标准，lottiefiles 是 After Effects 标准导出平台

涵盖 2 个资源，按类型可分为：JavaScript 动画库（GSAP）、UI 动画平台（lottiefiles）。

## 站点清单表

| 站点 | URL | 类型 | License 详情 | 适用场景 | 备注 |
| --- | --- | --- | --- | --- | --- |
| GSAP | <https://github.com/greensock/GSAP> | JavaScript 动画库 | 标准免费，部分插件付费（如 SplitText） | Web 动画、ScrollTrigger 滚动效果 | Web 动画事实标准 |
| lottiefiles | <https://lottiefiles.com/> | UI 动画平台 | 免费 + 付费混合 | UI 微动画、After Effects 导出 Lottie JSON | 设计师友好 |

> ⚠️ License 免责声明：以上 License 信息为初步评估，实际使用前必须前往各站点官方 License 页面核实。GSAP 部分插件（如 SplitText、MorphSVG）需 Club GSAP 付费订阅。

## 同类站点深度对比

### GSAP vs lottiefiles 核心对比

| 维度 | GSAP | lottiefiles |
| --- | --- | --- |
| 类型 | JavaScript 动画库 | UI 动画平台 |
| 使用方式 | 编码（JS / TS） | 拖拽 / 导出 JSON |
| 适用场景 | Web 滚动动画、时间轴、SVG 路径 | UI 微动画、状态切换、加载动画 |
| 工具属性 | 技术性（开发者用） | 设计性（设计师用） |
| 输出格式 | 浏览器 DOM/CSS 变化 | Lottie JSON（矢量动画） |
| 学习曲线 | 中-高（需理解时间轴、缓动） | 低（拖拽 / 上传 AE 文件） |
| 核心模块 | TweenMax / TimelineMax / ScrollTrigger | Lottie Player / Lottie Editor |
| 跨平台 | 仅 Web | Web / iOS / Android / Flutter |
| 性能 | 高（直接操作 DOM） | 中-高（JSON 解析渲染） |
| 生态 | Web 开发社区 | After Effects 社区 |
| 价格模式 | 核心免费，部分插件付费 | 免费素材 + 付费素材 + 付费工具 |
| 文件大小 | 库 30KB+（gzipped） | 单动画文件 1-50KB |

### Web 动画 vs UI 动画分工

| 维度 | Web 动画（GSAP） | UI 动画（lottiefiles） |
| --- | --- | --- |
| 触发方式 | 滚动 / 鼠标 / 时间 | 状态变化（点击/加载/完成） |
| 时长 | 数秒-数十秒 | 0.5-3 秒 |
| 复杂度 | 高（多元素协调） | 中（单元素变化） |
| 设计师友好度 | 低（需开发者） | 高（设计师可独立完成） |
| 性能要求 | 高（不能卡顿） | 中（短时动画可接受） |
| 典型应用 | 滚动叙事、视差、长动画 | 加载动画、按钮反馈、状态切换 |

## 选型决策矩阵

| 使用场景 | 推荐资源（优先级降序） | 推荐理由 |
| --- | --- | --- |
| Web 滚动叙事动画 | GSAP（ScrollTrigger） | 滚动动画事实标准 |
| Web 长时间轴动画 | GSAP（TimelineMax） | 时间轴控制精准 |
| Web SVG 路径动画 | GSAP（MorphSVG 插件） | 形变动画专精 |
| Web 文字动画（拆字） | GSAP（SplitText 插件） | 文字拆分动画专精 |
| UI 加载动画 | lottiefiles | 设计师友好、跨平台 |
| UI 按钮反馈动画 | lottiefiles | 短时微动画 |
| App 状态切换动画 | lottiefiles | 跨平台 Lottie JSON |
| 设计师主导动画 | lottiefiles | 拖拽使用，无需编码 |
| 开发者主导动画 | GSAP | 代码控制精细 |
| 性能敏感场景 | GSAP | 直接操作 DOM，性能最优 |
| 跨平台（Web + Mobile） | lottiefiles | Lottie JSON 跨平台 |

## License 与商用注意事项

### License 分级

| 等级 | 含义 | 本类典型站点 |
| --- | --- | --- |
| 🟢 宽松 | 免费商用，无需署名 | GSAP 核心（标准 license） |
| 🟡 需署名 | 免费商用，但需署名 | 不在本清单典型站点 |
| 🟠 条件免费 | 部分免费，部分付费 | GSAP（Club GSAP 插件）、lottiefiles（付费素材） |
| 🔴 付费为主 | 大部分内容付费 | lottiefiles 部分高级素材 |

### 商用陷阱

1. **GSAP 插件付费陷阱**：GSAP 核心库免费，但**SplitText、MorphSVG、DrawSVG、Physics2D、ScrambleText 等插件需 Club GSAP 付费订阅**。商用前必须确认使用的插件是否在免费核心范围内。
2. **GSAP 商用 License**：Club GSAP 是按开发者席位收费，**一个开发者一个席位**，团队需购买对应数量席位。
3. **lottiefiles 素材 License 差异**：lottiefiles 上每个素材 License 独立，免费素材 License 通常宽松，**付费素材需购买后才能商用**。
4. **Lottie 文件的二次修改**：Lottie JSON 可在 lottiefiles 编辑器中修改，但**修改后是否仍受原 License 约束**取决于原 License 类型，CC-BY 等修改后需保留署名。
5. **GSAP 与 React/Vue 的集成**：GSAP 在现代框架中需用 `useGSAP`（@gsap/react）或 `useLayoutEffect`，**错误的集成会导致内存泄漏或动画重复**。
6. **ScrollTrigger 在 SSR 框架中的陷阱**：Next.js / Nuxt.js 等 SSR 框架中，**ScrollTrigger 必须在客户端 mounted 后注册**，否则会因 `window` 不存在而崩溃。
7. **Lottie 性能陷阱**：复杂 Lottie 动画在低端移动设备上可能卡顿，**生产环境必须测试目标设备性能**。
8. **Lottie 文件大小**：复杂 Lottie JSON 可能达数百 KB，**影响首屏加载**，建议按需懒加载。

## 典型工作流

### 场景 1：Web 项目接入 GSAP ScrollTrigger

1. 步骤 1：安装 GSAP：

    ```bash
    npm install gsap
    ```

2. 步骤 2：在 React/Vue 组件中引入并注册 ScrollTrigger：

    ```javascript
    import gsap from 'gsap';
    import { ScrollTrigger } from 'gsap/ScrollTrigger';
    gsap.registerPlugin(ScrollTrigger);
    ```

3. 步骤 3：在 `useLayoutEffect` 或 `useGSAP` 中编写动画：

    ```javascript
    useGSAP(() => {
      gsap.from('.hero-title', {
        scrollTrigger: {
          trigger: '.hero-section',
          start: 'top center',
          end: 'bottom center',
          scrub: 1,
        },
        y: 100,
        opacity: 0,
      });
    });
    ```

4. 步骤 4：在 SSR 框架中确保客户端注册：

    ```javascript
    if (typeof window !== 'undefined') {
      gsap.registerPlugin(ScrollTrigger);
    }
    ```

5. 步骤 5：调试时用 ScrollTrigger 的 markers：

    ```javascript
    scrollTrigger: { trigger: '.hero', markers: true }
    ```

6. 步骤 6：上线前移除 markers
7. 步骤 7：性能优化：用 `gsap.matchMedia()` 区分桌面与移动端动画

### 场景 2：UI 项目接入 lottiefiles 动画

1. 步骤 1：访问 <https://lottiefiles.com/>，搜索所需动画（如"loading"）
2. 步骤 2：下载 Lottie JSON 文件（免费素材）
3. 步骤 3：在项目中安装 Lottie Player：

    ```bash
    npm install @lottiefiles/lottie-player
    ```

4. 步骤 4：在 HTML 中使用 Web Component：

    ```html
    <lottie-player
      src="/animations/loading.json"
      background="transparent"
      speed="1"
      loop
      autoplay>
    </lottie-player>
    ```

5. 步骤 5：或在 React 中用 `@lottiefiles/react-lottie-player`：

    ```jsx
    import { Player } from '@lottiefiles/react-lottie-player';
    <Player
      src="/animations/loading.json"
      loop
      autoplay
    />
    ```

6. 步骤 6：在 credits 中记录 lottiefiles 来源（即使 License 不要求）

### 场景 3：从 After Effects 导出 Lottie 动画

1. 步骤 1：在 After Effects 中完成动画设计
2. 步骤 2：安装 Bodymovin 插件（AE > Extensions > Bodymovin）
3. 步骤 3：在 AE 中选择 Composition > Export to > Bodymovin
4. 步骤 4：在 Bodymovin 设置中：
   - 选择"Standard"格式
   - 勾选"Glyphs"（避免字体问题）
   - 设置压缩等级
5. 步骤 5：导出 JSON 文件
6. 步骤 6：在 lottiefiles 编辑器中预览与优化（移除未使用图层）
7. 步骤 7：将 JSON 文件放入项目 `public/animations/` 目录
8. 步骤 8：在前端用 Lottie Player 加载

### 场景 4：用 GSAP SplitText 做文字拆分动画（需付费插件）

1. 步骤 1：购买 Club GSAP 订阅（按开发者席位）
2. 步骤 2：下载 Club GSAP 插件包
3. 步骤 3：将 SplitText.min.js 放入项目
4. 步骤 4：注册插件：

    ```javascript
    import { SplitText } from './SplitText.min.js';
    gsap.registerPlugin(SplitText);
    ```

5. 步骤 5：拆分文字：

    ```javascript
    const split = new SplitText('.title', { type: 'chars, words' });
    gsap.from(split.chars, {
      y: 50,
      opacity: 0,
      stagger: 0.05,
    });
    ```

6. 步骤 6：注意 License 合规——团队所有开发者都需购买席位

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
- [[wiki/design/video-resources]] — 视频素材（与动画配套使用）
- [[wiki/design/icon-resources]] — 图标素材（图标常配动画）
- [[wiki/design/sound-resources]] — 声音素材（音效常与动画同步）
- [[wiki/resources/public-apis]] — 公益 API 索引

## 参考

- [ADR-009](../../docs/decisions/ADR-009-resources-and-design-domains.md) — 新建 design 领域的决策依据
- [GSAP 官方文档](https://greensock.com/docs/) — GSAP API 文档
- [GSAP GitHub](https://github.com/greensock/GSAP) — GSAP 开源仓库
