/**
 * kb_get_graph tool (P4 Phase 4c): Build the wiki knowledge graph.
 *
 * Returns nodes + edges + summary for the GraphView component.
 *
 * Node shape: { id, title, path, domain, type, status, inDegree, outDegree }
 * Edge types:
 *   - wikilink: extracted from body [[...]] and [text](url) links
 *   - related:  from frontmatter `related:` array (pure paths, AGENTS.md §3.3)
 *   - tags:     same-domain pages sharing at least one tag
 *
 * Summary:
 *   - totalNodes / totalEdges / byEdgeType
 *   - orphanPages (inDegree=0, excluding high-confidence experiences + pending/archived)
 *   - largestCcSize (union-find on undirected edges)
 *   - domains (page count per domain)
 *
 * Status filter (default: exclude pending/archived from the graph):
 *   Pending experience cards live in inbox/ and aren't part of the wiki graph.
 *   Archived pages are demoted and shouldn't clutter the visualization.
 *   The caller can pass include_statuses to override.
 */

import { loadAllPages } from "../utils/pages.js";
import type { PageInfo } from "../utils/pages.js";
import { jsonResult } from "./helpers.js";
import type { ToolResult } from "./helpers.js";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Statuses excluded from the graph by default (pending = inbox, archived = demoted). */
const DEFAULT_EXCLUDED_STATUSES = new Set(["pending", "archived"]);

// ---------------------------------------------------------------------------
// Public types (mirror frontend/src/types/index.ts GraphData)
// ---------------------------------------------------------------------------

interface GraphNode {
  id: string;
  title: string;
  path: string;
  domain: string; // first domain (primary)
  type: string | null;
  status: string | null;
  inDegree: number;
  outDegree: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: "wikilink" | "related" | "tags";
}

interface GraphSummary {
  totalNodes: number;
  totalEdges: number;
  byEdgeType: Record<string, number>;
  orphanPages: number;
  largestCcSize: number;
  domains: Record<string, number>;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: GraphSummary;
}

// ---------------------------------------------------------------------------
// kb_get_graph handler
// ---------------------------------------------------------------------------

export async function kbGetGraph(args: {
  include_statuses?: string[];
  domain?: string;
}): Promise<ToolResult> {
  // Load all pages once.
  let allPages: PageInfo[];
  try {
    allPages = await loadAllPages();
  } catch (err) {
    return jsonResult({
      error: `Failed to load pages: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // Status filter (default: exclude pending/archived).
  const excludedStatuses = args.include_statuses
    ? new Set<string>() // caller-controlled → include everything they specify
    : DEFAULT_EXCLUDED_STATUSES;
  const includeStatusesSet = args.include_statuses
    ? new Set(args.include_statuses)
    : null;

  let pages = allPages.filter((p) => {
    if (includeStatusesSet) {
      return p.status ? includeStatusesSet.has(p.status) : true;
    }
    return p.status ? !excludedStatuses.has(p.status) : true;
  });

  // Optional domain filter (only pages whose primary domain matches).
  if (args.domain) {
    pages = pages.filter((p) => p.domains[0] === args.domain);
  }

  // Build relPath → PageInfo index.
  const relPathIndex = new Map<string, PageInfo>();
  const basenameIndex = new Map<string, PageInfo[]>();
  for (const p of pages) {
    relPathIndex.set(p.relPath, p);
    const arr = basenameIndex.get(p.basename) ?? [];
    arr.push(p);
    basenameIndex.set(p.basename, arr);
  }

  // -------------------------------------------------------------------
  // Edge extraction
  // -------------------------------------------------------------------
  const edgeSet = new Set<string>(); // dedup "${source}::${target}::${type}"
  const edges: GraphEdge[] = [];
  const outDegree = new Map<string, number>();
  const inDegree = new Map<string, number>();
  for (const p of pages) {
    outDegree.set(p.relPath, 0);
    inDegree.set(p.relPath, 0);
  }

  const addEdge = (source: string, target: string, type: GraphEdge["type"]) => {
    if (source === target) return; // no self-loops
    if (!relPathIndex.has(source) || !relPathIndex.has(target)) return;
    const key = `${source}::${target}::${type}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push({ source, target, type });
    outDegree.set(source, (outDegree.get(source) ?? 0) + 1);
    inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
  };

  // 1. wikilink edges (from body links)
  for (const linker of pages) {
    for (const target of linker.links) {
      const resolved = resolveLink(
        target,
        basenameIndex,
        relPathIndex,
        linker.domains[0],
      );
      if (resolved) {
        addEdge(linker.relPath, resolved.relPath, "wikilink");
      }
    }
  }

  // 2. related edges (from frontmatter.related array)
  for (const p of pages) {
    const related = p.frontmatter.related;
    if (!Array.isArray(related)) continue;
    for (const r of related) {
      if (typeof r !== "string") continue;
      const resolved = resolveLink(r, basenameIndex, relPathIndex, p.domains[0]);
      if (resolved) {
        addEdge(p.relPath, resolved.relPath, "related");
      }
    }
  }

  // 3. tags edges (same-domain pages sharing at least one tag)
  // O(N×K) inverted-bucket scan (same algorithm as lint.ts missing_xref).
  const tagBuckets = new Map<string, PageInfo[]>();
  for (const p of pages) {
    if (p.tags.length === 0) continue;
    for (const domain of p.domains) {
      for (const tag of p.tags) {
        const key = `${domain}::${tag}`;
        const arr = tagBuckets.get(key) ?? [];
        arr.push(p);
        tagBuckets.set(key, arr);
      }
    }
  }
  const seenTagPairs = new Set<string>();
  for (const bucket of tagBuckets.values()) {
    if (bucket.length < 2) continue;
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i];
        const b = bucket[j];
        const [lo, hi] =
          a.relPath < b.relPath ? [a.relPath, b.relPath] : [b.relPath, a.relPath];
        const pairKey = `${lo}::${hi}`;
        if (seenTagPairs.has(pairKey)) continue;
        seenTagPairs.add(pairKey);
        // tags edges are undirected — add the edge from lo to hi
        addEdge(lo, hi, "tags");
      }
    }
  }

  // -------------------------------------------------------------------
  // Nodes
  // -------------------------------------------------------------------
  const nodes: GraphNode[] = pages.map((p) => ({
    id: p.relPath,
    title: p.title,
    path: `${p.relPath}.md`,
    domain: p.domains[0] ?? "uncategorized",
    type: p.type,
    status: p.status,
    inDegree: inDegree.get(p.relPath) ?? 0,
    outDegree: outDegree.get(p.relPath) ?? 0,
  }));

  // -------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------
  const byEdgeType: Record<string, number> = { wikilink: 0, related: 0, tags: 0 };
  for (const e of edges) {
    byEdgeType[e.type] = (byEdgeType[e.type] ?? 0) + 1;
  }

  // Orphan pages: inDegree=0, excluding high-confidence experiences.
  let orphanPages = 0;
  for (const n of nodes) {
    if (n.inDegree > 0) continue;
    if (n.type === "experience") {
      // High-confidence experiences (>=0.8) are exempt from orphan flagging.
      const page = relPathIndex.get(n.id);
      if (page && page.confidence !== null && page.confidence >= 0.8) continue;
    }
    orphanPages++;
  }

  // Largest connected component via union-find (undirected).
  const largestCcSize = computeLargestCc(nodes.map((n) => n.id), edges);

  // Domain distribution.
  const domains: Record<string, number> = {};
  for (const n of nodes) {
    domains[n.domain] = (domains[n.domain] ?? 0) + 1;
  }

  const summary: GraphSummary = {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    byEdgeType,
    orphanPages,
    largestCcSize,
    domains,
  };

  const data: GraphData = { nodes, edges, summary };
  return jsonResult(data);
}

// ---------------------------------------------------------------------------
// Link resolution (mirrors lint.ts resolveLink — same semantics)
// ---------------------------------------------------------------------------

function resolveLink(
  target: string,
  basenameIndex: Map<string, PageInfo[]>,
  relPathIndex: Map<string, PageInfo>,
  linkerDomain?: string,
): PageInfo | null {
  let t = target.trim();
  if (t.endsWith(".md")) t = t.slice(0, -3);
  else if (t.endsWith(".markdown")) t = t.slice(0, -9);
  if (t.startsWith("./")) t = t.slice(2);

  // Exact relPath match (e.g., "wiki/coding/foo")
  const exact = relPathIndex.get(t);
  if (exact) return exact;

  // Basename match (e.g., [[foo]] or [text](foo.md))
  const basename = t.includes("/") ? (t.split("/").pop() as string) : t;
  const candidates = basenameIndex.get(basename);
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Ambiguous: prefer same domain as linker
  if (linkerDomain) {
    const sameDomain = candidates.find((p) => p.domains.includes(linkerDomain));
    if (sameDomain) return sameDomain;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Union-Find for largest connected component
// ---------------------------------------------------------------------------

function computeLargestCc(
  nodeIds: string[],
  edges: GraphEdge[],
): number {
  if (nodeIds.length === 0) return 0;
  const parent = new Map<string, string>();
  for (const id of nodeIds) parent.set(id, id);

  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Path compression
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };

  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  // Treat all edges as undirected for CC.
  for (const e of edges) {
    if (!parent.has(e.source) || !parent.has(e.target)) continue;
    union(e.source, e.target);
  }

  const ccSize = new Map<string, number>();
  for (const id of nodeIds) {
    const root = find(id);
    ccSize.set(root, (ccSize.get(root) ?? 0) + 1);
  }

  let max = 0;
  for (const size of ccSize.values()) {
    if (size > max) max = size;
  }
  return max;
}
