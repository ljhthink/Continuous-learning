import path from "node:path";

/**
 * Knowledge base root directory.
 * Defaults to the parent of the server/ directory (project root).
 * Override with KB_ROOT environment variable for custom layouts.
 */
export const KB_ROOT = process.env.KB_ROOT
  ? path.resolve(process.env.KB_ROOT)
  : path.resolve(process.cwd(), "..");

/** Raw sources directory (immutable originals: PDF, Word, Excel). */
export const RAW_DIR = path.join(KB_ROOT, "raw");

/** Wiki directory (LLM-maintained markdown knowledge base). */
export const WIKI_DIR = path.join(KB_ROOT, "wiki");

/** Content index file (domain-grouped page listing). */
export const INDEX_FILE = path.join(KB_ROOT, "index.md");

/** Time log file (append-only event log). */
export const LOG_FILE = path.join(KB_ROOT, "log.md");

/** Server package version. */
export const SERVER_VERSION = "0.1.0";
