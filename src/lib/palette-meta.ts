import { NODE_TYPE_LABEL, PALETTE_TYPES, type PaletteType } from "@/lib/document-ops";

/**
 * Phase 11 A1.1 — add-element palette grouping + search keywords.
 * Editor-chunk only (imported by ElementPalette); nothing here touches the
 * document schema. Group headings stay English like the rest of the palette.
 */
export const PALETTE_GROUPS = [
  "Layout",
  "Text & media",
  "Forms",
  "Data",
  "Navigation",
  "Disclosure",
  "Overlays",
  "Feedback",
] as const;

export type PaletteGroup = (typeof PALETTE_GROUPS)[number];

type Meta = { group: PaletteGroup; keywords: readonly string[] };

/** type → group + Thai/English synonyms. Typed Record: a new PaletteType fails tsc until listed. */
export const PALETTE_META: Record<PaletteType, Meta> = {
  section: { group: "Layout", keywords: ["section", "block", "band", "ส่วน", "ส่วนหน้า", "แถบ"] },
  container: { group: "Layout", keywords: ["container", "box", "div", "wrapper", "group", "flex", "กล่อง", "คอนเทนเนอร์"] },
  spacer: { group: "Layout", keywords: ["spacer", "space", "gap", "gutter", "ช่องว่าง", "เว้นระยะ"] },
  // A2.5: the nine Phase 11 A2 kinds. The Phase 5B Thai names (การ์ด, แจ้งเตือน, ป้าย, เส้นคั่น) are search synonyms.
  card: { group: "Layout", keywords: ["card", "panel", "box", "การ์ด", "บัตร", "กรอบเนื้อหา"] },
  separator: { group: "Layout", keywords: ["separator", "divider", "line", "rule", "hr", "เส้นคั่น", "เส้นแบ่ง", "เส้น"] },
  aspectRatio: { group: "Layout", keywords: ["aspect ratio", "ratio", "16:9", "16/9", "frame", "อัตราส่วน", "กรอบสัดส่วน", "สัดส่วน"] },
  scrollArea: { group: "Layout", keywords: ["scroll area", "scroll", "overflow", "scrollable", "พื้นที่เลื่อน", "เลื่อน", "เลื่อนได้"] },
  buttonGroup: { group: "Layout", keywords: ["button group", "segmented", "group of buttons", "กลุ่มปุ่ม", "ปุ่มติดกัน", "ปุ่มเรียง"] },

  heading: { group: "Text & media", keywords: ["heading", "title", "h1", "h2", "headline", "หัวข้อ", "หัวเรื่อง"] },
  text: { group: "Text & media", keywords: ["text", "paragraph", "p", "copy", "label", "ข้อความ", "ย่อหน้า"] },
  image: { group: "Text & media", keywords: ["image", "img", "picture", "photo", "รูป", "รูปภาพ", "ภาพ"] },
  link: { group: "Text & media", keywords: ["link", "anchor", "a", "href", "url", "ลิงก์", "ลิงค์"] },
  kbd: { group: "Text & media", keywords: ["kbd", "keyboard", "key", "shortcut", "คีย์", "แป้นพิมพ์"] },
  // Phase 11 A4.1
  list: {
    group: "Text & media",
    keywords: ["list", "ul", "ol", "bullets", "checklist", "รายการ", "ลิสต์", "จุด", "ติ๊กถูก", "checklist"],
  },
  // Phase 11 A4.5
  icon: {
    group: "Text & media",
    keywords: ["icon", "symbol", "arrow", "check", "star", "lucide", "ไอคอน", "สัญลักษณ์", "ดาว", "ลูกศร"],
  },

  button: { group: "Forms", keywords: ["button", "btn", "cta", "action", "submit", "ปุ่ม", "กดปุ่ม"] },
  input: { group: "Forms", keywords: ["input", "text field", "textbox", "field", "ช่องข้อความ", "ช่องกรอก", "กรอก"] },
  textarea: { group: "Forms", keywords: ["textarea", "multiline", "message box", "ข้อความยาว", "หลายบรรทัด"] },
  // A1.5: the tile label is now "Switch"; "checkbox" stays a keyword so the old word still finds it (the default node name stays "Checkbox"). A3 adds a real checkbox kind.
  switch: { group: "Forms", keywords: ["switch", "toggle", "check", "checkbox", "on off", "สวิตช์", "ติ๊ก", "เปิดปิด"] },
  // Phase 11 A3.1: the real checkbox kind (tile "Checkbox", aria "เพิ่มCheckbox").
  checkbox: { group: "Forms", keywords: ["checkbox", "tick", "check box", "agree", "ช่องทำเครื่องหมาย", "ติ๊ก", "กล่องติ๊ก", "ยอมรับ", "เช็คบ็อกซ์"] },
  // Phase 11 A3.3: labelled form row (not a <form>).
  field: { group: "Forms", keywords: ["field", "label", "form row", "form field", "ฟิลด์", "แถวฟอร์ม", "ป้ายกำกับ", "ช่องฟอร์ม"] },
  // A3.4: tile is "Native Select"; keep "select" / Thai synonyms findable.
  select: {
    group: "Forms",
    keywords: [
      "select",
      "native select",
      "dropdown",
      "combobox",
      "picker",
      "เลือก",
      "ดรอปดาวน์",
      "รายการเลือก",
      "เนทีฟ",
    ],
  },
  radio: { group: "Forms", keywords: ["radio", "radio group", "options", "choice", "ตัวเลือก", "เรดิโอ"] },
  slider: { group: "Forms", keywords: ["slider", "range", "track", "สไลเดอร์", "แถบเลื่อน"] },
  toggle: { group: "Forms", keywords: ["toggle", "pressed", "bold", "สลับ", "ปุ่มสลับ"] },
  toggleGroup: { group: "Forms", keywords: ["toggle group", "segmented", "button group", "สลับกลุ่ม", "กลุ่มปุ่มสลับ"] },
  inputGroup: { group: "Forms", keywords: ["input group", "addon", "prefix", "suffix", "กลุ่มช่องกรอก", "ช่องกรอกพร้อมไอคอน"] },
  inputOtp: { group: "Forms", keywords: ["otp", "pin", "code", "verification", "one time", "รหัส", "รหัสยืนยัน"] },

  avatar: { group: "Data", keywords: ["avatar", "profile", "user", "photo", "อวตาร", "โปรไฟล์", "ผู้ใช้"] },
  item: { group: "Data", keywords: ["item", "list item", "row", "รายการ", "แถว"] },
  badge: { group: "Text & media", keywords: ["badge", "tag", "chip", "pill", "ป้าย", "แท็ก", "ป้ายกำกับ"] },
  marker: { group: "Data", keywords: ["marker", "label", "note", "ป้าย", "เครื่องหมาย"] },
  bubble: { group: "Data", keywords: ["bubble", "chat", "speech", "balloon", "ฟองแชท", "แชท"] },
  message: { group: "Data", keywords: ["message", "chat message", "comment", "ข้อความแชท", "คอมเมนต์"] },
  skeleton: { group: "Data", keywords: ["skeleton", "placeholder", "loading placeholder", "shimmer", "โครงรอโหลด", "ตัวแทน", "กำลังโหลด"] },
  spinner: { group: "Data", keywords: ["spinner", "loading", "loader", "busy", "ตัวหมุน", "กำลังโหลด", "โหลด"] },
  // Phase 11 A4.2
  table: {
    group: "Data",
    keywords: ["table", "grid", "rows", "columns", "spreadsheet", "ตาราง", "กริด", "แถว", "คอลัมน์"],
  },

  tabs: { group: "Navigation", keywords: ["tabs", "tab", "panels", "แท็บ"] },
  breadcrumb: { group: "Navigation", keywords: ["breadcrumb", "path", "trail", "เส้นทาง", "เบรดครัมบ์"] },
  pagination: { group: "Navigation", keywords: ["pagination", "pager", "pages", "next", "prev", "แบ่งหน้า", "หน้าถัดไป"] },
  navigationMenu: { group: "Navigation", keywords: ["navigation menu", "navbar", "nav", "header menu", "เมนูนำทาง", "แถบนำทาง"] },
  menubar: { group: "Navigation", keywords: ["menubar", "menu bar", "toolbar", "แถบเมนู"] },
  dropdownMenu: { group: "Navigation", keywords: ["dropdown menu", "menu", "context", "actions", "เมนู", "เมนูดรอปดาวน์"] },

  accordion: { group: "Disclosure", keywords: ["accordion", "faq", "expand", "collapse", "อะคอร์เดียน", "คำถามที่พบบ่อย", "ยุบขยาย"] },
  collapsible: { group: "Disclosure", keywords: ["collapsible", "details", "disclosure", "show more", "พับได้", "ซ่อนแสดง"] },

  dialog: { group: "Overlays", keywords: ["dialog", "modal", "popup", "window", "ไดอะล็อก", "หน้าต่าง", "ป๊อปอัป"] },
  alertDialog: { group: "Overlays", keywords: ["alert dialog", "confirm", "confirmation", "warning", "modal", "ยืนยัน", "แจ้งเตือน"] },
  sheet: { group: "Overlays", keywords: ["sheet", "side panel", "slide over", "panel", "แผงด้านข้าง", "ชีต"] },
  drawer: { group: "Overlays", keywords: ["drawer", "bottom sheet", "slide up", "ลิ้นชัก", "ดรอว์เออร์"] },
  popover: { group: "Overlays", keywords: ["popover", "popup", "floating", "ป็อปโอเวอร์", "ลอย"] },
  tooltip: { group: "Overlays", keywords: ["tooltip", "hint", "tip", "ทูลทิป", "คำแนะนำ"] },
  hoverCard: { group: "Overlays", keywords: ["hover card", "preview card", "peek", "การ์ดเมื่อชี้", "ฮอเวอร์"] },

  // Phase 11 A5.1
  carousel: {
    group: "Data",
    keywords: ["carousel", "slider", "gallery", "สไลเดอร์", "แกลเลอรี", "ภาพเลื่อน"],
  },
  // Phase 11 A5.3
  chart: {
    group: "Data",
    keywords: ["chart", "graph", "bar", "line", "กราฟ", "แท่ง", "เส้น", "พื้นที่"],
  },
  // Phase 11 A5.5
  calendar: {
    group: "Data",
    keywords: ["calendar", "month", "date", "ปฏิทิน", "เดือน", "วันที่"],
  },
  command: {
    group: "Data",
    keywords: ["command", "search", "คำสั่งค้น", "ค้นหา", "แบบจัดวาง"],
  },
  contextMenu: {
    group: "Navigation",
    keywords: ["context menu", "right click", "เมนูคลิกขวา", "แบบจัดวาง"],
  },
  resizable: {
    group: "Layout",
    keywords: ["resizable", "split", "แบ่งขนาด", "แบบจัดวาง"],
  },
  toast: {
    group: "Feedback",
    keywords: ["toast", "sonner", "ข้อความแจ้ง", "แบบจัดวาง"],
  },
  alert: { group: "Feedback", keywords: ["alert", "notice", "banner", "callout", "message", "แจ้งเตือน", "การแจ้งเตือน", "ประกาศ"] },
  progress: { group: "Feedback", keywords: ["progress", "bar", "loading", "percent", "ความคืบหน้า", "โหลด"] },
  empty: { group: "Feedback", keywords: ["empty", "empty state", "no results", "placeholder", "ว่างเปล่า", "ไม่มีข้อมูล"] },
};

export type PaletteGroupEntry = { heading: PaletteGroup; types: PaletteType[] };

/** Group order = PALETTE_GROUPS; inside a group, PALETTE_TYPES order. Every type appears exactly once. */
export function paletteGroups(): PaletteGroupEntry[] {
  return PALETTE_GROUPS.map((heading) => ({
    heading,
    types: PALETTE_TYPES.filter((t) => PALETTE_META[t].group === heading),
  })).filter((g) => g.types.length > 0);
}

const norm = (s: string) => s.normalize("NFC").toLowerCase();

/** Haystack per type: visible label + schema id + all keywords (computed once, lowercase). */
const HAY: Record<PaletteType, string> = Object.fromEntries(
  PALETTE_TYPES.map((t) => [
    t,
    norm([NODE_TYPE_LABEL[t], t, ...PALETTE_META[t].keywords].join(" ")),
  ]),
) as Record<PaletteType, string>;

/** True when every whitespace-separated token of `query` is a substring of the type's label/keywords. Blank query matches all. */
export function paletteMatches(type: PaletteType, query: string): boolean {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((tok) => HAY[type].includes(tok));
}

/** Groups reduced to matching tiles; empty groups dropped. Blank query = all groups. */
export function filterPaletteGroups(query: string): PaletteGroupEntry[] {
  return paletteGroups()
    .map((g) => ({ heading: g.heading, types: g.types.filter((t) => paletteMatches(t, query)) }))
    .filter((g) => g.types.length > 0);
}

export function countPaletteMatches(query: string): number {
  return filterPaletteGroups(query).reduce((n, g) => n + g.types.length, 0);
}
