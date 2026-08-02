/**
 * P4 GUI 类型定义
 *
 * 对应 AGENTS.md frontmatter schema 与 P4 计划 §4.4 组件数据契约。
 * Phase 4a 阶段为静态类型，4b/4c 接入真实 MCP server 后复用。
 */

/**
 * 领域类型（动态，对应 AGENTS.md §8.1 + 用户自定义领域）。
 *
 * P6-R5: 从固定字面量联合类型改为 string，支持 LLM 建议新领域与用户手动新建领域。
 * kebab-case 校验由后端 `is_valid_domain` 负责（frontend/src-tauri/src/lib.rs）。
 * 下游消费点应用 `domainLabel(name)` / `domainColor(name)` 辅助函数获取标签与配色，
 * 未知领域回退为原名称与灰色，避免 `undefined` 显示。
 */
export type Domain = string;

/** 已知领域默认列表（对应 AGENTS.md §8.1，供 UI 默认渲染与初始化使用） */
export const KNOWN_DOMAINS: readonly string[] = [
  "kb-system",
  "coding",
  "resources",
  "design",
  "emotions",
  "reading",
  "academic",
  "life",
] as const;

/** wiki 页 type 字段 */
export type PageType = "concept" | "entity" | "source" | "experience";

/** wiki 页 status 字段 */
export type PageStatus = "active" | "staging" | "pending" | "archived" | "rejected";

/** 视图类型（主内容区 5 视图 + settings modal） */
export type ViewName = "upload" | "preview" | "review" | "graph" | "chat";

/** 主题类型 */
export type Theme = "dark" | "light";

/** 图谱模式 */
export type GraphMode = "global" | "local";

/** 领域配色映射（已知领域默认配色，未知领域回退为灰色） */
export const DOMAIN_COLORS: Record<string, string> = {
  "kb-system": "#8b5cf6",
  coding: "#4a9eff",
  resources: "#10b981",
  design: "#ec4899",
  emotions: "#f59e0b",
  reading: "#06b6d4",
  academic: "#6366f1",
  life: "#84cc16",
};

/** 领域中文名映射（已知领域默认中文名，未知领域回退为原名称） */
export const DOMAIN_LABELS: Record<string, string> = {
  "kb-system": "知识库系统",
  coding: "编程",
  resources: "资源索引",
  design: "设计素材",
  emotions: "情感",
  reading: "读书",
  academic: "学术",
  life: "生活",
};

/** 安全获取领域标签（未知领域回退为原名称，避免 `undefined`） */
export function domainLabel(domain: string | null | undefined): string {
  if (!domain) return "未分类";
  return DOMAIN_LABELS[domain] ?? domain;
}

/** 安全获取领域配色（未知领域回退为灰色 #6b7280） */
export function domainColor(domain: string | null | undefined): string {
  if (!domain) return "#6b7280";
  return DOMAIN_COLORS[domain] ?? "#6b7280";
}

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
