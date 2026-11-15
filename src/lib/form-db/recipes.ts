/**
 * Table recipes: users (Register) + catalog (units/brands/categories/products).
 */
import type { DbColumn, DbForeignKey, DbModel, DbTable } from "@/lib/db-model";

const id = () => crypto.randomUUID();

function uuidPk(colId: string): DbColumn {
  return { id: colId, name: "id", type: "uuid", nullable: false, default: { kind: "uuid" } };
}

function createdAt(colId: string): DbColumn {
  return {
    id: colId,
    name: "created_at",
    type: "timestamptz",
    nullable: false,
    default: { kind: "now" },
  };
}

/** users: username + password_hash (Argon2id). */
export function usersTableRecipe(newId: () => string = id): DbTable {
  const pk = newId();
  const username = newId();
  const passwordHash = newId();
  return {
    id: newId(),
    name: "users",
    label: "ผู้ใช้",
    columns: [
      uuidPk(pk),
      { id: username, name: "username", type: "text", nullable: false },
      {
        id: passwordHash,
        name: "password_hash",
        type: "text",
        nullable: false,
        secret: "argon2id",
      },
      createdAt(newId()),
    ],
    primaryKey: [pk],
    uniques: [{ id: newId(), columns: [username] }],
    foreignKeys: [],
  };
}

export type CatalogTables = {
  units: DbTable;
  brands: DbTable;
  categories: DbTable;
  products: DbTable;
};

/** Catalog with FKs + products.image as asset. */
export function catalogTablesRecipe(newId: () => string = id): CatalogTables {
  const unitsPk = newId();
  const unitsCode = newId();
  const unitsName = newId();
  const units: DbTable = {
    id: newId(),
    name: "units",
    label: "หน่วย",
    columns: [
      uuidPk(unitsPk),
      { id: unitsCode, name: "code", type: "text", nullable: false },
      { id: unitsName, name: "name", type: "text", nullable: false },
      createdAt(newId()),
    ],
    primaryKey: [unitsPk],
    uniques: [{ id: newId(), columns: [unitsCode] }],
    foreignKeys: [],
  };

  const brandsPk = newId();
  const brandsName = newId();
  const brands: DbTable = {
    id: newId(),
    name: "brands",
    label: "แบรนด์",
    columns: [
      uuidPk(brandsPk),
      { id: brandsName, name: "name", type: "text", nullable: false },
      createdAt(newId()),
    ],
    primaryKey: [brandsPk],
    uniques: [{ id: newId(), columns: [brandsName] }],
    foreignKeys: [],
  };

  const catPk = newId();
  const catName = newId();
  const categories: DbTable = {
    id: newId(),
    name: "categories",
    label: "หมวดหมู่",
    columns: [
      uuidPk(catPk),
      { id: catName, name: "name", type: "text", nullable: false },
      createdAt(newId()),
    ],
    primaryKey: [catPk],
    uniques: [],
    foreignKeys: [],
  };

  const prodPk = newId();
  const sku = newId();
  const name = newId();
  const categoryId = newId();
  const brandId = newId();
  const unitId = newId();
  const price = newId();
  const image = newId();

  const fks: DbForeignKey[] = [
    {
      id: newId(),
      columns: [categoryId],
      refTableId: categories.id,
      refColumns: [catPk],
      onDelete: "no_action",
    },
    {
      id: newId(),
      columns: [brandId],
      refTableId: brands.id,
      refColumns: [brandsPk],
      onDelete: "no_action",
    },
    {
      id: newId(),
      columns: [unitId],
      refTableId: units.id,
      refColumns: [unitsPk],
      onDelete: "no_action",
    },
  ];

  const products: DbTable = {
    id: newId(),
    name: "products",
    label: "สินค้า",
    columns: [
      uuidPk(prodPk),
      { id: sku, name: "sku", type: "text", nullable: false },
      { id: name, name: "name", type: "text", nullable: false },
      { id: categoryId, name: "category_id", type: "uuid", nullable: true },
      { id: brandId, name: "brand_id", type: "uuid", nullable: true },
      { id: unitId, name: "unit_id", type: "uuid", nullable: true },
      { id: price, name: "price", type: "decimal", nullable: true, precision: 12, scale: 2 },
      { id: image, name: "image", type: "asset", nullable: true },
      createdAt(newId()),
    ],
    primaryKey: [prodPk],
    uniques: [{ id: newId(), columns: [sku] }],
    foreignKeys: fks,
  };

  return { units, brands, categories, products };
}

export function applyUsersRecipe(model: DbModel, newId: () => string = id): DbModel {
  if (model.tables.some((t) => t.name === "users")) return model;
  return { ...model, tables: [...model.tables, usersTableRecipe(newId)] };
}

export function applyCatalogRecipe(model: DbModel, newId: () => string = id): DbModel {
  const names = new Set(model.tables.map((t) => t.name));
  if (["units", "brands", "categories", "products"].every((n) => names.has(n))) return model;
  const cat = catalogTablesRecipe(newId);
  const add = [cat.units, cat.brands, cat.categories, cat.products].filter((t) => !names.has(t.name));
  return { ...model, tables: [...model.tables, ...add] };
}
