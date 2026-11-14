import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectsStore } from "@/stores/projects-store";
import {
  markHmrWritten,
  parseStartError,
  publishSidecar,
  sidecarStart,
  sidecarStatus,
  sidecarStop,
  useSidecarStatus,
} from "@/lib/preview-sidecar";
import { toastIpcError } from "@/lib/ipc-error-i18n";
import { phrase, usePhrase } from "@/lib/phrases";
import { peekLocale } from "@/lib/locale";

/** PREVIEW-CODE-VIEW §2.1: รันด้วย Vite, and while running show กำลังรันด้วย Vite + [หยุด]. */
export function ViteRunButton() {
  const st = useSidecarStatus();
  const announce = useEditorStore((s) => s.announce);
  const p = usePhrase();
  const running = st.state === "running" || st.state === "starting";

  const onStart = async () => {
    const { openId, openDocument } = useProjectsStore.getState();
    if (!openId || !openDocument) return;
    try {
      publishSidecar(await sidecarStart(openId, openDocument));
      markHmrWritten();
    } catch (e) {
      const next = parseStartError(e);
      announce(next.error ? toastIpcError(next.error) : phrase(peekLocale(), "สร้างตัวอย่างไม่ได้"));
      publishSidecar(next);
    }
  };

  const onStop = () => {
    void sidecarStop().then(() => sidecarStatus().then(publishSidecar));
  };

  return (
    <span className="inline-flex items-center gap-1">
      <Button
        type="button"
        size="xs"
        variant={running ? "secondary" : "outline"}
        disabled={running}
        onClick={() => void onStart()}
        aria-label={p("รันด้วย Vite")}
      >
        {running ? p("กำลังรันด้วย Vite") : p("รันด้วย Vite")}
      </Button>
      {running ? (
        <Button type="button" size="xs" variant="ghost" onClick={onStop} aria-label={p("หยุด")}>
          {p("หยุด")}
        </Button>
      ) : null}
    </span>
  );
}
