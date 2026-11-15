/**
 * Style panel: Form↔DB binding for the selected node.
 */
import { useMemo } from "react";
import { FieldRow } from "@/components/editor/style/FieldRow";
import { TextPropField } from "@/components/editor/style/TextPropField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { setNodeDb } from "@/lib/document-ops";
import { useDbModelStore } from "@/lib/db-model-store";
import { usePhrase } from "@/lib/phrases";
import { useProjectsStore } from "@/stores/projects-store";
import type { Node, NodeDb } from "@/schema";

function writeDb(nodeId: string, db: NodeDb | undefined) {
  const doc = useProjectsStore.getState().openDocument;
  if (!doc) return;
  const next = setNodeDb(doc, nodeId, db);
  if (next) useProjectsStore.getState().updateOpenDocument(next, { historyKey: `db:${nodeId}` });
}

export function DbBindingSection({ node, locked }: { node: Node; locked: boolean }) {
  const p = usePhrase();
  const model = useDbModelStore((s) => s.model);
  const tables = model.tables;
  const db = node.db;
  const t = node.props.type;

  const showForm = t === "container" || t === "card" || t === "section";
  const showColumn =
    t === "input" || t === "textarea" || t === "select" || t === "switch" || t === "checkbox";
  const showSubmit = t === "button";
  const showList = showForm;

  const columns = useMemo(() => {
    const tableId = db?.form?.tableId ?? tables[0]?.id;
    return tables.find((x) => x.id === tableId)?.columns ?? [];
  }, [db?.form?.tableId, tables]);

  if (!showForm && !showColumn && !showSubmit) return null;
  if (tables.length === 0) {
    return (
      <section className="space-y-2 border-t border-sidebar-border py-2">
        <p className="px-1 text-xs text-muted-foreground">{p("ผูกฐานข้อมูล — ยังไม่มีตาราง")}</p>
      </section>
    );
  }

  return (
    <section className="space-y-2 border-t border-sidebar-border py-2">
      <p className="px-1 text-xs font-medium">{p("ผูกฐานข้อมูล")}</p>

      {showSubmit ? (
        <FieldRow id="db-submit" label="ปุ่มบันทึก DB" overridden={false} locked={locked}>
          <Switch
            id="db-submit"
            size="lg"
            checked={node.props.type === "button" && node.props.action === "dbSubmit"}
            disabled={locked}
            onCheckedChange={(on) => {
              if (node.props.type !== "button") return;
              const doc = useProjectsStore.getState().openDocument;
              if (!doc) return;
              const n = doc.nodes[node.id];
              if (!n || n.props.type !== "button") return;
              const props = { ...n.props, action: on ? ("dbSubmit" as const) : ("none" as const) };
              if (on) delete (props as { href?: string }).href;
              useProjectsStore.getState().updateOpenDocument(
                { ...doc, nodes: { ...doc.nodes, [node.id]: { ...n, props } } },
                { historyKey: `dbSubmit:${node.id}` },
              );
            }}
          />
        </FieldRow>
      ) : null}

      {showForm ? (
        <>
          <FieldRow id="db-form-table" label="ตารางฟอร์ม" overridden={!!db?.form} locked={locked}>
            <Select
              value={db?.form?.tableId ?? ""}
              disabled={locked}
              onValueChange={(tableId) => {
                if (!tableId) {
                  const next = { ...db };
                  delete next.form;
                  writeDb(node.id, Object.keys(next).length ? next : undefined);
                  return;
                }
                writeDb(node.id, {
                  ...db,
                  form: { tableId, op: db?.form?.op ?? "insert", keyColumnId: db?.form?.keyColumnId },
                });
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {tables.map((tb) => (
                  <SelectItem key={tb.id} value={tb.id}>
                    {tb.label || tb.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          {db?.form ? (
            <FieldRow id="db-form-op" label="การทำงาน" overridden={false} locked={locked}>
              <Select
                value={db.form.op}
                disabled={locked}
                onValueChange={(op) => {
                  writeDb(node.id, {
                    ...db,
                    form: {
                      ...db.form!,
                      op: op as NonNullable<NodeDb["form"]>["op"],
                    },
                  });
                }}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["insert", "update", "delete", "load"] as const).map((op) => (
                    <SelectItem key={op} value={op}>
                      {op}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
          ) : null}
        </>
      ) : null}

      {showList && db?.form ? (
        <FieldRow id="db-list" label="รายการ + ค้นหา FK" overridden={!!db.list} locked={locked}>
          <Switch
            id="db-list"
            size="lg"
            checked={!!db.list}
            disabled={locked}
            onCheckedChange={(on) => {
              const next = { ...db };
              if (on) next.list = { tableId: db.form!.tableId, resolveFks: true, search: true };
              else delete next.list;
              writeDb(node.id, next);
            }}
          />
        </FieldRow>
      ) : null}

      {showColumn ? (
        <FieldRow id="db-column" label="คอลัมน์" overridden={!!db?.column} locked={locked}>
          <Select
            value={db?.column ?? ""}
            disabled={locked}
            onValueChange={(columnId) => {
              if (!columnId) {
                const next = { ...db };
                delete next.column;
                writeDb(node.id, Object.keys(next).length ? next : undefined);
                return;
              }
              writeDb(node.id, { ...db, column: columnId });
            }}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {columns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label || c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
      ) : null}

      {db?.adminSource ? (
        <FieldRow id="db-admin-source" label="แหล่ง admin" overridden={false} locked={locked}>
          <TextPropField id="db-admin-source" value={db.adminSource} disabled onCommit={() => {}} />
        </FieldRow>
      ) : null}
    </section>
  );
}
