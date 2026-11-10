/**
 * PREVIEW-CODE-VIEW S3 + R1: export file tree + CodeMirror.
 * Only `src/data/site.json` is editable. Other files stay read-only.
 * Lazy chunk `code-view` — loaded only when mode === "code" or Split's code pane.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, drawSelection } from "@codemirror/view";
import { HighlightStyle, defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { defaultKeymap } from "@codemirror/commands";
import { autocompletion } from "@codemirror/autocomplete";
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  search,
  searchKeymap,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import type { EditorView as EditorViewType } from "@codemirror/view";
import type { Panel } from "@codemirror/view";
import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";
import { FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { lastExportDest, useLastExportDest } from "@/lib/export-folder";
import type { PageDocument } from "@/schema";
import {
  SITE_JSON_DEBOUNCE_MS,
  SITE_JSON_HISTORY_KEY,
  SITE_JSON_PATH,
  viewFromParsedSite,
} from "@/lib/site-json-edit";
import { siteJsonComplete } from "@/lib/site-json-hint";
import { themedSpecs } from "@/lib/code-view-colors";
import { useProjectsStore } from "@/stores/projects-store";
import { useEditorStore } from "@/stores/editor-store";

/** A3 item 8: CodeMirror's default token colours, read from theme variables (index.css). */
const codeHighlight = HighlightStyle.define(themedSpecs(defaultHighlightStyle.specs));

export type ExportListEntry = {
  path: string;
  binary: boolean;
  text: string | null;
  ranges?: Record<string, [number, number]>;
};

const DEFAULT_FILE = SITE_JSON_PATH;
const KINDS_CSS = "src/styles/kinds.css";
const SITE_CSS = "src/styles/site.css";

function thaiSearchPanel(view: EditorViewType): Panel {
  const wrap = document.createElement("div");
  wrap.className = "flex items-center gap-1 border-b border-border bg-muted/40 px-2 py-1";
  const input = document.createElement("input");
  input.placeholder = "ค้นหา";
  input.setAttribute("aria-label", "ค้นหาในโค้ด");
  input.className = "h-6 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs";
  const btn = (label: string, run: () => void) => {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = label;
    el.className = "h-6 rounded-md px-2 text-xs hover:bg-accent";
    el.onclick = run;
    return el;
  };
  const apply = () => {
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: input.value })) });
  };
  input.addEventListener("input", apply);
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      apply();
      if (ev.shiftKey) findPrevious(view);
      else findNext(view);
    } else if (ev.key === "Escape") closeSearchPanel(view);
  });
  wrap.append(
    input,
    btn("ก่อนหน้า", () => {
      apply();
      findPrevious(view);
    }),
    btn("ถัดไป", () => {
      apply();
      findNext(view);
    }),
    btn("ปิด", () => closeSearchPanel(view)),
  );
  return { dom: wrap, top: true };
}

function langFor(path: string) {
  if (path.endsWith(".json")) return json();
  if (path.endsWith(".css")) return css();
  if (/\.(tsx?|jsx?|mjs|cjs)$/.test(path) || path.endsWith(".html")) {
    return javascript({ typescript: path.endsWith(".ts") || path.endsWith(".tsx"), jsx: true });
  }
  return [];
}

function innermostId(
  ranges: Record<string, [number, number]> | undefined,
  pos: number,
): string | null {
  if (!ranges) return null;
  let best: { id: string; span: number } | null = null;
  for (const [id, [a, b]] of Object.entries(ranges)) {
    if (pos >= a && pos < b) {
      const span = b - a;
      if (!best || span < best.span) best = { id, span };
    }
  }
  return best?.id ?? null;
}

export function CodeView() {
  const projectId = useProjectsStore((s) => s.openId);
  const doc = useProjectsStore((s) => s.openDocument);
  const announce = useEditorStore((s) => s.announce);
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useEditorStore((s) => s.setSelectedNodeId);
  const dest = useLastExportDest(projectId);
  const [files, setFiles] = useState<ExportListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(DEFAULT_FILE);
  const [tabs, setTabs] = useState<string[]>([DEFAULT_FILE]);
  const [wrap, setWrap] = useState(false);
  const [copied, setCopied] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<string[]>([]);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const copiedTimer = useRef<number>(0);
  const holdRef = useRef(false);
  const parseTimer = useRef<number>(0);
  const filesRef = useRef(files);
  filesRef.current = files;

  useEffect(() => {
    if (!projectId || !doc) return;
    let dead = false;
    setError(null);
    setFiles(null);
    Promise.all([
      invoke<ExportListEntry[]>("list_project_files", { projectId }).catch(() => [] as ExportListEntry[]),
      invoke<ExportListEntry[]>("list_export_files", { projectId, document: doc }),
    ])
      .then(([disk, gen]) => {
        if (dead) return;
        const by = new Map<string, ExportListEntry>();
        for (const f of gen) by.set(f.path, f);
        for (const f of disk) if (!by.has(f.path)) by.set(f.path, f);
        const list = [...by.values()].sort((a, b) => a.path.localeCompare(b.path));
        setFiles(list);
        if (!list.some((f) => f.path === active)) {
          const prefer =
            list.find((f) => f.path === DEFAULT_FILE) ??
            list.find((f) => !f.binary && f.text != null) ??
            list[0];
          if (prefer) setActive(prefer.path);
        }
      })
      .catch((e: unknown) => {
        if (!dead) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, doc]);

  useEffect(() => {
    if (!projectId) return;
    void invoke<string[]>("list_project_overrides", { projectId })
      .then(setOverrides)
      .catch(() => setOverrides([]));
  }, [projectId, doc]);

  const entry = useMemo(
    () => files?.find((f) => f.path === active) ?? null,
    [files, active],
  );

  const openFile = (path: string) => {
    setActive(path);
    setTabs((t) => (t.includes(path) ? t : [...t, path]));
  };

  const closeTab = (path: string) => {
    setTabs((t) => {
      const next = t.filter((p) => p !== path);
      if (path === active) {
        const i = t.indexOf(path);
        const fallback = next[i] ?? next[i - 1] ?? DEFAULT_FILE;
        setActive(fallback);
      }
      return next.length ? next : [DEFAULT_FILE];
    });
  };

  const editable = entry?.path === DEFAULT_FILE && !entry.binary && entry.text != null;

  const commitText = async (text: string): Promise<string | null> => {
    if (!editable) return null;
    try {
      const parsed = await invoke<PageDocument>("parse_site_json", { text });
      const current = useProjectsStore.getState().openDocument;
      if (!current) return null;
      const openId = useEditorStore.getState().openPageId;
      const next = viewFromParsedSite(parsed, current, openId);
      useEditorStore.getState().setOpenPageId(next.openPageId);
      useProjectsStore.getState().updateOpenDocument(next.doc, {
        historyKey: SITE_JSON_HISTORY_KEY,
      });
      setJsonError(null);
      return null;
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      const msg =
        raw.startsWith("JSON") || raw.includes("เอกสารไม่ถูกต้อง") ? raw : `JSON ไม่ถูกต้อง: ${raw}`;
      setJsonError(msg);
      return msg;
    }
  };

  const writeTemplate = async (path: string, text: string) => {
    if (!projectId) return;
    await invoke("write_project_file", { projectId, path, text });
    setOverrides((prev) => (prev.includes(path) ? prev : [...prev, path]));
  };

  const scheduleCommit = (text: string) => {
    window.clearTimeout(parseTimer.current);
    parseTimer.current = window.setTimeout(() => {
      const path = entry?.path;
      if (!path) return;
      if (path === DEFAULT_FILE) void commitText(text);
      else void writeTemplate(path, text).catch((e: unknown) => announce(e instanceof Error ? e.message : String(e)));
    }, SITE_JSON_DEBOUNCE_MS);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!entry || entry.binary || entry.text == null) {
      viewRef.current?.destroy();
      viewRef.current = null;
      holdRef.current = false;
      return;
    }

    const view = viewRef.current;
    if (view && view.dom.isConnected) {
      if (!holdRef.current && view.state.doc.toString() !== entry.text) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: entry.text },
        });
      }
      return;
    }

    viewRef.current?.destroy();
    const ranges = entry.ranges;
    const canEdit = entry.path !== KINDS_CSS;
    const state = EditorState.create({
      doc: entry.text,
      extensions: [
        lineNumbers(),
        drawSelection(),
        syntaxHighlighting(codeHighlight, { fallback: true }),
        keymap.of([...defaultKeymap, ...searchKeymap]),
        search({ createPanel: thaiSearchPanel }),
        canEdit && entry.path === DEFAULT_FILE ? autocompletion({ override: [siteJsonComplete] }) : [],
        canEdit
          ? EditorView.updateListener.of((update) => {
              if (!update.docChanged) return;
              holdRef.current = true;
              scheduleCommit(update.state.doc.toString());
            })
          : [
              EditorView.editable.of(false),
              EditorState.readOnly.of(true),
              EditorView.contentAttributes.of({ "aria-readonly": "true" }),
            ],
        wrap ? EditorView.lineWrapping : [],
        langFor(entry.path),
        EditorView.domEventHandlers({
          blur: () => {
            window.clearTimeout(parseTimer.current);
            const live = viewRef.current;
            if (!canEdit || !live) return false;
            const text = live.state.doc.toString();
            const done =
              entry.path === DEFAULT_FILE
                ? commitText(text)
                : writeTemplate(entry.path, text).then(() => null);
            void done.then((err) => {
              if (err) return;
              holdRef.current = false;
              if (entry.path !== DEFAULT_FILE) return;
              const fresh = filesRef.current?.find((f) => f.path === DEFAULT_FILE)?.text;
              const currentView = viewRef.current;
              if (fresh != null && currentView && currentView.state.doc.toString() !== fresh && !holdRef.current) {
                currentView.dispatch({
                  changes: { from: 0, to: currentView.state.doc.length, insert: fresh },
                });
              }
            });
            return false;
          },
          mousedown: (ev, cm) => {
            if (entry.path !== DEFAULT_FILE || !ranges || holdRef.current) return false;
            const pos = cm.posAtCoords({ x: ev.clientX, y: ev.clientY });
            if (pos == null) return false;
            const id = innermostId(ranges, pos);
            if (id) setSelectedNodeId(id);
            return false;
          },
        }),
        EditorView.theme({
          "&": { height: "100%", fontSize: "12px" },
          ".cm-scroller": { overflow: "auto", fontFamily: "ui-monospace, monospace" },
          ".cm-content": { caretColor: canEdit ? "auto" : "transparent" },
        }),
      ],
    });
    viewRef.current = new EditorView({ state, parent: host });
    return () => {
      window.clearTimeout(parseTimer.current);
      viewRef.current?.destroy();
      viewRef.current = null;
    };
    // scheduleCommit/commitText close over the latest setters; rebuild only when the file or wrap changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.path, entry?.binary, entry?.text == null, wrap, setSelectedNodeId]);

  // When the generator refreshes site.json and the user is not mid-edit, show the new text.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !entry || entry.text == null || holdRef.current) return;
    if (view.state.doc.toString() === entry.text) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: entry.text },
    });
  }, [entry]);

  // S4: canvas / frame selection → reveal the node object in site.json.
  useEffect(() => {
    if (holdRef.current) return;
    if (!selectedNodeId || !entry?.ranges || entry.path !== DEFAULT_FILE) return;
    const range = entry.ranges[selectedNodeId];
    const view = viewRef.current;
    if (!range || !view) return;
    const [from, to] = range;
    view.dispatch({
      selection: { anchor: from, head: Math.min(to, view.state.doc.length) },
      scrollIntoView: true,
    });
  }, [selectedNodeId, entry]);

  const copy = async () => {
    if (!entry?.text) return;
    try {
      await navigator.clipboard.writeText(entry.text);
      announce("คัดลอกโค้ดแล้ว");
      setCopied(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      announce("คัดลอกไม่สำเร็จ");
    }
  };

  const openFolder = () => {
    if (!projectId) return;
    void invoke("open_project_folder", { projectId }).catch(() => {
      const path = dest ?? lastExportDest(projectId);
      if (!path) {
        announce("ยังไม่มีโฟลเดอร์โปรเจกต์ — บันทึกก่อน");
        return;
      }
      void invoke("open_export_folder", { destPath: path }).catch((e: unknown) => {
        announce(e instanceof Error ? e.message : String(e));
      });
    });
  };

  const folderDisabled = false;

  return (
    <div
      role="region"
      aria-label="โค้ดโปรเจกต์ (Project code)"
      tabIndex={-1}
      data-kbd-pane="code"
      className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
    >
      <nav
        aria-label="ไฟล์ในโปรเจกต์"
        className="scrollbar-thin flex w-56 shrink-0 flex-col overflow-auto border-r border-border bg-sidebar py-1 text-[11px]"
      >
        {!files && !error ? (
          <div className="flex items-center gap-2 px-2 py-3 text-muted-foreground">
            <Spinner className="size-3.5" aria-hidden />
            กำลังโหลด…
          </div>
        ) : null}
        {error ? (
          <p className="px-2 py-3 text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {(files ?? []).map((f) => (
          <button
            key={f.path}
            type="button"
            className={cn(
              "truncate px-2 py-1 text-left ring-transparent transition-shadow hover:bg-sidebar-accent hover:ring-1 hover:ring-ring",
              f.path === active && "bg-sidebar-accent font-medium",
            )}
            title={f.path}
            style={{ paddingLeft: 8 + f.path.split("/").slice(0, -1).length * 12 }}
            onClick={() => openFile(f.path)}
          >
            <FileText className="mr-1 inline size-3 shrink-0 text-muted-foreground" aria-hidden />
            {f.path.split("/").pop()}
          </button>
        ))}
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="scrollbar-thin flex h-8 shrink-0 items-stretch gap-px overflow-x-auto border-b border-border bg-muted/40">
          {tabs.map((path) => (
            <div
              key={path}
              className={cn(
                "flex max-w-48 shrink-0 items-center border-r border-border text-[11px]",
                path === active ? "bg-background" : "bg-transparent",
              )}
            >
              <button
                type="button"
                className="truncate px-2 py-1"
                onClick={() => setActive(path)}
              >
                {path.split("/").pop()}
              </button>
              <button
                type="button"
                className="px-1 text-muted-foreground hover:text-foreground"
                aria-label={`ปิด ${path}`}
                onClick={() => closeTab(path)}
              >
                <X className="size-3" aria-hidden />
              </button>
            </div>
          ))}
        </div>
        {overrides.length > 0 ? (
          <p role="status" className="border-b border-border bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
            หน้าออกแบบตามข้อมูลหน้า โค้ดเทมเพลตเป็นของโปรเจกต์
            {overrides.includes(SITE_CSS) ? (
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="ml-2"
                onClick={() => {
                  if (!projectId || !doc) return;
                  void invoke("regenerate_site_css", { projectId, document: doc }).then(() => {
                    setOverrides((prev) => prev.filter((p) => p !== SITE_CSS));
                  });
                }}
              >
                สร้าง CSS ใหม่
              </Button>
            ) : null}
          </p>
        ) : null}
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {active}
          </span>
          {jsonError ? (
            <span role="status" className="max-w-[40%] truncate text-[11px] text-destructive">
              {jsonError}
            </span>
          ) : null}
          {copied ? (
            <span role="status" className="text-[11px] text-muted-foreground">
              คัดลอกโค้ดแล้ว
            </span>
          ) : null}
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={!entry?.text}
            onClick={() => void copy()}
          >
            คัดลอกโค้ด
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={folderDisabled}
            title={folderDisabled ? "ยังไม่ได้ส่งออกโปรเจกต์" : undefined}
            onClick={openFolder}
          >
            เปิดโฟลเดอร์
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            aria-pressed={wrap}
            onClick={() => setWrap((w) => !w)}
          >
            ขึ้นบรรทัดใหม่
          </Button>
        </div>
        <div className="relative min-h-0 flex-1">
          {entry?.binary ? (
            <p className="p-4 text-sm text-muted-foreground">
              ไฟล์ไบนารี — ดูชื่อในรายการเท่านั้น
            </p>
          ) : entry && entry.text == null ? (
            <p className="p-4 text-sm text-muted-foreground">
              ไฟล์ใหญ่เกิน 2 MB — เปิดเป็นข้อความธรรมดาหลังส่งออก
            </p>
          ) : (
            <div ref={hostRef} className="absolute inset-0" />
          )}
        </div>
      </div>
    </div>
  );
}
