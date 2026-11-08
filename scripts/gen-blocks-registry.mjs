/**
 * One-shot: emit Phase 5B blocks + Phase 4 templates as StyleBlock JSON
 * with stable localIds. Run: `bun scripts/gen-blocks-registry.mjs`
 */
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Dynamic import of TS via bun.
const { buildBlock, BLOCKS } = await import("../src/lib/blocks.ts");
const { buildTemplate, TEMPLATES } = await import("../src/lib/templates.ts");

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../src/lib/blocks-registry");
mkdirSync(outDir, { recursive: true });

function toStyleBlock(meta, built) {
  const uuidToLocal = new Map();
  let i = 0;
  for (const n of built.nodes) {
    uuidToLocal.set(n.id, `n${i++}`);
  }
  const remap = (v) => {
    if (typeof v === "string") return uuidToLocal.get(v) ?? v;
    if (Array.isArray(v)) return v.map(remap);
    if (v && typeof v === "object") {
      const o = {};
      for (const [k, val] of Object.entries(v)) o[k] = remap(val);
      return o;
    }
    return v;
  };
  const nodes = {};
  for (const n of built.nodes) {
    const lid = uuidToLocal.get(n.id);
    const entry = {
      type: n.type,
      props: remap(n.props),
    };
    if (n.name) entry.name = n.name;
    if (n.style && Object.keys(n.style).length) entry.style = n.style;
    if (n.states) entry.states = n.states;
    if (n.styleBreakpoints) entry.styleBreakpoints = n.styleBreakpoints;
    nodes[lid] = entry;
  }
  return {
    formatVersion: 1,
    id: meta.id,
    category: meta.category,
    scope: "page",
    name: meta.name,
    nameEn: meta.nameEn,
    keywords: meta.keywords,
    source: { kind: "original" },
    thumb: meta.thumb,
    root: uuidToLocal.get(built.sectionId),
    focus: uuidToLocal.get(built.focusId),
    nodes,
  };
}

const thumbs = {
  card: [{ x: 10, y: 10, w: 80, h: 60, tone: "muted" }],
  alert: [{ x: 10, y: 20, w: 80, h: 40, tone: "accent" }],
  buttons: [
    { x: 10, y: 40, w: 35, h: 16, tone: "fill" },
    { x: 55, y: 40, w: 35, h: 16, tone: "muted" },
  ],
  badge: [{ x: 30, y: 40, w: 40, h: 14, tone: "muted" }],
  divider: [{ x: 10, y: 48, w: 80, h: 2, tone: "ink" }],
  list: [
    { x: 10, y: 20, w: 80, h: 10, tone: "ink" },
    { x: 10, y: 40, w: 80, h: 10, tone: "ink" },
    { x: 10, y: 60, w: 80, h: 10, tone: "ink" },
  ],
  hero: [{ x: 20, y: 20, w: 60, h: 50, tone: "fill" }],
  split: [
    { x: 5, y: 20, w: 40, h: 50, tone: "muted" },
    { x: 55, y: 20, w: 40, h: 50, tone: "fill" },
  ],
  cta: [{ x: 15, y: 25, w: 70, h: 45, tone: "accent" }],
  features: [
    { x: 5, y: 30, w: 28, h: 40, tone: "muted" },
    { x: 36, y: 30, w: 28, h: 40, tone: "muted" },
    { x: 67, y: 30, w: 28, h: 40, tone: "muted" },
  ],
  footer: [{ x: 10, y: 70, w: 80, h: 16, tone: "ink" }],
};

const nameEn = {
  card: "Card",
  alert: "Alert",
  buttons: "Button row",
  badge: "Badge",
  divider: "Divider",
  list: "Text list",
  hero: "Hero",
  split: "Text and image",
  cta: "Call to action",
  features: "Features",
  footer: "Footer",
};

const category = {
  card: "elements",
  alert: "elements",
  buttons: "elements",
  badge: "elements",
  divider: "elements",
  list: "elements",
  hero: "hero",
  split: "features",
  cta: "cta",
  features: "features",
  footer: "footer",
};

const all = [];

for (const b of BLOCKS) {
  const built = buildBlock(b.id);
  all.push(
    toStyleBlock(
      {
        id: `elements-${b.id}`,
        category: category[b.id],
        name: b.name,
        nameEn: nameEn[b.id],
        keywords: [b.id, b.name],
        thumb: thumbs[b.id],
      },
      built,
    ),
  );
}

for (const t of TEMPLATES) {
  const built = buildTemplate(t.id);
  all.push(
    toStyleBlock(
      {
        id: `template-${t.id}`,
        category: category[t.id],
        name: t.name,
        nameEn: nameEn[t.id],
        keywords: [t.id, t.name, t.description],
        thumb: thumbs[t.id],
      },
      built,
    ),
  );
}

writeFileSync(join(outDir, "migrated.json"), JSON.stringify(all, null, 2) + "\n");
console.log(`wrote ${all.length} blocks → ${outDir}/migrated.json`);
