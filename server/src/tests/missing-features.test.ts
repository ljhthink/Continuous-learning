/**
 * Unit tests for P6 missing-features 补全
 * (docs/reports/2026-08-02-karpathy-implementation-analysis.md 缺失功能):
 *   - kb_write_answer (#16 Query 答案回写)
 *   - kb_organize_staging (#56 LLM 整理 staging)
 *   - auto-xref / runAutoXref (P3 Ingest 交叉引用)
 *   - checkMissingConcept (#24 缺失概念页检测)
 *
 * These four features were added without test coverage in the initial补全 pass;
 * this file closes that gap before ac-verifier acceptance (CLAUDE.md §7.2).
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tmp: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tools: any;

before(async () => {
  tmp = await createTempKB("kb-missing-features");
  process.env.KB_ROOT = tmp;
  tools = {
    write: await import("../tools/write.js"),
    staging: await import("../tools/staging.js"),
    lint: await import("../tools/lint.js"),
    xref: await import("../utils/xref.js"),
    pages: await import("../utils/pages.js"),
  };
});

after(async () => {
  await cleanupKB(tmp);
});

// ---------------------------------------------------------------------------
// kb_write_answer (#16 Query 答案回写)
// ---------------------------------------------------------------------------

describe("kb_write_answer", () => {
  it("creates inbox page with pending status, related=cited_pages, and log type=writeback", async () => {
    // Seed two cited pages so the answer can reference them.
    await writePage(
      tmp,
      "wiki/coding/page-a.md",
      {
        title: "Page A",
        domain: ["coding"],
        type: "concept",
        status: "active",
        date: "2026-07-01",
      },
      "# Page A\nContent about async patterns.",
    );
    await writePage(
      tmp,
      "wiki/coding/page-b.md",
      {
        title: "Page B",
        domain: ["coding"],
        type: "concept",
        status: "active",
        date: "2026-07-02",
      },
      "# Page B\nContent about event loops.",
    );

    const result = await tools.write.kbWriteAnswer({
      title: "Async Patterns Synthesis",
      domain: "coding",
      content:
        "## Background\nSynthesizing async patterns.\n\n## Synthesis\nPage A and Page B together show...",
      confidence: 0.8,
      source_query: "How do async patterns work?",
      cited_pages: ["wiki/coding/page-a", "wiki/coding/page-b"],
    });
    const data = parseResult(result);
    assert.equal(data.status, "pending");
    assert.match(data.path, /wiki\/coding\/experiences\/inbox\//);
    assert.match(data.source_task, /query-writeback:/);

    // Verify inbox page content.
    const pagePath = path.join(tmp, data.path);
    const content = await fs.readFile(pagePath, "utf-8");
    assert.match(content, /type: experience/);
    assert.match(content, /status: pending/);
    assert.match(content, /confidence: 0\.8/);
    // cited_pages → frontmatter.related (pure paths, ADR-008).
    assert.match(content, /related:/);
    assert.match(content, /wiki\/coding\/page-a/);
    assert.match(content, /wiki\/coding\/page-b/);

    // Verify log.md has a writeback entry (DEF-007 distinct type).
    const logContent = await fs.readFile(path.join(tmp, "log.md"), "utf-8");
    assert.match(logContent, /writeback/);
    assert.match(logContent, /Async Patterns Synthesis/);
  });

  it("rejects cited_pages < 2 (WRITEBACK-RAG Utility Gate, defense-in-depth)", async () => {
    // Call handler directly (bypassing Zod schema) to exercise runtime guard.
    const result = await tools.write.kbWriteAnswer({
      title: "Single Source Lookup",
      domain: "coding",
      content: "Should not be written — simple fact lookup.",
      confidence: 0.5,
      source_query: "What is page A?",
      cited_pages: ["wiki/coding/page-a"],
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /cited_pages/i);
    assert.match(result.content[0].text, />= 2|Utility Gate/i);
  });

  it("rejects path traversal in domain parameter (S-1)", async () => {
    const result = await tools.write.kbWriteAnswer({
      title: "Traversal Answer",
      domain: "../../../tmp",
      content: "Should not be written.",
      confidence: 0.5,
      source_query: "traversal test",
      cited_pages: ["wiki/coding/page-a", "wiki/coding/page-b"],
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /traversal/i);
  });

  it("rejects duplicate answer atomically via flag 'wx' (DEF-001)", async () => {
    const args = {
      title: "Duplicate Answer Card",
      domain: "coding",
      content: "First answer.",
      confidence: 0.7,
      source_query: "dup test",
      cited_pages: ["wiki/coding/page-a", "wiki/coding/page-b"],
    };
    const first = await tools.write.kbWriteAnswer(args);
    assert.equal(parseResult(first).status, "pending");
    const second = await tools.write.kbWriteAnswer(args);
    assert.equal(second.isError, true);
    assert.match(second.content[0].text, /already exists/i);
  });
});

// ---------------------------------------------------------------------------
// kb_organize_staging (#56 LLM 整理 staging)
// ---------------------------------------------------------------------------

describe("kb_organize_staging", () => {
  it("applies LLM-organized title/tags/description to a staging page + logs type=organize", async () => {
    // Seed a staging page (the LLM "organizes" it by passing refined metadata).
    await writePage(
      tmp,
      "wiki/coding/staging-doc.md",
      {
        title: "Staging Doc",
        domain: ["coding"],
        type: "source",
        status: "staging",
        date: "2026-07-01",
        source_file: "raw/doc.md",
      },
      "# Staging Doc\nOriginal body content that must NOT change.",
    );

    const result = await tools.staging.kbOrganizeStaging({
      page_path: "wiki/coding/staging-doc",
      title: "Refined Title by LLM",
      tags: ["python", "async", "context-manager"],
      description: "A one-line LLM-generated summary.",
    });
    const data = parseResult(result);
    assert.equal(data.status, "staging"); // still staging, not auto-confirmed
    assert.ok(data.updated_fields.includes("title"));
    assert.ok(data.updated_fields.includes("tags"));
    assert.ok(data.updated_fields.includes("description"));

    // Verify frontmatter updated.
    const content = await fs.readFile(
      path.join(tmp, "wiki/coding/staging-doc.md"),
      "utf-8",
    );
    assert.match(content, /Refined Title by LLM/);
    assert.match(content, /python/);
    assert.match(content, /context-manager/);
    assert.match(content, /description:/);
    // Body must NOT be modified.
    assert.match(content, /Original body content that must NOT change./);

    // Verify log entry.
    const logContent = await fs.readFile(path.join(tmp, "log.md"), "utf-8");
    assert.match(logContent, /organize/);
    assert.match(logContent, /Refined Title by LLM/);
  });

  it("rejects non-staging page (only staging can be LLM-organized)", async () => {
    await writePage(
      tmp,
      "wiki/coding/active-doc.md",
      {
        title: "Active Doc",
        domain: ["coding"],
        type: "concept",
        status: "active",
        date: "2026-07-01",
      },
      "# Active Doc\nAlready confirmed.",
    );
    const result = await tools.staging.kbOrganizeStaging({
      page_path: "wiki/coding/active-doc",
      title: "Should Fail",
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /staging/i);
  });

  it("rejects path traversal", async () => {
    const result = await tools.staging.kbOrganizeStaging({
      page_path: "../../../etc/passwd",
      title: "Traversal",
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /traversal/i);
  });

  it("rejects no-op call (no metadata fields provided)", async () => {
    const result = await tools.staging.kbOrganizeStaging({
      page_path: "wiki/coding/staging-doc",
      // Only domain_suggestion — not persisted, so this is a no-op.
      domain_suggestion: "emotions",
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /at least one/i);
  });
});

// ---------------------------------------------------------------------------
// auto-xref / runAutoXref (P3 Ingest 交叉引用)
// ---------------------------------------------------------------------------

describe("auto-xref (runAutoXref + findXrefCandidates)", () => {
  it("finds candidates by same-domain score (+4)", async () => {
    // Use an isolated sub-KB so we control exactly which pages are loaded.
    const xtmp = await createTempKB("kb-xref-domain");
    try {
      process.env.KB_ROOT = xtmp;
      // Candidate in same domain.
      await writePage(
        xtmp,
        "wiki/coding/existing.md",
        {
          title: "Existing Coding Page",
          domain: ["coding"],
          type: "concept",
          status: "active",
          date: "2026-07-01",
        },
        "# Existing Coding Page\nSome content.",
      );
      // Candidate in different domain (should NOT score +4, may fall below minScore).
      await writePage(
        xtmp,
        "wiki/emotions/other.md",
        {
          title: "Other Domain Page",
          domain: ["emotions"],
          type: "concept",
          status: "active",
          date: "2026-07-01",
        },
        "# Other Domain Page\nSome content.",
      );

      const allPages = await tools.pages.loadAllPages();
      const candidates = tools.xref.findXrefCandidates(
        {
          relPath: "wiki/coding/new-page",
          absPath: path.join(xtmp, "wiki/coding/new-page.md"),
          title: "New Page",
          domain: "coding",
          tags: [],
          body: "New page body.",
        },
        allPages,
      );
      // Same-domain page scores +4 (>= minScore 3); other-domain page scores 0.
      assert.ok(
        candidates.some((c: { path: string }) => c.path === "wiki/coding/existing"),
        "same-domain candidate should be found",
      );
      assert.ok(
        !candidates.some((c: { path: string }) => c.path === "wiki/emotions/other"),
        "other-domain candidate with no shared signals should NOT be found",
      );
    } finally {
      process.env.KB_ROOT = tmp;
      await cleanupKB(xtmp);
    }
  });

  it("finds candidates by shared tags (+2 each)", async () => {
    const xtmp = await createTempKB("kb-xref-tags");
    try {
      process.env.KB_ROOT = xtmp;
      await writePage(
        xtmp,
        "wiki/coding/tagged.md",
        {
          title: "Tagged Page",
          domain: ["coding"],
          type: "concept",
          status: "active",
          date: "2026-07-01",
          tags: ["python", "async"],
        },
        "# Tagged Page\nContent.",
      );
      const allPages = await tools.pages.loadAllPages();
      const candidates = tools.xref.findXrefCandidates(
        {
          relPath: "wiki/coding/new-tagged",
          absPath: path.join(xtmp, "wiki/coding/new-tagged.md"),
          title: "New Tagged Page",
          domain: "coding",
          tags: ["python", "async"],
          body: "Body.",
        },
        allPages,
      );
      // +4 (same domain) + +4 (2 shared tags, capped at +6 → +4) = high score.
      assert.ok(
        candidates.some((c: { path: string; score: number }) =>
          c.path === "wiki/coding/tagged" && c.score >= 6,
        ),
        "shared-tag candidate should be found with score >= 6",
      );
    } finally {
      process.env.KB_ROOT = tmp;
      await cleanupKB(xtmp);
    }
  });

  it("runAutoXref updates candidate body ## Related + frontmatter related, and new page related (双向链接)", async () => {
    const xtmp = await createTempKB("kb-xref-apply");
    try {
      process.env.KB_ROOT = xtmp;
      await writePage(
        xtmp,
        "wiki/coding/related-page.md",
        {
          title: "Related Page",
          domain: ["coding"],
          type: "concept",
          status: "active",
          date: "2026-07-01",
        },
        "# Related Page\nContent that mentions the topic.",
      );
      // New page file must exist on disk (runAutoXref writes related into it).
      await writePage(
        xtmp,
        "wiki/coding/new-page.md",
        {
          title: "New Page",
          domain: ["coding"],
          type: "source",
          status: "staging",
          date: "2026-08-02",
        },
        "# New Page\nNew content.",
      );

      const allPages = await tools.pages.loadAllPages();
      const result = await tools.xref.runAutoXref(
        {
          relPath: "wiki/coding/new-page",
          absPath: path.join(xtmp, "wiki/coding/new-page.md"),
          title: "New Page",
          domain: "coding",
          tags: [],
          body: "# New Page\nNew content.",
        },
        allPages,
      );
      assert.ok(result.touched.includes("wiki/coding/related-page"));

      // Candidate page should now have ## Related section + frontmatter related.
      const candidateContent = await fs.readFile(
        path.join(xtmp, "wiki/coding/related-page.md"),
        "utf-8",
      );
      assert.match(candidateContent, /## Related/);
      assert.match(candidateContent, /\[\[wiki\/coding\/new-page\]\]/);
      assert.match(candidateContent, /related:/);

      // New page frontmatter should have related pointing back to candidate.
      const newContent = await fs.readFile(
        path.join(xtmp, "wiki/coding/new-page.md"),
        "utf-8",
      );
      assert.match(newContent, /related:/);
      assert.match(newContent, /wiki\/coding\/related-page/);
    } finally {
      process.env.KB_ROOT = tmp;
      await cleanupKB(xtmp);
    }
  });

  it("is idempotent — re-running does not duplicate ## Related or frontmatter related", async () => {
    const xtmp = await createTempKB("kb-xref-idempotent");
    try {
      process.env.KB_ROOT = xtmp;
      await writePage(
        xtmp,
        "wiki/coding/cand.md",
        {
          title: "Candidate",
          domain: ["coding"],
          type: "concept",
          status: "active",
          date: "2026-07-01",
        },
        "# Candidate\nContent.",
      );
      await writePage(
        xtmp,
        "wiki/coding/new.md",
        {
          title: "New",
          domain: ["coding"],
          type: "source",
          status: "staging",
          date: "2026-08-02",
        },
        "# New\nContent.",
      );

      const newPageInfo = {
        relPath: "wiki/coding/new",
        absPath: path.join(xtmp, "wiki/coding/new.md"),
        title: "New",
        domain: "coding",
        tags: [],
        body: "# New\nContent.",
      };

      // First run touches the candidate.
      const allPages1 = await tools.pages.loadAllPages();
      const r1 = await tools.xref.runAutoXref(newPageInfo, allPages1);
      assert.ok(r1.touched.includes("wiki/coding/cand"));

      // Second run should skip (already linked) — touched empty, skipped populated.
      const allPages2 = await tools.pages.loadAllPages();
      const r2 = await tools.xref.runAutoXref(newPageInfo, allPages2);
      assert.equal(r2.touched.length, 0, "second run should not re-touch");
      assert.ok(
        r2.skipped.includes("wiki/coding/cand"),
        "candidate should be skipped as already-linked",
      );

      // Verify only ONE ## Related line for the new page in candidate body.
      const candidateContent = await fs.readFile(
        path.join(xtmp, "wiki/coding/cand.md"),
        "utf-8",
      );
      const linkCount = (
        candidateContent.match(/\[\[wiki\/coding\/new\]\]/g) || []
      ).length;
      assert.equal(linkCount, 1, "link should appear exactly once (idempotent)");
    } finally {
      process.env.KB_ROOT = tmp;
      await cleanupKB(xtmp);
    }
  });

  it("ingest with auto_xref touches related pages and logs type=xref", async () => {
    const xtmp = await createTempKB("kb-xref-ingest");
    try {
      process.env.KB_ROOT = xtmp;
      // Existing page in same domain — should be touched by auto-xref.
      await writePage(
        xtmp,
        "wiki/coding/existing.md",
        {
          title: "Existing",
          domain: ["coding"],
          type: "concept",
          status: "active",
          date: "2026-07-01",
        },
        "# Existing\nContent about coding.",
      );
      // Raw source to ingest.
      await writeRawFile(
        xtmp,
        "raw/markdown/new-article.md",
        "# New Article\nFresh content about coding.\n",
      );

      const result = await tools.write.kbIngestSource({
        source_path: "raw/markdown/new-article.md",
        domain: "coding",
      });
      const data = parseResult(result);
      assert.equal(data.status, "staging");
      // auto_xref defaults to true; xref summary should be present.
      assert.ok(data.xref, "xref summary should be present (auto_xref defaults true)");
      assert.ok(
        data.xref.touched.length >= 1,
        "at least one related page should be touched",
      );

      // Existing page should now reference the new article.
      const existingContent = await fs.readFile(
        path.join(xtmp, "wiki/coding/existing.md"),
        "utf-8",
      );
      assert.match(existingContent, /## Related/);

      // log.md should have an xref entry.
      const logContent = await fs.readFile(path.join(xtmp, "log.md"), "utf-8");
      assert.match(logContent, /xref/);
    } finally {
      process.env.KB_ROOT = tmp;
      await cleanupKB(xtmp);
    }
  });
});

// ---------------------------------------------------------------------------
// checkMissingConcept (#24 缺失概念页检测)
// ---------------------------------------------------------------------------

describe("checkMissingConcept (kb_lint missing_concept check)", () => {
  it("detects concept mentioned ≥5 times with no dedicated page (low severity)", async () => {
    const xtmp = await createTempKB("kb-missing-concept");
    try {
      process.env.KB_ROOT = xtmp;
      // Page with a heading "DeepConcept" that is NOT a page title anywhere.
      // Mention "DeepConcept" 5+ times across the body.
      await writePage(
        xtmp,
        "wiki/coding/discuss.md",
        {
          title: "Discussion Page",
          domain: ["coding"],
          type: "concept",
          status: "active",
          date: "2026-07-01",
        },
        [
          "# Discussion Page",
          "## DeepConcept",
          "We use DeepConcept here. DeepConcept is important.",
          "Again DeepConcept appears. DeepConcept helps with DeepConcept work.",
          "## Other Heading",
          "More text.",
        ].join("\n"),
      );

      const result = await tools.lint.kbLint({ checks: ["missing_concept"] });
      const data = parseResult(result);
      const conceptIssue = data.issues.find(
        (i: { type: string; page: string }) =>
          i.type === "missing_concept" && i.page === "DeepConcept",
      );
      assert.ok(conceptIssue, "DeepConcept should be flagged as missing concept");
      assert.equal(conceptIssue.severity, "low");
      assert.match(conceptIssue.detail, /5 times|times/);
    } finally {
      process.env.KB_ROOT = tmp;
      await cleanupKB(xtmp);
    }
  });

  it("does NOT report concepts that already have their own page", async () => {
    const xtmp = await createTempKB("kb-concept-exists");
    try {
      process.env.KB_ROOT = xtmp;
      // A page whose title IS the concept — so the concept "has its own page".
      await writePage(
        xtmp,
        "wiki/coding/haspage-concept.md",
        {
          title: "HasPageConcept",
          domain: ["coding"],
          type: "concept",
          status: "active",
          date: "2026-07-01",
        },
        "# HasPageConcept\nThis is the dedicated page.",
      );
      // Another page that mentions HasPageConcept 5+ times via heading + body.
      await writePage(
        xtmp,
        "wiki/coding/mentions.md",
        {
          title: "Mentions Page",
          domain: ["coding"],
          type: "concept",
          status: "active",
          date: "2026-07-01",
        },
        [
          "# Mentions Page",
          "## HasPageConcept",
          "HasPageConcept here. HasPageConcept there.",
          "HasPageConcept again. HasPageConcept once more. HasPageConcept finally.",
        ].join("\n"),
      );

      const result = await tools.lint.kbLint({ checks: ["missing_concept"] });
      const data = parseResult(result);
      const conceptIssue = data.issues.find(
        (i: { type: string; page: string }) => i.page === "HasPageConcept",
      );
      assert.ok(
        !conceptIssue,
        "HasPageConcept should NOT be flagged — it has its own page",
      );
    } finally {
      process.env.KB_ROOT = tmp;
      await cleanupKB(xtmp);
    }
  });

  it("is excluded when checks param omits missing_concept", async () => {
    const xtmp = await createTempKB("kb-concept-exclude");
    try {
      process.env.KB_ROOT = xtmp;
      await writePage(
        xtmp,
        "wiki/coding/discuss.md",
        {
          title: "Discussion",
          domain: ["coding"],
          type: "concept",
          status: "active",
          date: "2026-07-01",
        },
        [
          "# Discussion",
          "## ExcludedConcept",
          "ExcludedConcept x5: ExcludedConcept ExcludedConcept ExcludedConcept ExcludedConcept ExcludedConcept.",
        ].join("\n"),
      );

      // Run only frontmatter check — missing_concept must NOT appear.
      const result = await tools.lint.kbLint({ checks: ["frontmatter"] });
      const data = parseResult(result);
      assert.ok(
        !data.issues.some((i: { type: string }) => i.type === "missing_concept"),
        "missing_concept issues must not appear when checks excludes it",
      );
    } finally {
      process.env.KB_ROOT = tmp;
      await cleanupKB(xtmp);
    }
  });
});

// ---------------------------------------------------------------------------
// CLI registry completeness (DEFECT-1 regression guard)
// ---------------------------------------------------------------------------

describe("CLI registry completeness (DEFECT-1 regression)", () => {
  // DEFECT-1: kb_organize_staging was imported in cli.ts but omitted from
  // TOOL_REGISTRY / SCHEMA_REGISTRY, causing "Unknown tool" on CLI invocation.
  // This test ensures every tool registered in the MCP server (index.ts) also
  // has a matching entry in both CLI registries, so the CLI subprocess path
  // never silently drops a tool.

  it("TOOL_REGISTRY and SCHEMA_REGISTRY contain all new tools", async () => {
    const cli = await import("../cli.js");
    const expectedTools = [
      "kb_write_answer",
      "kb_organize_staging",
      "kb_ingest_source",
      "kb_lint",
      "kb_list_staging",
      "kb_confirm_staging",
      "kb_reject_staging",
    ];
    for (const name of expectedTools) {
      assert.ok(
        name in cli.TOOL_REGISTRY,
        `TOOL_REGISTRY missing "${name}" (DEFECT-1 regression)`,
      );
      assert.ok(
        name in cli.SCHEMA_REGISTRY,
        `SCHEMA_REGISTRY missing "${name}" (DEFECT-1 regression)`,
      );
    }
  });

  it("TOOL_REGISTRY and SCHEMA_REGISTRY keys are in sync", async () => {
    const cli = await import("../cli.js");
    const toolKeys = Object.keys(cli.TOOL_REGISTRY).sort();
    const schemaKeys = Object.keys(cli.SCHEMA_REGISTRY).sort();
    assert.deepEqual(
      toolKeys,
      schemaKeys,
      "TOOL_REGISTRY and SCHEMA_REGISTRY must have identical keys " +
        "(every CLI-invokable tool must have a schema for input validation)",
    );
  });
});

