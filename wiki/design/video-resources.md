---
title: "视频素材资源"
domain: [design]
type: concept
status: active
date: 2026-07-25
tags: [design, video, gif, sticker, motion, resources, assets]
related: [[wiki/design/_index]]
---

## 简介

视频素材涵盖 **背景视频、转场视频、GIF 动图、贴纸**等场景，是 Web 落地页、社交媒体、PPT 演示的关键资源。本类资源核心诉求：

1. **转场 vs 背景视频分工**：mixkit 提供完整背景视频，giphy 提供 GIF 与贴纸
2. **GIF 与贴纸的轻量化**：GIF 适合社交媒体短动图，贴纸适合即时通讯应用
3. **商用 License 注意**：mixkit 部分视频需署名，giphy API 有速率限制
4. **格式与编码**：MP4（H.264）/ WebM（VP9）/ GIF，需考虑浏览器兼容性

涵盖 2 个站点，按内容定位可分为：完整视频素材（mixkit）、GIF 与贴纸（giphy）。

## 站点清单表

| 站点 | URL | 类型 | License 详情 | 适用场景 | 备注 |
| --- | --- | --- | --- | --- | --- |
| mixkit | <https://mixkit.co/free-stock-video/> | 免费视频素材 | Mixkit License（免费商用，部分需署名） | 转场、背景视频 | 含音效与音乐 |
| giphy | <https://giphy.com/> | GIF 与贴纸 | 免费使用，API 有速率限制 | 社交媒体、表情包、动图 | 全球最大 GIF 平台 |

> ⚠️ License 免责声明：以上 License 信息为初步评估，实际使用前必须前往各站点官方 License 页面核实。mixkit License 中"部分需署名"的具体判定需查看每个视频详情页。

## 同类站点深度对比

### mixkit vs giphy 核心对比

| 维度 | mixkit | giphy |
| --- | --- | --- |
| 内容类型 | 完整视频素材（5-60 秒） | GIF 动图与贴纸 |
| 时长 | 5-60 秒 | 1-10 秒 |
| 分辨率 | 4K / 1080p / 720p | GIF：480p 起 |
| 文件格式 | MP4 / MOV | GIF / MP4 / WebP |
| 内容数量级 | 数万 | 数亿 |
| License 统一性 | 中（部分需署名） | 中（API 速率限制） |
| 商用许可 | 宽松（部分需署名） | 宽松（API 有限制） |
| 署名要求 | 部分视频需署名 | 否 |
| API 可用性 | 无 | 有（GIPHY API，需 Key） |
| API 速率限制 | 无 | 1000 req/h（免费） |
| 上传社区 | 是（精选） | 是（开放） |
| 中文支持 | 仅搜索 | 仅搜索 |
| 包含内容 | 视频 + 音效 + 音乐 | GIF + 贴纸 + 表情包 |

### 完整视频 vs GIF 与贴纸分工

| 维度 | 完整视频（mixkit） | GIF 与贴纸（giphy） |
| --- | --- | --- |
| 用途 | 背景视频、转场、主视觉 | 社交媒体、表情包、即时通讯 |
| 时长 | 5-60 秒 | 1-10 秒 |
| 文件大小 | 数 MB-数十 MB | 数 KB-数 MB |
| 加载性能 | 中（需预加载） | 高（小文件） |
| 适用项目 | Web 落地页、商业视频、PPT | 聊天 App、社交平台、社区 |
| 设计师主导度 | 中（需剪辑） | 高（直接使用） |
| 开发者集成难度 | 中（需 video 标签） | 低（直接 img 或 API） |

## 选型决策矩阵

| 使用场景 | 推荐站点（优先级降序） | 推荐理由 |
| --- | --- | --- |
| Web 落地页背景视频 | mixkit | 4K 高清、License 宽松、商用友好 |
| 商业视频转场 | mixkit | 转场视频丰富、商用许可明确 |
| 社交媒体 GIF 表情包 | giphy | 全球最大 GIF 库 |
| 聊天 App 贴纸集成 | giphy | GIPHY API 完善贴纸获取 |
| PPT 演示背景 | mixkit | 高清视频背景 |
| 邮件签名动图 | giphy | 小文件 GIF 适合邮件 |
| 短视频创作（TikTok/抖音） | mixkit / giphy | mixkit 提供素材，giphy 提供表情 |
| API 批量获取 GIF | giphy | GIPHY API 完善 |
| 商用项目（License 安全优先） | mixkit | License 相对明确，giphy API 限制多 |

## License 与商用注意事项

### License 分级

| 等级 | 含义 | 本类典型站点 |
| --- | --- | --- |
| 🟢 宽松 | 免费商用，无需署名 | mixkit（部分视频）、giphy |
| 🟡 需署名 | 免费商用，但需署名 | mixkit（部分视频需署名） |
| 🟠 条件免费 | 部分免费，部分付费 | 不在本清单典型站点 |

### 商用陷阱

1. **mixkit 部分视频需署名**：mixkit License 中"免费商用，部分需署名"的具体判定需查看每个视频详情页的 License 字段，**省略署名属侵权**。
2. **mixkit License 限制**：mixkit License **禁止将素材原样打包转售**，仅可作为创作素材使用。**禁止用 mixkit 素材做"logo 或商标"**。
3. **giphy API 速率限制**：免费 GIPHY API Key 限制 1000 req/h，**生产环境需考虑缓存**或申请更高配额。
4. **giphy 上传内容版权**：giphy 上内容由用户上传，**个别 GIF 可能涉及版权内容**（如电影片段、明星肖像）。商用前需做基础判断，避开明显的版权内容。
5. **giphy 商业 API 升级**：超出免费配额需购买 GIPHY 商业 API 订阅，按调用量付费。
6. **GIF 中的肖像权**：GIF 中若包含可识别真实人物肖像，**商用可能涉及肖像权**，需特别谨慎。
7. **GIF 中的商标**：GIF 中若包含品牌 logo（如可口可乐、苹果），**商用可能涉及商标侵权**。
8. **MP4 vs WebM 兼容性**：mixkit 默认提供 MP4（H.264），现代浏览器兼容性好；**WebM（VP9）文件更小但 Safari 兼容性需确认**。
9. **giphy API 与 embed 的差异**：giphy 提供两种集成方式：
   - embed iframe：免 API Key，但样式不可控
   - API：需 Key，可定制，但有速率限制

## 典型工作流

### 场景 1：Web 落地页接入 mixkit 背景视频

1. 步骤 1：访问 <https://mixkit.co/free-stock-video/>，按主题筛选（如"Business"、"Nature"）
2. 步骤 2：选择合适视频，查看详情页 License 字段（是否需署名）
3. 步骤 3：下载 MP4 格式（4K 或 1080p 视项目需求）
4. 步骤 4：用 FFmpeg 优化视频（压缩、转换格式）：

    ```bash
    ffmpeg -i input.mp4 -c:v libx264 -crf 23 -preset slow -c:a aac output.mp4
    ```

5. 步骤 5：在 HTML 中用 video 标签：

    ```html
    <video autoplay muted loop playsinline>
      <source src="/videos/hero.mp4" type="video/mp4">
    </video>
    ```

6. 步骤 6：注意 `muted` 是浏览器自动播放的强制要求
7. 步骤 7：在 footer 或 credits 中标注来源（即使无需署名也建议记录）

### 场景 2：聊天 App 集成 GIPHY 贴纸 API

1. 步骤 1：访问 <https://developers.giphy.com/>，注册开发者账号
2. 步骤 2：创建 App，获取 API Key（免费版 1000 req/h）
3. 步骤 3：在后端或前端调用 GIPHY API：

    ```javascript
    const apiKey = 'YOUR_API_KEY';
    const query = 'happy';
    const url = `https://api.giphy.com/v1/stickers/search?api_key=${apiKey}&q=${query}&limit=10`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        data.data.forEach(gif => {
          const imgUrl = gif.images.fixed_height.url;
          // 渲染到 UI
        });
      });
    ```

4. 步骤 4：实现缓存机制避免超过速率限制：

    ```javascript
    const cache = new Map();
    async function searchWithCache(query) {
      if (cache.has(query)) return cache.get(query);
      const result = await fetch(`${url}?q=${query}`).then(r => r.json());
      cache.set(query, result);
      return result;
    }
    ```

5. 步骤 5：在 UI 中显示 GIF，用户点击发送
6. 步骤 6：在 App about 页标注 "Powered by GIPHY"

### 场景 3：用 giphy embed 在邮件中插入 GIF

1. 步骤 1：访问 <https://giphy.com/>，搜索关键词
2. 步骤 2：点击所需 GIF，点击"Embed"
3. 步骤 3：复制 iframe 嵌入代码
4. 步骤 4：在邮件 HTML 中嵌入：

    ```html
    <iframe src="https://giphy.com/embed/abc123" width="480" height="270" frameborder="0">
    </iframe>
    ```

5. 步骤 5：注意部分邮件客户端不支持 iframe，建议同时提供静态 GIF 备份：

    ```html
    <a href="https://giphy.com/gifs/abc123">
      <img src="https://media.giphy.com/media/abc123/giphy.gif" alt="description">
    </a>
    ```

6. 步骤 6：检查 GIF 文件大小（建议 < 1MB，邮件客户端加载快）

## 相关页面

- [[wiki/design/_index]] — 设计素材领域索引
- [[wiki/design/image-resources]] — 图像素材（视频与图像常配套）
- [[wiki/design/animation-resources]] — 动画素材（GIF 与动画相似）
- [[wiki/design/sound-resources]] — 声音素材（视频常配声音）
- [[wiki/resources/public-apis]] — 公益 API 索引（GIPHY API 也属外部 API）

## 参考

- [ADR-009](../../docs/decisions/ADR-009-resources-and-design-domains.md) — 新建 design 领域的决策依据
- [GIPHY API 文档](https://developers.giphy.com/docs/api) — GIPHY 开发者文档
- [mixkit License](https://mixkit.co/license/) — mixkit 官方 License 页面
