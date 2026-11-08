/**
 * B8.1 (§9.B): state switcher helpers — focusable kinds + lock message.
 */
import { describe, expect, test } from "bun:test";
import type { Node } from "@/schema";
import {
  CLEAR_THIS_STATE_LABEL,
  STATE_LOCKS_BREAKPOINT_MSG,
  STATE_PAINT_ONLY_HINT,
  STATE_SWITCH_OPTIONS,
  nodeOffersFocusState,
} from "@/lib/node-state-ui";
import { setNodeStateStyle } from "@/lib/document-ops";
import type { PageDocument } from "@/schema";

function node(partial: Partial<Node> & Pick<Node, "props">): Node {
  return {
    id: "n1",
    type: partial.props.type,
    style: {},
    ...partial,
  } as Node;
}

describe("B8.1 nodeOffersFocusState", () => {
  test("linked button / link / form controls yes; unlinked button / text no", () => {
    expect(
      nodeOffersFocusState(
        node({ props: { type: "button", label: "Go", href: "https://x.test", action: "link" } }),
      ),
    ).toBe(true);
    expect(
      nodeOffersFocusState(node({ props: { type: "button", label: "Go", action: "none" } })),
    ).toBe(false);
    expect(
      nodeOffersFocusState(
        node({ props: { type: "link", label: "L", href: "/", openInNewTab: false } }),
      ),
    ).toBe(true);
    expect(
      nodeOffersFocusState(
        node({ props: { type: "input", label: "", placeholder: "", suggestions: [] } }),
      ),
    ).toBe(true);
    expect(
      nodeOffersFocusState(node({ props: { type: "text", content: "hi" } })),
    ).toBe(false);
  });

  test("labels T61–T67 present", () => {
    expect(STATE_SWITCH_OPTIONS.map((o) => o.label)).toEqual([
      "ปกติ",
      "ชี้เมาส์",
      "กดค้าง",
      "โฟกัส",
    ]);
    expect(STATE_LOCKS_BREAKPOINT_MSG).toContain("ล็อกจุดพักที่เดสก์ท็อป");
    expect(STATE_PAINT_ONLY_HINT).toContain("สี");
    expect(CLEAR_THIS_STATE_LABEL).toBe("ล้างสถานะนี้");
  });
});

describe("B8.2 clear this state", () => {
  test("clearing the last key removes the state object (not empty {})", () => {
    let doc: PageDocument = {
      version: 2,
      meta: { title: "t" },
      root: "page",
      nodes: {
        page: {
          id: "page",
          type: "page",
          props: { type: "page", children: ["n1"] },
          style: {},
        },
        n1: {
          id: "n1",
          type: "button",
          props: { type: "button", label: "Go", action: "none" },
          style: {},
          states: { hover: { backgroundColor: "#38bdf8" } },
        },
      },
    };
    doc = setNodeStateStyle(doc, "n1", "hover", "backgroundColor", undefined)!;
    expect(doc.nodes["n1"]!.states).toBeUndefined();
  });
});
