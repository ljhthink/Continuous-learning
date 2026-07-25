/**
 * Quality scoring rubric for experience cards (ADR-011).
 *
 * Returns a score in [0, 1] across four weighted dimensions:
 *
 *   | dimension               | weight | scoring                                            |
 *   | ----------------------- | ------ | -------------------------------------------------- |
 *   | frontmatter completeness| 0.15   | confidence +0.05, source_task +0.05, tags +0.05    |
 *   | body structure          | 0.35   | each of 4 sections present → +0.0875 (linear)      |
 *   | evidence richness       | 0.25   | body contains a fenced code block → 0.25, else 0   |
 *   | length reasonableness   | 0.25   | 500-5000 code points → 1.0; <500 linear; >5000     |
 *   |                         |        | decays smoothly toward 0.5 (never below)           |
 *
 * The score is recorded in frontmatter `quality_score` by /dream
 * (best-effort, idempotent — see dream.ts). It does NOT gate promote:
 * AGENTS.md §7.4's two-tier review conditions are unchanged. The score
 * is a diagnostic signal for future P4+ triage and `/dream` reports.
 *
 * Code-point safety: length and section matching use `[...str]` spread
 * and the `u` regex flag so surrogate pairs (emoji, extended-plane CJK)
 * behave as single characters.
 *
 * Pure functions, no I/O — unit-testable without a temp KB.
 */

/**
 * Canonical experience-card sections (AGENTS.md §7.2 template).
 *
 * Matching strategy per section name:
 *   - Chinese: match the literal name, then a NEGATIVE lookahead for another
 *     Han character. This avoids false positives on compound words
 *     (背景音乐 should NOT match 背景) while still accepting trailing
 *     punctuation (背景：xxx, 背景 - xxx) or end-of-line.
 *   - English: match the literal name with a `\b` word boundary — standard
 *     word-boundary detection works because ASCII letters are `\w`.
 *
 * The `u` flag enables Unicode-aware regex semantics; the `i` flag makes
 * English matches case-insensitive ("background" matches "Background").
 */
const SECTION_PATTERNS: ReadonlyArray<RegExp> = [
  /^#{1,6}\s+(?:背景(?![\u4e00-\u9fff])|Background\b)/imu,
  /^#{1,6}\s+(?:方案(?![\u4e00-\u9fff])|Solution\b)/imu,
  /^#{1,6}\s+(?:证据(?![\u4e00-\u9fff])|Evidence\b)/imu,
  /^#{1,6}\s+(?:适用场景(?![\u4e00-\u9fff])|Applicable\s+Scenarios?\b|Use\s+Cases?\b)/imu,
];

/** Weight constants — kept as named consts so tests can assert exact arithmetic. */
export const WEIGHTS = {
  frontmatter: 0.15,
  structure: 0.35,
  evidence: 0.25,
  length: 0.25,
} as const;

/** Per-section score: 0.35 weight / 4 sections = 0.0875. */
export const PER_SECTION_SCORE = WEIGHTS.structure / 4; // 0.0875

/** Body-length sweet spot, in code points. */
export const LENGTH_MIN = 500;
export const LENGTH_MAX = 5000;

/**
 * Count how many of the 4 canonical sections are present in the body.
 * Returns 0-4. A section counts once even if both Chinese and English
 * headings appear (each pattern is an OR over language variants).
 *
 * Headings at any level (# through ######) are recognized, matching
 * AGENTS.md §7.2's `##` template leniently.
 */
export function countSections(body: string): number {
  let count = 0;
  for (const pattern of SECTION_PATTERNS) {
    if (pattern.test(body)) count++;
  }
  return count;
}

/**
 * Detect a fenced code block in the body (``` delimiter).
 * Treated as the "evidence" signal per AGENTS.md §7.2 template
 * (`## 证据` section typically contains code snippets or test output).
 */
export function hasCodeBlock(body: string): boolean {
  return /```/.test(body);
}

/**
 * Length reasonableness sub-score in [0, 1].
 *
 *   - len < 500:  linear ramp from 0 → 1 (len/500)
 *   - 500 ≤ len ≤ 5000:  1.0 (sweet spot)
 *   - len > 5000:  smooth decay `0.5 + 0.5 * (5000/len)`,
 *                  approaching but never falling below 0.5
 *
 * Length is measured in Unicode code points ([...body].length) so a
 * Han character or emoji counts as one unit, matching the user-facing
 * notion of "字符" in AGENTS.md.
 */
export function lengthScore(body: string): number {
  const len = [...body].length;
  if (len < LENGTH_MIN) return len / LENGTH_MIN;
  if (len <= LENGTH_MAX) return 1.0;
  return 0.5 + 0.5 * (LENGTH_MAX / len);
}

/**
 * Compute the quality score for an experience card.
 *
 * @param frontmatter Parsed frontmatter (Record<string, unknown>).
 *   Honors `confidence`, `source_task`, `tags` for the completeness dimension.
 * @param body Raw markdown body (no frontmatter).
 * @returns Score in [0, 1]. Always finite — inputs are clamped by construction.
 */
export function scoreExperience(
  frontmatter: Record<string, unknown>,
  body: string,
): number {
  // Dimension 1: frontmatter completeness (max 0.15)
  let fmScore = 0;
  if (
    frontmatter.confidence !== undefined &&
    frontmatter.confidence !== null &&
    frontmatter.confidence !== ""
  ) {
    fmScore += 0.05;
  }
  if (
    frontmatter.source_task !== undefined &&
    frontmatter.source_task !== null &&
    frontmatter.source_task !== ""
  ) {
    fmScore += 0.05;
  }
  if (Array.isArray(frontmatter.tags) && frontmatter.tags.length > 0) {
    fmScore += 0.05;
  }

  // Dimension 2: body structure (max 0.35)
  const sectionCount = countSections(body);
  const structureScore = sectionCount * PER_SECTION_SCORE;

  // Dimension 3: evidence richness (0 or 0.25)
  const evidenceScore = hasCodeBlock(body) ? WEIGHTS.evidence : 0;

  // Dimension 4: length reasonableness (0 to 0.25)
  const lenScore = lengthScore(body) * WEIGHTS.length;

  const total = fmScore + structureScore + evidenceScore + lenScore;
  // Guard against floating-point drift at the upper bound (e.g., 1.0000000001).
  return Math.min(1.0, total);
}
