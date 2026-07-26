/**
 * Sanity check: run kb_get_graph against the real KB.
 * Not a unit test — just verifies the tool runs end-to-end.
 */

import { kbGetGraph } from "../src/tools/graph.js";
import { kbGetBacklinks } from "../src/tools/backlinks.js";

async function main() {
  // Default KB_ROOT resolution: cwd() + ".." (run from server/ subdir).
  // Override with KB_ROOT env var only when testing a non-default layout.
  console.log("=== kb_get_graph (default filter) ===");
  const graph = await kbGetGraph({});
  const graphData = JSON.parse(graph.content[0].text as string);
  console.log("totalNodes:", graphData.summary.totalNodes);
  console.log("totalEdges:", graphData.summary.totalEdges);
  console.log("byEdgeType:", graphData.summary.byEdgeType);
  console.log("orphanPages:", graphData.summary.orphanPages);
  console.log("largestCcSize:", graphData.summary.largestCcSize);
  console.log("domains:", graphData.summary.domains);
  console.log("\nFirst 3 nodes:");
  for (const n of graphData.nodes.slice(0, 3)) {
    console.log(
      `  ${n.title} (${n.domain}/${n.type}) inDeg=${n.inDegree} outDeg=${n.outDegree}`,
    );
  }
  console.log("\nFirst 3 edges:");
  for (const e of graphData.edges.slice(0, 3)) {
    console.log(`  ${e.source} → ${e.target} [${e.type}]`);
  }

  // Pick a page with high in-degree for backlinks test.
  const top = [...graphData.nodes].sort((a, b) => b.inDegree - a.inDegree)[0];
  console.log(`\n=== kb_get_backlinks for ${top.title} (inDeg=${top.inDegree}) ===`);
  const bl = await kbGetBacklinks({ page_path: top.path });
  const blData = JSON.parse(bl.content[0].text as string);
  console.log("backlinks:", blData.backlinks.length);
  console.log("outbound:", blData.outbound.length);
  console.log("related:", blData.related.length);
  if (blData.backlinks[0]) {
    console.log("first backlink:", blData.backlinks[0].title);
    console.log("  context:", blData.backlinks[0].context.slice(0, 100));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
