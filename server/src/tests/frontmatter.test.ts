/**
 * Unit tests for frontmatter serialization (DEF-008):
 *   serializeFrontmatter, parseFrontmatter, normalizeDate
 *
 * DEF-008 unifies the auto-generated frontmatter format with hand-written
 * pages (ADR-008 decision 1). The test cases below pin the three format
 * invariants:
 *   1. Top-level arrays use single-line flow style (`domain: [coding]`)
 *   2. ISO dates are emitted unquoted (`date: 2026-07-24`)
 *   3. A blank line separates the closing `---` from the body (MD022)
 * plus round-trip safety: serialize -> parse must yield equivalent data.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  serializeFrontmatter,
  parseFrontmatter,
  normalizeDate,
} from "../utils/frontmatter.js";

describe("serializeFrontmatter (DEF-008 format invariants)", () => {
  it("emits top-level arrays in single-line flow style", () => {
    const out = serializeFrontmatter(
      {
        title: "Test",
        domain: ["coding"],
        tags: ["python", "async", "context-manager"],
      },
      "## Body"
    );
    // Single-line flow style — block style would be `domain:\n  - coding`
    assert.match(out, /^domain: \[coding\]$/m);
    assert.match(out, /^tags: \[python, async, context-manager\]$/m);
    // Negative assertion: block-style array entries must NOT appear
    assert.doesNotMatch(out, /^  - coding$/m);
  });

  it("emits ISO dates unquoted", () => {
    const out = serializeFrontmatter(
      { title: "Test", date: "2026-07-24" },
      "## Body"
    );
    assert.match(out, /^date: 2026-07-24$/m);
    // The quoted form `date: '2026-07-24'` must NOT appear
    assert.doesNotMatch(out, /date: ['"]2026-07-24['"]/);
  });

  it("inserts a blank line between closing --- and body (MD022)", () => {
    const out = serializeFrontmatter(
      { title: "Test", domain: ["coding"] },
      "## 背景"
    );
    // Closing delimiter followed by blank line followed by body
    assert.match(out, /---\n\n## 背景/);
  });

  it("normalizes a body that already starts with newlines to exactly one blank line", () => {
    // Caller passed body with leading newlines; we must not stack blanks.
    const out = serializeFrontmatter(
      { title: "Test" },
      "\n\n## Body"
    );
    // Exactly one blank line, not three
    assert.match(out, /---\n\n## Body/);
    assert.doesNotMatch(out, /---\n\n\n\n## Body/);
  });

  it("preserves quotes around values that legitimately need them", () => {
    // Titles with special YAML characters (e.g. colon) must stay quoted —
    // our date-stripping regex must not touch them.
    const out = serializeFrontmatter(
      { title: "Note: Important", date: "2026-07-24" },
      "## Body"
    );
    // Title stays quoted because of the colon; date is unquoted
    assert.match(out, /^title: ['"]Note: Important['"]$/m);
    assert.match(out, /^date: 2026-07-24$/m);
  });

  it("serializes confidence float without quoting", () => {
    const out = serializeFrontmatter(
      { title: "Test", confidence: 0.85 },
      "## Body"
    );
    assert.match(out, /^confidence: 0\.85$/m);
  });

  it("round-trips: serialize -> parse yields equivalent frontmatter", () => {
    const original = {
      title: "Round Trip",
      domain: ["coding"],
      type: "experience",
      status: "pending",
      confidence: 0.85,
      date: "2026-07-24",
      source_task: "task-rt-001",
      tags: ["python", "async"],
    };
    const serialized = serializeFrontmatter(original, "## Body\nContent.");
    const { frontmatter, body } = parseFrontmatter(serialized);

    // Date round-trips as a string (normalizeDate handles both forms)
    assert.equal(normalizeDate(frontmatter.date), "2026-07-24");
    assert.deepEqual(frontmatter.domain, ["coding"]);
    assert.deepEqual(frontmatter.tags, ["python", "async"]);
    assert.equal(frontmatter.title, "Round Trip");
    assert.equal(frontmatter.confidence, 0.85);
    assert.equal(frontmatter.type, "experience");
    assert.equal(frontmatter.status, "pending");
    assert.equal(frontmatter.source_task, "task-rt-001");
    // Body preserved. The body starts with the blank line that
    // serializeFrontmatter inserts after `---` (MD022), so we match with a
    // leading newline rather than anchoring at the very start.
    assert.match(body, /^\n## Body\nContent\./);
  });

  it("handles empty domain array (edge case)", () => {
    const out = serializeFrontmatter(
      { title: "Test", domain: [] },
      "## Body"
    );
    assert.match(out, /^domain: \[\]$/m);
  });

  it("handles multi-domain array", () => {
    const out = serializeFrontmatter(
      { title: "Test", domain: ["coding", "academic"] },
      "## Body"
    );
    assert.match(out, /^domain: \[coding, academic\]$/m);
  });
});

describe("normalizeDate", () => {
  it("passes through YYYY-MM-DD strings unchanged", () => {
    assert.equal(normalizeDate("2026-07-24"), "2026-07-24");
  });

  it("converts js-yaml Date objects to YYYY-MM-DD", () => {
    // js-yaml parses unquoted `date: 2026-07-24` into a Date at UTC midnight
    const d = new Date(Date.UTC(2026, 6, 24)); // month is 0-indexed
    assert.equal(normalizeDate(d), "2026-07-24");
  });

  it("returns null for non-date values", () => {
    assert.equal(normalizeDate(null), null);
    assert.equal(normalizeDate(undefined), null);
    assert.equal(normalizeDate(42), null);
    assert.equal(normalizeDate({}), null);
  });
});

describe("parseFrontmatter (regression for DEF-008 + DEF-003)", () => {
  it("parses unquoted ISO dates (DEF-008 emitted form)", () => {
    const md = `---
title: Test
date: 2026-07-24
---

## Body`;
    const { frontmatter } = parseFrontmatter(md);
    // Unquoted ISO date is parsed as a Date by js-yaml; normalizeDate converts
    assert.equal(normalizeDate(frontmatter.date), "2026-07-24");
  });

  it("parses quoted ISO dates (legacy form)", () => {
    const md = `---
title: Test
date: '2026-07-24'
---

## Body`;
    const { frontmatter } = parseFrontmatter(md);
    // Quoted form stays a string
    assert.equal(frontmatter.date, "2026-07-24");
  });

  it("degrades gracefully on malformed YAML (DEF-003)", () => {
    const md = `---
title: Test
  - broken: yaml
---

## Body`;
    const { frontmatter, body } = parseFrontmatter(md);
    // Must not throw; degrades to empty frontmatter
    assert.deepEqual(frontmatter, {});
    assert.match(body, /## Body/);
  });

  it("returns empty frontmatter for content without frontmatter block", () => {
    const md = "# Just markdown\nNo frontmatter.";
    const { frontmatter, body } = parseFrontmatter(md);
    assert.deepEqual(frontmatter, {});
    assert.equal(body, md);
  });
});
