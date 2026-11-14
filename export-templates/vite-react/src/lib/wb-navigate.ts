/**
 * A3: accept only same-site paths for `wb:navigate` (app → preview frame).
 * Keep in lockstep with `src/lib/wb-navigate.ts`.
 */
export function isSafeWbNavigatePath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("\\")
  );
}
