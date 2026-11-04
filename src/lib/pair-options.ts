import type { LabelHrefItem, LabelTextItem, MenubarMenu } from "@/schema";
import { MAX_SELECT_OPTIONS, parseSelectOptions } from "@/lib/select-options";

export type { LabelHrefItem, LabelTextItem, MenubarMenu };

/** Display / parse separator: first `|` on the line splits label from the second field. */
const SEP = " | ";

export function formatLabelTextItems(items: readonly LabelTextItem[]): string {
  return items.map((it) => `${it.label}${SEP}${it.text}`).join("\n");
}

export function formatLabelHrefItems(items: readonly LabelHrefItem[]): string {
  return items.map((it) => `${it.label}${SEP}${it.href}`).join("\n");
}

function splitLine(line: string): { label: string; rest: string } {
  const i = line.indexOf("|");
  if (i < 0) return { label: line, rest: "" };
  return { label: line.slice(0, i).trimEnd(), rest: line.slice(i + 1).trimStart() };
}

/** One item per line: `ป้าย | ข้อความ` (no `|` → label only, empty text). Cap 100. */
export function parseLabelTextItems(raw: string): LabelTextItem[] {
  return parseSelectOptions(raw)
    .slice(0, MAX_SELECT_OPTIONS)
    .map((line) => {
      const { label, rest } = splitLine(line);
      return { label, text: rest };
    });
}

/** One item per line: `ป้าย | ลิงก์` (no `|` → label only, empty href). Cap 100. */
export function parseLabelHrefItems(raw: string): LabelHrefItem[] {
  return parseSelectOptions(raw)
    .slice(0, MAX_SELECT_OPTIONS)
    .map((line) => {
      const { label, rest } = splitLine(line);
      return { label, href: rest };
    });
}

export function labelTextItemsEqual(a: readonly LabelTextItem[], b: readonly LabelTextItem[]): boolean {
  return a.length === b.length && a.every((it, i) => it.label === b[i]!.label && it.text === b[i]!.text);
}

export function labelHrefItemsEqual(a: readonly LabelHrefItem[], b: readonly LabelHrefItem[]): boolean {
  return a.length === b.length && a.every((it, i) => it.label === b[i]!.label && it.href === b[i]!.href);
}

export function menubarMenusEqual(a: readonly MenubarMenu[], b: readonly MenubarMenu[]): boolean {
  return (
    a.length === b.length &&
    a.every((menu, i) => menu.label === b[i]!.label && labelHrefItemsEqual(menu.items, b[i]!.items))
  );
}
