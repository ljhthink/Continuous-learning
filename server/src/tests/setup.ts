/**
 * Shared test utilities for MCP server unit tests (US-006).
 *
 * Each test file creates an isolated temp KB and sets KB_ROOT. config.ts now
 * resolves paths at call time (functions, not module-load consts), so a test
 * can set KB_ROOT in before() and have every tool pick it up immediately —
 * no subprocess workaround needed.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { dump } from "js-yaml";

export interface ParsedToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  [x: string]: unknown;
}

/** Create an empty temp KB with index.md, log.md, wiki/, raw/. Returns KB root path. */
export async function createTempKB(prefix = "kb-test"): Promise<string> {
  const tmp = path.join(
    os.tmpdir(),
    `${prefix}-${process.pid}-${Date.now().toString(36)}`,
  );
  await fs.mkdir(path.join(tmp, "wiki"), { recursive: true });
  await fs.mkdir(path.join(tmp, "raw"), { recursive: true });
  await fs.writeFile(
    path.join(tmp, "index.md"),
    "# 知识库索引\n> 最后更新：2026-07-22 · 总页数：0\n",
  );
  await fs.writeFile(path.join(tmp, "log.md"), "");
  return tmp;
}

/** Remove a temp KB directory. */
export async function cleanupKB(tmp: string): Promise<void> {
  await fs.rm(tmp, { recursive: true, force: true });
}

/** Write a wiki page with YAML frontmatter + body. relPath is relative to KB root. */
export async function writePage(
  kbRoot: string,
  relPath: string,
  frontmatter: Record<string, unknown>,
  body: string,
): Promise<void> {
  const fmText = dump(frontmatter, { lineWidth: -1 });
  const content = `---\n${fmText}---\n${body}`;
  const fullPath = path.join(kbRoot, relPath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content);
}

/** Write a raw file (no frontmatter). relPath is relative to KB root. */
export async function writeRawFile(
  kbRoot: string,
  relPath: string,
  content: string,
): Promise<void> {
  const fullPath = path.join(kbRoot, relPath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content);
}

/** Append a log entry to log.md. */
export async function appendLog(
  kbRoot: string,
  entry: {
    date: string;
    type: string;
    title: string;
    details: Record<string, string>;
  },
): Promise<void> {
  const heading = `## [${entry.date}] ${entry.type} | ${entry.title}`;
  const detailLines = Object.entries(entry.details).map(
    ([k, v]) => `- ${k}: ${v}`,
  );
  // MD022/MD032: blank line between heading and list. Mirrors production
  // appendLogEntry format so tests seeded via this helper stay lint-clean.
  const block =
    detailLines.length > 0
      ? `\n${heading}\n\n${detailLines.join("\n")}\n`
      : `\n${heading}\n`;
  await fs.appendFile(path.join(kbRoot, "log.md"), block);
}

/** Parse a ToolResult's text content as JSON. Returns any by default for test ergonomics. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseResult<T = any>(result: ParsedToolResult): T {
  return JSON.parse(result.content[0].text) as T;
}
