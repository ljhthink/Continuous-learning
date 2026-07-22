/**
 * L-2 regression tests for the optimized checkMissingXref().
 *
 * The P1 implementation was O(N²) pairwise; P2 replaces it with an
 * O(N×K) inverted-bucket scan keyed by `${domain}::${tag}`. These tests
 * guard:
 *   1. Semantic equivalence — the same pairs are flagged as before.
 *   2. Dedup — pairs sharing multiple (domain, tag) buckets emit ONE issue.
 *   3. Scale sanity — 1000 pages complete well under the 2s PRD threshold.
 *
 * See: docs/reports/2026-07-22-p1-mcp-server-acceptance.md §5.5 (L-2 tech debt).
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createTempKB, cleanupKB, writePage, parseResult } from "./setup.js";

let tmp: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tools: any;

before(async () => {
  tmp = await createTempKB("kb-lint-perf");
  process.env.KB_ROOT = tmp;
  tools = { lint: await import("../tools/lint.js") };
});

after(async () => {
  await cleanupKB(tmp);
});

describe("kb_lint missing_xref (L-2 optimized)", () => {
  it("flags same-domain tag-sharing unlinked pairs (semantic equivalence)", async () => {
    // Use an isolated sub-KB by writing pages with distinct slugs.
    // a,b share domain=coding + tag=python → expect one missing_xref issue.
    // c has domain=emotions + tag=python → no shared domain with a/b → no issue.
    // d has domain=coding but no tags → skipped (tags.length === 0).
    // e has domain=coding + tag=rust, f has domain=coding + tag=rust → expect one issue.
    await writePage(
      tmp,
      "wiki/coding/perf-a.md",
      { title: "Perf A", domain: ["coding"], type: "concept", status: "active", date: "2026-07-15", tags: ["python"] },
      "# Perf A\nPython page A.",
    );
    await writePage(
      tmp,
      "wiki/coding/perf-b.md",
      { title: "Perf B", domain: ["coding"], type: "concept", status: "active", date: "2026-07-15", tags: ["python"] },
      "# Perf B\nPython page B.",
    );
    await writePage(
      tmp,
      "wiki/emotions/perf-c.md",
      { title: "Perf C", domain: ["emotions"], type: "concept", status: "active", date: "2026-07-15", tags: ["python"] },
      "# Perf C\nPython page in emotions.",
    );
    await writePage(
      tmp,
      "wiki/coding/perf-d.md",
      { title: "Perf D", domain: ["coding"], type: "concept", status: "active", date: "2026-07-15" },
      "# Perf D\nNo tags.",
    );
    await writePage(
      tmp,
      "wiki/coding/perf-e.md",
      { title: "Perf E", domain: ["coding"], type: "concept", status: "active", date: "2026-07-15", tags: ["rust"] },
      "# Perf E\nRust page.",
    );
    await writePage(
      tmp,
      "wiki/coding/perf-f.md",
      { title: "Perf F", domain: ["coding"], type: "concept", status: "active", date: "2026-07-15", tags: ["rust"] },
      "# Perf F\nRust page.",
    );

    const result = await tools.lint.kbLint({ checks: ["missing_xref"] });
    const data = parseResult<{
      issues: Array<{ type: string; page: string; detail: string }>;
    }>(result);

    // Expect exactly two missing_xref issues:
    //   1. perf-a ↔ perf-b  (coding::python bucket)
    //   2. perf-e ↔ perf-f  (coding::rust bucket)
    // perf-c shares tag=python with a/b but no shared domain → not flagged.
    // perf-d has no tags → skipped.
    const xrefIssues = data.issues.filter((i) => i.type === "missing_xref");
    assert.equal(xrefIssues.length, 2, "expected exactly 2 missing_xref issues");

    const pages = xrefIssues.map((i) => i.page).sort();
    assert.ok(
      pages.some((p) => p.includes("perf-a") && p.includes("perf-b")),
      "expected perf-a ↔ perf-b issue",
    );
    assert.ok(
      pages.some((p) => p.includes("perf-e") && p.includes("perf-f")),
      "expected perf-e ↔ perf-f issue",
    );

    // No issue should involve perf-c (different domain) or perf-d (no tags)
    for (const issue of xrefIssues) {
      assert.ok(!issue.page.includes("perf-c"), "perf-c must not be flagged");
      assert.ok(!issue.page.includes("perf-d"), "perf-d must not be flagged");
    }
  });

  it("deduplicates pairs sharing multiple (domain, tag) buckets", async () => {
    // g,h share TWO (domain, tag) combos: coding::python AND coding::async.
    // The O(N×K) scan visits both buckets but seenPairs must collapse to ONE issue.
    await writePage(
      tmp,
      "wiki/coding/perf-g.md",
      { title: "Perf G", domain: ["coding"], type: "concept", status: "active", date: "2026-07-15", tags: ["python", "async"] },
      "# Perf G\nPython + async.",
    );
    await writePage(
      tmp,
      "wiki/coding/perf-h.md",
      { title: "Perf H", domain: ["coding"], type: "concept", status: "active", date: "2026-07-15", tags: ["python", "async"] },
      "# Perf H\nPython + async.",
    );

    const result = await tools.lint.kbLint({ checks: ["missing_xref"] });
    const data = parseResult<{ issues: Array<{ type: string; page: string }> }>(result);

    const ghIssues = data.issues.filter(
      (i) =>
        i.type === "missing_xref" &&
        i.page.includes("perf-g") &&
        i.page.includes("perf-h"),
    );
    assert.equal(ghIssues.length, 1, "pair sharing multiple buckets must emit exactly one issue");
  });

  it("completes 1000-page scan well under 2s PRD threshold (scale sanity)", async () => {
    // Build an isolated 1000-page fixture in a fresh temp KB to avoid
    // contamination from the correctness fixtures above. 5 domains × 10 tags
    // Cartesian product gives buckets of size ~10 (1000 / (5*10) * avg 1.5
    // tags * 1.5 domains), so K ≈ 10-20 — the regime where O(N×K) beats O(N²).
    const scaleTmp = await createTempKB("kb-lint-perf-scale");
    const domains = ["coding", "emotions", "reading", "academic", "life"];
    const tagPool = [
      "python", "async", "testing", "stress", "focus",
      "books", "rust", "ml", "web", "cli",
    ];
    for (let i = 0; i < 1000; i++) {
      const domain = domains[i % domains.length];
      const slug = `scale-${String(i).padStart(4, "0")}`;
      // Assign 1-3 tags and 1-2 domains to create realistic bucket sizes.
      const tagCount = (i % 3) + 1;
      const tags = [];
      for (let t = 0; t < tagCount; t++) {
        tags.push(tagPool[(i + t) % tagPool.length]);
      }
      const secondDomain = i % 5 === 0 ? ["reading"] : [];
      const date = `2026-07-${String((i % 28) + 1).padStart(2, "0")}`;
      await writePage(
        scaleTmp,
        `wiki/${domain}/${slug}.md`,
        {
          title: `${slug} Title`,
          domain: [domain, ...secondDomain],
          type: "concept",
          status: "active",
          date,
          tags,
        },
        `# ${slug} Title\n\nBody content ${i}.`,
      );
    }

    // Spawn a SUBPROCESS so config.ts captures KB_ROOT=scaleTmp at fresh module
    // load. In-process `import("?t=...")` does NOT propagate the cache-busting
    // query to lint.ts's transitive dependency config.js, which keeps the
    // parent's cached KB_ROOT (the 8-page fixture from before()) — causing
    // pages_scanned === 8. A subprocess is the only fix without refactoring
    // config.ts to lazy-loading (deferred to P3). See lint-scale-runner.ts.
    const runnerPath = fileURLToPath(
      new URL("./lint-scale-runner.ts", import.meta.url),
    );
    // Run 9 iterations and assert on the MEDIAN (p50), not a single-sample
    // p95. The scale run is I/O-bound (loading 1000 files dominates, ~860ms),
    // so the O(N×K) algorithm's edge over O(N²) (~180ms algo delta) is narrow.
    // A median of 9 suppresses parallel-load outliers — guardrail M-1 found a
    // single-sample p95=1044ms flake under concurrent build+test. O(N²) would
    // push the median past ~1060ms > 1000, so the 1000ms ceiling still catches
    // regressions while the median stays stable at ~860ms.
    const proc = spawnSync(process.execPath, ["--import", "tsx", runnerPath], {
      env: { ...process.env, KB_ROOT: scaleTmp, ITERATIONS: "9" },
      encoding: "utf-8",
      timeout: 30000,
    });
    assert.equal(
      proc.status,
      0,
      `runner exited ${proc.status}: ${proc.stderr ?? "(no stderr)"}`,
    );

    const stats = JSON.parse(proc.stdout.trim());
    assert.equal(stats.pages_scanned, 1000, "should scan all 1000 pages");
    assert.equal(stats.iterations, 9, "runner should report 9 iterations");

    // L-2 acceptance: median of 9 runs at N=1000 must finish under 1s. The
    // PRD US-006 hard threshold is 2s; we use a tighter 1s ceiling on the
    // median to catch O(N²) regressions (which would push the median to
    // ~1060ms) while remaining stable against I/O jitter.
    assert.ok(
      stats.p50 < 1000,
      `1000-page missing_xref scan p50=${stats.p50.toFixed(2)}ms, expected < 1000ms`,
    );

    await cleanupKB(scaleTmp);
  });
});
