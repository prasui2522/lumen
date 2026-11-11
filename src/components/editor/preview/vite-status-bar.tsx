/**
 * S6 A4 / S9: Vite sidecar status bar + crash/install banner (lazy chunk `vite-status-bar`).
 * PSS is polled only while starting/running — no timer when stopped.
 */
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectsStore } from "@/stores/projects-store";
import {
  PHASE_LABEL,
  SIDECAR_PSS_POLL_MS,
  markHmrWritten,
  parseStartError,
  publishSidecar,
  shouldPollPss,
  sidecarOpenLog,
  sidecarStart,
  sidecarStatus,
  sidecarStop,
  useSidecarStatus,
} from "@/lib/preview-sidecar";
import { phraseIpcError } from "@/lib/ipc-error-i18n";
import { useLocale } from "@/lib/locale";
import { usePhrase } from "@/lib/phrases";

export function ViteStatusBar() {
  const st = useSidecarStatus();
  const announce = useEditorStore((s) => s.announce);
  const p = usePhrase();
  const locale = useLocale();
  const lastPhase = useRef(st.state);

  useEffect(() => {
    if (!shouldPollPss(st.state)) return;
    const id = window.setInterval(() => {
      void sidecarStatus().then(publishSidecar);
    }, SIDECAR_PSS_POLL_MS);
    return () => window.clearInterval(id);
  }, [st.state]);

  useEffect(() => {
    if (lastPhase.current === st.state) return;
    lastPhase.current = st.state;
    // S9: crash/install uses role=alert on the banner — announce other states only.
    if (st.state === "error") return;
    announce(p(PHASE_LABEL[st.state]));
  }, [st.state, announce, p]);

  const stop = () => {
    void sidecarStop().then(() =>
      sidecarStatus().then((s) => {
        publishSidecar(s);
      }),
    );
  };

  const pss =
    typeof st.pssMb === "number" && Number.isFinite(st.pssMb)
      ? `${st.pssMb.toFixed(1)} MB`
      : null;

  return (
    <div
      className="flex h-7 shrink-0 items-center gap-2 border-t border-border bg-muted/40 px-2 text-[11px] text-muted-foreground"
      data-vite-status-bar
    >
      <span aria-live="polite" aria-atomic="true">
        {p(PHASE_LABEL[st.state])}
      </span>
      <span aria-live="off">{pss}</span>
      {st.state === "error" && st.error ? (
        <span className="truncate text-destructive">{phraseIpcError(locale, st.error)}</span>
      ) : null}
      {st.state === "running" || st.state === "starting" ? (
        <Button type="button" size="xs" variant="ghost" onClick={stop}>
          {p("หยุด")}
        </Button>
      ) : null}
    </div>
  );
}

/** S7/S9 Thai banner: install errors and vite crash. */
export function ViteErrorBanner() {
  const st = useSidecarStatus();
  const p = usePhrase();
  const locale = useLocale();
  if (st.state !== "error") return null;
  const code = st.errorCode;
  const crash = !code || code === "PREVIEW_CRASH";
  const retry = crash ? p("เริ่มใหม่") : p("ลองอีกครั้ง");
  const showLog = code === "PREVIEW_INSTALL_FAILED";
  const showRetry = code !== "PREVIEW_DISK_FULL";

  const onRetry = async () => {
    const { openId, openDocument } = useProjectsStore.getState();
    if (!openId || !openDocument) return;
    try {
      publishSidecar(await sidecarStart(openId, openDocument));
      markHmrWritten();
    } catch (e) {
      publishSidecar(parseStartError(e));
    }
  };

  return (
    <div
      role="alert"
      className="flex shrink-0 items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <span className="min-w-0 truncate">
        {st.error ? phraseIpcError(locale, st.error) : p("ตัวอย่างหยุดทำงาน")}
      </span>
      <span className="flex shrink-0 gap-1">
        {showLog ? (
          <Button type="button" size="xs" variant="ghost" onClick={() => void sidecarOpenLog()}>
            {p("ดูบันทึก")}
          </Button>
        ) : null}
        {showRetry ? (
          <Button type="button" size="xs" variant="outline" onClick={() => void onRetry()}>
            {retry}
          </Button>
        ) : null}
      </span>
    </div>
  );
}
