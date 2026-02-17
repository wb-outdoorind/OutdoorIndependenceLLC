"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type LedgerReason = "all" | "usage" | "restock" | "adjustment" | "transfer";
type RefTypeFilter = "all" | "maintenance_log" | "vehicle" | "equipment" | "other";

type LedgerRow = {
  id: string;
  created_at: string;
  item_id: string;
  from_location_id: string | null;
  to_location_id: string | null;
  change_qty: number;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_by: string | null;
  notes: string | null;
};

type ItemRow = {
  id: string;
  name: string;
  category: string | null;
};

type LocationRow = {
  id: string;
  name: string;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
};

function cardStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 16,
    padding: 16,
    background: "rgba(255,255,255,0.03)",
  };
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: 10,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.03)",
    color: "inherit",
  };
}

function toDateInputValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function csvCell(value: string | number | null | undefined) {
  const raw = value == null ? "" : String(value);
  return `"${raw.replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const csv = rows.map((row) => row.map((col) => csvCell(col)).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function referenceHref(referenceType: string | null) {
  if (referenceType === "maintenance_log") return "/maintenance";
  return null;
}

export default function InventoryLedgerClient() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [itemMap, setItemMap] = useState<Record<string, { name: string; category: string | null }>>({});
  const [locationMap, setLocationMap] = useState<Record<string, string>>({});
  const [profileMap, setProfileMap] = useState<Record<string, { email: string | null; full_name: string | null }>>({});

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateInputValue(d);
  });
  const [dateTo, setDateTo] = useState(() => toDateInputValue(new Date()));
  const [reason, setReason] = useState<LedgerReason>("all");
  const [itemSearch, setItemSearch] = useState("");
  const [referenceType, setReferenceType] = useState<RefTypeFilter>("all");

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        const supabase = createSupabaseBrowser();
        setLoading(true);
        setErrorMessage(null);

        let query = supabase
          .from("inventory_transactions")
          .select(
            "id,created_at,item_id,from_location_id,to_location_id,change_qty,reason,reference_type,reference_id,created_by,notes"
          )
          .order("created_at", { ascending: false });

        if (dateFrom) query = query.gte("created_at", `${dateFrom}T00:00:00.000Z`);
        if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59.999Z`);
        if (reason !== "all") query = query.eq("reason", reason);
        if (referenceType !== "all") query = query.eq("reference_type", referenceType);

        const { data, error } = await query;
        if (error) {
          console.error("[inventory-ledger] ledger query error:", error);
          setErrorMessage(error.message || "Failed to load ledger.");
          setRows([]);
          setItemMap({});
          setLocationMap({});
          setProfileMap({});
          setLoading(false);
          return;
        }

        const ledgerRows = (data ?? []) as LedgerRow[];
        setRows(ledgerRows);

        const itemIds = Array.from(new Set(ledgerRows.map((r) => r.item_id).filter(Boolean)));
        const locationIds = Array.from(
          new Set(
            ledgerRows
              .flatMap((r) => [r.from_location_id, r.to_location_id])
              .filter((id): id is string => Boolean(id))
          )
        );
        const userIds = Array.from(
          new Set(ledgerRows.map((r) => r.created_by).filter((id): id is string => Boolean(id)))
        );

        const [itemsRes, locationsRes, profilesRes] = await Promise.all([
          itemIds.length
            ? supabase.from("inventory_items").select("id,name,category").in("id", itemIds)
            : Promise.resolve({ data: [], error: null }),
          locationIds.length
            ? supabase.from("inventory_locations").select("id,name").in("id", locationIds)
            : Promise.resolve({ data: [], error: null }),
          userIds.length
            ? supabase.from("profiles").select("id,email,full_name").in("id", userIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (itemsRes.error || locationsRes.error || profilesRes.error) {
          console.error("[inventory-ledger] lookup query error:", {
            itemsError: itemsRes.error,
            locationsError: locationsRes.error,
            profilesError: profilesRes.error,
          });
          setErrorMessage(
            itemsRes.error?.message ||
              locationsRes.error?.message ||
              profilesRes.error?.message ||
              "Failed to load lookup data."
          );
          setItemMap({});
          setLocationMap({});
          setProfileMap({});
          setLoading(false);
          return;
        }

        const nextItemMap: Record<string, { name: string; category: string | null }> = {};
        for (const item of (itemsRes.data ?? []) as ItemRow[]) {
          nextItemMap[item.id] = { name: item.name, category: item.category };
        }

        const nextLocationMap: Record<string, string> = {};
        for (const location of (locationsRes.data ?? []) as LocationRow[]) {
          nextLocationMap[location.id] = location.name;
        }

        const nextProfileMap: Record<string, { email: string | null; full_name: string | null }> = {};
        for (const profile of (profilesRes.data ?? []) as ProfileRow[]) {
          nextProfileMap[profile.id] = { email: profile.email, full_name: profile.full_name };
        }

        setItemMap(nextItemMap);
        setLocationMap(nextLocationMap);
        setProfileMap(nextProfileMap);
        setLoading(false);
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [dateFrom, dateTo, reason, referenceType]);

  const filteredRows = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((row) => {
      const item = itemMap[row.item_id];
      const hay = [item?.name ?? row.item_id, item?.category ?? "", row.item_id]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, itemMap, itemSearch]);

  function onExportCsv() {
    const csvRows: Array<Array<string | number | null>> = [
      ["date", "item", "reason", "change", "from", "to", "reference_type", "reference_id", "created_by", "notes"],
      ...filteredRows.map((row) => [
        row.created_at,
        itemMap[row.item_id]?.name ?? row.item_id,
        row.reason ?? "",
        row.change_qty,
        row.from_location_id ? locationMap[row.from_location_id] ?? row.from_location_id : "",
        row.to_location_id ? locationMap[row.to_location_id] ?? row.to_location_id : "",
        row.reference_type ?? "",
        row.reference_id ?? "",
        row.created_by
          ? profileMap[row.created_by]?.email || profileMap[row.created_by]?.full_name || row.created_by
          : "",
        row.notes ?? "",
      ]),
    ];

    downloadCsv("inventory_ledger.csv", csvRows);
  }

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>Inventory Ledger</h1>
      <div style={{ opacity: 0.75 }}>Full transaction history with filters and CSV export.</div>

      <div style={{ marginTop: 16, ...cardStyle() }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
          }}
        >
          <Field label="From">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle()} />
          </Field>

          <Field label="To">
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle()} />
          </Field>

          <Field label="Reason">
            <select value={reason} onChange={(e) => setReason(e.target.value as LedgerReason)} style={inputStyle()}>
              <option value="all">All</option>
              <option value="usage">usage</option>
              <option value="restock">restock</option>
              <option value="adjustment">adjustment</option>
              <option value="transfer">transfer</option>
            </select>
          </Field>

          <Field label="Reference Type">
            <select
              value={referenceType}
              onChange={(e) => setReferenceType(e.target.value as RefTypeFilter)}
              style={inputStyle()}
            >
              <option value="all">All</option>
              <option value="maintenance_log">maintenance_log</option>
              <option value="vehicle">vehicle</option>
              <option value="equipment">equipment</option>
              <option value="other">other</option>
            </select>
          </Field>

          <Field label="Item Search">
            <input
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Search by item name"
              style={inputStyle()}
            />
          </Field>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={onExportCsv} style={buttonStyle}>
            Export Ledger CSV
          </button>
        </div>
      </div>

      <div style={{ marginTop: 16, ...cardStyle() }}>
        {loading ? (
          <div style={{ opacity: 0.75 }}>Loading ledger...</div>
        ) : errorMessage ? (
          <div style={{ color: "#ff9d9d" }}>{errorMessage}</div>
        ) : filteredRows.length === 0 ? (
          <div style={{ opacity: 0.75 }}>No ledger rows match these filters.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Item</th>
                  <th style={thStyle}>Reason</th>
                  <th style={thStyle}>Change</th>
                  <th style={thStyle}>From → To</th>
                  <th style={thStyle}>Reference</th>
                  <th style={thStyle}>Created by</th>
                  <th style={thStyle}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const refLabel = `${row.reference_type ?? "-"}${row.reference_id ? ` / ${row.reference_id}` : ""}`;
                  const href = referenceHref(row.reference_type);

                  return (
                    <tr key={row.id}>
                      <td style={tdStyle}>{formatDateTime(row.created_at)}</td>
                      <td style={tdStyle}>{itemMap[row.item_id]?.name ?? row.item_id}</td>
                      <td style={tdStyle}>{row.reason ?? "-"}</td>
                      <td style={{ ...tdStyle, fontWeight: 800, color: row.change_qty < 0 ? "#ffb3b3" : "#b8ffd9" }}>
                        {row.change_qty > 0 ? `+${row.change_qty}` : row.change_qty}
                      </td>
                      <td style={tdStyle}>
                        {(row.from_location_id ? locationMap[row.from_location_id] ?? row.from_location_id : "-") +
                          " → " +
                          (row.to_location_id ? locationMap[row.to_location_id] ?? row.to_location_id : "-")}
                      </td>
                      <td style={tdStyle}>
                        {href ? (
                          <Link href={href} style={{ color: "inherit" }}>
                            {refLabel}
                          </Link>
                        ) : (
                          refLabel
                        )}
                      </td>
                      <td style={tdStyle}>
                        {row.created_by
                          ? profileMap[row.created_by]?.email || profileMap[row.created_by]?.full_name || row.created_by
                          : "-"}
                      </td>
                      <td style={tdStyle}>{row.notes ?? "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  fontWeight: 900,
  cursor: "pointer",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid rgba(255,255,255,0.18)",
  opacity: 0.8,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 8px",
  borderBottom: "1px solid rgba(255,255,255,0.10)",
};
