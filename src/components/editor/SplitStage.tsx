/**
 * S3 Split: canvas + Code (default) or Preview. Orientation and size persist
 * in app settings (A1/A3). CodeView stays the lazy `code-view` chunk.
 */
import { Suspense, type ReactNode } from "react";
import { Columns2, Rows2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Spinner } from "@/components/ui/spinner";
import { SplitDivider } from "@/components/editor/SplitDivider";
import { DesignCanvas } from "@/components/editor/DesignCanvas";
import { PreviewStage } from "@/components/editor/PreviewStage";
import { currentSplitSize, setSplitPane, toggleSplitDir, useSplitSettings } from "@/lib/split-settings";
import { lazyNamed } from "@/lib/lazy";

const CodeView = lazyNamed(() =>
  import("@/components/editor/code-view").then((m) => m.CodeView),
);

type Props = {
  documentReady: boolean;
};

function PaneFallback({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"
    >
      <Spinner className="size-4" aria-hidden />
      {label}
    </div>
  );
}

function RightPane({ documentReady }: { documentReady: boolean }) {
  const { pane } = useSplitSettings();
  if (!documentReady) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        กำลังเปิดโปรเจกต์…
      </div>
    );
  }
  if (pane === "preview") return <PreviewStage />;
  return (
    <Suspense fallback={<PaneFallback label="กำลังโหลดโค้ด…" />}>
      <CodeView />
    </Suspense>
  );
}

export function SplitStage({ documentReady }: Props) {
  const settings = useSplitSettings();
  const size = currentSplitSize(settings);
  const lr = settings.dir === "lr";

  const canvas: ReactNode = (
    <main
      data-kbd-pane="canvas"
      tabIndex={-1}
      className="relative flex h-full min-h-0 min-w-0 flex-col bg-muted/40"
    >
      {documentReady ? (
        <DesignCanvas />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          กำลังเปิดโปรเจกต์…
        </div>
      )}
    </main>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2">
        <ToggleGroup
          type="single"
          size="sm"
          spacing={0}
          value={settings.pane}
          onValueChange={(v) => v && setSplitPane(v as "code" | "preview")}
          aria-label="แผงขวาของโหมดแยก"
          className="gap-0.5 rounded-md bg-muted p-0.5"
        >
          <ToggleGroupItem value="code" className="h-6 px-2 text-xs">
            โค้ด
          </ToggleGroupItem>
          <ToggleGroupItem value="preview" className="h-6 px-2 text-xs">
            ตัวอย่าง
          </ToggleGroupItem>
        </ToggleGroup>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => toggleSplitDir()}
          aria-label="สลับแนวแบ่ง (Toggle split orientation)"
        >
          {lr ? <Rows2 className="size-3.5" aria-hidden /> : <Columns2 className="size-3.5" aria-hidden />}
          สลับแนวแบ่ง
        </Button>
      </div>
      <div
        className={lr ? "flex min-h-0 min-w-0 flex-1" : "flex min-h-0 min-w-0 flex-1 flex-col"}
      >
        <div
          data-split-first
          className="min-h-0 min-w-0 overflow-hidden"
          style={lr ? { width: `${size}%` } : { height: `${size}%` }}
        >
          {canvas}
        </div>
        <SplitDivider />
        <div
          data-kbd-pane="code"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <RightPane documentReady={documentReady} />
        </div>
      </div>
    </div>
  );
}
