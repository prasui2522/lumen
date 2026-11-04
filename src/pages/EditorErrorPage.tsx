import { useEffect, useRef } from "react";
import { Link, useRouteError } from "react-router-dom";
import { Button } from "@/components/ui/button";

/** Short, single-line technical detail of whatever the route threw (never the stack). */
export function describeRouteError(e: unknown): string {
  if (e instanceof Error && e.message.trim()) return e.message.trim();
  if (typeof e === "string" && e.trim()) return e.trim();
  if (e && typeof e === "object") {
    const o = e as { statusText?: unknown; message?: unknown };
    if (typeof o.statusText === "string" && o.statusText.trim()) return o.statusText.trim();
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
  }
  return "ไม่ทราบสาเหตุ";
}

/**
 * Phase 11 A2.5 (N5): the editor route's `errorElement`, in Thai. A document the canvas cannot draw (an unknown aspect
 * ratio such as 9/16, a broken `a2` section of kind-looks.json) used to land on React Router's English "Unexpected
 * Application Error" page. A lazy chunk (the startup bundle does not grow); `App.tsx` mounts it.
 */
export function EditorErrorPage() {
  const error = useRouteError();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    console.error("editor route error", error);
    heading.current?.focus();
  }, [error]);
  return (
    <main role="alert" className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 px-6 py-10">
      <h1 ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">
        เปิดตัวแก้ไขไม่ได้
      </h1>
      <p className="text-sm text-muted-foreground">
        เกิดข้อผิดพลาดขณะแสดงหน้านี้ ข้อมูลของหน้าอาจมีค่าที่ไม่รองรับ เช่น อัตราส่วนที่ไม่รู้จัก
        การแก้ไขที่ยังไม่ได้บันทึกอาจหายไป
      </p>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">รายละเอียดทางเทคนิค</summary>
        <p className="mt-1 break-words font-mono">{describeRouteError(error)}</p>
      </details>
      <div className="flex gap-2">
        <Button asChild>
          <Link to="/">กลับไปรายการโปรเจกต์</Link>
        </Button>
        <Button type="button" variant="outline" onClick={() => window.location.reload()}>
          โหลดใหม่
        </Button>
      </div>
    </main>
  );
}
