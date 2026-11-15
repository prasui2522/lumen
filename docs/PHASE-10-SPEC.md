# Phase 10 — Database designer v1

**Status:** Spec. DEV does not start until the user reviews it. Based on `docs/PHASE-10-DB-NOTE.md` (md5 c47f688b…). Priorities: stability, low RAM, and **no DB code at startup**.

Checked on 2026-10-11 against `lib.rs` (`app_data_dir()` → `web_builder.db`, `DbState { conn, assets_dir }`), `db.rs` (`open_db` pragmas, `migrate`, `delete_project`), `commands.rs` (`save_project`, `export_project`), `Cargo.toml` (rusqlite 0.32 `bundled` → SQLite 3.46.0; `uuid` v4), `editor-store.ts` (`mode`, `past`/`future`, `announce`), `history.ts`, `projects-store.ts` (`saveOpenProject`, `dirty`), `export-project.ts` (`save` dialog, `exportFileName`), `lazy.ts` (`lazyNamed`, `whenIdle`), `ModeSwitch.tsx`, `TextPropField`, `NumberField`, and `components/ui` (`select`, `dialog`, `alert-dialog`, `switch`, `toggle-group`, `popover`, `dropdown-menu`; there is no `table` or `tabs`).

## 1. Scope

v1: a `ฐานข้อมูล` mode with a list-based editor for tables, columns, primary key, unique, foreign keys and defaults; a test-data grid backed by a per-project SQLite file; and a PostgreSQL 17 `.sql` export.

PM defaults baked in:
- Schema change keeps test rows in compatible columns; losses need a confirm (§7).
- No seed INSERTs.
- No case-insensitive unique.
- RLS enabled per table in the export.
- FK `ON DELETE` defaults to `NO ACTION`.
- `.sql` is exported separately from the zip.

**Out of scope:** deployment, Supabase connection, auth, policy authoring, form submit, data binding to pages, views/functions/triggers, indexes beyond unique, custom CHECK expressions, case-insensitive unique, seed export, diagram canvas, PG 17 sidecar, `.sql` import.

## 2. Model (source of truth)

Stored as JSON in a new app-DB table added in `migrate`:

```sql
CREATE TABLE IF NOT EXISTS db_models (
  project_id TEXT PRIMARY KEY NOT NULL,
  model_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

`document_json` and the document version rule (v1–5) are untouched. Opening a project reads nothing from `db_models` until the mode opens.

```ts
type DbModel = { version: 1; tables: DbTable[] };
type DbTable = {
  id: string; name: string; label?: string;          // label: Thai display, export `comment on`
  columns: DbColumn[];                               // order = display/DDL order
  primaryKey: string[];                              // column ids, ≥1 required
  uniques: { id: string; columns: string[] }[];
  foreignKeys: DbForeignKey[];
};
type DbType = "text" | "integer" | "decimal" | "boolean" | "date"
            | "timestamptz" | "uuid" | "json" | "enum" | "identity";
type DbColumn = {
  id: string; name: string; label?: string; type: DbType;
  nullable: boolean;
  default?: { kind: "literal"; value: string | boolean } | { kind: "now" | "today" | "uuid" };
  precision?: number; scale?: number;                 // decimal only: 1–38, 0–precision; new = 12, 2
  values?: string[];                                  // enum only: 1–50 distinct, each 1–63 chars
};
type DbForeignKey = {
  id: string; columns: string[]; refTableId: string; refColumns: string[];
  onDelete: "no_action" | "cascade" | "set_null" | "restrict";   // default "no_action"
};
```

Ids are `crypto.randomUUID()` and never change; renames keep the id, which is what §7 matches on. Integer literals travel as strings (i64 exceeds JS safe integers).

**Identifiers** (tables and columns):
- `^[a-z][a-z0-9_]{0,62}$` (ASCII, so ≤ 63 bytes).
- Not in `PG_RESERVED`: PostgreSQL 17 Appendix C words marked reserved, a const list in Rust with a TS mirror.
- Not one of `rowid oid _rowid_ tableoid xmin xmax cmin cmax ctid`.
- No `pg_` or `sqlite_` prefix.
- Tables unique per model; columns unique per table.
- Uppercase input is lowercased and spaces become `_` before the check. Thai goes in `label` only.

**Validation** (Rust authoritative, TS mirror for inline errors):
- 1–50 tables; 1–100 columns per table.
- PK columns are non-nullable. `identity` is allowed only as the sole PK column, with no default.
- Default must match the type:
  - `literal`: integer parses as i64; decimal fits p/s; boolean; date `YYYY-MM-DD` valid; text ≤ 1000 chars; enum ∈ `values`.
  - `now` → timestamptz; `today` → date; `uuid` → uuid.
  - No default for json or identity.
- Unique: ≥1 column, no duplicate set, not equal to the PK set.
- FK:
  - Equal column counts; pairwise types equal (identity ↔ integer counts as equal).
  - `refColumns` equal the ref table's PK or one of its uniques. Self-reference allowed.
  - `set_null` requires every FK column nullable.
  - Deleting a referenced table or column deletes the FKs that use it (same undo step).

The model may be **saved while invalid** (a draft never loses work). Validity is required only for `.sql` export and for applying it to the test file.

## 3. Type mapping (carried over from the note)

| UI | SQLite (`STRICT`) | PostgreSQL 17 |
|---|---|---|
| `ข้อความ` text | `TEXT` | `text` |
| `จำนวนเต็ม` integer | `INTEGER` | `bigint` |
| `ทศนิยม` decimal(p,s) | `TEXT` + `GLOB` check; Rust validates p/s | `numeric(p,s)` |
| `จริง/เท็จ` boolean | `INTEGER CHECK (c IN (0,1))` | `boolean` |
| `วันที่` date | `TEXT CHECK (date(c) = c)` | `date` |
| `วันเวลา` timestamptz | `TEXT CHECK (c IS NULL OR julianday(c) IS NOT NULL)`, ISO-8601 UTC `Z` | `timestamptz` |
| `รหัส` uuid | `TEXT CHECK (length(c) = 36)`, filled by Rust `Uuid::new_v4()` | `uuid` |
| `JSON` json | `TEXT CHECK (json_valid(c))` | `jsonb` |
| `ตัวเลือก` enum | `TEXT CHECK (c IN (…))` | `text CHECK (c IN (…))` |
| `ลำดับอัตโนมัติ` identity | `INTEGER PRIMARY KEY` | `bigint GENERATED BY DEFAULT AS IDENTITY` |

The date-time check says `c IS NULL OR …` because `julianday(NULL) IS NOT NULL` is false, not NULL, which would refuse NULL in a nullable date-time column.

Defaults:
- `now`: `(strftime('%Y-%m-%dT%H:%M:%fZ','now'))` ↔ `now()`.
- `today`: `(date('now'))` ↔ `current_date`.
- `uuid`: no SQLite default (Rust fills it) ↔ `gen_random_uuid()`.
- Boolean literal: `0`/`1` ↔ `false`/`true`.

SQLite FKs are inline in `CREATE TABLE`. No collations.

## 4. Rust

New module `dbmodel.rs` (model structs, validation, both DDL generators) and `testdb.rs` (test file). Errors are Thai `String`s, as the existing commands return.

**State:** `TestDbState { inner: Mutex<Option<TestDb>> }` with `TestDb { project_id, conn }`, managed next to `DbState`. It is `None` at startup and never opened then.
- Test file: `app_data_dir/databases/<project-id>.sqlite`.
- Pragmas per open: `foreign_keys=ON`, `journal_mode=DELETE`, `synchronous=FULL`, `quick_check`.
- The applied model is stored inside it in `wb_meta(key TEXT PRIMARY KEY, value TEXT) STRICT`, which can never collide with a valid name.

| Command | Args | Returns | Errors (examples) |
|---|---|---|---|
| `db_model_load` | `project_id` | model JSON or `null` | `อ่านโครงสร้างไม่ได้` |
| `save_project` (extended) | + `db_model: Option<Value>` | — | model JSON not parseable → `โครงสร้างฐานข้อมูลไม่ถูกต้อง`. Written in **one transaction** with the project row |
| `db_test_open` | `project_id, model` | `{ status: "ready" \| "stale" \| "invalid_model" \| "corrupt", tables: [{ tableId, rowCount }] }` | cannot create dir/file → `เปิดข้อมูลทดสอบไม่ได้` |
| `db_test_close` | — | — | none (idempotent) |
| `db_test_rows` | `table_id, offset, limit (≤100)` | `{ columns, rows: [{ rowid, values }], total }` | `ยังไม่ได้เปิดข้อมูลทดสอบ` |
| `db_test_insert` | `table_id, values` | `{ rowid }` | `ต้องมีค่า: <col>`, `ค่าซ้ำ: <col>`, `ไม่พบแถวที่อ้างอิง: <col>`, `รูปแบบไม่ถูกต้อง: <col>` |
| `db_test_update` | `table_id, rowid, column_id, value` | `{ value }`: the stored, normalized value of the updated cell | same as insert |
| `db_test_delete` | `table_id, rowids` | `{ deleted }` | `ลบไม่ได้ มีแถวอื่นอ้างอิงอยู่` |
| `db_test_plan` | `model` | `{ token, lossless, tables: [{ tableId, name, rowsLost, valuesLost, dropped }] }` | invalid model |
| `db_test_apply` | `token` | `{ tables }` | `แผนหมดอายุ` (token mismatch) |
| `db_test_discard` | `token` | — | none |
| `db_test_reset` | `model` | `{ tables }` | invalid model |
| `db_sql_export` | `model, dest_path` | written path | invalid model → first error; no path → `ไม่ได้เลือกตำแหน่งบันทึก` |

- `db_test_open` closes any previously open file first. `stale` means `wb_meta.model` ≠ the passed model.
- If `quick_check` fails, the result is `corrupt` and the connection stays closed.
- On first open per app run, files under `databases/` with no `projects` row are deleted (a lazy sweep, not at startup).
- `delete_project` also deletes the `db_models` row in the same transaction, then best-effort removes the test file and its `-journal`.
- Values on the wire: text, decimal, integer, date, timestamp, uuid, json and enum as strings; boolean as `bool`; `null`.

## 5. UI

**Mode:** `EditorMode` gains `"database"`. `ModeSwitch` gets a third item `ฐานข้อมูล`, after `ตัวอย่าง`. `EditorPage` renders `DatabaseMode = lazyNamed(() => import("@/components/database/DatabaseMode")…)` inside `Suspense` (fallback: spinner + `กำลังโหลดฐานข้อมูล…`). **No `whenIdle` preload** for this chunk. All DB UI and the model store (`src/components/database/`, `src/lib/db-*`) are imported only from that chunk.

**Layout** (fixed panes; no `EditorPanes`):
- **Left (240 px):** `ตาราง` list. Each row shows name (and label), plus a `…` menu (`เปลี่ยนชื่อ`, `เลื่อนขึ้น`, `เลื่อนลง`, `ลบตาราง`). The `+` button is `เพิ่มตาราง`. Arrow keys move between rows; Enter opens.
- **Main:** a header with the table name (`TextPropField`), label, and a segmented `ToggleGroup`: `โครงสร้าง` / `ข้อมูลทดสอบ`. A `ส่งออก .sql` button sits at the top right.
- **โครงสร้าง:**
  - Column rows in a plain `<table>` with inputs. Cells: name (`TextPropField`), type (`Select`), `ต้องมีค่า` (`Switch`), `คีย์หลัก` (checkbox-style `Switch`), default (control by type), and a `…` menu (`เลื่อนขึ้น`, `เลื่อนลง`, `ลบคอลัมน์`). `เพิ่มคอลัมน์` sits below.
  - Decimal p/s (`NumberField`) and enum values open in a `Popover` from the type cell.
  - Below the columns: `ไม่ซ้ำ` (list + `เพิ่ม`, with a column multi-pick in a `Popover`) and `ความสัมพันธ์` (FK list; add/edit in a `Dialog` with fields in this order: `ตารางปลายทาง` → `คอลัมน์ปลายทาง` → `คอลัมน์ (คู่กับ …)` → `เมื่อลบแถวปลายทาง`). Choosing the target first lets the local column list filter to matching types. Dialog messages: `ตารางนี้ยังไม่มีคีย์หลักหรือชุดไม่ซ้ำ` (target has no PK or unique set) and `ไม่มีคอลัมน์ชนิดเดียวกับ {col}` (no local column of a matching type).
- **New table** `table_n`: `id` uuid PK default `uuid`, plus `created_at` timestamptz default `now`, not null.
- **ข้อมูลทดสอบ:** the grid (§6).
- Validation errors appear inline under the field. A table with errors shows a `มีปัญหา` dot (`role="img"`) in the table list; its structure tab lists every error under the heading `ปัญหาของตาราง`, and each item moves focus to the field.
  - The list covers table, column and key errors in validation order, once each. Column items name their column (`คอลัมน์ price: ค่าเริ่มต้นไม่ตรงกับชนิด`, or `คอลัมน์ที่ 2: …` when the name is blank); a table-name item reads `ชื่อตาราง: …`. Each item is a jump link: it focuses the field (name, type, decimal/enum button, `ต้องมีค่า`, default), falling back to the next focusable control (for example `คีย์หลัก`, then the column name). A table with no columns points its items at `เพิ่มคอลัมน์`.
  - Key labels never show `?`: a missing column reads `(ไม่พบคอลัมน์)`, a missing target table `(ไม่พบตาราง)`, an empty set `—`. Accessible names have no trailing space (`แก้ไขไม่ซ้ำ` when the set is empty).

**Thai labels**

| Key | Label |
|---|---|
| mode | `ฐานข้อมูล` |
| tables / add / delete | `ตาราง` / `เพิ่มตาราง` / `ลบตาราง` |
| structure / test data | `โครงสร้าง` / `ข้อมูลทดสอบ` |
| column / add / delete | `คอลัมน์` / `เพิ่มคอลัมน์` / `ลบคอลัมน์` |
| type / required / PK / default | `ชนิด` / `ต้องมีค่า` / `คีย์หลัก` / `ค่าเริ่มต้น` |
| unique / relations | `ไม่ซ้ำ` / `ความสัมพันธ์` |
| on delete | `เมื่อลบแถวปลายทาง`: `ไม่ทำอะไร` (default), `ลบตาม`, `ตั้งเป็นว่าง`, `ห้ามลบ` |
| defaults | `ไม่มี`, `เวลาปัจจุบัน`, `วันนี้`, `รหัสใหม่` |
| row add / delete | `เพิ่มแถว` / `ลบแถว` |
| paging | `ก่อนหน้า` / `ถัดไป`, `แถว {a}–{b} จาก {n}` |
| export | `ส่งออก .sql` (dialog title `ส่งออกโครงสร้างฐานข้อมูล`) |
| stale banner | `โครงสร้างเปลี่ยนแล้ว` + `อัปเดตข้อมูลทดสอบ` (busy: `กำลังอัปเดตข้อมูลทดสอบ…`) and `ล้างข้อมูลทดสอบ` (opens the full-reset confirm); no live role (only its error line is `role="alert"`) |
| plan / apply error (stale banner) | `อัปเดตข้อมูลทดสอบไม่ได้` or `อัปเดตข้อมูลทดสอบไม่ได้: {detail}` (the prefix is not repeated when Rust already sends it) |
| full-reset confirm (stale banner) | title `ข้อมูลทดสอบทั้งหมดจะถูกลบ`; confirm `อัปเดตและลบข้อมูล`; cancel `ยกเลิก` |
| full-reset confirm (corrupt banner) | title `สร้างไฟล์ข้อมูลทดสอบใหม่`; body `แถวข้อมูลทดสอบทั้งหมดจะถูกลบ แล้วสร้างไฟล์ใหม่ตามโครงสร้างปัจจุบัน`; confirm `สร้างใหม่`; cancel `ยกเลิก` |
| full-reset confirm (grid) | title `ล้างข้อมูลทดสอบ`; body `ทุกแถวในทุกตารางจะถูกลบ แล้วสร้างตารางใหม่ตามโครงสร้างปัจจุบัน`; confirm `ล้างข้อมูลทดสอบ`; cancel `ยกเลิก` |
| full-reset failed | the confirm stays open, buttons enabled, focus on the confirm button; error line (`role="alert"`) `{fail}: {detail}`, or `{fail} ลองกดอีกครั้ง หรือกด ยกเลิก` when Rust gives no detail; `{fail}` = `อัปเดตและลบข้อมูลไม่ได้` / `สร้างไฟล์ข้อมูลทดสอบใหม่ไม่ได้` / `ล้างข้อมูลทดสอบไม่ได้` |
| open error banner | title `เปิดข้อมูลทดสอบไม่ได้`; body = Rust detail, else `ไฟล์อาจถูกใช้อยู่ ดิสก์เต็ม หรือแอปเขียนโฟลเดอร์ข้อมูลไม่ได้ แก้แล้วกด ลองอีกครั้ง` (never the title again); button `ลองอีกครั้ง` |
| lossy update confirm | title `ข้อมูลทดสอบบางส่วนจะหายไป`; body `แถวหรือค่าที่ใช้กับโครงสร้างใหม่ไม่ได้จะถูกลบ ส่วนที่เหลือจะเก็บไว้ ลบแล้วกู้คืนไม่ได้`; list `สิ่งที่จะหายไป` (lines as in §7); cancel `ยกเลิก`; confirm `อัปเดตตามนี้` |
| plan expired | `แผนหมดอายุ กด อัปเดตข้อมูลทดสอบ เพื่อตรวจสอบใหม่` |
| corrupt | `ไฟล์ข้อมูลทดสอบเสียหาย` + `สร้างใหม่` |
| reset | `ล้างข้อมูลทดสอบ` |
| problems | `มีปัญหา` dot in the table list; heading `ปัญหาของตาราง` in the structure tab |

## 6. Test-data grid

Shown when `db_test_open` is `ready`. Before that (`stale`, `invalid_model`, `corrupt`) a banner replaces the grid and offers the matching action.

- ARIA `role="grid"` with `row`, `columnheader`, `gridcell`, and a roving `tabindex` (one cell is tabbable).
  - Navigation: arrows move; Home/End go to the row ends; Ctrl+Home/End go to the grid ends; PageUp/PageDown change the page.
  - Edit: Enter or F2 starts an edit. Enter commits and moves down; Tab/Shift+Tab commits and moves right/left; Esc cancels and focus returns to the cell. Outside an edit, Tab leaves the grid.
  - Delete on a cell sets NULL when the column is nullable.
- A row header checkbox selects rows; `ลบแถว` deletes them after an `AlertDialog` (initial focus `ยกเลิก`).
- `เพิ่มแถว` opens a `Dialog` form, one field per column, with defaults prefilled; identity and uuid show `อัตโนมัติ`.
- Edits **apply immediately** and are **not undoable**: they live in the test file, not the project, and don't dirty it.
- A failed write keeps the input open with `aria-invalid="true"` and `aria-describedby` → an error line under the grid (`แถว 3, email: ค่าซ้ำ`).
- 100 rows per page, ordered by rowid. Booleans use a `Switch`, enums a `Select`, and json a multi-line input in a `Popover`.
- Live region (existing `announce`): `เพิ่มแถวแล้ว`, `ลบ {n} แถวแล้ว`, `อัปเดตข้อมูลทดสอบแล้ว`. Not announced per cell.

## 7. Schema change → test rows

The test file is not changed on every edit. A changed model makes the grid `stale`. `อัปเดตข้อมูลทดสอบ` calls `db_test_plan`, which builds `<id>.sqlite.tmp` from the new model and copies data matched **by table id and column id** (rowid kept, rowid order).

**Value rule (per column):** the value is kept when the column id is unchanged and the type is the same or a safe widening:
- `integer → decimal` (only if the value fits p/s);
- `integer`/`decimal` → `text`;
- `date`/`timestamptz`/`uuid`/`json`/`enum`/`boolean` → `text` (canonical string; boolean → `true`/`false`);
- `enum → enum` (only if the value is still in `values`);
- decimal p/s widened.

Any other change, a dropped column, or a value that does not fit becomes NULL and counts as **value lost**. New columns get their default (uuid filled), else NULL.

**Row rule:** after mapping, a row is **lost** if it violates NOT NULL (for example NOT NULL added while NULLs exist), PK or UNIQUE (for example a unique added over duplicates; the lowest rowid wins), or an FK (checked with `PRAGMA foreign_key_check`, repeated until stable). A dropped table loses all of its rows.

`lossless` → `db_test_apply` runs at once, with no dialog. Otherwise an `AlertDialog` (initial focus `ยกเลิก`) lists one line per table that loses something, exactly: `{name}: ลบ {r} แถว, ล้าง {v} ค่า` (a zero part is left out: `{name}: ลบ {r} แถว` / `{name}: ล้าง {v} ค่า`), and for a dropped table `ตาราง {name} จะถูกลบ (ลบ {r} แถว)`, or `ตาราง {name} จะถูกลบ` when it has no rows (dropped tables are always listed). Counts use a thousands separator (`1,234`). `{name}` is the table's `ชื่อที่แสดง` in the new model, else in the old model (the one the file was last built or updated with in this session, then the last saved model), else its SQL name. Only the list scrolls; the title and body never shrink under it. Confirm → `db_test_apply` renames the tmp file over the old one. Cancel → `db_test_discard`, the grid stays stale and read-only. A failed build leaves the old file untouched.

**Decided details:** `identity` is read as an integer, so it keeps its number when widened (`→ integer`/`decimal`/`text`). A narrowed decimal keeps the values that still fit the new p/s. An FK orphan whose delete action is `ตั้งเป็นว่าง` with all its columns nullable gets those columns set to NULL (counted as values lost) and the row stays; every other action loses the row. Dropping a table with no rows is lossless (still listed, `dropped: true`).

## 8. Undo, dirty, save

- **Separate history.** The model has its own capped (100) undo stack in the lazy DB store, not in `editor-store.past`. Page history snapshots `PageDocument` (`history.ts` `treeOf`), so mixing would make Ctrl+Z in `ออกแบบ` silently undo invisible schema edits.
  - In `ฐานข้อมูล` mode, Ctrl/Cmd+Z / Shift+Z route to the model history; elsewhere, to the page history.
  - One commit (`TextPropField` blur/Enter, Select change, switch toggle, dialog save) is one step.
  - The stack is cleared on project close.
- **Dirty.** `projects-store` gains `pendingDbModel: unknown | null` (plain data, no DB code). The DB store sets it on every model change, and `dirty` = document dirty **or** `pendingDbModel !== null`.
- **Save.** `saveOpenProject` passes `db_model` when pending and clears it on success (edits made during the save stay pending). Ctrl/Cmd+S, `บันทึกแล้ว`, and `UnsavedChangesDialog` all cover it unchanged.
- **Lock:** none. Page lock does not apply to the model in v1.

## 9. `.sql` export

`ส่งออก .sql` → `save({ title: "ส่งออกโครงสร้างฐานข้อมูล", defaultPath: "<project>-schema.sql", filters: [{ name: "SQL", extensions: ["sql"] }] })` (name stem from the `exportFileName` rules) → `db_sql_export` with the in-memory model.

```sql
-- Vite Studio schema export
-- PostgreSQL 17 / Supabase. Row level security is enabled on every table.
-- No policies are generated: the anon and authenticated roles can read or
-- write nothing until you add policies (see docs/SUPABASE.md).
-- Prefer Supabase Auth for login; treat app users tables as profiles, not
-- password stores.
create table public.<t> ( … , constraint <t>_pkey primary key (…), constraint <t>_<c>_key unique (…), constraint <t>_<c>_check check (…) );
…                                  -- tables by name, columns in model order
alter table public.<t> add constraint <t>_<c>_fkey foreign key (…) references public.<r> (…) on delete <action>;
create index <t>_<c>_idx on public.<t> (…);   -- per FK column set
comment on table public.<t> is '…';          -- labels only
alter table public.<t> enable row level security;
```

- Deterministic: no timestamp; the same model gives the same bytes.
- Identifiers are quoted only when needed.
- `ON UPDATE` is always the PG default (omitted).
- There are no INSERTs.
- Constraint names over 63 bytes are truncated with an 8-hex hash suffix.

## 10. Errors and RAM

**Errors:**
- `db_test_open` failure: inline `Alert` `เปิดข้อมูลทดสอบไม่ได้` with a body (§5 labels) and `ลองอีกครั้ง`. The structure tab still works.
- `db_test_reset` failure (any of the three full-reset confirms): the dialog stays open with the error line (§5); closing it returns focus to its opener, or to `ลองอีกครั้ง` when the file was closed by the failure.
- `corrupt`: `ไฟล์ข้อมูลทดสอบเสียหาย` + `สร้างใหม่` (`db_test_reset`, AlertDialog first).
- Export failure: `toast.error(message)`.
- Leaving the mode, closing the project or switching projects calls `db_test_close`; Rust also drops the connection on exit.

**Lazy-load acceptance (DEV proves it):**
- `vite build --manifest`: the entry chunk and its static imports contain no module under `src/components/database/` or `src/lib/db-`.
- `rg 'ส่งออกโครงสร้างฐานข้อมูล' dist/assets` matches only the DB chunk.
- Network/devtools show the chunk loads on the first switch to `ฐานข้อมูล`, not at startup or idle.

**RAM acceptance:** tree PSS via `/proc/*/smaps_rollup`, as in the spike REPORT, release build:

| Point | Target |
|---|---|
| startup | ≤ today + 2 MB |
| open `ฐานข้อมูล` + grid on a 10,000-row test file | ≤ +40 MB |
| after leaving the mode for 30 s | ≤ +20 MB over before |
| Rust test connection | closed (no fd open on `databases/*.sqlite`, checked with `ls -l /proc/<pid>/fd`) |

**Measured (step 8, 2026-10-18):** targets are measured from the state just before entering `ฐานข้อมูล` (PM decision). DB mode with the 10,000-row grid: +9.9 MB PSS; 30 s after leaving: +12.3 MB PSS; connection closed after leaving. The startup target is accepted as not verifiable (no pre-Phase-10 baseline). Method, figures and the reference decision: `docs/RAM-BASELINE.md`.

Pre-existing focus gaps found during step 8 are tracked in `docs/FOLLOWUPS.md` (not part of this phase).

## 11. Steps (each verifiable on its own)

1. **Model + migration + Rust core.** `db_models` in `migrate`; `dbmodel.rs` structs, validation, `PG_RESERVED`; `db_model_load`; `save_project` + `db_model` in one transaction; `delete_project` cleanup. *Tests:* cargo tests for validation (every rule, valid and invalid), save/load round-trip, transaction atomicity (failed model write leaves the project row unchanged), delete removes the row. *Real Tauri only.*
2. **Lazy mode shell.** `EditorMode "database"`, `ModeSwitch` item, `DatabaseMode` lazy chunk with empty state `ยังไม่มีตาราง` + `เพิ่มตาราง`, `pendingDbModel` dirty wiring. *Tests:* frontend test that dirty includes `pendingDbModel`; manifest check (§10). *Mock:* mode switch, Suspense fallback, empty state, Ctrl/Cmd+S saves.
3. **Table/column editor.** List, rename, reorder, delete; column rows; type `Select`; nullable; decimal/enum popovers; identifier normalising and inline errors (`aria-invalid` + `aria-describedby`); model undo stack. *Tests:* TS validation mirror equals Rust on shared fixture JSON; undo/redo unit tests (one commit = one step; mode-routed shortcut). *Mock:* all UI, keyboard, undo, focus return after menus.
4. **Keys, unique, FK, defaults.** PK switches, uniques, FK dialog, cascade-delete of FKs on table/column delete, default controls per type. *Tests:* validation cases for FK type/ref rules and defaults. *Mock:* FK dialog focus trap and return; errors.
5. **`.sql` export + goldens.** `db_sql_export`, save dialog. *Tests:* golden files in `src-tauri/src/fixtures/dbmodel/` (`<case>.json` → `<case>.pg.sql`, `<case>.sqlite.sql`) for every type, defaults, composite PK, self-FK, FK cycle, long-name truncation, label comments, quoting; byte-identical across two runs. *Real:* load each `.pg.sql` into PG 17 once by hand (DEV spike machine) and report the result.
6. **Test file + grid.** `TestDbState`, open/close/rows/insert/update/delete/reset, lazy sweep, corrupt path, grid keyboard model, add-row dialog. *Tests:* cargo tests for each command, FK enforcement, `quick_check` failure (truncated file) → `corrupt`, close releases the file; frontend grid keyboard tests. *Mock:* grid a11y and keyboard with mocked invoke. *Real:* fd closed after leaving the mode.
7. **Schema change migration.** `db_test_plan`/`apply`/`discard`, stale banner, confirm. *Tests:* cargo compatibility table: each widening kept, each narrowing lost, enum shrink, NOT NULL with NULLs, unique over duplicates (lowest rowid kept), FK orphans cascading, dropped table/column, rename keeps data, failed build keeps the old file. *Mock:* confirm text from mocked plan counts; cancel leaves stale.
8. **Polish / a11y / RAM.** Problems list, live-region messages, reduced motion, contrast, RAM table (§10). *Real:* RSS/PSS measurements and the manifest check reported with figures.

**Designer GUI mock can verify:** layout, labels, keyboard, focus, ARIA, live-region text, undo/dirty/save wiring, confirm wording (mocked counts), lazy chunk loading in the dev network panel. **Needs real Tauri/cargo:** every Rust command, SQLite files and pragmas, migration results, `.sql` goldens, PG 17 load, RAM, fd release, WebKitGTK rendering.

## 12. Open questions for the user

None blocking; the PM defaults cover v1. Optional: should new tables start with `id` uuid (recommended: Supabase convention) or `ลำดับอัตโนมัติ` identity? This spec uses uuid.
