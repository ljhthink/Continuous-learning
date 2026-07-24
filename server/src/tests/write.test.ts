/**
 * Unit tests for write tools (US-006):
 *   kb_ingest_source, kb_write_experience, kb_promote_experience
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

// ---------------------------------------------------------------------------
// kb_promote_experience (DEF-007: reject log type regression)
// ---------------------------------------------------------------------------

describe("kb_promote_experience", () => {
  it("rejects an inbox card and logs with type 'reject' (DEF-007)", async () => {
    // 1. Create a pending card to reject.
    const writeResult = await tools.write.kbWriteExperience({
      title: "Card To Reject",
      domain: "coding",
      content: "## Background\nThis card will be rejected.",
      confidence: 0.6,
      source_task: "task-reject-001",
    });
    const writeData = parseResult(writeResult);

    // 2. Reject it via the review gate.
    const result = await tools.write.kbPromoteExperience({
      inbox_path: writeData.path,
      action: "reject",
    });
    const data = parseResult(result);
    assert.equal(data.status, "rejected");

    // 3. Verify frontmatter status flipped to rejected (page stays in inbox).
    const pagePath = path.join(tmp, writeData.path);
    const content = await fs.readFile(pagePath, "utf-8");
    assert.match(content, /status: rejected/);

    // 4. DEF-007 core assertion: log.md must record a `reject` entry, NOT an
    //    `experience` entry. Using "experience" here would collide with the
    //    original `## [date] experience | Card To Reject` write entry and
    //    trigger MD024 (duplicate heading) on the same day.
    const logContent = await fs.readFile(path.join(tmp, "log.md"), "utf-8");
    assert.match(
      logContent,
      /## \[\d{4}-\d{2}-\d{2}\] reject \| Card To Reject/,
    );
  });

  it("promotes an inbox card and logs with type 'promote'", async () => {
    // 1. Create a pending card to promote (confidence >= 0.8, single domain
    //    => tier=auto).
    const writeResult = await tools.write.kbWriteExperience({
      title: "Card To Promote",
      domain: "coding",
      content: "## Background\nThis card will be promoted.",
      confidence: 0.85,
      source_task: "task-promote-001",
    });
    const writeData = parseResult(writeResult);

    // 2. Promote it.
    const result = await tools.write.kbPromoteExperience({
      inbox_path: writeData.path,
      action: "promote",
    });
    const data = parseResult(result);
    assert.equal(data.status, "active");

    // 3. Verify log.md records a `promote` entry (not `experience`).
    const logContent = await fs.readFile(path.join(tmp, "log.md"), "utf-8");
    assert.match(
      logContent,
      /## \[\d{4}-\d{2}-\d{2}\] promote \| Card To Promote/,
    );
  });

  // -------------------------------------------------------------------------
  // ac-verifier supplementary tests (TKN-DEF-007-002)
  // -------------------------------------------------------------------------

  it("DEF-007: same-day create+reject produces no MD024 duplicate heading", async () => {
    // This test directly verifies the MD024 fix: when a card is created
    // (type="experience") and rejected (type="reject") on the same day, the
    // two log headings must differ in the type portion to avoid MD024
    // duplicate-heading detection (siblings_only mode).
    const writeResult = await tools.write.kbWriteExperience({
      title: "MD024 No Dup Test",
      domain: "coding",
      content: "## Background\nTesting MD024.",
      confidence: 0.6,
      source_task: "task-md024-001",
    });
    const writeData = parseResult(writeResult);

    // Reject on the same day as creation.
    await tools.write.kbPromoteExperience({
      inbox_path: writeData.path,
      action: "reject",
    });

    // Read log.md and extract all headings for this title.
    const logContent = await fs.readFile(path.join(tmp, "log.md"), "utf-8");
    const headings = logContent.match(/^## .+$/gm) || [];
    const titleHeadings = headings.filter((h) =>
      h.includes("MD024 No Dup Test"),
    );

    // There should be exactly 2 headings: one "experience" and one "reject".
    assert.equal(
      titleHeadings.length,
      2,
      "should have exactly 2 log entries for this title (create + reject)",
    );

    // All headings must be unique (no MD024 duplicate).
    const uniqueHeadings = new Set(titleHeadings);
    assert.equal(
      uniqueHeadings.size,
      2,
      "headings must be unique — MD024 duplicate heading detected",
    );

    // Verify one is "experience" (creation) and one is "reject" (rejection).
    assert.ok(
      titleHeadings.some((h) => /\] experience \|/.test(h)),
      "should have an 'experience' entry from card creation",
    );
    assert.ok(
      titleHeadings.some((h) => /\] reject \|/.test(h)),
      "should have a 'reject' entry from card rejection (DEF-007 fix)",
    );
  });

  it("DEF-007: reject updates frontmatter date to today", async () => {
    // Guardrail report identified a gap: existing reject test only verified
    // status, not date. Reject must update frontmatter.date to today
    // (write.ts:327), so the rejected card's date reflects when the
    // rejection decision was made, not the original creation date.
    const writeResult = await tools.write.kbWriteExperience({
      title: "Date Update On Reject",
      domain: "coding",
      content: "## Background\nTesting date update.",
      confidence: 0.6,
      source_task: "task-date-001",
    });
    const writeData = parseResult(writeResult);

    await tools.write.kbPromoteExperience({
      inbox_path: writeData.path,
      action: "reject",
    });

    // Verify frontmatter date was updated to today. js-yaml serializes ISO
    // dates with quotes (e.g. date: '2026-07-24'), so the regex must accept
    // optional surrounding quotes.
    const pagePath = path.join(tmp, writeData.path);
    const content = await fs.readFile(pagePath, "utf-8");
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    assert.match(content, new RegExp(`date: ['"]?${todayStr}['"]?`));
  });

  it("DEF-007: reject then promote is blocked (state machine)", async () => {
    // Guardrail suggested test: verify a rejected card cannot be promoted.
    // The state machine (write.ts:242-246) checks status === "pending";
    // a rejected card has status "rejected", so promote must fail.
    const writeResult = await tools.write.kbWriteExperience({
      title: "Reject Then Promote Blocked",
      domain: "coding",
      content: "## Background\nTesting state machine.",
      confidence: 0.6,
      source_task: "task-rp-001",
    });
    const writeData = parseResult(writeResult);

    // Step 1: Reject the card.
    const rejectResult = await tools.write.kbPromoteExperience({
      inbox_path: writeData.path,
      action: "reject",
    });
    assert.equal(parseResult(rejectResult).status, "rejected");

    // Step 2: Attempt to promote the already-rejected card.
    const promoteResult = await tools.write.kbPromoteExperience({
      inbox_path: writeData.path,
      action: "promote",
    });
    assert.equal(promoteResult.isError, true);
    assert.match(promoteResult.content[0].text, /expected "pending"/);
  });
});

// ---------------------------------------------------------------------------
// Integration: kb_list_recent type:"reject" cross-module filter (DEF-007)
// ---------------------------------------------------------------------------

describe("kb_list_recent type:reject integration (DEF-007)", () => {
  it("reject entries are queryable via type:'reject' and excluded from type:'experience'", async () => {
    // Cross-module integration test: write.ts (reject action) → log.ts
    // (appendLogEntry) → read-only.ts (kbListRecent typeFilter). Verifies
    // that reject entries are correctly typed and filterable.
    const { kbListRecent } = await import("../tools/read-only.js");

    // Create and reject a card to produce a "reject" log entry.
    const writeResult = await tools.write.kbWriteExperience({
      title: "Integration Reject Filter Test",
      domain: "coding",
      content: "## Background\nIntegration test.",
      confidence: 0.6,
      source_task: "task-int-reject-001",
    });
    const writeData = parseResult(writeResult);

    await tools.write.kbPromoteExperience({
      inbox_path: writeData.path,
      action: "reject",
    });

    // Query 1: type:"reject" must return exactly 1 entry for this title
    // (the reject action entry). Before DEF-007, this query would have
    // returned 0 entries because reject used type:"experience".
    const rejectResult = await kbListRecent({ type: "reject", limit: 50 });
    const rejectEntries = parseResult(rejectResult).entries.filter(
      (e: { title: string }) =>
        e.title === "Integration Reject Filter Test",
    );
    assert.equal(
      rejectEntries.length,
      1,
      "type:'reject' query must return exactly 1 entry for this title (the reject action)",
    );
    assert.equal(rejectEntries[0].type, "reject");

    // Query 2: type:"experience" must return exactly 1 entry for this title
    // (the creation entry from kbWriteExperience). Before DEF-007, this
    // query would have returned 2 entries (create + reject), because reject
    // also used type:"experience". After DEF-007, reject uses type:"reject",
    // so only the creation entry appears here.
    const experienceResult = await kbListRecent({
      type: "experience",
      limit: 50,
    });
    const experienceEntries = parseResult(experienceResult).entries.filter(
      (e: { title: string }) =>
        e.title === "Integration Reject Filter Test",
    );
    assert.equal(
      experienceEntries.length,
      1,
      "type:'experience' query must return exactly 1 entry for this title (creation only, not reject). " +
        "Before DEF-007, reject also used type:'experience', which would have produced 2 entries here.",
    );
  });
});
