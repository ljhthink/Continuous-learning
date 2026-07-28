/**
 * P4a 静态 mock 数据
 *
 * 基于 P3 完成时的真实 KB 拓扑（37 页 / 60 边 / 4 经验卡）。
 * Phase 4b/4c 接入 MCP server 后，这些 mock 会被真实数据替换。
 */

import type {
  CategoryItem,
  PageSummary,
  GraphData,
  LogEntry,
  ExperienceCard,
  StagingFile,
  PageDetail,
  BacklinksData,
} from "@/types";

/** 领域分类（含统计） */
export const mockCategories: CategoryItem[] = [
  { domain: "kb-system", label: "知识库系统", color: "#8b5cf6", pageCount: 7, experienceCount: 0 },
  { domain: "coding", label: "编程", color: "#4a9eff", pageCount: 15, experienceCount: 4 },
  { domain: "design", label: "设计素材", color: "#ec4899", pageCount: 9, experienceCount: 0 },
  { domain: "resources", label: "资源索引", color: "#10b981", pageCount: 3, experienceCount: 0 },
  { domain: "emotions", label: "情感", color: "#f59e0b", pageCount: 2, experienceCount: 0 },
  { domain: "reading", label: "读书", color: "#06b6d4", pageCount: 1, experienceCount: 0 },
  { domain: "academic", label: "学术", color: "#6366f1", pageCount: 2, experienceCount: 0 },
  { domain: "life", label: "生活", color: "#84cc16", pageCount: 1, experienceCount: 0 },
];

/** 图谱节点（37 个，对应真实 wiki 页） */
export const mockGraphData: GraphData = {
  nodes: [
    { id: "three-layer-arch", title: "three-layer-arch", path: "wiki/kb-system/three-layer-arch.md", domain: "kb-system", type: "concept", status: "active", inDegree: 4, outDegree: 4 },
    { id: "frontmatter-schema", title: "frontmatter-schema", path: "wiki/kb-system/frontmatter-schema.md", domain: "kb-system", type: "concept", status: "active", inDegree: 3, outDegree: 2 },
    { id: "continuous-evolution", title: "continuous-evolution", path: "wiki/kb-system/continuous-evolution.md", domain: "kb-system", type: "concept", status: "active", inDegree: 2, outDegree: 3 },
    { id: "review-gate", title: "review-gate", path: "wiki/kb-system/review-gate.md", domain: "kb-system", type: "entity", status: "active", inDegree: 2, outDegree: 1 },
    { id: "multi-domain-classification", title: "multi-domain", path: "wiki/kb-system/multi-domain-classification.md", domain: "kb-system", type: "concept", status: "active", inDegree: 1, outDegree: 2 },
    { id: "dual-index", title: "dual-index", path: "wiki/kb-system/dual-index.md", domain: "kb-system", type: "concept", status: "active", inDegree: 1, outDegree: 0 },
    { id: "four-workflows", title: "four-workflows", path: "wiki/kb-system/four-workflows.md", domain: "kb-system", type: "concept", status: "active", inDegree: 1, outDegree: 2 },

    { id: "async-patterns", title: "async-patterns", path: "wiki/coding/async-patterns.md", domain: "coding", type: "concept", status: "active", inDegree: 5, outDegree: 4 },
    { id: "event-loop", title: "event-loop", path: "wiki/coding/event-loop.md", domain: "coding", type: "concept", status: "active", inDegree: 3, outDegree: 1 },
    { id: "async-await", title: "async-await", path: "wiki/coding/async-await.md", domain: "coding", type: "entity", status: "active", inDegree: 2, outDegree: 1 },
    { id: "context-manager", title: "context-mgr", path: "wiki/coding/context-manager.md", domain: "coding", type: "concept", status: "active", inDegree: 2, outDegree: 0 },
    { id: "task-async-refactor", title: "task-async-ref", path: "wiki/coding/experiences/task-async-refactor.md", domain: "coding", type: "source", status: "active", inDegree: 1, outDegree: 2 },
    { id: "gsap", title: "gsap", path: "wiki/design/animation-resources.md", domain: "coding", type: "entity", status: "active", inDegree: 1, outDegree: 0 },
    { id: "thealgorithms-python", title: "algorithms-py", path: "wiki/coding/thealgorithms-python.md", domain: "coding", type: "source", status: "active", inDegree: 1, outDegree: 1 },
    { id: "python-patterns", title: "python-patterns", path: "wiki/coding/python-patterns.md", domain: "coding", type: "concept", status: "active", inDegree: 1, outDegree: 2 },
    { id: "mcp-cache-exp", title: "mcp-cache", path: "wiki/coding/experiences/mcp-cache.md", domain: "coding", type: "experience", status: "pending", inDegree: 0, outDegree: 1 },
    { id: "lychee-ci-exp", title: "lychee-ci", path: "wiki/coding/experiences/lychee-ci.md", domain: "coding", type: "experience", status: "active", inDegree: 1, outDegree: 3 },
    { id: "js-yaml-exp", title: "js-yaml", path: "wiki/coding/experiences/js-yaml.md", domain: "coding", type: "experience", status: "active", inDegree: 1, outDegree: 0 },
    { id: "sub-agent-exp", title: "sub-agent", path: "wiki/coding/experiences/sub-agent.md", domain: "coding", type: "experience", status: "active", inDegree: 1, outDegree: 0 },

    { id: "design-index", title: "design-_index", path: "wiki/design/_index.md", domain: "design", type: "concept", status: "active", inDegree: 8, outDegree: 8 },
    { id: "image-resources", title: "images", path: "wiki/design/image-resources.md", domain: "design", type: "concept", status: "active", inDegree: 1, outDegree: 0 },
    { id: "video-resources", title: "video", path: "wiki/design/video-resources.md", domain: "design", type: "concept", status: "active", inDegree: 1, outDegree: 0 },
    { id: "animation-resources", title: "animation", path: "wiki/design/animation-resources.md", domain: "design", type: "concept", status: "active", inDegree: 1, outDegree: 1 },
    { id: "icon-resources", title: "icons", path: "wiki/design/icon-resources.md", domain: "design", type: "concept", status: "active", inDegree: 2, outDegree: 1 },
    { id: "font-resources", title: "fonts", path: "wiki/design/font-resources.md", domain: "design", type: "concept", status: "active", inDegree: 2, outDegree: 0 },
    { id: "color-resources", title: "colors", path: "wiki/design/color-resources.md", domain: "design", type: "concept", status: "active", inDegree: 1, outDegree: 1 },
    { id: "3d-model-resources", title: "3d-models", path: "wiki/design/3d-model-resources.md", domain: "design", type: "concept", status: "active", inDegree: 1, outDegree: 0 },
    { id: "sound-resources", title: "sounds", path: "wiki/design/sound-resources.md", domain: "design", type: "concept", status: "active", inDegree: 1, outDegree: 0 },

    { id: "public-apis", title: "public-apis", path: "wiki/resources/public-apis.md", domain: "resources", type: "concept", status: "active", inDegree: 2, outDegree: 3 },
    { id: "dataset-catalog", title: "datasets", path: "wiki/resources/dataset-catalog.md", domain: "resources", type: "concept", status: "active", inDegree: 1, outDegree: 0 },
    { id: "free-resources", title: "free-res", path: "wiki/resources/free-resources.md", domain: "resources", type: "concept", status: "active", inDegree: 1, outDegree: 0 },

    { id: "emotion-regulation", title: "emotion-reg", path: "wiki/emotions/emotion-regulation.md", domain: "emotions", type: "concept", status: "active", inDegree: 1, outDegree: 1 },
    { id: "self-growth", title: "self-growth", path: "wiki/emotions/self-growth.md", domain: "emotions", type: "concept", status: "active", inDegree: 0, outDegree: 0 },

    { id: "book-notes", title: "book-notes", path: "wiki/reading/book-notes.md", domain: "reading", type: "concept", status: "active", inDegree: 1, outDegree: 0 },

    { id: "paper-methods", title: "paper-methods", path: "wiki/academic/paper-methods.md", domain: "academic", type: "concept", status: "active", inDegree: 1, outDegree: 1 },
    { id: "research-tools", title: "research-tools", path: "wiki/academic/research-tools.md", domain: "academic", type: "entity", status: "active", inDegree: 0, outDegree: 0 },

    { id: "health", title: "health", path: "wiki/life/health.md", domain: "life", type: "concept", status: "active", inDegree: 1, outDegree: 0 },
  ],
  edges: [
    // coding wikilinks
    { source: "async-patterns", target: "event-loop", type: "wikilink" },
    { source: "async-patterns", target: "async-await", type: "wikilink" },
    { source: "async-patterns", target: "context-manager", type: "wikilink" },
    { source: "async-patterns", target: "task-async-refactor", type: "wikilink" },
    { source: "event-loop", target: "async-await", type: "wikilink" },
    { source: "async-await", target: "context-manager", type: "wikilink" },
    { source: "task-async-refactor", target: "async-patterns", type: "wikilink" },
    { source: "python-patterns", target: "async-patterns", type: "wikilink" },
    { source: "python-patterns", target: "context-manager", type: "wikilink" },
    { source: "thealgorithms-python", target: "python-patterns", type: "wikilink" },
    { source: "lychee-ci-exp", target: "js-yaml-exp", type: "wikilink" },
    { source: "lychee-ci-exp", target: "sub-agent-exp", type: "wikilink" },
    { source: "mcp-cache-exp", target: "sub-agent-exp", type: "wikilink" },
    { source: "lychee-ci-exp", target: "python-patterns", type: "wikilink" },
    // kb-system wikilinks
    { source: "three-layer-arch", target: "frontmatter-schema", type: "wikilink" },
    { source: "three-layer-arch", target: "continuous-evolution", type: "wikilink" },
    { source: "three-layer-arch", target: "dual-index", type: "wikilink" },
    { source: "three-layer-arch", target: "four-workflows", type: "wikilink" },
    { source: "continuous-evolution", target: "review-gate", type: "wikilink" },
    { source: "continuous-evolution", target: "frontmatter-schema", type: "wikilink" },
    { source: "multi-domain-classification", target: "three-layer-arch", type: "wikilink" },
    { source: "frontmatter-schema", target: "review-gate", type: "wikilink" },
    { source: "four-workflows", target: "review-gate", type: "wikilink" },
    // 跨域 wikilinks
    { source: "async-patterns", target: "three-layer-arch", type: "wikilink" },
    { source: "continuous-evolution", target: "mcp-cache-exp", type: "wikilink" },
    { source: "review-gate", target: "lychee-ci-exp", type: "wikilink" },
    { source: "frontmatter-schema", target: "async-patterns", type: "wikilink" },
    // design wikilinks
    { source: "design-index", target: "image-resources", type: "wikilink" },
    { source: "design-index", target: "video-resources", type: "wikilink" },
    { source: "design-index", target: "animation-resources", type: "wikilink" },
    { source: "design-index", target: "icon-resources", type: "wikilink" },
    { source: "design-index", target: "font-resources", type: "wikilink" },
    { source: "design-index", target: "color-resources", type: "wikilink" },
    { source: "design-index", target: "3d-model-resources", type: "wikilink" },
    { source: "design-index", target: "sound-resources", type: "wikilink" },
    { source: "animation-resources", target: "gsap", type: "wikilink" },
    { source: "icon-resources", target: "font-resources", type: "wikilink" },
    { source: "color-resources", target: "font-resources", type: "wikilink" },
    // resources wikilinks
    { source: "public-apis", target: "dataset-catalog", type: "wikilink" },
    { source: "public-apis", target: "free-resources", type: "wikilink" },
    { source: "public-apis", target: "design-index", type: "wikilink" },
    { source: "paper-methods", target: "book-notes", type: "wikilink" },
    { source: "emotion-regulation", target: "health", type: "wikilink" },
    { source: "multi-domain-classification", target: "design-index", type: "wikilink" },
    // related（虚线）
    { source: "async-patterns", target: "three-layer-arch", type: "related" },
    { source: "context-manager", target: "async-await", type: "related" },
    { source: "task-async-refactor", target: "lychee-ci-exp", type: "related" },
    { source: "design-index", target: "public-apis", type: "related" },
    { source: "continuous-evolution", target: "review-gate", type: "related" },
    { source: "frontmatter-schema", target: "js-yaml-exp", type: "related" },
    { source: "icon-resources", target: "font-resources", type: "related" },
    { source: "animation-resources", target: "gsap", type: "related" },
    { source: "paper-methods", target: "research-tools", type: "related" },
    { source: "emotion-regulation", target: "self-growth", type: "related" },
    { source: "three-layer-arch", target: "multi-domain-classification", type: "related" },
    { source: "four-workflows", target: "dual-index", type: "related" },
    // tags（点线，默认隐藏）
    { source: "async-patterns", target: "python-patterns", type: "tags" },
    { source: "lychee-ci-exp", target: "js-yaml-exp", type: "tags" },
    { source: "design-index", target: "color-resources", type: "tags" },
    { source: "mcp-cache-exp", target: "lychee-ci-exp", type: "tags" },
  ],
  summary: {
    totalNodes: 37,
    totalEdges: 60,
    byEdgeType: { wikilink: 44, related: 12, tags: 4 },
    orphanPages: 3,
    largestCcSize: 34,
    domains: { "kb-system": 7, coding: 15, design: 9, resources: 3, emotions: 2, reading: 1, academic: 2, life: 1 },
  },
};

/** 页面摘要列表（SearchBar / CategoryTree 联动） */
export const mockPageSummaries: PageSummary[] = mockGraphData.nodes.map((n) => ({
  path: n.path,
  title: n.title,
  domain: n.domain,
  type: n.type,
  status: n.status,
  date: "2026-07-26",
  inDegree: n.inDegree,
  outDegree: n.outDegree,
  tags: [],
}));

/** 当前预览页面详情（MarkdownPreview mock） */
export const mockPageDetail: PageDetail = {
  path: "wiki/coding/async-patterns.md",
  title: "Python 异步编程模式",
  domain: "coding",
  type: "concept",
  status: "active",
  date: "2026-07-26",
  tags: ["python", "async", "event-loop"],
  frontmatter: {
    title: "Python 异步编程模式",
    domain: ["coding"],
    type: "concept",
    status: "active",
    date: "2026-07-26",
    tags: ["python", "async", "event-loop"],
    related: ["wiki/coding/event-loop", "wiki/coding/context-manager"],
  },
  body: `# Python 异步编程模式

## 概述

Python 异步编程基于 \`asyncio\` 事件循环，通过 \`async/await\` 语法实现协程调度。

## 核心概念

### 事件循环（Event Loop）

事件循环是异步编程的核心，负责调度协程、IO 回调和信号处理。

\`\`\`python
import asyncio

async def main():
    await asyncio.sleep(1)
    print("done")

asyncio.run(main())
\`\`\`

### async/await

\`async def\` 定义协程函数，\`await\` 挂起当前协程等待结果。

### 上下文管理器

\`async with\` 用于异步资源管理，确保资源正确释放。

## 参见

- [[wiki/coding/event-loop|event-loop]]
- [[wiki/coding/context-manager|context-manager]]
- [[wiki/coding/experiences/task-async-refactor|task-async-refactor]]
`,
};

/** BacklinksPanel mock 数据 */
export const mockBacklinks: BacklinksData = {
  backlinks: [
    { path: "wiki/coding/event-loop.md", title: "event-loop", context: "...异步编程基于 asyncio 事件循环，通过 [[wiki/coding/async-patterns|async-patterns]] 实现..." },
    { path: "wiki/coding/python-patterns.md", title: "python-patterns", context: "...参考 [[wiki/coding/async-patterns|async-patterns]] 了解异步模式..." },
    { path: "wiki/coding/frontmatter-schema.md", title: "frontmatter-schema", context: "...如 [[wiki/coding/async-patterns|async-patterns]] 所述..." },
  ],
  outbound: [
    { path: "wiki/coding/event-loop.md", title: "event-loop" },
    { path: "wiki/coding/async-await.md", title: "async-await" },
    { path: "wiki/coding/context-manager.md", title: "context-mgr" },
    { path: "wiki/coding/experiences/task-async-refactor.md", title: "task-async-ref" },
  ],
  related: [
    { path: "wiki/coding/event-loop.md", title: "event-loop" },
    { path: "wiki/coding/context-manager.md", title: "context-mgr" },
  ],
};

/** LogTimeline mock 数据 */
export const mockLogEntries: LogEntry[] = [
  { date: "2026-07-26", type: "experience", title: "markdown 相对路径深度诊断", details: "lychee CI file 错误的根因分析" },
  { date: "2026-07-26", type: "promote", title: "ADR-011 Accepted", details: "P3 重复检测 + 质量评分" },
  { date: "2026-07-26", type: "dream", title: "/dream pass summary", details: "scanned: 4, demoted: 0, duplicates: 0, scored: 4" },
  { date: "2026-07-26", type: "ingest", title: "P3 经验卡：markdown 相对路径", details: "wiki/coding/experiences/lychee-ci.md" },
  { date: "2026-07-25", type: "lint", title: "kb_lint 通过", details: "36 pages, 0 high-severity issues" },
  { date: "2026-07-25", type: "experience", title: "js-yaml wikilink 解析陷阱", details: "frontmatter related 字段 wikilink → 纯路径数组" },
  { date: "2026-07-24", type: "ingest", title: "设计素材领域索引", details: "wiki/design/_index.md (30+ 站)" },
];

/** ExperienceInbox mock 数据 */
export const mockExperienceCards: ExperienceCard[] = [
  {
    path: "wiki/coding/experiences/mcp-cache.md",
    title: "MCP server 新增工具后客户端描述符缓存过期",
    domain: "coding",
    confidence: 0.9,
    sourceTask: "task-p3-mcp-extension",
    status: "pending",
    body: "## 背景\\n\\n新增 kb_get_graph tool 后，客户端 MCP 描述符缓存未更新...\\n\\n## 方案\\n\\n手动执行 promote 流程刷新缓存...",
  },
  {
    path: "wiki/coding/experiences/lychee-ci.md",
    title: "lychee CI file 错误：相对路径深度诊断",
    domain: "coding",
    confidence: 0.85,
    sourceTask: "task-p3-ci-fix",
    status: "pending",
    body: "## 背景\\n\\nlychee 报告 file:///home/runner/work/... 错误...\\n\\n## 方案\\n\\n检查相对路径深度，多余的 ../ 会导致...",
  },
];

/** FileList mock 数据（staging 文件） */
export const mockStagingFiles: StagingFile[] = [
  {
    id: "file-001",
    name: "async-patterns-ref.pdf",
    size: 2456789,
    format: "pdf",
    domain: "coding",
    uploadedAt: "2026-07-26T10:30:00",
    preview: "# Python 异步编程参考\\n\\n本文档详细介绍了 asyncio 的事件循环...",
    status: "staging",
  },
  {
    id: "file-002",
    name: "design-resources.docx",
    size: 1234567,
    format: "docx",
    domain: "design",
    uploadedAt: "2026-07-26T11:00:00",
    preview: "# 设计素材资源库\\n\\n图像、视频、动画、图标、字体...",
    status: "staging",
  },
];
