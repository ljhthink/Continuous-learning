# 知识库索引

> 最后更新：2026-07-25 · 总页数：35
> 本文件是知识库的内容索引（内容导向），LLM 回答问题前先读此文件定位。
> 时间日志见 [log.md](log.md)。结构约定见 [AGENTS.md](AGENTS.md)。

## kb-system

<!-- 知识库系统元知识：描述知识库本身如何工作（三层架构、双索引、状态机、frontmatter、四大工作流、领域分类、持续进化门禁） -->
<!-- 格式：- [[wiki/kb-system/<page>]] · 一句话摘要 · YYYY-MM-DD -->

- [[wiki/kb-system/three-layer-architecture]] · 三层架构：Raw / Wiki / Schema · 2026-07-24
- [[wiki/kb-system/dual-index-mechanism]] · 双索引机制：内容索引 + 时间日志 · 2026-07-24
- [[wiki/kb-system/page-types-and-state-machine]] · 页面类型与状态机 · 2026-07-24
- [[wiki/kb-system/frontmatter-schema]] · frontmatter Schema 规约 · 2026-07-24
- [[wiki/kb-system/multi-domain-classification]] · 多领域分类规范 · 2026-07-24
- [[wiki/kb-system/continuous-evolution-review-gate]] · 持续进化门禁：两 Tier 审核与老化 · 2026-07-24
- [[wiki/kb-system/ingest-workflow]] · Ingest 工作流：从 raw 到 wiki · 2026-07-24
- [[wiki/kb-system/query-workflow]] · Query 工作流：检索与综合答案 · 2026-07-24
- [[wiki/kb-system/lint-workflow]] · Lint 工作流：健康检查 · 2026-07-24

## coding

<!-- 在此追加编程领域页面（概念/实体/来源页），格式：- [[wiki/coding/<page>]] · 一句话摘要 · YYYY-MM-DD -->
<!-- 经验卡片统一列入下方 experiences 段，不在此重复 -->

### 外部开源资源（algorithm 教育合集）

<!-- 在此追加外部开源资源 entity 页，格式：- [[wiki/coding/<page>]] · 一句话摘要 · YYYY-MM-DD -->
<!-- public-apis 已按 ADR-009 决策 2 迁移至 wiki/resources/ -->

- [[wiki/coding/thealgorithms-python]] · TheAlgorithms/Python — Python 算法教育实现合集 · 2026-07-24
- [[wiki/coding/thealgorithms-java]] · TheAlgorithms/Java — Java 算法教育实现合集 · 2026-07-24
- [[wiki/coding/thealgorithms-c-plus-plus]] · TheAlgorithms/C-Plus-Plus — C++17 算法教育实现合集 · 2026-07-24
- [[wiki/coding/thealgorithms-javascript]] · TheAlgorithms/JavaScript — JavaScript 算法教育实现合集 · 2026-07-24
- [[wiki/coding/thealgorithms-c]] · TheAlgorithms/C — C11 算法教育实现合集（GPLv3） · 2026-07-24
- [[wiki/coding/thealgorithms-go]] · TheAlgorithms/Go — Go 算法教育实现合集 · 2026-07-24
- [[wiki/coding/thealgorithms-rust]] · TheAlgorithms/Rust — Rust 算法教育实现合集 · 2026-07-24
- [[wiki/coding/thealgorithms-typescript]] · TheAlgorithms/TypeScript — TypeScript 算法教育实现合集 · 2026-07-24

### 算法实现模式（跨语言对比，基于 TheAlgorithms 真实代码）

<!-- 在此追加算法实现模式 concept 页，格式：- [[wiki/coding/<page>]] · 一句话摘要 · YYYY-MM-DD -->

- [[wiki/coding/quick-sort-impl-patterns]] · 快速排序跨语言实现模式对比（Python/Java/C++ 4 种分区策略） · 2026-07-24
- [[wiki/coding/binary-search-impl-patterns]] · 二分搜索跨语言实现模式对比（迭代/递归/bisect/泛型） · 2026-07-24
- [[wiki/coding/merge-sort-impl-patterns]] · 归并排序跨语言实现模式对比（7 语言：函数式非原地/命令式原地，含 Rust bottom-up 迭代与 Python pop(0) 陷阱） · 2026-07-25
- [[wiki/coding/heap-sort-impl-patterns]] · 堆排序跨语言实现模式对比（6 语言 7 实现：含 C sift-up 建堆 + Rust 升序降序切换 + Java 1-based 索引） · 2026-07-25

## resources

<!-- 外部资源索引：API、数据集等（ADR-009 决策 2） -->
<!-- 格式：- [[wiki/resources/<page>]] · 一句话摘要 · YYYY-MM-DD -->

- [[wiki/resources/public-apis]] · public-apis/public-apis — GitHub 最大公益 API 仓库 · 2026-07-25

## design

<!-- 设计素材资源：按类型分组（ADR-009 决策 3） -->
<!-- 格式：- [[wiki/design/<page>]] · 一句话摘要 · YYYY-MM-DD -->

- [[wiki/design/_index]] · 设计素材领域索引（8 类资源分组） · 2026-07-25
- [[wiki/design/image-resources]] · 图像素材资源（5 站） · 2026-07-25
- [[wiki/design/icon-resources]] · 图标素材资源（3 站） · 2026-07-25
- [[wiki/design/font-resources]] · 字体素材资源（4 站） · 2026-07-25
- [[wiki/design/color-resources]] · 颜色素材资源（5 站） · 2026-07-25
- [[wiki/design/3d-model-resources]] · 3D 模型素材资源（8 站） · 2026-07-25
- [[wiki/design/sound-resources]] · 声音素材资源（5 站） · 2026-07-25
- [[wiki/design/animation-resources]] · 动画素材资源（2 站） · 2026-07-25
- [[wiki/design/video-resources]] · 视频素材资源（2 站） · 2026-07-25

## emotions

<!-- 在此追加情感领域页面 -->

## reading

<!-- 在此追加读书领域页面 -->

## experiences（最近正式经验卡片）

- [[wiki/coding/experiences/js-yaml-5-major-升级load-空字符串行为变化与-trycatch-降级]] · js-yaml 5 MAJOR 升级：load() 空字符串行为变化与 try/catch 降级 · confidence=0.9 · 2026-07-24
- [[wiki/coding/experiences/lychee-链接检查-ci绝对路径node-modules-引用与裸-url-的处理]] · lychee 链接检查 CI：绝对路径、node_modules 引用与裸 URL 的处理 · confidence=0.85 · 2026-07-24
- [[wiki/coding/experiences/mcp-server-新增工具后客户端描述符缓存过期需重连刷新才能发现]] · MCP server 新增工具后客户端描述符缓存过期：需重连刷新才能发现 · confidence=0.8 · 2026-07-24
- [[wiki/coding/experiences/子-agent-生成报告的-file-绝对路径陷阱与-ci-兼容性审查]] · 子 Agent 生成报告的 file:/// 绝对路径陷阱与 CI 兼容性审查 · confidence=0.8 · 2026-07-24
