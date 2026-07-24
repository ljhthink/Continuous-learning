# ADR-009: 新建 resources 与 design 领域 + TheAlgorithms/素材资源沉淀策略

| 项目 | 内容 |
| --- | --- |
| 状态 | Accepted |
| 日期 | 2026-07-25 |
| 决策者 | 用户 + 主 Agent |
| 关联文档 | ADR-008（知识库内容分层）、AGENTS.md §2/§8.1、ADR-001（技术栈） |
| 风险等级 | P2 跨模块（新增领域、迁移文件、更新 schema） |

## 背景（Context）

用户在 DEF-010 完成后提出三类新需求，要求"获得完整的内容保存在知识库"：

### 需求 1：TheAlgorithms 8 个仓库（完整内容）

- Python、Java、C-Plus-Plus、JavaScript、C、Go、Rust、TypeScript
- 用户原话："这几个仓库我希望获得完整的内容保存在知识库"

### 需求 2：public-apis 仓库（完整内容 + 重新归类）

- `https://github.com/public-apis/public-apis`
- 用户原话："该仓库似乎不属于 coding 范围，且我希望和前面一样，都希望获得完整的内容保存在知识库"

### 需求 3：约 30 个艺术素材网站（一并保存）

涵盖图像、视频、动画、图标、字体、颜色、3D 模型、声音共 8 类资源：

- **图像**：pixabay、texturelabs、pexels、unsplash、spriters-resource
- **视频**：mixkit/free-stock-video、giphy
- **动画**：greensock/GSAP、lottiefiles
- **图标**：flaticon、iconfont、fonts.google.com/icons
- **字体**：fonts.google.com、dafont、fontzone、zimon.cc
- **颜色**：colorhunt、color-hex、uigradients、grabient、picular
- **3D 模型**：sketchfab、cubebrush、gumroad、opengameart、blenderkit、quixel/megascans、polyhaven、cgbookcase
- **声音**：pixabay/sound-effects、mixkit/free-sound-effects、freemusicarchive、freesound、99sounds

### 用户的核心诉求

> "根据我以上的要求，以及原本接下来要执行的计划，进行综合考量，给出下一步执行决策方案，对于你认为我提出的不合理的要求，你可以提出异议，告诉我原因，并重新询问需求。"

本 ADR 即为该决策方案。

## 对原始请求的异议（Objections）

按照用户"对不合理要求可提出异议"的授权，主 Agent 对"完整内容保存"这一字面要求提出以下异议：

### 异议 1：TheAlgorithms 完整代码复制——License 合规风险

| 仓库 | License | 完整复制要求 |
| --- | --- | --- |
| 7 个（Python/Java/C++/JS/Go/Rust/TS） | MIT | 每个文件必须保留版权声明 + 完整 LICENSE 文本 |
| 1 个（C） | **GPLv3** | 衍生作品必须同样 GPLv3，**与知识库的文档性质冲突** |

**问题**：

- GPLv3 的传染性意味着复制 C 仓库代码后，整个 `wiki/coding/` 都需 GPLv3 授权，这会限制未来知识库的许可证选择
- MIT 虽允许，但每个文件需附版权声明行（如 `Copyright (c) TheAlgorithms`），逐文件粘贴工作量巨大且易遗漏
- ADR-008 决策 3 已确立"知识沉淀"而非"代码镜像"的定位

### 异议 2：规模与维护负担——知识库将退化为代码镜像

- 每个 TheAlgorithms 仓库含 500-2000+ 算法文件，8 个仓库合计 **5000-10000+ 文件**
- public-apis 的 README 单文件已达 **221KB**，且持续增长
- 上游仓库每日有 PR 合入，静态副本数周内即过时
- 知识库的本职是"高密度知识沉淀"，不是"GitHub 镜像"
- 若镜像代码，`kb_search` 检索结果将被低密度代码文件淹没，反而降低查询价值

### 异议 3：价值错配——知识库 vs 代码仓库的职能差异

- 知识库的价值在于**跨语言、跨实现的对比与决策性知识**，而非单一语言的单文件实现
- 当 agent 查询"快速排序如何实现"时，期望获得"Python 函数式 vs Java Hoare vs C++ Lomuto 的分区策略对比"（DEF-010 已交付的高密度知识），而非 8 份独立语言的源码副本
- 完整代码副本可通过 GitHub MCP `get_file_contents` **按需实时获取**，无需本地存储

### 异议 4：30 个素材网站的"完整内容"语义不明

- 这些网站本身是**服务/资源门户**，不是单一文档
- "完整内容"对网站而言无法定义：是抓取所有素材？复制首页？还是仅记录入口与用途？
- 抓取素材受各站 ToS 与版权约束（如 Unsplash 照片有专属 license）
- 知识库应记录的是**"哪些场景用哪个站、各自特点与限制"**，而非素材本身

### 异议小结

> 字面意义的"完整内容保存"在 License、规模、维护、价值四方面均有硬性障碍。
> 本 ADR 提出替代方案，使知识库在合规前提下达成用户真实诉求："**当需要算法实现或素材资源时，能从知识库快速定位并获得决策性指引**"。

## 决策（Decision）

### 决策 1：TheAlgorithms 采用"入口页 + 目录索引 + 概念页"三层结构

延续 ADR-008 决策 3，对 8 个 TheAlgorithms 仓库不复制代码，而是：

| 层 | 现状 | 后续动作 |
| --- | --- | --- |
| L1 入口页（`thealgorithms-*.md`） | ✅ 已存在 9 张（含 public-apis） | 保留，作为"仓库导航 + License + 使用建议" |
| L2 目录索引（在入口页内追加） | ❌ 缺失 | Phase 2：从各仓库 `DIRECTORY.md` 提取算法分类清单，追加到入口页 |
| L3 概念页（`<algorithm>-impl-patterns.md`） | ✅ 已有 2 张（quick-sort、binary-search） | Phase 4：长期任务，按需深化（merge-sort、graph、DP 等） |
| 按需取码 | — | 通过 GitHub MCP `get_file_contents` 实时获取，不在本地存储完整代码 |

**理由**：

- License 合规：仅引用片段并标注 MIT/GPLv3 来源，符合合理使用
- 规模可控：入口页 9 张 + 概念页按需增长（每年 5-10 张），总量稳定在 50 张以内
- 价值密度高：概念页提供跨语言对比，是 GitHub 仓库本身无法提供的增量价值
- 实时性：通过 MCP 取码保证永远是最新版本，无副本同步负担

### 决策 2：新建 `resources/` 领域，迁移 public-apis

| 项 | 内容 |
| --- | --- |
| 目录 | `wiki/resources/` |
| 定义 | 外部资源索引（API 字典、开源数据集、公益资源仓库等） |
| 与 `coding/` 区分 | `coding/` 放编程知识与代码库 entity；`resources/` 放非编程向的外部资源索引 |
| 首批迁移 | `wiki/coding/public-apis.md` → `wiki/resources/public-apis.md` |
| frontmatter 变更 | `domain: [coding]` → `domain: [resources]` |
| index.md 变更 | 新增 `## resources` 段，从 `## coding` 段移除 public-apis 条目 |
| AGENTS.md 变更 | §8.1 领域目录表追加 `resources` 行；§2 目录结构追加 `resources/` |

**public-apis 页面策略**：保持现有"分类摘要 + 使用建议 + 筛选技巧"结构，不复制 221KB README 全文。用户需要具体 API 时通过页面链接直跳上游 README。

**理由**：

- public-apis 是资源索引而非编程知识，归类正确性优先于"完整保存"
- 221KB 单文件超出 wiki 页合理上限，且上游每日增长，静态复制必然过时

### 决策 3：新建 `design/` 领域，按类型分组 30 个素材网站

| 项 | 内容 |
| --- | --- |
| 目录 | `wiki/design/` |
| 定义 | 设计素材资源：图像、视频、动画、图标、字体、颜色、3D 模型、声音 |
| 与 `coding/` 区分 | `coding/` 放代码与开发资源；`design/` 放视觉/听觉设计素材 |
| 页面组织 | 按资源类型分 8 张分类页（详见下表） |

**8 张分类页规划**：

| 文件 | 涵盖站点 | 重点维度 |
| --- | --- | --- |
| `image-resources.md` | pixabay、texturelabs、pexels、unsplash、spriters-resource | 商用 license / 风格定位（摄影 vs 纹理 vs 像素） |
| `video-resources.md` | mixkit/free-stock-video、giphy | 转场 vs 背景视频 / GIF 与贴纸 |
| `animation-resources.md` | GSAP、lottiefiles | 工具库 vs 在线平台 / Web 动画 vs UI 动画 |
| `icon-resources.md` | flaticon、iconfont、fonts.google.com/icons | 商用限制 / 中外图标差异 |
| `font-resources.md` | fonts.google.com、dafont、fontzone、zimon.cc | 中英文字体差异 / 商用 license |
| `color-resources.md` | colorhunt、color-hex、uigradients、grabient、picular | 配色方案 vs 颜色字典 vs 渐变生成器 |
| `3d-model-resources.md` | sketchfab、cubebrush、gumroad、opengameart、blenderkit、quixel/megascans、polyhaven、cgbookcase | 免费 vs 付费 / 写实 vs 风格化 / PBR 贴图 / HDRI |
| `sound-resources.md` | pixabay/sound-effects、mixkit/free-sound-effects、freemusicarchive、freesound、99sounds | VFX vs 背景音乐 vs 环境音 / 商用 license |

**每页统一结构**：

1. 简介（本类资源的共性诉求）
2. 站点清单表（站点 / 类型 / 商用许可 / 适用场景 / 备注）
3. 选型决策矩阵（按场景推荐）
4. License 与商用注意事项
5. 相关页面（交叉引用其他分类页或 coding/ 资源）

**关于 GSAP 的特殊处理**：GSAP 本质是 JS 动画库，技术上属于 coding 资源。但用户将其与设计素材并列，且其主要用途是设计向动画。决策：放入 `wiki/design/animation-resources.md`，在页面中标注"GSAP 是 JS 库，需编码使用，技术文档见 [官方文档]"，并可在 `wiki/coding/` 后续按需建 `gsap.md` entity 页时双向交叉引用。

**理由**：

- 按类型分组避免"一页一个网站"的碎片化（30 张低密度页 vs 8 张高密度页）
- 每页包含"选型决策矩阵"，提供超越书签的增量价值
- 商用 license 标注对设计素材尤为关键，避免误用侵权

### 决策 4：分阶段执行（Phase 1-4）

| Phase | 任务 | 风险等级 | 依赖 | 产出 |
| --- | --- | --- | --- | --- |
| **Phase 1** | 新建 `wiki/resources/` + `wiki/design/` 目录；迁移 public-apis 至 resources/；更新 AGENTS.md §2/§8.1、index.md | P2 跨模块 | 本 ADR 确认 | 1 张迁移页 + 目录骨架 + schema 更新 |
| **Phase 2** | 8 个 TheAlgorithms 入口页追加目录索引（从各仓库 `DIRECTORY.md` 提取算法分类清单） | P1 常规 | Phase 1 完成 | 8 张入口页深化 |
| **Phase 3** | 创建 design 领域 8 张分类页 | P1 常规 | Phase 1 完成 | 8 张设计素材分类页 |
| **Phase 4** | 继续 DEF-010 算法概念页深化（merge-sort、graph、DP 等） | P2 长期 | Phase 2 完成 | 按需增长 |

**每个 Phase 独立 PR**，便于审查与回退。

### 决策 5：不引入自动化同步机制

明确**不**为 TheAlgorithms 或 public-apis 建立自动同步管道（如 GitHub Actions 定期 pull 上游）。

**理由**：

- 知识库的价值是"沉淀决策性知识"，不是"实时镜像"
- 自动同步会引入 CI 复杂度、License 合规检查、内容审查等额外负担
- 上游内容变化时，主 Agent 在下次 Query 时通过 GitHub MCP 感知并按需更新对应概念页即可

## 备选方案（Alternatives）

### TheAlgorithms 策略对比

| 方案 | License | 规模 | 维护 | 价值 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 完整代码复制（用户原意） | ❌ GPLv3 冲突 + MIT 标注负担 | ❌ 5000+ 文件 | ❌ 副本过时 | ❌ 退化为镜像 | 否决 |
| Top 50 算法子集复制 | ⚠️ 仍有 License 标注负担 | ⚠️ 50 文件可控 | ❌ 仍过时 | ⚠️ 选型主观 | 否决 |
| 仅外部链接（无 wiki 内容） | ✅ 无 License 风险 | ✅ 零文件 | ✅ 无维护 | ❌ 仅书签无价值 | 否决 |
| **入口页 + 目录索引 + 概念页**（选定） | ✅ 片段合理使用 | ✅ 9 + N 张 | ✅ 按需更新 | ✅ 跨语言对比增量 | 选定 |

### public-apis 归类对比

| 方案 | 理由 | 结论 |
| --- | --- | --- |
| 留 coding/ | 不动结构 | ❌ 归类错误，public-apis 非编程知识 |
| 新建 resources/（选定） | 归类正确，为未来外部资源预留空间 | 选定 |
| 放 design/ | design 是素材，API 也是素材 | ❌ API 是开发资源非设计素材 |

### 素材网站组织对比

| 方案 | 页数 | 价值密度 | 结论 |
| --- | --- | --- | --- |
| 一站一页 | 30+ | ❌ 低，碎片化 | 否决 |
| 单页全收录 | 1 | ❌ 过长，难导航 | 否决 |
| 按类型分组（选定，8 页） | 8 | ✅ 高，含选型矩阵 | 选定 |

## 后果（Consequences）

### 正面后果

- **License 合规**：不复制完整代码，规避 GPLv3 传染与 MIT 标注负担
- **领域边界清晰**：`coding/`（编程知识）、`resources/`（外部资源索引）、`design/`（设计素材）三层分明
- **价值密度提升**：concept 页提供跨语言对比，design 页提供选型决策矩阵，均超越原始资源
- **可维护性**：知识库总量稳定可控，无副本同步负担
- **可扩展性**：未来新外部资源可按类型归入 resources/ 或 design/

### 负面后果 / 代价

- **非字面"完整保存"**：用户需通过 wiki 页跳转 GitHub 获取完整代码，多一跳
- **概念页创作成本**：每个算法 concept 页需 1-4 小时（读仓库代码 + 跨语言对比）
- **design 页 License 核实工作**：30 个站点的商用许可需逐站核实，可能耗时
- **短期结构变动**：Phase 1 涉及目录创建、文件迁移、schema 更新，需同步更新多处交叉引用

### 需要同步更新的文档或代码

| 文件 | 变更 |
| --- | --- |
| `AGENTS.md` | §2 目录结构追加 `resources/`、`design/`；§8.1 领域目录表追加两行 |
| `index.md` | 新增 `## resources` 与 `## design` 段；从 `## coding` 段移除 public-apis 条目；更新总页数 |
| `wiki/coding/public-apis.md` | 迁移至 `wiki/resources/public-apis.md`；frontmatter `domain` 改为 `[resources]` |
| `wiki/coding/thealgorithms-*.md`（8 张） | Phase 2：追加"算法目录索引"段（从 DIRECTORY.md 提取） |
| `wiki/design/*.md`（8 张） | Phase 3：新建 |
| `docs/decisions/README.md` | 追加本 ADR 条目 |
| `README.md` | 文档索引追加本 ADR 引用 |

## 后续任务清单

按 Phase 与优先级排序：

| 编号 | 任务 | 归属 | Phase | 风险等级 | 依赖 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| DEF-011 | 新建 `wiki/resources/` + 迁移 public-apis + 更新 AGENTS.md/index.md | 本 ADR 决策 2 | Phase 1 | P2 跨模块 | 本 ADR 确认 | ✅ 已完成（Phase 1） |
| DEF-012 | 新建 `wiki/design/` 目录骨架 + schema 更新 | 本 ADR 决策 3 | Phase 1 | P2 跨模块 | DEF-011 | ✅ 已完成（Phase 1） |
| DEF-013 | 8 个 TheAlgorithms 入口页追加目录索引 | 本 ADR 决策 1 | Phase 2 | P1 常规 | DEF-011 | 待开始 |
| DEF-014 | 8 张 design 分类页内容创作 | 本 ADR 决策 3 | Phase 3 | P1 常规 | DEF-012 | 待开始 |
| DEF-010 续 | 算法概念页深化（merge-sort、graph、DP 等） | ADR-008 决策 3 | Phase 4 | P2 长期 | DEF-013 | 进行中（已交付 quick-sort、binary-search） |

### 执行顺序建议

1. **本 ADR 用户确认** → 状态变更为 Accepted
2. **Phase 1**（DEF-011 + DEF-012）：单 PR，建立 resources/ 与 design/ 骨架 + 迁移 public-apis
   - 含完整闭环：code-archaeologist（简化，因主要 markdown）→ guardrail-enforcer → ac-verifier
3. **Phase 2**（DEF-013）与 **Phase 3**（DEF-014）可并行，独立 PR
4. **Phase 4**（DEF-010 续）：长期任务，按用户优先级按需推进

## 风险分级与子 Agent 闭环（按 CLAUDE.md §16）

本 ADR 整体风险等级：**P2 跨模块**

理由：

- 新增 2 个领域目录（影响知识库全局结构）
- 迁移既有文件（public-apis 跨域移动，需更新交叉引用）
- 更新 schema 文件（AGENTS.md §2/§8.1）
- 影响多个 wiki 页交叉引用

各 Phase 闭环要求：

| Phase | 子 Agent | 必需文档 |
| --- | --- | --- |
| Phase 1（DEF-011 + DEF-012） | code-archaeologist（简化）→ guardrail-enforcer → ac-verifier | guardrail 报告、acceptance 报告、本 ADR |
| Phase 2（DEF-013） | guardrail-enforcer → ac-verifier | guardrail 报告、acceptance 报告 |
| Phase 3（DEF-014） | guardrail-enforcer → ac-verifier | guardrail 报告、acceptance 报告 |
| Phase 4（DEF-010 续） | guardrail-enforcer → ac-verifier | guardrail 报告、acceptance 报告 |

## 待用户确认事项

> ✅ **已确认**（2026-07-25）：用户同意以下全部 6 项决策，本 ADR 状态已变更为 Accepted，Phase 1 已执行完成。

请在以下选项中明示您的决策，确认后本 ADR 状态将变更为 Accepted 并进入 Phase 1 执行：

1. **TheAlgorithms 策略**：是否接受"入口页 + 目录索引 + 概念页"三层结构，放弃完整代码复制？
2. **public-apis 归类**：是否同意新建 `resources/` 领域并迁移？
3. **素材网站组织**：是否同意新建 `design/` 领域并按 8 类分组？
4. **GSAP 归属**：是否同意将 GSAP 放入 `design/animation-resources.md`（而非 `coding/gsap.md`）？
5. **不引入自动同步**：是否同意不建立上游自动同步管道？
6. **执行顺序**：是否同意 Phase 1 → Phase 2/3 并行 → Phase 4 的顺序？

如有任何异议或调整意见，请在确认前提出，主 Agent 将修订本 ADR 后再次提交。

## 参考

- ADR-008（知识库内容分层与格式统一）— 本 ADR 决策 1 延续 ADR-008 决策 3
- AGENTS.md §2（目录结构）、§8.1（领域目录）、§8.3（新建领域）
- CLAUDE.md §16（变更风险分级）、§17（ADR 触发条件）
- DEF-010 已交付：`wiki/coding/quick-sort-impl-patterns.md`、`wiki/coding/binary-search-impl-patterns.md`
