/**
 * Form↔DB actions in Database mode: recipes, form-from-table, admin pack.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDbModelStore } from "@/lib/db-model-store";
import { useProjectsStore } from "@/stores/projects-store";
import { useEditorStore } from "@/stores/editor-store";
import { usePhrase } from "@/lib/phrases";
import {
  applyAdminPackPages,
  applyCatalogRecipe,
  applyUsersRecipe,
  buildAdminPack,
  buildFormPageFromTable,
  buildHintLines,
} from "@/lib/form-db";
import { ensurePages, syncOpenIntoPages } from "@/lib/project-pages";
import { toast } from "sonner";

export function FormDbActions() {
  const p = usePhrase();
  const model = useDbModelStore((s) => s.model);
  const selectedId = useDbModelStore((s) => s.selectedTableId);
  const commit = useDbModelStore((s) => s.commit);
  const [hint, setHint] = useState<string[] | null>(null);

  const selected = model.tables.find((t) => t.id === selectedId) ?? model.tables[0] ?? null;

  const pushPages = (pages: ReturnType<typeof buildFormPageFromTable>["page"][]) => {
    const doc = useProjectsStore.getState().openDocument;
    if (!doc || pages.length === 0) return;
    const next = applyAdminPackPages(doc, pages);
    useProjectsStore.getState().updateOpenDocument(next, { historyKey: "form-db:pages" });
    useEditorStore.getState().setMode("design");
    toast.success(p("สร้างหน้าแล้ว"));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            {p("ฟอร์มและหลังบ้าน")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem
            onSelect={() => {
              commit(applyUsersRecipe(model));
              toast.success(p("เพิ่มตารางผู้ใช้แล้ว"));
            }}
          >
            {p("สูตรตารางผู้ใช้")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              commit(applyCatalogRecipe(model));
              toast.success(p("เพิ่มตารางแคตตาล็อกแล้ว"));
            }}
          >
            {p("สูตรแคตตาล็อก")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!selected}
            onSelect={() => {
              if (!selected) return;
              setHint(buildHintLines(selected, model));
            }}
          >
            {p("ดูแมปฟิลด์จากตาราง")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!selected}
            onSelect={() => {
              if (!selected) return;
              const { page } = buildFormPageFromTable(selected, model, {
                path: `/${selected.name}/new`,
                name: `ฟอร์ม ${selected.label || selected.name}`,
                op: "insert",
                adminSource: `form:${selected.name}:new`,
              });
              pushPages([page]);
            }}
          >
            {p("สร้างหน้าบันทึกจากตาราง")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              const doc = useProjectsStore.getState().openDocument;
              if (!doc) return;
              const result = buildAdminPack(ensurePages(doc), model, { mode: "guideline" });
              setHint(result.guideline.map((g) => `${g.path} — ${g.name}`));
            }}
          >
            {p("แนวทางแพ็กหลังบ้าน")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              const doc = useProjectsStore.getState().openDocument;
              if (!doc) return;
              const result = buildAdminPack(syncOpenIntoPages(ensurePages(doc)), model, { mode: "auto" });
              if (result.pages.length === 0) {
                toast.message(p("ไม่มีหน้าใหม่ที่จะสร้าง"), {
                  description: result.skipped.length
                    ? `ข้ามแล้ว ${result.skipped.length} รายการ`
                    : undefined,
                });
                return;
              }
              pushPages(result.pages);
              if (result.skipped.length) {
                toast.message(`ข้ามหน้าที่แก้แล้ว ${result.skipped.length} รายการ`);
              }
            }}
          >
            {p("สร้างแพ็กหลังบ้านอัตโนมัติ")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {hint ? (
        <div className="max-h-40 w-full overflow-auto rounded border border-border bg-muted/40 p-2 text-xs whitespace-pre-wrap">
          <div className="mb-1 flex justify-between gap-2">
            <span className="font-medium">{p("สรุป")}</span>
            <button type="button" className="text-muted-foreground underline" onClick={() => setHint(null)}>
              {p("ปิด")}
            </button>
          </div>
          {hint.join("\n")}
        </div>
      ) : null}
    </div>
  );
}
