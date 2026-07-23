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

    // Body preserved (writeback must not truncate)
    assert.equal(parseResult(r2).body, "body text\n");
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
