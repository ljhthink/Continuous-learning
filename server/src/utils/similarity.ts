/**
 * Lightweight similarity metrics for duplicate detection in the
 * continuous-evolution KB (ADR-011).
 *
 * No ML dependencies — these are pure-string metrics suitable for a
 * markdown+git project that intentionally avoids vector databases
 * (core deps ≤5, AGENTS.md §1.1).
 *
 *   levenshteinRatio(a, b)   — edit-distance ratio for short strings (titles)
 *   sorensenDiceBigram(a, b) — character bigram Sørensen-Dice coefficient
 *                              for longer text (body)
 *
 * Both are code-point safe via [...str] spread, so surrogate pairs
 * (emoji, extended-plane CJK) count as one character each, not two —
 * a critical correctness property for a KB whose titles mix CJK + ASCII
 * (e.g., "lychee 链接检查 CI：绝对路径、node_modules 引用与裸 URL 的处理").
 */

/**
 * Compute Levenshtein edit-distance ratio between two strings.
 * Returns `1 - dist/maxLen`, so 1.0 = identical, 0.0 = completely different.
 *
 * Code-point safe: spreads both strings to arrays of Unicode code points
 * (via `[...str]`) so surrogate pairs (emoji, extended-plane CJK) count as
 * one character each, not two. Without this, "😀" vs "😁" would show
 * distance=2 on a 2-code-unit string → ratio=0.0, even though both are
 * a single code point that differs by one edit.
 *
 * Complexity: O(m×n) time, O(min(m,n)) space (rolling array). Suitable for
 * short strings (titles <100 chars); for body text use sorensenDiceBigram.
 */
export function levenshteinRatio(a: string, b: string): number {
  const aa = [...a];
  const bb = [...b];
  if (aa.length === 0 && bb.length === 0) return 1.0;
  if (aa.length === 0 || bb.length === 0) return 0.0;
  const maxLen = Math.max(aa.length, bb.length);
  if (maxLen === 1) return aa[0] === bb[0] ? 1.0 : 0.0;

  // Rolling-array DP: prev holds the previous row, curr the current row.
  // dp[j] = edit distance between a[0..i) and b[0..j).
  let prev = new Array<number>(bb.length + 1);
  for (let j = 0; j <= bb.length; j++) prev[j] = j;
  for (let i = 1; i <= aa.length; i++) {
    const curr = new Array<number>(bb.length + 1);
    curr[0] = i;
    for (let j = 1; j <= bb.length; j++) {
      const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,        // deletion
        curr[j - 1] + 1,    // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    prev = curr;
  }
  const dist = prev[bb.length];
  return 1 - dist / maxLen;
}

/**
 * Build the set of character bigrams in a string.
 * Bigrams are formed from consecutive code points; pairs that contain only
 * whitespace are skipped (they add noise without discriminative value —
 * two unrelated paragraphs both contain " \n" bigrams).
 *
 * Code-point safe via `[...str]` spread. Returns an empty set for strings
 * shorter than 2 code points.
 */
export function charBigrams(str: string): Set<string> {
  const chars = [...str];
  const grams = new Set<string>();
  for (let i = 0; i < chars.length - 1; i++) {
    const pair = chars[i] + chars[i + 1];
    if (pair.trim().length > 0) {
      grams.add(pair);
    }
  }
  return grams;
}

/**
 * Sørensen-Dice coefficient on character bigrams: `2|A∩B| / (|A|+|B|)`.
 *
 * Returns 1.0 for identical strings, 0.0 for completely disjoint bigram
 * sets. For CJK text each Han character participates in two bigrams, so
 * two paragraphs sharing 70% of characters score ~0.7 — empirically a
 * good "suspected duplicate" threshold (see ADR-011 for calibration on
 * the project's existing experience cards).
 *
 * Complexity: O(|a|+|b|) time and space. Iterates the smaller set for
 * better constant factors on asymmetric pairs.
 */
export function sorensenDiceBigram(a: string, b: string): number {
  const ga = charBigrams(a);
  const gb = charBigrams(b);
  if (ga.size === 0 && gb.size === 0) return 1.0;
  if (ga.size === 0 || gb.size === 0) return 0.0;
  let intersection = 0;
  const [small, large] = ga.size <= gb.size ? [ga, gb] : [gb, ga];
  for (const g of small) {
    if (large.has(g)) intersection++;
  }
  return (2 * intersection) / (ga.size + gb.size);
}

/**
 * Tokenize text into lowercase alphanumeric tokens (Unicode-aware).
 *
 * Kept for potential future use (e.g., Jaccard baseline) and for tests
 * that want to inspect tokenization. The dedup logic itself uses
 * charBigrams + sorensenDiceBigram for CJK-friendly matching without
 * requiring a CJK word segmenter.
 */
export function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  return matches ?? [];
}
