/**
 * Phase 11 D8 batch 3: testimonials / contact / logoCloud / stats ×2.
 * Run: `bun scripts/gen-d8-blocks.mjs`
 */
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "../src/lib/blocks-registry/d8-batch3.json");

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

const blocks = [
  // —— testimonials ——
  block(
    {
      id: "testimonials-cards",
      category: "testimonials",
      name: "เสียงจากลูกค้าสามใบ",
      nameEn: "Three testimonials",
      keywords: ["testimonials", "รีวิว", "ลูกค้า"],
      thumb: [
        { x: 6, y: 20, w: 26, h: 40, tone: "fill" },
        { x: 37, y: 20, w: 26, h: 40, tone: "fill" },
        { x: 68, y: 20, w: 26, h: 40, tone: "fill" },
      ],
    },
    "root",
    "title",
    {
      root: {
        type: "section",
        name: "เสียงจากลูกค้า",
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
        props: { type: "heading", level: 2, content: "เสียงจากผู้ใช้" },
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
          children: ["c1", "c2", "c3"],
          direction: "row",
          gap: 16,
          align: "stretch",
        },
        style: { width: "100%" },
      },
      c1: {
        type: "card",
        props: {
          type: "card",
          children: ["c1-q", "c1-n"],
          direction: "column",
          gap: 12,
        },
        style: {
          backgroundColor: CARD,
          color: INK,
          padding: { t: 20, r: 16, b: 20, l: 16 },
          borderRadius: 12,
          borderWidth: 1,
          borderColor: LINE,
          borderStyle: "solid",
          width: "100%",
        },
      },
      "c1-q": {
        type: "text",
        props: {
          type: "text",
          content: "“วางหน้าแรกได้ในบ่ายเดียว โดยไม่ต้องเขียนโค้ด”",
        },
        style: { fontSize: 14, color: INK, lineHeight: 1.5 },
      },
      "c1-n": {
        type: "text",
        props: { type: "text", content: "— อานนท์, เจ้าของร้าน" },
        style: { fontSize: 13, color: MUTED },
      },
      c2: {
        type: "card",
        props: {
          type: "card",
          children: ["c2-q", "c2-n"],
          direction: "column",
          gap: 12,
        },
        style: {
          backgroundColor: CARD,
          color: INK,
          padding: { t: 20, r: 16, b: 20, l: 16 },
          borderRadius: 12,
          borderWidth: 1,
          borderColor: LINE,
          borderStyle: "solid",
          width: "100%",
        },
      },
      "c2-q": {
        type: "text",
        props: {
          type: "text",
          content: "“ส่งออกแล้วเอาไปโฮสต์เองได้ทันที ไฟล์เบาดี”",
        },
        style: { fontSize: 14, color: INK, lineHeight: 1.5 },
      },
      "c2-n": {
        type: "text",
        props: { type: "text", content: "— พิมพ์ใจ, ฟรีแลนซ์" },
        style: { fontSize: 13, color: MUTED },
      },
      c3: {
        type: "card",
        props: {
          type: "card",
          children: ["c3-q", "c3-n"],
          direction: "column",
          gap: 12,
        },
        style: {
          backgroundColor: CARD,
          color: INK,
          padding: { t: 20, r: 16, b: 20, l: 16 },
          borderRadius: 12,
          borderWidth: 1,
          borderColor: LINE,
          borderStyle: "solid",
          width: "100%",
        },
      },
      "c3-q": {
        type: "text",
        props: {
          type: "text",
          content: "“ทีมการตลาดปรับข้อความเองได้ โดยไม่ต้องรอนักพัฒนา”",
        },
        style: { fontSize: 14, color: INK, lineHeight: 1.5 },
      },
      "c3-n": {
        type: "text",
        props: { type: "text", content: "— กิตติ, ผู้จัดการผลิตภัณฑ์" },
        style: { fontSize: 13, color: MUTED },
      },
    },
  ),

  block(
    {
      id: "testimonials-quote",
      category: "testimonials",
      name: "คำชมเด่น",
      nameEn: "Featured quote",
      keywords: ["testimonials", "quote", "คำชม"],
      thumb: [
        { x: 18, y: 22, w: 64, h: 14, tone: "ink" },
        { x: 28, y: 44, w: 44, h: 8, tone: "muted" },
      ],
    },
    "root",
    "quote",
    {
      root: {
        type: "section",
        name: "เสียงจากลูกค้า",
        props: { type: "section", children: ["col"] },
        style: {
          backgroundColor: INK,
          color: PAPER,
          padding: { t: 56, r: 24, b: 56, l: 24 },
          textAlign: "center",
        },
        styleBreakpoints: {
          phone: { padding: { t: 36, r: 16, b: 36, l: 16 } },
        },
      },
      col: {
        type: "container",
        props: {
          type: "container",
          children: ["quote", "name"],
          direction: "column",
          gap: 16,
          align: "center",
        },
        style: { width: "100%", maxWidth: 640 },
      },
      quote: {
        type: "text",
        props: {
          type: "text",
          content: "“เครื่องมือที่ช่วยให้เราส่งแคมเปญได้เร็วขึ้นโดยไม่เสียคุณภาพ”",
        },
        style: {
          fontSize: 22,
          fontWeight: 500,
          color: PAPER,
          textAlign: "center",
          lineHeight: 1.45,
        },
        styleBreakpoints: { phone: { fontSize: 18 } },
      },
      name: {
        type: "text",
        props: { type: "text", content: "สุนิสา · หัวหน้าทีมเนื้อหา" },
        style: { fontSize: 14, color: PAPER, textAlign: "center", opacity: 0.85 },
      },
    },
  ),

  // —— contact ——
  block(
    {
      id: "contact-split",
      category: "contact",
      name: "ติดต่อข้อความและฟอร์ม",
      nameEn: "Contact split",
      keywords: ["contact", "ติดต่อ", "ฟอร์ม"],
      thumb: [
        { x: 8, y: 16, w: 40, h: 48, tone: "muted" },
        { x: 52, y: 16, w: 40, h: 48, tone: "fill" },
      ],
    },
    "root",
    "title",
    {
      root: {
        type: "section",
        name: "ติดต่อ",
        props: { type: "section", children: ["row"] },
        style: {
          backgroundColor: PAPER,
          color: INK,
          padding: { t: 48, r: 24, b: 48, l: 24 },
        },
        styleBreakpoints: {
          phone: { padding: { t: 32, r: 16, b: 32, l: 16 } },
        },
      },
      row: {
        type: "container",
        props: {
          type: "container",
          children: ["info", "form"],
          direction: "row",
          gap: 32,
          align: "start",
        },
        style: { width: "100%" },
      },
      info: {
        type: "container",
        props: {
          type: "container",
          children: ["title", "body", "mail", "phone"],
          direction: "column",
          gap: 12,
        },
        style: { width: "100%" },
      },
      title: {
        type: "heading",
        props: { type: "heading", level: 2, content: "ติดต่อเรา" },
        style: { fontSize: 28, fontWeight: 700, color: INK },
        styleBreakpoints: { phone: { fontSize: 22 } },
      },
      body: {
        type: "text",
        props: {
          type: "text",
          content: "บอกเป้าหมายของหน้าเว็บ แล้วทีมจะช่วยแนะนำโครงที่เหมาะสม",
        },
        style: { fontSize: 15, color: MUTED, lineHeight: 1.5 },
      },
      mail: {
        type: "text",
        props: { type: "text", content: "hello@example.com" },
        style: { fontSize: 14, color: INK },
      },
      phone: {
        type: "text",
        props: { type: "text", content: "02-000-0000" },
        style: { fontSize: 14, color: INK },
      },
      form: {
        type: "container",
        props: {
          type: "container",
          children: ["f-name", "f-email", "f-msg", "f-btn"],
          direction: "column",
          gap: 12,
        },
        style: {
          width: "100%",
          backgroundColor: CARD,
          color: INK,
          padding: { t: 20, r: 16, b: 20, l: 16 },
          borderRadius: 12,
          borderWidth: 1,
          borderColor: LINE,
          borderStyle: "solid",
        },
      },
      "f-name": {
        type: "input",
        props: { type: "input", label: "ชื่อ", placeholder: "ชื่อของคุณ" },
        style: { width: "100%" },
      },
      "f-email": {
        type: "input",
        props: { type: "input", label: "อีเมล", placeholder: "you@example.com" },
        style: { width: "100%" },
      },
      "f-msg": {
        type: "textarea",
        props: {
          type: "textarea",
          label: "ข้อความ",
          placeholder: "เล่าคร่าว ๆ ว่าต้องการอะไร",
        },
        style: { width: "100%" },
      },
      "f-btn": {
        type: "button",
        props: { type: "button", label: "ส่งข้อความ" },
        style: {
          backgroundColor: INK,
          color: PAPER,
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
      id: "contact-simple",
      category: "contact",
      name: "ติดต่อสั้น",
      nameEn: "Simple contact",
      keywords: ["contact", "ติดต่อ"],
      thumb: [
        { x: 20, y: 18, w: 60, h: 12, tone: "ink" },
        { x: 25, y: 38, w: 50, h: 8, tone: "muted" },
        { x: 35, y: 54, w: 30, h: 12, tone: "accent" },
      ],
    },
    "root",
    "title",
    {
      root: {
        type: "section",
        name: "ติดต่อ",
        props: { type: "section", children: ["col"] },
        style: {
          backgroundColor: INK,
          color: PAPER,
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
          children: ["title", "body", "btn"],
          direction: "column",
          gap: 14,
          align: "center",
        },
        style: { width: "100%", maxWidth: 480 },
      },
      title: {
        type: "heading",
        props: { type: "heading", level: 2, content: "อยากคุยกันไหม" },
        style: { fontSize: 26, fontWeight: 700, color: PAPER, textAlign: "center" },
      },
      body: {
        type: "text",
        props: { type: "text", content: "ส่งอีเมลมาที่ hello@example.com" },
        style: { fontSize: 15, color: PAPER, textAlign: "center" },
      },
      btn: {
        type: "button",
        props: { type: "button", label: "เขียนอีเมล" },
        style: {
          backgroundColor: PAPER,
          color: INK,
          padding: { t: 12, r: 20, b: 12, l: 20 },
          borderRadius: 8,
          fontSize: 15,
          fontWeight: 600,
        },
      },
    },
  ),

  // —— logo cloud (neutral boxes, generic names) ——
  block(
    {
      id: "logo-cloud-row",
      category: "logoCloud",
      name: "โลโก้พันธมิตรแถวเดียว",
      nameEn: "Logo cloud row",
      keywords: ["logo", "partners", "โลโก้"],
      thumb: [
        { x: 8, y: 30, w: 18, h: 16, tone: "fill" },
        { x: 30, y: 30, w: 18, h: 16, tone: "fill" },
        { x: 52, y: 30, w: 18, h: 16, tone: "fill" },
        { x: 74, y: 30, w: 18, h: 16, tone: "fill" },
      ],
    },
    "root",
    "title",
    {
      root: {
        type: "section",
        name: "โลโก้พันธมิตร",
        props: { type: "section", children: ["title", "row"] },
        style: {
          backgroundColor: PAPER,
          color: INK,
          padding: { t: 40, r: 24, b: 40, l: 24 },
        },
        styleBreakpoints: {
          phone: { padding: { t: 28, r: 16, b: 28, l: 16 } },
        },
      },
      title: {
        type: "heading",
        props: { type: "heading", level: 2, content: "ได้รับความไว้วางใจจาก" },
        style: {
          fontSize: 18,
          fontWeight: 600,
          color: MUTED,
          textAlign: "center",
          margin: { t: 0, r: 0, b: 24, l: 0 },
        },
      },
      row: {
        type: "container",
        props: {
          type: "container",
          children: ["l1", "l2", "l3", "l4"],
          direction: "row",
          gap: 16,
          align: "center",
          justify: "center",
        },
        style: { width: "100%" },
      },
      l1: {
        type: "container",
        name: "พันธมิตร ก",
        props: { type: "container", children: [], direction: "column" },
        style: {
          width: "100%",
          minHeight: 48,
          backgroundColor: LINE,
          borderRadius: 8,
        },
      },
      l2: {
        type: "container",
        name: "พันธมิตร ข",
        props: { type: "container", children: [], direction: "column" },
        style: {
          width: "100%",
          minHeight: 48,
          backgroundColor: LINE,
          borderRadius: 8,
        },
      },
      l3: {
        type: "container",
        name: "พันธมิตร ค",
        props: { type: "container", children: [], direction: "column" },
        style: {
          width: "100%",
          minHeight: 48,
          backgroundColor: LINE,
          borderRadius: 8,
        },
      },
      l4: {
        type: "container",
        name: "พันธมิตร ง",
        props: { type: "container", children: [], direction: "column" },
        style: {
          width: "100%",
          minHeight: 48,
          backgroundColor: LINE,
          borderRadius: 8,
        },
      },
    },
  ),

  block(
    {
      id: "logo-cloud-grid",
      category: "logoCloud",
      name: "โลโก้พันธมิตรตาราง",
      nameEn: "Logo cloud grid",
      keywords: ["logo", "grid", "โลโก้"],
      thumb: [
        { x: 12, y: 18, w: 34, h: 18, tone: "fill" },
        { x: 54, y: 18, w: 34, h: 18, tone: "fill" },
        { x: 12, y: 44, w: 34, h: 18, tone: "fill" },
        { x: 54, y: 44, w: 34, h: 18, tone: "fill" },
      ],
    },
    "root",
    "title",
    {
      root: {
        type: "section",
        name: "โลโก้พันธมิตร",
        props: { type: "section", children: ["title", "grid"] },
        style: {
          backgroundColor: CARD,
          color: INK,
          padding: { t: 40, r: 24, b: 40, l: 24 },
        },
        styleBreakpoints: {
          phone: { padding: { t: 28, r: 16, b: 28, l: 16 } },
        },
      },
      title: {
        type: "heading",
        props: { type: "heading", level: 2, content: "องค์กรที่ร่วมงาน" },
        style: {
          fontSize: 22,
          fontWeight: 700,
          color: INK,
          textAlign: "center",
          margin: { t: 0, r: 0, b: 20, l: 0 },
        },
      },
      grid: {
        type: "container",
        props: {
          type: "container",
          children: ["r1", "r2"],
          direction: "column",
          gap: 12,
        },
        style: { width: "100%" },
      },
      r1: {
        type: "container",
        props: {
          type: "container",
          children: ["a1", "a2"],
          direction: "row",
          gap: 12,
        },
        style: { width: "100%" },
      },
      r2: {
        type: "container",
        props: {
          type: "container",
          children: ["a3", "a4"],
          direction: "row",
          gap: 12,
        },
        style: { width: "100%" },
      },
      a1: {
        type: "container",
        name: "องค์กร 1",
        props: { type: "container", children: [] },
        style: {
          width: "100%",
          minHeight: 56,
          backgroundColor: LINE,
          borderRadius: 8,
        },
      },
      a2: {
        type: "container",
        name: "องค์กร 2",
        props: { type: "container", children: [] },
        style: {
          width: "100%",
          minHeight: 56,
          backgroundColor: LINE,
          borderRadius: 8,
        },
      },
      a3: {
        type: "container",
        name: "องค์กร 3",
        props: { type: "container", children: [] },
        style: {
          width: "100%",
          minHeight: 56,
          backgroundColor: LINE,
          borderRadius: 8,
        },
      },
      a4: {
        type: "container",
        name: "องค์กร 4",
        props: { type: "container", children: [] },
        style: {
          width: "100%",
          minHeight: 56,
          backgroundColor: LINE,
          borderRadius: 8,
        },
      },
    },
  ),

  // —— stats ——
  block(
    {
      id: "stats-row",
      category: "stats",
      name: "ตัวเลขเด่นแถวเดียว",
      nameEn: "Stats row",
      keywords: ["stats", "ตัวเลข", "metrics"],
      thumb: [
        { x: 8, y: 24, w: 24, h: 28, tone: "ink" },
        { x: 38, y: 24, w: 24, h: 28, tone: "ink" },
        { x: 68, y: 24, w: 24, h: 28, tone: "ink" },
      ],
    },
    "root",
    "s1-n",
    {
      root: {
        type: "section",
        name: "ตัวเลขเด่น",
        props: { type: "section", children: ["row"] },
        style: {
          backgroundColor: INK,
          color: PAPER,
          padding: { t: 40, r: 24, b: 40, l: 24 },
        },
        styleBreakpoints: {
          phone: { padding: { t: 28, r: 16, b: 28, l: 16 } },
        },
      },
      row: {
        type: "container",
        props: {
          type: "container",
          children: ["s1", "s2", "s3"],
          direction: "row",
          gap: 16,
          align: "stretch",
          justify: "center",
        },
        style: { width: "100%" },
      },
      s1: {
        type: "container",
        props: {
          type: "container",
          children: ["s1-n", "s1-l"],
          direction: "column",
          gap: 4,
          align: "center",
        },
        style: { width: "100%" },
      },
      "s1-n": {
        type: "text",
        props: { type: "text", content: "12k+" },
        style: {
          fontSize: 32,
          fontWeight: 700,
          color: PAPER,
          textAlign: "center",
        },
      },
      "s1-l": {
        type: "text",
        props: { type: "text", content: "หน้าเว็บที่สร้าง" },
        style: { fontSize: 14, color: PAPER, textAlign: "center", opacity: 0.85 },
      },
      s2: {
        type: "container",
        props: {
          type: "container",
          children: ["s2-n", "s2-l"],
          direction: "column",
          gap: 4,
          align: "center",
        },
        style: { width: "100%" },
      },
      "s2-n": {
        type: "text",
        props: { type: "text", content: "98%" },
        style: {
          fontSize: 32,
          fontWeight: 700,
          color: PAPER,
          textAlign: "center",
        },
      },
      "s2-l": {
        type: "text",
        props: { type: "text", content: "ความพึงพอใจ" },
        style: { fontSize: 14, color: PAPER, textAlign: "center", opacity: 0.85 },
      },
      s3: {
        type: "container",
        props: {
          type: "container",
          children: ["s3-n", "s3-l"],
          direction: "column",
          gap: 4,
          align: "center",
        },
        style: { width: "100%" },
      },
      "s3-n": {
        type: "text",
        props: { type: "text", content: "4.9" },
        style: {
          fontSize: 32,
          fontWeight: 700,
          color: PAPER,
          textAlign: "center",
        },
      },
      "s3-l": {
        type: "text",
        props: { type: "text", content: "คะแนนเฉลี่ย" },
        style: { fontSize: 14, color: PAPER, textAlign: "center", opacity: 0.85 },
      },
    },
  ),

  block(
    {
      id: "stats-cards",
      category: "stats",
      name: "ตัวเลขเด่นการ์ด",
      nameEn: "Stats cards",
      keywords: ["stats", "ตัวเลข", "การ์ด"],
      thumb: [
        { x: 8, y: 20, w: 40, h: 36, tone: "fill" },
        { x: 52, y: 20, w: 40, h: 36, tone: "fill" },
      ],
    },
    "root",
    "title",
    {
      root: {
        type: "section",
        name: "ตัวเลขเด่น",
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
        props: { type: "heading", level: 2, content: "ผลลัพธ์โดยรวม" },
        style: {
          fontSize: 26,
          fontWeight: 700,
          color: INK,
          textAlign: "center",
          margin: { t: 0, r: 0, b: 24, l: 0 },
        },
      },
      row: {
        type: "container",
        props: {
          type: "container",
          children: ["a", "b"],
          direction: "row",
          gap: 16,
          align: "stretch",
        },
        style: { width: "100%" },
      },
      a: {
        type: "card",
        props: {
          type: "card",
          children: ["a-n", "a-l"],
          direction: "column",
          gap: 8,
          align: "center",
        },
        style: {
          backgroundColor: CARD,
          color: INK,
          padding: { t: 24, r: 16, b: 24, l: 16 },
          borderRadius: 12,
          borderWidth: 1,
          borderColor: LINE,
          borderStyle: "solid",
          width: "100%",
        },
      },
      "a-n": {
        type: "text",
        props: { type: "text", content: "3×" },
        style: { fontSize: 36, fontWeight: 700, color: INK, textAlign: "center" },
      },
      "a-l": {
        type: "text",
        props: { type: "text", content: "เร็วขึ้นกว่าเวิร์กโฟลว์เดิม" },
        style: { fontSize: 14, color: MUTED, textAlign: "center" },
      },
      b: {
        type: "card",
        props: {
          type: "card",
          children: ["b-n", "b-l"],
          direction: "column",
          gap: 8,
          align: "center",
        },
        style: {
          backgroundColor: CARD,
          color: INK,
          padding: { t: 24, r: 16, b: 24, l: 16 },
          borderRadius: 12,
          borderWidth: 1,
          borderColor: LINE,
          borderStyle: "solid",
          width: "100%",
        },
      },
      "b-n": {
        type: "text",
        props: { type: "text", content: "40%" },
        style: { fontSize: 36, fontWeight: 700, color: INK, textAlign: "center" },
      },
      "b-l": {
        type: "text",
        props: { type: "text", content: "ลดรอบแก้ดีไซน์ซ้ำ" },
        style: { fontSize: 14, color: MUTED, textAlign: "center" },
      },
    },
  ),
];

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(blocks, null, 2)}\n`);
console.log(`wrote ${blocks.length} blocks → ${outPath}`);
