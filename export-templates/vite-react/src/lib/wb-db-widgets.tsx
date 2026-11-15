/**
 * Interactive Form↔DB widgets for Preview + export (list / lookup / related / asset).
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  dbQuery,
  filterBySearch,
  resolveLabel,
  type RowValues,
} from "@/lib/wb-db-client";

export function DbListPanel({
  tableId,
  resolveFks = true,
  search = true,
  style,
}: {
  tableId: string;
  resolveFks?: boolean;
  search?: boolean;
  style?: CSSProperties;
}) {
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<{ columnId: string; name: string; label: string }[]>([]);
  const [lookups, setLookups] = useState<
    Record<string, { tableId: string; valueColumnId: string; labelColumnId: string }>
  >({});
  const [rows, setRows] = useState<{ rowid: number; values: RowValues }[]>([]);
  const [refRows, setRefRows] = useState<Record<string, RowValues[]>>({});
  const [editPrefix, setEditPrefix] = useState("#");
  const [pkColumnId, setPkColumnId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const meta = await dbQuery({ kind: "listMeta", tableId });
      if (cancelled) return;
      if (!meta.ok) {
        setError(meta.error ?? "โหลดไม่สำเร็จ");
        setLoading(false);
        return;
      }
      setColumns(meta.columns ?? []);
      setPkColumnId(meta.pkColumnId);
      setLookups(resolveFks ? meta.lookups ?? {} : {});
      setEditPrefix(meta.editPathPrefix ?? "#");
      const data = await dbQuery({ kind: "rows", tableId });
      if (cancelled) return;
      if (!data.ok) {
        setError(data.error ?? "โหลดแถวไม่สำเร็จ");
        setLoading(false);
        return;
      }
      setRows(data.rows ?? []);
      setRefRows(data.refRows ?? {});
      setError(null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tableId, resolveFks]);

  const colIds = useMemo(() => columns.map((c) => c.columnId), [columns]);
  const visible = useMemo(
    () => (search ? filterBySearch(rows, q, colIds, lookups, refRows) : rows),
    [rows, q, colIds, lookups, refRows, search],
  );

  return (
    <div style={{ ...style, display: "flex", flexDirection: "column", gap: 8 }} data-wb-db-list={tableId}>
      {search ? (
        <input
          type="search"
          placeholder="ค้นหา…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="wb-input rounded-md border border-[var(--border)] px-3 py-2"
        />
      ) : null}
      {loading ? <p style={{ opacity: 0.7 }}>กำลังโหลด…</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {!loading && !error && visible.length === 0 ? <p style={{ opacity: 0.7 }}>ยังไม่มีข้อมูล</p> : null}
      {visible.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.columnId} style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 6 }}>
                    {c.label}
                  </th>
                ))}
                <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 6 }}> </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const key = pkColumnId
                  ? String(row.values[pkColumnId] ?? row.rowid)
                  : String(row.rowid);
                return (
                  <tr key={row.rowid}>
                    {columns.map((c) => (
                      <td key={c.columnId} style={{ borderBottom: "1px solid var(--border)", padding: 6 }}>
                        {resolveFks
                          ? resolveLabel(c.columnId, row.values[c.columnId], lookups, refRows)
                          : String(row.values[c.columnId] ?? "")}
                      </td>
                    ))}
                    <td style={{ borderBottom: "1px solid var(--border)", padding: 6 }}>
                      <Link to={`${editPrefix}?id=${encodeURIComponent(key)}`}>แก้ไข</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function DbLookupSelect({
  tableId,
  valueColumnId,
  labelColumnId,
  value,
  onChange,
  style,
  className,
}: {
  tableId: string;
  valueColumnId: string;
  labelColumnId: string;
  value?: string;
  onChange?: (v: string) => void;
  style?: CSSProperties;
  className?: string;
}) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [current, setCurrent] = useState(value ?? "");

  useEffect(() => {
    let cancelled = false;
    void dbQuery({ kind: "lookupOptions", tableId, valueColumnId, labelColumnId }).then((r) => {
      if (cancelled || !r.ok) return;
      setOptions(r.options ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [tableId, valueColumnId, labelColumnId]);

  useEffect(() => {
    if (value !== undefined) setCurrent(value);
  }, [value]);

  return (
    <select
      className={className ?? "wb-select"}
      style={style}
      value={current}
      onChange={(e) => {
        setCurrent(e.target.value);
        onChange?.(e.target.value);
      }}
      data-wb-lookup={`${tableId}:${valueColumnId}`}
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function DbRelatedPanel({
  parentTableId,
  fkId,
  parentKey,
  style,
}: {
  parentTableId: string;
  fkId: string;
  parentKey: string;
  style?: CSSProperties;
}) {
  const [rows, setRows] = useState<{ rowid: number; values: RowValues }[]>([]);
  const [columns, setColumns] = useState<{ columnId: string; name: string; label: string }[]>([]);
  const [editPrefix, setEditPrefix] = useState("#");
  const [title, setTitle] = useState("ที่เกี่ยวข้อง");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!parentKey) {
      setRows([]);
      return;
    }
    let cancelled = false;
    void dbQuery({ kind: "related", parentTableId, fkId, parentKey }).then((r) => {
      if (cancelled) return;
      if (!r.ok) {
        setError(r.error ?? "โหลดไม่สำเร็จ");
        return;
      }
      setError(null);
      setRows(r.rows ?? []);
      setColumns(r.columns ?? []);
      setEditPrefix(r.editPathPrefix ?? "#");
      if (r.childTableName) setTitle(`ที่เกี่ยวข้อง: ${r.childTableName}`);
    });
    return () => {
      cancelled = true;
    };
  }, [parentTableId, fkId, parentKey]);

  return (
    <div style={{ ...style, display: "flex", flexDirection: "column", gap: 6 }} data-wb-db-related={fkId}>
      <strong>{title}</strong>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {!error && rows.length === 0 ? <p style={{ opacity: 0.7 }}>ไม่มีรายการที่เกี่ยวข้อง</p> : null}
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {rows.map((row) => {
          const label =
            columns
              .map((c) => String(row.values[c.columnId] ?? ""))
              .filter(Boolean)
              .join(" · ") || String(row.rowid);
          const pk = columns[0] ? String(row.values[columns[0].columnId] ?? row.rowid) : String(row.rowid);
          return (
            <li key={row.rowid}>
              <Link to={`${editPrefix}?id=${encodeURIComponent(pk)}`}>{label || pk}</Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DbAssetField({
  label,
  value,
  style,
}: {
  label?: string;
  value?: string;
  style?: CSSProperties;
}) {
  const [id, setId] = useState(value ?? "");
  return (
    <label style={{ ...style, display: "flex", flexDirection: "column", gap: 4 }} data-wb-asset-field>
      {label ? <span>{label}</span> : null}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="text"
          className="wb-input rounded-md border border-[var(--border)] px-3 py-2"
          placeholder="asset id"
          value={id}
          onChange={(e) => setId(e.target.value)}
          data-wb-input-kind="asset"
        />
        <button
          type="button"
          className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          onClick={() => {
            const next = window.prompt("ใส่รหัสสินทรัพย์ (asset id)", id);
            if (next !== null) setId(next.trim());
          }}
        >
          เลือกรูป
        </button>
        {id ? (
          <button type="button" className="text-sm underline" onClick={() => setId("")}>
            ล้าง
          </button>
        ) : null}
      </div>
    </label>
  );
}
