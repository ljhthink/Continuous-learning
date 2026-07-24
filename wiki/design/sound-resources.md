---
title: "声音素材资源"
domain: [design]
type: concept
status: active
date: 2026-07-25
tags: [design, sound, audio, sfx, music, ambience, resources, assets]
related: [[wiki/design/_index]]
---

## 简介

声音素材涵盖 **VFX 音效、UI 音效、背景音乐、环境音、声音包**五大子类，是游戏、视频、影视、交互项目的关键组成部分。本类资源核心诉求：

1. **License 类型多样**：CC0 / CC-BY / CC-BY-NC / 商用 license 等，需严格甄别
2. **VFX vs 背景音乐 vs 环境音分工明确**：不同场景需求不同类型
3. **NC 许可必须排除**：商用场景严禁使用 CC-BY-NC 素材
4. **音质与格式标准化**：WAV（无损）/ MP3（压缩）/ FLAC（无损压缩）/ OGG（Web 友好）

涵盖 5 个站点，按内容定位可分为：VFX 通用音效（pixabay sound-effects、mixkit sound-effects）、背景音乐（freemusicarchive）、环境音（freesound）、声音包（99sounds）。

## 站点清单表

| 站点 | URL | 类型 | License 详情 | 适用场景 | 备注 |
| --- | --- | --- | --- | --- | --- |
| pixabay sound-effects | <https://pixabay.com/zh/sound-effects/> | VFX 音效 | Pixabay License（免费商用） | 通用音效 | 与图片同站、中文界面 |
| mixkit sound-effects | <https://mixkit.co/free-sound-effects/> | 免费音效 | Mixkit License（免费商用） | UI 音效、转场音效 | 含免费音乐与视频 |
| freemusicarchive | <https://freemusicarchive.org/> | 免费背景音乐 | CC 许可（各曲目独立） | 背景音乐、配乐 | 老牌音乐 CC 库 |
| freesound | <https://freesound.org/> | 环境音/按钮音/氛围音 | CC 许可（各声音独立） | 环境音、UI 音效 | 社区驱动、内容最丰富 |
| 99sounds | <https://99sounds.org/sounds/> | 分类好的声音包 | 免费商用 | 声音包、合成器预设 | 精选、按主题分类 |

> ⚠️ License 免责声明：以上 License 信息为初步评估，实际使用前必须前往各站点官方 License 页面核实。**CC 许可（freesound、freemusicarchive）逐素材 License 不同**，必须单个核实。

## 同类站点深度对比

### 5 站点内容定位对比

| 维度 | pixabay sound-effects | mixkit sound-effects | freemusicarchive | freesound | 99sounds |
| --- | --- | --- | --- | --- | --- |
| 内容定位 | VFX 通用音效 | UI/转场音效 | 背景音乐 | 环境音/UI/氛围 | 声音包/预设 |
| 内容时长 | 短（数秒） | 短（数秒） | 长（分钟级） | 不一 | 中（数十秒） |
| 内容数量级 | 数万 | 数千 | 数万 | 数十万 | 数百包 |
| License 统一性 | 高（Pixabay License） | 高（Mixkit License） | 低（逐曲目 CC） | 低（逐声音 CC） | 中（按包统一） |
| 商用许可 | 宽松 | 宽松 | 需逐个确认 | 需逐个确认 | 宽松 |
| 音乐类型 | 短音效 | 短音效 | 完整曲目 | 不一 | 短样本 |
| 署名要求 | 否 | 否 | 部分（CC-BY） | 部分（CC-BY） | 否 |
| 文件格式 | MP3 / WAV | MP3 / WAV | MP3 / FLAC | WAV / MP3 / FLAC | WAV / AIFF |
| API 可用性 | 有（需 Key） | 无 | 有 | 有（OAuth） | 无 |
| 中文支持 | 完整 | 仅搜索 | 仅搜索 | 仅搜索 | 仅搜索 |

### VFX 音效 vs 背景音乐 vs 环境音 vs 声音包

| 维度 | VFX 音效 | 背景音乐 | 环境音 | 声音包 |
| --- | --- | --- | --- | --- |
| 用途 | 交互反馈（按钮、转场） | 配乐、氛围营造 | 写实环境（雨声、街道） | 创作素材（合成器预设） |
| 时长 | 1-5 秒 | 1-5 分钟 | 30 秒-2 分钟（可循环） | 不一 |
| 推荐站点 | pixabay、mixkit | freemusicarchive | freesound | 99sounds |
| 商用 License 难度 | 低（统一） | 中（CC 多变体） | 中（CC 多变体） | 低（统一） |
| 音乐类型 | 短促音效 | 完整旋律 | 自然音、街声 | 采样、预设 |

## 选型决策矩阵

| 使用场景 | 推荐站点（优先级降序） | 推荐理由 |
| --- | --- | --- |
| 通用 UI 音效（按钮、点击） | pixabay sound-effects / mixkit sound-effects | License 宽松、内容多样 |
| 商业视频 VFX 音效 | pixabay sound-effects / 99sounds | Pixabay License 完全免费商用 |
| 商业视频背景音乐 | pixabay sound-effects / 99sounds | Pixabay License 宽松，99sounds 商用免费 |
| 完整配乐（电影/纪录片） | freemusicarchive | 曲目完整、CC 许可明确 |
| 自然环境音（雨声、街道） | freesound | 内容最丰富、社区上传 |
| 合成器预设与采样 | 99sounds | 精选声音包、按主题分类 |
| 游戏交互音效 | pixabay sound-effects / freesound | 短音效多，freesound License 需逐个查 |
| 商用项目（License 安全优先） | pixabay sound-effects / 99sounds | License 统一、商用宽松 |
| 开源项目（接受 CC-BY） | freemusicarchive / freesound | CC 许可丰富，与开源哲学契合 |
| API 批量获取 | freesound / pixabay sound-effects | freesound API 完善，pixabay API 可用 |

## License 与商用注意事项

### License 分级

| 等级 | 含义 | 本类典型站点 |
| --- | --- | --- |
| 🟢 宽松 | 免费商用，无需署名 | pixabay sound-effects、mixkit sound-effects、99sounds |
| 🟡 需署名 | 免费商用，但需署名 | freemusicarchive（CC-BY 部分）、freesound（CC-BY 部分） |
| 🟠 条件免费 | 部分免费，部分付费 | 不在本清单典型站点 |
| ⚠️ 需逐个检查 | License 不统一，需逐素材核实 | freemusicarchive、freesound |

### 商用陷阱

1. **CC-BY-NC 必须排除**：CC 许可中带 NC（NonCommercial）的素材完全禁止商用。freemusicarchive 与 freesound 上有大量 NC 素材，**商用前必须过滤掉 NC**。
2. **CC-BY-SA 的"传染性"**：CC-BY-SA 要求衍生作品（含剪辑、混音）也必须以相同 License 发布。若商业项目需闭源，**不能使用 CC-BY-SA 素材**。
3. **CC0 的真实含义**：CC0 表示完全放弃版权，**可商用、可修改、可不署名**。freesound 与 opengameart 上有部分 CC0 素材，是商用最安全的选择。
4. **freemusicarchive 曲目 License 独立**：freemusicarchive 上每个曲目的 License 由艺术家独立决定，**同一艺术家不同曲目 License 也可能不同**。
5. **freesound 上传者授权差异**：freesound 上每个声音由上传者选择 CC 许可类型（CC0 / CC-BY / CC-BY-SA / CC-BY-NC / CC-BY-ND / Sampling+），**下载前必须查看每个声音的 License 字段**。
6. **mixkit License 限制**：mixkit License 虽宽松，但**禁止将素材原样打包转售**，仅可作为创作素材使用。
7. **背景音乐的表演权**：背景音乐在公开场合播放可能涉及表演权（PRC 著作权法），**仅下载 License 不等同于表演权**，餐厅、商场等场所播放需额外购买机械权。
8. **音效的"明显采样"**：freesound 上的某些声音素材可能采样自商业电影或音乐，**上传者声称有版权但实际侵权**，商用前需做基础判断（如音效是否含明显商业电影台词）。
9. **99sounds 的署名建议**：虽然 99sounds License 通常免署名，但**强烈建议在 credits 中标注来源**，支持创作者生态。

## 典型工作流

### 场景 1：商业视频配 VFX 音效（License 安全）

1. 步骤 1：访问 <https://pixabay.com/zh/sound-effects/>，按关键词搜索（如"click"、"whoosh"）
2. 步骤 2：下载所需音效（MP3 格式即可，WAV 用于高质量场景）
3. 步骤 3：在视频编辑软件（如 Premiere、DaVinci）中导入音效
4. 步骤 4：将音效拖到时间轴对应位置
5. 步骤 5：调整音量、淡入淡出
6. 步骤 6：若需更丰富音效，访问 99sounds.org 下载主题声音包

### 场景 2：开源纪录片配背景音乐

1. 步骤 1：访问 <https://freemusicarchive.org/>，按流派搜索（如"Ambient"、"Classical"）
2. 步骤 2：**必须**查看每个曲目的 License 字段，过滤掉：
   - CC-BY-NC（禁止商用）
   - CC-BY-ND（禁止衍生，不可剪辑）
3. 步骤 3：选择 CC0 或 CC-BY 曲目（CC-BY 需在 credits 中署名）
4. 步骤 4：下载 MP3 或 FLAC 格式
5. 步骤 5：在视频编辑软件中导入，作为背景音轨
6. 步骤 6：在视频结尾或视频描述中列出每个曲目的：
   - 曲名
   - 艺术家
   - 来源 URL
   - License 类型（如"CC-BY 4.0"）

### 场景 3：游戏开发集成环境音

1. 步骤 1：访问 <https://freesound.org/>，注册账号
2. 步骤 2：搜索环境音（如"rain"、"forest"、"street"）
3. 步骤 3：**必须**查看每个声音的 License，排除 CC-BY-NC 与 CC-BY-SA（若游戏需闭源）
4. 步骤 4：选择 CC0 或 CC-BY 声音
5. 步骤 5：下载 WAV 格式（游戏引擎首选 WAV）
6. 步骤 6：在游戏引擎（Unity / UE）中导入音频文件
7. 步骤 7：创建 Audio Source，设置为 3D 空间音与循环
8. 步骤 8：在游戏 credits 中列出每个声音的来源与 License

### 场景 4：用 99sounds 获取主题声音包

1. 步骤 1：访问 <https://99sounds.org/sounds/>
2. 步骤 2：按主题浏览（如"Synthwave"、"Cinematic"、"Industrial"）
3. 步骤 3：下载完整声音包（ZIP 文件，通常含数十个 WAV 文件）
4. 步骤 4：解压后在 DAW（如 Ableton Live、FL Studio）中加载
5. 步骤 5：作为合成器预设或采样库使用
6. 步骤 6：在最终作品中标注 "Sounds from 99sounds.org"

## 相关页面

- [[wiki/design/_index]] — 设计素材领域索引
- [[wiki/design/video-resources]] — 视频素材（声音与视频常配套使用）
- [[wiki/design/animation-resources]] — 动画素材（音效常与动画同步）
- [[wiki/design/3d-model-resources]] — 3D 模型素材（游戏项目常配套使用）
- [[wiki/resources/public-apis]] — 公益 API 索引（含声音 API）

## 参考

- [ADR-009](../../docs/decisions/ADR-009-resources-and-design-domains.md) — 新建 design 领域的决策依据
