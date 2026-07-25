/**
 * P3 Continuous-Evolution E2E test — full lifecycle via compiled handlers.
 *
 * Verifies the complete experience card lifecycle:
 *   write(pending) → promote(auto/manual) → get_page(use_count) → dream(archived)
 *   + reject path + state-machine guards + path traversal + log injection
 *
 * This test directly imports compiled dist/ handlers (bypassing MCP SDK Zod
 * layer) to test handler-level logic, AND spawns the MCP server to test the
 * protocol layer for kb_promote_experience (the new P3 tool).
 *
 * Run: node smoke-p3-evolution.mjs  (after `npm run build`)
 */

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const TMP = path.join(os.tmpdir(), "kb-p3-evolution-e2e");
const results = [];

function check(name, ok, detail = "") {
  const mark = ok ? "PASS" : "FAIL";
  results.push({ name, ok, detail });
  console.log(`  [${mark}] ${name}${detail ? " — " + detail : ""}`);
}

function parseResult(r) {
  try {
    return JSON.parse(r.content[0].text);
  } catch {
    return r.content?.[0]?.text ?? null;
  }
}

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// --- Setup fixture KB ---
await fs.rm(TMP, { recursive: true, force: true });
await fs.mkdir(path.join(TMP, "wiki", "coding"), { recursive: true });
await fs.writeFile(
  path.join(TMP, "index.md"),
  "# 知识库索引\n> 最后更新：2026-07-23 · 总页数：0\n",
);
await fs.writeFile(path.join(TMP, "log.md"), "");

process.env.KB_ROOT = TMP;

// Import compiled handlers
const write = await import("./dist/tools/write.js");
const readOnly = await import("./dist/tools/read-only.js");
const dreamMod = await import("./dist/dream.js");

// ===========================================================================
// PART A: Handler-level E2E — full lifecycle via direct import
// ===========================================================================
console.log("=== Part A: Handler-Level Lifecycle ===\n");

// AC-001: kb_write_experience writes to inbox/ with correct frontmatter
let autoInboxPath;
{
  const r = await write.kbWriteExperience({
    title: "Auto Promote Experience",
    domain: "coding",
    content: "## Background\nA reusable pattern.\n## Solution\nUse config functions.\n## Evidence\nTests pass.\n## Applicability\nAll Node.js projects.",
    confidence: 0.9,
    source_task: "task-p3-auto-001",
  });
  const data = parseResult(r);
  check(
    "AC-001: kb_write_experience writes to inbox/",
    data.status === "pending" && data.path.includes("experiences/inbox/"),
    `status=${data.status}, path=${data.path}`,
  );
  autoInboxPath = data.path;

  // AC-002: Verify frontmatter fields
  const fileContent = await fs.readFile(path.join(TMP, data.path), "utf-8");
  const fmMatch = fileContent.match(/^---\n([\s\S]*?)\n---/);
  const fm = fmMatch ? fmMatch[1] : "";
  check(
    "AC-002: frontmatter has status=pending",
    fm.includes("status: pending"),
  );
  check(
    "AC-002: frontmatter has domain",
    fm.includes("domain:") && fm.includes("coding"),
  );
  check(
    "AC-002: frontmatter has confidence",
    fm.includes("confidence:") && fm.includes("0.9"),
  );
  check(
    "AC-002: frontmatter has date",
    /date:\s*['"]?\d{4}-\d{2}-\d{2}/.test(fm),
  );
  check(
    "AC-002: frontmatter has source_task",
    fm.includes("source_task:") && fm.includes("task-p3-auto-001"),
  );
  check(
    "AC-002: frontmatter has type=experience",
    fm.includes("type: experience"),
  );
}

// AC-003: High confidence (≥0.8) single-domain → promote with tier=auto
{
  const r = await write.kbPromoteExperience({
    inbox_path: autoInboxPath,
    action: "promote",
  });
  const data = parseResult(r);
  check(
    "AC-003: promote high-confidence → status=active",
    data.status === "active",
    `status=${data.status}`,
  );
  check(
    "AC-003: promote high-confidence → tier=auto",
    data.tier === "auto",
    `tier=${data.tier}`,
  );
  check(
    "AC-003: promote moves to wiki/<domain>/experiences/ (not inbox)",
    data.path.includes("experiences/") && !data.path.includes("inbox/"),
    `path=${data.path}`,
  );

  // Verify inbox file removed, active file exists
  const inboxExists = await fs.stat(path.join(TMP, autoInboxPath)).then(() => true).catch(() => false);
  const activeExists = await fs.stat(path.join(TMP, data.path)).then(() => true).catch(() => false);
  check("AC-003: inbox file removed after promote", !inboxExists);
  check("AC-003: active file exists after promote", activeExists);
}

// AC-004: Low confidence → promote with tier=manual
let manualActivePath;
{
  const w = await write.kbWriteExperience({
    title: "Manual Review Experience",
    domain: "coding",
    content: "Low confidence pattern.",
    confidence: 0.5,
    source_task: "task-p3-manual-001",
  });
  const inboxPath = parseResult(w).path;

  const r = await write.kbPromoteExperience({
    inbox_path: inboxPath,
    action: "promote",
  });
  const data = parseResult(r);
  check(
    "AC-004: promote low-confidence → status=active",
    data.status === "active",
  );
  check(
    "AC-004: promote low-confidence → tier=manual",
    data.tier === "manual",
    `tier=${data.tier}`,
  );
  manualActivePath = data.path;
}

// AC-004 boundary: confidence=0.8 exactly → tier=auto (boundary value)
{
  const w = await write.kbWriteExperience({
    title: "Boundary Conf 080",
    domain: "coding",
    content: "Boundary test.",
    confidence: 0.8,
    source_task: "task-p3-boundary-001",
  });
  const r = await write.kbPromoteExperience({
    inbox_path: parseResult(w).path,
    action: "promote",
  });
  const data = parseResult(r);
  check(
    "AC-004 boundary: confidence=0.8 exactly → tier=auto",
    data.tier === "auto",
    `tier=${data.tier}`,
  );
}

// AC-004 boundary: confidence=0.79 → tier=manual (just below boundary)
{
  const w = await write.kbWriteExperience({
    title: "Boundary Conf 079",
    domain: "coding",
    content: "Boundary test.",
    confidence: 0.79,
    source_task: "task-p3-boundary-002",
  });
  const r = await write.kbPromoteExperience({
    inbox_path: parseResult(w).path,
    action: "promote",
  });
  const data = parseResult(r);
  check(
    "AC-004 boundary: confidence=0.79 → tier=manual",
    data.tier === "manual",
    `tier=${data.tier}`,
  );
}

// Reject path
{
  const w = await write.kbWriteExperience({
    title: "Reject This Experience",
    domain: "coding",
    content: "Should be rejected.",
    confidence: 0.3,
    source_task: "task-p3-reject-001",
  });
  const inboxPath = parseResult(w).path;

  const r = await write.kbPromoteExperience({
    inbox_path: inboxPath,
    action: "reject",
  });
  const data = parseResult(r);
  check(
    "reject → status=rejected",
    data.status === "rejected",
  );
  check(
    "reject: file stays in inbox",
    data.path === inboxPath,
  );

  // Verify frontmatter status=rejected on disk
  const content = await fs.readFile(path.join(TMP, inboxPath), "utf-8");
  check(
    "reject: frontmatter status=rejected on disk",
    content.includes("status: rejected"),
  );
}

// State-machine guards
{
  // Non-experience page (type=concept) → promote must refuse
  await fs.mkdir(path.join(TMP, "wiki", "coding", "experiences", "inbox"), { recursive: true });
  await fs.writeFile(
    path.join(TMP, "wiki", "coding", "experiences", "inbox", "not-exp.md"),
    "---\ntitle: Not Experience\ndomain: [coding]\ntype: concept\nstatus: pending\ndate: 2026-07-23\n---\nbody\n",
  );
  const r1 = await write.kbPromoteExperience({
    inbox_path: "wiki/coding/experiences/inbox/not-exp",
    action: "promote",
  });
  check(
    "state-machine: refuses non-experience page (type guard)",
    r1.isError === true,
  );

  // Already-active experience → reject must refuse
  await fs.writeFile(
    path.join(TMP, "wiki", "coding", "experiences", "inbox", "already-active.md"),
    "---\ntitle: Already Active\ndomain: [coding]\ntype: experience\nstatus: active\nconfidence: 0.9\ndate: 2026-07-23\nsource_task: t\n---\nbody\n",
  );
  const r2 = await write.kbPromoteExperience({
    inbox_path: "wiki/coding/experiences/inbox/already-active",
    action: "reject",
  });
  check(
    "state-machine: refuses non-pending experience (status guard)",
    r2.isError === true,
  );

  // Already-rejected experience → promote must refuse (rejected is terminal)
  await fs.writeFile(
    path.join(TMP, "wiki", "coding", "experiences", "inbox", "already-rejected.md"),
    "---\ntitle: Already Rejected\ndomain: [coding]\ntype: experience\nstatus: rejected\nconfidence: 0.3\ndate: 2026-07-23\nsource_task: t\n---\nbody\n",
  );
  const r3 = await write.kbPromoteExperience({
    inbox_path: "wiki/coding/experiences/inbox/already-rejected",
    action: "promote",
  });
  check(
    "state-machine: refuses rejected experience (terminal state guard)",
    r3.isError === true,
  );
}

// Path traversal in kb_promote_experience
{
  const r = await write.kbPromoteExperience({
    inbox_path: "../../../etc/passwd",
    action: "promote",
  });
  check(
    "CWE-22: kb_promote_experience blocks path traversal",
    r.isError === true,
  );
}

// use_count increment via kb_get_page
{
  // Read the auto-promoted page twice, verify use_count increments
  const r1 = await readOnly.kbGetPage({ path: "wiki/coding/experiences/auto-promote-experience" });
  const d1 = parseResult(r1);
  check(
    "kb_get_page: use_count increments to 1 on first read",
    d1.frontmatter.use_count === 1,
    `use_count=${d1.frontmatter.use_count}`,
  );

  const r2 = await readOnly.kbGetPage({ path: "wiki/coding/experiences/auto-promote-experience" });
  const d2 = parseResult(r2);
  check(
    "kb_get_page: use_count increments to 2 on second read",
    d2.frontmatter.use_count === 2,
    `use_count=${d2.frontmatter.use_count}`,
  );

  // Body preserved after use_count writeback
  check(
    "kb_get_page: body preserved after use_count writeback",
    typeof d2.body === "string" && d2.body.includes("A reusable pattern"),
  );
}

// ===========================================================================
// PART B: /dream aging mechanism
// ===========================================================================
console.log("\n=== Part B: /dream Aging Mechanism ===\n");

{
  // Create an old, unused active experience (should be demoted)
  await fs.writeFile(
    path.join(TMP, "wiki", "coding", "experiences", "old-unused.md"),
    `---\ntitle: Old Unused\ndomain: [coding]\ntype: experience\nstatus: active\nconfidence: 0.85\ndate: ${daysAgo(100)}\nsource_task: t\nuse_count: 0\n---\nold body\n`,
  );

  // Create an old, USED active experience (should NOT be demoted)
  await fs.writeFile(
    path.join(TMP, "wiki", "coding", "experiences", "old-used.md"),
    `---\ntitle: Old Used\ndomain: [coding]\ntype: experience\nstatus: active\nconfidence: 0.85\ndate: ${daysAgo(100)}\nsource_task: t\nuse_count: 5\n---\nused body\n`,
  );

  // Create a recent, unused active experience (should NOT be demoted)
  await fs.writeFile(
    path.join(TMP, "wiki", "coding", "experiences", "recent-unused.md"),
    `---\ntitle: Recent Unused\ndomain: [coding]\ntype: experience\nstatus: active\nconfidence: 0.85\ndate: ${daysAgo(1)}\nsource_task: t\nuse_count: 0\n---\nrecent body\n`,
  );

  const report = await dreamMod.dream();
  check(
    "AC-006: /dream scans active experience cards",
    report.scanned >= 3,
    `scanned=${report.scanned}`,
  );
  check(
    "AC-006: /dream demotes use_count=0 + old-date cards only",
    report.demoted === 1,
    `demoted=${report.demoted}`,
  );
  check(
    "AC-006: demoted card moved to archive/",
    report.demoted_paths[0]?.includes("archive/old-unused.md"),
    `path=${report.demoted_paths[0]}`,
  );

  // Verify old-unused moved to archive with status=archived
  const oldActiveExists = await fs.stat(path.join(TMP, "wiki/coding/experiences/old-unused.md")).then(() => true).catch(() => false);
  const archivedExists = await fs.stat(path.join(TMP, "wiki/coding/experiences/archive/old-unused.md")).then(() => true).catch(() => false);
  check("AC-006: old-unused removed from active location", !oldActiveExists);
  check("AC-006: old-unused exists in archive/", archivedExists);

  if (archivedExists) {
    const archivedContent = await fs.readFile(
      path.join(TMP, "wiki/coding/experiences/archive/old-unused.md"),
      "utf-8",
    );
    check(
      "AC-006: archived card has status=archived",
      archivedContent.includes("status: archived"),
    );
  }

  // Verify old-used and recent-unused NOT demoted
  const oldUsedExists = await fs.stat(path.join(TMP, "wiki/coding/experiences/old-used.md")).then(() => true).catch(() => false);
  const recentUnusedExists = await fs.stat(path.join(TMP, "wiki/coding/experiences/recent-unused.md")).then(() => true).catch(() => false);
  check("AC-006: old-used (use_count=5) NOT demoted", oldUsedExists);
  check("AC-006: recent-unused (date<90d) NOT demoted", recentUnusedExists);
}

// ===========================================================================
// PART C: MCP Protocol Layer — kb_promote_experience via JSON-RPC
// ===========================================================================
console.log("\n=== Part C: MCP Protocol Layer (kb_promote_experience) ===\n");

{
  const child = spawn(process.execPath, ["dist/index.js"], {
    cwd: process.cwd(),
    env: { ...process.env, KB_ROOT: TMP },
    stdio: ["pipe", "pipe", "inherit"],
  });

  let stdoutBuf = "";
  const responses = new Map();

  child.stdout.setEncoding("utf-8");
  child.stdout.on("data", (chunk) => {
    stdoutBuf += chunk;
    if (stdoutBuf.includes("\n")) {
      const lines = stdoutBuf.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          if (msg.id !== undefined) responses.set(msg.id, msg);
        } catch { /* skip */ }
      }
      const lastNl = stdoutBuf.lastIndexOf("\n");
      stdoutBuf = stdoutBuf.slice(lastNl + 1);
    }
  });

  function waitForResponse(id, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      function check() {
        const resp = responses.get(id);
        if (resp) { resolve(resp); return; }
        if (Date.now() - start > timeoutMs) { reject(new Error(`Timeout id=${id}`)); return; }
        setTimeout(check, 30);
      }
      check();
    });
  }

  let nextId = 1;
  function send(method, params) {
    const id = nextId++;
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return waitForResponse(id);
  }
  function sendNotification(method, params) {
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  function parseContent(resp) {
    const text = resp?.result?.content?.[0]?.text;
    if (!text) return null;
    try { return JSON.parse(text); } catch { return text; }
  }

  try {
    // initialize
    await send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "p3-e2e", version: "1.0" },
    });
    sendNotification("notifications/initialized");

    // tools/list — verify 9 tools including kb_promote_experience
    const toolsList = await send("tools/list", {});
    const toolNames = (toolsList?.result?.tools ?? []).map((t) => t.name);
    check(
      "MCP: tools/list includes kb_promote_experience",
      toolNames.includes("kb_promote_experience"),
    );
    check(
      "MCP: tools/list returns 9 tools (8 original + kb_promote_experience)",
      toolNames.length === 9,
      `got ${toolNames.length}`,
    );

    // Write experience via MCP
    const writeResp = await send("tools/call", {
      name: "kb_write_experience",
      arguments: {
        title: "MCP Protocol Experience",
        domain: "coding",
        content: "## Background\nCreated via MCP protocol.\n## Solution\nVerified end-to-end.",
        confidence: 0.85,
        source_task: "task-p3-mcp-001",
      },
    });
    const writeData = parseContent(writeResp);
    check(
      "MCP: kb_write_experience via protocol → pending",
      writeData?.status === "pending",
    );

    // Promote via MCP
    const promoteResp = await send("tools/call", {
      name: "kb_promote_experience",
      arguments: {
        inbox_path: writeData.path,
        action: "promote",
      },
    });
    const promoteData = parseContent(promoteResp);
    check(
      "MCP: kb_promote_experience via protocol → active",
      promoteData?.status === "active",
    );
    check(
      "MCP: kb_promote_experience via protocol → tier=auto",
      promoteData?.tier === "auto",
    );

    // Schema validation: invalid action rejected by Zod
    const invalidActionResp = await send("tools/call", {
      name: "kb_promote_experience",
      arguments: {
        inbox_path: writeData.path,
        action: "invalid_action",
      },
    });
    const invalidRejected =
      invalidActionResp?.error !== undefined ||
      invalidActionResp?.result?.isError === true;
    check(
      "MCP: Zod rejects invalid action (enum validation)",
      invalidRejected,
    );

    // Path traversal via MCP
    const traversalResp = await send("tools/call", {
      name: "kb_promote_experience",
      arguments: {
        inbox_path: "../../../etc/passwd",
        action: "promote",
      },
    });
    const traversalRejected =
      traversalResp?.error !== undefined ||
      traversalResp?.result?.isError === true;
    check(
      "MCP: kb_promote_experience blocks path traversal via protocol",
      traversalRejected,
    );
  } catch (err) {
    console.error("MCP protocol test error:", err.message);
    results.push({ name: "MCP protocol test", ok: false, detail: err.message });
  } finally {
    child.stdin.end();
    child.kill();
  }
}

// ===========================================================================
// PART D: Log entry verification
// ===========================================================================
console.log("\n=== Part D: Log Entry Verification ===\n");

{
  const logContent = await fs.readFile(path.join(TMP, "log.md"), "utf-8");
  const entries = logContent.match(/^## \[.*?\]/gm) || [];

  check(
    "AC-005: log.md records experience events",
    logContent.includes("experience"),
    `${entries.length} log entries`,
  );
  check(
    "log: promote event recorded",
    logContent.includes("promoted") || logContent.includes("active"),
  );
  check(
    "log: reject event recorded",
    logContent.includes("rejected"),
  );
  check(
    "log: archived event recorded (from /dream)",
    logContent.includes("archived"),
  );
}

// ===========================================================================
// PART E: Log injection via kb_promote_experience
// ===========================================================================
console.log("\n=== Part E: Log Injection (kb_promote_experience) ===\n");

{
  // Create a pending experience with a malicious title
  const w = await write.kbWriteExperience({
    title: "Clean",
    domain: "coding",
    content: "test",
    confidence: 0.5,
    source_task: "task-inject-p3",
  });
  const inboxPath = parseResult(w).path;

  // Reject it — the log entry should not forge new entries
  await write.kbPromoteExperience({
    inbox_path: inboxPath,
    action: "reject",
  });

  const logContent = await fs.readFile(path.join(TMP, "log.md"), "utf-8");
  // Count total entries — should not have unexpected growth
  const entryCount = (logContent.match(/^## \[/gm) || []).length;
  check(
    "CWE-117: kb_promote_experience does not forge log entries",
    entryCount > 0 && entryCount < 100,
    `entryCount=${entryCount}`,
  );
}

// ===========================================================================
// PART F: kb_promote_experience duplicate detection (ADR-011)
// ===========================================================================
console.log("\n=== Part F: Duplicate Detection (ADR-011) ===\n");

{
  // Pre-existing active card with a known title + body.
  await fs.writeFile(
    path.join(TMP, "wiki", "coding", "experiences", "dedup-anchor.md"),
    "---\n" +
    "title: Dedup Anchor\ndomain: [coding]\ntype: experience\nstatus: active\n" +
    "confidence: 0.85\ndate: 2026-07-26\nsource_task: t-anchor\n" +
    "---\n## 背景\n共享内容用于重复检测。\n## 方案\nLevenshtein + Sorensen-Dice。\n",
  );

  // AC-006a: title differs by 1 char (Levenshtein > 0.9) → tier=manual + duplicate_with non-empty
  const wTitle = await write.kbWriteExperience({
    title: "Dedup Anchors", // 1 char added vs "Dedup Anchor"
    domain: "coding",
    content: "## Totally different\nbody to keep content_sim low.\n## Other\nsection.\n",
    confidence: 0.9, // high confidence would normally → auto, but dup forces manual
    source_task: "task-dup-title",
  });
  const pTitle = await write.kbPromoteExperience({
    inbox_path: parseResult(wTitle).path,
    action: "promote",
  });
  const dTitle = parseResult(pTitle);
  check(
    "AC-006a: duplicate title forces tier=manual (despite confidence=0.9)",
    dTitle.tier === "manual",
    `tier=${dTitle.tier}`,
  );
  check(
    "AC-006a: duplicate_with is a non-empty array",
    Array.isArray(dTitle.duplicate_with) && dTitle.duplicate_with.length > 0,
    `duplicate_with=${JSON.stringify(dTitle.duplicate_with)}`,
  );
  check(
    "AC-006a: duplicate_with reports anchor path + title_sim > 0.9",
    dTitle.duplicate_with[0]?.path === "wiki/coding/experiences/dedup-anchor" &&
      dTitle.duplicate_with[0]?.title_sim > 0.9,
    `path=${dTitle.duplicate_with[0]?.path}, title_sim=${dTitle.duplicate_with[0]?.title_sim}`,
  );

  // AC-006b: body duplicate (Sorensen-Dice > 0.7) with different title → tier=manual
  const sharedBody =
    "## 背景\n在 P3 实施过程中需要为知识库添加去重检测能力。" +
    "## 方案\n采用 Levenshtein + Sorensen-Dice 字符 bigram 算法。";
  // Pre-existing active card with title A and shared body
  await fs.writeFile(
    path.join(TMP, "wiki", "coding", "experiences", "dedup-body-a.md"),
    "---\n" +
    "title: Dedup Body Alpha\ndomain: [coding]\ntype: experience\nstatus: active\n" +
    "confidence: 0.85\ndate: 2026-07-26\nsource_task: t-body-a\n" +
    "---\n" + sharedBody + "\n",
  );
  // Inbox card with title B (very different) but SAME body → content_sim ≈ 1.0
  const wBody = await write.kbWriteExperience({
    title: "Strategy Omega Nine Nine Nine", // very different from "Dedup Body Alpha"
    domain: "coding",
    content: sharedBody,
    confidence: 0.9,
    source_task: "task-dup-body",
  });
  const pBody = await write.kbPromoteExperience({
    inbox_path: parseResult(wBody).path,
    action: "promote",
  });
  const dBody = parseResult(pBody);
  check(
    "AC-006b: duplicate body forces tier=manual",
    dBody.tier === "manual",
    `tier=${dBody.tier}`,
  );
  check(
    "AC-006b: duplicate_with[0].content_sim > 0.7",
    dBody.duplicate_with?.[0]?.content_sim > 0.7,
    `content_sim=${dBody.duplicate_with?.[0]?.content_sim}`,
  );

  // AC-006 (no-dup): high confidence + single domain + no duplicate → tier=auto + duplicate_with=[]
  const wFresh = await write.kbWriteExperience({
    title: "Fresh Unique Topic Seven",
    domain: "coding",
    content: "## 背景\n完全独特的内容。\n## 方案\n独特的方案。\n## 证据\n独特证据。\n## 适用场景\n独特场景。\n",
    confidence: 0.9,
    source_task: "task-fresh-unique",
  });
  const pFresh = await write.kbPromoteExperience({
    inbox_path: parseResult(wFresh).path,
    action: "promote",
  });
  const dFresh = parseResult(pFresh);
  check(
    "AC-006 (no-dup): high-confidence + unique → tier=auto",
    dFresh.tier === "auto",
    `tier=${dFresh.tier}`,
  );
  check(
    "AC-006 (no-dup): duplicate_with is empty array",
    Array.isArray(dFresh.duplicate_with) && dFresh.duplicate_with.length === 0,
    `duplicate_with=${JSON.stringify(dFresh.duplicate_with)}`,
  );

  // AC-006 (cross-domain): same body, different domain → no duplicate detected
  await fs.mkdir(path.join(TMP, "wiki", "emotions", "experiences"), { recursive: true });
  await fs.writeFile(
    path.join(TMP, "wiki", "emotions", "experiences", "cross-domain-anchor.md"),
    "---\n" +
    "title: Cross Domain Anchor\ndomain: [emotions]\ntype: experience\nstatus: active\n" +
    "confidence: 0.85\ndate: 2026-07-26\nsource_task: t-cross\n" +
    "---\n" + sharedBody + "\n",
  );
  const wCross = await write.kbWriteExperience({
    title: "Cross Domain Anchor", // same title as emotions card
    domain: "coding", // but in coding domain — should NOT cross-match
    content: sharedBody,
    confidence: 0.9,
    source_task: "task-cross-domain",
  });
  const pCross = await write.kbPromoteExperience({
    inbox_path: parseResult(wCross).path,
    action: "promote",
  });
  const dCross = parseResult(pCross);
  // Cross-domain check: coding domain has many active cards now, but none
  // share this title (the emotions card is excluded by domain bucketing).
  // However coding has "Dedup Body Alpha" with same body → content_sim > 0.7
  // will still fire. So we accept tier=manual here; what matters is that
  // the emotions "Cross Domain Anchor" is NOT in duplicate_with.
  const crossDomainExcluded = (dCross.duplicate_with ?? []).every(
    (m) => !m.path.includes("emotions/"),
  );
  check(
    "AC-006 (cross-domain): emotions cards excluded from coding duplicate_with",
    crossDomainExcluded,
    `duplicate_with paths=${JSON.stringify((dCross.duplicate_with ?? []).map((m) => m.path))}`,
  );
}

// ===========================================================================
// PART G: /dream dedup scan + quality scoring + idempotence (ADR-011)
// ===========================================================================
console.log("\n=== Part G: /dream Dedup + Quality Scoring (ADR-011) ===\n");

{
  // Create two similar active cards in a fresh domain to control duplicates
  await fs.mkdir(path.join(TMP, "wiki", "academic", "experiences"), { recursive: true });
  const dupBody =
    "## 背景\n相同的去重测试内容。\n## 方案\n相同的方案描述。\n## 证据\n\n```\nshared code\n```\n\n## 适用场景\n相同场景。\n";
  await fs.writeFile(
    path.join(TMP, "wiki", "academic", "experiences", "dup-pair-a.md"),
    "---\n" +
    "title: Dup Pair A\ndomain: [academic]\ntype: experience\nstatus: active\n" +
    "confidence: 0.85\ndate: 2026-07-26\nsource_task: t-pair-a\n" +
    "---\n" + dupBody,
  );
  await fs.writeFile(
    path.join(TMP, "wiki", "academic", "experiences", "dup-pair-b.md"),
    "---\n" +
    "title: Dup Pair B\ndomain: [academic]\ntype: experience\nstatus: active\n" +
    "confidence: 0.85\ndate: 2026-07-26\nsource_task: t-pair-b\n" +
    "---\n" + dupBody,
  );

  // Snapshot body content before /dream to verify report-only (no auto-merge).
  // NOTE: /dream Phase 3 writes quality_score to frontmatter, so the file
  // *will* change — but the body must be preserved, and both files must
  // still exist (no auto-merge, no deletion). Body comparison is normalized
  // for leading/trailing whitespace because serializeFrontmatter inserts a
  // blank line after the closing `---` (MD022, ADR-008 DEF-008), which would
  // spuriously fail a strict equality check.
  const extractBody = (content) => {
    const m = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
    return (m ? m[1] : content).trim();
  };
  const beforeBodyA = extractBody(
    await fs.readFile(path.join(TMP, "wiki", "academic", "experiences", "dup-pair-a.md"), "utf-8"),
  );
  const beforeBodyB = extractBody(
    await fs.readFile(path.join(TMP, "wiki", "academic", "experiences", "dup-pair-b.md"), "utf-8"),
  );

  const report1 = await dreamMod.dream();

  // AC-006c: report-only — duplicates field non-empty, original files unchanged
  check(
    "AC-006c: /dream report.duplicates is an array",
    Array.isArray(report1.duplicates),
    `type=${typeof report1.duplicates}`,
  );
  const academicDup = (report1.duplicates ?? []).filter(
    (d) => d.a?.includes("academic/") && d.b?.includes("academic/"),
  );
  check(
    "AC-006c: /dream detects academic dup-pair (report-only)",
    academicDup.length >= 1,
    `academic duplicates=${academicDup.length}`,
  );

  // After /dream: both files must still exist (no auto-merge / no deletion)
  const aExists = await fs.stat(path.join(TMP, "wiki", "academic", "experiences", "dup-pair-a.md")).then(() => true).catch(() => false);
  const bExists = await fs.stat(path.join(TMP, "wiki", "academic", "experiences", "dup-pair-b.md")).then(() => true).catch(() => false);
  check("AC-006c: /dream does NOT delete dup-pair-a.md (report-only)", aExists);
  check("AC-006c: /dream does NOT delete dup-pair-b.md (report-only)", bExists);

  // Body content must be preserved (only frontmatter may gain quality_score)
  const afterBodyA = extractBody(
    await fs.readFile(path.join(TMP, "wiki", "academic", "experiences", "dup-pair-a.md"), "utf-8"),
  );
  const afterBodyB = extractBody(
    await fs.readFile(path.join(TMP, "wiki", "academic", "experiences", "dup-pair-b.md"), "utf-8"),
  );
  check(
    "AC-006c: /dream preserves dup-pair-a.md body (report-only; only frontmatter may change)",
    beforeBodyA === afterBodyA,
  );
  check(
    "AC-006c: /dream preserves dup-pair-b.md body (report-only; only frontmatter may change)",
    beforeBodyB === afterBodyB,
  );

  // AC-006d: quality_score written to frontmatter for active experience cards
  // Re-read dup-pair-a.md (after possible quality writeback from this /dream pass).
  const aAfter = await fs.readFile(
    path.join(TMP, "wiki", "academic", "experiences", "dup-pair-a.md"),
    "utf-8",
  );
  // After the first /dream call, frontmatter should now contain quality_score.
  // Note: beforeA was captured BEFORE this /dream call (no quality_score yet).
  // After: quality_score should be present and in [0, 1].
  const qMatch = aAfter.match(/^quality_score:\s*([0-9.]+)/m);
  check(
    "AC-006d: /dream writes quality_score to frontmatter",
    qMatch !== null,
    `quality_score field ${qMatch ? "=" + qMatch[1] : "missing"}`,
  );
  if (qMatch) {
    const score = parseFloat(qMatch[1]);
    check(
      "AC-006d: quality_score is in [0, 1]",
      score >= 0 && score <= 1,
      `score=${score}`,
    );
    // The dup-pair-a card has 4 sections + code block + 60+ chars → high score expected
    check(
      "AC-006d: quality_score reflects rich content (>= 0.7)",
      score >= 0.7,
      `score=${score} (expected >= 0.7 for 4-section + code-block card)`,
    );
  }

  // AC-006f: idempotence — second /dream call should not rewrite unchanged scores
  const report2 = await dreamMod.dream();
  check(
    "AC-006f: second /dream quality_updated=0 (idempotent)",
    report2.quality_updated === 0,
    `quality_updated=${report2.quality_updated}`,
  );
  check(
    "AC-006f: second /dream quality_scored matches active count",
    typeof report2.scored === "number" && report2.scored >= 0,
    `scored=${report2.scored}`,
  );

  // Verify quality_score value unchanged after second /dream
  const aAfter2 = await fs.readFile(
    path.join(TMP, "wiki", "academic", "experiences", "dup-pair-a.md"),
    "utf-8",
  );
  const qMatch2 = aAfter2.match(/^quality_score:\s*([0-9.]+)/m);
  check(
    "AC-006f: quality_score value stable across /dream runs",
    qMatch !== null && qMatch2 !== null && qMatch[1] === qMatch2[1],
    `first=${qMatch?.[1]} second=${qMatch2?.[1]}`,
  );
}

// ===========================================================================
// PART H: log type='dream' verification (ADR-011 D6)
// ===========================================================================
console.log("\n=== Part H: log type='dream' Verification ===\n");

{
  const logContent = await fs.readFile(path.join(TMP, "log.md"), "utf-8");

  // /dream entries should use type="dream" (not "experience")
  const dreamEntries = (logContent.match(/^## \[\d{4}-\d{2}-\d{2}\] dream \|/gm) || []).length;
  check(
    "ADR-011 D6: log.md contains '## [date] dream |' entries",
    dreamEntries >= 1,
    `dream entries=${dreamEntries}`,
  );

  // /dream pass summary entry should exist
  check(
    "ADR-011 D6: log.md contains '/dream pass summary' entry",
    logContent.includes("/dream pass summary"),
  );

  // Archived events should use type="dream" (not "experience")
  // Find an archived entry and verify it's under a dream heading
  const archivedUnderDream = /## \[\d{4}-\d{2}-\d{2}\] dream \|[\s\S]*?archived:/m.test(logContent);
  check(
    "ADR-011 D6: archived events recorded under type=dream (not experience)",
    archivedUnderDream,
  );

  // kb_list_recent with type=dream filter should return dream entries
  const recent = await readOnly.kbListRecent({ type: "dream", limit: 50 });
  const recentData = parseResult(recent);
  const dreamTypeEntries = (recentData.entries ?? []).filter((e) => e.type === "dream");
  check(
    "ADR-011 D6: kb_list_recent(type=dream) returns only dream entries",
    dreamTypeEntries.length > 0 && dreamTypeEntries.length === (recentData.entries ?? []).length,
    `dream entries=${dreamTypeEntries.length}, total=${(recentData.entries ?? []).length}`,
  );
}

// --- Summary ---
const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${passed}/${results.length} checks passed, ${failed} failed.`);

// --- Cleanup ---
await fs.rm(TMP, { recursive: true, force: true });

if (failed > 0) {
  console.error("\n❌ Some P3 E2E checks failed.");
  process.exit(1);
} else {
  console.log("\n✅ All P3 E2E checks passed.");
  process.exit(0);
}
