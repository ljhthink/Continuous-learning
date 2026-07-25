/**
 * Unit tests for utils/similarity.ts (ADR-011).
 *
 * Coverage:
 *   - levenshteinRatio: identity, full-diff, prefix, code-point safety
 *     (emoji + extended-plane), CJK, empty-string edge cases
 *   - charBigrams: basic construction, whitespace filtering, short strings
 *   - sorensenDiceBigram: identity, disjoint, CJK semantic proximity,
 *     asymmetric lengths
 *   - tokenize: CJK + ASCII mix, punctuation, lowercase normalization
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  levenshteinRatio,
  charBigrams,
  sorensenDiceBigram,
  tokenize,
} from "../utils/similarity.js";

// ---------------------------------------------------------------------------
// levenshteinRatio
// ---------------------------------------------------------------------------

test("levenshteinRatio: identical strings → 1.0", () => {
  assert.equal(levenshteinRatio("hello", "hello"), 1.0);
  assert.equal(levenshteinRatio("", ""), 1.0);
  assert.equal(levenshteinRatio("链接检查", "链接检查"), 1.0);
});

test("levenshteinRatio: completely different → 0.0", () => {
  assert.equal(levenshteinRatio("abc", "xyz"), 0.0);
  assert.equal(levenshteinRatio("a", "b"), 0.0);
});

test("levenshteinRatio: prefix relationship ~0.75", () => {
  // "abc" vs "abcd": 1 insertion / maxLen 4 = 0.75
  assert.equal(levenshteinRatio("abc", "abcd"), 0.75);
});

test("levenshteinRatio: single substitution in middle", () => {
  // "abc" vs "axc": 1 sub / 3 = 0.666...
  assert.ok(Math.abs(levenshteinRatio("abc", "axc") - 2 / 3) < 1e-9);
});

test("levenshteinRatio: code-point safe with emoji (surrogate pairs)", () => {
  // 😀 (U+1F600) and 😁 (U+1F601) are each one code point but two UTF-16
  // code units. A naive charCodeAt-based Levenshtein would see 4 code units
  // and compute distance=2 (one sub per surrogate half), yielding 0.5.
  // Code-point-safe version sees 1 code point each, distance=1, maxLen=1,
  // ratio = 1 - 1/1 = 0.0.
  // The crucial test is that the function does NOT crash and returns a
  // sensible value (not NaN, not negative, not corrupted by surrogates).
  const r = levenshteinRatio("😀", "😁");
  assert.ok(typeof r === "number" && !Number.isNaN(r));
  assert.equal(r, 0.0); // 1 code-point edit out of max 1 → ratio 0
});

test("levenshteinRatio: emoji in longer string yields partial similarity", () => {
  // "hello 😀" vs "hello 😁": 7 code points each, 1 substitution → 6/7 ≈ 0.857
  // A naive UTF-16 implementation would see 8 code units, distance=2, ratio=0.75
  // — the code-point-safe value (0.857) is strictly higher and reflects the
  // true edit distance.
  const r = levenshteinRatio("hello 😀", "hello 😁");
  assert.ok(typeof r === "number" && !Number.isNaN(r));
  assert.ok(Math.abs(r - 6 / 7) < 1e-9, `expected 6/7, got ${r}`);
});

test("levenshteinRatio: CJK title single-char diff → high similarity", () => {
  // Simulates two near-duplicate experience card titles.
  const r = levenshteinRatio("js-yaml 5 升级", "js-yaml 6 升级");
  assert.ok(r > 0.85, `expected > 0.85, got ${r}`);
});

test("levenshteinRatio: empty vs non-empty → 0.0", () => {
  assert.equal(levenshteinRatio("", "abc"), 0.0);
  assert.equal(levenshteinRatio("abc", ""), 0.0);
});

test("levenshteinRatio: single char identical → 1.0", () => {
  assert.equal(levenshteinRatio("a", "a"), 1.0);
});

// ---------------------------------------------------------------------------
// charBigrams
// ---------------------------------------------------------------------------

test("charBigrams: 'abcd' → {ab, bc, cd}", () => {
  const g = charBigrams("abcd");
  assert.equal(g.size, 3);
  assert.ok(g.has("ab"));
  assert.ok(g.has("bc"));
  assert.ok(g.has("cd"));
});

test("charBigrams: empty string → empty set", () => {
  assert.equal(charBigrams("").size, 0);
});

test("charBigrams: single character → empty set (no pairs)", () => {
  assert.equal(charBigrams("a").size, 0);
});

test("charBigrams: pure-whitespace pairs are filtered, char+space kept", () => {
  // "a  b" has pairs: "a ", "  ", " b". The pure-whitespace pair "  " is
  // filtered (no discriminative value). The mixed pairs "a " and " b" are
  // kept — they carry information about word boundaries that helps
  // distinguish "a b" from "ab" in body text.
  const g = charBigrams("a  b");
  assert.equal(g.size, 2);
  assert.ok(g.has("a "));
  assert.ok(g.has(" b"));
});

test("charBigrams: CJK string produces expected bigrams", () => {
  // "链接" → one bigram "链接"
  const g = charBigrams("链接");
  assert.equal(g.size, 1);
  assert.ok(g.has("链接"));
});

test("charBigrams: code-point safe with emoji", () => {
  // "a😀b" → bigrams: "a😀", "😀b" (each emoji is one code point)
  const g = charBigrams("a😀b");
  assert.equal(g.size, 2);
});

// ---------------------------------------------------------------------------
// sorensenDiceBigram
// ---------------------------------------------------------------------------

test("sorensenDiceBigram: identical → 1.0", () => {
  assert.equal(sorensenDiceBigram("hello world", "hello world"), 1.0);
  assert.equal(sorensenDiceBigram("", ""), 1.0);
});

test("sorensenDiceBigram: completely disjoint → 0.0", () => {
  assert.equal(sorensenDiceBigram("abc", "xyz"), 0.0);
});

test("sorensenDiceBigram: empty vs non-empty → 0.0", () => {
  assert.equal(sorensenDiceBigram("", "abc"), 0.0);
  assert.equal(sorensenDiceBigram("abc", ""), 0.0);
});

test("sorensenDiceBigram: CJK semantic proximity (same characters reshuffled)", () => {
  // Two CJK paragraphs sharing most characters but in different order.
  // Should score moderately high (> 0.5) because bigram overlap is significant.
  const a = "链接检查是知识库健康检查的重要环节";
  const b = "知识库健康检查的链接检查环节很重要";
  const r = sorensenDiceBigram(a, b);
  assert.ok(r > 0.5, `expected > 0.5 for CJK semantic proximity, got ${r}`);
});

test("sorensenDiceBigram: CJK unrelated paragraphs → low score", () => {
  const a = "异步编程中的上下文管理器模式";
  const b = "前端设计的色彩搭配原则";
  const r = sorensenDiceBigram(a, b);
  assert.ok(r < 0.3, `expected < 0.3 for unrelated CJK, got ${r}`);
});

test("sorensenDiceBigram: asymmetric lengths do not crash", () => {
  const r = sorensenDiceBigram("abc", "abcdefghijklmnopqrstuvwxyz");
  assert.ok(r >= 0 && r <= 1);
});

test("sorensenDiceBigram: prefix sharing yields moderate score", () => {
  // "hello world" vs "hello world!" share all 10 bigrams of the shorter;
  // longer has 11 bigrams. Dice = 2*10 / (10+11) = 20/21 ≈ 0.952
  const r = sorensenDiceBigram("hello world", "hello world!");
  assert.ok(r > 0.9, `expected > 0.9, got ${r}`);
});

test("sorensenDiceBigram: real experience card titles are NOT duplicates", () => {
  // The 4 existing experience cards should NOT trigger false-positive
  // duplicates. Their titles are about unrelated topics.
  const titles = [
    "js-yaml 5 MAJOR 升级：load() 空字符串行为变化与 try/catch 降级",
    "lychee 链接检查 CI：绝对路径、node_modules 引用与裸 URL 的处理",
    "MCP server 新增工具后客户端描述符缓存过期：需重连刷新才能发现",
    "子 Agent 生成报告的 file:/// 绝对路径陷阱与 CI 兼容性审查",
  ];
  for (let i = 0; i < titles.length; i++) {
    for (let j = i + 1; j < titles.length; j++) {
      const r = sorensenDiceBigram(titles[i], titles[j]);
      // Empirical bound: real-world distinct titles score < 0.5 on bigram.
      // ADR-011 will record the actual values; this guards against the
      // threshold being set so low that real cards trip it.
      assert.ok(
        r < 0.5,
        `distinct titles [${i}]-[${j}] scored ${r}, expected < 0.5`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// tokenize
// ---------------------------------------------------------------------------

test("tokenize: lowercase ASCII", () => {
  assert.deepEqual(tokenize("Hello World"), ["hello", "world"]);
});

test("tokenize: CJK + ASCII mix", () => {
  const tokens = tokenize("js-yaml 5 升级 load");
  assert.deepEqual(tokens, ["js", "yaml", "5", "升级", "load"]);
});

test("tokenize: punctuation filtered", () => {
  assert.deepEqual(tokenize("a, b; c."), ["a", "b", "c"]);
});

test("tokenize: empty string → empty array", () => {
  assert.deepEqual(tokenize(""), []);
});

test("tokenize: only punctuation → empty array", () => {
  assert.deepEqual(tokenize("...---..."), []);
});
