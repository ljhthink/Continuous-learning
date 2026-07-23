/**
 * kb_lint tool (US-005): Run health checks on the knowledge base.
 *
 * Checks (AGENTS.md §6.2, ARCH.md §3.1):
 *   frontmatter    — missing/invalid frontmatter fields (high)
 *   contradictions — unresolved ⚠️ 矛盾 markers + duplicate titles (high)
 *   orphans        — pages with no inbound links (mid; high-confidence experiences + pending/archived exempt)
 *   stale          — linker page older than a source it references (high)
 *   missing_xref   — same-domain tag-sharing pages not cross-linked (mid)
 *
 * Note: AGENTS.md §6.2 also lists "data gaps" (low), intentionally omitted — requires
 *       heuristic judgment unsuitable for deterministic linting.
 */

import path from "node:path";
import { getKbRoot, getWikiDir } from "../config.js";
import { listMarkdownFiles, readFile } from "../utils/fileio.js";
import { parseFrontmatter, normalizeDate } from "../utils/frontmatter.js";
import { extractLinks } from "../utils/markdown.js";
import { jsonResult } from "./helpers.js";
import type { ToolResult } from "./helpers.js";

type CheckName =
  | "frontmatter"
  | "contradictions"
  | "orphans"
  | "stale"
  | "missing_xref";

type Severity = "high" | "mid";

interface LintIssue {
  type: CheckName;
  severity: Severity;
  page: string; // relPath without .md, or "A ↔ B" for pair issues
  detail: string;
  suggestion?: string;
}

interface PageInfo {
  absPath: string;
  relPath: string; // forward slashes, no .md
  basename: string;
  frontmatter: Record<string, unknown>;
  body: string;
  links: string[]; // raw link target strings
  title: string;
  type: string | null;
  status: string | null;
  date: string | null; // YYYY-MM-DD
  domains: string[];
  tags: string[];
  confidence: number | null;
}

const ALL_CHECKS: CheckName[] = [
  "frontmatter",
  "contradictions",
  "orphans",
  "stale",
  "missing_xref",
];

const REQUIRED_FIELDS: Record<string, string[]> = {
  common: ["title", "domain", "type", "status", "date"],
  source: ["source_file"],
  experience: ["confidence", "source_task"],
};

const VALID_TYPES = ["concept", "entity", "source", "experience"];
const VALID_STATUSES = [
  "active",
  "staging",
  "pending",
  "archived",
  "rejected",
];

// Skip these statuses from orphans / missing_xref (pending = inbox, archived = demoted)
const LINK_GRAPH_SKIP_STATUSES = new Set(["pending", "archived"]);

export async function kbLint(args: {
  checks?: CheckName[];
}): Promise<ToolResult> {
  const requested =
    args.checks && args.checks.length > 0 ? args.checks : ALL_CHECKS;
  const enabled = new Set(requested);

  let pages: PageInfo[];
  try {
    pages = await loadAllPages();
  } catch (err) {
    return jsonResult({
      issues: [],
      error: `Failed to load pages: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // Build indexes once
  const relPathIndex = new Map<string, PageInfo>();
  const basenameIndex = new Map<string, PageInfo[]>();
  for (const p of pages) {
    relPathIndex.set(p.relPath, p);
    const arr = basenameIndex.get(p.basename) ?? [];
    arr.push(p);
    basenameIndex.set(p.basename, arr);
  }

  // Precompute resolved link targets per page (set of target relPaths)
  const linkTargets = new Map<string, Set<string>>();
  for (const linker of pages) {
    const targets = new Set<string>();
    for (const target of linker.links) {
      const resolved = resolveLink(
        target,
        basenameIndex,
        relPathIndex,
        linker.domains[0],
      );
      if (resolved && resolved.relPath !== linker.relPath) {
        targets.add(resolved.relPath);
      }
    }
    linkTargets.set(linker.relPath, targets);
  }

  // Reverse index: target relPath → set of linker relPaths
  const inboundLinks = new Map<string, Set<string>>();
  for (const [linkerRelPath, targets] of linkTargets) {
    for (const target of targets) {
      let set = inboundLinks.get(target);
      if (!set) {
        set = new Set();
        inboundLinks.set(target, set);
      }
      set.add(linkerRelPath);
    }
  }

  const issues: LintIssue[] = [];

  if (enabled.has("frontmatter")) {
    issues.push(...checkFrontmatter(pages));
  }
  if (enabled.has("contradictions")) {
    issues.push(...checkContradictions(pages));
  }
  if (enabled.has("orphans")) {
    issues.push(...checkOrphans(pages, inboundLinks));
  }
  if (enabled.has("stale")) {
    issues.push(...checkStale(pages, relPathIndex, basenameIndex));
  }
  if (enabled.has("missing_xref")) {
    issues.push(...checkMissingXref(pages, linkTargets));
  }

  // Sort: high severity first, then by type, then by page
  issues.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === "high" ? -1 : 1;
    }
    if (a.type !== b.type) return a.type < b.type ? -1 : 1;
    return a.page < b.page ? -1 : 1;
  });

  const by_type: Record<string, number> = {};
  for (const issue of issues) {
    by_type[issue.type] = (by_type[issue.type] ?? 0) + 1;
  }

  return jsonResult({
    issues,
    summary: {
      total: issues.length,
      by_type,
      pages_scanned: pages.length,
      checks_run: requested,
    },
  });
}

// ---------------------------------------------------------------------------
// Page loading
// ---------------------------------------------------------------------------

async function loadAllPages(): Promise<PageInfo[]> {
  const files = await listMarkdownFiles(getWikiDir());
  // Hoist getKbRoot() out of the per-page loop: it reads process.env + resolves
  // a path on every call, which on a 1000-page scan added ~100ms of overhead
  // vs the old const (perf baseline lint-perf.test.ts). KB_ROOT is stable for
  // the duration of one lint run, so a single snapshot is correct.
  const kbRoot = getKbRoot();
  const pages: PageInfo[] = [];
  for (const absPath of files) {
    try {
      const content = await readFile(absPath);
      const { frontmatter, body } = parseFrontmatter(content);
      const relPath = path
        .relative(kbRoot, absPath)
        .replace(/\\/g, "/")
        .replace(/\.md$/, "");
      const basename = path.basename(absPath, ".md");
      const title =
        (typeof frontmatter.title === "string" && frontmatter.title) ||
        basename;
      const type =
        typeof frontmatter.type === "string" ? frontmatter.type : null;
      const status =
        typeof frontmatter.status === "string" ? frontmatter.status : null;
      const date = normalizeDate(frontmatter.date);
      const domains = toStringArray(frontmatter.domain);
      const tags = toStringArray(frontmatter.tags);
      const confidence =
        typeof frontmatter.confidence === "number"
          ? frontmatter.confidence
          : null;
      pages.push({
        absPath,
        relPath,
        basename,
        frontmatter,
        body,
        links: extractLinks(body),
        title,
        type,
        status,
        date,
        domains,
        tags,
        confidence,
      });
    } catch (err) {
      // Skip unreadable or malformed pages, but log to stderr so the
      // operator can see which page is corrupt (CLAUDE.md §19.4 不吞异常).
      console.error(`[kb-mcp] kb_lint: skipping unreadable page ${absPath}:`, err);
    }
  }
  return pages;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return [value];
  return [];
}

// ---------------------------------------------------------------------------
// Link resolution
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
  return null; // ambiguous — skip to avoid false positives
}

// ---------------------------------------------------------------------------
// Check: frontmatter (high)
// ---------------------------------------------------------------------------

function checkFrontmatter(pages: PageInfo[]): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const p of pages) {
    const required = [...REQUIRED_FIELDS.common];
    if (p.type === "source") required.push(...REQUIRED_FIELDS.source);
    if (p.type === "experience") {
      required.push(...REQUIRED_FIELDS.experience);
    }

    const missing: string[] = [];
    for (const field of required) {
      const v = p.frontmatter[field];
      if (v === undefined || v === null || v === "") {
        missing.push(field);
      }
    }
    if (missing.length > 0) {
      issues.push({
        type: "frontmatter",
        severity: "high",
        page: p.relPath,
        detail: `Missing required frontmatter field(s): ${missing.join(", ")}`,
        suggestion: `Add per AGENTS.md §3 schema for type="${p.type ?? "(missing)"}".`,
      });
    }

    if (p.type && !VALID_TYPES.includes(p.type)) {
      issues.push({
        type: "frontmatter",
        severity: "high",
        page: p.relPath,
        detail: `Invalid type "${p.type}"; must be one of: ${VALID_TYPES.join(", ")}`,
        suggestion: `Update type per AGENTS.md §3.1.`,
      });
    }

    if (p.status && !VALID_STATUSES.includes(p.status)) {
      issues.push({
        type: "frontmatter",
        severity: "high",
        page: p.relPath,
        detail: `Invalid status "${p.status}"; must be one of: ${VALID_STATUSES.join(", ")}`,
        suggestion: `Update status per AGENTS.md §3.4 state machine.`,
      });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Check: contradictions (high)
// ---------------------------------------------------------------------------

function checkContradictions(pages: PageInfo[]): LintIssue[] {
  const issues: LintIssue[] = [];

  // 1. Unresolved ⚠️ 矛盾 markers (AGENTS.md §4.3)
  const marker = /⚠️\s*矛盾\s*[：:]/;
  for (const p of pages) {
    const lines = p.body.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (marker.test(lines[i])) {
        const excerpt = lines[i].trim().slice(0, 120);
        issues.push({
          type: "contradictions",
          severity: "high",
          page: p.relPath,
          detail: `Unresolved contradiction marker at line ${i + 1}: ${excerpt}`,
          suggestion: `Resolve per AGENTS.md §4.3 (追加新声明并标注来源，不删除旧声明).`,
        });
      }
    }
  }

  // 2. Duplicate titles across different pages
  const titleMap = new Map<string, PageInfo[]>();
  for (const p of pages) {
    if (!p.title) continue;
    const arr = titleMap.get(p.title) ?? [];
    arr.push(p);
    titleMap.set(p.title, arr);
  }
  for (const [title, group] of titleMap) {
    if (group.length > 1) {
      issues.push({
        type: "contradictions",
        severity: "high",
        page: group.map((p) => p.relPath).join(" ↔ "),
        detail: `Duplicate title "${title}" across ${group.length} pages`,
        suggestion: `Rename one or add disambiguation.`,
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Check: orphans (mid)
// ---------------------------------------------------------------------------

function checkOrphans(
  pages: PageInfo[],
  inboundLinks: Map<string, Set<string>>,
): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const p of pages) {
    if (LINK_GRAPH_SKIP_STATUSES.has(p.status ?? "")) continue;
    // High-confidence experience cards are exempt (AGENTS.md §6.2)
    if (
      p.type === "experience" &&
      p.confidence !== null &&
      p.confidence >= 0.8
    ) {
      continue;
    }

    const inbound = inboundLinks.get(p.relPath);
    if (!inbound || inbound.size === 0) {
      issues.push({
        type: "orphans",
        severity: "mid",
        page: p.relPath,
        detail: `No inbound links from other wiki pages`,
        suggestion: `Add a [[${p.relPath}]] reference from a related page, or accept as root.`,
      });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Check: stale (high)
// ---------------------------------------------------------------------------

function checkStale(
  pages: PageInfo[],
  relPathIndex: Map<string, PageInfo>,
  basenameIndex: Map<string, PageInfo[]>,
): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const linker of pages) {
    if (!linker.date) continue;
    for (const target of linker.links) {
      const resolved = resolveLink(
        target,
        basenameIndex,
        relPathIndex,
        linker.domains[0],
      );
      if (!resolved) continue;
      if (resolved.relPath === linker.relPath) continue;
      // Only flag when target is a source page newer than linker
      if (resolved.type !== "source") continue;
      if (!resolved.date) continue;
      if (resolved.date > linker.date) {
        issues.push({
          type: "stale",
          severity: "high",
          page: linker.relPath,
          detail: `References source "${resolved.relPath}" (dated ${resolved.date}) which is newer than this page (${linker.date})`,
          suggestion: `Review and sync with updated source per AGENTS.md §4.3.`,
        });
      }
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Check: missing_xref (mid)
// ---------------------------------------------------------------------------

function checkMissingXref(
  pages: PageInfo[],
  linkTargets: Map<string, Set<string>>,
): LintIssue[] {
  // L-2 fix: replace O(N²) pairwise scan with O(N×K) inverted-bucket scan.
  //
  // Two pages are candidates iff they share AT LEAST ONE domain AND at least
  // one tag. That is equivalent to: they co-occur in some "${domain}::${tag}"
  // bucket. So we bucket pages by every (domain, tag) pair they carry, then
  // only pair pages inside the same bucket. A pair sharing multiple buckets
  // is deduplicated via seenPairs.
  //
  // Complexity: O(Σ|bucket|²) ≤ O(N × K_max × K_avg), where K is the bucket
  // size. In practice K ≪ N (e.g., pages with domain=coding AND tag=python
  // are a handful), so this is dramatically faster than O(N²) at scale.
  // Semantic equivalence with the previous O(N²) implementation is preserved:
  //   ∃ d ∈ A.domains ∩ B.domains, ∃ t ∈ A.tags ∩ B.tags
  //   ⟺ A,B co-occur in the d::t bucket.
  const issues: LintIssue[] = [];
  const seenPairs = new Set<string>(); // dedup "${loRel}::${hiRel}"

  // Build inverted index: "${domain}::${tag}" → PageInfo[]
  const buckets = new Map<string, PageInfo[]>();
  for (const p of pages) {
    if (LINK_GRAPH_SKIP_STATUSES.has(p.status ?? "")) continue;
    if (p.tags.length === 0) continue;
    for (const domain of p.domains) {
      for (const tag of p.tags) {
        const key = `${domain}::${tag}`;
        const arr = buckets.get(key) ?? [];
        arr.push(p);
        buckets.set(key, arr);
      }
    }
  }

  // Within each bucket, pair pages (i < j) — they share this domain+tag.
  for (const [, bucket] of buckets) {
    if (bucket.length < 2) continue;
    for (let i = 0; i < bucket.length; i++) {
      const a = bucket[i];
      for (let j = i + 1; j < bucket.length; j++) {
        const b = bucket[j];
        // Dedup: (a,b) may co-occur in multiple domain::tag buckets.
        const [lo, hi] =
          a.relPath < b.relPath ? [a.relPath, b.relPath] : [b.relPath, a.relPath];
        const pairKey = `${lo}::${hi}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        // Cross-link check
        const aLinks = linkTargets.get(a.relPath);
        const bLinks = linkTargets.get(b.relPath);
        if (aLinks?.has(b.relPath) || bLinks?.has(a.relPath)) continue;

        // Shared tags for detail (domains guaranteed shared via the bucket).
        const sharedTags = a.tags.filter((t) => b.tags.includes(t));
        issues.push({
          type: "missing_xref",
          severity: "mid",
          page: `${lo} ↔ ${hi}`,
          detail: `Same domain(s) and share tag(s) [${sharedTags.join(", ")}] but not cross-linked`,
          suggestion: `Add [[${hi}]] from ${lo} or vice versa.`,
        });
      }
    }
  }
  return issues;
}
