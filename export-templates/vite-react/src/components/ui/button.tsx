import * as React from "react";
import { cn } from "@/lib/utils";

export function Button({
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-lg border border-transparent bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)] transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)] disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
