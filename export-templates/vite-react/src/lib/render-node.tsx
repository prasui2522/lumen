import { Link } from "react-router-dom";
import { cloneElement, isValidElement, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HOOK_ATTR, nodeFx, overriddenFamilies, styleToReact, withoutFamilies, cursorCss } from "@/lib/style";
import type { SiteNode, StyleProps } from "@/lib/site-types";
import { ICON_PATHS, iconInnerSvg } from "@/lib/icon-paths";
import { safeHref } from "@/lib/safe";
import { renderChartSvg, type ChartKind, type ChartSeries } from "@/lib/chart-render";
import { renderCalendarHtml, type CalendarEra, type CalendarWeekStart } from "@/lib/calendar-render";
import { DbAssetField, DbListPanel, DbLookupSelect, DbRelatedPanel } from "@/lib/wb-db-widgets";

type Ctx = {
  nodes: Record<string, SiteNode>;
  assetFiles?: Record<string, string>;
  /** S2 Tier 1 Preview: id → absolute asset URL (wins over `assetFiles`). */
  assetUrls?: Record<string, string>;
  /** B0: type defaults from the export (defaults.rs), the ONE base-defaults source. */
  baseDefaults?: Record<string, StyleProps>;
  headingFontSizes?: number[];
  /** B0.1 item 3: the page root node id (the element that also carries `data-wb-page`). */
  pageRoot?: string;
  /** B0.2 item 3: ProjectPage.id written into `data-wb-page` (and into the Dialog portal host). */
  pageId?: string;
};

/** B0.1 item 1: same texts as kind-looks.json `a2.texts` (spinnerPath / spinnerLabel), checked by a bun test. */
export const SPINNER_PATH = "M21 12a9 9 0 1 1-6.219-8.56";
export const SPINNER_LABEL = "กำลังโหลด";
export const PAGE_ATTR = "data-wb-page";

/**
 * B0 (FOLLOWUPS 92 item 2): kinds drawn as plain elements take the static export's type defaults under their own
 * style. Kinds drawn with shadcn components keep their own look for now (S2 all-kinds parity decides them).
 */
const PLAIN_KINDS = new Set(["page", "section", "container", "card", "alert", "buttonGroup", "aspectRatio", "field", "scrollArea", "heading", "text"]);

function baseStyle(node: SiteNode, ctx: Ctx): StyleProps | undefined {
  const t = node.props.type;
  if (!PLAIN_KINDS.has(t)) return node.style;
  const d: StyleProps = { ...(ctx.baseDefaults?.[t] ?? {}) };
  if (t === "heading") {
    const level = Math.min(6, Math.max(1, Number(node.props.level) || 1));
    const fs = ctx.headingFontSizes?.[level - 1];
    if (fs !== undefined) d.fontSize = fs;
  }
  return { ...d, ...(node.style ?? {}) };
}

function assetSrc(id: string, ctx: Ctx): string {
  const direct = ctx.assetUrls?.[id];
  if (direct) return direct;
  const file = ctx.assetFiles?.[id] ?? id;
  return `/assets/${file}`;
}

/**
 * S2 (PREVIEW-CODE-VIEW §2.4): `data-node-id` is emitted only when the Tier 1 / Tier 2
 * Preview entry set this flag. The exported site never sets it, so its markup stays clean.
 */
export const PREVIEW_FLAG = "__WB_PREVIEW__";
export const NODE_ID_ATTR = "data-node-id";
function inPreview(): boolean {
  return (globalThis as Record<string, unknown>)[PREVIEW_FLAG] === true;
}

function kids(node: SiteNode, ctx: Ctx, inRow = false): ReactNode {
  const children = (node.props.children as string[] | undefined) ?? [];
  return children.map((id) => <RenderNode key={id} id={id} ctx={ctx} inRow={inRow} />);
}

/**
 * A row child that only has the kind default `width: 100%` (`.t-container` and the same
 * inline default) takes the whole row and crushes its siblings, so Thai text wraps on top
 * of the links. An explicit width is left alone.
 */
function relaxRowWidth(style: StyleProps | undefined, node: SiteNode, inRow?: boolean): StyleProps | undefined {
  if (!inRow || node.props.type !== "container" || !style || node.style?.width !== undefined || style.width === undefined) {
    return style;
  }
  return { ...style, width: "auto" };
}

function isInternalPath(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

function SmartLink({
  href,
  className,
  style,
  children,
  ...rest
}: {
  href: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  [HOOK_ATTR]?: string;
}) {
  // A3 item 3: same scheme allow-list as the static export (`safe_href`): no javascript:/data: links.
  href = safeHref(href);
  if (isInternalPath(href)) {
    return (
      <Link to={href} className={className} style={style} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={className} style={style} {...rest}>
      {children}
    </a>
  );
}

function layoutStyle(p: Record<string, unknown>, base: CSSProperties): CSSProperties {
  const s: CSSProperties = { ...base };
  if (p.direction === "row" || p.direction === "column") {
    s.display = s.display ?? "flex";
    s.flexDirection = p.direction;
  }
  if (typeof p.gap === "number") s.gap = p.gap;
  if (typeof p.align === "string") s.alignItems = p.align === "stretch" ? "stretch" : p.align;
  if (typeof p.justify === "string") {
    s.justifyContent =
      p.justify === "between" ? "space-between" : (p.justify as CSSProperties["justifyContent"]);
  }
  return s;
}

/**
 * B0 (§9.B P1 selector contract): a node with breakpoint overrides gets `data-wb-id=<id>` on its root element, the
 * hook the generated `src/styles/site.css` targets (same bytes as the static export). The overridden keys (whole
 * shorthand family) leave the inline style, so the generated rules win by normal cascade, without `!important`.
 */
function previewCursorCss(id: string, node: SiteNode): string {
  if (!inPreview() || id.includes('"') || id.includes("\\")) return "";
  const sel = `[data-node-id="${id}"]`;
  const parts: string[] = [];
  const hover = cursorCss(node.states?.hover?.cursor);
  const active = cursorCss(node.states?.active?.cursor);
  const focus = cursorCss(node.states?.focusVisible?.cursor);
  if (hover) parts.push(`${sel}:hover{cursor:${hover}}`);
  if (active) parts.push(`${sel}:active{cursor:${active}}`);
  if (focus) parts.push(`${sel}:focus-visible{cursor:${focus}}`);
  return parts.join("");
}

/** A1: breakpoint + fx families for the dialog box (it carries the hook, see `case "dialog"`). */
function dialogFams(node: SiteNode): Set<string> {
  const fams = overriddenFamilies(node.styleBreakpoints);
  for (const f of nodeFx(node).families) fams.add(f);
  return fams;
}

export function RenderNode({ id, ctx, inRow }: { id: string; ctx: Ctx; inRow?: boolean }) {
  const el = renderNodeInner(id, ctx, inRow);
  const node = ctx.nodes[id];
  // Dialog: the root is the Radix provider (no element); its case puts class + hook on the dialog box itself.
  if (!node || !isValidElement(el) || node.props.type === "dialog") return el;
  const props = (el as ReactElement<{ style?: CSSProperties; className?: string }>).props;
  // B0.1 item 1: every node root carries `.t-<type>` like the static export, so the generator's type rules
  // (state, reduced-motion, forced-colors) reach the Vite render too.
  const tcls = `t-${node.props.type}`;
  // A1 (audit High 2): states / transition / entrance motion / glass / text gradient rules target this node's
  // hook in site.css (no `.nN` here); `fx` marks nodes with states, as the static `.nN fx` does.
  const fx = nodeFx(node);
  const own = (props.className ?? "").split(/\s+/).filter(Boolean);
  const cls = [...(own.includes(tcls) ? [] : [tcls]), ...own, ...(fx.fx && !own.includes("fx") ? ["fx"] : [])].join(" ");
  const extra: Record<string, unknown> = { className: cls };
  if (inPreview()) extra[NODE_ID_ATTR] = id;
  // Export Form↔DB: stable id for submit/collect without Preview chrome.
  if (node.db || (node.props.type === "button" && node.props.action === "dbSubmit")) {
    extra["data-wb-node-id"] = id;
    if (!inPreview()) extra[NODE_ID_ATTR] = id;
  }
  if (id === ctx.pageRoot) extra[PAGE_ATTR] = ctx.pageId ?? id;
  const fams = overriddenFamilies(node.styleBreakpoints);
  for (const f of fx.families) fams.add(f);
  if (fams.size > 0 || fx.hook) {
    extra[HOOK_ATTR] = id;
    extra.style = withoutFamilies(props.style, fams);
  }
  const painted = cloneElement(el as ReactElement<Record<string, unknown>>, extra);
  const cursorRules = previewCursorCss(id, node);
  if (!cursorRules) return painted;
  return (
    <>
      <style>{cursorRules}</style>
      {painted}
    </>
  );
}

function renderNodeInner(id: string, ctx: Ctx, inRow?: boolean): ReactNode {
  const node = ctx.nodes[id];
  if (!node || node.visible === false) return null;
  const p = node.props;
  const style = styleToReact(relaxRowWidth(baseStyle(node, ctx), node, inRow));
  const t = p.type;

  switch (t) {
    case "page":
    case "section":
    case "container":
    case "card":
    case "alert":
    case "buttonGroup":
    case "aspectRatio":
    case "field": {
      const row = (p.direction ?? (t === "buttonGroup" ? "row" : "column")) === "row";
      const list = node.db?.list;
      const related = node.db?.related;
      if (list?.tableId) {
        return (
          <div className={`n-${t}`} style={layoutStyle(p, style)}>
            {kids(node, ctx, row)}
            <DbListPanel
              tableId={list.tableId}
              resolveFks={list.resolveFks !== false}
              search={list.search !== false}
            />
          </div>
        );
      }
      if (related?.parentTableId && related.fkId) {
        const parentKey =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("id") ?? ""
            : "";
        return (
          <div className={`n-${t}`} style={layoutStyle(p, style)}>
            {kids(node, ctx, row)}
            <DbRelatedPanel
              parentTableId={related.parentTableId}
              fkId={related.fkId}
              parentKey={parentKey}
            />
          </div>
        );
      }
      return (
        <div className={`n-${t}`} style={layoutStyle(p, style)}>
          {kids(node, ctx, row)}
        </div>
      );
    }
    case "scrollArea": {
      // F2.1 a / B0: display flex, width 100% and overflow auto come from the shared base defaults (defaults.rs via
      // site.json `baseDefaults`); the axis rule (compiler.rs scroll_axis_decls): vertical clips x, horizontal clips
      // y, both adds nothing; only while the overflow in force is auto / scroll (an explicit visible / hidden wins).
      const overflow = String(style.overflow ?? "visible");
      const axis: CSSProperties =
        overflow === "auto" || overflow === "scroll"
          ? p.orientation === "horizontal"
            ? { overflowY: "hidden" }
            : p.orientation === "both"
              ? {}
              : { overflowX: "hidden" }
          : {};
      return (
        <div className="n-scrollArea" style={{ ...layoutStyle(p, { flexDirection: "column", ...style }), ...axis }}>
          {kids(node, ctx)}
        </div>
      );
    }
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(p.level) || 1));
      const text = String(p.content ?? "");
      if (level === 1) return <h1 style={style}>{text}</h1>;
      if (level === 2) return <h2 style={style}>{text}</h2>;
      if (level === 3) return <h3 style={style}>{text}</h3>;
      if (level === 4) return <h4 style={style}>{text}</h4>;
      if (level === 5) return <h5 style={style}>{text}</h5>;
      return <h6 style={style}>{text}</h6>;
    }
    case "text":
      return <p style={style}>{String(p.content ?? "")}</p>;
    case "image": {
      const src = p.src as { id?: string; alt?: string } | undefined;
      const idAsset = src?.id?.trim() ?? "";
      if (!idAsset) {
        return (
          <div style={{ ...style, background: "#e2e8f0", minHeight: 120 }} aria-label="image" />
        );
      }
      return <img style={style} src={assetSrc(idAsset, ctx)} alt={src?.alt ?? ""} />;
    }
    case "button": {
      const label = String(p.label ?? "Button");
      const href = typeof p.href === "string" ? p.href.trim() : "";
      const action = String(p.action ?? "");
      if (action === "dbSubmit") {
        return (
          <Button style={style} type="button" data-wb-action="dbSubmit">
            {label}
          </Button>
        );
      }
      if (href) {
        return (
          <SmartLink href={href} style={style} className="inline-flex">
            <span style={{ display: "contents" }}>{label}</span>
          </SmartLink>
        );
      }
      return (
        <Button style={style} type="button">
          {label}
        </Button>
      );
    }
    case "link": {
      const href = safeHref(String(p.href ?? "#"));
      const label = String(p.label ?? href);
      const newTab = p.openInNewTab === true;
      if (isInternalPath(href) && !newTab) {
        return (
          <Link to={href} style={style}>
            {label}
          </Link>
        );
      }
      return (
        <a
          href={href}
          style={style}
          {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {label}
        </a>
      );
    }
    case "spacer":
      return <div style={{ ...style, height: Number(p.size) || 24 }} />;
    case "input": {
      const kind = String(p.inputKind ?? "text");
      if (kind === "asset") {
        return <DbAssetField label={String(p.label ?? "")} style={style} />;
      }
      const htmlType =
        kind === "password" || kind === "number" || kind === "date" || kind === "datetime-local"
          ? kind
          : "text";
      return (
        <label style={{ ...style, display: "flex", flexDirection: "column", gap: 4 }}>
          {String(p.label ?? "") ? <span>{String(p.label)}</span> : null}
          <input
            type={htmlType}
            placeholder={String(p.placeholder ?? "")}
            className="wb-input rounded-md border border-[var(--border)] px-3 py-2"
            data-wb-input-kind={kind}
            list={
              Array.isArray(p.suggestions) && (p.suggestions as string[]).length
                ? `dl-${id}`
                : undefined
            }
          />
          {Array.isArray(p.suggestions) && (p.suggestions as string[]).length ? (
            <datalist id={`dl-${id}`}>
              {(p.suggestions as string[]).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          ) : null}
        </label>
      );
    }
    case "textarea":
      return (
        <label style={{ ...style, display: "flex", flexDirection: "column", gap: 4 }}>
          {String(p.label ?? "") ? <span>{String(p.label)}</span> : null}
          <textarea
            placeholder={String(p.placeholder ?? "")}
            className="rounded-md border border-[var(--border)] px-3 py-2"
          />
        </label>
      );
    case "switch":
    case "checkbox": {
      // B0.1 item 1: the static export's markup (compiler.rs Switch / Checkbox arms); the look is the `.t-switch` /
      // `.t-checkbox` rules shipped in src/styles/kinds.css. Empty label: no span, named by layer name / type label.
      const label = String(p.label ?? "");
      const named = label.trim() ? undefined : node.name?.trim() || (t === "switch" ? "Switch" : "Checkbox");
      return (
        <label style={style}>
          <input type="checkbox" className={t === "switch" ? "sw" : undefined} defaultChecked={p.checked === true} aria-label={named} />
          {t === "switch" ? (
            <span className="sw-track">
              <span className="sw-thumb" />
            </span>
          ) : null}
          {label.trim() ? <span>{label}</span> : null}
        </label>
      );
    }
    case "select": {
      const lookup = node.db?.lookup;
      if (lookup?.tableId && lookup.valueColumnId && lookup.labelColumnId) {
        return (
          <DbLookupSelect
            tableId={lookup.tableId}
            valueColumnId={lookup.valueColumnId}
            labelColumnId={lookup.labelColumnId}
            value={String(p.value ?? "")}
            style={style}
            className="wb-select"
          />
        );
      }
      const options = (p.options as string[] | undefined) ?? [];
      return (
        <select className="wb-select" style={style} defaultValue={String(p.value ?? "")}>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }
    case "radio": {
      const options = (p.options as string[] | undefined) ?? [];
      return (
        <div style={style} role="radiogroup">
          {options.map((o) => (
            <label key={o} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="radio" name={id} value={o} defaultChecked={o === p.value} />
              <span>{o}</span>
            </label>
          ))}
        </div>
      );
    }
    case "tabs": {
      const items = (p.items as { label: string; text: string }[] | undefined) ?? [];
      const active = Math.min(Number(p.active) || 0, Math.max(0, items.length - 1));
      const value = String(active);
      return (
        <Tabs style={style} defaultValue={value}>
          <TabsList>
            {items.map((it, i) => (
              <TabsTrigger key={i} value={String(i)}>
                {it.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {items.map((it, i) => (
            <TabsContent key={i} value={String(i)}>
              {it.text}
            </TabsContent>
          ))}
        </Tabs>
      );
    }
    case "accordion": {
      const items = (p.items as { label: string; text: string }[] | undefined) ?? [];
      const open = Math.min(Number(p.open) || 0, Math.max(0, items.length - 1));
      return (
        <div style={style}>
          {items.map((it, i) => (
            <details key={i} open={i === open} className="border-b border-[var(--border)] py-2">
              <summary className="cursor-pointer font-medium">{it.label}</summary>
              <div className="pt-2 pb-3 text-sm">{it.text}</div>
            </details>
          ))}
        </div>
      );
    }
    case "list": {
      const items = ((p.items as string[] | undefined) ?? []).slice(0, 50);
      const marker = String(p.marker ?? "disc");
      const ordered = p.ordered === true || marker === "decimal";
      const Tag = ordered ? "ol" : "ul";
      const role = marker === "check" || marker === "none" ? "list" : undefined;
      const listStyle =
        marker === "none" || marker === "check"
          ? ("none" as const)
          : marker === "decimal"
            ? ("decimal" as const)
            : ("disc" as const);
      return (
        <Tag
          style={{
            ...style,
            listStyleType: listStyle,
            paddingInlineStart: listStyle === "none" ? 0 : style.paddingInlineStart ?? "1.25em",
          }}
          role={role}
          className={marker === "check" ? "wb-list-check" : undefined}
        >
          {items.map((it, i) => (
            <li
              key={i}
              style={
                marker === "check"
                  ? { position: "relative", paddingInlineStart: "1.5em" }
                  : undefined
              }
            >
              {marker === "check" ? (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    insetInlineStart: 0,
                    top: "0.35em",
                    width: "1em",
                    height: "1em",
                    background: "currentColor",
                    WebkitMask:
                      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='black' d='M6.5 11.5 3 8l1.2-1.2 2.3 2.3 5.3-5.3L13 5l-6.5 6.5z'/%3E%3C/svg%3E\") center/contain no-repeat",
                    mask: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='black' d='M6.5 11.5 3 8l1.2-1.2 2.3 2.3 5.3-5.3L13 5l-6.5 6.5z'/%3E%3C/svg%3E\") center/contain no-repeat",
                  }}
                />
              ) : null}
              {it}
            </li>
          ))}
        </Tag>
      );
    }
    case "icon": {
      const name = String(p.name ?? "star");
      const size = Math.max(12, Math.min(128, Math.round(Number(p.size) || 24)));
      const strokeWidth = Math.max(1, Math.min(4, Number(p.strokeWidth) || 2));
      const label = typeof p.label === "string" ? p.label.trim() : "";
      const inner = iconInnerSvg(name) ?? ICON_PATHS.star;
      const a11y = label
        ? ({ role: "img" as const, "aria-label": label })
        : ({ "aria-hidden": true as const });
      return (
        <span style={{ display: "inline-block", lineHeight: 0, verticalAlign: "middle", ...style }}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width={size}
            height={size}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...a11y}
            dangerouslySetInnerHTML={{ __html: inner }}
          />
        </span>
      );
    }
    case "carousel": {
      const slidesPerView = Math.max(1, Math.min(4, Math.round(Number(p.slidesPerView) || 1)));
      const gap = typeof p.gap === "number" ? p.gap : 16;
      const basis = `calc((100% - ${gap * (slidesPerView - 1)}px) / ${slidesPerView})`;
      const children = ((p.children as string[] | undefined) ?? []);
      return (
        <div
          role="region"
          aria-roledescription="carousel"
          // F2.1.1 b: accessible name = trimmed layer name, else "Carousel" (same rule as the static export).
          aria-label={node.name?.trim() || "Carousel"}
          // F2.1 b: an empty carousel has nothing to scroll, so it is not a Tab stop (same as the static export).
          tabIndex={children.some((cid) => ctx.nodes[cid]) ? 0 : undefined}
          className="t-carousel"
          style={{
            ...style,
            display: "flex",
            flexDirection: "row",
            gap: `${gap}px`,
            overflowX: "auto",
            scrollSnapType: "x mandatory",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {children.map((cid) => (
            <div
              key={cid}
              className="t-carousel__slide"
              style={{ flex: `0 0 ${basis}`, scrollSnapAlign: "start", minWidth: 0 }}
            >
              <RenderNode id={cid} ctx={ctx} />
            </div>
          ))}
        </div>
      );
    }
    case "chart": {
      const kind = (p.kind as ChartKind) || "bar";
      const categories = ((p.categories as string[] | undefined) ?? []).slice(0, 12);
      const series = ((p.series as ChartSeries[] | undefined) ?? []).slice(0, 3);
      const caption = typeof p.caption === "string" ? p.caption : undefined;
      const html = renderChartSvg({ kind, categories, series, caption });
      return (
        <div className="t-chart" style={{ display: "block", width: "100%", lineHeight: 0, ...style }}>
          <span dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      );
    }
    case "calendar": {
      const year = Math.round(Number(p.year) || 2569);
      const month = Math.max(1, Math.min(12, Math.round(Number(p.month) || 1)));
      const weekStart = (Number(p.weekStart) === 1 ? 1 : 0) as CalendarWeekStart;
      const era = (p.era === "ce" ? "ce" : "be") as CalendarEra;
      const selectedDay =
        p.selectedDay === undefined || p.selectedDay === null
          ? undefined
          : Math.round(Number(p.selectedDay));
      const html = renderCalendarHtml({ year, month, selectedDay, weekStart, era });
      return (
        <div className="t-calendarwrap" style={{ display: "block", width: "100%", ...style }}>
          <span dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      );
    }
    case "command":
    case "contextMenu": {
      const items = (Array.isArray(p.items) ? p.items : [])
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, 12);
      const shown = items.length > 0 ? items : ["รายการ"];
      const label = t === "command" ? "คำสั่งค้น แบบจัดวาง" : "เมนูคลิกขวา แบบจัดวาง";
      return (
        <div className={`t-${t}`} role={t === "command" ? "search" : "menu"} aria-label={label} style={style}>
          {t === "command" ? <p>{String(p.placeholder ?? "")}</p> : null}
          <ul>
            {shown.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      );
    }
    case "toast":
      return (
        <div className="t-toast" role="status" aria-label="ข้อความแจ้ง แบบจัดวาง" style={style}>
          <strong>{String(p.title ?? "")}</strong>
          <p>{String(p.message ?? "")}</p>
        </div>
      );
    case "resizable": {
      const pct = Math.min(80, Math.max(20, Math.round(Number(p.split) || 50)));
      const ids = Array.isArray(p.children) ? p.children.map(String) : [];
      return (
        <div className="t-resizable" aria-label="แบ่งขนาด แบบจัดวาง" style={{ display: "flex", ...style }}>
          {ids.length === 0 ? (
            <>
              <div style={{ flex: `0 0 ${pct}%`, minWidth: 0 }} />
              <div style={{ flex: "1 1 auto", minWidth: 0 }} />
            </>
          ) : (
            ids.map((cid, i) => (
              <div key={cid} style={i === 0 ? { flex: `0 0 ${pct}%`, minWidth: 0 } : { flex: "1 1 auto", minWidth: 0 }}>
                <RenderNode id={cid} ctx={ctx} inRow />
              </div>
            ))
          )}
        </div>
      );
    }
    case "table": {
      const columns = ((p.columns as string[] | undefined) ?? []).slice(0, 20);
      const rawRows = (p.rows as string[][] | undefined) ?? [];
      const n = columns.length;
      const rows = rawRows.slice(0, 100).map((row) => {
        const cells = row.slice(0, n);
        while (cells.length < n) cells.push("");
        return cells;
      });
      const caption = typeof p.caption === "string" ? p.caption.trim() : "";
      const headerRow = p.headerRow !== false;
      const striped = p.stripped === true;
      const aria = caption || "Table";
      return (
        <div role="region" aria-label={aria} tabIndex={0} className="t-tablewrap" style={{ overflowX: "auto", ...style }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: style.fontSize,
              color: style.color,
            }}
            className={striped ? "t-table--striped" : undefined}
          >
            {caption ? <caption>{caption}</caption> : null}
            {headerRow && n > 0 ? (
              <thead>
                <tr>
                  {columns.map((col, i) => (
                    <th key={i} scope="col" style={{ padding: 8, border: "1px solid #e2e8f0", textAlign: "left" }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} style={striped && ri % 2 === 1 ? { background: "#f8fafc" } : undefined}>
                  {columns.map((_, ci) => (
                    <td key={ci} style={{ padding: 8, border: "1px solid #e2e8f0" }}>
                      {row[ci] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "dialog": {
      const open = p.open !== false;
      return (
        <Dialog defaultOpen={open}>
          <DialogTrigger asChild>
            <Button type="button">{String(p.title || "Dialog")}</Button>
          </DialogTrigger>
          {/* B0.1 item 1: <Dialog> renders no element of its own, so the type class and the breakpoint hook (with
              the overridden families off the inline style) go on the dialog box, as in the static export. */}
          <DialogContent
            className={nodeFx(node).fx ? "t-dialog fx" : "t-dialog"}
            style={withoutFamilies(style, dialogFams(node))}
            {...(dialogFams(node).size > 0 || nodeFx(node).hook ? { [HOOK_ATTR]: id } : {})}
            pageAttr={ctx.pageId ? PAGE_ATTR : undefined}
            pageAttrValue={ctx.pageId}
          >
            <DialogTitle>{String(p.title ?? "")}</DialogTitle>
            <DialogDescription>{String(p.message ?? "")}</DialogDescription>
          </DialogContent>
        </Dialog>
      );
    }
    case "alertDialog": {
      return (
        <div
          style={style}
          className="rounded-xl border border-[var(--border)] bg-white p-6"
          role="alertdialog"
        >
          <h2 className="text-lg font-semibold">{String(p.title ?? "")}</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">{String(p.message ?? "")}</p>
          <div className="mt-4 flex flex-row-reverse gap-2">
            {String(p.confirm ?? "") ? (
              typeof p.confirmHref === "string" && p.confirmHref.trim() ? (
                <SmartLink href={p.confirmHref.trim()}>
                  <Button type="button">{String(p.confirm)}</Button>
                </SmartLink>
              ) : (
                <Button type="button">{String(p.confirm)}</Button>
              )
            ) : null}
            {String(p.cancel ?? "") ? (
              typeof p.cancelHref === "string" && p.cancelHref.trim() ? (
                <SmartLink href={p.cancelHref.trim()}>
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
                  >
                    {String(p.cancel)}
                  </button>
                </SmartLink>
              ) : (
                <button
                  type="button"
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
                >
                  {String(p.cancel)}
                </button>
              )
            ) : null}
          </div>
        </div>
      );
    }
    case "dropdownMenu": {
      const items = (p.items as { label: string; href?: string }[] | undefined) ?? [];
      return (
        <details style={style} className="inline-block">
          <summary className="cursor-pointer rounded-lg border border-[var(--border)] px-3 py-1.5">
            {String(p.label ?? "Menu")}
          </summary>
          <div className="mt-1 min-w-40 rounded-lg border border-[var(--border)] bg-white p-1 shadow">
            {items.map((it, i) =>
              it.href?.trim() ? (
                <SmartLink
                  key={i}
                  href={it.href.trim()}
                  className="block rounded px-2 py-1.5 text-sm hover:bg-slate-50"
                >
                  {it.label}
                </SmartLink>
              ) : (
                <div key={i} className="rounded px-2 py-1.5 text-sm">
                  {it.label}
                </div>
              ),
            )}
          </div>
        </details>
      );
    }
    case "menubar": {
      const menus =
        (p.items as { label: string; items: { label: string; href?: string }[] }[] | undefined) ??
        [];
      return (
        <div style={{ ...style, display: "flex", gap: 4 }} className="rounded-lg border p-1">
          {menus.map((m, i) => (
            <details key={i}>
              <summary className="cursor-pointer rounded px-3 py-1.5 text-sm font-medium">
                {m.label}
              </summary>
              <div className="mt-1 min-w-36 rounded-lg border bg-white p-1 shadow">
                {m.items.map((it, j) =>
                  it.href?.trim() ? (
                    <SmartLink
                      key={j}
                      href={it.href.trim()}
                      className="block rounded px-2 py-1.5 text-sm hover:bg-slate-50"
                    >
                      {it.label}
                    </SmartLink>
                  ) : (
                    <div key={j} className="rounded px-2 py-1.5 text-sm">
                      {it.label}
                    </div>
                  ),
                )}
              </div>
            </details>
          ))}
        </div>
      );
    }
    case "breadcrumb":
    case "navigationMenu":
    case "pagination": {
      const items = (p.items as { label: string; href?: string }[] | undefined) ?? [];
      const active = typeof p.active === "number" ? p.active : -1;
      const Tag = t === "breadcrumb" ? "ol" : "ul";
      return (
        <nav style={style} aria-label={t}>
          <Tag className="flex flex-wrap gap-2" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {items.map((it, i) => (
              <li key={i}>
                {it.href?.trim() ? (
                  <SmartLink
                    href={it.href.trim()}
                    className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg px-2"
                    {...(i === active ? { "aria-current": "page" as const } : {})}
                  >
                    {it.label}
                  </SmartLink>
                ) : (
                  <span
                    className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg px-2"
                    {...(i === active || (t === "breadcrumb" && i === items.length - 1)
                      ? { "aria-current": "page" as const }
                      : {})}
                  >
                    {it.label}
                  </span>
                )}
              </li>
            ))}
          </Tag>
        </nav>
      );
    }
    case "progress":
      return (
        <progress style={style} value={Number(p.value) || 0} max={100} className="w-full" />
      );
    case "slider": {
      const min = Number(p.min ?? 0);
      const max = Math.max(min, Number(p.max ?? 100));
      const step = Math.max(1, Number(p.step ?? 1));
      const value = Math.min(max, Math.max(min, Number(p.value) || 0));
      return <input style={style} type="range" min={min} max={max} step={step} defaultValue={value} />;
    }
    case "kbd":
      return <kbd style={style}>{String(p.text ?? "")}</kbd>;
    case "empty":
      return (
        <div style={style} className="rounded-xl border p-6 text-center">
          <h3 className="text-lg font-semibold">{String(p.title ?? "")}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{String(p.message ?? "")}</p>
          {typeof p.actionLabel === "string" && p.actionLabel.trim() ? (
            typeof p.actionHref === "string" && p.actionHref.trim() ? (
              <SmartLink href={p.actionHref.trim()} className="mt-3 inline-block">
                <Button type="button">{p.actionLabel}</Button>
              </SmartLink>
            ) : (
              <Button type="button" className="mt-3">
                {p.actionLabel}
              </Button>
            )
          ) : null}
        </div>
      );
    case "item":
      return (
        <div style={style}>
          <h3 className="font-semibold">{String(p.title ?? "")}</h3>
          <p className="text-sm text-[var(--muted)]">{String(p.description ?? "")}</p>
        </div>
      );
    case "badge":
      return (
        <span style={style} className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs">
          {String(p.label ?? "")}
        </span>
      );
    case "separator":
      return (
        <hr
          style={{
            ...style,
            ...(p.orientation === "vertical"
              ? { width: 1, height: "auto", minHeight: 16, border: "none", background: "var(--border)" }
              : { border: "none", borderTop: "1px solid var(--border)" }),
          }}
        />
      );
    case "skeleton":
      return <div style={style} className="animate-pulse rounded-md bg-slate-200" />;
    case "spinner": {
      // B0.1 item 1: static markup (compiler.rs Spinner arm; size clamped 12–64 like `spinner_px`).
      const size = Math.min(64, Math.max(12, Number(p.size) || 24));
      return (
        <span style={style} role="status" aria-label={node.name?.trim() || SPINNER_LABEL}>
          <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d={SPINNER_PATH} />
          </svg>
        </span>
      );
    }
    case "avatar": {
      const src = p.src as { id?: string } | undefined;
      const idAsset = src?.id?.trim() ?? "";
      if (idAsset) {
        return (
          <img style={{ ...style, borderRadius: "9999px" }} src={assetSrc(idAsset, ctx)} alt="" />
        );
      }
      return (
        <div
          style={{ ...style, borderRadius: "9999px" }}
          className="flex items-center justify-center bg-slate-200"
        >
          {String(p.fallback ?? "A")}
        </div>
      );
    }
    case "sheet":
    case "drawer":
    case "popover":
    case "tooltip":
    case "hoverCard":
    case "collapsible":
    case "toggle":
    case "toggleGroup":
    case "inputGroup":
    case "inputOtp":
    case "marker":
    case "bubble":
    case "message":
    default:
      return (
        <div style={style} data-node-type={t}>
          {"children" in p ? kids(node, ctx) : null}
          {typeof p.title === "string" ? <strong>{p.title}</strong> : null}
          {typeof p.label === "string" ? <span>{p.label}</span> : null}
          {typeof p.text === "string" ? <span>{p.text}</span> : null}
          {typeof p.message === "string" ? <p>{p.message}</p> : null}
          {typeof p.content === "string" ? <span>{p.content}</span> : null}
          {typeof p.tip === "string" ? <span>{p.tip}</span> : null}
        </div>
      );
  }
}
