import { writeFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import {
  loadBlocksRegistry,
  resetBlocksRegistryCache,
  builtFromRegistryBlock,
} from "../src/lib/blocks-registry.ts";

resetBlocksRegistryCache();
const list = await loadBlocksRegistry();
const authored = list.filter(
  (b) =>
    b.scope === "page" &&
    !b.id.startsWith("template-") &&
    !b.id.startsWith("elements-"),
);

const root = randomUUID();
const nodes = {
  [root]: {
    id: root,
    type: "page",
    props: { type: "page", children: [] },
    style: { backgroundColor: "#ffffff", color: "#0f172a" },
  },
};
const kids = [];
for (const b of authored) {
  const built = builtFromRegistryBlock(b);
  for (const n of built.nodes) nodes[n.id] = n;
  kids.push(built.sectionId);
}
nodes[root].props.children = kids;

const doc = {
  version: 4,
  meta: { title: "d10-preview", lang: "th" },
  root,
  nodes,
};
const out = join(
  process.env.HOME,
  "agent-tools/p11/e7-ram/preview-blocks.json",
);
writeFileSync(out, JSON.stringify(doc));
console.log("authored", authored.length, "nodes", Object.keys(nodes).length, "->", out);
