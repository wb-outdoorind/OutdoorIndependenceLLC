"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type InventoryItemRow = {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  minimum_quantity: number;
  location_id: string | null;
  is_active: boolean;
};

type InventoryLocationRow = {
  id: string;
  name: string;
};

type UsageRow = {
  id: string;
  created_at: string;
  item_id: string;
  change_qty: number;
  reference_type: string | null;
  reference_id: string | null;
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

function toCsvCell(value: string | number | null | undefined) {
  const raw = value == null ? "" : String(value);
  const escaped = raw.replaceAll('"', '""');
  return `"${escaped}"`;
}

function toCsv(rows: Array<Array<string | number | null | undefined>>) {
  return rows.map((row) => row.map((cell) => toCsvCell(cell)).join(",")).join("\n");
}

function downloadCsv(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function InventoryReportsClient() {
  const [items, setItems] = useState<InventoryItemRow[]>([]);
  const [locationMap, setLocationMap] = useState<Record<string, string>>({});
  const [usageRows, setUsageRows] = useState<UsageRow[]>([]);

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateInputValue(d);
  });
  const [dateTo, setDateTo] = useState(() => toDateInputValue(new Date()));

  const [loading, setLoading] = useState(true);
  const [usageLoading, setUsageLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);

  const lowStockItems = useMemo(
    () => items.filter((item) => Number(item.quantity) <= Number(item.minimum_quantity)),
    [items]
  );

  const itemNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of items) {
      map[item.id] = item.name;
    }
    return map;
  }, [items]);

  async function loadInventory() {
    const supabase = createSupabaseBrowser();
    setLoading(true);
    setErrorMessage(null);

    const [itemsRes, locationsRes] = await Promise.all([
      supabase
        .from("inventory_items")
        .select("id,name,category,quantity,minimum_quantity,location_id,is_active")
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase.from("inventory_locations").select("id,name"),
    ]);

    if (itemsRes.error || locationsRes.error) {
      console.error("[inventory-reports] load inventory error:", {
        itemsError: itemsRes.error,
        locationsError: locationsRes.error,
      });
      setErrorMessage(itemsRes.error?.message || locationsRes.error?.message || "Failed to load inventory.");
      setItems([]);
      setLocationMap({});
      setLoading(false);
      return;
    }

    const locMap: Record<string, string> = {};
    for (const row of (locationsRes.data ?? []) as InventoryLocationRow[]) {
      locMap[row.id] = row.name;
    }

    setItems((itemsRes.data ?? []) as InventoryItemRow[]);
    setLocationMap(locMap);
    setLoading(false);
  }

  async function loadUsageReport(nextFrom: string, nextTo: string) {
    const supabase = createSupabaseBrowser();
    setUsageLoading(true);
    setUsageError(null);

    let query = supabase
      .from("inventory_transactions")
      .select("id,created_at,item_id,change_qty,reference_type,reference_id")
      .eq("reason", "usage")
      .order("created_at", { ascending: false });

    if (nextFrom) {
      query = query.gte("created_at", `${nextFrom}T00:00:00.000Z`);
    }
    if (nextTo) {
      query = query.lte("created_at", `${nextTo}T23:59:59.999Z`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[inventory-reports] usage query error:", error);
      setUsageError(error.message || "Failed to load usage report.");
      setUsageRows([]);
      setUsageLoading(false);
      return;
    }

    setUsageRows((data ?? []) as UsageRow[]);
    setUsageLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadInventory();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsageReport(dateFrom, dateTo);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [dateFrom, dateTo]);

  function onExportCurrentInventory() {
    const rows: Array<Array<string | number>> = [
      ["Item ID", "Item", "Category", "Qty", "Min", "Location", "Low Stock"],
      ...items.map((item) => [
        item.id,
        item.name,
        item.category ?? "",
        item.quantity,
        item.minimum_quantity,
        item.location_id ? locationMap[item.location_id] ?? "" : "",
        Number(item.quantity) <= Number(item.minimum_quantity) ? "Yes" : "No",
      ]),
    ];

    downloadCsv("inventory_current.csv", rows);
  }

  function onExportLowStock() {
    const rows: Array<Array<string | number>> = [
      ["Item ID", "Item", "Category", "Qty", "Min", "Location"],
      ...lowStockItems.map((item) => [
        item.id,
        item.name,
        item.category ?? "",
        item.quantity,
        item.minimum_quantity,
        item.location_id ? locationMap[item.location_id] ?? "" : "",
      ]),
    ];

    downloadCsv("inventory_low_stock.csv", rows);
  }

  function onExportUsage() {
    const rows: Array<Array<string | number>> = [
      ["Date", "Item ID", "Item", "Quantity Used", "Reference Type", "Reference ID"],
      ...usageRows.map((row) => [
        row.created_at,
        row.item_id,
        itemNameById[row.item_id] ?? row.item_id,
        Math.abs(Number(row.change_qty)),
        row.reference_type ?? "",
        row.reference_id ?? "",
      ]),
    ];

    downloadCsv("inventory_usage_report.csv", rows);
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>Inventory Reports</h1>
      <div style={{ opacity: 0.75 }}>Low-stock and usage reporting with CSV exports.</div>

      <div style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={onExportCurrentInventory} style={buttonStyle}>
            Export Current Inventory CSV
          </button>
          <button type="button" onClick={onExportLowStock} style={buttonStyle}>
            Export Low-Stock CSV
          </button>
          <button type="button" onClick={onExportUsage} style={buttonStyle}>
            Export Usage CSV
          </button>
        </div>
      </div>

      <div style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>
          Low-Stock Report ({lowStockItems.length})
        </div>

        {loading ? (
          <div style={{ opacity: 0.75 }}>Loading low-stock report...</div>
        ) : errorMessage ? (
          <div style={{ color: "#ff9d9d" }}>{errorMessage}</div>
        ) : lowStockItems.length === 0 ? (
          <div style={{ opacity: 0.75 }}>No low-stock items.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Item</th>
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Qty</th>
                  <th style={thStyle}>Min</th>
                  <th style={thStyle}>Location</th>
                </tr>
              </thead>
              <tbody>
                {lowStockItems.map((item) => (
                  <tr key={item.id}>
                    <td style={tdStyle}>{item.name}</td>
                    <td style={tdStyle}>{item.category ?? "-"}</td>
                    <td style={tdStyle}>{item.quantity}</td>
                    <td style={tdStyle}>{item.minimum_quantity}</td>
                    <td style={tdStyle}>{item.location_id ? locationMap[item.location_id] ?? "-" : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <div style={{ fontWeight: 900 }}>Usage Report</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, minWidth: 380 }}>
            <Field label="From">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle()} />
            </Field>
            <Field label="To">
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle()} />
            </Field>
            <div>
              <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>Run</div>
              <button
                type="button"
                onClick={() => void loadUsageReport(dateFrom, dateTo)}
                style={{ ...buttonStyle, width: "100%" }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          {usageLoading ? (
            <div style={{ opacity: 0.75 }}>Loading usage report...</div>
          ) : usageError ? (
            <div style={{ color: "#ff9d9d" }}>{usageError}</div>
          ) : usageRows.length === 0 ? (
            <div style={{ opacity: 0.75 }}>No usage transactions in this date range.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Item</th>
                    <th style={thStyle}>Quantity Used</th>
                    <th style={thStyle}>Reference Type</th>
                    <th style={thStyle}>Reference ID</th>
                  </tr>
                </thead>
                <tbody>
                  {usageRows.map((row) => (
                    <tr key={row.id}>
                      <td style={tdStyle}>{formatDateTime(row.created_at)}</td>
                      <td style={tdStyle}>{itemNameById[row.item_id] ?? row.item_id}</td>
                      <td style={tdStyle}>{Math.abs(Number(row.change_qty))}</td>
                      <td style={tdStyle}>{row.reference_type ?? "-"}</td>
                      <td style={tdStyle}>{row.reference_id ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
