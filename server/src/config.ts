import path from "node:path";

/**
 * Knowledge base configuration — resolved at CALL TIME, not module load time.
 *
 * Why functions instead of consts: a `const` captures `process.env.KB_ROOT`
 * once at first import, so tests that switch `KB_ROOT` per fixture had to
 * spawn subprocesses to force a fresh module load (see git history of
 * lint-perf.test.ts). Resolving on each call lets a test just set the env var
 * in `before()` and have every tool pick it up immediately. The cost is
 * negligible — each call is a few microseconds, dwarfed by the file I/O every
 * tool performs around it.
 *
 * Callers must NOT cache these values across operations that may follow a
 * `KB_ROOT` change; call the getter each time a path is needed.
 */

/**
 * Knowledge base root directory.
 * Defaults to the parent of the server/ directory (project root).
 * Override with KB_ROOT environment variable for custom layouts.
 */
export function getKbRoot(): string {
  return process.env.KB_ROOT
    ? path.resolve(process.env.KB_ROOT)
    : path.resolve(process.cwd(), "..");
}

/** Raw sources directory (immutable originals: PDF, Word, Excel). */
export function getRawDir(): string {
  return path.join(getKbRoot(), "raw");
}

/** Wiki directory (LLM-maintained markdown knowledge base). */
export function getWikiDir(): string {
  return path.join(getKbRoot(), "wiki");
}

/** Content index file (domain-grouped page listing). */
export function getIndexFile(): string {
  return path.join(getKbRoot(), "index.md");
}

/** Time log file (append-only event log). */
export function getLogFile(): string {
  return path.join(getKbRoot(), "log.md");
}

/** Server package version. */
export const SERVER_VERSION = "0.1.0";
