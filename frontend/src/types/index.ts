/**
 * P4 GUI 类型定义
 *
 * 对应 AGENTS.md frontmatter schema 与 P4 计划 §4.4 组件数据契约。
 * Phase 4a 阶段为静态类型，4b/4c 接入真实 MCP server 后复用。
 */

/** 领域枚举（8 个，对应 AGENTS.md §8.1） */
export type Domain =
  | "kb-system"
  | "coding"
  | "resources"
  | "design"
  | "emotions"
  | "reading"
  | "academic"
  | "life";

/** wiki 页 type 字段 */
export type PageType = "concept" | "entity" | "source" | "experience";

/** wiki 页 status 字段 */
export type PageStatus = "active" | "staging" | "pending" | "archived" | "rejected";

/** 视图类型（主内容区 4 视图 + settings modal） */
export type ViewName = "upload" | "preview" | "review" | "graph";

/** 主题类型 */
export type Theme = "dark" | "light";

/** 图谱模式 */
export type GraphMode = "global" | "local";

/** 领域配色映射 */
export const DOMAIN_COLORS: Record<Domain, string> = {
  "kb-system": "#8b5cf6",
  coding: "#4a9eff",
  resources: "#10b981",
  design: "#ec4899",
  emotions: "#f59e0b",
  reading: "#06b6d4",
  academic: "#6366f1",
  life: "#84cc16",
};

/** 领域中文名 */
export const DOMAIN_LABELS: Record<Domain, string> = {
  "kb-system": "知识库系统",
  coding: "编程",
  resources: "资源索引",
  design: "设计素材",
  emotions: "情感",
  reading: "读书",
  academic: "学术",
  life: "生活",
};

/** CategoryTree 项（含统计） */
export interface CategoryItem {
  domain: Domain;
  label: string;
  color: string;
  pageCount: number;
  experienceCount: number;
}

/** wiki 页摘要（用于列表/搜索结果） */
export interface PageSummary {
  path: string;
  title: string;
  domain: Domain;
  type: PageType;
  status: PageStatus;
  date: string;
  inDegree: number;
  outDegree: number;
  tags: string[];
}

/** wiki 页详情（MarkdownPreview 用） */
export interface PageDetail {
  path: string;
  title: string;
  domain: Domain;
  type: PageType;
  status: PageStatus;
  date: string;
  tags: string[];
  frontmatter: Record<string, unknown>;
  body: string;
}

/** BacklinksPanel 三段数据 */
export interface BacklinksData {
  backlinks: Array<{ path: string; title: string; context: string }>;
  outbound: Array<{ path: string; title: string }>;
  related: Array<{ path: string; title: string }>;
}

/** GraphView 节点 */
export interface GraphNode {
  id: string;
  title: string;
  path: string;
  domain: Domain;
  type: PageType;
  status: PageStatus;
  inDegree: number;
  outDegree: number;
}

/** GraphView 边 */
export interface GraphEdge {
  source: string;
  target: string;
  type: "wikilink" | "related" | "tags";
}

/** GraphView 完整图数据 */
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: {
    totalNodes: number;
    totalEdges: number;
    byEdgeType: Record<string, number>;
    orphanPages: number;
    largestCcSize: number;
    domains: Record<string, number>;
  };
}

/** LogTimeline 条目 */
export interface LogEntry {
  date: string;
  type: "ingest" | "experience" | "promote" | "reject" | "dream" | "lint";
  title: string;
  details?: string;
}

/** ExperienceInbox 卡片 */
export interface ExperienceCard {
  path: string;
  title: string;
  domain: Domain;
  confidence: number;
  sourceTask: string;
  status: "pending" | "active" | "rejected";
  body: string;
  duplicateWith?: string[];
}

/** 上传文件卡片（FileList） */
export interface StagingFile {
  id: string;
  name: string;
  size: number;
  format: "pdf" | "docx" | "xlsx" | "md";
  domain: Domain;
  uploadedAt: string;
  preview: string;
  status: "parsing" | "staging" | "confirmed" | "rejected";
}
