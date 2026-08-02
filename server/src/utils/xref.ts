/**
 * Auto cross-reference (auto-xref) utilities for kb_ingest_source.
 *
 * Implements Karpathy LLM Wiki 核心论点：「一个源 ingest 时 touch 5-15 个相关
 * wiki 页的交叉引用」(见 docs/reports/2026-08-02-karpathy-implementation-analysis.md
 * §2.3 #11 与 docs/reports/2026-08-02-missing-features-solution.md §3.3)。
 *
 * 算法来源（联网案例研究）：
 *   - cross-linker skill 的复合打分（同域 +4、共享 tag +2、实体提及 +2）
 *   - LLM Wiki 4-signal 的加权信号（直接 wikilinks、共享源、邻域重叠、类型亲和）
 *   - Semantic Note Network 的双向链接
 *
 * 设计约束：
 *   - 不破坏现有内容：仅在候选页 body 末尾追加 `## Related` 节；若已有该节，追加到节内。
 *   - frontmatter `related` 字段为纯路径数组，禁用 `[[...]]` wikilink（ADR-008，js-yaml 解析多 wikilink 失败）。
 *   - 避免重复链接：先检查候选页 body 是否已含新页链接，已含则跳过。
 *   - 错误隔离：单个候选页更新失败不中断，记 stderr 继续（CLAUDE.md §19.4）。
 *   - 不走 inbox：auto-xref 是 ingest 的辅助操作，不是经验卡，不走两 tier 门禁。
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { readFile, writeFile } from "./fileio.js";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.js";
import type { PageInfo } from "./pages.js";

/** 跳过这些状态的页面（与 lint.ts LINK_GRAPH_SKIP_STATUSES 一致）。 */
const XREF_SKIP_STATUSES = new Set(["pending", "archived", "rejected"]);

export interface XrefCandidate {
  /** relPath (forward slashes, no .md) — 候选页相对路径。 */
  path: string;
  /** 候选页标题。 */
  title: string;
  /** 复合打分。 */
  score: number;
  /** 打分原因列表（用于日志可观测性）。 */
  reasons: string[];
}

export interface XrefOptions {
  /** 最多 touch 多少个候选页（Karpathy 原文 5-15，默认 15）。 */
  limit?: number;
  /** 低于此分数的候选不链接（避免低质量链接污染，默认 3）。 */
  minScore?: number;
}

export interface XrefResult {
  /** 成功更新（追加 ## Related + frontmatter related）的候选页 relPath 列表。 */
  touched: string[];
  /** 跳过的候选页 relPath 列表（已含链接或更新失败）。 */
  skipped: string[];
  /** 全部候选（含分数与原因），用于日志。 */
  candidates: XrefCandidate[];
}

interface NewPageInfo {
  /** 新页 relPath (forward slashes, no .md)。 */
  relPath: string;
  /** 新页 absPath（用于回写 frontmatter related）。 */
  absPath: string;
  /** 新页标题。 */
  title: string;
  /** 新页主 domain。 */
  domain: string;
  /** 新页 tags。 */
  tags: string[];
  /** 新页 body（用于检测候选标题被提及）。 */
  body: string;
}

/**
 * 找出新页的交叉引用候选页。
 *
 * 复合打分（cross-linker 5 信号简化版）：
 *   - 同域 +4（同领域强相关）
 *   - 共享 tag +2 每个，上限 +6（横切标签相关）
 *   - 新页标题在候选 body 被提及 +3（候选页已讨论该主题）
 *   - 候选标题在新页 body 被提及 +3（新页引用了候选主题）
 *
 * 跳过：自己、pending/archived/rejected 状态页。
 */
export function findXrefCandidates(
  newPage: NewPageInfo,
  allPages: PageInfo[],
  options?: XrefOptions,
): XrefCandidate[] {
  const limit = options?.limit ?? 15;
  const minScore = options?.minScore ?? 3;
  const candidates: XrefCandidate[] = [];

  const newTitleLower = newPage.title.toLowerCase();
  const newBodyLower = newPage.body.toLowerCase();

  for (const p of allPages) {
    if (p.relPath === newPage.relPath) continue; // 跳过自己
    if (XREF_SKIP_STATUSES.has(p.status ?? "")) continue;

    let score = 0;
    const reasons: string[] = [];

    // 同域 +4
    if (p.domains.includes(newPage.domain)) {
      score += 4;
      reasons.push(`same domain (${newPage.domain})`);
    }

    // 共享 tag +2 每个，上限 +6
    const sharedTags = p.tags.filter((t) => newPage.tags.includes(t));
    if (sharedTags.length > 0) {
      score += Math.min(sharedTags.length * 2, 6);
      reasons.push(`shared tags [${sharedTags.join(", ")}]`);
    }

    // 新页标题在候选 body 被提及 +3
    if (newPage.title && newTitleLower.length >= 2 && p.body.toLowerCase().includes(newTitleLower)) {
      score += 3;
      reasons.push("candidate body mentions new page title");
    }

    // 候选标题在新页 body 被提及 +3
    if (p.title && p.title.length >= 2 && newBodyLower.includes(p.title.toLowerCase())) {
      score += 3;
      reasons.push("new page body mentions candidate title");
    }

    if (score >= minScore) {
      candidates.push({ path: p.relPath, title: p.title, score, reasons });
    }
  }

  // 按分数降序排序，分数相同按路径字典序（稳定排序）
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.path < b.path ? -1 : 1;
  });
  return candidates.slice(0, limit);
}

/**
 * 对候选页应用交叉引用：在 body 末尾追加 `## Related` 节（含新页 wikilink），
 * 同时在 frontmatter `related` 数组追加新页 relPath。
 *
 * 双向链接：新页 frontmatter related 也要追加候选路径（由 updateNewPageRelated 完成）。
 *
 * 返回 touched（成功更新）与 skipped（已含链接或失败）列表。
 *
 * @param newPage 新页信息
 * @param candidatesWithAbs 候选页列表（含 absPath）
 */
export async function applyXrefWithAbsPaths(
  newPage: NewPageInfo,
  candidatesWithAbs: Array<XrefCandidate & { absPath: string }>,
): Promise<{ touched: string[]; skipped: string[] }> {
  const touched: string[] = [];
  const skipped: string[] = [];
  const newPageLink = `[[${newPage.relPath}]]`;
  const newPageBasename = path.basename(newPage.relPath);

  for (const c of candidatesWithAbs) {
    try {
      const content = await readFile(c.absPath);
      const { frontmatter, body } = parseFrontmatter(content);

      // 检查是否已含新页链接（避免重复链接，cross-linker 规则）
      // 检测 [[newPage.relPath]] 或 [[newPageBasename]] 或 [[newPageBasename|alias]]
      const alreadyLinked =
        body.includes(newPageLink) ||
        body.includes(`[[${newPageBasename}]]`) ||
        body.includes(`[[${newPageBasename}|`);
      if (alreadyLinked) {
        skipped.push(c.path);
        continue;
      }

      // 在 body 末尾追加 ## Related 节
      const relatedLine = `- ${newPageLink} · ${newPage.title}`;
      let newBody = body;
      // 匹配已有的 ## Related 节（容错：可能有大写、空格）
      const relatedSectionRe = /^##\s+Related\s*$/m;
      if (relatedSectionRe.test(newBody)) {
        // 追加到已有 ## Related 节的第一行之后
        newBody = newBody.replace(
          relatedSectionRe,
          `## Related\n\n${relatedLine}`,
        );
      } else {
        // 新增 ## Related 节
        newBody = newBody.trimEnd() + `\n\n## Related\n\n${relatedLine}\n`;
      }

      // 在 frontmatter related 数组追加新页 relPath（纯路径，禁 [[...]]，ADR-008）
      const existingRelated = Array.isArray(frontmatter.related)
        ? frontmatter.related.map(String)
        : [];
      if (!existingRelated.includes(newPage.relPath)) {
        frontmatter.related = [...existingRelated, newPage.relPath];
      }

      await writeFile(c.absPath, serializeFrontmatter(frontmatter, newBody));
      touched.push(c.path);
    } catch (err) {
      // 单个候选页失败不中断（CLAUDE.md §19.4 不吞异常：记 stderr 继续）
      console.error(`[xref] failed to update ${c.path}:`, err);
      skipped.push(c.path);
    }
  }

  return { touched, skipped };
}

/**
 * 在新页 frontmatter related 数组追加候选路径（双向链接的另一半）。
 *
 * 不修改新页 body（新页本身就是被引用的目标，不需要 ## Related 节）。
 * 若 related 字段不存在则创建；若已含某路径则跳过。
 */
export async function updateNewPageRelated(
  newPageAbsPath: string,
  candidatePaths: string[],
): Promise<void> {
  if (candidatePaths.length === 0) return;

  const content = await readFile(newPageAbsPath);
  const { frontmatter, body } = parseFrontmatter(content);

  const existingRelated = Array.isArray(frontmatter.related)
    ? frontmatter.related.map(String)
    : [];

  const toAdd = candidatePaths.filter((p) => !existingRelated.includes(p));
  if (toAdd.length === 0) return; // 无新增，不写盘（幂等）

  frontmatter.related = [...existingRelated, ...toAdd];
  await writeFile(newPageAbsPath, serializeFrontmatter(frontmatter, body));
}

/**
 * 一站式入口：找候选 + 应用双向交叉引用。
 *
 * 用于 kb_ingest_source 内联调用。返回完整结果供日志记录。
 *
 * @param newPage 新页信息（含 absPath）
 * @param allPages 全部已加载页面（caller 调 loadAllPages）
 * @param options 限制与阈值
 */
export async function runAutoXref(
  newPage: NewPageInfo,
  allPages: PageInfo[],
  options?: XrefOptions,
): Promise<XrefResult> {
  // 1. 找候选
  const candidates = findXrefCandidates(newPage, allPages, options);

  if (candidates.length === 0) {
    return { touched: [], skipped: [], candidates: [] };
  }

  // 2. 把 absPath 注入候选（findXrefCandidates 不带 absPath，从 allPages 反查）
  const relToAbs = new Map<string, string>();
  for (const p of allPages) {
    relToAbs.set(p.relPath, p.absPath);
  }
  const candidatesWithAbs = candidates.map((c) => ({
    ...c,
    absPath: relToAbs.get(c.path) ?? "",
  }));

  // 3. 应用到候选页（body ## Related + frontmatter related）
  const { touched, skipped } = await applyXrefWithAbsPaths(
    newPage,
    candidatesWithAbs,
  );

  // 4. 新页 frontmatter related 追加候选路径（双向链接）
  //    只对成功 touch 的候选建立反向链接，避免 related 含指向已跳过页的路径
  if (touched.length > 0) {
    try {
      await updateNewPageRelated(newPage.absPath, touched);
    } catch (err) {
      // 新页 related 回写失败不阻断 ingest 主流程，仅记日志
      console.error(`[xref] failed to update new page related field:`, err);
    }
  }

  return { touched, skipped, candidates };
}
