import { Suspense, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { toastIpcError } from "@/lib/ipc-error-i18n";
import { usePhrase } from "@/lib/phrases";
import { toast } from "@/lib/toast";
import { Minus, Plus } from "lucide-react";
import type { LabelHrefItem, LabelTextItem, MenubarMenu, Node } from "@/schema";
import { isPhase6bType } from "@/schema";
import { setPhase6bProp, type Phase6bPatch } from "@/lib/document-ops";
import { formatSelectOptions, MAX_SELECT_OPTIONS, parseSelectOptions } from "@/lib/select-options";
import { applyOps, writeProp } from "@/components/editor/style/write";
import { FieldRow } from "@/components/editor/style/FieldRow";
import { TextPropField } from "@/components/editor/style/TextPropField";
import { NumberField } from "@/components/editor/style/NumberField";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { lazyNamed } from "@/lib/lazy";
import { useProjectsStore } from "@/stores/projects-store";

const HrefField = lazyNamed(() =>
  import("@/components/editor/style/HrefField").then((m) => m.HrefField),
);

function commit(nodeId: string, patch: Phase6bPatch) {
  const ix = "index" in patch ? String(patch.index) : "";
  applyOps([(doc) => setPhase6bProp(doc, nodeId, patch)], `p6b:${nodeId}:${patch.kind}:${ix}`);
}

function StrRow({
  id, label, value, locked, placeholder, onCommit,
}: {
  id: string; label: string; value: string; locked: boolean; placeholder?: string; onCommit: (v: string) => void;
}) {
  return (
    <FieldRow id={id} label={label} overridden={false} locked={locked}>
      <TextPropField id={id} value={value} disabled={locked} placeholder={placeholder} onCommit={onCommit} />
    </FieldRow>
  );
}

function NumRow({
  id, value, locked, min, max, onCommit, label = "ค่า",
}: {
  id: string; value: number; locked: boolean; min: number; max: number; onCommit: (n: number) => void; label?: string;
}) {
  return (
    <FieldRow id={id} label={label} overridden={false} locked={locked}>
      <NumberField id={id} value={value} disabled={locked} min={min} max={max} onCommit={onCommit} />
    </FieldRow>
  );
}

function BoolRow({ id, checked, locked, onCommit }: { id: string; checked: boolean; locked: boolean; onCommit: (v: boolean) => void }) {
  return (
    <FieldRow id={id} label="เปิด" overridden={false} locked={locked}>
      <Switch id={id} size="lg" checked={checked} disabled={locked} onCheckedChange={(c) => { if (c !== checked) onCommit(c); }} />
    </FieldRow>
  );
}

function ChoiceRow({
  id, value, locked, options, onCommit, label = "จัดแนว",
}: {
  id: string; value: string; locked: boolean; options: readonly string[]; onCommit: (v: string) => void; label?: string;
}) {
  return (
    <FieldRow id={id} label={label} overridden={false} locked={locked}>
      <select id={id} className="h-7 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" value={value} disabled={locked} onChange={(e) => onCommit(e.target.value)}>
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </FieldRow>
  );
}

const linesAreaCls =
  "min-h-[4.5rem] w-full min-w-0 resize-y rounded-md border bg-transparent px-2 py-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50";

function linesKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>, onEscape: () => void) {
  if (e.key === "Escape") {
    e.preventDefault();
    onEscape();
  } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    e.currentTarget.blur();
  }
}

/** One entry per line; blur / Ctrl|Cmd+Enter commits (Enter alone inserts a line — add options). */
function OptionsLinesRow({
  id, options, locked, onCommit, label = "ตัวเลือก (หนึ่งบรรทัดต่อหนึ่งตัวเลือก)",
}: {
  id: string;
  options: readonly string[];
  locked: boolean;
  onCommit: (opts: string[]) => void;
  label?: string;
}) {
  const value = formatSelectOptions(options);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) onCommit(parseSelectOptions(draft));
    setDraft(null);
  };
  return (
    <FieldRow id={id} label={label} overridden={false} locked={locked} stacked>
      <textarea
        id={id}
        value={draft ?? value}
        disabled={locked}
        spellCheck={false}
        rows={Math.min(8, Math.max(3, options.length + 1))}
        className={linesAreaCls}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => linesKeyDown(e, () => setDraft(null))}
      />
    </FieldRow>
  );
}

/**
 * Growable label+text rows for tabs / accordion (shadcn TabsTrigger + TabsContent text).
 * Explicit เพิ่ม / ลบ — clearer than the old pipe textarea.
 */
function LabelTextPairsEditor({
  nodeId, items, locked, addLabel = "เพิ่มรายการ", rowLabel = "รายการ",
}: {
  nodeId: string;
  items: readonly LabelTextItem[];
  locked: boolean;
  addLabel?: string;
  rowLabel?: string;
}) {
  const tr = usePhrase();
  const replace = (next: LabelTextItem[]) =>
    commit(nodeId, { kind: "labelTextItems", value: next.slice(0, MAX_SELECT_OPTIONS) });
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <FieldRow key={i} id={`p6-lt-${i}`} label={`${rowLabel} ${i + 1}`} overridden={false} locked={locked} stacked>
          <TextPropField
            id={`p6-lt-l-${i}`}
            ariaLabel={`ป้ายกำกับ แถว ${i + 1}`}
            value={item.label}
            disabled={locked}
            placeholder="ป้ายกำกับ"
            onCommit={(v) => commit(nodeId, { kind: "pair", index: i, key: "label", value: v })}
          />
          <div className="flex min-w-0 items-start gap-1">
            <TextPropField
              id={`p6-lt-t-${i}`}
              ariaLabel={`ข้อความ แถว ${i + 1}`}
              value={item.text}
              disabled={locked}
              placeholder="ข้อความ"
              onCommit={(v) => commit(nodeId, { kind: "pair", index: i, key: "text", value: v })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="mt-0.5 shrink-0"
              disabled={locked || items.length <= 1}
              aria-label={`ลบ${rowLabel} ${i + 1}`}
              onClick={() => replace(items.filter((_, j) => j !== i))}
            >
              <Minus className="size-3.5" />
            </Button>
          </div>
        </FieldRow>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 w-full text-[11px]"
        disabled={locked || items.length >= MAX_SELECT_OPTIONS}
        onClick={() => replace([...items, { label: `${rowLabel} ${items.length + 1}`, text: "Content" }])}
      >
        <Plus className="size-3.5" />
        {tr(addLabel)}
      </Button>
    </div>
  );
}

/**
 * Growable label+href rows with URL typing + `เลือกหน้า` picker (same as button link).
 */
function HrefPairsEditor({
  nodeId, items, locked,
}: {
  nodeId: string;
  items: readonly LabelHrefItem[];
  locked: boolean;
}) {
  const tr = usePhrase();
  const replace = (next: LabelHrefItem[]) =>
    commit(nodeId, { kind: "labelHrefItems", value: next.slice(0, MAX_SELECT_OPTIONS) });
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <FieldRow key={i} id={`p6-href-${i}`} label={`รายการ ${i + 1}`} overridden={false} locked={locked} stacked>
          <TextPropField
            id={`p6-href-l-${i}`}
            ariaLabel={`ป้ายกำกับ แถว ${i + 1}`}
            value={item.label}
            disabled={locked}
            placeholder="ป้ายกำกับ"
            onCommit={(v) => commit(nodeId, { kind: "pair", index: i, key: "label", value: v })}
          />
          <div className="flex min-w-0 items-start gap-1">
            <Suspense fallback={<div className="h-7 min-w-0 flex-1 rounded-md border" />}>
              <HrefField
                id={`p6-href-h-${i}`}
                ariaLabel={`ลิงก์ แถว ${i + 1}`}
                value={item.href}
                disabled={locked}
                onCommit={(href) => commit(nodeId, { kind: "pair", index: i, key: "href", value: href })}
              />
            </Suspense>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="mt-0.5 shrink-0"
              disabled={locked}
              aria-label={`ลบรายการ ${i + 1}`}
              onClick={() => replace(items.filter((_, j) => j !== i))}
            >
              <Minus className="size-3.5" />
            </Button>
          </div>
        </FieldRow>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 w-full text-[11px]"
        disabled={locked || items.length >= MAX_SELECT_OPTIONS}
        onClick={() => replace([...items, { label: "รายการ", href: "" }])}
      >
        <Plus className="size-3.5" />
        {tr("เพิ่มรายการ")}
      </Button>
    </div>
  );
}

/**
 * shadcn Menubar: top menus (File / Edit) each with linkable items (URL or เลือกหน้า).
 * Empty href = inert label (static export has no app actions like "New File").
 */
function MenubarEditor({
  nodeId, menus, locked,
}: {
  nodeId: string;
  menus: readonly MenubarMenu[];
  locked: boolean;
}) {
  const tr = usePhrase();
  const replace = (next: MenubarMenu[]) =>
    commit(nodeId, { kind: "menubarMenus", value: next.slice(0, MAX_SELECT_OPTIONS) });
  const setMenu = (i: number, menu: MenubarMenu) => {
    const next = menus.slice();
    next[i] = {
      label: menu.label,
      items: menu.items.slice(0, MAX_SELECT_OPTIONS),
    };
    replace(next);
  };
  return (
    <div className="space-y-3">
      {menus.map((menu, i) => (
        <div key={i} className="space-y-2 rounded-md border p-2">
          <FieldRow id={`p6-mb-m-${i}`} label={`เมนู ${i + 1}`} overridden={false} locked={locked}>
            <TextPropField
              id={`p6-mb-ml-${i}`}
              ariaLabel={`ชื่อเมนู ${i + 1}`}
              value={menu.label}
              disabled={locked}
              placeholder="File"
              onCommit={(label) => setMenu(i, { ...menu, label })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0"
              disabled={locked}
              aria-label={`ลบเมนู ${i + 1}`}
              onClick={() => replace(menus.filter((_, j) => j !== i))}
            >
              <Minus className="size-3.5" />
            </Button>
          </FieldRow>
          {menu.items.map((item, j) => (
            <FieldRow
              key={j}
              id={`p6-mb-${i}-${j}`}
              label={`รายการ ${j + 1}`}
              overridden={false}
              locked={locked}
              stacked
            >
              <TextPropField
                id={`p6-mb-l-${i}-${j}`}
                ariaLabel={`ป้ายกำกับ เมนู ${i + 1} แถว ${j + 1}`}
                value={item.label}
                disabled={locked}
                placeholder="ป้ายกำกับ"
                onCommit={(label) => {
                  const items = menu.items.slice();
                  items[j] = { ...item, label };
                  setMenu(i, { ...menu, items });
                }}
              />
              <div className="flex min-w-0 items-start gap-1">
                <Suspense fallback={<div className="h-7 min-w-0 flex-1 rounded-md border" />}>
                  <HrefField
                    id={`p6-mb-h-${i}-${j}`}
                    ariaLabel={`ลิงก์ เมนู ${i + 1} แถว ${j + 1}`}
                    value={item.href}
                    disabled={locked}
                    onCommit={(href) => {
                      const items = menu.items.slice();
                      items[j] = { ...item, href };
                      setMenu(i, { ...menu, items });
                    }}
                  />
                </Suspense>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="mt-0.5 shrink-0"
                  disabled={locked}
                  aria-label={`ลบรายการ ${j + 1} ของเมนู ${i + 1}`}
                  onClick={() =>
                    setMenu(i, { ...menu, items: menu.items.filter((_, k) => k !== j) })
                  }
                >
                  <Minus className="size-3.5" />
                </Button>
              </div>
            </FieldRow>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 w-full text-[11px]"
            disabled={locked || menu.items.length >= MAX_SELECT_OPTIONS}
            onClick={() =>
              setMenu(i, {
                ...menu,
                items: [...menu.items, { label: "รายการ", href: "" }],
              })
            }
          >
            <Plus className="size-3.5" />
            {tr("เพิ่มรายการในเมนู")}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 w-full text-[11px]"
        disabled={locked || menus.length >= MAX_SELECT_OPTIONS}
        onClick={() =>
          replace([
            ...menus,
            { label: "เมนู", items: [{ label: "รายการ", href: "" }] },
          ])
        }
      >
        <Plus className="size-3.5" />
        {tr("เพิ่มเมนู")}
      </Button>
    </div>
  );
}

function AvatarFile({ nodeId, assetId, locked }: { nodeId: string; assetId: string; locked: boolean }) {
  const tr = usePhrase();
  const projectId = useProjectsStore((s) => s.openId);
  const [busy, setBusy] = useState(false);
  const hasFile = assetId.trim() !== "";
  const pickLabel = hasFile ? tr("เปลี่ยนรูป") : tr("เลือกรูป");
  return (
    <FieldRow id="pf-avatar" label="รูป" overridden={false} locked={locked}>
      <Button id="pf-avatar" type="button" variant="outline" size="sm" className="h-7 w-full text-[11px]" disabled={locked || busy || !projectId} aria-busy={busy}
        onClick={() => {
          if (locked || busy || !projectId) return;
          setBusy(true);
          void (async () => {
            try {
              const picked = await open({ title: pickLabel, multiple: false, filters: [{ name: tr("รูป"), extensions: ["jpg", "jpeg", "png", "gif", "webp"] }] });
              if (picked == null || Array.isArray(picked)) return;
              const imported = await invoke<{ id: string }>("import_image", { projectId, path: picked });
              writeProp(nodeId, "srcId", imported.id);
            } catch (e) {
              const msg = e instanceof Error && e.message.trim() ? e.message : "นำเข้ารูปไม่สำเร็จ";
              toast.error(toastIpcError(msg));
            } finally {
              setBusy(false);
            }
          })();
        }}
      >{pickLabel}</Button>
    </FieldRow>
  );
}

export function Phase6bProps({ node, locked }: { node: Node; locked: boolean }) {
  const p = node.props;
  if (!isPhase6bType(node.type) || !isPhase6bType(p.type)) return null;
  const id = node.id;
  const str = (key: string) => (v: string) => commit(id, { kind: "str", key, value: v });
  const body = (
    <>
      {p.type === "textarea" ? (
        <>
          <StrRow id="p6-label" label="ป้ายกำกับ" value={p.label} locked={locked} onCommit={str("label")} />
          <StrRow id="p6-ph" label="ข้อความตัวอย่าง" value={p.placeholder} locked={locked} onCommit={str("placeholder")} />
        </>
      ) : null}
      {p.type === "kbd" || p.type === "marker" || p.type === "bubble" ? (
        <StrRow id="p6-text" label="ข้อความ" value={p.text} locked={locked} onCommit={str("text")} />
      ) : null}
      {p.type === "avatar" ? (
        <>
          <AvatarFile nodeId={id} assetId={p.src.id} locked={locked} />
          <StrRow id="p6-fallback" label="ข้อความ" value={p.fallback} locked={locked} onCommit={str("fallback")} />
        </>
      ) : null}
      {p.type === "progress" ? (
        <NumRow id="p6-value" value={p.value} locked={locked} min={0} max={100} onCommit={(n) => commit(id, { kind: "num", key: "value", value: n })} />
      ) : null}
      {p.type === "slider" ? (
        <>
          <NumRow
            id="p6-value"
            value={p.value}
            locked={locked}
            min={p.min ?? 0}
            max={Math.max(p.min ?? 0, p.max ?? 100)}
            onCommit={(n) => commit(id, { kind: "num", key: "value", value: n })}
          />
          <NumRow id="p6-min" label="ต่ำสุด" value={p.min ?? 0} locked={locked} min={0} max={10_000} onCommit={(n) => commit(id, { kind: "num", key: "min", value: n })} />
          <NumRow id="p6-max" label="สูงสุด" value={p.max ?? 100} locked={locked} min={0} max={10_000} onCommit={(n) => commit(id, { kind: "num", key: "max", value: n })} />
          <NumRow id="p6-step" label="ขั้น" value={p.step ?? 1} locked={locked} min={1} max={10_000} onCommit={(n) => commit(id, { kind: "num", key: "step", value: n })} />
        </>
      ) : null}
      {p.type === "empty" ? (
        <>
          <StrRow id="p6-title" label="หัวข้อ" value={p.title} locked={locked} onCommit={str("title")} />
          <StrRow id="p6-msg" label="ข้อความ" value={p.message} locked={locked} onCommit={str("message")} />
          <StrRow
            id="p6-act"
            label="ปุ่มกระทำ"
            value={p.actionLabel ?? ""}
            locked={locked}
            onCommit={(v) => commit(id, { kind: "str", key: "actionLabel", value: v })}
          />
          <FieldRow id="p6-act-href" label="ลิงก์กระทำ" overridden={false} locked={locked}>
            <Suspense fallback={<div className="h-7 min-w-0 flex-1 rounded-md border" />}>
              <HrefField
                id="p6-act-href"
                value={p.actionHref ?? ""}
                disabled={locked}
                onCommit={(href) => commit(id, { kind: "str", key: "actionHref", value: href })}
              />
            </Suspense>
          </FieldRow>
        </>
      ) : null}
      {p.type === "item" ? (
        <>
          <StrRow id="p6-title" label="หัวข้อ" value={p.title} locked={locked} onCommit={str("title")} />
          <StrRow id="p6-desc" label="ข้อความ" value={p.description} locked={locked} onCommit={str("description")} />
        </>
      ) : null}
      {p.type === "bubble" || p.type === "message" ? (
        <ChoiceRow id="p6-align" value={p.align} locked={locked} options={["start", "end"]} onCommit={(v) => commit(id, { kind: "align", value: v === "end" ? "end" : "start" })} />
      ) : null}
      {p.type === "message" ? (
        <>
          <StrRow id="p6-sender" label="ป้ายกำกับ" value={p.sender} locked={locked} onCommit={str("sender")} />
          <StrRow id="p6-text" label="ข้อความ" value={p.text} locked={locked} onCommit={str("text")} />
        </>
      ) : null}
      {p.type === "select" ? (
        <>
          <StrRow id="p6-val" label="ค่า" value={p.value} locked={locked} onCommit={str("value")} />
          <OptionsLinesRow
            id="p6-options"
            options={p.options}
            locked={locked}
            onCommit={(opts) => commit(id, { kind: "options", value: opts })}
          />
        </>
      ) : null}
      {p.type === "radio" ? (
        <>
          <StrRow id="p6-val" label="ค่า" value={p.value} locked={locked} onCommit={str("value")} />
          <OptionsLinesRow
            id="p6-options"
            options={p.options}
            locked={locked}
            onCommit={(opts) => commit(id, { kind: "options", value: opts })}
          />
        </>
      ) : null}
      {p.type === "toggle" ? (
        <>
          <StrRow id="p6-label" label="ป้ายกำกับ" value={p.label} locked={locked} onCommit={str("label")} />
          <BoolRow id="p6-pressed" checked={p.pressed} locked={locked} onCommit={(v) => commit(id, { kind: "bool", key: "pressed", value: v })} />
        </>
      ) : null}
      {p.type === "toggleGroup" ? (
        <>
          <NumRow id="p6-active" value={p.active} locked={locked} min={0} max={Math.max(0, p.items.length - 1)} onCommit={(n) => commit(id, { kind: "num", key: "active", value: n })} />
          <OptionsLinesRow
            id="p6-items"
            options={p.items}
            locked={locked}
            label="รายการ (หนึ่งบรรทัดต่อหนึ่งรายการ)"
            onCommit={(items) => commit(id, { kind: "items", value: items })}
          />
        </>
      ) : null}
      {p.type === "pagination" ? (
        <>
          <NumRow id="p6-active" value={p.active} locked={locked} min={0} max={Math.max(0, p.items.length - 1)} onCommit={(n) => commit(id, { kind: "num", key: "active", value: n })} />
          <HrefPairsEditor nodeId={id} items={p.items} locked={locked} />
        </>
      ) : null}
      {p.type === "tabs" ? (
        <>
          <NumRow id="p6-active" value={p.active} locked={locked} min={0} max={Math.max(0, p.items.length - 1)} onCommit={(n) => commit(id, { kind: "num", key: "active", value: n })} />
          <LabelTextPairsEditor nodeId={id} items={p.items} locked={locked} addLabel="เพิ่มแท็บ" rowLabel="แท็บ" />
        </>
      ) : null}
      {p.type === "accordion" ? (
        <>
          <NumRow id="p6-active" value={p.open} locked={locked} min={0} max={Math.max(0, p.items.length - 1)} onCommit={(n) => commit(id, { kind: "num", key: "open", value: n })} />
          <LabelTextPairsEditor nodeId={id} items={p.items} locked={locked} addLabel="เพิ่มรายการ" rowLabel="รายการ" />
        </>
      ) : null}
      {p.type === "menubar" ? <MenubarEditor nodeId={id} menus={p.items} locked={locked} /> : null}
      {p.type === "inputGroup" ? (
        <>
          <StrRow id="p6-pre" label="ป้ายกำกับ" value={p.prefix} locked={locked} onCommit={str("prefix")} />
          <StrRow id="p6-ph" label="ข้อความตัวอย่าง" value={p.placeholder} locked={locked} onCommit={str("placeholder")} />
          <StrRow id="p6-suf" label="ป้ายกำกับ" value={p.suffix} locked={locked} onCommit={str("suffix")} />
        </>
      ) : null}
      {p.type === "inputOtp" ? (
        <>
          <NumRow id="p6-len" value={p.length} locked={locked} min={1} max={8} onCommit={(n) => commit(id, { kind: "num", key: "length", value: n })} />
          <StrRow id="p6-val" label="ค่า" value={p.value} locked={locked} onCommit={str("value")} />
        </>
      ) : null}
      {p.type === "collapsible" ? (
        <>
          <StrRow id="p6-label" label="ป้ายกำกับ" value={p.label} locked={locked} onCommit={str("label")} />
          <StrRow id="p6-text" label="ข้อความ" value={p.text} locked={locked} onCommit={str("text")} />
          <BoolRow id="p6-open" checked={p.open} locked={locked} onCommit={(v) => commit(id, { kind: "bool", key: "open", value: v })} />
        </>
      ) : null}
      {p.type === "breadcrumb" || p.type === "navigationMenu" ? (
        <HrefPairsEditor nodeId={id} items={p.items} locked={locked} />
      ) : null}
      {p.type === "dropdownMenu" ? (
        <>
          <StrRow id="p6-label" label="ป้ายกำกับ" value={p.label} locked={locked} onCommit={str("label")} />
          <HrefPairsEditor nodeId={id} items={p.items} locked={locked} />
        </>
      ) : null}
      {p.type === "dialog" || p.type === "sheet" || p.type === "drawer" ? (
        <>
          <StrRow id="p6-title" label="หัวข้อ" value={p.title} locked={locked} onCommit={str("title")} />
          <StrRow id="p6-msg" label="ข้อความ" value={p.message} locked={locked} onCommit={str("message")} />
          <BoolRow id="p6-open" checked={p.open} locked={locked} onCommit={(v) => commit(id, { kind: "bool", key: "open", value: v })} />
        </>
      ) : null}
      {p.type === "sheet" || p.type === "drawer" ? (
        <ChoiceRow
          id="p6-side"
          label="ด้าน"
          value={p.side}
          locked={locked}
          options={["top", "right", "bottom", "left"]}
          onCommit={(v) => {
            const side =
              v === "top" || v === "right" || v === "bottom" || v === "left" ? v : p.side;
            commit(id, { kind: "side", value: side });
          }}
        />
      ) : null}
      {p.type === "alertDialog" ? (
        <>
          <StrRow id="p6-title" label="หัวข้อ" value={p.title} locked={locked} onCommit={str("title")} />
          <StrRow id="p6-msg" label="ข้อความ" value={p.message} locked={locked} onCommit={str("message")} />
          <StrRow id="p6-ok" label="ป้ายกำกับ" value={p.confirm} locked={locked} onCommit={str("confirm")} />
          <FieldRow id="p6-ok-href" label="ลิงก์ยืนยัน" overridden={false} locked={locked}>
            <Suspense fallback={<div className="h-7 min-w-0 flex-1 rounded-md border" />}>
              <HrefField
                id="p6-ok-href"
                value={p.confirmHref ?? ""}
                disabled={locked}
                onCommit={(href) => commit(id, { kind: "str", key: "confirmHref", value: href })}
              />
            </Suspense>
          </FieldRow>
          <StrRow id="p6-cancel" label="ป้ายกำกับ" value={p.cancel} locked={locked} onCommit={str("cancel")} />
          <FieldRow id="p6-no-href" label="ลิงก์ยกเลิก" overridden={false} locked={locked}>
            <Suspense fallback={<div className="h-7 min-w-0 flex-1 rounded-md border" />}>
              <HrefField
                id="p6-no-href"
                value={p.cancelHref ?? ""}
                disabled={locked}
                onCommit={(href) => commit(id, { kind: "str", key: "cancelHref", value: href })}
              />
            </Suspense>
          </FieldRow>
        </>
      ) : null}
      {p.type === "popover" ? (
        <>
          <StrRow id="p6-label" label="ป้ายกำกับ" value={p.label} locked={locked} onCommit={str("label")} />
          <StrRow id="p6-text" label="ข้อความ" value={p.text} locked={locked} onCommit={str("text")} />
        </>
      ) : null}
      {p.type === "tooltip" ? (
        <>
          <StrRow id="p6-label" label="ป้ายกำกับ" value={p.label} locked={locked} onCommit={str("label")} />
          <StrRow id="p6-tip" label="ข้อความ" value={p.tip} locked={locked} onCommit={str("tip")} />
        </>
      ) : null}
      {p.type === "hoverCard" ? (
        <>
          <StrRow id="p6-title" label="หัวข้อ" value={p.title} locked={locked} onCommit={str("title")} />
          <StrRow id="p6-text" label="ข้อความ" value={p.text} locked={locked} onCommit={str("text")} />
        </>
      ) : null}
    </>
  );
  return (
    <section className="space-y-2 border-t border-sidebar-border py-2">
      <h3 className="text-xs font-medium text-muted-foreground">คุณสมบัติ</h3>
      {body}
    </section>
  );
}
