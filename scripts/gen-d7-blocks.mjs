/**
 * Phase 11 D7 batch 2: features / pricing / FAQ ×2.
 * FAQ → accordion; pricing → list + icon. Run: `bun scripts/gen-d7-blocks.mjs`
 */
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "../src/lib/blocks-registry/d7-batch2.json");

const INK = "#0f172a";
const PAPER = "#f8fafc";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const CARD = "#ffffff";

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

function featureCard(prefix, iconName, title, body) {
  return {
    [prefix]: {
      type: "card",
      props: {
        type: "card",
        children: [`${prefix}-icon`, `${prefix}-h`, `${prefix}-t`],
        direction: "column",
        gap: 12,
        align: "start",
        justify: "start",
      },
      style: {
        backgroundColor: CARD,
        color: INK,
        padding: { t: 20, r: 20, b: 20, l: 20 },
        borderRadius: 12,
        borderWidth: 1,
        borderColor: LINE,
        borderStyle: "solid",
        width: "100%",
      },
    },
    [`${prefix}-icon`]: {
      type: "icon",
      props: { type: "icon", name: iconName, size: 24, strokeWidth: 2 },
      style: { color: INK },
    },
    [`${prefix}-h`]: {
      type: "heading",
      props: { type: "heading", level: 3, content: title },
      style: { fontSize: 18, fontWeight: 700, color: INK },
    },
    [`${prefix}-t`]: {
      type: "text",
      props: { type: "text", content: body },
      style: { fontSize: 14, color: MUTED, lineHeight: 1.5 },
    },
  };
}

const blocks = [
  // —— features ——
  block(
    {
      id: "features-three",
      category: "features",
      name: "จุดเด่นสามการ์ด",
      nameEn: "Three feature cards",
      keywords: ["features", "จุดเด่น", "การ์ด", "ไอคอน"],
      thumb: [
        { x: 6, y: 22, w: 26, h: 40, tone: "fill" },
        { x: 37, y: 22, w: 26, h: 40, tone: "fill" },
        { x: 68, y: 22, w: 26, h: 40, tone: "fill" },
      ],
    },
    "root",
    "title",
    {
      root: {
        type: "section",
        name: "จุดเด่น",
        props: { type: "section", children: ["title", "row"] },
        style: {
          backgroundColor: PAPER,
          color: INK,
          padding: { t: 48, r: 24, b: 48, l: 24 },
        },
        styleBreakpoints: {
          phone: { padding: { t: 32, r: 16, b: 32, l: 16 } },
        },
      },
      title: {
        type: "heading",
        props: { type: "heading", level: 2, content: "ทำไมต้องเลือกเรา" },
        style: {
          fontSize: 28,
          fontWeight: 700,
          color: INK,
          textAlign: "center",
          margin: { t: 0, r: 0, b: 28, l: 0 },
        },
        styleBreakpoints: { phone: { fontSize: 22 } },
      },
      row: {
        type: "container",
        props: {
          type: "container",
          children: ["f1", "f2", "f3"],
          direction: "row",
          gap: 16,
          align: "stretch",
          justify: "start",
        },
        style: { width: "100%" },
      },
      ...featureCard("f1", "zap", "เร็ว", "โหลดเบา แก้ได้ทันทีบนผืนผ้าใบ"),
      ...featureCard("f2", "shield", "มั่นคง", "ส่งออกเป็นหน้าคงที่ ไม่พึ่งสคริปต์"),
      ...featureCard("f3", "layout-grid", "ยืดหยุ่น", "จัดเรียงบล็อกตามโครงที่ต้องการ"),
    },
  ),

  block(
    {
      id: "features-list",
      category: "features",
      name: "จุดเด่นรายการ",
      nameEn: "Feature list",
      keywords: ["features", "จุดเด่น", "รายการ"],
      thumb: [
        { x: 15, y: 18, w: 70, h: 10, tone: "ink" },
        { x: 15, y: 34, w: 70, h: 8, tone: "muted" },
        { x: 15, y: 48, w: 70, h: 8, tone: "muted" },
        { x: 15, y: 62, w: 70, h: 8, tone: "muted" },
      ],
    },
    "root",
    "title",
    {
      root: {
        type: "section",
        name: "จุดเด่น",
        props: { type: "section", children: ["col"] },
        style: {
          backgroundColor: CARD,
          color: INK,
          padding: { t: 40, r: 24, b: 40, l: 24 },
        },
        styleBreakpoints: {
          phone: { padding: { t: 28, r: 16, b: 28, l: 16 } },
        },
      },
      col: {
        type: "container",
        props: {
          type: "container",
          children: ["title", "body", "list"],
          direction: "column",
          gap: 16,
          align: "stretch",
        },
        style: { width: "100%", maxWidth: 560 },
      },
      title: {
        type: "heading",
        props: { type: "heading", level: 2, content: "สิ่งที่ได้ในชุดนี้" },
        style: { fontSize: 26, fontWeight: 700, color: INK },
        styleBreakpoints: { phone: { fontSize: 22 } },
      },
      body: {
        type: "text",
        props: {
          type: "text",
          content: "ครบเครื่องมือพื้นฐานสำหรับสร้างหน้าโปรโมตและหน้าบริการ",
        },
        style: { fontSize: 15, color: MUTED, lineHeight: 1.5 },
      },
      list: {
        type: "list",
        props: {
          type: "list",
          ordered: false,
          marker: "check",
          items: [
            "แผงบล็อกพร้อมหมวดหมู่",
            "ปรับสไตล์แบบเห็นผลทันที",
            "ส่งออก HTML/CSS สะอาด",
            "รองรับหน้าจอแคบด้วยเบรกพอยต์",
          ],
        },
        style: { color: INK, fontSize: 15 },
      },
    },
  ),

  // —— pricing (list + icon) ——
  block(
    {
      id: "pricing-two",
      category: "pricing",
      name: "ราคาสองแผน",
      nameEn: "Two plans",
      keywords: ["pricing", "ราคา", "แพ็กเกจ"],
      thumb: [
        { x: 8, y: 14, w: 40, h: 50, tone: "fill" },
        { x: 52, y: 14, w: 40, h: 50, tone: "accent" },
      ],
    },
    "root",
    "title",
    {
      root: {
        type: "section",
        name: "ราคา",
        props: { type: "section", children: ["title", "row"] },
        style: {
          backgroundColor: PAPER,
          color: INK,
          padding: { t: 48, r: 24, b: 48, l: 24 },
        },
        styleBreakpoints: {
          phone: { padding: { t: 32, r: 16, b: 32, l: 16 } },
        },
      },
      title: {
        type: "heading",
        props: { type: "heading", level: 2, content: "เลือกแผนที่เหมาะกับคุณ" },
        style: {
          fontSize: 28,
          fontWeight: 700,
          color: INK,
          textAlign: "center",
          margin: { t: 0, r: 0, b: 28, l: 0 },
        },
        styleBreakpoints: { phone: { fontSize: 22 } },
      },
      row: {
        type: "container",
        props: {
          type: "container",
          children: ["p1", "p2"],
          direction: "row",
          gap: 20,
          align: "stretch",
        },
        style: { width: "100%" },
      },
      p1: {
        type: "card",
        props: {
          type: "card",
          children: ["p1-icon", "p1-name", "p1-price", "p1-list", "p1-btn"],
          direction: "column",
          gap: 12,
        },
        style: {
          backgroundColor: CARD,
          color: INK,
          padding: { t: 24, r: 20, b: 24, l: 20 },
          borderRadius: 12,
          borderWidth: 1,
          borderColor: LINE,
          borderStyle: "solid",
          width: "100%",
        },
      },
      "p1-icon": {
        type: "icon",
        props: { type: "icon", name: "package", size: 28, strokeWidth: 2 },
        style: { color: INK },
      },
      "p1-name": {
        type: "heading",
        props: { type: "heading", level: 3, content: "พื้นฐาน" },
        style: { fontSize: 18, fontWeight: 700, color: INK },
      },
      "p1-price": {
        type: "text",
        props: { type: "text", content: "฿0 / เดือน" },
        style: { fontSize: 24, fontWeight: 700, color: INK },
      },
      "p1-list": {
        type: "list",
        props: {
          type: "list",
          ordered: false,
          marker: "check",
          items: ["1 โปรเจกต์", "บล็อกพื้นฐาน", "ส่งออกสแตติก"],
        },
        style: { color: MUTED, fontSize: 14 },
      },
      "p1-btn": {
        type: "button",
        props: { type: "button", label: "เริ่มฟรี" },
        style: {
          backgroundColor: INK,
          color: PAPER,
          padding: { t: 12, r: 16, b: 12, l: 16 },
          borderRadius: 8,
          fontSize: 15,
          fontWeight: 600,
        },
      },
      p2: {
        type: "card",
        props: {
          type: "card",
          children: ["p2-icon", "p2-name", "p2-price", "p2-list", "p2-btn"],
          direction: "column",
          gap: 12,
        },
        style: {
          backgroundColor: INK,
          color: PAPER,
          padding: { t: 24, r: 20, b: 24, l: 20 },
          borderRadius: 12,
          width: "100%",
        },
      },
      "p2-icon": {
        type: "icon",
        props: { type: "icon", name: "sparkles", size: 28, strokeWidth: 2 },
        style: { color: PAPER },
      },
      "p2-name": {
        type: "heading",
        props: { type: "heading", level: 3, content: "โปร" },
        style: { fontSize: 18, fontWeight: 700, color: PAPER },
      },
      "p2-price": {
        type: "text",
        props: { type: "text", content: "฿490 / เดือน" },
        style: { fontSize: 24, fontWeight: 700, color: PAPER },
      },
      "p2-list": {
        type: "list",
        props: {
          type: "list",
          ordered: false,
          marker: "check",
          items: ["โปรเจกต์ไม่จำกัด", "พรีเซ็ตและเอฟเฟกต์", "ซัพพอร์ตทางอีเมล"],
        },
        style: { color: PAPER, fontSize: 14 },
      },
      "p2-btn": {
        type: "button",
        props: { type: "button", label: "เลือกโปร" },
        style: {
          backgroundColor: PAPER,
          color: INK,
          padding: { t: 12, r: 16, b: 12, l: 16 },
          borderRadius: 8,
          fontSize: 15,
          fontWeight: 600,
        },
      },
    },
  ),

  block(
    {
      id: "pricing-single",
      category: "pricing",
      name: "ราคาแผนเดียว",
      nameEn: "Single plan",
      keywords: ["pricing", "ราคา", "แผนเดียว"],
      thumb: [
        { x: 20, y: 12, w: 60, h: 14, tone: "ink" },
        { x: 25, y: 34, w: 50, h: 28, tone: "fill" },
      ],
    },
    "root",
    "title",
    {
      root: {
        type: "section",
        name: "ราคา",
        props: { type: "section", children: ["col"] },
        style: {
          backgroundColor: PAPER,
          color: INK,
          padding: { t: 48, r: 24, b: 48, l: 24 },
          textAlign: "center",
        },
        styleBreakpoints: {
          phone: { padding: { t: 32, r: 16, b: 32, l: 16 } },
        },
      },
      col: {
        type: "container",
        props: {
          type: "container",
          children: ["icon", "title", "price", "list", "btn"],
          direction: "column",
          gap: 14,
          align: "center",
        },
        style: {
          width: "100%",
          maxWidth: 420,
          backgroundColor: CARD,
          color: INK,
          padding: { t: 28, r: 24, b: 28, l: 24 },
          borderRadius: 12,
          borderWidth: 1,
          borderColor: LINE,
          borderStyle: "solid",
        },
      },
      icon: {
        type: "icon",
        props: { type: "icon", name: "credit-card", size: 32, strokeWidth: 2 },
        style: { color: INK },
      },
      title: {
        type: "heading",
        props: { type: "heading", level: 2, content: "แผนมาตรฐาน" },
        style: { fontSize: 24, fontWeight: 700, color: INK, textAlign: "center" },
      },
      price: {
        type: "text",
        props: { type: "text", content: "฿290 / เดือน" },
        style: { fontSize: 32, fontWeight: 700, color: INK, textAlign: "center" },
      },
      list: {
        type: "list",
        props: {
          type: "list",
          ordered: false,
          marker: "check",
          items: [
            "แก้ไขไม่จำกัด",
            "พรีวิวอุปกรณ์",
            "ส่งออก ZIP",
            "อัปเดตฟีเจอร์ใหม่",
          ],
        },
        style: { color: MUTED, fontSize: 14, textAlign: "left", width: "100%" },
      },
      btn: {
        type: "button",
        props: { type: "button", label: "สมัครแผนนี้" },
        style: {
          backgroundColor: INK,
          color: PAPER,
          padding: { t: 12, r: 24, b: 12, l: 24 },
          borderRadius: 8,
          fontSize: 16,
          fontWeight: 600,
        },
      },
    },
  ),

  // —— FAQ (accordion) ——
  block(
    {
      id: "faq-accordion",
      category: "faq",
      name: "คำถามพบบ่อย",
      nameEn: "FAQ accordion",
      keywords: ["faq", "คำถาม", "accordion"],
      thumb: [
        { x: 12, y: 14, w: 76, h: 12, tone: "fill" },
        { x: 12, y: 32, w: 76, h: 12, tone: "fill" },
        { x: 12, y: 50, w: 76, h: 12, tone: "fill" },
      ],
    },
    "root",
    "title",
    {
      root: {
        type: "section",
        name: "คำถามที่พบบ่อย",
        props: { type: "section", children: ["col"] },
        style: {
          backgroundColor: PAPER,
          color: INK,
          padding: { t: 48, r: 24, b: 48, l: 24 },
        },
        styleBreakpoints: {
          phone: { padding: { t: 32, r: 16, b: 32, l: 16 } },
        },
      },
      col: {
        type: "container",
        props: {
          type: "container",
          children: ["title", "acc"],
          direction: "column",
          gap: 20,
          align: "stretch",
        },
        style: { width: "100%", maxWidth: 640 },
      },
      title: {
        type: "heading",
        props: { type: "heading", level: 2, content: "คำถามที่พบบ่อย" },
        style: { fontSize: 28, fontWeight: 700, color: INK },
        styleBreakpoints: { phone: { fontSize: 22 } },
      },
      acc: {
        type: "accordion",
        props: {
          type: "accordion",
          open: 0,
          items: [
            {
              label: "ส่งออกแล้วแก้ต่อได้ไหม",
              text: "ได้ — ไฟล์ที่ส่งออกเป็น HTML/CSS ธรรมดา เปิดด้วยเครื่องมือใดก็ได้",
            },
            {
              label: "ต้องเชื่อมเน็ตตอนออกแบบไหม",
              text: "ไม่ต้อง แอปทำงานออฟไลน์และไม่ดึงบล็อกจากเครือข่าย",
            },
            {
              label: "รองรับภาษาไทยไหม",
              text: "รองรับ ทั้งข้อความในบล็อกและแผงเครื่องมือเป็นภาษาไทยเป็นหลัก",
            },
          ],
        },
        style: { width: "100%", color: INK },
      },
    },
  ),

  block(
    {
      id: "faq-compact",
      category: "faq",
      name: "คำถามสั้น",
      nameEn: "Compact FAQ",
      keywords: ["faq", "คำถาม", "สั้น"],
      thumb: [
        { x: 12, y: 20, w: 76, h: 10, tone: "ink" },
        { x: 12, y: 36, w: 76, h: 10, tone: "muted" },
        { x: 12, y: 52, w: 76, h: 10, tone: "muted" },
      ],
    },
    "root",
    "title",
    {
      root: {
        type: "section",
        name: "คำถามที่พบบ่อย",
        props: { type: "section", children: ["col"] },
        style: {
          backgroundColor: CARD,
          color: INK,
          padding: { t: 40, r: 24, b: 40, l: 24 },
          borderRadius: 12,
          borderWidth: 1,
          borderColor: LINE,
          borderStyle: "solid",
        },
        styleBreakpoints: {
          phone: { padding: { t: 24, r: 16, b: 24, l: 16 } },
        },
      },
      col: {
        type: "container",
        props: {
          type: "container",
          children: ["title", "body", "acc"],
          direction: "column",
          gap: 12,
        },
        style: { width: "100%" },
      },
      title: {
        type: "heading",
        props: { type: "heading", level: 2, content: "ยังสงสัยอะไรอยู่ไหม" },
        style: { fontSize: 22, fontWeight: 700, color: INK },
      },
      body: {
        type: "text",
        props: { type: "text", content: "รวมคำตอบสั้น ๆ ที่ทีมสนับสนุนได้บ่อย" },
        style: { fontSize: 14, color: MUTED },
      },
      acc: {
        type: "accordion",
        props: {
          type: "accordion",
          open: -1,
          items: [
            {
              label: "ทดลองใช้ได้นานแค่ไหน",
              text: "แผนพื้นฐานใช้ได้ตลอดโดยไม่มีวันหมดอายุ",
            },
            {
              label: "เปลี่ยนแผนทีหลังได้ไหม",
              text: "ได้ทุกเมื่อ จากหน้าบัญชีของคุณ",
            },
          ],
        },
        style: { width: "100%", color: INK },
      },
    },
  ),
];

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(blocks, null, 2)}\n`);
console.log(`wrote ${blocks.length} blocks → ${outPath}`);
