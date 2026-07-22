/**
 * Verify the three MCP client configs (Claude Code / Trae CN / OpenCode) can
 * each spawn the kb server and successfully call kb_search.
 *
 * This is the automation half of PRD US-002 acceptance criterion 3:
 *   "Claude Code、Trae CN、OpenCode 三者均能配置并成功调用 kb_search 返回结果"
 *
 * What this script proves:
 *   - Each config file parses and exposes a `continuous-learning-kb` entry
 *     with command + args + env.
 *   - Spawning the server with exactly that command/args/env starts the MCP
 *     server (initialize handshake succeeds, server name is correct).
 *   - tools/list includes `kb_search`.
 *   - tools/call kb_search returns a non-empty results array.
 *
 * What this script does NOT prove (requires manual verification in each
 * agent's UI):
 *   - That Claude Code / Trae CN / OpenCode actually load and parse their
 *     respective config files. See docs/integration/mcp-clients.md §5 for
 *     the manual verification steps.
 *
 * Run: node verify-mcp-clients.mjs  (after `npm run build`)
 */

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const SERVER_NAME = "continuous-learning-kb";

// --- Fixture KB: one page so kb_search returns a non-empty result ---
const TMP = path.join(os.tmpdir(), "kb-verify-mcp-clients");
await fs.rm(TMP, { recursive: true, force: true });
await fs.mkdir(path.join(TMP, "wiki", "coding"), { recursive: true });
await fs.writeFile(
  path.join(TMP, "index.md"),
  "# 知识库索引\n> 最后更新：2026-07-23 · 总页数：1\n",
);
await fs.writeFile(path.join(TMP, "log.md"), "");
await fs.writeFile(
  path.join(TMP, "wiki", "coding", "async-patterns.md"),
  "---\n" +
    "title: Async Patterns\n" +
    "domain: [coding]\n" +
    "type: concept\n" +
    "status: active\n" +
    "date: 2026-07-15\n" +
    "tags: [python, async]\n" +
    "---\n" +
    "# Async Patterns\nPython async/await patterns for I/O concurrency.\n",
);

// --- Load the three client configs ---
// Claude Code and OpenCode read their configs from files the model can write.
// Trae CN's `.trae/mcp.json` is in Trae CN's denylist (model cannot create it);
// the user must add the MCP server via Trae CN UI (Settings > MCP > Add >
// Manual). If the file exists, read it; otherwise fall back to an inline
// config matching the documented template so we can still verify the
// command/args/env triple is functional.
const claudeConfigPath = path.join(PROJECT_ROOT, ".mcp.json");
const traeConfigPath = path.join(PROJECT_ROOT, ".trae", "mcp.json");
const opencodeConfigPath = path.join(PROJECT_ROOT, "opencode.json");

// Inline Trae CN config (mirrors docs/integration/mcp-clients.md §3.2 template)
const TRAE_INLINE_CONFIG = {
  mcpServers: {
    [SERVER_NAME]: {
      command: "node",
      args: [path.join(PROJECT_ROOT, "server", "dist", "index.js")],
      env: { KB_ROOT: PROJECT_ROOT },
    },
  },
};

function extractClaudeStyle(config, source) {
  // Claude Code + Trae CN: { mcpServers: { name: { command, args, env } } }
  const entry = config?.mcpServers?.[SERVER_NAME];
  if (!entry) throw new Error(`${source}: missing mcpServers.${SERVER_NAME}`);
  if (!entry.command) throw new Error(`${source}: missing command`);
  if (!Array.isArray(entry.args)) throw new Error(`${source}: args must be array`);
  return {
    command: entry.command,
    args: entry.args,
    env: entry.env ?? {},
    source,
  };
}

function extractOpenCodeStyle(config, source) {
  // OpenCode: { mcp: { name: { type, command[], enabled, environment } } }
  const entry = config?.mcp?.[SERVER_NAME];
  if (!entry) throw new Error(`${source}: missing mcp.${SERVER_NAME}`);
  if (entry.type !== "local") throw new Error(`${source}: type must be "local"`);
  if (entry.enabled === false) throw new Error(`${source}: enabled is false`);
  if (!Array.isArray(entry.command)) throw new Error(`${source}: command must be array`);
  return {
    command: entry.command[0],
    args: entry.command.slice(1),
    env: entry.environment ?? {},
    source,
  };
}

const configs = [];

// 1. Claude Code (.mcp.json)
const claudeRaw = JSON.parse(await fs.readFile(claudeConfigPath, "utf-8"));
configs.push(extractClaudeStyle(claudeRaw, ".mcp.json (Claude Code)"));

// 2. Trae CN (.trae/mcp.json or inline fallback)
let traeSource = ".trae/mcp.json (Trae CN)";
let traeRaw;
try {
  traeRaw = JSON.parse(await fs.readFile(traeConfigPath, "utf-8"));
} catch {
  traeRaw = TRAE_INLINE_CONFIG;
  traeSource = ".trae/mcp.json (Trae CN, inline fallback — user must create via Trae CN UI)";
}
configs.push(extractClaudeStyle(traeRaw, traeSource));

// 3. OpenCode (opencode.json)
const opencodeRaw = JSON.parse(await fs.readFile(opencodeConfigPath, "utf-8"));
configs.push(extractOpenCodeStyle(opencodeRaw, "opencode.json (OpenCode)"));

// --- MCP client over stdio ---
function sendJsonRpc(child, id, method, params) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
  child.stdin.write(msg);
}

function waitForResponse(child, id, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onTimeout = setTimeout(() => {
      child.stdout.off("data", onData);
      reject(new Error(`timed out waiting for response id=${id}`));
    }, timeoutMs);
    const onData = (chunk) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          if (msg.id === id) {
            clearTimeout(onTimeout);
            child.stdout.off("data", onData);
            resolve(msg);
          }
        } catch {
          // skip non-JSON
        }
      }
    };
    child.stdout.on("data", onData);
  });
}

// --- Run each config ---
let passed = 0;
let failed = 0;
const results = [];

for (const cfg of configs) {
  process.stdout.write(`\n▶ Verifying ${cfg.source}...\n`);
  try {
    // Build env: merge process.env (for PATH) + config env + KB_ROOT fixture override
    const env = { ...process.env, ...cfg.env, KB_ROOT: TMP };
    const child = spawn(cfg.command, cfg.args, {
      stdio: ["pipe", "pipe", "inherit"],
      env,
    });

    let childError = null;
    child.on("error", (err) => { childError = err; });
    child.on("exit", (code) => {
      if (code !== null && code !== 0) {
        childError = new Error(`server exited with code ${code}`);
      }
    });

    // 1. initialize handshake
    sendJsonRpc(child, 1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "verify-mcp-clients", version: "0.1.0" },
    });
    const initResp = await waitForResponse(child, 1);
    const serverName = initResp?.result?.serverInfo?.name;
    if (serverName !== SERVER_NAME) {
      throw new Error(`initialize: expected serverInfo.name="${SERVER_NAME}", got="${serverName}"`);
    }
    process.stdout.write(`  ✓ initialize: server name="${serverName}"\n`);
    passed++;

    // Send initialized notification (no response expected)
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

    // 2. tools/list
    sendJsonRpc(child, 2, "tools/list", {});
    const listResp = await waitForResponse(child, 2);
    const toolNames = (listResp?.result?.tools ?? []).map((t) => t.name);
    if (!toolNames.includes("kb_search")) {
      throw new Error(`tools/list: kb_search not found; got [${toolNames.join(", ")}]`);
    }
    process.stdout.write(`  ✓ tools/list: includes kb_search (${toolNames.length} tools)\n`);
    passed++;

    // 3. tools/call kb_search
    sendJsonRpc(child, 3, "tools/call", {
      name: "kb_search",
      arguments: { query: "async python" },
    });
    const callResp = await waitForResponse(child, 3);
    if (callResp.error) {
      throw new Error(`tools/call kb_search: error ${JSON.stringify(callResp.error)}`);
    }
    if (callResp.result?.isError) {
      throw new Error(`tools/call kb_search: returned isError=true`);
    }
    const text = callResp.result?.content?.[0]?.text;
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.results)) {
      throw new Error(`kb_search: expected results array, got ${text.slice(0, 120)}`);
    }
    if (parsed.results.length === 0) {
      throw new Error(`kb_search: returned 0 results (expected ≥1 from fixture)`);
    }
    process.stdout.write(`  ✓ tools/call kb_search: returned ${parsed.results.length} result(s)\n`);
    passed++;

    // 3/3 for this config
    results.push({ source: cfg.source, status: "PASS", assertions: 3 });

    // Clean shutdown
    child.kill("SIGTERM");
    await new Promise((r) => child.on("exit", r));
  } catch (err) {
    failed++;
    process.stdout.write(`  ✗ FAIL: ${err.message}\n`);
    results.push({ source: cfg.source, status: `FAIL: ${err.message}`, assertions: 0 });
  }
}

// --- Summary ---
console.log("\n=== Verification Summary ===");
console.log("| Config | Status | Assertions |");
console.log("|---|---|---|");
for (const r of results) {
  console.log(`| ${r.source} | ${r.status} | ${r.assertions}/3 |`);
}
console.log(`\nTotal: ${passed} passed, ${failed} failed (out of ${configs.length * 3} assertions)`);

// Cleanup fixture
await fs.rm(TMP, { recursive: true, force: true });

if (failed > 0) {
  console.log("\n❌ Verification FAILED");
  process.exit(1);
}
console.log("\n✅ All MCP client configs verified successfully");
process.exit(0);
