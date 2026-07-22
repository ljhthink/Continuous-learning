/**
 * Performance baseline for MCP Server (P1 + P2).
 *
 * Generates a 200-page fixture KB (the PRD US-006 small-scale threshold)
 * and measures p50/p95/p99 latency, throughput, and error rate for:
 *   - kb_search (term-overlap full-file scan)
 *   - kb_get_page (single page read + frontmatter parse)
 *   - kb_list_categories (with stats)
 *   - kb_health (page count + log parse)
 *   - kb_lint (full scan, includes missing_xref — L-2 optimized in P2)
 *
 * P2 addition: also generates a 1000-page fixture and measures kb_lint
 * (missing_xref only + all checks) to verify the L-2 O(N×K) optimization
 * scales beyond the P1 small-scale threshold. P1 extrapolation projected
 * O(N²) would hit ~3.7s at N=5000; this proves the optimized scan stays
 * well under the 2s PRD threshold at N=1000.
 *
 * Run: node perf-baseline.mjs  (after `npm run build`)
 *
 * Output: docs/reports/perf/2026-07-23-p2-mcp-server-baseline.md (printed to stdout)
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const TMP = path.join(os.tmpdir(), "kb-perf-baseline");
const PAGE_COUNT = 200;
const ITERATIONS = 50;

// --- Stats helpers ---
function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, Math.min(idx, sortedArr.length - 1))];
}

async function measure(name, fn) {
  const latencies = [];
  let errors = 0;
  // Warmup (1 iteration, not counted)
  try {
    await fn();
  } catch (e) {
    // ignore warmup error
  }
  const start = Date.now();
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = process.hrtime.bigint();
    try {
      await fn();
    } catch {
      errors++;
    }
    const t1 = process.hrtime.bigint();
    latencies.push(Number(t1 - t0) / 1e6); // ms
  }
  const wallMs = Date.now() - start;
  latencies.sort((a, b) => a - b);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  const throughput = (ITERATIONS / wallMs) * 1000; // QPS
  const errorRate = errors / ITERATIONS;
  return {
    name,
    iterations: ITERATIONS,
    p50: p50.toFixed(3),
    p95: p95.toFixed(3),
    p99: p99.toFixed(3),
    throughput: throughput.toFixed(2),
    errorRate: errorRate.toFixed(4),
    wallMs: wallMs,
  };
}

// --- Setup 200-page fixture KB ---
console.log(`Setting up ${PAGE_COUNT}-page fixture KB at ${TMP}...`);
await fs.rm(TMP, { recursive: true, force: true });
await fs.mkdir(path.join(TMP, "wiki", "coding"), { recursive: true });
await fs.mkdir(path.join(TMP, "wiki", "emotions"), { recursive: true });
await fs.mkdir(path.join(TMP, "wiki", "reading"), { recursive: true });
await fs.mkdir(path.join(TMP, "raw", "markdown"), { recursive: true });
await fs.writeFile(
  path.join(TMP, "index.md"),
  "# 知识库索引\n> 最后更新：2026-07-22 · 总页数：0\n",
);
await fs.writeFile(path.join(TMP, "log.md"), "");

// Generate 200 pages across 3 domains with shared tags (for missing_xref)
const domains = ["coding", "emotions", "reading"];
const tagPool = ["python", "async", "testing", "stress", "focus", "books"];
for (let i = 0; i < PAGE_COUNT; i++) {
  const domain = domains[i % domains.length];
  const slug = `page-${String(i).padStart(3, "0")}`;
  const tags = [tagPool[i % tagPool.length], tagPool[(i + 1) % tagPool.length]];
  // Make ~30% of pages "source" type with source_file; rest "concept"
  const isSource = i % 3 === 0;
  const date = `2026-07-${String((i % 28) + 1).padStart(2, "0")}`;
  let fm = `---\n`;
  fm += `title: ${slug} Title\n`;
  fm += `domain: [${domain}]\n`;
  fm += `type: ${isSource ? "source" : "concept"}\n`;
  fm += `status: active\n`;
  fm += `date: ${date}\n`;
  if (isSource) fm += `source_file: raw/markdown/${slug}.md\n`;
  fm += `tags: [${tags.join(", ")}]\n`;
  fm += `---\n`;
  const body = `# ${slug} Title\n\nThis page discusses ${tags.join(" and ")} in the ${domain} domain.\nPython async patterns and testing fundamentals.\nSome unique content ${i}.\n`;
  await fs.writeFile(path.join(TMP, "wiki", domain, `${slug}.md`), fm + body);
}
console.log(`Generated ${PAGE_COUNT} pages.`);

// Set KB_ROOT and import compiled handlers
process.env.KB_ROOT = TMP;
const search = await import("./dist/tools/search.js");
const readOnly = await import("./dist/tools/read-only.js");
const lint = await import("./dist/tools/lint.js");

console.log(`Running ${ITERATIONS} iterations per tool...\n`);

// --- Measure each tool ---
const results = [];

// kb_search — common term "python" matches many pages
results.push(
  await measure("kb_search (query='python', 200 pages)", () =>
    search.kbSearch({ query: "python async testing" }),
  ),
);

// kb_search with domain filter
results.push(
  await measure("kb_search (query='python', domain='coding')", () =>
    search.kbSearch({ query: "python", domain: "coding" }),
  ),
);

// kb_get_page — single page read
results.push(
  await measure("kb_get_page (single page)", () =>
    readOnly.kbGetPage({ path: "wiki/coding/page-100" }),
  ),
);

// kb_list_categories with stats
results.push(
  await measure("kb_list_categories (include_stats=true)", () =>
    readOnly.kbListCategories({ include_stats: true }),
  ),
);

// kb_health
results.push(
  await measure("kb_health", () => readOnly.kbHealth()),
);

// kb_lint — full scan (L-2 optimized in P2: missing_xref is now O(N×K))
results.push(
  await measure("kb_lint (all checks, 200 pages)", () =>
    lint.kbLint({}),
  ),
);

// kb_lint — frontmatter only (linear, for comparison)
results.push(
  await measure("kb_lint (frontmatter only, 200 pages)", () =>
    lint.kbLint({ checks: ["frontmatter"] }),
  ),
);

// --- P2: N=1000 scale fixture for L-2 regression ---
// The 200-page fixture above cannot distinguish O(N²) from O(N×K) — both
// finish in ~100ms. The 1000-page fixture stresses missing_xref enough to
// prove the L-2 optimization holds at scale (P1 extrapolation projected
// ~150ms for O(N²) at N=1000, ~3.7s at N=5000).
const SCALE_TMP = path.join(os.tmpdir(), "kb-perf-baseline-scale-1000");
const SCALE_PAGE_COUNT = 1000;
console.log(`\nSetting up ${SCALE_PAGE_COUNT}-page scale fixture at ${SCALE_TMP}...`);
await fs.rm(SCALE_TMP, { recursive: true, force: true });
await fs.mkdir(path.join(SCALE_TMP, "wiki", "coding"), { recursive: true });
await fs.mkdir(path.join(SCALE_TMP, "wiki", "emotions"), { recursive: true });
await fs.mkdir(path.join(SCALE_TMP, "wiki", "reading"), { recursive: true });
await fs.mkdir(path.join(SCALE_TMP, "wiki", "academic"), { recursive: true });
await fs.mkdir(path.join(SCALE_TMP, "wiki", "life"), { recursive: true });
await fs.writeFile(
  path.join(SCALE_TMP, "index.md"),
  "# 知识库索引\n> 最后更新：2026-07-23 · 总页数：0\n",
);
await fs.writeFile(path.join(SCALE_TMP, "log.md"), "");

// 5 domains × 10 tags, each page gets 1-3 tags + 1-2 domains → bucket size K≈10-30
const scaleDomains = ["coding", "emotions", "reading", "academic", "life"];
const scaleTagPool = [
  "python", "async", "testing", "stress", "focus",
  "books", "rust", "ml", "web", "cli",
];
for (let i = 0; i < SCALE_PAGE_COUNT; i++) {
  const domain = scaleDomains[i % scaleDomains.length];
  const slug = `scale-${String(i).padStart(4, "0")}`;
  const tagCount = (i % 3) + 1;
  const tags = [];
  for (let t = 0; t < tagCount; t++) {
    tags.push(scaleTagPool[(i + t) % scaleTagPool.length]);
  }
  const secondDomain = i % 5 === 0 ? `, ${scaleDomains[(i + 2) % 5]}` : "";
  const date = `2026-07-${String((i % 28) + 1).padStart(2, "0")}`;
  let fm = `---\n`;
  fm += `title: ${slug} Title\n`;
  fm += `domain: [${domain}${secondDomain}]\n`;
  fm += `type: concept\n`;
  fm += `status: active\n`;
  fm += `date: ${date}\n`;
  fm += `tags: [${tags.join(", ")}]\n`;
  fm += `---\n`;
  const body = `# ${slug} Title\n\nBody content ${i}.\n`;
  await fs.writeFile(path.join(SCALE_TMP, "wiki", domain, `${slug}.md`), fm + body);
}
console.log(`Generated ${SCALE_PAGE_COUNT} scale pages.`);

// Run scale measurements in a SUBPROCESS so config.ts captures
// KB_ROOT=SCALE_TMP at fresh module load. In-process `import("?t=...")`
// does NOT propagate the cache-busting query to the cached dist/config.js,
// so the scale runs would silently scan the 200-page fixture instead.
// The runner (dist/tests/lint-scale-runner.js) is compiled from the same
// source the test uses, keeping a single source of truth.
function runScale(iterations, checksEnv, label) {
  const wallStart = Date.now();
  const proc = spawnSync(process.execPath, ["dist/tests/lint-scale-runner.js"], {
    env: {
      ...process.env,
      KB_ROOT: SCALE_TMP,
      ITERATIONS: String(iterations),
      CHECKS: checksEnv ?? "",
    },
    encoding: "utf-8",
    timeout: 120000,
  });
  const wallMs = Date.now() - wallStart;
  if (proc.status !== 0) {
    console.error(`scale runner (${label}) failed:`, proc.stderr);
    process.exit(1);
  }
  const s = JSON.parse(proc.stdout.trim());
  return {
    name: label,
    iterations: s.iterations,
    p50: s.p50.toFixed(3),
    p95: s.p95.toFixed(3),
    p99: s.p99.toFixed(3),
    // Note: wallMs includes subprocess startup (~150-250ms), so throughput
    // is an end-to-end figure, slightly understating in-process QPS.
    throughput: ((s.iterations / wallMs) * 1000).toFixed(2),
    errorRate: s.error_rate.toFixed(4),
    wallMs,
  };
}

results.push(
  runScale(ITERATIONS, "missing_xref", "kb_lint (missing_xref only, 1000 pages)"),
);
results.push(
  runScale(ITERATIONS, "", "kb_lint (all checks, 1000 pages)"),
);

await fs.rm(SCALE_TMP, { recursive: true, force: true });

// --- Output report ---
console.log("\n=== Performance Baseline Report ===\n");
console.log("| Tool | Iterations | p50 (ms) | p95 (ms) | p99 (ms) | Throughput (QPS) | Error Rate |");
console.log("|---|---|---|---|---|---|---|");
for (const r of results) {
  console.log(
    `| ${r.name} | ${r.iterations} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.throughput} | ${r.errorRate} |`,
  );
}

// --- Cleanup ---
await fs.rm(TMP, { recursive: true, force: true });

console.log("\n✅ Performance baseline complete.");
process.exit(0);
