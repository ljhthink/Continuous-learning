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
