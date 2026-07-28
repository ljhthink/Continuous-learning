/**
 * Unit tests for P4 Phase 4b staging tools:
 *   kb_list_staging, kb_confirm_staging, kb_reject_staging
 *
 * Verifies the staging → active / staging → rejected state machine,
 * log.md appending, index header refresh, and path-traversal defense.
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
let staging: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let write: any;

before(async () => {
  tmp = await createTempKB("kb-staging");
  process.env.KB_ROOT = tmp;
  staging = await import("../tools/staging.js");
  write = await import("../tools/write.js");
});

after(async () => {
  await cleanupKB(tmp);
});

// ---------------------------------------------------------------------------
// kb_list_staging
// ---------------------------------------------------------------------------

describe("kb_list_staging", () => {
  it("returns empty list on a fresh KB", async () => {
    const result = await staging.kbListStaging({});
    const data = parseResult(result);
    assert.equal(data.pages.length, 0);
  });

  it("lists staging pages produced by kb_ingest_source", async () => {
    // Seed: one staging page in coding, one in design.
    await writeRawFile(
      tmp,
      "raw/markdown/staging-article-1.md",
      "# Staging Article 1\nContent for first staging article.\n",
    );
    await writeRawFile(
      tmp,
      "raw/markdown/staging-article-2.md",
      "# Staging Article 2\nContent for second staging article.\n",
    );

    await write.kbIngestSource({
      source_path: "raw/markdown/staging-article-1.md",
      domain: "coding",
    });
    await write.kbIngestSource({
      source_path: "raw/markdown/staging-article-2.md",
      domain: "design",
    });

    const result = await staging.kbListStaging({});
    const data = parseResult(result);
    assert.equal(data.pages.length, 2);

    const domains = data.pages.map((p: { domain: string }) => p.domain).sort();
    assert.deepEqual(domains, ["coding", "design"]);

    // Each page should carry staging metadata.
    for (const p of data.pages) {
      assert.equal(p.status, "staging");
      assert.match(p.path, /^wiki\/(coding|design)\/staging-article-/);
      assert.equal(typeof p.preview, "string");
      assert.ok(p.preview.length > 0);
    }
  });

  it("filters by domain when domain parameter is provided", async () => {
    const result = await staging.kbListStaging({ domain: "coding" });
    const data = parseResult(result);
    assert.equal(data.pages.length, 1);
    assert.equal(data.pages[0].domain, "coding");
  });

  it("excludes active pages (only status:staging returned)", async () => {
    // Manually flip one staging page to active.
    const codingPage = path.join(tmp, "wiki", "coding", "staging-article-1.md");
    let content = await fs.readFile(codingPage, "utf-8");
    content = content.replace("status: staging", "status: active");
    await fs.writeFile(codingPage, content);

    const result = await staging.kbListStaging({});
    const data = parseResult(result);
    assert.equal(data.pages.length, 1);
    assert.equal(data.pages[0].domain, "design");

    // Restore for downstream tests (re-flip to staging).
    content = await fs.readFile(codingPage, "utf-8");
    content = content.replace("status: active", "status: staging");
    await fs.writeFile(codingPage, content);
  });
});

// ---------------------------------------------------------------------------
// kb_confirm_staging
// ---------------------------------------------------------------------------

describe("kb_confirm_staging", () => {
  it("promotes staging → active and appends log entry", async () => {
    const pagePath = "wiki/coding/staging-article-1.md";
    const result = await staging.kbConfirmStaging({ page_path: pagePath });
    const data = parseResult(result);
    assert.equal(data.from_status, "staging");
    assert.equal(data.to_status, "active");

    // Verify frontmatter updated on disk.
    const content = await fs.readFile(path.join(tmp, pagePath), "utf-8");
    assert.match(content, /status: active/);

    // Verify log.md has a confirm entry.
    const logContent = await fs.readFile(path.join(tmp, "log.md"), "utf-8");
    assert.match(logContent, /\[.*\] confirm \|/);
    assert.match(logContent, /staging-article-1/);
  });

  it("rejects confirmation of a non-staging page (already active)", async () => {
    const pagePath = "wiki/coding/staging-article-1.md"; // now active
    const result = await staging.kbConfirmStaging({ page_path: pagePath });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /expected "staging"/i);
  });

  it("rejects path traversal", async () => {
    const result = await staging.kbConfirmStaging({
      page_path: "../../../etc/passwd",
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /traversal/i);
  });

  it("rejects non-existent page", async () => {
    const result = await staging.kbConfirmStaging({
      page_path: "wiki/coding/does-not-exist.md",
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /not found/i);
  });

  it("accepts page_path without .md extension", async () => {
    // Seed a fresh staging page for this test.
    await writeRawFile(
      tmp,
      "raw/markdown/no-ext-test.md",
      "# No Ext Test\nContent.\n",
    );
    await write.kbIngestSource({
      source_path: "raw/markdown/no-ext-test.md",
      domain: "coding",
    });
    // Path without .md extension.
    const result = await staging.kbConfirmStaging({
      page_path: "wiki/coding/no-ext-test",
    });
    const data = parseResult(result);
    assert.equal(data.to_status, "active");
  });
});

// ---------------------------------------------------------------------------
// kb_reject_staging
// ---------------------------------------------------------------------------

describe("kb_reject_staging", () => {
  it("marks staging → rejected and appends log entry", async () => {
    // Seed a fresh staging page.
    await writeRawFile(
      tmp,
      "raw/markdown/reject-test.md",
      "# Reject Test\nContent.\n",
    );
    await write.kbIngestSource({
      source_path: "raw/markdown/reject-test.md",
      domain: "design",
    });

    const pagePath = "wiki/design/reject-test.md";
    const result = await staging.kbRejectStaging({ page_path: pagePath });
    const data = parseResult(result);
    assert.equal(data.from_status, "staging");
    assert.equal(data.to_status, "rejected");

    // Verify frontmatter updated.
    const content = await fs.readFile(path.join(tmp, pagePath), "utf-8");
    assert.match(content, /status: rejected/);

    // Verify log.md has a reject entry.
    const logContent = await fs.readFile(path.join(tmp, "log.md"), "utf-8");
    assert.match(logContent, /\[.*\] reject \|/);
    assert.match(logContent, /reject-test/);
  });

  it("keeps the rejected file on disk (auditability)", async () => {
    const pagePath = "wiki/design/reject-test.md";
    const exists = await fs
      .access(path.join(tmp, pagePath))
      .then(() => true)
      .catch(() => false);
    assert.equal(exists, true);
  });

  it("rejects rejection of a non-staging page", async () => {
    // The page is now rejected — rejecting again should fail.
    const pagePath = "wiki/design/reject-test.md";
    const result = await staging.kbRejectStaging({ page_path: pagePath });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /expected "staging"/i);
  });

  it("rejects path traversal", async () => {
    const result = await staging.kbRejectStaging({
      page_path: "../../../../etc/shadow",
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /traversal/i);
  });
});

// ---------------------------------------------------------------------------
// Integration: list → confirm → list (verify state transitions)
// ---------------------------------------------------------------------------

describe("staging workflow integration", () => {
  it("list → confirm → list shows decreasing staging count", async () => {
    // Seed 2 fresh staging pages.
    await writeRawFile(
      tmp,
      "raw/markdown/integration-1.md",
      "# Integration 1\nContent.\n",
    );
    await writeRawFile(
      tmp,
      "raw/markdown/integration-2.md",
      "# Integration 2\nContent.\n",
    );
    await write.kbIngestSource({
      source_path: "raw/markdown/integration-1.md",
      domain: "coding",
    });
    await write.kbIngestSource({
      source_path: "raw/markdown/integration-2.md",
      domain: "coding",
    });

    // Initial list: at least 2 staging pages in coding.
    const before = parseResult(await staging.kbListStaging({ domain: "coding" }));
    const countBefore = before.pages.length;
    assert.ok(countBefore >= 2);

    // Confirm one.
    await staging.kbConfirmStaging({
      page_path: "wiki/coding/integration-1.md",
    });

    // After list: one fewer staging page.
    const after = parseResult(await staging.kbListStaging({ domain: "coding" }));
    assert.equal(after.pages.length, countBefore - 1);
  });
});
