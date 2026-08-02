---
title: 颜色素材资源
domain: [design]
type: concept
status: active
date: 2026-07-25
tags: [design, color, palette, gradient, resources, assets, css]
related: [wiki/design/_index]
use_count: 2
---


## 简介

颜色素材涵盖**配色方案、颜色字典、渐变生成器、关键词联想**四类工具，是 Web 与 UI 设计的视觉决策依据。本类资源核心诉求：

1. **决策阶段差异化**：概念阶段用 picular 关键词联想，方案阶段用 colorhunt 配色，实施阶段用 grabient 微调渐变
2. **配色 vs 颜色字典区分**：colorhunt 是 4 色配色方案，color-hex 是单一 hex 色的衍生色查询
3. **CSS 集成便捷**：渐变工具应能直接导出 CSS `linear-gradient` 代码
4. **License 宽松**：颜色本身不可版权化，但配色方案集合属创作产物，使用仍建议署名

涵盖 5 个站点，按定位可分为：配色方案（colorhunt）、颜色字典（color-hex）、渐变工具（uigradients、grabient）、关键词联想（picular）。

## 站点清单表

| 站点 | URL | 类型 | License 详情 | 适用场景 | 备注 |
| --- | --- | --- | --- | --- | --- |
| colorhunt | <https://colorhunt.co/> | 配色方案 | 免费使用 | 配色灵感、四色配色方案 | 社区上传，每日更新 |
| color-hex | <https://www.color-hex.com/> | 颜色字典 | 免费使用 | 查特定 hex 色的配色、渐变、阴影 | 单色衍生查询 |
| uigradients | <https://uigradients.com/> | 渐变色素材 | 免费使用 | CSS 渐变灵感 | 收录精选渐变 |
| grabient | <https://www.grabient.com/> | 渐变色生成器 | 免费使用 | 可视化调整渐变 | 可拖拽色点 |
| picular | <https://picular.co/> | 颜色联想 | 免费使用 | 关键词联想颜色（如"海洋"→蓝色系） | AI 关键词到色彩 |

> ⚠️ License 免责声明：颜色本身不受版权保护，但配色方案的"集合"与"展示方式"可能有创作权。使用仍建议在项目 credits 中标注参考来源。

## 同类站点深度对比

### 五站核心维度对比

| 维度 | colorhunt | color-hex | uigradients | grabient | picular |
| --- | --- | --- | --- | --- | --- |
| 类型 | 配色方案（4 色） | 单色衍生字典 | 渐变素材库 | 渐变生成器 | 关键词联想 |
| 输入 | 浏览/选风格 | 单个 hex | 浏览/筛选 | 调整色点 | 关键词 |
| 输出 | 4 个 hex | 单色 + 衍生色集 | CSS 渐变 | CSS 渐变 | 单 hex |
| 内容数量级 | 数千套 | 任意 hex | 数百个 | 无限（自调） | 无限（关键词） |
| 风格倾向 | 趋势性、社区驱动 | 工具性 | 精选、稳定 | 工具性 | 概念性 |
| 适合阶段 | 方案阶段 | 实施阶段 | 灵感阶段 | 实施阶段 | 概念阶段 |
| 是否可调色 | 否（仅复制） | 否 | 否 | 是 | 否 |
| 导出格式 | hex / RGB | hex / RGB / HSL | CSS 代码 | CSS 代码 | hex / RGB |
| 更新频率 | 日更 | 不依赖更新 | 不常更新 | 工具性 | AI 实时 |
| API 可用性 | 无 | 无 | 无 | 无 | 无 |

### 配色方案 vs 颜色字典

| 维度 | 配色方案（colorhunt） | 颜色字典（color-hex） |
| --- | --- | --- |
| 用途 | 找整套和谐配色 | 查单个色的衍生 |
| 输出 | 4 色组合（主+辅+点缀+背景） | 单色 + 5-10 个相似/对比色 |
| 决策角度 | 风格导向 | 颜色工程导向 |
| 使用阶段 | 整体方案设计 | 局部颜色调整 |
| 适用项目类型 | UI/品牌 | 设计细节/前端实现 |

### 渐变工具对比

| 维度 | uigradients | grabient |
| --- | --- | --- |
| 定位 | 渐变素材库 | 渐变生成器 |
| 用法 | 浏览精选渐变，复制 CSS | 拖拽色点自定义渐变 |
| 灵活度 | 低（仅预设） | 高（自由调整） |
| 适合阶段 | 灵感阶段 | 实施阶段 |
| 上手难度 | 低（直接抄） | 中（需理解渐变原理） |

## 选型决策矩阵

| 使用场景 | 推荐站点（优先级降序） | 推荐理由 |
| --- | --- | --- |
| 概念阶段找色彩方向 | picular / colorhunt | picular 关键词联想，colorhunt 趋势配色 |
| 方案阶段找完整配色 | colorhunt | 4 色和谐配色，社区精选 |
| 找 CSS 渐变素材 | uigradients | 精选渐变库，直接复制 CSS |
| 微调渐变（自定义色点） | grabient | 可拖拽色点，实时预览 |
| 查特定 hex 色的衍生 | color-hex | 单色衍生查询工具 |
| 关键词联想颜色（如"海洋"） | picular | AI 关键词到色彩映射 |
| Web 落地页主背景渐变 | grabient / uigradients | grabient 自调，uigradients 选预设 |
| UI 主色系（4 色组合） | colorhunt | 4 色和谐 |
| 单一品牌色系深化 | color-hex | 衍生色丰富 |
| 主题色（季节/情感） | picular | 关键词联想适合情感色彩 |

## License 与商用注意事项

### License 分级

| 等级 | 含义 | 本类典型站点 |
| --- | --- | --- |
| 🟢 宽松 | 免费使用，无需署名 | colorhunt、color-hex、uigradients、grabient、picular |

### 商用陷阱

1. **配色方案无版权但有创作权**：颜色本身不受版权保护，但 colorhunt 上一组特定 4 色组合可能被视为创作产物，**直接复用整套配色虽不违法，但建议在 credits 中标注灵感来源**。
2. **品牌色冲突风险**：自行设计的品牌色可能与知名企业品牌色冲突（如 Tiffany 蓝、可口可乐红），上线前建议查询商标注册库。
3. **渐变方向不可注册商标**：渐变方向在大多数国家不可注册商标，但 Pantone 与某些品牌（如 Instagram 渐变）有强使用权主张。
4. **AI 联想结果的不可预测性**：picular 的关键词到颜色映射是 AI 模型，**同一关键词多次查询可能得到不同结果**，建议截图保存首次结果。
5. **色盲可达性**：选用配色后必须用色盲模拟器（如 Coblis）检查可达性，颜色对比度需符合 WCAG AA（4.5:1）。
6. **暗黑模式适配**：所选配色需在浅色与深色两种模式下都可达，建议同时设计两套。

## 典型工作流

### 场景 1：从概念到实施的完整配色流程

1. 步骤 1（概念阶段）：访问 picular.co，输入项目关键词（如"温暖科技"），获取联想色 hex
2. 步骤 2（方案阶段）：访问 colorhunt.co，按主色调筛选，找 4 色和谐配色
3. 步骤 3（实施阶段）：将 4 色 hex 写入 CSS 变量：

    ```css
    :root {
      --color-primary: #FF6B6B;
      --color-secondary: #4ECDC4;
      --color-accent: #FFE66D;
      --color-background: #F7FFF7;
    }
    ```

4. 步骤 4（局部深化）：访问 color-hex.com，输入主色 hex，找衍生色用于 hover、disabled 状态
5. 步骤 5（可达性检查）：用 WebAIM Contrast Checker 验证文本与背景对比度 ≥ 4.5:1
6. 步骤 6（暗黑模式）：调暗主色亮度 20%、调亮背景为深色，再次验证对比度

### 场景 2：Web 落地页渐变背景

1. 步骤 1（灵感阶段）：访问 uigradients.com 浏览精选渐变
2. 步骤 2：选定一个渐变作为起点，复制 CSS 代码：

    ```css
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    ```

3. 步骤 3（微调阶段）：访问 grabient.com，输入起点色与终点色，拖拽色点调整
4. 步骤 4：增加色点（3-4 色渐变更丰富），调整角度
5. 步骤 5：复制最终 CSS 代码到项目：

    ```css
    .hero {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
      min-height: 100vh;
    }
    ```

6. 步骤 6：在背景图上叠加半透明纹理（来自 texturelabs）增加质感

### 场景 3：用 color-hex 找特定颜色的全套配色

1. 步骤 1：明确主色 hex（如品牌主色 `#3366FF`）
2. 步骤 2：访问 <https://www.color-hex.com/color/3366FF>
3. 步骤 3：浏览页面提供的衍生色：
   - Tints（提亮）：与白色混合的渐变
   - Shades（加深）：与黑色混合的渐变
   - Saturated：饱和度变化
   - Harmony：和谐配色（complementary、analogous、triadic）
4. 步骤 4：将主色与衍生色组合为完整设计系统：

    ```css
    :root {
      --primary-50: #f0f4ff;
      --primary-100: #d9e3ff;
      --primary-500: #3366FF;  /* 主色 */
      --primary-700: #1a3d99;  /* Shades */
      --primary-900: #0d1f4d;
    }
    ```

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
- [[wiki/design/image-resources]] — 图像素材（颜色与图像共定视觉风格）
- [[wiki/design/icon-resources]] — 图标素材（图标颜色常基于配色方案）
- [[wiki/design/font-resources]] — 字体素材
- [[wiki/resources/public-apis]] — 公益 API 索引（含颜色 API）

## 参考

- [ADR-009](../../docs/decisions/ADR-009-resources-and-design-domains.md) — 新建 design 领域的决策依据
