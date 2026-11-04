import { toast as sonner } from "sonner";

/**
 * App toasts (UI-REFRESH S7). Same three calls as before; durations live here
 * so every caller matches: success/info 4 s, error 7 s. The Toaster
 * (bottom-right, 3 visible, close button "ปิดการแจ้งเตือน") is mounted once
 * in App. Manual save success does NOT toast — the save button is the feedback.
 */
const OK_MS = 4000;
const ERROR_MS = 7000;

export const toast = {
  success(message: string) {
    sonner.success(message, { duration: OK_MS });
  },
  info(message: string) {
    sonner.info(message, { duration: OK_MS });
  },
  error(message: string) {
    sonner.error(message, { duration: ERROR_MS });
  },
};
