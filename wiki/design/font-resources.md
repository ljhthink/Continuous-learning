---
title: "字体素材资源"
domain: [design]
type: concept
status: active
date: 2026-07-25
tags: [design, font, typography, resources, assets, chinese, english]
related: [[wiki/design/_index]]
---

## 简介

字体素材是**品牌识别与文本可读性**的核心载体。本类资源核心诉求：

1. **License 严格性**：字体 License 涉及"个人使用 / 商用 / 嵌入 / Web 嵌入 / 二次修改"多个维度，远比图像复杂
2. **中英文字体差异大**：中文字体文件大（多 5-10MB）、字形数多（GB2312 含 6763 字），与英文字体生态不同
3. **Web 字体优化**：中文字体 Web 嵌入需考虑子集化（subset）、字体格式（woff2）、字体加载策略
4. **商用 license 陷阱密集**：dafont/fontzone 等站点上"个人免费 ≠ 商用免费"，必须逐字体核实

涵盖 4 个站点，按语言定位可分为：开源英文（Google Fonts）、英文装饰（dafont、fontzone）、中文（zimon）。

## 站点清单表

| 站点 | URL | 类型 | License 详情 | 适用场景 | 备注 |
| --- | --- | --- | --- | --- | --- |
| Google Fonts | <https://fonts.google.com/> | 开源字体（含中英文） | 各字体独立开源 license | Web 字体首选、英文开源字体 | 含图标（Material Icons） |
| dafont | <https://www.dafont.com/> | 英文字体 | 个人免费，商用需逐个检查 | 英文装饰字体、个性字体 | License 不统一，需逐字体核实 |
| fontzone | <https://www.fontzone.net/> | 英文字体 | 类似 dafont，需逐个检查 | 英文字体备选 | 风格类似 dafont |
| zimon | <https://zimon.cc/tool> | 中文字体 | 需逐个检查 | 中文字体下载 | 字体工具站 |

> ⚠️ License 免责声明：以上 License 信息为初步评估，实际使用前必须前往各站点官方 License 页面核实。**字体 License 是设计素材中陷阱最多的一类**，dafont/fontzone/zimon 的每个字体均需单独确认。

## 同类站点深度对比

### 字体站核心维度对比

| 维度 | Google Fonts | dafont | fontzone | zimon |
| --- | --- | --- | --- | --- |
| 语言定位 | 英文为主，含部分中文 | 仅英文 | 仅英文 | 仅中文 |
| 内容数量级 | 1500+ 字体族 | 6 万+ | 1 万+ | 数百款 |
| License 统一性 | 高（开源） | 低（逐字体不同） | 低（逐字体不同） | 低（逐字体不同） |
| 商用安全性 | 高 | 需逐字体检查 | 需逐字体检查 | 需逐字体检查 |
| Web 嵌入支持 | 官方 API + woff2 | 需自托管 | 需自托管 | 需自托管 |
| 中文字体覆盖 | 少量（如 Noto Sans SC） | 无 | 无 | 丰富 |
| 装饰字体丰富度 | 中（开源为主） | 极高 | 高 | 中（中文化装饰） |
| 子集化工具 | 官方 API 自动子集 | 需手动用 fontTools | 需手动用 fontTools | 需手动用 fontTools |
| 免费下载 | 是 | 是 | 是 | 是 |

### 中英文字体生态对比

| 维度 | 英文字体生态 | 中文字体生态 |
| --- | --- | --- |
| 字体文件大小 | 50KB-1MB（普通） | 3-15MB（普通） |
| 字形数量 | 100-500 字符 | 6763-70000 字符 |
| 商用免费比例 | 高（开源文化成熟） | 低（中文设计成本高） |
| Web 嵌入难度 | 低（Google Fonts API） | 高（必须子集化） |
| 子集化必要性 | 通常不需要 | 必须（否则首屏加载 5MB+） |
| 主流开源家族 | Roboto、Inter、Lato | Noto Sans SC、Source Han Sans |
| 商用付费典型 | 大型商业字库（Helvetica） | 方正、汉仪、华文（按年订阅） |

## 选型决策矩阵

| 使用场景 | 推荐站点（优先级降序） | 推荐理由 |
| --- | --- | --- |
| Web 项目英文字体 | Google Fonts | 开源可商用、官方 API 一行引入 |
| Web 项目中文字体 | Google Fonts（Noto Sans SC） / zimon | Google Fonts 子集化完善，zimon 选择多 |
| 商务/PPT 字体 | Google Fonts | License 安全、风格经典 |
| 英文 logo 装饰字体 | dafont / fontzone | 装饰性强，但需检查商用 license |
| 中文品牌字体 | zimon + 二次确认 | 国内字体需逐个核实商用许可 |
| 印刷品字体 | dafont / Google Fonts | 商用需检查"印刷"用途是否允许 |
| 需要嵌入 PDF/eBook | Google Fonts | 开源 license 通常允许嵌入 |
| 移动 App 内置字体 | Google Fonts | 开源 license 通常允许 |
| 商业品牌识别字 | 商业字库（方正/汉仪） | 付费但可注册商标，开源字体不可注册 |

## License 与商用注意事项

### License 分级

| 等级 | 含义 | 本类典型站点 |
| --- | --- | --- |
| 🟢 宽松 | 免费商用，无需署名 | Google Fonts（多数 OFL / Apache 2.0） |
| 🟡 需署名 | 免费商用，但需署名 | 部分开源字体（OFL 要求保留版权声明） |
| ⚠️ 需逐个检查 | License 不统一，需逐字体核实 | dafont、fontzone、zimon |
| 🔴 付费为主 | 大部分内容付费 | 不在本清单（方正/汉仪等商业字库） |

### 商用陷阱

1. **dafont 个人免费 ≠ 商用免费**：dafont 上每个字体的 License 由上传者独立决定。常见的 License 类型包括 100% Free（个人商用全免费）、Free for Personal Use（仅个人免费，商用需付费）、Demo（仅试用版本免费）。**下载后必须查看 ZIP 内的 README 或 LICENSE 文件**。
2. **fontzone 与 dafont 同性质陷阱**：fontzone 与 dafont 同为字体聚合站，License 同样逐字体不同，处理方式与 dafont 一致。
3. **zimon 中文字体的特殊性**：中文字体设计成本极高（每个字体需绘 6763+ 字形），**完全免费可商用的中文字体极少**，多为"个人免费 / 商用付费"或"署名免费 / 不署名付费"。
4. **Google Fonts 子项目 License 差异**：Google Fonts 平台上的字体来自不同设计师，**License 多为 OFL 或 Apache 2.0，但每个字体 License 独立**，使用前需在字体详情页确认。
5. **Web 嵌入（@font-face）的商用性**：部分字体 License 明确禁止 Web 嵌入（如仅允许本地使用），dafont 上有"Personal Use Only"字体不可用于网页。
6. **字体子集化的合规性**：对中文字体做子集化（subset）属于"修改"，OFL 允许子集化但禁止修改字体名，部分商业字体 License 明确禁止子集化。
7. **logo 字体陷阱**：用字体做 logo 时，**开源字体（OFL）通常禁止单独出售字体本身，但允许用于 logo 设计**。商业字体（方正等）通常需购买"商标用途"许可。
8. **PDF 嵌入陷阱**：部分字体 License 区分"预览嵌入"（不可编辑）与"可编辑嵌入"，PDF 分发需确认。

## 典型工作流

### 场景 1：Web 项目接入 Google Fonts

1. 步骤 1：访问 <https://fonts.google.com/>，搜索所需字体（如 Inter）
2. 步骤 2：点击字体卡片，选择所需字重（Regular 400、Bold 700 等）
3. 步骤 3：复制 `<link>` 或 `@import` 代码：

    ```html
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
    ```

4. 步骤 4：在 CSS 中使用：

    ```css
    body { font-family: 'Inter', sans-serif; }
    ```

5. 步骤 5：可选——下载 woff2 自托管（避免依赖 Google CDN）

### 场景 2：Web 项目中文字体子集化（关键工作流）

1. 步骤 1：从 Google Fonts 选 Noto Sans SC（开源 OFL）或从 zimon 选目标字体
2. 步骤 2：下载原字体文件（TTF 或 OTF，5-15MB）
3. 步骤 3：用 fontTools 或 glyphhanger 做子集化，仅保留页面用到的字符：

    ```bash
    pyftsubset NotoSansSC.otf \
      --text-file=used-chars.txt \
      --output-file=NotoSansSC-subset.woff2 \
      --flavor=woff2 \
      --layout-features='*'
    ```

4. 步骤 4：将 woff2 文件放入项目静态资源目录
5. 步骤 5：在 CSS 中定义：

    ```css
    @font-face {
      font-family: 'Noto Sans SC';
      src: url('/fonts/NotoSansSC-subset.woff2') format('woff2');
      font-display: swap;
    }
    body { font-family: 'Noto Sans SC', sans-serif; }
    ```

6. 步骤 6：用 `font-display: swap` 避免 FOIT（Flash of Invisible Text）

### 场景 3：在 dafont 上找装饰英文字体

1. 步骤 1：访问 <https://www.dafont.com/>，按主题分类（如"Decorative"、"Script"）
2. 步骤 2：浏览字体，点击"Download"下载 ZIP
3. 步骤 3：解压 ZIP，**必须**查看其中的 README.txt 或 LICENSE.txt
4. 步骤 4：检查 License 类型：
   - "100% Free" → 个人商用均可，无需署名（仍建议署名）
   - "Free for Personal Use" → 仅个人免费，商用需联系作者付费
   - "Demo" → 试用版，仅部分字符可用
5. 步骤 5：商用场景下，若为"Free for Personal Use"，必须发邮件给作者获取商用授权（通常需付费）
6. 步骤 6：在项目 credits 中记录字体名、作者、License 类型、来源 URL

## 相关页面

- [[wiki/design/_index]] — 设计素材领域索引
- [[wiki/design/icon-resources]] — 图标素材（图标与字体常配套使用）
- [[wiki/design/color-resources]] — 颜色素材
- [[wiki/design/image-resources]] — 图像素材
- [[wiki/resources/public-apis]] — 公益 API 索引

## 参考

- [ADR-009](../../docs/decisions/ADR-009-resources-and-design-domains.md) — 新建 design 领域的决策依据
