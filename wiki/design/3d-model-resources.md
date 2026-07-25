---
title: "3D 模型素材资源"
domain: [design]
type: concept
status: active
date: 2026-07-25
tags: [design, 3d, model, pbr, hdri, resources, assets, blender, scan]
related: [[wiki/design/_index]]
---

## 简介

3D 模型素材是**最复杂的设计资源类型**，涵盖 3D 模型、PBR 贴图、HDRI 环境图、材质预设等多种子类。本类资源核心诉求：

1. **License 层级差异极大**：从 CC0（完全免费商用）到付费订阅，跨度巨大
2. **写实 vs 风格化分流**：扫描级写实（megascans）vs 风格化卡通（手绘模型）
3. **PBR 贴图工作流标准化**：Albedo / Normal / Roughness / Metallic / AO / Height 多通道贴图
4. **HDRI 是写实渲染的基础**：HDRI 决定光照环境，质量上限直接决定渲染真实感
5. **DCC 工具绑定**：Blender / Maya / 3ds Max / UE / Unity 工作流差异显著

涵盖 8 个站点，按付费层级可分为：CC0 完全免费（polyhaven、opengameart）、免费+付费混合（sketchfab、cubebrush、blenderkit）、付费为主（gumroad、quixel megascans）、免费 PBR（cgbookcase）。

## 站点清单表

| 站点 | URL | 类型 | License 详情 | 适用场景 | 备注 |
| --- | --- | --- | --- | --- | --- |
| sketchfab | <https://sketchfab.com/> | 3D 模型平台 | 免费 + 付费混合，CC 许可 | 在线预览 3D 模型、CC 许可模型 | 含在线预览、社区驱动 |
| cubebrush | <https://cubebrush.co/> | basemesh 基础模型 | 免费 + 付费混合 | 基础模型、雕刻起点 | 含 ZBrush 笔刷、教程 |
| gumroad | <https://gumroad.com/> | 3D 工具包与插件 | 付费为主 | 3D 工具包、插件、教程 | 创作者直销平台 |
| opengameart | <https://opengameart.org/> | 免费游戏美术资源 | CC 许可（CC0/CC-BY 等） | 游戏美术、开源项目 | 老牌开源游戏美术站 |
| blenderkit | <https://www.blenderkit.com/> | Blender 模型/材质/贴图/HDR | 免费 + 付费混合 | Blender 工作流集成 | Blender 插件直接调用 |
| quixel megascans | <https://quixel.com/megascans> | 写实场景扫描级模型贴图 | Epic 用户免费 | 写实场景、电影级贴图 | Unreal Engine 内置集成 |
| polyhaven | <https://polyhaven.com/> | 免费 HDRI 资源 | CC0（完全免费） | HDRI 环境、免费模型、贴图 | 原 HDRI Haven / 3D Haven |
| cgbookcase | <https://www.cgbookcase.com/> | PBR 贴图资源 | 免费商用 | PBR 贴图、材质库 | 精选 PBR 贴图集 |

> ⚠️ License 免责声明：以上 License 信息为初步评估，实际使用前必须前往各站点官方 License 页面核实。quixel megascans 对 Epic 用户的免费规则需在 Epic 账号确认。

## 同类站点深度对比

### 8 站点付费层级与内容定位

| 维度 | polyhaven | cgbookcase | opengameart | sketchfab | cubebrush | blenderkit | gumroad | quixel megascans |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| License 等级 | 🟢 CC0 | 🟢 免费商用 | 🟢 CC 系列 | 🟠 混合 | 🟠 混合 | 🟠 混合 | 🔴 付费为主 | 🔴 Epic 免费/其他付费 |
| 内容类型 | HDRI/模型/贴图 | PBR 贴图 | 游戏美术 | 模型平台 | basemesh | Blender 全资源 | 工具包/教程 | 扫描级贴图/模型 |
| 风格定位 | 写实+通用 | 写实 PBR | 风格化多样 | 多样 | 写实+雕刻起点 | 多样 | 多样 | 超写实扫描 |
| 商用许可 | 宽松 | 宽松 | CC 许可 | 逐素材不同 | 逐素材不同 | 逐素材不同 | 逐素材不同 | Epic 用户可商用 |
| 内容数量级 | HDRI 数百 / 模型数百 | 贴图数百套 | 数千+ | 数百万 | 数万 | 数十万 | 数万 | 数十万 |
| 更新频率 | 月更 | 月更 | 周 | 日 | 周 | 日 | 日 | 月 |
| 在线预览 | HDRI 360 预览 | 无 | 无 | 有（最强） | 有 | 无（Blender 内） | 无 | UE 内预览 |
| API 可用性 | 有（CC0 公开） | 无 | 无 | 有（付费） | 无 | 有（Blender 插件） | 无 | 有（UE Bridge） |
| 单文件分辨率 | HDRI 16K+ | 4K PBR | 不一 | 不一 | 不一 | 不一 | 不一 | 8K 起 |

### 写实 vs 风格化资源分布

| 风格 | 主流站点 | 特点 |
| --- | --- | --- |
| 超写实扫描级 | quixel megascans | 真实世界扫描，包含树木/岩石/地表/物件 |
| 写实 PBR | cgbookcase、polyhaven | 摄影测量法重建，4-8K 贴图 |
| 写实通用 | sketchfab（部分 CC）、cubebrush | 人工建模，写实贴图 |
| 风格化卡通 | opengameart、gumroad（部分） | 手绘贴图、低多边形 |
| Blender 工作流 | blenderkit | 多风格混合，Blender 内直接调用 |

## 选型决策矩阵

| 使用场景 | 推荐站点（优先级降序） | 推荐理由 |
| --- | --- | --- |
| 找免费 HDRI | polyhaven | CC0 完全免费，质量上限高，最高 16K |
| 找免费 PBR 贴图 | cgbookcase / polyhaven | ccbookcase 商用免费，polyhaven CC0 |
| 找写实扫描级贴图（电影级） | quixel megascans | 扫描级真实，8K+ 分辨率 |
| 找免费 3D 模型（CC 许可） | sketchfab / polyhaven / opengameart | sketchfab 有 CC 许可区，polyhaven CC0 |
| Blender 工作流集成 | blenderkit | Blender 插件直接调用，无需切换软件 |
| Unreal Engine 项目 | quixel megascans / polyhaven | megascans Epic 用户免费，UE 内 Bridge 集成 |
| Unity 项目 | polyhaven / cgbookcase | 跨引擎通用，CC0 / 免费商用 |
| 风格化游戏（卡通/低多边形） | opengameart / sketchfab | 风格化素材多，License 相对宽松 |
| ZBrush 雕刻起点 | cubebrush | basemesh 多，含笔刷与教程 |
| 学习与教程 | gumroad | 含大量教程资源，付费但深入 |
| 商业产品（License 安全优先） | polyhaven / cgbookcase | CC0 / 免费商用，无署名要求 |

## License 与商用注意事项

### License 分级

| 等级 | 含义 | 本类典型站点 |
| --- | --- | --- |
| 🟢 宽松 | 免费商用，无需署名 | polyhaven（CC0）、cgbookcase |
| 🟡 需署名 | 免费商用，但需署名 | opengameart（CC-BY）、sketchfab（CC-BY 部分） |
| 🟠 条件免费 | 部分免费，部分付费 | sketchfab、cubebrush、blenderkit |
| 🔴 付费为主 | 大部分内容付费 | gumroad、quixel megascans（非 Epic 用户） |
| ⚠️ 需逐个检查 | License 不统一，需逐素材核实 | sketchfab（部分 All Rights Reserved）、opengameart（CC 许可变体） |

### 商用陷阱

1. **quixel megascans Epic 用户免费的特殊规则**：megascans 对 Unreal Engine 用户完全免费（含商用），但**对其他引擎（Unity / Godot / Blender）的用户需付费订阅**。订阅期内下载的素材可在订阅结束后继续使用，但不可再下载新素材。
2. **sketchfab 平台 License vs 素材 License**：sketchfab 平台本身有 Store License（付费下载）与 CC 许可区（免费下载）之分。**CC 许可区内的素材每个 License 独立**，可能为 CC0、CC-BY、CC-BY-SA、CC-BY-NC、甚至 All Rights Reserved。**下载前必须查看每个素材的 License 字段**。
3. **CC-BY-NC 排除商用**：CC 许可中带 NC（NonCommercial）的素材完全禁止商用，opengameart 与 sketchfab 上有大量 NC 素材，商用前必须排除。
4. **CC-BY-SA 的"传染性"**：CC-BY-SA 要求衍生作品也必须以相同 License 发布。若项目需闭源商用，**不能使用 CC-BY-SA 素材**。
5. **blenderkit 免费账号限制**：blenderkit 免费账号可下载部分免费素材，但**付费素材需订阅**。免费与付费素材在插件内分开标识，需注意区分。
6. **gumroad 二手转售禁令**：gumroad 上购买的素材不可二次转售，仅可作为创作素材使用。**部分创作者禁止商用**，需查看每个产品页的 License。
7. **HDRI 在反射中的露出**：HDRI 不仅作为光照使用，**在物体反射中可见**。商业项目需确保 HDRI License 允许这种"间接出现"。
8. **PBR 贴图的"贴图套"完整性**：PBR 贴图需 Albedo / Normal / Roughness / Metallic / AO / Height 多通道齐全，**部分站点只提供部分通道**，缺失通道会导致渲染异常。
9. **扫描数据的肖像权**：megascans 的扫描人物模型可能涉及真人肖像权，商用前需确认素材是否已释放肖像权。

## 典型工作流

### 场景 1：写实场景的 PBR 贴图组合（推荐组合）

1. 步骤 1（贴图选择）：访问 cgbookcase.com 或 polyhaven.com，按材质类型（如"砖墙"、"金属"、"木材"）筛选
2. 步骤 2：下载完整 PBR 贴图套（应包含 Albedo、Normal、Roughness、Metallic、AO、Height 六通道）
3. 步骤 3：在 Blender / UE / Unity 中创建材质，连接各通道：

    ```text
    Albedo → Base Color
    Normal → Normal Map
    Roughness → Roughness
    Metallic → Metallic
    AO → Ambient Occlusion
    Height → Displacement / Height Map
    ```

4. 步骤 4：UV 展开 3D 模型，应用材质
5. 步骤 5：调整 UV 比例使贴图密度合适（一般 1m² 对应 1024×1024 像素）
6. 步骤 6：用 polyhaven HDRI 设置环境光照
7. 步骤 7：渲染测试

### 场景 2：Unreal Engine 写实场景（megascans 集成）

1. 步骤 1：确保已安装 Epic Games Launcher 并登录 Epic 账号
2. 步骤 2：在 UE 中安装 Quixel Bridge 插件（UE 5.x 已内置）
3. 步骤 3：在 Quixel Bridge 内浏览 megascans 资源
4. 步骤 4：选中所需素材，点击"Export to Unreal Engine"
5. 步骤 5：在 UE 中将素材拖入场景，自动应用材质
6. 步骤 6：调整 Megascans 资源的 LOD（细节级别）以优化性能
7. 步骤 7：导出最终场景或截图

### 场景 3：Blender 工作流（blenderkit 集成）

1. 步骤 1：在 Blender 中安装 blenderkit 插件（Edit > Preferences > Add-ons > Install）
2. 步骤 2：注册 blenderkit 账号并在插件中登录
3. 步骤 3：在 Blender 侧边栏（按 N 键）打开 blenderkit 面板
4. 步骤 4：搜索所需资源（模型/材质/贴图/HDRI）
5. 步骤 5：免费账号可下载免费素材，付费素材需订阅
6. 步骤 6：点击素材卡片，资源自动下载并加载到当前场景
7. 步骤 7：用 polyhaven HDRI 设置环境光（可在 blenderkit 内一键导入）

### 场景 4：免费 HDRI 工作流（polyhaven 首选）

1. 步骤 1：访问 <https://polyhaven.com/hdris>
2. 步骤 2：按场景类型筛选（室内 / 室外 / 工作室 / 天空）
3. 步骤 3：按时间筛选（黎明 / 白天 / 黄昏 / 夜晚）
4. 步骤 4：下载所需分辨率（4K 平衡，8K/16K 用于高质量渲染）
5. 步骤 5：HDRI 格式为 .hdr 或 .exr，体积大（数十 MB 至数百 MB）
6. 步骤 6：在 Blender 中：World > Surface > Background > Color > Environment Texture > 加载 HDRI 文件
7. 步骤 7：在 UE 中：Window > Env Light Browser > Import HDRI
8. 步骤 8：调整 HDRI 强度与旋转角度

## 相关页面

- [[wiki/design/_index]] — 设计素材领域索引
- [[wiki/design/image-resources]] — 图像素材（部分站点含纹理，如 texturelabs）
- [[wiki/design/sound-resources]] — 声音素材（游戏项目常配套使用）
- [[wiki/design/video-resources]] — 视频素材（影视项目常配套使用）
- [[wiki/resources/public-apis]] — 公益 API 索引

## 参考

- [ADR-009](../../docs/decisions/ADR-009-resources-and-design-domains.md) — 新建 design 领域的决策依据
