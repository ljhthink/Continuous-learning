/**
 * Unit tests for write tools (US-006):
 *   kb_ingest_source, kb_write_experience
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  createTempKB,
  cleanupKB,
  writePage,
  writeRawFile,
  parseResult,
} from "./setup.js";
import { promises as fs } from "node:fs";
import path from "node:path";

let tmp: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tools: any;

before(async () => {
  tmp = await createTempKB("kb-write");

  // Raw source file for ingest
  await writeRawFile(
    tmp,
    "raw/markdown/article.md",
    "# Original Article\nThis is the original content.\n",
  );

  process.env.KB_ROOT = tmp;
  tools = { write: await import("../tools/write.js") };
});

after(async () => {
  await cleanupKB(tmp);
});

// ---------------------------------------------------------------------------
// kb_ingest_source
// ---------------------------------------------------------------------------

describe("kb_ingest_source", () => {
  it("creates wiki page with staging status and updates index + log", async () => {
    const result = await tools.write.kbIngestSource({
      source_path: "raw/markdown/article.md",
      domain: "coding",
    });
    const data = parseResult(result);
    assert.equal(data.status, "staging");
    assert.match(data.wiki_path, /wiki\/coding\/article/);

    // Verify wiki page exists (wiki_path already includes .md)
    const pagePath = path.join(tmp, data.wiki_path);
    const content = await fs.readFile(pagePath, "utf-8");
    assert.match(content, /type: source/);
    assert.match(content, /status: staging/);
    assert.match(content, /source_file:/);
    assert.match(content, /Original Article/);

    // Verify index.md updated
    const indexContent = await fs.readFile(
      path.join(tmp, "index.md"),
      "utf-8",
    );
    assert.match(indexContent, /article/);

    // Verify log.md updated
    const logContent = await fs.readFile(path.join(tmp, "log.md"), "utf-8");
    assert.match(logContent, /ingest/);
    assert.match(logContent, /article/);
  });

  it("rejects non-markdown files", async () => {
    await writeRawFile(tmp, "raw/data.pdf", "fake pdf content");
    const result = await tools.write.kbIngestSource({
      source_path: "raw/data.pdf",
      domain: "coding",
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /\.pdf/);
  });

  it("rejects path traversal in source_path", async () => {
    const result = await tools.write.kbIngestSource({
      source_path: "../../../etc/passwd",
      domain: "coding",
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /traversal/i);
  });

  it("rejects non-existent source file", async () => {
    const result = await tools.write.kbIngestSource({
      source_path: "raw/nonexistent.md",
      domain: "coding",
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /not found/i);
  });

  it("rejects path traversal in domain parameter (S-1)", async () => {
    // Schema-level regex (schemas.ts) blocks this at the MCP layer, but the
    // runtime path.relative check in write.ts is defense-in-depth. We call
    // the handler directly (bypassing schema), so we exercise the runtime check.
    const result = await tools.write.kbIngestSource({
      source_path: "raw/markdown/article.md",
      domain: "../../../tmp",
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /traversal/i);
  });
});

// ---------------------------------------------------------------------------
// kb_write_experience
// ---------------------------------------------------------------------------

describe("kb_write_experience", () => {
  it("creates inbox page with pending status and updates log", async () => {
    const result = await tools.write.kbWriteExperience({
      title: "Test Experience Card",
      domain: "coding",
      content: "## Background\nSome context.\n\n## Solution\nDid X.",
      confidence: 0.85,
      source_task: "task-test-001",
    });
    const data = parseResult(result);
    assert.equal(data.status, "pending");
    assert.match(data.path, /experiences\/inbox\//);

    // Verify inbox page exists (data.path already includes .md)
    const pagePath = path.join(tmp, data.path);
    const content = await fs.readFile(pagePath, "utf-8");
    assert.match(content, /type: experience/);
    assert.match(content, /status: pending/);
    assert.match(content, /confidence: 0.85/);
    assert.match(content, /Some context/);

    // Verify log.md updated
    const logContent = await fs.readFile(path.join(tmp, "log.md"), "utf-8");
    assert.match(logContent, /experience/);
    assert.match(logContent, /Test Experience Card/);
  });

  it("rejects duplicate experience title", async () => {
    // First write succeeds
    await tools.write.kbWriteExperience({
      title: "Duplicate Experience",
      domain: "coding",
      content: "First.",
      confidence: 0.7,
      source_task: "task-dup-001",
    });
    // Second write with same title fails
    const result = await tools.write.kbWriteExperience({
      title: "Duplicate Experience",
      domain: "coding",
      content: "Second.",
      confidence: 0.7,
      source_task: "task-dup-002",
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /already exists/i);
  });

  it("rejects path traversal in domain parameter (S-1)", async () => {
    const result = await tools.write.kbWriteExperience({
      title: "Traversal Test",
      domain: "../../../tmp",
      content: "Should not be written.",
      confidence: 0.5,
      source_task: "task-traversal-001",
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /traversal/i);
  });
});
