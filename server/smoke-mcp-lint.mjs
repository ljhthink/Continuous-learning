/**
 * MCP protocol smoke test for kb_lint (US-005 wiring verification).
 * Spawns the server process with isolated KB_ROOT, sends JSON-RPC over stdio,
 * and verifies the kb_lint tool is registered + callable end-to-end.
 */

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const TMP = path.join(os.tmpdir(), "kb-mcp-lint-smoke");

// --- Setup fixture KB ---
await fs.rm(TMP, { recursive: true, force: true });
await fs.mkdir(path.join(TMP, "wiki", "coding"), { recursive: true });
await fs.writeFile(
  path.join(TMP, "index.md"),
  "# 知识库索引\n> 最后更新：2026-07-22 · 总页数：0\n",
);
await fs.writeFile(path.join(TMP, "log.md"), "");
// One page with missing frontmatter (triggers frontmatter check)
await fs.writeFile(
  path.join(TMP, "wiki", "coding", "no-frontmatter.md"),
  "# No Frontmatter\nThis page has no frontmatter.",
);
// One clean page (no issues expected for it specifically)
await fs.writeFile(
  path.join(TMP, "wiki", "coding", "clean.md"),
  "---\ntitle: Clean\ndomain: [coding]\ntype: concept\nstatus: active\ndate: 2026-07-22\n---\n# Clean\n[[no-frontmatter]]\n",
);

const requests = [
  {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke-test", version: "1.0" },
    },
  },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "kb_lint", arguments: {} },
  },
  {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "kb_lint", arguments: { checks: ["frontmatter"] } },
  },
];

const child = spawn(process.execPath, ["dist/index.js"], {
  cwd: process.cwd(),
  env: { ...process.env, KB_ROOT: TMP },
  stdio: ["pipe", "pipe", "inherit"],
});

let stdoutBuf = "";
child.stdout.setEncoding("utf-8");
child.stdout.on("data", (chunk) => {
  stdoutBuf += chunk;
});

const responses = new Map();

function waitForResponse(id, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function check() {
      const resp = responses.get(id);
      if (resp) {
        resolve(resp);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timeout waiting for response id=${id}`));
        return;
      }
      setTimeout(check, 50);
    }
    check();
  });
}

function parseAndStore(data) {
  for (const line of data.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const msg = JSON.parse(trimmed);
      if (msg.id !== undefined) {
        responses.set(msg.id, msg);
      }
    } catch {
      // skip non-JSON lines (server stderr goes to inherit)
    }
  }
}

let lastParsedLen = 0;
child.stdout.on("data", () => {
  // Try to parse complete lines
  const newData = stdoutBuf.slice(lastParsedLen);
  if (newData.includes("\n")) {
    parseAndStore(stdoutBuf);
    lastParsedLen = stdoutBuf.lastIndexOf("\n") + 1;
  }
});

// Send all requests
for (const req of requests) {
  child.stdin.write(JSON.stringify(req) + "\n");
}

const results = {};
try {
  results.initialize = await waitForResponse(1);
  results.toolsList = await waitForResponse(2);
  results.kbLintAll = await waitForResponse(3);
  results.kbLintFrontmatter = await waitForResponse(4);
} catch (err) {
  console.error("ERROR:", err.message);
  console.error("Raw stdout buffer:\n", stdoutBuf);
  child.kill();
  process.exit(1);
}

child.stdin.end();
child.kill();

// --- Assertions ---
console.log("=== MCP protocol smoke test ===\n");

// 1. initialize response
const initOk =
  results.initialize?.result?.serverInfo?.name === "continuous-learning-kb";
console.log(`✓ ${initOk ? "✓" : "✗"} initialize: server name = ${results.initialize?.result?.serverInfo?.name}`);

// 2. tools/list contains kb_lint
const tools = results.toolsList?.result?.tools ?? [];
const kbLintTool = tools.find((t) => t.name === "kb_lint");
console.log(`  ${kbLintTool ? "✓" : "✗"} tools/list: kb_lint registered (${tools.length} tools total)`);

// 3. kb_lint (all checks) returns issues
const allText = results.kbLintAll?.result?.content?.[0]?.text ?? "{}";
const allData = JSON.parse(allText);
const allIssues = allData.issues ?? [];
const hasFrontmatterIssue = allIssues.some((i) => i.type === "frontmatter");
console.log(`  ${hasFrontmatterIssue ? "✓" : "✗"} kb_lint (all): ${allIssues.length} issues, frontmatter detected = ${hasFrontmatterIssue}`);

// 4. kb_lint (frontmatter only) returns ONLY frontmatter issues
const fmText = results.kbLintFrontmatter?.result?.content?.[0]?.text ?? "{}";
const fmData = JSON.parse(fmText);
const fmIssues = fmData.issues ?? [];
const onlyFrontmatter = fmIssues.every((i) => i.type === "frontmatter");
console.log(`  ${onlyFrontmatter && fmIssues.length > 0 ? "✓" : "✗"} kb_lint (frontmatter only): ${fmIssues.length} issues, all frontmatter = ${onlyFrontmatter}`);

const allPassed =
  initOk &&
  kbLintTool &&
  hasFrontmatterIssue &&
  onlyFrontmatter &&
  fmIssues.length > 0;

// --- Cleanup ---
await fs.rm(TMP, { recursive: true, force: true });

if (allPassed) {
  console.log("\n✅ All MCP protocol assertions passed.");
  process.exit(0);
} else {
  console.log("\n❌ Some assertions failed.");
  console.log("Raw responses:", JSON.stringify(results, null, 2));
  process.exit(1);
}
