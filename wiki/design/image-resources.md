---
title: "图像素材资源"
domain: [design]
type: concept
status: active
date: 2026-07-25
tags: [design, image, resources, assets, photo, texture, pixel]
related: [wiki/design/_index]
---

## 简介

图像素材是设计项目中**最高频使用**的资源类型，覆盖摄影照片、纹理叠加、像素插画、矢量图形等多种形态。本类资源核心诉求：

1. **商用许可宽松**：避免署名、归属、衍生限制
2. **风格定位清晰**：摄影感、电影感、纹理感、像素感各司其职
3. **分辨率与格式达标**：Web 用 1920px 起、印刷用 4K+、PNG/JPEG/WebP 全覆盖
4. **风格一致性**：同项目优先同站点取材，避免风格跳跃

涵盖 5 个站点，按风格定位可分为三大阵营：综合照片站（pixabay / unsplash / pexels）、纹理叠加站（texturelabs）、像素游戏素材站（spriters-resource）。

## 站点清单表

| 站点 | URL | 类型 | License 详情 | 适用场景 | 备注 |
| --- | --- | --- | --- | --- | --- |
| pixabay | <https://pixabay.com/zh/> | 综合素材（照片+插画+矢量） | Pixabay License（免费商用，无需署名） | 通用图片需求首选 | 中文界面、内容最综合 |
| unsplash | <https://unsplash.com/> | 电影感照片+矢量插画 | Unsplash License（免费商用，无需署名） | 高端摄影感、电影质感 | 摄影师社区驱动，质量上限高 |
| pexels | <https://www.pexels.com/> | 摄影向照片 | Pexels License（免费商用，无需署名） | 高质量摄影感照片 | 含视频与动态壁纸 |
| texturelabs | <https://texturelabs.org/> | 纹理素材 | CC-BY（需署名） | Photoshop 纹理叠加、材质贴图 | 高质量无损纹理、含教学 |
| spriters-resource | <https://www.spriters-resource.com/> | 老式像素游戏素材 | 版权复杂，需逐个检查 | 像素风游戏开发、复古风格 | 收录商业游戏素材，License 不统一 |

> ⚠️ License 免责声明：以上 License 信息为初步评估，实际使用前必须前往各站点官方 License 页面核实。spriters-resource 尤其需逐素材确认。

## 同类站点深度对比

### 三大综合照片站对比

| 维度 | pixabay | unsplash | pexels |
| --- | --- | --- | --- |
| 风格定位 | 综合通用 | 电影感、艺术摄影 | 摄影感、生活化 |
| 内容数量级 | 200 万+ | 300 万+ | 10 万+ |
| 更新频率 | 高（日更百张+） | 高（日更数十张） | 中（日更） |
| API 可用性 | 有（需注册 Key） | 有（需申请） | 有（需申请 Key） |
| 分辨率上限 | 原图（最高 6000px+） | 原图（最高 8000px+） | 原图（最高 6000px+） |
| 中文支持 | 完整 | 仅搜索 | 仅搜索 |
| 矢量插画 | 有 | 有（少量） | 无 |
| 视频素材 | 有（同站） | 无（独立站） | 有（同站） |
| 署名要求 | 否 | 否 | 否 |
| 商用许可 | 宽松 | 宽松 | 宽松 |

### 纹理与像素站对比

| 维度 | texturelabs | spriters-resource |
| --- | --- | --- |
| 风格定位 | 写实纹理（金属/纸/锈迹/光斑） | 像素游戏精灵图、背景 |
| 内容数量级 | 数百张（精选） | 数十万张（游戏素材） |
| 用途 | Photoshop 叠加、3D 贴图、合成 | 游戏开发、复古风设计 |
| License 统一性 | 全站统一 CC-BY | 逐素材不同（部分为版权游戏素材） |
| 商用风险 | 低（仅需署名） | 高（需逐个核实） |
| 分辨率 | 高（4K 起） | 低（原生像素尺寸） |

## 选型决策矩阵

| 使用场景 | 推荐站点（优先级降序） | 推荐理由 |
| --- | --- | --- |
| Web 落地页主视觉（写实摄影感） | unsplash / pexels / pixabay | unsplash 电影感最强，pexels 生活化，pixabay 综合 |
| Web 落地页主视觉（矢量插画） | pixabay / unsplash | pixabay 矢量多，unsplash 少量但精品 |
| 商务/PPT 配图（安全通用） | pixabay / pexels | 中文界面友好、风格中性、商用零风险 |
| Photoshop 纹理叠加（材质感） | texturelabs | 唯一专业纹理站，CC-BY 仅需署名 |
| 像素风游戏开发 | spriters-resource / opengameart | spriters-resource 精灵图丰富，opengameart License 更明确 |
| API 批量获取 | pixabay / pexels | API 文档完善，需注册免费 Key |
| 中文项目（界面与搜索友好） | pixabay | 唯一完整中文化的站点 |
| 高端品牌主视觉 | unsplash | 摄影师社区驱动，质量上限最高 |

## License 与商用注意事项

### License 分级

| 等级 | 含义 | 本类典型站点 |
| --- | --- | --- |
| 🟢 宽松 | 免费商用，无需署名 | pixabay、unsplash、pexels |
| 🟡 需署名 | 免费商用，但需署名 | texturelabs（CC-BY） |
| ⚠️ 需逐个检查 | License 不统一，需逐素材核实 | spriters-resource |

### 商用陷阱

1. **spriters-resource 版权陷阱**：站点收录大量商业游戏（如塞尔达、马里奥）的精灵图，**素材本身可能受游戏厂商版权保护**，License 仅指上传者的授权，不代表原作版权已释放。商用前必须确认素材是否为同人创作或真正开源。
2. **unsplash 模特/商标陷阱**：unsplash License 仅覆盖摄影师授权，**不包含画面中可识别人物肖像权与商标权**，商用前需检查是否含可识别人脸或品牌 logo。
3. **texturelabs 署名要求**：CC-BY 要求在作品中显著署名作者与原链接，不可省略。
4. **API 速率限制**：pixabay/pexels API 均有速率限制（pixabay 100 req/h、pexels 200 req/h），批量获取需排队。
5. **二次销售禁令**：所有站点均禁止将素材原样打包转售，仅可作为创作素材使用。
6. **衍生作品的灰色地带**：对原图做轻微调色仍可能被视为原作，建议做显著合成或重新创作。

## 典型工作流

### 场景 1：做 Web 落地页背景图

1. 步骤 1：明确风格定位（电影感 → unsplash、生活化 → pexels、综合 → pixabay）
2. 步骤 2：在站点搜索关键词，使用站点自带的尺寸/颜色/方向过滤器
3. 步骤 3：下载原图（最高分辨率），检查文件名是否含作者信息（用于存档）
4. 步骤 4：在 Photoshop/Figma 中按需裁剪、调色、合成
5. 步骤 5：导出 WebP（小于 JPEG）或 JPEG（兼容性），分辨率 1920×1080 起
6. 步骤 6：在项目 README 或 credits 中记录来源（即使无需署名也建议记录）

### 场景 2：做 Photoshop 纹理叠加效果

1. 步骤 1：访问 texturelabs.org，按纹理类型（金属/纸/光斑/锈迹）筛选
2. 步骤 2：下载 4K 纹理图（PNG 或 JPEG）
3. 步骤 3：在 Photoshop 中将纹理图层置于主图上方
4. 步骤 4：图层混合模式选 Overlay / Soft Light / Multiply（按效果选择）
5. 步骤 5：调整不透明度（建议 30%-70%）
6. 步骤 6：在最终作品显著位置或在 credits 页标注 texturelabs 与具体纹理作者

### 场景 3：做像素风独立游戏

1. 步骤 1：先到 opengameart 查找明确 CC0/CC-BY 的像素素材
2. 步骤 2：若未找到合适素材，再到 spriters-resource 浏览同人创作或原创精灵图
3. 步骤 3：**必须**点击素材详情页，查看 License 字段，记录作者声明
4. 步骤 4：避开所有商业游戏（如马里奥、塞尔达、宝可梦）的同人精灵图
5. 步骤 5：选择同人原创或完全原创素材
6. 步骤 6：在游戏 credits 中显式列出每个素材的来源与 License

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
- [[wiki/design/video-resources]] — 视频素材（含 mixkit、giphy）
- [[wiki/design/3d-model-resources]] — 3D 模型与 PBR 贴图
- [[wiki/resources/public-apis]] — 公益 API 索引（含图片 API）

## 参考

- [ADR-009](../../docs/decisions/ADR-009-resources-and-design-domains.md) — 新建 design 领域的决策依据
