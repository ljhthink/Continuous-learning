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

## [2026-07-25] ingest | DEF-016 — merge-sort 跨语言实现模式对比（Phase 4 首个交付）

- 任务：创作 merge-sort-impl-patterns.md 概念页（ADR-009 Phase 4 / DEF-010 续）
- 数据来源：7 个 TheAlgorithms 仓库的 merge_sort 实现（GitHub MCP get_file_contents 实时获取）
- 影响页面：1 个新建概念页 + index.md 更新（总页数 33 → 34）+ 本日志
- 闭环状态：guardrail-enforcer + ac-verifier 待主 Agent 启动
- 任务令牌：TKN-MERGE-SORT-001
- pages:
  - wiki/coding/merge-sort-impl-patterns.md（7 语言对比：Python/JS/TS/Java/C++/C/Rust）
- notes:
  - 覆盖语言数：7 种（超过 quick-sort 的 4 种，为 DEF-010 系列中语言覆盖最广的）
  - Python 实现含 pop(0) 性能陷阱（O(n) 操作导致 merge 阶段退化为 O(n²)），已在页面显式标注
  - Rust 是唯一提供 top_down（递归）+ bottom_up（迭代）双实现的仓库
  - Java 的 tempArray 实例字段是最优临时存储策略（一次分配全递归复用）
  - 稳定性差异：Python/Java/C++/C 稳定（<=），JS/TS/Rust 不稳定（<）
  - 概念页含 5 项关键洞察：临时存储策略 / pop(0) 陷阱 / bottom-up 优势 / 稳定性来源 / 无符号右移
  - License 合规：仅引用代码片段用于对比分析，标注 MIT/GPLv3 来源，未复制完整文件
  - 后续：可继续 Phase 4 的 graph、DP 等算法深化（按用户优先级）

## [2026-07-25] ingest | DEF-017 — heap-sort 跨语言实现模式对比（Phase 4 第二个交付）

- 任务：创作 heap-sort-impl-patterns.md 概念页（ADR-009 Phase 4 / DEF-016 续）
- 数据来源：6 个 TheAlgorithms 仓库的 heap_sort 实现（GitHub MCP get_file_contents 实时获取），C 仓库含 2 个实现
- 影响页面：1 个新建概念页 + 6 个入口页交叉引用更新 + index.md 更新（总页数 34 → 35）+ 本日志
- 闭环状态：guardrail-enforcer + ac-verifier 待主 Agent 启动
- 任务令牌：TKN-HEAP-SORT-001
- pages:
  - wiki/coding/heap-sort-impl-patterns.md（6 语言 7 实现：Python/Java/C++/C×2/Rust/TypeScript）
- notes:
  - 覆盖语言数：6 种（缺 JavaScript，TheAlgorithms/JavaScript 无 heap_sort 实现）
  - C 仓库提供 2 个实现：heap_sort.c（1-based 迭代 sift-down）+ heap_sort_2.c（sift-up 建堆，O(n log n)）
  - Rust 是唯一支持升序/降序切换的实现（is_max_heap 参数 + Ordering 比较器函数指针）
  - Java 和 C v1 使用 1-based 索引（历史遗产，简化父子计算但需 -1 偏移访问数组）
  - C++ 版本建堆起点非标准（从 n-1 开始而非 n/2-1，多了对叶子节点的无效调用，结果正确但效率略低）
  - TypeScript 注释含 bug（@example 误写为 MergeSort，应为 HeapSort）
  - 关键洞察 5 项：建堆策略分水岭（O(n) vs O(n log n)）/ 1-based 索引历史遗产 / 迭代 vs 递归权衡 / C++ 建堆起点非标准 / Rust 升序降序切换设计
  - 工业实现对比：std::make_heap/sort_heap、PriorityQueue、heapq、BinaryHeap 均封装为数据结构而非排序函数
  - License 合规：5 MIT + 2 GPLv3（C 两个版本），标注来源
  - 后续：可继续 Phase 4 的 graph、DP 等算法深化（按用户优先级）

## [2026-07-25] ingest | DEF-018 — graph-traversal BFS/DFS 跨语言实现模式对比（Phase 4 第三个交付）

- 任务：创作 graph-traversal-bfs-dfs-impl-patterns.md 概念页（ADR-009 Phase 4 / DEF-017 续）
- 数据来源：5 个 TheAlgorithms 仓库的 BFS/DFS 实现（GitHub MCP get_file_contents 实时获取），每个仓库各一对 BFS+DFS 共 10 个实现
- 覆盖语言数：5 种（缺 TypeScript，TheAlgorithms/TypeScript 仓库无纯 BFS/DFS 实现，搜索 breadth_first_search/depth_first_search 返回 0 结果）
- 关键技术发现：
  - 图表示法三阵营：邻接表（Python/C++/C）vs 邻接矩阵（Java）vs 边列表（Rust）
  - DFS 策略对比：递归（Java/C）vs 显式栈（Python/C++/Rust），后者规避栈溢出
  - C++ DFS 唯一采用 3-coloring（WHITE/GREY/BLACK）三色标记，借鉴 CLRS 教科书
  - Rust BFS/DFS 共享 VecDeque 数据结构（push_back+pop_front 实现 FIFO，push_front+pop_front 实现 LIFO），体现 deque 双用途设计哲学
  - Rust BFS/DFS 唯一目标搜索语义（Option<Vec<u32>>），其他 8 个实现为全遍历语义
  - Rust 边列表 neighbors() 复杂度 O(E)（非 O(deg(v))），性能劣势但代码简洁
  - Java BFS 延迟过滤（lazy deletion）：入队不检查 visited，出队才检查，可能重复入队
  - C BFS 自定义队列 + pollQueue/dequeue 两阶段操作，10 个实现中独有
  - License 合规：4 MIT + 2 GPLv3（C 两个文件 bfs.c/dfs.c）
- 影响页面：1 个新建概念页 + 5 个入口页交叉引用更新 + index.md 更新（总页数 35 → 36）+ 本日志
- 闭环状态：guardrail-enforcer + ac-verifier 待主 Agent 启动
- 任务令牌：TKN-GRAPH-TRAVERSAL-001
- pages:
  - wiki/coding/graph-traversal-bfs-dfs-impl-patterns.md（5 语言 10 实现：Python/Java/C++/C/Rust）

## [2026-07-25] tech-debt | DEF-019 — CI file:/// 检测门禁 + frontmatter YAML 合法化 + kb_lint 健康修复

- 类型：tech-debt（B1 file:/// 检测 + C1/C2/C4 知识库健康修复）
- ADR：[ADR-010](docs/decisions/ADR-010-ci-file-absolute-path-detection.md)（CI 新增 file:/// 绝对路径检测门禁）
- **B1（file:/// 检测门禁）**：
  - `scripts/consistency-check.js` 新增 `checkFileAbsolutePath()`，正则 `\(file:\/\/\/[A-Za-z]` 匹配 markdown 链接格式的绝对路径
  - 排除 `node_modules` / `dist` / `.trae` 等目录；不误伤反引号包裹的描述性引用
  - CI `docs-quality` workflow 新增第 5 项检查，子 Agent 报告硬编码 `file:///D:/...` 将被拦截
- **C1 根因修复（frontmatter YAML 合法化）**：
  - 根因：31 个 wiki 页面 frontmatter `related` 字段使用 `[[foo]], [[bar]]` 多 wikilink 格式，js-yaml 解析失败导致 frontmatter 降级为空，kb_lint 报 22 个 frontmatter 误报
  - 修复：批量改为 `[foo, bar]` 纯路径数组（与 `domain: [coding]` 风格一致）
  - AGENTS.md §3.3 示例同步更新，明确禁用 `[[...]]` wikilink 在 frontmatter 中
- **C2（contradiction 误报修复）**：
  - `wiki/kb-system/ingest-workflow.md` 措辞修复，移除字面量 "⚠️ 矛盾" 避免 kb_lint 误识别为未解决矛盾
- **C4 扩展（missing_xref sibling 聚合）**：
  - 22 个页面添加 "## 同领域" section（thealgorithms 8 + kb-system 9 + 算法实现 5）
  - 消除全部 43 个 missing_xref（同 domain + 共享 tag 但 body 无 wikilink 交叉引用）
- **markdownlint 配置统一**：
  - 新建 `.markdownlint-cli2.jsonc`（globs 配置）与 `.markdownlintignore`（持久化排除目录）
  - `.github/workflows/docs.yml` markdownlint 命令追加排除参数 `#node_modules #**/node_modules #tmp #.trae`
  - 本地预验与 CI 行为统一，113 文件 0 issues
- **kb_lint 验证**：0 issues（frontmatter / contradictions / orphans / stale / missing_xref 全部通过）
- 影响页面：31 个 wiki 页面 frontmatter + 22 个页面 sibling section + 3 个新文件 + 5 个配置/文档文件
- 闭环状态：guardrail-enforcer + ac-verifier 待主 Agent 启动
- 任务令牌：TKN-TECH-DEBT-001
- pages:
  - 详见 git diff（35 文件修改 + 3 新文件，+409/-33 行）

## [2026-07-26] dream | /dream pass summary

- scanned: 4
- demoted: 0
- duplicates_found: 0
- quality_scored: 4
- quality_updated: 4
