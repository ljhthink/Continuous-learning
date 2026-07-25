/**
 * Unit tests for the experience-card quality rubric (ADR-011).
 *
 * Covers the four scoring dimensions in isolation, then the composite
 * `scoreExperience` across synthetic + AGENTS.md §7.2-template fixtures.
 *
 * Pure-function tests — no temp KB, no I/O.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  scoreExperience,
  countSections,
  hasCodeBlock,
  lengthScore,
  WEIGHTS,
  PER_SECTION_SCORE,
  LENGTH_MIN,
  LENGTH_MAX,
} from "../utils/quality.js";

describe("quality: WEIGHTS sanity", () => {
  test("weights sum to 1.0", () => {
    const sum =
      WEIGHTS.frontmatter + WEIGHTS.structure + WEIGHTS.evidence + WEIGHTS.length;
    assert.ok(Math.abs(sum - 1.0) < 1e-9, `weights sum to ${sum}, expected 1.0`);
  });

  test("PER_SECTION_SCORE = 0.35 / 4 = 0.0875", () => {
    assert.equal(PER_SECTION_SCORE, 0.0875);
  });

  test("LENGTH_MIN=500, LENGTH_MAX=5000", () => {
    assert.equal(LENGTH_MIN, 500);
    assert.equal(LENGTH_MAX, 5000);
  });
});

describe("countSections", () => {
  test("0 sections in empty body", () => {
    assert.equal(countSections(""), 0);
  });

  test("0 sections in body with only prose (no headings)", () => {
    assert.equal(countSections("Just some prose.\nNo headings here.\n"), 0);
  });

  test("all 4 Chinese sections counted", () => {
    const body = `# Title

## 背景
some context

## 方案
the solution

## 证据
the evidence

## 适用场景
when to use
`;
    assert.equal(countSections(body), 4);
  });

  test("all 4 English section aliases counted", () => {
    const body = `# Title

## Background
ctx

## Solution
sol

## Evidence
ev

## Applicable Scenarios
when
`;
    assert.equal(countSections(body), 4);
  });

  test("Use Cases alias for 适用场景", () => {
    const body = `## Use Cases\nwhen\n`;
    assert.equal(countSections(body), 1);
  });

  test("bilingual duplicates do NOT double-count", () => {
    // Both 背景 and Background present → still counts as 1 (background section).
    const body = `## 背景\nctx\n\n## Background\nctx\n`;
    assert.equal(countSections(body), 1);
  });

  test("any heading level #..###### recognized", () => {
    const body = `# 背景\n## 方案\n### 证据\n#### 适用场景\n`;
    assert.equal(countSections(body), 4);
  });

  test("no false positive on partial-word matches", () => {
    // 背景音乐 should NOT match 背景 (no whitespace/EOL after 背景).
    const body = `## 背景音乐\nmusic\n`;
    assert.equal(countSections(body), 0);
  });

  test("no false positive on inline text (non-heading)", () => {
    // Mentioning 背景 in prose without a heading prefix.
    const body = `Some text about 背景 here.\n`;
    assert.equal(countSections(body), 0);
  });

  test("section heading with trailing punctuation counts (背景：xxx)", () => {
    // `：` (fullwidth colon U+FF1A) is NOT a Han character, so the negative
    // lookahead `(?![\u4e00-\u9fff])` succeeds → match. This is the desired
    // behavior: `## 背景：重构P3` is semantically the 背景 section.
    const body = `## 背景：xxx\n`;
    assert.equal(countSections(body), 1);
  });

  test("section heading with trailing dash counts (背景 - xxx)", () => {
    const body = `## 背景 - 重构P3\n`;
    assert.equal(countSections(body), 1);
  });

  test("section heading with trailing space counts", () => {
    const body = `## 背景 \nctx\n`;
    assert.equal(countSections(body), 1);
  });

  test("section heading at end of body (no trailing newline) counts", () => {
    const body = `## 背景`;
    assert.equal(countSections(body), 1);
  });
});

describe("hasCodeBlock", () => {
  test("false for plain prose", () => {
    assert.equal(hasCodeBlock("just prose\nno code"), false);
  });

  test("true for fenced code block with language", () => {
    assert.equal(hasCodeBlock("```typescript\nconst x = 1;\n```"), true);
  });

  test("true for fenced code block without language", () => {
    assert.equal(hasCodeBlock("```\ncode\n```"), true);
  });

  test("true for inline backticks (lenient — any ```)", () => {
    // Triple-backtick anywhere in the body counts as evidence.
    assert.equal(hasCodeBlock("text ``` inline ``` more"), true);
  });
});

describe("lengthScore", () => {
  test("empty body → 0", () => {
    assert.equal(lengthScore(""), 0);
  });

  test("len < 500: linear ramp (len/500)", () => {
    assert.equal(lengthScore("a".repeat(100)), 100 / 500);
    assert.equal(lengthScore("a".repeat(250)), 0.5);
    assert.equal(lengthScore("a".repeat(499)), 499 / 500);
  });

  test("len = 500: 1.0 (boundary)", () => {
    assert.equal(lengthScore("a".repeat(500)), 1.0);
  });

  test("len = 5000: 1.0 (boundary)", () => {
    assert.equal(lengthScore("a".repeat(5000)), 1.0);
  });

  test("500 < len ≤ 5000: 1.0 (sweet spot)", () => {
    assert.equal(lengthScore("a".repeat(2500)), 1.0);
  });

  test("len > 5000: smooth decay (1.0 at 5000, →0.5 as len→∞)", () => {
    const at5001 = lengthScore("a".repeat(5001));
    assert.ok(Math.abs(at5001 - 1.0) < 1e-3, `at 5001: ${at5001}`);
    const at10000 = lengthScore("a".repeat(10000));
    assert.ok(Math.abs(at10000 - 0.75) < 1e-9, `at 10000: ${at10000}`);
    const at50000 = lengthScore("a".repeat(50000));
    assert.ok(Math.abs(at50000 - 0.55) < 1e-9, `at 50000: ${at50000}`);
  });

  test("len >> 5000: never falls below 0.5", () => {
    const huge = lengthScore("a".repeat(1_000_000));
    assert.ok(huge >= 0.5 && huge < 0.51, `huge: ${huge}`);
  });

  test("CJK length is code-point based (1 char = 1 unit)", () => {
    // 600 Han chars = 600 code points → in sweet spot → 1.0.
    // If body.length were used, still 600 since Han is 1 UTF-16 code unit
    // for BMP. Use emoji to truly exercise code-point counting: 500 emoji
    // = 1000 UTF-16 code units but 500 code points → 1.0 (not 2.0 which
    // would be clamped to 1.0 anyway). Construct a discriminating case:
    // 250 emoji = 250 code points → 0.5 (linear ramp). If measured as
    // 500 UTF-16 units → 1.0.
    const emojiBody = "😀".repeat(250); // 250 code points, 500 UTF-16 units
    assert.equal(lengthScore(emojiBody), 0.5);
  });
});

describe("scoreExperience: composite", () => {
  // Floating-point tolerance for score comparisons (0.05 + 0.05 + 0.05
  // accumulates to 0.15000000000000002; 0.0875 * 4 = 0.35000000000000003).
  const EPS = 1e-9;
  function approxEqual(actual: number, expected: number, msg?: string): void {
    assert.ok(
      Math.abs(actual - expected) < EPS,
      `${msg ?? "score"}: actual=${actual}, expected=${expected}`,
    );
  }

  test("minimal card (no fm fields, empty body) → 0", () => {
    approxEqual(scoreExperience({}, ""), 0);
  });

  test("frontmatter completeness: each field +0.05", () => {
    // Body empty so structure/evidence/length dimensions contribute 0.
    approxEqual(scoreExperience({ confidence: 0.85 }, ""), 0.05);
    approxEqual(
      scoreExperience({ confidence: 0.85, source_task: "t1" }, ""),
      0.1,
    );
    approxEqual(
      scoreExperience(
        { confidence: 0.85, source_task: "t1", tags: ["x"] },
        "",
      ),
      0.15,
    );
    // tags must be a non-empty array.
    approxEqual(
      scoreExperience(
        { confidence: 0.85, source_task: "t1", tags: [] },
        "",
      ),
      0.1,
    );
    // null/undefined treated as missing.
    approxEqual(
      scoreExperience(
        { confidence: null, source_task: undefined, tags: undefined },
        "",
      ),
      0,
    );
  });

  test("body structure: each section adds PER_SECTION_SCORE (length-padded to 500 for stable length dim)", () => {
    // Pad body to exactly 500 code points so lengthScore = 1.0 → length
    // dimension contributes a constant 0.25. Then we can assert
    // structure + 0.25 exactly (within EPS).
    const pad = "a".repeat(500);
    const body1 = `## 背景\nctx\n${pad}`;
    approxEqual(
      scoreExperience({}, body1),
      PER_SECTION_SCORE + 0.25,
      "1 section",
    );
    const body2 = `## 背景\nctx\n## 方案\nsol\n${pad}`;
    approxEqual(
      scoreExperience({}, body2),
      2 * PER_SECTION_SCORE + 0.25,
      "2 sections",
    );
    const body4 = `## 背景\n## 方案\n## 证据\n## 适用场景\n${pad}`;
    approxEqual(
      scoreExperience({}, body4),
      4 * PER_SECTION_SCORE + 0.25,
      "4 sections",
    );
  });

  test("evidence: code block adds 0.25 (length-padded)", () => {
    const pad = "a".repeat(500);
    const withCode = `\`\`\`\ncode\n\`\`\`\n${pad}`;
    approxEqual(scoreExperience({}, withCode), 0.25 + 0.25, "code+length");
    const withoutCode = `just prose\n${pad}`;
    approxEqual(scoreExperience({}, withoutCode), 0.25, "length only");
  });

  test("length: 500-5000 body adds 0.25", () => {
    const body = "a".repeat(1000);
    approxEqual(scoreExperience({}, body), 0.25);
  });

  test("perfect card → 1.0 (all dimensions maxed)", () => {
    const body = `## 背景\nctx\n\n## 方案\nsol\n\n## 证据\n\`\`\`\ncode\n\`\`\`\n\n## 适用场景\nwhen\n\n${"a".repeat(600)}`;
    const fm = {
      confidence: 0.9,
      source_task: "t1",
      tags: ["x", "y"],
    };
    const score = scoreExperience(fm, body);
    approxEqual(score, 1.0, "perfect card");
  });

  test("realistic AGENTS.md §7.2 template card → high score (≥0.85)", () => {
    // Mirrors the example in AGENTS.md §7.2 (background/solution/evidence/
    // applicability sections, code snippet, ~600-2000 chars of body).
    const body = `# Python 异步上下文管理器的正确用法

## 背景

在重构 P3 /dream 模块时，需要批量读取 1000+ markdown 文件并解析 frontmatter。
首次实现用 \`fs.readFileSync\` 串行处理，p50=4.2s，无法满足 PRD US-006 < 2s 阈值。

## 方案

改用 \`fs.promises\` + \`Promise.all\` 并发读取，配合 \`p-limit\` 控制并发度避免 fd 耗尽：

\`\`\`typescript
import pLimit from "p-limit";
const limit = pLimit(64);
async function loadAllPages(paths: string[]): Promise<PageInfo[]> {
  return Promise.all(
    paths.map((p) => limit(() => loadOne(p))),
  );
}
\`\`\`

## 证据

- p50 从 4.2s 降到 0.86s（4.9x 提速）
- p95 从 5.1s 降到 1.12s
- 单元测试 28 个全过，1000 页扫描 lint-perf.test.ts 通过

## 适用场景

- I/O 密集型批量文件读取（markdown/JSON/CSV）
- 不适用：CPU 密集任务（应改用 worker_threads）
- 注意：并发度需根据 fd 上限调整，Linux 默认 1024
`;
    const fm = {
      confidence: 0.85,
      source_task: "task-async-refactor-001",
      tags: ["python", "async", "context-manager"],
    };
    const score = scoreExperience(fm, body);
    // Expect 0.15 (fm) + 0.35 (4 sections) + 0.25 (code block) + 0.25 (length) = 1.0
    // (body is ~700 code points, in sweet spot)
    assert.ok(
      score >= 0.85,
      `realistic card scored ${score}, expected ≥ 0.85`,
    );
    assert.ok(score <= 1.0, `score ${score} must not exceed 1.0`);
  });

  test("floating-point clamp at upper bound (no drift past 1.0)", () => {
    // Construct a max-everything case that might trigger float drift.
    const body = `## 背景\n## 方案\n## 证据\n\`\`\`\n\`\`\`\n## 适用场景\n${"a".repeat(500)}`;
    const fm = { confidence: 0.9, source_task: "t", tags: ["a"] };
    const score = scoreExperience(fm, body);
    assert.ok(score <= 1.0, `score ${score} exceeds 1.0`);
  });

  test("score is deterministic (pure function)", () => {
    const body = "## 背景\nctx\n```\ncode\n```\n" + "a".repeat(600);
    const fm = { confidence: 0.8, source_task: "t1", tags: ["x"] };
    const s1 = scoreExperience(fm, body);
    const s2 = scoreExperience(fm, body);
    assert.equal(s1, s2);
  });
});
