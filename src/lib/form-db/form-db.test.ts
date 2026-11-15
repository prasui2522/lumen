import { describe, expect, test } from "bun:test";
import { EMPTY_DB_MODEL } from "@/lib/db-model";
import {
  analyzeTableToFormFields,
  applyAdminPackPages,
  applyCatalogRecipe,
  applyUsersRecipe,
  buildAdminPack,
  buildFormPageFromTable,
  catalogTablesRecipe,
  filterRowsBySearch,
  findReverseForeignKeys,
  forwardLookups,
  planAdminPack,
  prepareSubmitValues,
  relatedChildRows,
  resolveCellLabel,
  stubHashPassword,
  usersTableRecipe,
} from "@/lib/form-db";
import { createStubAuthAdapter } from "@/lib/form-db/auth-adapter";
import { validatePagePath, ensurePages, makeProjectPage } from "@/lib/project-pages";
import type { PageDocument } from "@/schema";

describe("recipes", () => {
  test("users has secret password_hash", () => {
    const t = usersTableRecipe(() => crypto.randomUUID());
    expect(t.name).toBe("users");
    const hash = t.columns.find((c) => c.name === "password_hash");
    expect(hash?.secret).toBe("argon2id");
  });

  test("catalog has products.image asset + FKs", () => {
    const cat = catalogTablesRecipe(() => crypto.randomUUID());
    expect(cat.products.columns.find((c) => c.name === "image")?.type).toBe("asset");
    expect(cat.products.foreignKeys.length).toBe(3);
    let m = applyUsersRecipe(EMPTY_DB_MODEL);
    m = applyCatalogRecipe(m);
    expect(m.tables.map((t) => t.name).sort()).toEqual([
      "brands",
      "categories",
      "products",
      "units",
      "users",
    ]);
  });
});

describe("analyzer", () => {
  test("maps password, fk, asset, number", () => {
    const model = applyCatalogRecipe(applyUsersRecipe(EMPTY_DB_MODEL));
    const users = model.tables.find((t) => t.name === "users")!;
    const products = model.tables.find((t) => t.name === "products")!;
    const uFields = analyzeTableToFormFields(users, model);
    expect(uFields.find((f) => f.columnName === "password_hash")?.widget).toBe("password");
    expect(uFields.find((f) => f.columnName === "id")?.widget).toBe("skip");
    const pFields = analyzeTableToFormFields(products, model);
    expect(pFields.find((f) => f.columnName === "category_id")?.widget).toBe("select");
    expect(pFields.find((f) => f.columnName === "category_id")?.lookup).toBeTruthy();
    expect(pFields.find((f) => f.columnName === "image")?.widget).toBe("asset");
    expect(pFields.find((f) => f.columnName === "price")?.widget).toBe("number");
  });
});

describe("relationships", () => {
  test("forward lookups + resolve labels + search + reverse", () => {
    const model = applyCatalogRecipe(EMPTY_DB_MODEL);
    const products = model.tables.find((t) => t.name === "products")!;
    const categories = model.tables.find((t) => t.name === "categories")!;
    const lookups = forwardLookups(model, products);
    const catCol = products.columns.find((c) => c.name === "category_id")!;
    expect(lookups.get(catCol.id)?.tableId).toBe(categories.id);

    const catPk = categories.primaryKey[0]!;
    const catName = categories.columns.find((c) => c.name === "name")!.id;
    const refRows = new Map([
      [
        categories.id,
        [{ [catPk]: "c1", [catName]: "อิเล็กทรอนิกส์" }],
      ],
    ]);
    expect(resolveCellLabel(catCol.id, "c1", lookups, refRows)).toBe("อิเล็กทรอนิกส์");
    expect(resolveCellLabel(catCol.id, "missing", lookups, refRows)).toBe("missing");

    const sku = products.columns.find((c) => c.name === "sku")!.id;
    const rows = [
      { [sku]: "A1", [catCol.id]: "c1" },
      { [sku]: "B2", [catCol.id]: "c2" },
    ];
    const hit = filterRowsBySearch(rows, "อิเล็ก", [sku, catCol.id], lookups, refRows);
    expect(hit).toHaveLength(1);
    expect(hit[0]![sku]).toBe("A1");

    const reverse = findReverseForeignKeys(model, categories.id);
    expect(reverse.some((r) => r.childTable.name === "products")).toBe(true);
    const childCol = reverse.find((r) => r.childTable.name === "products")!.childColumnId;
    expect(relatedChildRows(rows, childCol, "c1")).toHaveLength(1);
  });
});

describe("form page + admin pack", () => {
  test("buildFormPageFromTable binds dbForm and dbSubmit", () => {
    const model = applyUsersRecipe(EMPTY_DB_MODEL);
    const users = model.tables[0]!;
    const { page, formContainerId } = buildFormPageFromTable(users, model, {
      path: "/signup",
      op: "insert",
      adminSource: "admin:signup",
    });
    const form = page.nodes[formContainerId]!;
    expect(form.db?.form?.tableId).toBe(users.id);
    expect(form.db?.adminSource).toBe("admin:signup");
    const submit = Object.values(page.nodes).find(
      (n) => n.props.type === "button" && n.props.action === "dbSubmit",
    );
    expect(submit).toBeTruthy();
  });

  test("admin pack auto creates list/new/edit with related panel; skip on second run", () => {
    const model = applyCatalogRecipe(applyUsersRecipe(EMPTY_DB_MODEL));
    const empty: PageDocument = {
      version: 1,
      meta: { title: "t" },
      root: "r",
      nodes: { r: { id: "r", type: "page", props: { type: "page", children: [] }, style: {} } },
    };
    const first = buildAdminPack(empty, model, { mode: "auto" });
    expect(first.guideline.length).toBeGreaterThan(5);
    expect(first.pages.some((p) => p.path === "/admin")).toBe(true);
    expect(first.pages.some((p) => p.path === "/admin/products/edit")).toBe(true);
    const edit = first.pages.find((p) => p.path === "/admin/products/edit")!;
    const hasRelated = Object.values(edit.nodes).some((n) => n.db?.related);
    // products is leaf — related on category edit instead
    const catEdit = first.pages.find((p) => p.path === "/admin/categories/edit")!;
    expect(Object.values(catEdit.nodes).some((n) => n.db?.related)).toBe(true);
    void hasRelated;

    const doc2 = applyAdminPackPages(empty, first.pages);
    const second = buildAdminPack(doc2, model, { mode: "auto" });
    expect(second.pages).toHaveLength(0);
    expect(second.skipped.length).toBeGreaterThan(0);

    const guide = buildAdminPack(empty, model, { mode: "guideline" });
    expect(guide.pages).toHaveLength(0);
    expect(planAdminPack(model, "all").some((g) => g.kind === "list")).toBe(true);
  });
});

describe("submit prepare + auth stub", () => {
  test("hashes secret columns", async () => {
    const users = usersTableRecipe(() => crypto.randomUUID());
    const hashCol = users.columns.find((c) => c.name === "password_hash")!;
    const userCol = users.columns.find((c) => c.name === "username")!;
    const auth = createStubAuthAdapter(stubHashPassword);
    const prepared = await prepareSubmitValues(
      users,
      [
        { nodeId: "a", columnId: userCol.id, raw: "alice" },
        { nodeId: "b", columnId: hashCol.id, raw: "secret", secret: "argon2id" },
      ],
      auth,
    );
    expect(prepared.values[userCol.id]).toBe("alice");
    expect(String(prepared.values[hashCol.id])).toMatch(/^\$wb\$v1\$stub\$/);
    expect(prepared.hashedColumns).toContain(hashCol.id);
  });
});

describe("nested admin paths", () => {
  test("validatePagePath allows /admin/products/new", () => {
    const pages = [makeProjectPage("home", "/")];
    expect(validatePagePath("/admin/products/new", pages)).toBeNull();
    expect(validatePagePath("/admin", pages)).toBeNull();
    expect(validatePagePath("/Bad", pages)).toBe("รูปแบบไม่ถูกต้อง");
  });

  test("ensurePages keeps nested paths when applied", () => {
    const doc: PageDocument = {
      version: 5,
      meta: { title: "t" },
      root: "r",
      nodes: { r: { id: "r", type: "page", props: { type: "page", children: [] }, style: {} } },
      pages: [
        { id: "h", name: "home", path: "/", root: "r", nodes: { r: { id: "r", type: "page", props: { type: "page", children: [] }, style: {} } } },
        {
          id: "a",
          name: "admin",
          path: "/admin/products/new",
          root: "r2",
          nodes: { r2: { id: "r2", type: "page", props: { type: "page", children: [] }, style: {} } },
        },
      ],
    };
    expect(ensurePages(doc).pages![1]!.path).toBe("/admin/products/new");
  });
});
