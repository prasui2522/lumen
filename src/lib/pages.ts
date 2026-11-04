import { createNode } from "@/lib/document-ops";
import type { Node, NodeId } from "@/schema";
import type { BuiltTemplate } from "@/lib/templates";

/**
 * Add-menu pages (PHASE-7-SPEC). Static trees of existing nodes.
 * Not a node kind, not a template, and not a document version change.
 * The page child is one container. No extra section. No form element.
 */
export const PAGES = [
  { id: "login", name: "Login" },
  { id: "signup", name: "Signup" },
] as const;

export type PageId = (typeof PAGES)[number]["id"];

export function isPageId(v: string): v is PageId {
  return PAGES.some((p) => p.id === v);
}

function heading(content: string): Node {
  const n = createNode("heading");
  return { ...n, props: { type: "heading", level: 2, content } };
}

function text(content: string): Node {
  const n = createNode("text");
  return { ...n, props: { type: "text", content } };
}

function input(label: string, placeholder?: string): Node {
  const n = createNode("input");
  return {
    ...n,
    props: {
      type: "input",
      label,
      placeholder: placeholder ?? "พิมพ์ที่นี่",
    },
  };
}

function switchNode(label: string): Node {
  const n = createNode("switch");
  return { ...n, props: { type: "switch", label, checked: false } };
}

function button(label: string): Node {
  const n = createNode("button");
  return { ...n, props: { type: "button", label } };
}

function link(label: string, href: string): Node {
  const n = createNode("link");
  return { ...n, props: { type: "link", label, href } };
}

function column(children: NodeId[]): Node {
  const n = createNode("container");
  return { ...n, props: { type: "container", children } };
}

function tree(root: Node, rest: Node[], focusId: NodeId): BuiltTemplate {
  return { nodes: [root, ...rest], sectionId: root.id, focusId };
}

export function buildPage(id: PageId): BuiltTemplate {
  if (id === "login") {
    const h = heading("Log in");
    const t = text("A short line");
    const email = input("Email", "you@example.com");
    const password = input("Password", "Password");
    const remember = switchNode("Remember me");
    const submit = button("Log in");
    const toSignup = link("Sign up", "/signup");
    const root = column([
      h.id,
      t.id,
      email.id,
      password.id,
      remember.id,
      submit.id,
      toSignup.id,
    ]);
    return tree(root, [h, t, email, password, remember, submit, toSignup], h.id);
  }
  const h = heading("Sign up");
  const t = text("A short line");
  const name = input("Name", "ชื่อ");
  const email = input("Email", "อีเมล");
  const password = input("Password", "พาสเวิร์ด");
  const agree = switchNode("I agree");
  const submit = button("Create account");
  const toLogin = link("Log in", "/login");
  const root = column([
    h.id,
    t.id,
    name.id,
    email.id,
    password.id,
    agree.id,
    submit.id,
    toLogin.id,
  ]);
  return tree(root, [h, t, name, email, password, agree, submit, toLogin], h.id);
}
