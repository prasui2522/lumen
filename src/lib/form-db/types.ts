/**
 * Form ↔ DB binding types — NodeDb / InputKind live in schema.ts (Rust mirror).
 * AuthAdapter + analyzer field shapes stay here.
 */
export type {
  NodeDb,
  NodeDbFormOp as DbFormOp,
  InputKind,
} from "@/schema";

export type { NodeDb as NodeDbBinding } from "@/schema";

import type { NodeDb } from "@/schema";

export type DbFormBinding = NonNullable<NodeDb["form"]>;
export type DbLookupBinding = NonNullable<NodeDb["lookup"]>;
export type DbListBinding = NonNullable<NodeDb["list"]>;
export type DbRelatedBinding = NonNullable<NodeDb["related"]>;

export type AuthSession = { identity: string };

/**
 * Pluggable auth — Preview stub today; Supabase/JWT later.
 * Generated admin pages call this adapter only (no vendor in nodes).
 */
export type AuthAdapter = {
  hashPassword(plain: string): Promise<string>;
  verifyPassword(plain: string, hash: string): Promise<boolean>;
  signIn(identity: string, password: string): Promise<{ ok: boolean; error?: string }>;
  signOut(): Promise<void>;
  session(): AuthSession | null;
  requireSession(): boolean;
};

export type FormFieldWidget =
  | "skip"
  | "input"
  | "textarea"
  | "select"
  | "switch"
  | "checkbox"
  | "password"
  | "number"
  | "date"
  | "datetime"
  | "asset"
  | "hint";

export type AnalyzedFormField = {
  columnId: string;
  columnName: string;
  label: string;
  widget: FormFieldWidget;
  inputKind?: import("@/schema").InputKind;
  lookup?: DbLookupBinding;
  reason?: string;
};
