# 知识库时间日志

> append-only 日志，记录 ingest/query/lint/experience 事件。
> 内容索引见 [index.md](index.md)。结构约定见 [AGENTS.md](AGENTS.md)。
>
> 解析约定：每条以 `## [YYYY-MM-DD] <type> | <title>` 起始，
> 可用 `grep "^## \[" log.md | tail -5` 获取最近 5 条。

## [2026-07-22] init | 知识库初始化

- action: 创建知识库目录骨架与双索引
- domains: coding, emotions, reading
- wiki_pages: 0

## [2026-07-24] experience | js-yaml 5 MAJOR 升级：load() 空字符串行为变化与 try/catch 降级

- inbox: wiki/coding/experiences/inbox/js-yaml-5-major-升级load-空字符串行为变化与-trycatch-降级.md
- confidence: 0.9
- source_task: TKN-DEPS-UPGRADE-001

## [2026-07-24] experience | lychee 链接检查 CI：绝对路径、node_modules 引用与裸 URL 的处理

- inbox: wiki/coding/experiences/inbox/lychee-链接检查-ci绝对路径node-modules-引用与裸-url-的处理.md
- confidence: 0.85
- source_task: TKN-CI-LYCHEE-FIX

## [2026-07-24] experience | MCP server 新增工具后客户端描述符缓存过期：需重连刷新才能发现

- inbox: wiki/coding/experiences/inbox/mcp-server-新增工具后客户端描述符缓存过期需重连刷新才能发现.md
- confidence: 0.8
- source_task: TKN-MILESTONE-AUDIT-001

## [2026-07-24] promote | js-yaml 5 MAJOR 升级：load() 空字符串行为变化与 try/catch 降级

- promoted: wiki/coding/experiences/js-yaml-5-major-升级load-空字符串行为变化与-trycatch-降级.md
- from_inbox: wiki/coding/experiences/inbox/js-yaml-5-major-升级load-空字符串行为变化与-trycatch-降级.md
- tier: auto
- confidence: 0.9

## [2026-07-24] promote | lychee 链接检查 CI：绝对路径、node_modules 引用与裸 URL 的处理

- promoted: wiki/coding/experiences/lychee-链接检查-ci绝对路径node-modules-引用与裸-url-的处理.md
- from_inbox: wiki/coding/experiences/inbox/lychee-链接检查-ci绝对路径node-modules-引用与裸-url-的处理.md
- tier: auto
- confidence: 0.85

## [2026-07-24] promote | MCP server 新增工具后客户端描述符缓存过期：需重连刷新才能发现

- promoted: wiki/coding/experiences/mcp-server-新增工具后客户端描述符缓存过期需重连刷新才能发现.md
- from_inbox: wiki/coding/experiences/inbox/mcp-server-新增工具后客户端描述符缓存过期需重连刷新才能发现.md
- tier: auto
- confidence: 0.8

## [2026-07-24] ingest | Route A 首批 9 张 concept 页（KB 核心模型 + 元规则 + 工作流核心）

- source: agent-authored（基于 AGENTS.md schema 文档）
- domain: coding
- pages_affected: 9
- pages:
  - wiki/coding/three-layer-architecture.md
  - wiki/coding/dual-index-mechanism.md
  - wiki/coding/page-types-and-state-machine.md
  - wiki/coding/frontmatter-schema.md
  - wiki/coding/multi-domain-classification.md
  - wiki/coding/continuous-evolution-review-gate.md
  - wiki/coding/ingest-workflow.md
  - wiki/coding/query-workflow.md
  - wiki/coding/lint-workflow.md
- batch: Route A
- groups:
  - KB 核心模型(3): three-layer-architecture, dual-index-mechanism, page-types-and-state-machine
  - 元规则(3): frontmatter-schema, multi-domain-classification, continuous-evolution-review-gate
  - 工作流核心(3): ingest-workflow, query-workflow, lint-workflow

## [2026-07-24] experience | 子 Agent 生成报告的 file:/// 绝对路径陷阱与 CI 兼容性审查

- inbox: wiki/coding/experiences/inbox/子-agent-生成报告的-file-绝对路径陷阱与-ci-兼容性审查.md
- confidence: 0.8
- source_task: TKN-P0-ROUTE-A-001

## [2026-07-24] promote | 子 Agent 生成报告的 file:/// 绝对路径陷阱与 CI 兼容性审查

- promoted: wiki/coding/experiences/子-agent-生成报告的-file-绝对路径陷阱与-ci-兼容性审查.md
- from_inbox: wiki/coding/experiences/inbox/子-agent-生成报告的-file-绝对路径陷阱与-ci-兼容性审查.md
- tier: auto
- confidence: 0.8

## [2026-07-24] ingest | Route B 9 张外部技术 entity 页（TheAlgorithms × 8 + public-apis）

- source: GitHub MCP（get_file_contents README.md）
- sources:
  - https://github.com/TheAlgorithms/Python
  - https://github.com/TheAlgorithms/Java
  - https://github.com/TheAlgorithms/C-Plus-Plus
  - https://github.com/TheAlgorithms/JavaScript
  - https://github.com/TheAlgorithms/C
  - https://github.com/TheAlgorithms/Go
  - https://github.com/TheAlgorithms/Rust
  - https://github.com/TheAlgorithms/TypeScript
  - https://github.com/public-apis/public-apis
- domain: coding
- pages_affected: 9
- pages:
  - wiki/coding/thealgorithms-python.md
  - wiki/coding/thealgorithms-java.md
  - wiki/coding/thealgorithms-c-plus-plus.md
  - wiki/coding/thealgorithms-javascript.md
  - wiki/coding/thealgorithms-c.md
  - wiki/coding/thealgorithms-go.md
  - wiki/coding/thealgorithms-rust.md
  - wiki/coding/thealgorithms-typescript.md
  - wiki/coding/public-apis.md
- batch: Route B
- groups:
  - TheAlgorithms 系列(8): Python, Java, C-Plus-Plus, JavaScript, C, Go, Rust, TypeScript
  - 公益 API 索引(1): public-apis
- notes:
  - 通过 GitHub MCP get_file_contents 调研 9 个仓库 README
  - C 版 License 为 GPLv3（与其他 MIT 兄弟仓库不同），已在页面显式标注
  - public-apis README 达 221KB，仅在 wiki 页做分类摘要

## [2026-07-24] ingest | DEF-009：9 张 KB 系统文档从 coding/ 迁移至 kb-system/ 领域

- source: ADR-008 决策 2（新建 kb-system 元知识领域）
- domain: kb-system
- pages_affected: 9
- pages:
  - wiki/kb-system/three-layer-architecture.md（from wiki/coding/）
  - wiki/kb-system/dual-index-mechanism.md（from wiki/coding/）
  - wiki/kb-system/page-types-and-state-machine.md（from wiki/coding/）
  - wiki/kb-system/frontmatter-schema.md（from wiki/coding/）
  - wiki/kb-system/multi-domain-classification.md（from wiki/coding/）
  - wiki/kb-system/continuous-evolution-review-gate.md（from wiki/coding/）
  - wiki/kb-system/ingest-workflow.md（from wiki/coding/）
  - wiki/kb-system/query-workflow.md（from wiki/coding/）
  - wiki/kb-system/lint-workflow.md（from wiki/coding/）
- batch: DEF-009
- changes:
  - frontmatter domain 字段从 [coding] 改为 [kb-system]
  - 9 张页面内部交叉引用从 wiki/coding/ 改为 wiki/kb-system/
  - wiki/coding/public-apis.md 的 related 和相关页面段同步更新
  - index.md 新增 kb-system 段，从 coding 段移除 9 页条目
  - AGENTS.md §2 目录结构和 §8.1 领域目录新增 kb-system
  - 修复 6 张文件的 UTF-8 BOM 问题（破坏 frontmatter 解析）
  - 修复 docs/reports/2026-07-24-route-a-concept-pages-guardrail.md 中 2 处断链

## [2026-07-24] ingest | DEF-010：算法深化第一批（quick-sort + binary-search 跨语言实现模式）

- source: GitHub MCP（get_file_contents 读取 TheAlgorithms 真实代码）
- sources:
  - https://github.com/TheAlgorithms/Python/blob/master/sorts/quick_sort.py
  - https://github.com/TheAlgorithms/Java/blob/master/src/main/java/com/thealgorithms/sorts/QuickSort.java
  - https://github.com/TheAlgorithms/C-Plus-Plus/blob/master/sorting/quick_sort.cpp
  - https://github.com/TheAlgorithms/C-Plus-Plus/blob/master/sorting/quick_sort_3.cpp
  - https://github.com/TheAlgorithms/Python/blob/master/searches/binary_search.py
  - https://github.com/TheAlgorithms/Java/blob/master/src/main/java/com/thealgorithms/searches/BinarySearch.java
- domain: coding
- pages_affected: 5
- pages:
  - wiki/coding/quick-sort-impl-patterns.md（新建，4 种分区策略对比）
  - wiki/coding/binary-search-impl-patterns.md（新建，5 种实现对比）
  - wiki/coding/thealgorithms-python.md（更新交叉引用）
  - wiki/coding/thealgorithms-java.md（更新交叉引用）
  - wiki/coding/thealgorithms-c-plus-plus.md（更新交叉引用）
- batch: DEF-010
- groups:
  - 快速排序(4): Python 函数式 / Java Hoare / C++ Lomuto / C++ 3-way Dutch National Flag
  - 二分搜索(5): Python 迭代 / Python 递归 / Python bisect_left / Python bisect_right / Java 递归泛型
- notes:
  - 通过 GitHub MCP get_file_contents 读取 6 个源代码文件
  - 所有代码均标注 MIT License 归属
  - 每页包含分区策略对比表、复杂度分析、工业实现对比、常见陷阱、选择指南
  - ADR-008 决策 3 的第一批交付，后续可继续深化其他算法

## [2026-07-25] ingest | DEF-011 + DEF-012：新建 resources 与 design 领域 + 迁移 public-apis

- source: ADR-009（新建 resources 与 design 领域 + TheAlgorithms/素材资源沉淀策略）
- domain: resources, design
- pages_affected: 3
- pages:
  - wiki/resources/public-apis.md（from wiki/coding/public-apis.md，frontmatter domain [coding] → [resources]）
  - wiki/design/_index.md（新建，领域索引页）
  - wiki/coding/public-apis.md（已删除，迁移至 resources/）
- batch: DEF-011 + DEF-012
- changes:
  - ADR-009 状态 Proposed → Accepted
  - AGENTS.md §2 目录结构追加 resources/ 与 design/
  - AGENTS.md §8.1 领域目录表追加 resources 与 design 两行
  - index.md 新增 ## resources 与 ## design 段，从 ## coding 段移除 public-apis 条目，总页数 24 → 25
  - docs/decisions/README.md 追加 ADR-009 条目
  - README.md 文档索引追加 ADR-009 引用
- notes:
  - 用户确认 ADR-009 全部 6 项决策后开始执行
  - public-apis 从 coding/ 迁移至 resources/，frontmatter domain 改为 [resources]，date 更新为 2026-07-25
  - design/ 领域建立 _index.md 索引页，8 张分类页待 Phase 3 创作
  - 后续 Phase 2：8 个 TheAlgorithms 入口页追加目录索引
- 后续 Phase 3：design/ 8 张分类页内容创作

## [2026-07-25] ingest | DEF-014 — design 分类页创作

- 任务：创作 8 张 design 分类页
- 影响页面：8 张新建 + _index.md 更新 + index.md 更新
- 数据来源：_index.md 完整站点总览
- 闭环状态：guardrail-enforcer + ac-verifier 待主 Agent 启动
- 任务令牌：TKN-DESIGN-CATEGORIES-001
- pages:
  - wiki/design/image-resources.md（5 站点）
  - wiki/design/icon-resources.md（3 站点）
  - wiki/design/font-resources.md（4 站点）
  - wiki/design/color-resources.md（5 站点）
  - wiki/design/3d-model-resources.md（8 站点）
  - wiki/design/sound-resources.md（5 站点）
  - wiki/design/animation-resources.md（2 站点）
  - wiki/design/video-resources.md（2 站点）
- changes:
  - _index.md 状态说明从"⚠️ 待创作"更新为"✅ 已完成"
  - _index.md 状态与后续计划段 Phase 3 状态改为 ✅ 完成
  - index.md design 段追加 8 个分类页条目
  - index.md 总页数 25 → 33（+8 张分类页）

## [2026-07-25] ingest | DEF-015 — TheAlgorithms 6 仓库目录索引补全

- 任务：为 Java/C++/JavaScript/C/Rust/TypeScript 6 个 TheAlgorithms 入口页补全算法目录索引段
- 数据来源：各仓库 DIRECTORY.md（GitHub MCP get_file_contents 实时获取）
- 影响页面：6 个入口页修改 + Go 入口页追加 README 替代段 + 本日志
- 闭环状态：guardrail-enforcer + ac-verifier 待主 Agent 启动
- 任务令牌：TKN-THEALGORITHMS-DIR-002
- pages:
  - wiki/coding/thealgorithms-java.md（30 一级分类 / 1489 算法文件）
  - wiki/coding/thealgorithms-c-plus-plus.md（24 一级分类 / 368 算法文件）
  - wiki/coding/thealgorithms-javascript.md（22 一级分类 / 378 算法文件）
  - wiki/coding/thealgorithms-c.md（21 一级分类 / 277 算法文件，GPLv3）
  - wiki/coding/thealgorithms-rust.md（22 一级分类 / 392 算法文件）
  - wiki/coding/thealgorithms-typescript.md（10 一级分类 / 104 算法文件）
  - wiki/coding/thealgorithms-go.md（69 package / 316 函数，README 替代方案）
- notes:
  - Go 仓库 DIRECTORY.md 返回 404，改用 README.md 提取 packages 清单（godocmd 自动生成）作为替代
  - TypeScript 排除 .test.ts 测试文件后统计实际算法实现文件数
  - 各入口页 frontmatter 未修改，仅在"## 相关页面"前追加"## 算法目录索引"段
  - 目录索引段格式与 thealgorithms-python.md 模板一致：一级分类总览表 + 详细分类（按主题分组：经典算法领域/数据结构/数学与科学计算/加解密与安全/机器学习与人工智能/应用领域）
  - 二级分类数仅统计一级分类下的直接子目录数；URL 路径中的更深嵌套文件计入对应一级分类的算法文件总数
  - License 合规：仅引用算法名称列表与代表性算法名，未复制完整代码；各入口页明确标注 MIT/GPLv3 License 来源
