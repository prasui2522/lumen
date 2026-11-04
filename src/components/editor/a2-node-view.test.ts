import { describe, expect, test } from "bun:test";
import { join } from "node:path";

// The canvas views of scrollArea / badge, rendered with the real NodeView (see the header of
// a2-node-view.check.ts for why this runs in its own process).
describe("A2.3 part 2: canvas views (NodeView) in a child process", () => {
  test("every check passes", () => {
    const r = Bun.spawnSync([process.execPath, "run", join(import.meta.dir, "a2-node-view.check.ts")], { cwd: join(import.meta.dir, "..", "..", "..") });
    const out = r.stdout.toString() + r.stderr.toString();
    expect(out).toContain("ok   ");
    expect(out).not.toContain("FAIL");
    expect(r.exitCode).toBe(0);
  });
});
