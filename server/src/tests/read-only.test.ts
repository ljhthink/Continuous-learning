/**
 * Unit tests for read-only tools (US-006):
 *   kb_health, kb_list_categories, kb_list_recent, kb_get_page
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  createTempKB,
  cleanupKB,
  writePage,
  appendLog,
  parseResult,
} from "./setup.js";

let tmp: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tools: any;

before(async () => {
  tmp = await createTempKB("kb-readonly");

  // Fixtures: 2 pages in coding, 1 in emotions, 1 hidden dir
  await writePage(
    tmp,
    "wiki/coding/async-patterns.md",
    {
      title: "Async Patterns",
      domain: ["coding"],
      type: "concept",
      status: "active",
      date: "2026-07-15",
      tags: ["python", "async"],
    },
    "# Async Patterns\nPython async/await patterns.\nSee [[emotion-regulation]] for stress.",
  );
  await writePage(
    tmp,
    "wiki/coding/testing-basics.md",
    {
      title: "Testing Basics",
      domain: ["coding"],
      type: "concept",
      status: "active",
      date: "2026-07-20",
    },
    "# Testing Basics\nUnit testing fundamentals.",
  );
  await writePage(
    tmp,
    "wiki/emotions/emotion-regulation.md",
    {
      title: "Emotion Regulation",
      domain: ["emotions"],
      type: "concept",
      status: "active",
      date: "2026-07-10",
    },
    "# Emotion Regulation\nTechniques for emotional control.",
  );
  // Hidden dir should be skipped by kb_list_categories
  await writePage(
    tmp,
    "wiki/_private/notes.md",
    { title: "Private", domain: ["_private"], type: "concept", status: "active", date: "2026-07-01" },
    "# Private\nShould not appear in categories.",
  );

  // Log entries
  await appendLog(tmp, {
    date: "2026-07-20",
    type: "ingest",
    title: "Testing Basics",
    details: { source: "raw/testing.md", wiki: "wiki/coding/testing-basics" },
  });
  await appendLog(tmp, {
    date: "2026-07-21",
    type: "lint",
    title: "Weekly check",
    details: {},
  });

  process.env.KB_ROOT = tmp;
  tools = {
    readOnly: await import("../tools/read-only.js"),
  };
});

after(async () => {
  await cleanupKB(tmp);
});

// ---------------------------------------------------------------------------
// kb_health
// ---------------------------------------------------------------------------

describe("kb_health", () => {
  it("returns total page count across all domains", async () => {
    const result = await tools.readOnly.kbHealth();
    const data = parseResult(result);
    // 3 visible pages (async-patterns, testing-basics, emotion-regulation) + 1 in _private
    // listMarkdownFiles walks all dirs including _private
    assert.equal(data.total_pages, 4);
    assert.equal(data.index_status, "ok");
  });

  it("reports last ingest and last lint from log", async () => {
    const result = await tools.readOnly.kbHealth();
    const data = parseResult(result);
    assert.match(data.last_ingest, /Testing Basics/);
    assert.match(data.last_lint, /Weekly check/);
  });

  it("returns missing index_status when index.md absent", async () => {
    const indexFile = path.join(tmp, "index.md");
    const backup = await fs.readFile(indexFile, "utf-8");
    await fs.unlink(indexFile);
    try {
      const result = await tools.readOnly.kbHealth();
      const data = parseResult(result);
      assert.equal(data.index_status, "missing");
    } finally {
      await fs.writeFile(indexFile, backup);
    }
  });
});

// ---------------------------------------------------------------------------
// kb_list_categories
// ---------------------------------------------------------------------------

describe("kb_list_categories", () => {
  it("lists domains excluding dot/underscore dirs", async () => {
    const result = await tools.readOnly.kbListCategories({});
    const data = parseResult(result);
    const names = data.categories.map((c: { name: string }) => c.name);
    assert.ok(names.includes("coding"));
    assert.ok(names.includes("emotions"));
    assert.ok(!names.includes("_private"));
  });

  it("includes stats when requested", async () => {
    const result = await tools.readOnly.kbListCategories({ include_stats: true });
    const data = parseResult(result);
    const coding = data.categories.find(
      (c: { name: string }) => c.name === "coding",
    );
    assert.equal(coding.page_count, 2);
    assert.equal(coding.last_update, "2026-07-20");
  });

  it("handles unquoted ISO date frontmatter as Date object (L-1)", async () => {
    // js-yaml parses unquoted `date: 2026-07-25` into a JavaScript Date object
    // (UTC midnight), not a string. Without normalizeDate(), the `as string`
    // type assertion would silently compare a Date's toString() against
    // "YYYY-MM-DD" strings, yielding wrong last_update. This test guards the
    // shared normalizeDate() path in kb_list_categories.
    await fs.writeFile(
      path.join(tmp, "wiki/coding/date-object-test.md"),
      "---\n" +
        "title: Date Object Test\n" +
        "domain: [coding]\n" +
        "type: concept\n" +
        "status: active\n" +
        "date: 2026-07-25\n" +
        "---\n# Date Object Test\n",
    );
    const result = await tools.readOnly.kbListCategories({ include_stats: true });
    const data = parseResult(result);
    const coding = data.categories.find(
      (c: { name: string }) => c.name === "coding",
    );
    // 2026-07-25 is newer than the existing 2026-07-20 fixture; if normalizeDate
    // fails to convert the Date object, last_update would be wrong.
    assert.equal(coding.last_update, "2026-07-25");
  });
});

// ---------------------------------------------------------------------------
// kb_list_recent
// ---------------------------------------------------------------------------

describe("kb_list_recent", () => {
  it("returns log entries newest first", async () => {
    const result = await tools.readOnly.kbListRecent({});
    const data = parseResult(result);
    assert.ok(data.entries.length >= 2);
    // Newest first: lint (07-21) before ingest (07-20)
    assert.equal(data.entries[0].type, "lint");
    assert.equal(data.entries[1].type, "ingest");
  });

  it("filters by type", async () => {
    const result = await tools.readOnly.kbListRecent({ type: "ingest" });
    const data = parseResult(result);
    assert.equal(data.entries.length, 1);
    assert.equal(data.entries[0].type, "ingest");
  });
});

// ---------------------------------------------------------------------------
// kb_get_page
// ---------------------------------------------------------------------------

describe("kb_get_page", () => {
  it("returns frontmatter, body, and extracted links", async () => {
    const result = await tools.readOnly.kbGetPage({
      path: "wiki/coding/async-patterns",
    });
    const data = parseResult(result);
    assert.equal(data.frontmatter.title, "Async Patterns");
    assert.match(data.body, /Python async\/await patterns/);
    assert.ok(data.links.includes("emotion-regulation"));
  });

  it("extracts a specific section", async () => {
    await writePage(
      tmp,
      "wiki/coding/sectioned.md",
      { title: "Sectioned", domain: ["coding"], type: "concept", status: "active", date: "2026-07-22" },
      "# Sectioned\nIntro.\n\n## Details\nDetail content.\n\n## Other\nOther content.\n",
    );
    const result = await tools.readOnly.kbGetPage({
      path: "wiki/coding/sectioned",
      section: "Details",
    });
    const data = parseResult(result);
    assert.match(data.body, /Detail content/);
    assert.doesNotMatch(data.body, /Other content/);
  });

  it("returns error for non-existent page", async () => {
    const result = await tools.readOnly.kbGetPage({
      path: "wiki/coding/nonexistent",
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /not found/i);
  });

  it("rejects path traversal", async () => {
    const result = await tools.readOnly.kbGetPage({
      path: "../../../etc/passwd",
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /traversal/i);
  });
});
