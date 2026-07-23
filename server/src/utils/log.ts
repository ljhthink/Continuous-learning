import { promises as fs } from "node:fs";
import { getLogFile } from "../config.js";
import { readFile } from "./fileio.js";

/**
 * Log.md parsing and appending utilities.
 *
 * Log format (AGENTS.md §4.4, ARCH.md §4.4):
 *   ## [YYYY-MM-DD] <type> | <title>
 *   - key: value
 *   - key: value
 *
 * Entries are separated by blank lines. The file is append-only.
 */

export interface LogEntry {
  date: string; // YYYY-MM-DD
  type: string; // ingest | query | lint | experience | init
  title: string;
  details: Record<string, string>;
}

const ENTRY_HEADER_RE = /^## \[(\d{4}-\d{2}-\d{2})\] (\w+) \| (.+)$/;
const DETAIL_RE = /^- (.+?): (.+)$/;

/** Parse all log entries from log.md content. */
export function parseLog(content: string): LogEntry[] {
  const entries: LogEntry[] = [];
  const lines = content.split("\n");
  let current: LogEntry | null = null;

  for (const line of lines) {
    const headerMatch = line.match(ENTRY_HEADER_RE);
    if (headerMatch) {
      if (current) entries.push(current);
      const [, date, type, title] = headerMatch;
      current = { date, type, title, details: {} };
    } else if (current && line.startsWith("- ")) {
      const detailMatch = line.match(DETAIL_RE);
      if (detailMatch) {
        const [, key, value] = detailMatch;
        current.details[key] = value;
      }
    }
  }

  if (current) entries.push(current);
  return entries;
}

/**
 * Sanitize a string for safe inclusion in a markdown log line.
 * Strips CR/LF to prevent log injection (CWE-117): an attacker who controls
 * `title` or a `details` value could otherwise forge a fake log entry by
 * embedding `"\n## [date] type | fake\n- key: value"`.
 *
 * `date` and `type` are system-controlled (validated enums / date format),
 * so they need no sanitization; only user-supplied fields pass through here.
 */
function sanitizeLogField(value: string): string {
  return value.replace(/[\r\n]/g, " ");
}

/** Append a log entry to log.md. Creates the file if it does not exist. */
export async function appendLogEntry(entry: LogEntry): Promise<void> {
  const safeTitle = sanitizeLogField(entry.title);
  const lines: string[] = [
    `## [${entry.date}] ${entry.type} | ${safeTitle}`,
  ];
  for (const [key, value] of Object.entries(entry.details)) {
    lines.push(`- ${sanitizeLogField(key)}: ${sanitizeLogField(value)}`);
  }
  // Leading newline separates from previous entry; trailing newline for spacing
  const block = "\n" + lines.join("\n") + "\n";
  await fs.appendFile(getLogFile(), block, "utf-8");
}

/** Read and parse recent log entries (newest first). */
export async function readRecentLog(
  limit = 10,
  typeFilter?: string
): Promise<LogEntry[]> {
  const content = await readFile(getLogFile());
  const entries = parseLog(content);

  const filtered = typeFilter
    ? entries.filter((e) => e.type === typeFilter)
    : entries;

  // Most recent first
  return filtered.slice(-limit).reverse();
}
