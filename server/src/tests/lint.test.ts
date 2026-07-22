/**
 * Unit tests for kb_lint (US-006).
 * Verifies all 5 checks fire correctly + exempt cases work.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createTempKB, cleanupKB, writePage, writeRawFile, parseResult } from "./setup.js";

let tmp: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tools: any;

before(async () => {
  tmp = await createTempKB("kb-lint");

  // Fixtures covering each check type:

  // source-old: source, older date, linked by ref-to-old (no stale)
  await writePage(
    tmp,
    "wiki/coding/source-old.md",
    { title: "Source Old", domain: ["coding"], type: "source", status: "active", date: "2026-07-01", source_file: "raw/old.md" },
    "# Source Old\nOriginal content from July 1.",
  );
  // source-new: source, newer date, linked by ref-to-new (triggers STALE on ref-to-new)
  await writePage(
    tmp,
    "wiki/coding/source-new.md",
    { title: "Source New", domain: ["coding"], type: "source", status: "active", date: "2026-07-20", source_file: "raw/new.md" },
    "# Source New\nUpdated content from July 20.",
  );
  // ref-to-old: concept, links to source-old, newer than source (NO stale)
  await writePage(
    tmp,
    "wiki/coding/ref-to-old.md",
    { title: "Ref To Old", domain: ["coding"], type: "concept", status: "active", date: "2026-07-15" },
    "# Ref To Old\nReferences [[source-old]].",
  );
  // ref-to-new: concept, links to source-new, older than source (STALE)
  await writePage(
    tmp,
    "wiki/coding/ref-to-new.md",
    { title: "Ref To New", domain: ["coding"], type: "concept", status: "active", date: "2026-07-10" },
    "# Ref To New\nReferences [[source-new]].",
  );
  // missing-fm: no frontmatter at all
  await writeRawFile(
    tmp,
    "wiki/coding/missing-fm.md",
    "# Missing Frontmatter\nThis page has no frontmatter.",
  );
  // bad-type: invalid type value
  await writePage(
    tmp,
    "wiki/coding/bad-type.md",
    { title: "Bad Type", domain: ["coding"], type: "unknown", status: "active", date: "2026-07-15" },
    "# Bad Type\nInvalid type.",
  );
  // bad-status: invalid status value
  await writePage(
    tmp,
    "wiki/coding/bad-status.md",
    { title: "Bad Status", domain: ["coding"], type: "concept", status: "weird", date: "2026-07-15" },
    "# Bad Status\nInvalid status.",
  );
  // contradiction: body has ⚠️ 矛盾 marker
  await writePage(
    tmp,
    "wiki/coding/contradiction.md",
    { title: "Contradiction Page", domain: ["coding"], type: "concept", status: "active", date: "2026-07-15" },
    "# Contradiction\n⚠️ 矛盾：新声明 A 与旧声明 B 冲突，待裁决。",
  );
  // dup-title-a/b: same title
  await writePage(
    tmp,
    "wiki/coding/dup-title-a.md",
    { title: "Same Title", domain: ["coding"], type: "concept", status: "active", date: "2026-07-15" },
    "# Dup A\nFirst duplicate.",
  );
  await writePage(
    tmp,
    "wiki/coding/dup-title-b.md",
    { title: "Same Title", domain: ["coding"], type: "entity", status: "active", date: "2026-07-15" },
    "# Dup B\nSecond duplicate.",
  );
  // orphan: no inbound links, not exempt
  await writePage(
    tmp,
    "wiki/coding/orphan.md",
    { title: "Orphan Page", domain: ["coding"], type: "concept", status: "active", date: "2026-07-15" },
    "# Orphan\nNobody links to me.",
  );
  // orphan-exempt: experience, confidence 0.9 (exempt from orphans)
  await writePage(
    tmp,
    "wiki/coding/orphan-exempt.md",
    { title: "Exempt Experience", domain: ["coding"], type: "experience", status: "active", date: "2026-07-15", confidence: 0.9, source_task: "task-001" },
    "# Exempt\nHigh-confidence experience.",
  );
  // tag-share-a/b: same domain, share tag [python], not cross-linked
  await writePage(
    tmp,
    "wiki/coding/tag-share-a.md",
    { title: "Tag Share A", domain: ["coding"], type: "concept", status: "active", date: "2026-07-15", tags: ["python"] },
    "# Tag Share A\nPython page A.",
  );
  await writePage(
    tmp,
    "wiki/coding/tag-share-b.md",
    { title: "Tag Share B", domain: ["coding"], type: "concept", status: "active", date: "2026-07-15", tags: ["python"] },
    "# Tag Share B\nPython page B.",
  );
  // pending-orphan: status=pending (skipped from orphans)
  await writePage(
    tmp,
    "wiki/coding/pending-orphan.md",
    { title: "Pending Page", domain: ["coding"], type: "experience", status: "pending", date: "2026-07-15", confidence: 0.5, source_task: "task-002" },
    "# Pending\nIn inbox.",
  );

  process.env.KB_ROOT = tmp;
  tools = { lint: await import("../tools/lint.js") };
});

after(async () => {
  await cleanupKB(tmp);
});

function hasIssueMatching(
  issues: Array<{ type: string; page: string }>,
  type: string,
  predicate: (i: { type: string; page: string }) => boolean,
): boolean {
  return issues.some((i) => i.type === type && predicate(i));
}

describe("kb_lint", () => {
  it("runs all checks and returns structured report", async () => {
    const result = await tools.lint.kbLint({});
    const data = parseResult(result);
    assert.ok(Array.isArray(data.issues));
    assert.ok(data.summary.total > 0);
    assert.ok(data.summary.pages_scanned > 0);
    assert.ok(Array.isArray(data.summary.checks_run));
  });

  it("frontmatter: detects missing fields", async () => {
    const result = await tools.lint.kbLint({ checks: ["frontmatter"] });
    const data = parseResult(result);
    assert.ok(
      hasIssueMatching(data.issues, "frontmatter", (i) => i.page.includes("missing-fm")),
    );
    assert.ok(
      hasIssueMatching(data.issues, "frontmatter", (i) => i.page.includes("bad-type")),
    );
    assert.ok(
      hasIssueMatching(data.issues, "frontmatter", (i) => i.page.includes("bad-status")),
    );
  });

  it("contradictions: detects marker and duplicate titles", async () => {
    const result = await tools.lint.kbLint({ checks: ["contradictions"] });
    const data = parseResult(result);
    assert.ok(
      hasIssueMatching(data.issues, "contradictions", (i) => i.page.includes("contradiction")),
    );
    assert.ok(
      hasIssueMatching(
        data.issues,
        "contradictions",
        (i) => i.page.includes("dup-title-a") && i.page.includes("dup-title-b"),
      ),
    );
  });

  it("orphans: flags orphans but exempts high-confidence experiences + pending", async () => {
    const result = await tools.lint.kbLint({ checks: ["orphans"] });
    const data = parseResult(result);
    // orphan.md IS flagged
    assert.ok(
      hasIssueMatching(data.issues, "orphans", (i) => i.page === "wiki/coding/orphan"),
    );
    // orphan-exempt NOT flagged (confidence >= 0.8)
    assert.ok(
      !hasIssueMatching(data.issues, "orphans", (i) => i.page.includes("orphan-exempt")),
    );
    // pending-orphan NOT flagged (status=pending)
    assert.ok(
      !hasIssueMatching(data.issues, "orphans", (i) => i.page.includes("pending-orphan")),
    );
    // source-old NOT flagged (has inbound link from ref-to-old)
    assert.ok(
      !hasIssueMatching(data.issues, "orphans", (i) => i.page.includes("source-old")),
    );
  });

  it("stale: flags linker older than source, skips older source", async () => {
    const result = await tools.lint.kbLint({ checks: ["stale"] });
    const data = parseResult(result);
    // ref-to-new flagged (source-new dated 07-20 > ref-to-new 07-10)
    assert.ok(
      hasIssueMatching(data.issues, "stale", (i) => i.page.includes("ref-to-new")),
    );
    // ref-to-old NOT flagged (source-old 07-01 < ref-to-old 07-15)
    assert.ok(
      !hasIssueMatching(data.issues, "stale", (i) => i.page.includes("ref-to-old")),
    );
  });

  it("missing_xref: flags same-domain tag-sharing unlinked pairs", async () => {
    const result = await tools.lint.kbLint({ checks: ["missing_xref"] });
    const data = parseResult(result);
    assert.ok(
      hasIssueMatching(
        data.issues,
        "missing_xref",
        (i) => i.page.includes("tag-share-a") && i.page.includes("tag-share-b"),
      ),
    );
  });

  it("runs only selected checks when checks param given", async () => {
    const result = await tools.lint.kbLint({ checks: ["frontmatter"] });
    const data = parseResult(result);
    // All issues should be frontmatter type only
    assert.ok(data.issues.length > 0);
    assert.ok(
      data.issues.every((i: { type: string }) => i.type === "frontmatter"),
    );
  });
});
