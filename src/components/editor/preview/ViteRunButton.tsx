import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectsStore } from "@/stores/projects-store";
import {
  markHmrWritten,
  parseStartError,
  publishSidecar,
  sidecarStart,
  useSidecarStatus,
} from "@/lib/preview-sidecar";

export function ViteRunButton() {
  const st = useSidecarStatus();
  const announce = useEditorStore((s) => s.announce);
  const running = st.state === "running" || st.state === "starting";

  const onClick = async () => {
    const { openId, openDocument } = useProjectsStore.getState();
    if (!openId || !openDocument) return;
    try {
      publishSidecar(await sidecarStart(openId, openDocument));
      markHmrWritten();
    } catch (e) {
      const st = parseStartError(e);
      announce(st.error ?? "เริ่มเครื่องมือแสดงตัวอย่างไม่สำเร็จ");
      publishSidecar(st);
    }
  };

  return (
    <Button
      type="button"
      size="xs"
      variant={running ? "secondary" : "outline"}
      disabled={running}
      onClick={() => void onClick()}
      aria-label="รันด้วย Vite (Run with Vite)"
    >
      {running ? "กำลังรันด้วย Vite" : "รันด้วย Vite"}
    </Button>
  );
}
