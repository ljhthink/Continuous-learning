/**
 * Standalone subprocess runner for the L-2 1000-page scale sanity check.
 *
 * Spawned as a FRESH node process by lint-perf.test.ts (test 3) and by
 * perf-baseline.mjs (N=1000 section) so that config.ts captures KB_ROOT from
 * the subprocess env, NOT the parent process's already-cached value.
 *
 * In-process `import("../tools/lint.js?t=...")` does NOT work because the
 * cache-busting query string does not propagate to lint.ts's transitive
 * dependency config.js (which keeps the parent's cached KB_ROOT). A subprocess
 * is the only fix without refactoring config.ts to lazy-loading (deferred P3).
 *
 * Contract:
 *   env KB_ROOT (required) — path to a pre-built fixture KB.
 *   env ITERATIONS (optional, default "1") — number of kbLint runs to measure.
 *   env CHECKS (optional, e.g. "missing_xref") — comma-separated check list;
 *        if absent, run all checks ({}).
 *
 * stdout: a single JSON line:
 *   { iterations, pages_scanned, p50, p95, p99, error_rate, issues_first_run }
 * exit 0 on success, non-zero on error (stderr has details).
 *
 * Usage (test, via tsx against source):
 *   spawnSync(process.execPath, ["--import", "tsx", runnerPath],
 *             { env: { ...process.env, KB_ROOT: scaleTmp } })
 * Usage (perf, via compiled dist):
 *   spawnSync(process.execPath, ["dist/tests/lint-scale-runner.js"],
 *             { env: { ...process.env, KB_ROOT: SCALE_TMP, ITERATIONS: "50" } })
 */

import { kbLint } from "../tools/lint.js";

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

const iterations = Math.max(1, parseInt(process.env.ITERATIONS ?? "1", 10));
const checksEnv = process.env.CHECKS;
// env input is inherently string; cast through `never` to satisfy the
// `CheckName` union without importing the (private) type. Unknown check names
// are silently ignored by kbLint (lint.ts filters `requested` against the
// enabled set), so runtime safety is preserved.
const checks = checksEnv ? (checksEnv.split(",").filter(Boolean) as never) : undefined;

const latencies: number[] = [];
let errors = 0;
let pagesScanned = 0;
let issuesFirstRun = 0;

for (let i = 0; i < iterations; i++) {
  const t0 = process.hrtime.bigint();
  try {
    const result = await kbLint(checks ? { checks } : {});
    const t1 = process.hrtime.bigint();
    latencies.push(Number(t1 - t0) / 1e6);
    if (i === 0) {
      const data = JSON.parse(result.content[0].text);
      pagesScanned = data.summary?.pages_scanned ?? 0;
      issuesFirstRun = data.issues?.length ?? 0;
    }
  } catch (err) {
    errors++;
    if (i === 0) {
      console.error(
        `kbLint failed on first run: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  }
}

latencies.sort((a, b) => a - b);
process.stdout.write(
  JSON.stringify({
    iterations,
    pages_scanned: pagesScanned,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    error_rate: iterations > 0 ? errors / iterations : 0,
    issues_first_run: issuesFirstRun,
  }) + "\n",
);
