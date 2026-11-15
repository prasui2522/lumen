import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { EMPTY_DB_MODEL } from "@/lib/db-model";
import {
  applyCatalogRecipe,
  applyUsersRecipe,
  buildAdminPack,
  filterRowsBySearch,
  forwardLookups,
  listColumnDefs,
  rowsPageToMaps,
} from "@/lib/form-db";
import type { RowsPage } from "@/lib/db-testdata";

const ROOT = join(import.meta.dir, "../../..");

describe("Phase A runtime wiring", () => {
  test("render-node imports db widgets", () => {
    const src = readFileSync(join(ROOT, "export-templates/vite-react/src/lib/render-node.tsx"), "utf8");
    expect(src).toContain("DbListPanel");
    expect(src).toContain("DbLookupSelect");
    expect(src).toContain("DbRelatedPanel");
    expect(src).toContain("DbAssetField");
  });

  test("preview-runtime accepts dbResult and allows db widget clicks", () => {
    const src = readFileSync(join(ROOT, "export-templates/vite-react/src/preview-runtime.tsx"), "utf8");
    expect(src).toContain("acceptDbResult");
    expect(src).toContain("wb:dbResult");
    expect(src).toContain("data-wb-db-list");
  });

  test("export.rs ships wb-db client + widgets + supabase", () => {
    const src = readFileSync(join(ROOT, "src-tauri/src/export.rs"), "utf8");
    expect(src).toContain("wb-db-client.ts");
    expect(src).toContain("wb-db-widgets.tsx");
    expect(src).toContain("wb-db-supabase.ts");
    expect(src).toContain(".env.example");
  });

  test("DeviceStage wires dbQuery + ensureTestDbOpen", () => {
    const src = readFileSync(join(ROOT, "src/components/editor/preview/DeviceStage.tsx"), "utf8");
    expect(src).toContain("onDbQuery");
    expect(src).toContain("ensureTestDbOpen");
    expect(src).toContain("handleDbQuery");
  });
});

describe("Phase A list helpers", () => {
  test("rowsPageToMaps + FK search end-to-end", () => {
    const model = applyCatalogRecipe(applyUsersRecipe(EMPTY_DB_MODEL));
    const products = model.tables.find((t) => t.name === "products")!;
    const categories = model.tables.find((t) => t.name === "categories")!;
    const catCol = products.columns.find((c) => c.name === "category_id")!;
    const sku = products.columns.find((c) => c.name === "sku")!;
    const catPk = categories.primaryKey[0]!;
    const catName = categories.columns.find((c) => c.name === "name")!.id;

    const page: RowsPage = {
      columns: [sku.id, catCol.id],
      total: 2,
      rows: [
        { rowid: 1, values: ["A1", "c1"] },
        { rowid: 2, values: ["B2", "c2"] },
      ],
    };
    const mapped = rowsPageToMaps(page);
    expect(mapped[0]!.values[sku.id]).toBe("A1");

    const lookups = forwardLookups(model, products);
    const refRows = new Map([[categories.id, [{ [catPk]: "c1", [catName]: "Gadgets" }]]]);
    const hit = filterRowsBySearch(
      mapped.map((r) => r.values),
      "gadget",
      [sku.id, catCol.id],
      lookups,
      refRows,
    );
    expect(hit).toHaveLength(1);
    expect(listColumnDefs(products).some((c) => c.name === "sku")).toBe(true);
  });

  test("admin list page has single list-body binding", () => {
    const model = applyCatalogRecipe(EMPTY_DB_MODEL);
    const empty = {
      version: 1 as const,
      meta: { title: "t" },
      root: "r",
      nodes: { r: { id: "r", type: "page" as const, props: { type: "page" as const, children: [] }, style: {} } },
    };
    const pack = buildAdminPack(empty, model, { mode: "auto" });
    const list = pack.pages.find((p) => p.path === "/admin/products")!;
    const listBindings = Object.values(list.nodes).filter((n) => n.db?.list);
    expect(listBindings.length).toBe(1);
    expect(listBindings[0]!.db!.list!.resolveFks).toBe(true);
    expect(listBindings[0]!.db!.list!.search).toBe(true);
  });

  test("admin category edit has related panel binding", () => {
    const model = applyCatalogRecipe(EMPTY_DB_MODEL);
    const empty = {
      version: 1 as const,
      meta: { title: "t" },
      root: "r",
      nodes: { r: { id: "r", type: "page" as const, props: { type: "page" as const, children: [] }, style: {} } },
    };
    const pack = buildAdminPack(empty, model, { mode: "auto" });
    const edit = pack.pages.find((p) => p.path === "/admin/categories/edit")!;
    expect(Object.values(edit.nodes).some((n) => n.db?.related)).toBe(true);
  });
});
