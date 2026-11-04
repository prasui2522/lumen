import { Suspense, type CSSProperties, type HTMLAttributes } from "react";
import type { Node, StyleProps } from "@/schema";
import { styleToCss } from "@/lib/style-css";
import { explicitOf } from "@/lib/kind-looks";
import { mergeOver } from "@/lib/a2-looks";
import { A4_STYLESHEET, a4ExtrasStyle } from "@/lib/a4-looks";
import { MAX_TABLE_COLS, MAX_TABLE_ROWS, normalizeTableRows } from "@/lib/table-model";
import { lazyNamed } from "@/lib/lazy";
import {
  ICON_DEFAULT_SIZE,
  ICON_DEFAULT_STROKE,
  ICON_MAX_SIZE,
  ICON_MAX_STROKE,
  ICON_MIN_SIZE,
  ICON_MIN_STROKE,
} from "@/lib/document-ops";

type Handlers = Record<string, unknown>;

// Phase 11 A4.5: glyph lives in the icon-paths chunk (no whenIdle preload).
const IconGlyph = lazyNamed(() =>
  import("@/components/editor/icon-paths").then((m) => m.IconGlyph),
);

if (typeof document !== "undefined" && !document.querySelector("style[data-a4-looks]")) {
  const el = document.createElement("style");
  el.setAttribute("data-a4-looks", "");
  el.textContent = A4_STYLESHEET;
  document.head.appendChild(el);
}

/**
 * Canvas for the list (PHASE-11 A4.1). Same classes as the export
 * (`.t-list.t-list--{marker}`) so the shared CSS draws markers. Root is a
 * real `<ul>`/`<ol>` (inert on the canvas — no editing of items inline).
 */
export function ListView({
  node,
  handlers,
  chrome,
  style,
  over,
}: {
  node: Node;
  handlers: Handlers;
  chrome?: string;
  style: StyleProps;
  over?: CSSProperties;
}) {
  const p = node.props;
  if (p.type !== "list") return null;
  const explicit = explicitOf(styleToCss(node.style), node.style.borderColor !== undefined);
  const css = a4ExtrasStyle("list", styleToCss(style), explicit);
  const Tag = p.ordered || p.marker === "decimal" ? "ol" : "ul";
  const role = p.marker === "check" || p.marker === "none" ? "list" : undefined;
  return (
    <Tag
      {...(handlers as HTMLAttributes<HTMLUListElement>)}
      data-node-type="list"
      data-cv=""
      role={role}
      className={["t-list", `t-list--${p.marker}`, chrome].filter(Boolean).join(" ")}
      style={mergeOver(css, over)}
    >
      {p.items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </Tag>
  );
}

/**
 * Canvas for the table (PHASE-11 A4.2). Same markup/classes as export
 * (`.t-tablewrap` + `.t-table`) so shared CSS draws the grid. Inert on canvas.
 */
export function TableView({
  node,
  handlers,
  chrome,
  style,
  over,
}: {
  node: Node;
  handlers: Handlers;
  chrome?: string;
  style: StyleProps;
  over?: CSSProperties;
}) {
  const p = node.props;
  if (p.type !== "table") return null;
  const columns = p.columns.slice(0, MAX_TABLE_COLS);
  const rows = normalizeTableRows(columns, p.rows).slice(0, MAX_TABLE_ROWS);
  const explicit = explicitOf(styleToCss(node.style), node.style.borderColor !== undefined);
  const css = a4ExtrasStyle("table", styleToCss(style), explicit);
  const aria =
    p.caption?.trim() ||
    node.name?.trim() ||
    "Table";
  const tableCls = ["t-table", p.striped ? "t-table--striped" : ""].filter(Boolean).join(" ");
  return (
    <div
      {...(handlers as HTMLAttributes<HTMLDivElement>)}
      data-node-type="table"
      data-cv=""
      role="region"
      aria-label={aria}
      tabIndex={-1}
      className={["t-tablewrap", chrome].filter(Boolean).join(" ")}
      style={mergeOver({}, over)}
    >
      <table className={tableCls} style={css}>
        {p.caption?.trim() ? <caption>{p.caption.trim()}</caption> : null}
        {p.headerRow && columns.length > 0 ? (
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={i} scope="col">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {columns.map((_, ci) => (
                <td key={ci}>{row[ci] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Canvas for the icon (PHASE-11 A4.5). Inline SVG matches export; colour =
 * currentColor from node text colour. Placeholder keeps layout until the lazy
 * path chunk resolves.
 */
export function IconView({
  node,
  handlers,
  chrome,
  style,
  over,
}: {
  node: Node;
  handlers: Handlers;
  chrome?: string;
  style: StyleProps;
  over?: CSSProperties;
}) {
  const p = node.props;
  if (p.type !== "icon") return null;
  const explicit = explicitOf(styleToCss(node.style), node.style.borderColor !== undefined);
  const css = a4ExtrasStyle("icon", styleToCss(style), explicit);
  const size = Math.max(ICON_MIN_SIZE, Math.min(ICON_MAX_SIZE, Math.round(p.size || ICON_DEFAULT_SIZE)));
  const stroke = Math.max(
    ICON_MIN_STROKE,
    Math.min(ICON_MAX_STROKE, p.strokeWidth || ICON_DEFAULT_STROKE),
  );
  const wrapStyle = mergeOver(
    { ...css, width: size, height: size, lineHeight: 0, verticalAlign: "middle" },
    over,
  );
  return (
    <span
      {...(handlers as HTMLAttributes<HTMLSpanElement>)}
      data-node-type="icon"
      data-cv=""
      className={["t-icon", chrome].filter(Boolean).join(" ")}
      style={wrapStyle}
    >
      <Suspense
        fallback={
          <span
            aria-hidden
            style={{ display: "inline-block", width: size, height: size }}
          />
        }
      >
        <IconGlyph
          name={p.name}
          size={size}
          strokeWidth={stroke}
          label={p.label}
        />
      </Suspense>
    </span>
  );
}
