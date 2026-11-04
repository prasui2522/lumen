import { describe, expect, test } from "bun:test";
import { cancelOptionCommitKey, isOptionCommitKey, type CommitKeyEvent } from "./select-keys";

const OPTION = { role: "option" };
const isOption = (t: unknown) => t === OPTION;
function ev(key: string, extra: Partial<CommitKeyEvent> = {}): CommitKeyEvent {
  const e = {
    key,
    defaultPrevented: false,
    target: OPTION as unknown,
    preventDefault() {
      e.defaultPrevented = true;
    },
    ...extra,
  };
  return e;
}

/**
 * Model of one Enter press on an open list, in browser order:
 * keydown on the option → option commits, list closes, handoff focuses the
 * trigger (same tick) → list keydown handler (bubble) → if the keydown was
 * not cancelled, keypress activation clicks whatever is focused now.
 */
function pressEnterOnOption(withGuard: boolean) {
  const log: string[] = [];
  let value = "px";
  let open = true;
  let focus = "option:%";
  const e = ev("Enter");
  // option keydown (Radix): commit + close
  value = "%";
  open = false;
  // SelectFocusReturn layout cleanup: focus the trigger, same tick
  focus = "trigger";
  log.push(`focus:${focus}`);
  // bubble to the list
  if (withGuard) cancelOptionCommitKey(e, isOption);
  // default action: Enter activation clicks the focused button (detail 0)
  if (!e.defaultPrevented && focus === "trigger") {
    open = true; // Radix trigger onClick (pointerType not mouse) reopens
    focus = "option:%";
    log.push("reopen");
  }
  return { value, open, focus, log, bodyGap: log.some((x) => x === "focus:body") };
}

describe("ui/select Enter on an option", () => {
  test("regression: without the guard the list reopens (the step 8 bug)", () => {
    expect(pressEnterOnOption(false).open).toBe(true);
  });
  test("Enter commits, the list stays closed, focus is on the trigger, no body gap", () => {
    const r = pressEnterOnOption(true);
    expect(r.value).toBe("%");
    expect(r.open).toBe(false);
    expect(r.focus).toBe("trigger");
    expect(r.bodyGap).toBe(false);
    expect(r.log).toEqual(["focus:trigger"]);
  });
  test("only Enter on an enabled option is cancelled", () => {
    expect(isOptionCommitKey(ev("Enter"), isOption)).toBe(true);
    expect(isOptionCommitKey(ev(" "), isOption)).toBe(false); // Radix already cancels Space
    expect(isOptionCommitKey(ev("ArrowDown"), isOption)).toBe(false);
    expect(isOptionCommitKey(ev("Escape"), isOption)).toBe(false);
    expect(isOptionCommitKey(ev("Enter", { target: { role: "listbox" } }), isOption)).toBe(false);
    expect(isOptionCommitKey(ev("Enter", { ctrlKey: true }), isOption)).toBe(false);
    expect(isOptionCommitKey(ev("Enter", { isComposing: true }), isOption)).toBe(false);
    expect(isOptionCommitKey(ev("Enter", { defaultPrevented: true }), isOption)).toBe(false);
  });
  test("the DOM check is safe without a DOM", () => {
    const e = ev("Enter");
    cancelOptionCommitKey(e); // default isSelectOption: no Element in bun → false
    expect(e.defaultPrevented).toBe(false);
  });
});
