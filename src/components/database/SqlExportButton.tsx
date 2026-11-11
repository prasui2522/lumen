import { useRef } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { runSqlExport, useSqlExportStore } from "@/lib/db-export";
import { usePhrase } from "@/lib/phrases";

/**
 * `ส่งออก .sql` (§9, mode level). Never `disabled` while busy (that drops focus
 * to BODY): `aria-disabled` + ignore clicks. `data-sql-export` is the focus
 * fallback for the palette command.
 */
export function SqlExportButton() {
  const busy = useSqlExportStore((s) => s.busy);
  const p = usePhrase();
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <Button
      ref={ref}
      type="button"
      variant="outline"
      size="sm"
      className="h-7 text-xs aria-disabled:opacity-60"
      aria-disabled={busy || undefined}
      data-sql-export
      onClick={() => {
        // runSqlExport puts focus back here (or on the invalid table's problem).
        if (!useSqlExportStore.getState().busy) void runSqlExport();
      }}
    >
      {busy ? <Spinner className="size-3.5" aria-hidden /> : <Download aria-hidden />}
      {busy ? p("กำลังส่งออก…") : p("ส่งออก .sql")}
    </Button>
  );
}
