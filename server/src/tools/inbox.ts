/**
 * Inbox MCP tool handler (P4 Phase 4c):
 *   kb_list_inbox — list pending experience cards for GUI review.
 *
 * Scans `wiki/<domain>/experiences/inbox/*.md` for cards with
 * `status: pending`. Returns title/domain/confidence/source_task/body
 * for the ExperienceInbox component.
 */

import path from "node:path";
import { getKbRoot, getWikiDir } from "../config.js";
import { readFile, listMarkdownFiles } from "../utils/fileio.js";
import { parseFrontmatter } from "../utils/frontmatter.js";
import { jsonResult, errorResult } from "./helpers.js";
import type { ToolResult } from "./helpers.js";

export interface InboxCard {
  path: string;
  title: string;
  domain: string;
  confidence: number;
  source_task: string;
  status: string;
  body: string;
  preview: string;
}

/** Preview: first ~300 chars of body, truncated on character boundary. */
function previewFrom(body: string, maxChars = 300): string {
  const trimmed = body.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, maxChars) + "...";
}

export async function kbListInbox(args: {
  domain?: string;
}): Promise<ToolResult> {
  const kbRoot = getKbRoot();
  const wikiDir = getWikiDir();

  let domainDirs: string[] = [];
  if (args.domain) {
    domainDirs = [args.domain];
  } else {
    // Scan all domain directories under wiki/
    const fs = await import("node:fs");
    try {
      const entries = await fs.promises.readdir(wikiDir, {
        withFileTypes: true,
      });
      domainDirs = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => e.name);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("[kb-mcp] kb_list_inbox: readdir failed:", err);
      }
      return jsonResult({ cards: [] });
    }
  }

  const cards: InboxCard[] = [];

  for (const domain of domainDirs) {
    const inboxDir = path.join(wikiDir, domain, "experiences", "inbox");
    let files: string[] = [];
    try {
      files = await listMarkdownFiles(inboxDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(
          `[kb-mcp] kb_list_inbox: skipping unreadable ${inboxDir}:`,
          err,
        );
      }
      continue;
    }

    for (const absPath of files) {
      let content: string;
      try {
        content = await readFile(absPath);
      } catch (err) {
        console.error(
          `[kb-mcp] kb_list_inbox: skipping unreadable ${absPath}:`,
          err,
        );
        continue;
      }
      const { frontmatter, body } = parseFrontmatter(content);

      // Only list pending experience cards.
      if (frontmatter.status !== "pending") continue;
      if (frontmatter.type !== "experience") continue;

      const relPath = path
        .relative(kbRoot, absPath)
        .replace(/\\/g, "/")
        .replace(/\.md$/, "");

      const title =
        typeof frontmatter.title === "string"
          ? frontmatter.title
          : path.basename(absPath, ".md");
      const domains = Array.isArray(frontmatter.domain)
        ? frontmatter.domain.map(String)
        : [];
      const confidence =
        typeof frontmatter.confidence === "number"
          ? frontmatter.confidence
          : 0;
      const sourceTask =
        typeof frontmatter.source_task === "string"
          ? frontmatter.source_task
          : "";

      cards.push({
        path: relPath,
        title,
        domain: domains[0] ?? domain,
        confidence,
        source_task: sourceTask,
        status: "pending",
        body,
        preview: previewFrom(body),
      });
    }
  }

  // Sort by confidence descending (high-confidence cards first for review).
  cards.sort((a, b) => b.confidence - a.confidence);

  return jsonResult({ cards });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _errorResult = errorResult; // keep import for future error cases
