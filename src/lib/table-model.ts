/** Phase 11 A4.2: table grid caps (shared with the compiler). */
export const MAX_TABLE_COLS = 20;
export const MAX_TABLE_ROWS = 100;

/** T35 — shown when add-column / paste would exceed the column cap. */
export const TABLE_FULL_MESSAGE = "ตารางเต็มแล้ว";

export function capColumns(columns: readonly string[]): string[] {
  return columns.slice(0, MAX_TABLE_COLS);
}

export function capRows(rows: readonly (readonly string[])[]): string[][] {
  return rows.slice(0, MAX_TABLE_ROWS).map((r) => [...r]);
}

/** Pad or trim each row to `columns.length` (after column cap). */
export function normalizeTableRows(columns: readonly string[], rows: readonly (readonly string[])[]): string[][] {
  const n = capColumns(columns).length;
  return capRows(rows).map((row) => {
    const cells = row.slice(0, n);
    while (cells.length < n) cells.push("");
    return cells;
  });
}

export type TableGrid = { columns: string[]; rows: string[][] };

export function cloneGrid(columns: readonly string[], rows: readonly (readonly string[])[]): TableGrid {
  const cols = capColumns(columns);
  return { columns: cols, rows: normalizeTableRows(cols, rows) };
}

/** T31 — append a column; returns null when already at {@link MAX_TABLE_COLS}. */
export function addTableColumn(grid: TableGrid, header = ""): TableGrid | null {
  if (grid.columns.length >= MAX_TABLE_COLS) return null;
  const columns = [...grid.columns, header];
  const rows = grid.rows.map((r) => [...r, ""]);
  return { columns, rows };
}

/** T33 — remove column at index; returns null when only one column remains. */
export function removeTableColumn(grid: TableGrid, colIndex: number): TableGrid | null {
  if (grid.columns.length <= 1) return null;
  if (colIndex < 0 || colIndex >= grid.columns.length) return null;
  const columns = grid.columns.filter((_, i) => i !== colIndex);
  const rows = grid.rows.map((r) => r.filter((_, i) => i !== colIndex));
  return { columns, rows };
}

/** T30 — append a row; returns null when already at {@link MAX_TABLE_ROWS}. */
export function addTableRow(grid: TableGrid): TableGrid | null {
  if (grid.rows.length >= MAX_TABLE_ROWS) return null;
  const empty = Array.from({ length: grid.columns.length }, () => "");
  return { columns: [...grid.columns], rows: [...grid.rows, empty] };
}

/** T32 — remove row at index; returns null when only one row remains. */
export function removeTableRow(grid: TableGrid, rowIndex: number): TableGrid | null {
  if (grid.rows.length <= 1) return null;
  if (rowIndex < 0 || rowIndex >= grid.rows.length) return null;
  return {
    columns: [...grid.columns],
    rows: grid.rows.filter((_, i) => i !== rowIndex),
  };
}

/**
 * Paste TSV starting at (startRow, startCol). Extends rows/columns as needed
 * up to the caps. If the paste needs more than {@link MAX_TABLE_COLS} columns
 * from the start column, `refusedCols` is true (T35) and the grid is still
 * filled up to the cap.
 */
export function pasteTsvAt(
  grid: TableGrid,
  startRow: number,
  startCol: number,
  raw: string,
): { grid: TableGrid; refusedCols: boolean } {
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length === 0) return { grid: cloneGrid(grid.columns, grid.rows), refusedCols: false };

  const paste = lines.map((line) => line.split("\t"));
  const pasteWidth = Math.max(0, ...paste.map((r) => r.length));
  const pasteHeight = paste.length;

  let columns = [...grid.columns];
  let refusedCols = false;
  const neededCols = startCol + pasteWidth;
  if (neededCols > MAX_TABLE_COLS) {
    refusedCols = true;
  }
  while (columns.length < Math.min(neededCols, MAX_TABLE_COLS)) {
    columns.push("");
  }

  let rows = normalizeTableRows(columns, grid.rows);
  const neededRows = startRow + pasteHeight;
  while (rows.length < Math.min(neededRows, MAX_TABLE_ROWS)) {
    rows.push(Array.from({ length: columns.length }, () => ""));
  }
  // Widen existing rows if columns grew.
  rows = normalizeTableRows(columns, rows);

  const maxCol = Math.min(startCol + pasteWidth, columns.length);
  const maxRow = Math.min(startRow + pasteHeight, rows.length);
  for (let r = startRow; r < maxRow; r++) {
    const src = paste[r - startRow]!;
    const dest = [...rows[r]!];
    for (let c = startCol; c < maxCol; c++) {
      dest[c] = src[c - startCol] ?? "";
    }
    rows[r] = dest;
  }

  return { grid: { columns, rows }, refusedCols };
}

export function tableModelEqual(
  a: { columns: readonly string[]; rows: readonly (readonly string[])[] },
  b: { columns: readonly string[]; rows: readonly (readonly string[])[] },
): boolean {
  const ca = capColumns(a.columns);
  const cb = capColumns(b.columns);
  if (ca.length !== cb.length || !ca.every((s, i) => s === cb[i])) return false;
  const ra = normalizeTableRows(ca, a.rows);
  const rb = normalizeTableRows(cb, b.rows);
  if (ra.length !== rb.length) return false;
  return ra.every((row, i) => row.every((c, j) => c === rb[i]![j]));
}

/** One column header per line (T34 column side). */
export function formatColumns(columns: readonly string[]): string {
  return columns.join("\n");
}

export function parseColumns(raw: string): string[] {
  const lines = raw.split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return capColumns(lines);
}

/** Rows as TSV (one row per line). */
export function formatRowsTsv(rows: readonly (readonly string[])[]): string {
  return rows.map((r) => r.join("\t")).join("\n");
}

export function parseRowsTsv(raw: string, columnCount: number): string[][] {
  const lines = raw.split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const emptyCols = Array.from({ length: columnCount }, () => "");
  return normalizeTableRows(
    emptyCols,
    lines.map((line) => line.split("\t")),
  );
}
