import { useEffect, useState, type CSSProperties, type HTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { Node, StyleProps } from "@/schema";
import { isPhase6bType } from "@/schema";
import { styleToCss } from "@/lib/style-css";
import {
  CANVAS_STYLESHEET,
  explicitOf,
  nameAttr,
  rootStyleFor,
  summaryLabel,
} from "@/lib/kind-looks";
import { controlShell, type ControlProps } from "@/components/editor/control-shell";
import { mergeOver } from "@/lib/a2-looks";
import { useProjectsStore } from "@/stores/projects-store";

type Handlers = Record<string, unknown>;
type Root = HTMLAttributes<HTMLElement> & { "data-node-type": string; "data-cv": string };

// The canvas look of every kind comes from src/lib/kind-looks.json (shared with the
// Rust compiler). One <style> for the whole editor; the module lives in the lazy
// editor chunk, so it costs nothing at startup.
if (typeof document !== "undefined" && !document.querySelector("style[data-kind-looks]")) {
  const el = document.createElement("style");
  el.setAttribute("data-kind-looks", "");
  el.textContent = CANVAS_STYLESHEET;
  document.head.appendChild(el);
}

/** Same rule as the compiler's `text_tag`: a blank text emits nothing. */
function tt(Tag: "h2" | "h3" | "p" | "strong" | "div" | "span", text: string): ReactNode {
  return text.trim() === "" ? null : <Tag>{text}</Tag>;
}

const noop = () => {};

/**
 * Canvas for the Phase 6b kinds. Each kind renders the SAME tags and classes as the
 * compiler (`render_v4`), so the shared CSS in kind-looks.json styles both. A click
 * selects the node; nothing inside is interactive (see CANVAS_INERT_CSS).
 */
export function Phase6bView({
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
  /** A2.3: slot override of a buttonGroup / aspectRatio child, applied last. */
  over?: CSSProperties;
}) {
  if (!isPhase6bType(node.type)) return null;
  const p = node.props;
  if (!isPhase6bType(p.type)) return null;

  const explicit = explicitOf(styleToCss(node.style), (node.style ?? {}).borderColor !== undefined);
  const alignEnd = (p.type === "bubble" || p.type === "message") && p.align === "end";
  const rootStyle = mergeOver(
    rootStyleFor(node.type, styleToCss(style), explicit, {
      alignEnd,
      side: p.type === "sheet" || p.type === "drawer" ? p.side : undefined,
    }),
    over,
  );
  const onClick = handlers.onClick as ((e: MouseEvent) => void) | undefined;
  const root: Root = {
    ...(handlers as HTMLAttributes<HTMLElement>),
    "data-node-type": node.type,
    "data-cv": "",
    className: [`t-${node.type}`, chrome].filter(Boolean).join(" "),
    style: rootStyle,
    // A click on a label / summary must select, never toggle a control.
    onClick: (e) => {
      e.preventDefault();
      onClick?.(e);
    },
  };
  // Leaf native controls (select, slider, progress, unlabelled textarea) sit in a thin wrapper that
  // carries the root's handlers, so the wrapper takes mousedown / click / drag while the
  // control inside is inert. See control-shell.tsx.
  const shell = (control: (c: ControlProps) => ReactNode) =>
    controlShell(root, chrome, node.type, rootStyle, control);
  const label = nameAttr(node.name);
  const panelRole = (role: string, title: string) =>
    title.trim() === "" ? {} : { role, "aria-label": title };

  switch (p.type) {
    case "textarea": {
      const area = (extra: object) => (
        <textarea readOnly placeholder={p.placeholder} value="" onChange={noop} {...extra} />
      );
      if (!p.label) return shell((c) => area(c));
      const ta = area({ className: "t-textarea", style: rootStyle, tabIndex: -1 });
      // label > textarea (the export's shape): the label is the selectable root
      return (
        <label {...{ ...root, className: chrome, style: undefined }}>
          {p.label}
          {ta}
        </label>
      );
    }
    case "kbd":
      return <kbd {...root}>{p.text}</kbd>;
    case "avatar":
      return <AvatarRoot root={root} id={p.src.id} fallback={p.fallback} alt={p.src.alt ?? ""} />;
    case "progress":
      // A focusable element as the root would take focus on click (tabindex -1 is still
      // click-focusable) and the canvas shortcut gate would then ignore Delete / arrows /
      // Esc. Inside the wrapper the click lands on a plain div, so focus stays on the scope.
      return shell((c) => <progress {...c} value={Math.min(100, p.value)} max={100} {...label} />);
    case "slider": {
      const min = p.min ?? 0;
      const max = Math.max(min, p.max ?? 100);
      const step = Math.max(1, p.step ?? 1);
      const value = Math.min(max, Math.max(min, p.value));
      return shell((c) => (
        <input {...c} type="range" min={min} max={max} step={step} value={value} onChange={noop} {...label} />
      ));
    }
    case "empty":
      return (
        <div {...root}>
          {tt("h3", p.title)}
          {tt("p", p.message)}
          {p.actionLabel?.trim()
            ? p.actionHref?.trim()
              ? (
                  <a className="act" href={p.actionHref} tabIndex={-1}>
                    {p.actionLabel}
                  </a>
                )
              : (
                  <span className="act">{p.actionLabel}</span>
                )
            : null}
        </div>
      );
    case "item":
      return (
        <div {...root}>
          {tt("h3", p.title)}
          {tt("p", p.description)}
        </div>
      );
    case "marker":
      return <div {...root}>{p.text}</div>;
    case "bubble":
      return <div {...root}>{p.text}</div>;
    case "message":
      return (
        <div {...root}>
          {tt("strong", p.sender)}
          {tt("p", p.text)}
        </div>
      );
    case "select":
      return shell((c) => (
        <select {...c} value={p.value} onChange={noop} {...label}>
          {p.options.map((opt, i) => (
            <option key={i} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ));
    case "radio":
      return (
        <div {...root} role="radiogroup" {...label}>
          {p.options.map((opt, i) => (
            <label key={i}>
              <input type="radio" name={node.id} checked={opt === p.value} onChange={noop} tabIndex={-1} />
              {opt}
            </label>
          ))}
        </div>
      );
    case "toggle":
      return (
        <label {...root}>
          <input type="checkbox" checked={p.pressed} onChange={noop} tabIndex={-1} />
          <span>{p.label}</span>
        </label>
      );
    case "toggleGroup":
      return (
        <div {...root} role="radiogroup" {...label}>
          {p.items.map((item, i) => (
            <label key={i}>
              <input type="radio" name={node.id} checked={i === p.active} onChange={noop} tabIndex={-1} />
              <span>{item}</span>
            </label>
          ))}
        </div>
      );
    case "tabs": {
      const base = `cv-${node.id}`;
      const checked = p.active >= 0 && p.active < p.items.length ? p.active : 0;
      return (
        <div {...root}>
          {p.items.map((item, i) => (
            <TabHead key={i} id={`${base}-${i}`} name={node.id} checked={i === checked} label={item.label} />
          ))}
          {p.items.map((item, i) => (
            <div key={i} className="p6panel" id={`${base}-p${i}`} style={i === checked ? { display: "block" } : undefined}>
              {item.text}
            </div>
          ))}
        </div>
      );
    }
    case "inputGroup":
      return (
        <div {...root}>
          {tt("span", p.prefix)}
          <input type="text" readOnly tabIndex={-1} placeholder={p.placeholder} value="" onChange={noop} {...label} />
          {tt("span", p.suffix)}
        </div>
      );
    case "inputOtp": {
      const n = Math.min(8, Math.max(1, p.length));
      const chars = Array.from(p.value);
      return (
        <div {...root} {...(label["aria-label"] !== undefined ? { role: "group", ...label } : {})}>
          {Array.from({ length: n }, (_, i) => (
            <input
              key={i}
              type="text"
              readOnly
              tabIndex={-1}
              maxLength={1}
              inputMode="numeric"
              aria-label={`digit ${i + 1} of ${n}`}
              value={chars[i] ?? ""}
              onChange={noop}
            />
          ))}
        </div>
      );
    }
    case "accordion":
      return (
        <div {...root}>
          {p.items.map((item, i) => (
            <details key={i} open={i === p.open}>
              <summary tabIndex={-1}>{item.label}</summary>
              {tt("div", item.text)}
            </details>
          ))}
        </div>
      );
    case "collapsible":
      return (
        <details {...(root as HTMLAttributes<HTMLDetailsElement>)} open={p.open}>
          <summary tabIndex={-1}>{p.label}</summary>
          {tt("div", p.text)}
        </details>
      );
    case "breadcrumb":
      return (
        <nav {...root} aria-label="breadcrumb">
          {p.items.length > 0 ? (
            <ol role="list">
              {p.items.map((item, i) => {
                const last = i + 1 === p.items.length;
                return (
                  <li key={i}>
                    {last ? (
                      <span aria-current="page">{item.label}</span>
                    ) : item.href.trim() !== "" ? (
                      <a href="#" tabIndex={-1}>
                        {item.label}
                      </a>
                    ) : (
                      <span>{item.label}</span>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : null}
        </nav>
      );
    case "navigationMenu":
      return (
        <nav {...root} aria-label="navigation">
          {p.items.length > 0 ? (
            <ul role="list">
              {p.items.map((item, i) => (
                <li key={i}>
                  {item.href.trim() !== "" ? (
                    <a href="#" tabIndex={-1}>
                      {item.label}
                    </a>
                  ) : (
                    <span>{item.label}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </nav>
      );
    case "pagination":
      return (
        <nav {...root} aria-label="pagination">
          {p.items.length > 0 ? (
            <ul role="list">
              {p.items.map((item, i) => {
                const current = i === p.active ? ({ "aria-current": "page" as const }) : {};
                return (
                  <li key={i}>
                    {item.href.trim() ? (
                      <a href={item.href} tabIndex={-1} {...current}>
                        {item.label}
                      </a>
                    ) : (
                      <span {...current}>{item.label}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </nav>
      );
    case "menubar":
      return (
        <div {...root}>
          {p.items.map((menu, i) => (
            <details key={i}>
              <summary tabIndex={-1}>{menu.label}</summary>
              {menu.items.length > 0 ? (
                <div>
                  {menu.items.map((item, j) =>
                    item.href.trim() ? (
                      <a key={j} href={item.href} tabIndex={-1}>
                        {item.label}
                      </a>
                    ) : item.label.trim() ? (
                      <span key={j}>{item.label}</span>
                    ) : null,
                  )}
                </div>
              ) : null}
            </details>
          ))}
        </div>
      );
    case "dropdownMenu":
      return (
        <details {...(root as HTMLAttributes<HTMLDetailsElement>)}>
          <summary tabIndex={-1}>{summaryLabel(p.label, node.name)}</summary>
          {p.items.length > 0 ? (
            <div>
              {p.items.map((item, i) =>
                item.href.trim() ? (
                  <a key={i} href={item.href} tabIndex={-1}>
                    {item.label}
                  </a>
                ) : (
                  <div key={i}>{item.label}</div>
                ),
              )}
            </div>
          ) : null}
        </details>
      );
    case "dialog":
    case "drawer":
    case "sheet": {
      // A closed one is not in the compiled page at all. The canvas keeps its title so
      // the node can still be found and selected (documented difference).
      const extra =
        p.type === "sheet" || p.type === "drawer" ? { "data-side": p.side } : {};
      return (
        <div {...root} {...extra} {...panelRole("dialog", p.title)}>
          {tt("h2", p.title)}
          {p.open ? tt("p", p.message) : null}
        </div>
      );
    }
    case "alertDialog":
      return (
        <div {...root} {...panelRole("alertdialog", p.title)}>
          {tt("h2", p.title)}
          {tt("p", p.message)}
          {p.confirm.trim() !== "" || p.cancel.trim() !== "" ? (
            <div>
              {p.confirm.trim() !== "" ? (
                p.confirmHref?.trim() ? (
                  <a className="ok" href={p.confirmHref} tabIndex={-1}>
                    {p.confirm}
                  </a>
                ) : (
                  <button type="button" className="ok" tabIndex={-1}>
                    {p.confirm}
                  </button>
                )
              ) : null}
              {p.cancel.trim() !== "" ? (
                p.cancelHref?.trim() ? (
                  <a className="no" href={p.cancelHref} tabIndex={-1}>
                    {p.cancel}
                  </a>
                ) : (
                  <button type="button" className="no" tabIndex={-1}>
                    {p.cancel}
                  </button>
                )
              ) : null}
            </div>
          ) : null}
        </div>
      );
    case "popover":
      return (
        <details {...(root as HTMLAttributes<HTMLDetailsElement>)}>
          <summary tabIndex={-1}>{summaryLabel(p.label, node.name)}</summary>
          {tt("div", p.text)}
        </details>
      );
    case "tooltip": {
      const tipId = `tip-${node.id}`;
      const hasTip = p.tip.trim() !== "";
      return (
        <div {...root}>
          {p.label.trim() !== "" ? <span {...(hasTip ? { "aria-describedby": tipId } : {})}>{p.label}</span> : null}
          {hasTip ? (
            <span role="tooltip" id={tipId}>
              {p.tip}
            </span>
          ) : null}
        </div>
      );
    }
    case "hoverCard":
      return (
        <div {...root}>
          {tt("h3", p.title)}
          {tt("p", p.text)}
        </div>
      );
    default:
      return null;
  }
}

function TabHead({ id, name, checked, label }: { id: string; name: string; checked: boolean; label: string }) {
  return (
    <>
      <input type="radio" name={name} id={id} checked={checked} onChange={noop} tabIndex={-1} />
      <label htmlFor={id}>{label}</label>
    </>
  );
}

function AvatarRoot({ root, id, fallback, alt }: { root: Root; id: string; fallback: string; alt: string }) {
  const projectId = useProjectsStore((s) => s.openId);
  const [src, setSrc] = useState<string | null>(null);
  const trimmed = id.trim();
  useEffect(() => {
    if (!trimmed || !projectId) {
      setSrc(null);
      return;
    }
    let dead = false;
    invoke<string | null>("asset_file_path", { projectId, id: trimmed })
      .then((path) => {
        if (dead) return;
        setSrc(path ? convertFileSrc(path) : null);
      })
      .catch(() => {
        if (!dead) setSrc(null);
      });
    return () => {
      dead = true;
    };
  }, [projectId, trimmed]);
  if (!src) return <div {...root}>{fallback}</div>;
  return <img {...(root as HTMLAttributes<HTMLImageElement>)} src={src} alt={alt} />;
}
