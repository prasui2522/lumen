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
import { toastIpcError } from "@/lib/ipc-error-i18n";
import { phrase, usePhrase } from "@/lib/phrases";
import { peekLocale } from "@/lib/locale";

export function ViteRunButton() {
  const st = useSidecarStatus();
  const announce = useEditorStore((s) => s.announce);
  const p = usePhrase();
  const running = st.state === "running" || st.state === "starting";

  const onClick = async () => {
    const { openId, openDocument } = useProjectsStore.getState();
    if (!openId || !openDocument) return;
    try {
      publishSidecar(await sidecarStart(openId, openDocument));
      markHmrWritten();
    } catch (e) {
      const st = parseStartError(e);
      announce(st.error ? toastIpcError(st.error) : phrase(peekLocale(), "สร้างตัวอย่างไม่ได้"));
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
      aria-label={p("รันด้วย Vite")}
    >
      {running ? p("กำลังรันด้วย Vite") : p("รันด้วย Vite")}
    </Button>
  );
}
