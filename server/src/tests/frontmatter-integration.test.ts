/**
 * Integration + E2E tests for DEF-008 frontmatter format invariants across
 * all 5 serialization call sites (ADR-008 decision 1).
 *
 * Unit tests (frontmatter.test.ts) pin the format invariants on the pure
 * serializeFrontmatter function. These tests verify the invariants hold on
 * the REAL MCP tool call paths — the actual files written to disk by
 * kb_write_experience, kb_ingest_source, kb_promote_experience (promote +
 * reject), and kb_get_page (use_count writeback) must all match the
 * hand-written format.
 *
 * Acceptance criteria (ADR-008 decision 1):
 *   AC-4: 5 call sites produce consistent format
 *   AC-7: fixed-point stability across multiple writebacks (integration level)
 *
 * Plus extreme/edge scenarios:
 *   - Title containing YAML-special characters (colon)
 *   - Body starting with multiple blank lines
 *   - Body that is an empty string
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { promises as fs } from "node:fs";
import {
  createTempKB,
  cleanupKB,
  writePage,
  writeRawFile,
  parseResult,
} from "./setup.js";

/** Today's date string (YYYY-MM-DD, local time). */
function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Assert the 3 DEF-008 format invariants on raw file content.
 *   AC-1: Top-level arrays use single-line flow style (no block-style entries)
 *   AC-2: ISO date is unquoted
 *   AC-3: Blank line between closing --- and body (MD022)
 */
function assertFormatInvariants(content: string, label: string): void {
  // AC-1: flow-style arrays — block-style `  - item` entries must NOT appear.
  assert.doesNotMatch(
    content,
    /^domain:\r?\n\s*-\s/m,
    `${label}: domain must use flow style [xxx], not block style`
  );
  assert.match(
    content,
    /^domain: \[[^\]]*\]$/m,
    `${label}: domain must be single-line flow style`
  );

  // AC-2: ISO date unquoted — `date: '2026-07-24'` (quoted) must NOT appear.
  assert.doesNotMatch(
    content,
    /date:\s*['"]\d{4}-\d{2}-\d{2}['"]/,
    `${label}: date must be unquoted (date: 2026-07-24), not quoted`
  );
  assert.match(
    content,
    /^date: \d{4}-\d{2}-\d{2}$/m,
    `${label}: date must be present and unquoted`
  );

  // AC-3: blank line between closing --- and body (MD022).
  assert.match(
    content,
    /\r?\n---\r?\n\r?\n/,
    `${label}: blank line required between closing --- and body (MD022)`
  );
}

// ---------------------------------------------------------------------------
// AC-4 Call site 1: kb_write_experience
// ---------------------------------------------------------------------------

test("AC-4 site 1: kb_write_experience emits flow-style domain, unquoted date, blank-line body separator", async () => {
  const tmp = await createTempKB("fm-we");
  process.env.KB_ROOT = tmp;
  try {
    const { kbWriteExperience } = await import("../tools/write.js");
    const w = await kbWriteExperience({
      title: "Format Test",
      domain: "coding",
      content: "## Background\nSome content.",
      confidence: 0.85,
      source_task: "task-fmt-1",
    });
    const inboxPath = parseResult(w).path;
    const content = await fs.readFile(path.join(tmp, inboxPath), "utf-8");
    assertFormatInvariants(content, "kb_write_experience");
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

// ---------------------------------------------------------------------------
// AC-4 Call site 2: kb_ingest_source
// ---------------------------------------------------------------------------

test("AC-4 site 2: kb_ingest_source emits flow-style domain, unquoted date, blank-line body separator", async () => {
  const tmp = await createTempKB("fm-ig");
  process.env.KB_ROOT = tmp;
  try {
    const { kbIngestSource } = await import("../tools/write.js");
    await writeRawFile(tmp, "raw/test-source.md", "# Test Source\nBody text.");
    const r = await kbIngestSource({
      source_path: "raw/test-source.md",
      domain: "coding",
    });
    const wikiPath = parseResult(r).wiki_path;
    const content = await fs.readFile(path.join(tmp, wikiPath), "utf-8");
    assertFormatInvariants(content, "kb_ingest_source");
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

// ---------------------------------------------------------------------------
// AC-4 Call site 3: kb_promote_experience (promote)
// ---------------------------------------------------------------------------

test("AC-4 site 3: kb_promote_experience promote emits flow-style domain, unquoted date, blank-line body separator", async () => {
  const tmp = await createTempKB("fm-pr");
  process.env.KB_ROOT = tmp;
  try {
    const { kbWriteExperience, kbPromoteExperience } = await import(
      "../tools/write.js"
    );
    const w = await kbWriteExperience({
      title: "Promote Format",
      domain: "coding",
      content: "## Background\nContent.",
      confidence: 0.9,
      source_task: "task-fmt-3",
    });
    const p = await kbPromoteExperience({
      inbox_path: parseResult(w).path,
      action: "promote",
    });
    const activePath = parseResult(p).path;
    const content = await fs.readFile(path.join(tmp, activePath), "utf-8");
    assertFormatInvariants(content, "kb_promote_experience(promote)");
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

// ---------------------------------------------------------------------------
// AC-4 Call site 4: kb_promote_experience (reject)
// ---------------------------------------------------------------------------

test("AC-4 site 4: kb_promote_experience reject emits flow-style domain, unquoted date, blank-line body separator", async () => {
  const tmp = await createTempKB("fm-rj");
  process.env.KB_ROOT = tmp;
  try {
    const { kbWriteExperience, kbPromoteExperience } = await import(
      "../tools/write.js"
    );
    const w = await kbWriteExperience({
      title: "Reject Format",
      domain: "coding",
      content: "## Background\nContent.",
      confidence: 0.3,
      source_task: "task-fmt-4",
    });
    const inboxPath = parseResult(w).path;
    await kbPromoteExperience({
      inbox_path: inboxPath,
      action: "reject",
    });
    const content = await fs.readFile(path.join(tmp, inboxPath), "utf-8");
    assertFormatInvariants(content, "kb_promote_experience(reject)");
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

// ---------------------------------------------------------------------------
// AC-4 Call site 5: kb_get_page (use_count writeback) normalizes legacy format
// ---------------------------------------------------------------------------

test("AC-4 site 5: kb_get_page use_count writeback normalizes a legacy (block-style) page to DEF-008 format", async () => {
  const tmp = await createTempKB("fm-gp");
  process.env.KB_ROOT = tmp;
  try {
    const { kbGetPage } = await import("../tools/read-only.js");
    // Seed a page using setup.writePage, which uses the OLD js-yaml defaults
    // (block-style domain, quoted date, no blank line) — simulating a legacy
    // page written before DEF-008. The writeback must normalize all 3
    // invariants.
    await writePage(
      tmp,
      "wiki/coding/legacy.md",
      {
        title: "Legacy",
        domain: ["coding"],
        type: "concept",
        status: "active",
        date: todayStr(),
      },
      "legacy body\n"
    );
    await kbGetPage({ page_path: "wiki/coding/legacy" });
    const content = await fs.readFile(
      path.join(tmp, "wiki/coding/legacy.md"),
      "utf-8"
    );
    assertFormatInvariants(content, "kb_get_page(writeback)");
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

// ---------------------------------------------------------------------------
// AC-7 Integration-level fixed-point: kb_get_page writeback is idempotent
// ---------------------------------------------------------------------------

test("AC-7 integration: kb_get_page repeated writebacks reach a format fixed point (no drift)", async () => {
  const tmp = await createTempKB("fm-fp");
  process.env.KB_ROOT = tmp;
  try {
    const { kbGetPage } = await import("../tools/read-only.js");
    await writePage(
      tmp,
      "wiki/coding/fp.md",
      {
        title: "Fixed Point",
        domain: ["coding"],
        type: "concept",
        status: "active",
        date: todayStr(),
      },
      "stable body\n"
    );

    // Read 3 times — each triggers a use_count writeback via
    // serializeFrontmatter. The file content after the 2nd and 3rd reads
    // must be byte-identical (fixed point).
    await kbGetPage({ page_path: "wiki/coding/fp" });
    const after1 = await fs.readFile(
      path.join(tmp, "wiki/coding/fp.md"),
      "utf-8"
    );

    await kbGetPage({ page_path: "wiki/coding/fp" });
    const after2 = await fs.readFile(
      path.join(tmp, "wiki/coding/fp.md"),
      "utf-8"
    );

    await kbGetPage({ page_path: "wiki/coding/fp" });
    const after3 = await fs.readFile(
      path.join(tmp, "wiki/coding/fp.md"),
      "utf-8"
    );

    // Fixed point: rounds 2 and 3 identical (only use_count value differs).
    // Strip the use_count line to compare format + body stability.
    const stripUseCount = (s: string) =>
      s.replace(/^use_count:.*$/m, "use_count: N");
    assert.equal(
      stripUseCount(after1),
      stripUseCount(after2),
      "format+body must not drift between 1st and 2nd writeback"
    );
    assert.equal(
      stripUseCount(after2),
      stripUseCount(after3),
      "format+body must not drift between 2nd and 3rd writeback (fixed point)"
    );

    // And the fixed-point content satisfies all 3 invariants.
    assertFormatInvariants(after3, "kb_get_page(fixed-point)");
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

// ---------------------------------------------------------------------------
// E2E: full lifecycle write → get → promote → get, format consistent at each stage
// ---------------------------------------------------------------------------

test("AC-4 E2E: write experience → get page → promote → get page keeps frontmatter format consistent at every stage", async () => {
  const tmp = await createTempKB("fm-e2e");
  process.env.KB_ROOT = tmp;
  try {
    const { kbWriteExperience, kbPromoteExperience } = await import(
      "../tools/write.js"
    );
    const { kbGetPage } = await import("../tools/read-only.js");

    // Stage 1: write experience → inbox
    const w = await kbWriteExperience({
      title: "Lifecycle Card",
      domain: "coding",
      content: "## Background\nLifecycle content.",
      confidence: 0.88,
      source_task: "task-e2e",
    });
    const inboxPath = parseResult(w).path;
    const inboxContent = await fs.readFile(
      path.join(tmp, inboxPath),
      "utf-8"
    );
    assertFormatInvariants(inboxContent, "E2E stage 1 (write → inbox)");

    // Stage 2: get page (use_count writeback on inbox file)
    await kbGetPage({ page_path: inboxPath.replace(/\.md$/, "") });
    const inboxAfterGet = await fs.readFile(
      path.join(tmp, inboxPath),
      "utf-8"
    );
    assertFormatInvariants(
      inboxAfterGet,
      "E2E stage 2 (get page → inbox writeback)"
    );

    // Stage 3: promote → active
    const p = await kbPromoteExperience({
      inbox_path: inboxPath,
      action: "promote",
    });
    const activePath = parseResult(p).path;
    const activeContent = await fs.readFile(
      path.join(tmp, activePath),
      "utf-8"
    );
    assertFormatInvariants(activeContent, "E2E stage 3 (promote → active)");

    // Stage 4: get page (use_count writeback on active file)
    await kbGetPage({ page_path: activePath.replace(/\.md$/, "") });
    const activeAfterGet = await fs.readFile(
      path.join(tmp, activePath),
      "utf-8"
    );
    assertFormatInvariants(
      activeAfterGet,
      "E2E stage 4 (get page → active writeback)"
    );

    // Body content must survive the full lifecycle (trim isolates the
    // cosmetic leading blank line that serializeFrontmatter inserts).
    const { parseFrontmatter } = await import("../utils/frontmatter.js");
    const finalBody = parseFrontmatter(activeAfterGet).body;
    assert.ok(
      finalBody.includes("Lifecycle content."),
      "E2E: body content must survive write → get → promote → get lifecycle"
    );
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

// ---------------------------------------------------------------------------
// Extreme / edge scenarios
// ---------------------------------------------------------------------------

test("AC-1/2/3 edge: title with YAML-special colon character stays quoted, date stays unquoted, domain stays flow-style", async () => {
  const tmp = await createTempKB("fm-colon");
  process.env.KB_ROOT = tmp;
  try {
    const { kbWriteExperience } = await import("../tools/write.js");
    const w = await kbWriteExperience({
      title: "Note: Important Detail",
      domain: "coding",
      content: "## Body",
      confidence: 0.85,
      source_task: "task-colon",
    });
    const inboxPath = parseResult(w).path;
    const content = await fs.readFile(path.join(tmp, inboxPath), "utf-8");

    // Title with colon must stay quoted (js-yaml quotes it); date unquoted.
    assert.match(
      content,
      /^title: ['"].*Important Detail['"]/m,
      "title with colon must remain quoted"
    );
    // The 3 invariants still hold.
    assertFormatInvariants(content, "edge(colon-title)");
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

test("AC-3 edge: body starting with multiple blank lines collapses to exactly one blank line after ---", async () => {
  const tmp = await createTempKB("fm-blank");
  process.env.KB_ROOT = tmp;
  try {
    const { kbWriteExperience } = await import("../tools/write.js");
    const w = await kbWriteExperience({
      title: "Blank Body Start",
      domain: "coding",
      content: "\n\n\n## After Blanks",
      confidence: 0.85,
      source_task: "task-blank",
    });
    const inboxPath = parseResult(w).path;
    const content = await fs.readFile(path.join(tmp, inboxPath), "utf-8");

    // Exactly one blank line between --- and body, not four blank lines.
    assert.match(content, /---\r?\n\r?\n## After Blanks/);
    assert.doesNotMatch(content, /---\r?\n\r?\n\r?\n\r?\n## After Blanks/);
    assertFormatInvariants(content, "edge(multi-blank-body)");
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

test("AC-3 edge: empty body produces a valid file with blank line after --- and no crash", async () => {
  const tmp = await createTempKB("fm-empty");
  process.env.KB_ROOT = tmp;
  try {
    const { kbWriteExperience } = await import("../tools/write.js");
    const w = await kbWriteExperience({
      title: "Empty Body",
      domain: "coding",
      content: "",
      confidence: 0.85,
      source_task: "task-empty",
    });
    const inboxPath = parseResult(w).path;
    const content = await fs.readFile(path.join(tmp, inboxPath), "utf-8");

    // File ends with `---\n\n` (frontmatter + blank line + empty body).
    assert.match(content, /---\r?\n\r?\n$/);
    // The 3 invariants still hold (domain flow-style, date unquoted).
    assert.match(content, /^domain: \[coding\]$/m);
    assert.match(content, /^date: \d{4}-\d{2}-\d{2}$/m);
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

// ---------------------------------------------------------------------------
// AC-8 regression: kb_search retrieves DEF-008-formatted experience cards
// ---------------------------------------------------------------------------

test("AC-8 regression: kb_search retrieves a DEF-008-formatted experience card by title and body", async () => {
  const tmp = await createTempKB("fm-search");
  process.env.KB_ROOT = tmp;
  try {
    const { kbWriteExperience, kbPromoteExperience } = await import(
      "../tools/write.js"
    );
    const { kbSearch } = await import("../tools/search.js");

    // Write + promote so the card lives in experiences/ (indexed location).
    const w = await kbWriteExperience({
      title: "UniqueSearchableTitle",
      domain: "coding",
      content: "## Background\nThis card contains the token ZYXWVUTSRQ for search.",
      confidence: 0.9,
      source_task: "task-search",
    });
    await kbPromoteExperience({
      inbox_path: parseResult(w).path,
      action: "promote",
    });

    // Search by a unique body token — must find the card.
    const r1 = await kbSearch({ query: "ZYXWVUTSRQ" });
    const res1 = parseResult<{ results: Array<{ path: string; title: string }> }>(r1);
    assert.ok(
      res1.results.some((x) => x.title === "UniqueSearchableTitle"),
      "kb_search must find the DEF-008-formatted card by body content"
    );

    // Search by title — must also find it.
    const r2 = await kbSearch({ query: "UniqueSearchableTitle" });
    const res2 = parseResult<{ results: Array<{ path: string; title: string }> }>(r2);
    assert.ok(
      res2.results.some((x) => x.title === "UniqueSearchableTitle"),
      "kb_search must find the DEF-008-formatted card by title"
    );

    // Domain filter still works on flow-style domain: [coding].
    const r3 = await kbSearch({ query: "ZYXWVUTSRQ", domain: "coding" });
    const res3 = parseResult<{ results: Array<{ path: string; title: string }> }>(r3);
    assert.ok(res3.results.length > 0, "domain filter must work on flow-style domain");
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});
