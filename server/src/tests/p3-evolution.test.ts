/**
 * P3 continuous-evolution tests:
 *   - config dynamic resolution (lazy-load root-cause fix)
 *   - kb_get_page use_count increment + writeback (body preserved)
 *   - kb_promote_experience two-tier review gate (promote auto/manual, reject)
 *   - /dream aging pass (use_count=0 + old-date → archived)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { promises as fs } from "node:fs";
import {
  createTempKB,
  cleanupKB,
  writePage,
  parseResult,
} from "./setup.js";

/** Date string (YYYY-MM-DD, local time) N days before today. */
function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today's date string (local time). */
function todayStr(): string {
  return daysAgo(0);
}

// ---------------------------------------------------------------------------
// config dynamic resolution
// ---------------------------------------------------------------------------

test("config: getKbRoot reflects a runtime KB_ROOT change without reimport", async () => {
  const tmp1 = await createTempKB("cfg1");
  const tmp2 = await createTempKB("cfg2");
  try {
    process.env.KB_ROOT = tmp1;
    const { getKbRoot } = await import("../config.js");
    assert.equal(getKbRoot(), path.resolve(tmp1));

    // Switch KB_ROOT in the SAME process — the old const design would have
    // kept returning tmp1; the function design must pick up tmp2.
    process.env.KB_ROOT = tmp2;
    assert.equal(
      getKbRoot(),
      path.resolve(tmp2),
      "getKbRoot() must reflect the new KB_ROOT without a reimport"
    );
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp1);
    await cleanupKB(tmp2);
  }
});

// ---------------------------------------------------------------------------
// kb_get_page use_count
// ---------------------------------------------------------------------------

test("kb_get_page: increments use_count and persists across calls", async () => {
  const tmp = await createTempKB("uc");
  process.env.KB_ROOT = tmp;
  try {
    const { kbGetPage } = await import("../tools/read-only.js");
    await writePage(
      tmp,
      "wiki/coding/foo.md",
      {
        title: "Foo",
        domain: ["coding"],
        type: "concept",
        status: "active",
        date: todayStr(),
      },
      "body text\n"
    );

    const r1 = await kbGetPage({ path: "wiki/coding/foo" });
    assert.equal(parseResult(r1).frontmatter.use_count, 1);

    const r2 = await kbGetPage({ path: "wiki/coding/foo" });
    assert.equal(parseResult(r2).frontmatter.use_count, 2);

    // Body preserved (writeback must not truncate). DEF-008 changed
    // serializeFrontmatter to insert a blank line between the closing `---`
    // and the body (MD022), so after the first writeback the parsed body
    // carries a leading newline. trim() isolates the content-comparison
    // intent from that cosmetic leading blank line.
    assert.equal(parseResult(r2).body.trim(), "body text");
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

test("kb_get_page: section read writes back the FULL body, not the truncated view", async () => {
  const tmp = await createTempKB("uc-sec");
  process.env.KB_ROOT = tmp;
  try {
    const { kbGetPage } = await import("../tools/read-only.js");
    await writePage(
      tmp,
      "wiki/coding/sec.md",
      {
        title: "Sec",
        domain: ["coding"],
        type: "concept",
        status: "active",
        date: todayStr(),
      },
      "## A\nalpha\n\n## B\nbeta\n"
    );

    // Read only section B
    await kbGetPage({ path: "wiki/coding/sec", section: "B" });

    // Re-read full page — body must be intact, not truncated to section B
    const full = await kbGetPage({ path: "wiki/coding/sec" });
    const body = parseResult(full).body;
    assert.ok(body.includes("## A"), "section A must survive a section-B read");
    assert.ok(body.includes("alpha"));
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

// ---------------------------------------------------------------------------
// kb_promote_experience
// ---------------------------------------------------------------------------

test("kb_promote_experience: promote high-confidence → active, tier=auto, inbox removed", async () => {
  const tmp = await createTempKB("prom");
  process.env.KB_ROOT = tmp;
  try {
    const { kbWriteExperience, kbPromoteExperience } = await import("../tools/write.js");
    const { fileExists } = await import("../utils/fileio.js");

    const w = await kbWriteExperience({
      title: "High Conf",
      domain: "coding",
      content: "## Background\n...",
      confidence: 0.9,
      source_task: "task-1",
    });
    const inboxPath = parseResult(w).path;

    const p = await kbPromoteExperience({
      inbox_path: inboxPath,
      action: "promote",
    });
    const res = parseResult(p);
    assert.equal(res.status, "active");
    assert.equal(res.tier, "auto");
    assert.match(res.path, /^wiki\/coding\/experiences\/high-conf\.md$/);

    // inbox file removed; active file exists
    assert.equal(await fileExists(path.join(tmp, inboxPath)), false);
    assert.equal(await fileExists(path.join(tmp, res.path)), true);
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

test("kb_promote_experience: promote low-confidence → active, tier=manual", async () => {
  const tmp = await createTempKB("prom-low");
  process.env.KB_ROOT = tmp;
  try {
    const { kbWriteExperience, kbPromoteExperience } = await import("../tools/write.js");
    const w = await kbWriteExperience({
      title: "Low Conf",
      domain: "coding",
      content: "...",
      confidence: 0.5,
      source_task: "task-2",
    });
    const p = await kbPromoteExperience({
      inbox_path: parseResult(w).path,
      action: "promote",
    });
    const res = parseResult(p);
    assert.equal(res.status, "active");
    assert.equal(res.tier, "manual");
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

test("kb_promote_experience: reject → status=rejected, file kept in inbox", async () => {
  const tmp = await createTempKB("rej");
  process.env.KB_ROOT = tmp;
  try {
    const { kbWriteExperience, kbPromoteExperience } = await import("../tools/write.js");
    const { fileExists, readFile } = await import("../utils/fileio.js");
    const { parseFrontmatter } = await import("../utils/frontmatter.js");

    const w = await kbWriteExperience({
      title: "Reject Me",
      domain: "coding",
      content: "...",
      confidence: 0.3,
      source_task: "task-3",
    });
    const inboxPath = parseResult(w).path;

    const p = await kbPromoteExperience({
      inbox_path: inboxPath,
      action: "reject",
    });
    const res = parseResult(p);
    assert.equal(res.status, "rejected");

    // file still exists, frontmatter status=rejected
    assert.equal(await fileExists(path.join(tmp, inboxPath)), true);
    const content = await readFile(path.join(tmp, inboxPath));
    assert.equal(parseFrontmatter(content).frontmatter.status, "rejected");
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

test("kb_promote_experience: refuses non-experience page (state-machine guard)", async () => {
  const tmp = await createTempKB("prom-type");
  process.env.KB_ROOT = tmp;
  try {
    const { kbPromoteExperience } = await import("../tools/write.js");
    // A concept page (type !== experience) placed in the inbox location —
    // promote must refuse rather than move non-experience content.
    await writePage(
      tmp,
      "wiki/coding/experiences/inbox/not-an-experience.md",
      {
        title: "Not An Experience",
        domain: ["coding"],
        type: "concept",
        status: "pending",
        date: todayStr(),
      },
      "body\n"
    );
    const p = await kbPromoteExperience({
      inbox_path: "wiki/coding/experiences/inbox/not-an-experience",
      action: "promote",
    });
    assert.equal(p.isError, true);
    assert.match(p.content[0].text, /expected "experience"/);
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

test("kb_promote_experience: refuses non-pending experience (state-machine guard)", async () => {
  const tmp = await createTempKB("prom-status");
  process.env.KB_ROOT = tmp;
  try {
    const { kbPromoteExperience } = await import("../tools/write.js");
    // An already-active experience (status !== pending) — must not be
    // re-promoted or re-rejected, which would corrupt the state machine.
    await writePage(
      tmp,
      "wiki/coding/experiences/inbox/already-active.md",
      {
        title: "Already Active",
        domain: ["coding"],
        type: "experience",
        status: "active",
        confidence: 0.9,
        date: todayStr(),
        source_task: "t",
      },
      "body\n"
    );
    const p = await kbPromoteExperience({
      inbox_path: "wiki/coding/experiences/inbox/already-active",
      action: "reject",
    });
    assert.equal(p.isError, true);
    assert.match(p.content[0].text, /expected "pending"/);
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

// ---------------------------------------------------------------------------
// P3 dedup (ADR-011): kb_promote_experience duplicate detection
// ---------------------------------------------------------------------------

test("kb_promote_experience: duplicate title (Levenshtein > 0.9) forces tier=manual + duplicate_with non-empty", async () => {
  const tmp = await createTempKB("prom-dup-title");
  process.env.KB_ROOT = tmp;
  try {
    const { kbWriteExperience, kbPromoteExperience } = await import("../tools/write.js");

    // Pre-existing active card with a 10-char title.
    await writePage(
      tmp,
      "wiki/coding/experiences/async-patterns.md",
      {
        title: "Async Patterns",
        domain: ["coding"],
        type: "experience",
        status: "active",
        confidence: 0.85,
        date: todayStr(),
        source_task: "t-original",
      },
      "## Background\nOriginal card body, completely different content.\n"
    );

    // Inbox card with title differing by 1 char out of 10 → Levenshtein ratio = 0.9.
    // "Async Patterns" vs "Async Patternx" → 1 substitution / 14 chars ≈ 0.928.
    // (Pick clearly-over-threshold input to avoid boundary flakiness.)
    const w = await kbWriteExperience({
      title: "Async Patternx",
      domain: "coding",
      content: "## Background\nA totally different body to ensure content_sim stays low.\n",
      confidence: 0.9,
      source_task: "t-dup",
    });
    const p = await kbPromoteExperience({
      inbox_path: parseResult(w).path,
      action: "promote",
    });
    const res = parseResult(p);
    assert.equal(res.status, "active");
    assert.equal(res.tier, "manual", "duplicate must force tier=manual");
    assert.ok(
      Array.isArray(res.duplicate_with) && res.duplicate_with.length > 0,
      "duplicate_with must be a non-empty array"
    );
    const dup = res.duplicate_with[0];
    assert.equal(dup.path, "wiki/coding/experiences/async-patterns");
    assert.ok(dup.title_sim > 0.9, `title_sim=${dup.title_sim} must exceed 0.9`);
    assert.ok(typeof dup.content_sim === "number");
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

test("kb_promote_experience: duplicate body (Sorensen-Dice > 0.7) forces tier=manual", async () => {
  const tmp = await createTempKB("prom-dup-body");
  process.env.KB_ROOT = tmp;
  try {
    const { kbWriteExperience, kbPromoteExperience } = await import("../tools/write.js");

    const sharedBody =
      "## 背景\n在 P3 实施过程中需要为知识库添加去重检测能力。" +
      "## 方案\n采用 Levenshtein + Sorensen-Dice 字符 bigram 算法。";

    // Active card with title A and the shared body.
    await writePage(
      tmp,
      "wiki/coding/experiences/dedup-impl.md",
      {
        title: "Dedup Strategy Alpha",
        domain: ["coding"],
        type: "experience",
        status: "active",
        confidence: 0.85,
        date: todayStr(),
        source_task: "t-a",
      },
      sharedBody + "\n"
    );

    // Inbox card with title B (different) but the SAME body → content_sim ≈ 1.0.
    const w = await kbWriteExperience({
      title: "Dedup Strategy Beta",
      domain: "coding",
      content: sharedBody,
      confidence: 0.9,
      source_task: "t-b",
    });
    const p = await kbPromoteExperience({
      inbox_path: parseResult(w).path,
      action: "promote",
    });
    const res = parseResult(p);
    assert.equal(res.tier, "manual", "body-duplicate must force tier=manual");
    assert.ok(res.duplicate_with.length > 0, "duplicate_with must be non-empty");
    assert.ok(
      res.duplicate_with[0].content_sim > 0.7,
      `content_sim=${res.duplicate_with[0].content_sim} must exceed 0.7`
    );
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

test("kb_promote_experience: no duplicates → tier=auto (high conf) and duplicate_with=[]", async () => {
  const tmp = await createTempKB("prom-nodup");
  process.env.KB_ROOT = tmp;
  try {
    const { kbWriteExperience, kbPromoteExperience } = await import("../tools/write.js");

    const w = await kbWriteExperience({
      title: "Unique Topic",
      domain: "coding",
      content: "## Background\nA unique body discussing a one-of-a-kind problem.\n",
      confidence: 0.9,
      source_task: "t-unique",
    });
    const p = await kbPromoteExperience({
      inbox_path: parseResult(w).path,
      action: "promote",
    });
    const res = parseResult(p);
    assert.equal(res.tier, "auto", "no duplicates + high conf + single domain → auto");
    assert.ok(
      Array.isArray(res.duplicate_with) && res.duplicate_with.length === 0,
      "duplicate_with must be an empty array when no duplicates"
    );
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

test("kb_promote_experience: cross-domain duplicates NOT flagged (range = same-domain only)", async () => {
  const tmp = await createTempKB("prom-cross");
  process.env.KB_ROOT = tmp;
  try {
    const { kbWriteExperience, kbPromoteExperience } = await import("../tools/write.js");

    // Active card in domain=emotions with identical title + body to the inbox card.
    await writePage(
      tmp,
      "wiki/emotions/experiences/same-title.md",
      {
        title: "Same Title",
        domain: ["emotions"],
        type: "experience",
        status: "active",
        confidence: 0.85,
        date: todayStr(),
        source_task: "t-emotion",
      },
      "## Background\nShared body content across domains.\n"
    );

    // Inbox card in domain=coding — same title, same body, DIFFERENT domain.
    const w = await kbWriteExperience({
      title: "Same Title",
      domain: "coding",
      content: "## Background\nShared body content across domains.\n",
      confidence: 0.9,
      source_task: "t-coding",
    });
    const p = await kbPromoteExperience({
      inbox_path: parseResult(w).path,
      action: "promote",
    });
    const res = parseResult(p);
    assert.equal(res.tier, "auto", "cross-domain duplicates must NOT force manual");
    assert.equal(res.duplicate_with.length, 0, "cross-domain duplicates must NOT be flagged");
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

// ---------------------------------------------------------------------------
// DEF-005 regression: log.md markdownlint compliance after write+promote
// ---------------------------------------------------------------------------

test("DEF-005: log.md passes MD022/MD032 after write+promote; promote uses type='promote'", async () => {
  const tmp = await createTempKB("def005");
  process.env.KB_ROOT = tmp;
  try {
    const { kbWriteExperience, kbPromoteExperience } = await import("../tools/write.js");

    const w = await kbWriteExperience({
      title: "DEF-005 Test",
      domain: "coding",
      content: "## Background\n...",
      confidence: 0.85,
      source_task: "task-def005",
    });
    await kbPromoteExperience({
      inbox_path: parseResult(w).path,
      action: "promote",
    });

    const logContent = await fs.readFile(path.join(tmp, "log.md"), "utf-8");
    const lines = logContent.split("\n");

    // MD032/MD022: every ## heading must be followed by a blank line before
    // any list item. The pre-DEF-005 appendLogEntry emitted heading immediately
    // followed by "- key: value" with no blank line.
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i].startsWith("## ") && lines[i + 1].startsWith("- ")) {
        assert.fail(
          `MD032 violation at log.md line ${i + 1}: heading "${lines[i]}" ` +
          `immediately followed by list item "${lines[i + 1]}" without blank line`
        );
      }
    }

    // MD047: file ends with a newline
    assert.ok(logContent.endsWith("\n"), "MD047: log.md must end with a newline");

    // DEF-005: promote action must emit type="promote" (not "experience"),
    // so the heading differs from the original write entry and avoids
    // MD024 duplicate-heading detection (siblings_only mode).
    assert.match(
      logContent,
      /^## \[\d{4}-\d{2}-\d{2}\] promote \| DEF-005 Test$/m,
      'promote action should log with type "promote", not "experience"'
    );
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

// ---------------------------------------------------------------------------
// /dream aging
// ---------------------------------------------------------------------------

test("/dream: demotes use_count=0 + old-date active experiences to archived only", async () => {
  const tmp = await createTempKB("dream");
  process.env.KB_ROOT = tmp;
  try {
    const { dream } = await import("../dream.js");
    const { fileExists, readFile } = await import("../utils/fileio.js");
    const { parseFrontmatter } = await import("../utils/frontmatter.js");

    const oldDate = daysAgo(100); // > 90 days
    const recentDate = daysAgo(1);

    // 1. Should demote: use_count=0, old date
    await writePage(
      tmp,
      "wiki/coding/experiences/old-unused.md",
      {
        title: "Old Unused",
        domain: ["coding"],
        type: "experience",
        status: "active",
        confidence: 0.85,
        date: oldDate,
        source_task: "t",
        use_count: 0,
      },
      "old body\n"
    );

    // 2. Should NOT demote: use_count=5, old date
    await writePage(
      tmp,
      "wiki/coding/experiences/old-used.md",
      {
        title: "Old Used",
        domain: ["coding"],
        type: "experience",
        status: "active",
        confidence: 0.85,
        date: oldDate,
        source_task: "t",
        use_count: 5,
      },
      "used body\n"
    );

    // 3. Should NOT demote: use_count=0, recent date
    await writePage(
      tmp,
      "wiki/coding/experiences/recent-unused.md",
      {
        title: "Recent Unused",
        domain: ["coding"],
        type: "experience",
        status: "active",
        confidence: 0.85,
        date: recentDate,
        source_task: "t",
        use_count: 0,
      },
      "recent body\n"
    );

    const report = await dream();
    assert.equal(report.scanned, 3);
    assert.equal(report.demoted, 1);
    assert.match(
      report.demoted_paths[0],
      /wiki\/coding\/experiences\/archive\/old-unused\.md$/
    );

    // old-unused moved to archive/ with status=archived
    assert.equal(
      await fileExists(path.join(tmp, "wiki/coding/experiences/old-unused.md")),
      false
    );
    assert.equal(
      await fileExists(path.join(tmp, "wiki/coding/experiences/archive/old-unused.md")),
      true
    );
    const archivedContent = await readFile(
      path.join(tmp, "wiki/coding/experiences/archive/old-unused.md")
    );
    assert.equal(
      parseFrontmatter(archivedContent).frontmatter.status,
      "archived"
    );

    // old-used and recent-unused untouched at original location
    assert.equal(
      await fileExists(path.join(tmp, "wiki/coding/experiences/old-used.md")),
      true
    );
    assert.equal(
      await fileExists(path.join(tmp, "wiki/coding/experiences/recent-unused.md")),
      true
    );
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

// ---------------------------------------------------------------------------
// P3 /dream Phase 2 (dedup) + Phase 3 (quality scoring) — ADR-011
// ---------------------------------------------------------------------------

test("/dream Phase 2: reports suspected duplicate pairs (report-only, no merge)", async () => {
  const tmp = await createTempKB("dream-dedup");
  process.env.KB_ROOT = tmp;
  try {
    const { dream } = await import("../dream.js");
    const { readFile } = await import("../utils/fileio.js");

    // Two cards with near-identical titles (Levenshtein > 0.9) in the same domain.
    // Titles differ by 1 char out of 14 → ratio ≈ 0.928 > 0.9.
    const sharedBody = "## Background\nA unique body to keep content_sim low.\n";
    await writePage(
      tmp,
      "wiki/coding/experiences/async-patterns.md",
      {
        title: "Async Patterns",
        domain: ["coding"],
        type: "experience",
        status: "active",
        confidence: 0.85,
        date: todayStr(),
        source_task: "t-a",
        use_count: 1, // non-zero so aging doesn't demote
      },
      sharedBody
    );
    await writePage(
      tmp,
      "wiki/coding/experiences/async-patternx.md",
      {
        title: "Async Patternx",
        domain: ["coding"],
        type: "experience",
        status: "active",
        confidence: 0.85,
        date: todayStr(),
        source_task: "t-b",
        use_count: 1,
      },
      sharedBody
    );

    const report = await dream();
    assert.equal(report.scanned, 2);
    assert.equal(report.demoted, 0);
    assert.equal(
      report.duplicates.length,
      1,
      "expected 1 suspected duplicate pair"
    );

    const pair = report.duplicates[0];
    assert.ok(pair.a.includes("async-pattern"), `pair.a=${pair.a}`);
    assert.ok(pair.b.includes("async-pattern"), `pair.b=${pair.b}`);
    assert.ok(pair.a !== pair.b, "pair must be two distinct cards");
    assert.ok(pair.title_sim > 0.9, `title_sim=${pair.title_sim} must exceed 0.9`);

    // Report-only: original files unchanged (no merge, no delete).
    const aContent = await readFile(path.join(tmp, "wiki/coding/experiences/async-patterns.md"));
    const bContent = await readFile(path.join(tmp, "wiki/coding/experiences/async-patternx.md"));
    assert.match(aContent, /title: Async Patterns/);
    assert.match(bContent, /title: Async Patternx/);
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

test("/dream Phase 3: writes quality_score to active cards (idempotent on re-run)", async () => {
  const tmp = await createTempKB("dream-quality");
  process.env.KB_ROOT = tmp;
  try {
    const { dream } = await import("../dream.js");
    const { readFile } = await import("../utils/fileio.js");
    const { parseFrontmatter } = await import("../utils/frontmatter.js");

    // A well-structured card — should score highly.
    await writePage(
      tmp,
      "wiki/coding/experiences/good-card.md",
      {
        title: "Good Experience Card",
        domain: ["coding"],
        type: "experience",
        status: "active",
        confidence: 0.85,
        date: todayStr(),
        source_task: "t-good",
        tags: ["python", "async"],
        use_count: 1,
      },
      "## 背景\nProblem context.\n\n## 方案\nThe solution.\n\n## 证据\n```\ncode\n```\n\n## 适用场景\nWhen to use.\n\n" +
        "a".repeat(500) // pad to sweet-spot length
    );

    // First run: should compute + write quality_score.
    const r1 = await dream();
    assert.equal(r1.scored, 1);
    assert.equal(r1.quality_updated, 1, "first run must write quality_score");

    const content1 = await readFile(path.join(tmp, "wiki/coding/experiences/good-card.md"));
    const fm1 = parseFrontmatter(content1).frontmatter;
    const score1 = fm1.quality_score;
    assert.equal(typeof score1, "number", "quality_score must be a number");
    assert.ok(
      typeof score1 === "number" && score1 >= 0 && score1 <= 1,
      "score must be in [0,1]"
    );
    assert.ok(
      typeof score1 === "number" && score1 > 0.5,
      `expected high score, got ${score1}`
    );

    // Second run: idempotent — score unchanged, no writeback.
    const r2 = await dream();
    assert.equal(r2.scored, 1);
    assert.equal(r2.quality_updated, 0, "second run must NOT rewrite (idempotent)");

    // Score value unchanged.
    const content2 = await readFile(path.join(tmp, "wiki/coding/experiences/good-card.md"));
    const fm2 = parseFrontmatter(content2).frontmatter;
    assert.equal(fm2.quality_score, score1, "score must be stable across runs");
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});

test("/dream summary log entry: type='dream' with pass statistics", async () => {
  const tmp = await createTempKB("dream-log");
  process.env.KB_ROOT = tmp;
  try {
    const { dream } = await import("../dream.js");

    await writePage(
      tmp,
      "wiki/coding/experiences/solo.md",
      {
        title: "Solo Card",
        domain: ["coding"],
        type: "experience",
        status: "active",
        confidence: 0.85,
        date: todayStr(),
        source_task: "t-solo",
        use_count: 1,
      },
      "## Background\nA card.\n"
    );

    await dream();

    const logContent = await fs.readFile(path.join(tmp, "log.md"), "utf-8");
    // Summary entry heading with type="dream"
    assert.match(
      logContent,
      /^## \[\d{4}-\d{2}-\d{2}\] dream \| \/dream pass summary$/m,
      "summary log entry must use type='dream'"
    );
    // Statistics details present
    assert.match(logContent, /- scanned: 1/);
    assert.match(logContent, /- demoted: 0/);
    assert.match(logContent, /- duplicates_found: 0/);
    assert.match(logContent, /- quality_scored: 1/);
    // MD022/MD032: heading followed by blank line before list items
    const lines = logContent.split("\n");
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i].startsWith("## ") && lines[i + 1].startsWith("- ")) {
        assert.fail(`MD032 violation at log.md line ${i + 1}`);
      }
    }
  } finally {
    delete process.env.KB_ROOT;
    await cleanupKB(tmp);
  }
});
