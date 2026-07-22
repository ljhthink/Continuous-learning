/**
 * Smoke test for kb_lint (US-005).
 * Directly invokes the compiled kbLint() with an isolated KB_ROOT,
 * verifies each of the 5 checks fires correctly + exempt cases work.
 *
 * Run: node smoke-lint.mjs  (after `npm run build`)
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const TMP = path.join(os.tmpdir(), "kb-lint-smoke");

// --- Setup: clean + create fixture KB ---
await fs.rm(TMP, { recursive: true, force: true });
await fs.mkdir(path.join(TMP, "wiki", "coding"), { recursive: true });
await fs.mkdir(path.join(TMP, "raw"), { recursive: true });

await fs.writeFile(
  path.join(TMP, "index.md"),
  "# 知识库索引\n> 最后更新：2026-07-22 · 总页数：0\n",
);
await fs.writeFile(path.join(TMP, "log.md"), "");

async function writePage(name, frontmatter, body) {
  const fm = `---\n${frontmatter}---\n`;
  await fs.writeFile(path.join(TMP, "wiki", "coding", name), fm + body);
}

// 1. source-old: source page, older date, linked by ref-to-old (no stale)
await writePage(
  "source-old.md",
  `title: "Source Old"\ndomain: [coding]\ntype: source\nstatus: active\ndate: 2026-07-01\nsource_file: raw/old.md\n`,
  "# Source Old\nOriginal content from July 1.",
);

// 2. source-new: source page, newer date, linked by ref-to-new (triggers STALE on ref-to-new)
await writePage(
  "source-new.md",
  `title: "Source New"\ndomain: [coding]\ntype: source\nstatus: active\ndate: 2026-07-20\nsource_file: raw/new.md\n`,
  "# Source New\nUpdated content from July 20.",
);

// 3. ref-to-old: concept, links to source-old, newer than source (NO stale)
await writePage(
  "ref-to-old.md",
  `title: "Ref To Old"\ndomain: [coding]\ntype: concept\nstatus: active\ndate: 2026-07-15\n`,
  "# Ref To Old\nReferences [[source-old]].",
);

// 4. ref-to-new: concept, links to source-new, older than source (STALE)
await writePage(
  "ref-to-new.md",
  `title: "Ref To New"\ndomain: [coding]\ntype: concept\nstatus: active\ndate: 2026-07-10\n`,
  "# Ref To New\nReferences [[source-new]].",
);

// 5. missing-fm: no frontmatter at all (missing all 5 common fields)
await fs.writeFile(
  path.join(TMP, "wiki", "coding", "missing-fm.md"),
  "# Missing Frontmatter\nThis page has no frontmatter.",
);

// 6. bad-type: invalid type value
await writePage(
  "bad-type.md",
  `title: "Bad Type"\ndomain: [coding]\ntype: unknown\nstatus: active\ndate: 2026-07-15\n`,
  "# Bad Type\nInvalid type.",
);

// 7. bad-status: invalid status value
await writePage(
  "bad-status.md",
  `title: "Bad Status"\ndomain: [coding]\ntype: concept\nstatus: weird\ndate: 2026-07-15\n`,
  "# Bad Status\nInvalid status.",
);

// 8. contradiction: body has ⚠️ 矛盾 marker
await writePage(
  "contradiction.md",
  `title: "Contradiction Page"\ndomain: [coding]\ntype: concept\nstatus: active\ndate: 2026-07-15\n`,
  "# Contradiction\n⚠️ 矛盾：新声明 A 与旧声明 B 冲突，待裁决。",
);

// 9 & 10. dup-title-a/b: same title "Same Title" (duplicate title)
await writePage(
  "dup-title-a.md",
  `title: "Same Title"\ndomain: [coding]\ntype: concept\nstatus: active\ndate: 2026-07-15\n`,
  "# Dup A\nFirst duplicate.",
);
await writePage(
  "dup-title-b.md",
  `title: "Same Title"\ndomain: [coding]\ntype: entity\nstatus: active\ndate: 2026-07-15\n`,
  "# Dup B\nSecond duplicate.",
);

// 11. orphan: concept, no inbound links, not exempt (SHOULD be flagged)
await writePage(
  "orphan.md",
  `title: "Orphan Page"\ndomain: [coding]\ntype: concept\nstatus: active\ndate: 2026-07-15\n`,
  "# Orphan\nNobody links to me.",
);

// 12. orphan-exempt: experience, confidence 0.9, no inbound links (SHOULD NOT be flagged)
await writePage(
  "orphan-exempt.md",
  `title: "Exempt Experience"\ndomain: [coding]\ntype: experience\nstatus: active\ndate: 2026-07-15\nconfidence: 0.9\nsource_task: task-001\n`,
  "# Exempt\nHigh-confidence experience, exempt from orphan check.",
);

// 13 & 14. tag-share-a/b: same domain, share tag [python], not cross-linked (MISSING_XREF)
await writePage(
  "tag-share-a.md",
  `title: "Tag Share A"\ndomain: [coding]\ntype: concept\nstatus: active\ndate: 2026-07-15\ntags: [python]\n`,
  "# Tag Share A\nPython page A.",
);
await writePage(
  "tag-share-b.md",
  `title: "Tag Share B"\ndomain: [coding]\ntype: concept\nstatus: active\ndate: 2026-07-15\ntags: [python]\n`,
  "# Tag Share B\nPython page B.",
);

// 15. pending-orphan: status=pending, should be skipped from orphans (inbox page)
await writePage(
  "pending-orphan.md",
  `title: "Pending Page"\ndomain: [coding]\ntype: experience\nstatus: pending\ndate: 2026-07-15\nconfidence: 0.5\nsource_task: task-002\n`,
  "# Pending\nIn inbox, should not be flagged as orphan.",
);

// --- Set KB_ROOT BEFORE importing compiled modules ---
process.env.KB_ROOT = TMP;

const { kbLint } = await import("./dist/tools/lint.js");

// --- Run all checks ---
const result = await kbLint({});
const data = JSON.parse(result.content[0].text);

console.log("=== kb_lint smoke test ===\n");
console.log(`Pages scanned: ${data.summary.pages_scanned}`);
console.log(`Total issues: ${data.summary.total}`);
console.log(`By type:`, JSON.stringify(data.summary.by_type, null, 2));
console.log("\n--- All issues ---");
for (const issue of data.issues) {
  console.log(
    `[${issue.severity}] ${issue.type}: ${issue.page} — ${issue.detail}`,
  );
}

// --- Assertions ---
// relPath format is "wiki/coding/foo" (no .md); pair issues use "wiki/coding/a ↔ wiki/coding/b".
const issues = data.issues;
function hasIssueMatching(type, predicate) {
  return issues.some((i) => i.type === type && predicate(i));
}
function hasIssueWithPageContaining(type, substring) {
  return hasIssueMatching(type, (i) => i.page.includes(substring));
}
function hasIssueWithBothPages(type, a, b) {
  return hasIssueMatching(
    type,
    (i) => i.page.includes(a) && i.page.includes(b),
  );
}
function hasIssueWithExactPage(type, exactPage) {
  return hasIssueMatching(type, (i) => i.page === exactPage);
}
function noIssueWithPageContaining(type, substring) {
  return !hasIssueWithPageContaining(type, substring);
}

const assertions = [
  // frontmatter
  ["frontmatter: missing-fm flagged", hasIssueWithPageContaining("frontmatter", "missing-fm")],
  ["frontmatter: bad-type flagged", hasIssueWithPageContaining("frontmatter", "bad-type")],
  ["frontmatter: bad-status flagged", hasIssueWithPageContaining("frontmatter", "bad-status")],
  // contradictions
  ["contradictions: marker in contradiction page", hasIssueWithPageContaining("contradictions", "contradiction")],
  ["contradictions: dup-title pair", hasIssueWithBothPages("contradictions", "dup-title-a", "dup-title-b")],
  // orphans — exact match on "wiki/coding/orphan" to exclude orphan-exempt / pending-orphan
  ["orphans: orphan flagged", hasIssueWithExactPage("orphans", "wiki/coding/orphan")],
  ["orphans: orphan-exempt NOT flagged (confidence)", noIssueWithPageContaining("orphans", "orphan-exempt")],
  ["orphans: pending-orphan NOT flagged (status=pending)", noIssueWithPageContaining("orphans", "pending-orphan")],
  ["orphans: source-old NOT flagged (has inbound)", noIssueWithPageContaining("orphans", "source-old")],
  // stale
  ["stale: ref-to-new flagged", hasIssueWithPageContaining("stale", "ref-to-new")],
  ["stale: ref-to-old NOT flagged (source older)", noIssueWithPageContaining("stale", "ref-to-old")],
  // missing_xref
  ["missing_xref: tag-share pair", hasIssueWithBothPages("missing_xref", "tag-share-a", "tag-share-b")],
];

console.log("\n--- Assertions ---");
let passed = 0;
let failed = 0;
for (const [name, ok] of assertions) {
  const mark = ok ? "✓" : "✗";
  console.log(`  ${mark} ${name}`);
  if (ok) passed++;
  else failed++;
}
console.log(`\n${passed}/${assertions.length} assertions passed.`);

// --- Cleanup ---
await fs.rm(TMP, { recursive: true, force: true });

if (failed > 0) {
  console.error(`\n❌ ${failed} assertion(s) FAILED.`);
  process.exit(1);
} else {
  console.log("\n✅ All assertions passed.");
  process.exit(0);
}
