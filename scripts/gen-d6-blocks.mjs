/**
 * Author Phase 11 D6 batch 1 blocks (header/hero/footer/CTA ×2) as StyleBlock JSON.
 * Run: `bun scripts/gen-d6-blocks.mjs`
 */
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "../src/lib/blocks-registry/d6-batch1.json");

/** Contrast-safe pairs (literal hex, ≥ 4.5:1). */
const INK = "#0f172a";
const PAPER = "#f8fafc";
const MUTED = "#64748b";
const LINE = "#e2e8f0";

function block(meta, root, focus, nodes) {
  return {
    formatVersion: 1,
    ...meta,
    scope: "page",
    source: { kind: "original" },
    root,
    focus,
    nodes,
  };
}

const blocks = [
  // —— header ——
  block(
    {
      id: "header-bar",
      category: "header",
      name: "แถบหัวแนวนอน",
      nameEn: "Header bar",
      keywords: ["header", "แถบหัว", "เมนู", "nav"],
      thumb: [
        { x: 8, y: 28, w: 28, h: 14, tone: "ink" },
        { x: 50, y: 30, w: 14, h: 10, tone: "muted" },
        { x: 68, y: 30, w: 14, h: 10, tone: "muted" },
        { x: 86, y: 30, w: 6, h: 10, tone: "accent" },
      ],
    },
    "root",
    "brand",
    {
      root: {
        type: "section",
        name: "แถบหัว",
        props: { type: "section", children: ["row"] },
        style: {
          backgroundColor: PAPER,
          color: INK,
          padding: { t: 16, r: 24, b: 16, l: 24 },
          borderWidth: 0,
          borderStyle: "none",
          borderSides: { b: { width: 1, color: LINE, style: "solid" } },
        },
        styleBreakpoints: {
          tablet: { padding: { t: 12, r: 16, b: 12, l: 16 } },
          phone: { padding: { t: 10, r: 12, b: 10, l: 12 } },
        },
      },
      row: {
        type: "container",
        props: {
          type: "container",
          children: ["brand", "nav"],
          direction: "row",
          gap: 24,
          align: "center",
          justify: "between",
        },
        style: { width: "100%" },
      },
      brand: {
        type: "text",
        props: { type: "text", content: "ชื่อเว็บ" },
        style: { fontSize: 18, fontWeight: 700, color: INK },
      },
      nav: {
        type: "container",
        props: {
          type: "container",
          children: ["l1", "l2", "l3"],
          direction: "row",
          gap: 16,
          align: "center",
          justify: "end",
        },
      },
      l1: {
        type: "link",
        props: { type: "link", label: "หน้าแรก", href: "#" },
        style: { fontSize: 14, color: INK, padding: { t: 8, r: 4, b: 8, l: 4 } },
      },
      l2: {
        type: "link",
        props: { type: "link", label: "บริการ", href: "#" },
        style: { fontSize: 14, color: INK, padding: { t: 8, r: 4, b: 8, l: 4 } },
      },
      l3: {
        type: "link",
        props: { type: "link", label: "ติดต่อ", href: "#" },
        style: { fontSize: 14, color: INK, padding: { t: 8, r: 4, b: 8, l: 4 } },
      },
    },
  ),

  block(
    {
      id: "header-stacked",
      category: "header",
      name: "แถบหัวเรียงกลาง",
      nameEn: "Centered header",
      keywords: ["header", "แถบหัว", "กลาง", "เมนู"],
      thumb: [
        { x: 35, y: 12, w: 30, h: 12, tone: "ink" },
        { x: 20, y: 40, w: 18, h: 10, tone: "muted" },
        { x: 41, y: 40, w: 18, h: 10, tone: "muted" },
        { x: 62, y: 40, w: 18, h: 10, tone: "muted" },
      ],
    },
    "root",
    "brand",
    {
      root: {
        type: "section",
        name: "แถบหัว",
        props: { type: "section", children: ["col"] },
        style: {
          backgroundColor: INK,
          color: PAPER,
          padding: { t: 20, r: 24, b: 20, l: 24 },
          textAlign: "center",
        },
        styleBreakpoints: {
          phone: { padding: { t: 14, r: 12, b: 14, l: 12 } },
        },
      },
      col: {
        type: "container",
        props: {
          type: "container",
          children: ["brand", "nav"],
          direction: "column",
          gap: 12,
          align: "center",
          justify: "start",
        },
        style: { width: "100%" },
      },
      brand: {
        type: "text",
        props: { type: "text", content: "ชื่อแบรนด์" },
        style: { fontSize: 20, fontWeight: 700, color: PAPER, textAlign: "center" },
      },
      nav: {
        type: "container",
        props: {
          type: "container",
          children: ["l1", "l2", "l3"],
          direction: "row",
          gap: 12,
          align: "center",
          justify: "center",
        },
      },
      l1: {
        type: "link",
        props: { type: "link", label: "หน้าแรก", href: "#" },
        style: { fontSize: 14, color: PAPER, padding: { t: 8, r: 8, b: 8, l: 8 } },
      },
      l2: {
        type: "link",
        props: { type: "link", label: "ผลงาน", href: "#" },
        style: { fontSize: 14, color: PAPER, padding: { t: 8, r: 8, b: 8, l: 8 } },
      },
      l3: {
        type: "link",
        props: { type: "link", label: "ติดต่อ", href: "#" },
        style: { fontSize: 14, color: PAPER, padding: { t: 8, r: 8, b: 8, l: 8 } },
      },
    },
  ),

  // —— hero ——
  block(
    {
      id: "hero-centered",
      category: "hero",
      name: "ฮีโร่กลางจอ",
      nameEn: "Centered hero",
      keywords: ["hero", "แนะนำ", "หัวข้อ", "ปุ่ม"],
      thumb: [
        { x: 20, y: 16, w: 60, h: 14, tone: "ink" },
        { x: 25, y: 36, w: 50, h: 8, tone: "muted" },
        { x: 30, y: 52, w: 18, h: 12, tone: "accent" },
        { x: 52, y: 52, w: 18, h: 12, tone: "fill" },
      ],
    },
    "root",
    "title",
    {
      root: {
        type: "section",
        name: "ส่วนแนะนำ",
        props: { type: "section", children: ["col"] },
        style: {
          backgroundColor: INK,
          color: PAPER,
          padding: { t: 64, r: 24, b: 64, l: 24 },
          textAlign: "center",
        },
        styleBreakpoints: {
          tablet: { padding: { t: 48, r: 20, b: 48, l: 20 } },
          phone: { padding: { t: 36, r: 16, b: 36, l: 16 } },
        },
      },
      col: {
        type: "container",
        props: {
          type: "container",
          children: ["title", "body", "actions"],
          direction: "column",
          gap: 16,
          align: "center",
          justify: "start",
        },
        style: { width: "100%", maxWidth: 640 },
      },
      title: {
        type: "heading",
        props: { type: "heading", level: 1, content: "สร้างเว็บได้เร็วขึ้น" },
        style: {
          fontSize: 40,
          fontWeight: 700,
          color: PAPER,
          textAlign: "center",
          lineHeight: 1.2,
        },
        styleBreakpoints: {
          tablet: { fontSize: 32 },
          phone: { fontSize: 28 },
        },
      },
      body: {
        type: "text",
        props: {
          type: "text",
          content: "วางโครงหน้าด้วยบล็อกพร้อมใช้ แล้วปรับแต่งสีและข้อความได้ทันที",
        },
        style: { fontSize: 16, color: PAPER, textAlign: "center", lineHeight: 1.5 },
      },
      actions: {
        type: "buttonGroup",
        props: { type: "buttonGroup", children: ["b1", "b2"], direction: "row", gap: 12 },
      },
      b1: {
        type: "button",
        props: { type: "button", label: "เริ่มต้น" },
        style: {
          backgroundColor: PAPER,
          color: INK,
          padding: { t: 12, r: 20, b: 12, l: 20 },
          borderRadius: 8,
          fontSize: 16,
          fontWeight: 600,
        },
      },
      b2: {
        type: "button",
        props: { type: "button", label: "ดูตัวอย่าง" },
        style: {
          backgroundColor: "transparent",
          color: PAPER,
          borderWidth: 1,
          borderColor: PAPER,
          borderStyle: "solid",
          padding: { t: 12, r: 20, b: 12, l: 20 },
          borderRadius: 8,
          fontSize: 16,
        },
      },
    },
  ),

  block(
    {
      id: "hero-split",
      category: "hero",
      name: "ฮีโร่ข้อความและรูป",
      nameEn: "Split hero",
      keywords: ["hero", "split", "รูป", "แนะนำ"],
      thumb: [
        { x: 8, y: 16, w: 40, h: 12, tone: "ink" },
        { x: 8, y: 34, w: 36, h: 8, tone: "muted" },
        { x: 8, y: 50, w: 20, h: 12, tone: "accent" },
        { x: 55, y: 14, w: 37, h: 48, tone: "fill" },
      ],
    },
    "root",
    "title",
    {
      root: {
        type: "section",
        name: "ส่วนแนะนำ",
        props: { type: "section", children: ["row"] },
        style: {
          backgroundColor: PAPER,
          color: INK,
          padding: { t: 48, r: 24, b: 48, l: 24 },
        },
        styleBreakpoints: {
          phone: { padding: { t: 28, r: 16, b: 28, l: 16 } },
        },
      },
      row: {
        type: "container",
        props: {
          type: "container",
          children: ["copy", "media"],
          direction: "row",
          gap: 32,
          align: "center",
          justify: "start",
        },
        style: { width: "100%" },
        styleBreakpoints: {
          // Soft stack cue: full-width children still sit in a row; phone padding
          // on section reduces overflow. True prop-direction stack needs D10 follow-up.
          phone: { width: "100%" },
        },
      },
      copy: {
        type: "container",
        props: {
          type: "container",
          children: ["title", "body", "cta"],
          direction: "column",
          gap: 16,
          align: "stretch",
          justify: "start",
        },
        style: { width: "100%", maxWidth: 420 },
      },
      title: {
        type: "heading",
        props: { type: "heading", level: 1, content: "เรื่องราวของคุณเริ่มที่นี่" },
        style: { fontSize: 36, fontWeight: 700, color: INK, lineHeight: 1.2 },
        styleBreakpoints: {
          tablet: { fontSize: 30 },
          phone: { fontSize: 26 },
        },
      },
      body: {
        type: "text",
        props: {
          type: "text",
          content: "อธิบายสั้น ๆ ว่าเว็บนี้ช่วยใครได้บ้าง และทำไมถึงน่าลอง",
        },
        style: { fontSize: 16, color: MUTED, lineHeight: 1.5 },
      },
      cta: {
        type: "button",
        props: { type: "button", label: "เรียนรู้เพิ่ม" },
        style: {
          backgroundColor: INK,
          color: PAPER,
          padding: { t: 12, r: 20, b: 12, l: 20 },
          borderRadius: 8,
          fontSize: 16,
          fontWeight: 600,
        },
      },
      media: {
        type: "image",
        props: { type: "image", src: { id: "" } },
        style: {
          width: "100%",
          minHeight: 220,
          backgroundColor: LINE,
          borderRadius: 12,
        },
      },
    },
  ),

  // —— footer ——
  block(
    {
      id: "footer-simple",
      category: "footer",
      name: "ท้ายหน้าสั้น",
      nameEn: "Simple footer",
      keywords: ["footer", "ท้ายหน้า", "ลิขสิทธิ์"],
      thumb: [
        { x: 10, y: 40, w: 30, h: 8, tone: "muted" },
        { x: 55, y: 40, w: 12, h: 8, tone: "ink" },
        { x: 70, y: 40, w: 12, h: 8, tone: "ink" },
        { x: 85, y: 40, w: 8, h: 8, tone: "ink" },
      ],
    },
    "root",
    "copy",
    {
      root: {
        type: "section",
        name: "ท้ายหน้า",
        props: { type: "section", children: ["row"] },
        style: {
          backgroundColor: INK,
          color: PAPER,
          padding: { t: 24, r: 24, b: 24, l: 24 },
        },
        styleBreakpoints: {
          phone: { padding: { t: 16, r: 12, b: 16, l: 12 } },
        },
      },
      row: {
        type: "container",
        props: {
          type: "container",
          children: ["copy", "nav"],
          direction: "row",
          gap: 16,
          align: "center",
          justify: "between",
        },
        style: { width: "100%" },
      },
      copy: {
        type: "text",
        props: { type: "text", content: "© 2026 ชื่อเว็บ" },
        style: { fontSize: 14, color: PAPER },
      },
      nav: {
        type: "container",
        props: {
          type: "container",
          children: ["l1", "l2", "l3"],
          direction: "row",
          gap: 12,
          align: "center",
          justify: "end",
        },
      },
      l1: {
        type: "link",
        props: { type: "link", label: "นโยบาย", href: "#" },
        style: { fontSize: 14, color: PAPER, padding: { t: 8, r: 4, b: 8, l: 4 } },
      },
      l2: {
        type: "link",
        props: { type: "link", label: "เงื่อนไข", href: "#" },
        style: { fontSize: 14, color: PAPER, padding: { t: 8, r: 4, b: 8, l: 4 } },
      },
      l3: {
        type: "link",
        props: { type: "link", label: "ติดต่อ", href: "#" },
        style: { fontSize: 14, color: PAPER, padding: { t: 8, r: 4, b: 8, l: 4 } },
      },
    },
  ),

  block(
    {
      id: "footer-columns",
      category: "footer",
      name: "ท้ายหน้าสามคอลัมน์",
      nameEn: "Footer columns",
      keywords: ["footer", "ท้ายหน้า", "คอลัมน์"],
      thumb: [
        { x: 8, y: 16, w: 24, h: 8, tone: "ink" },
        { x: 8, y: 30, w: 20, h: 6, tone: "muted" },
        { x: 38, y: 16, w: 24, h: 8, tone: "ink" },
        { x: 38, y: 30, w: 20, h: 6, tone: "muted" },
        { x: 68, y: 16, w: 24, h: 8, tone: "ink" },
        { x: 68, y: 30, w: 20, h: 6, tone: "muted" },
        { x: 8, y: 55, w: 84, h: 6, tone: "fill" },
      ],
    },
    "root",
    "h1",
    {
      root: {
        type: "section",
        name: "ท้ายหน้า",
        props: { type: "section", children: ["cols", "copy"] },
        style: {
          backgroundColor: PAPER,
          color: INK,
          padding: { t: 40, r: 24, b: 24, l: 24 },
          borderSides: { t: { width: 1, color: LINE, style: "solid" } },
        },
        styleBreakpoints: {
          phone: { padding: { t: 28, r: 16, b: 16, l: 16 } },
        },
      },
      cols: {
        type: "container",
        props: {
          type: "container",
          children: ["c1", "c2", "c3"],
          direction: "row",
          gap: 24,
          align: "start",
          justify: "start",
        },
        style: { width: "100%", margin: { t: 0, r: 0, b: 24, l: 0 } },
      },
      c1: {
        type: "container",
        props: {
          type: "container",
          children: ["h1", "a1", "a2"],
          direction: "column",
          gap: 8,
        },
        style: { width: "100%" },
      },
      h1: {
        type: "heading",
        props: { type: "heading", level: 3, content: "ผลิตภัณฑ์" },
        style: { fontSize: 14, fontWeight: 700, color: INK },
      },
      a1: {
        type: "link",
        props: { type: "link", label: "ภาพรวม", href: "#" },
        style: { fontSize: 14, color: MUTED, padding: { t: 4, r: 0, b: 4, l: 0 } },
      },
      a2: {
        type: "link",
        props: { type: "link", label: "ราคา", href: "#" },
        style: { fontSize: 14, color: MUTED, padding: { t: 4, r: 0, b: 4, l: 0 } },
      },
      c2: {
        type: "container",
        props: {
          type: "container",
          children: ["h2", "b1", "b2"],
          direction: "column",
          gap: 8,
        },
        style: { width: "100%" },
      },
      h2: {
        type: "heading",
        props: { type: "heading", level: 3, content: "บริษัท" },
        style: { fontSize: 14, fontWeight: 700, color: INK },
      },
      b1: {
        type: "link",
        props: { type: "link", label: "เกี่ยวกับ", href: "#" },
        style: { fontSize: 14, color: MUTED, padding: { t: 4, r: 0, b: 4, l: 0 } },
      },
      b2: {
        type: "link",
        props: { type: "link", label: "ข่าว", href: "#" },
        style: { fontSize: 14, color: MUTED, padding: { t: 4, r: 0, b: 4, l: 0 } },
      },
      c3: {
        type: "container",
        props: {
          type: "container",
          children: ["h3", "cLink1", "cLink2"],
          direction: "column",
          gap: 8,
        },
        style: { width: "100%" },
      },
      h3: {
        type: "heading",
        props: { type: "heading", level: 3, content: "ช่วยเหลือ" },
        style: { fontSize: 14, fontWeight: 700, color: INK },
      },
      cLink1: {
        type: "link",
        props: { type: "link", label: "ศูนย์ช่วยเหลือ", href: "#" },
        style: { fontSize: 14, color: MUTED, padding: { t: 4, r: 0, b: 4, l: 0 } },
      },
      cLink2: {
        type: "link",
        props: { type: "link", label: "ติดต่อ", href: "#" },
        style: { fontSize: 14, color: MUTED, padding: { t: 4, r: 0, b: 4, l: 0 } },
      },
      copy: {
        type: "text",
        props: { type: "text", content: "© 2026 ชื่อเว็บ — สงวนลิขสิทธิ์" },
        style: { fontSize: 12, color: MUTED },
      },
    },
  ),

  // —— CTA ——
  block(
    {
      id: "cta-banner",
      category: "cta",
      name: "ชวนทำกลางจอ",
      nameEn: "CTA banner",
      keywords: ["cta", "ชวนทำ", "ปุ่ม"],
      thumb: [
        { x: 20, y: 20, w: 60, h: 12, tone: "ink" },
        { x: 25, y: 38, w: 50, h: 8, tone: "muted" },
        { x: 38, y: 54, w: 24, h: 12, tone: "accent" },
      ],
    },
    "root",
    "title",
    {
      root: {
        type: "section",
        name: "ชวนทำ",
        props: { type: "section", children: ["col"] },
        style: {
          backgroundColor: INK,
          color: PAPER,
          padding: { t: 48, r: 24, b: 48, l: 24 },
          textAlign: "center",
          borderRadius: 12,
        },
        styleBreakpoints: {
          phone: { padding: { t: 32, r: 16, b: 32, l: 16 } },
        },
      },
      col: {
        type: "container",
        props: {
          type: "container",
          children: ["title", "body", "btn"],
          direction: "column",
          gap: 12,
          align: "center",
          justify: "start",
        },
        style: { width: "100%", maxWidth: 560 },
      },
      title: {
        type: "heading",
        props: { type: "heading", level: 2, content: "พร้อมเริ่มต้นแล้วหรือยัง" },
        style: {
          fontSize: 28,
          fontWeight: 700,
          color: PAPER,
          textAlign: "center",
        },
        styleBreakpoints: { phone: { fontSize: 22 } },
      },
      body: {
        type: "text",
        props: { type: "text", content: "ทดลองใช้ฟรี ไม่ต้องผูกบัตร" },
        style: { fontSize: 16, color: PAPER, textAlign: "center" },
      },
      btn: {
        type: "button",
        props: { type: "button", label: "สมัครเลย" },
        style: {
          backgroundColor: PAPER,
          color: INK,
          padding: { t: 12, r: 24, b: 12, l: 24 },
          borderRadius: 8,
          fontSize: 16,
          fontWeight: 600,
        },
      },
    },
  ),

  block(
    {
      id: "cta-split",
      category: "cta",
      name: "ชวนทำซ้ายขวา",
      nameEn: "CTA split",
      keywords: ["cta", "ชวนทำ", "แถบ"],
      thumb: [
        { x: 8, y: 24, w: 50, h: 12, tone: "ink" },
        { x: 8, y: 42, w: 40, h: 8, tone: "muted" },
        { x: 68, y: 30, w: 24, h: 16, tone: "accent" },
      ],
    },
    "root",
    "title",
    {
      root: {
        type: "section",
        name: "ชวนทำ",
        props: { type: "section", children: ["row"] },
        style: {
          backgroundColor: PAPER,
          color: INK,
          padding: { t: 32, r: 24, b: 32, l: 24 },
          borderWidth: 1,
          borderColor: LINE,
          borderStyle: "solid",
          borderRadius: 12,
        },
        styleBreakpoints: {
          phone: { padding: { t: 20, r: 16, b: 20, l: 16 } },
        },
      },
      row: {
        type: "container",
        props: {
          type: "container",
          children: ["copy", "btn"],
          direction: "row",
          gap: 24,
          align: "center",
          justify: "between",
        },
        style: { width: "100%" },
      },
      copy: {
        type: "container",
        props: {
          type: "container",
          children: ["title", "body"],
          direction: "column",
          gap: 8,
        },
        style: { width: "100%" },
      },
      title: {
        type: "heading",
        props: { type: "heading", level: 2, content: "คุยกับทีมเราวันนี้" },
        style: { fontSize: 22, fontWeight: 700, color: INK },
        styleBreakpoints: { phone: { fontSize: 18 } },
      },
      body: {
        type: "text",
        props: { type: "text", content: "ตอบคำถามและช่วยวางแผนหน้าเว็บให้เหมาะกับงานของคุณ" },
        style: { fontSize: 15, color: MUTED, lineHeight: 1.45 },
      },
      btn: {
        type: "button",
        props: { type: "button", label: "นัดคุย" },
        style: {
          backgroundColor: INK,
          color: PAPER,
          padding: { t: 12, r: 20, b: 12, l: 20 },
          borderRadius: 8,
          fontSize: 16,
          fontWeight: 600,
        },
      },
    },
  ),
];

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(blocks, null, 2)}\n`);
console.log(`wrote ${blocks.length} blocks → ${outPath}`);
