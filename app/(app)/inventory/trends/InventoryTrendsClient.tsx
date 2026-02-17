"use client";

import { useMemo, useState } from "react";
import { useEffect } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type UsageRow = {
  id: string;
  created_at: string;
  item_id: string;
  change_qty: number;
};

type ItemRow = {
  id: string;
  name: string;
  category: string | null;
};

type TopItemRow = {
  item_id: string;
  item_name: string;
  category: string | null;
  total_used: number;
};

type WeekRow = {
  week_start: string;
  total_used: number;
};

function toDateInputValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

function weekStartISO(isoDateTime: string) {
  const d = new Date(isoDateTime);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function SimpleLineChart({ rows }: { rows: WeekRow[] }) {
  if (rows.length === 0) return <div style={{ opacity: 0.75 }}>No weekly data.</div>;

  const width = 760;
  const height = 220;
  const pad = 28;
  const values = rows.map((r) => r.total_used);
  const maxVal = Math.max(...values, 1);
  const xStep = rows.length > 1 ? (width - pad * 2) / (rows.length - 1) : 0;

  const points = rows
    .map((r, i) => {
      const x = pad + i * xStep;
      const y = height - pad - (r.total_used / maxVal) * (height - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 220, display: "block" }}>
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="rgba(255,255,255,0.35)" />
      <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="rgba(255,255,255,0.35)" />
      <polyline fill="none" stroke="rgba(120,220,255,0.95)" strokeWidth="2.5" points={points} />
      {rows.map((r, i) => {
        const x = pad + i * xStep;
        const y = height - pad - (r.total_used / maxVal) * (height - pad * 2);
        return <circle key={r.week_start} cx={x} cy={y} r={2.8} fill="rgba(120,220,255,0.95)" />;
      })}
    </svg>
  );
}

function SimpleBarChart({ rows }: { rows: TopItemRow[] }) {
  if (rows.length === 0) return <div style={{ opacity: 0.75 }}>No item usage data.</div>;

  const width = 760;
  const height = 240;
  const pad = 28;
  const shown = rows.slice(0, 10);
  const maxVal = Math.max(...shown.map((r) => r.total_used), 1);
  const slot = (width - pad * 2) / shown.length;
  const barWidth = Math.max(8, slot * 0.62);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 240, display: "block" }}>
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="rgba(255,255,255,0.35)" />
      {shown.map((row, idx) => {
        const h = (row.total_used / maxVal) * (height - pad * 2);
        const x = pad + idx * slot + (slot - barWidth) / 2;
        const y = height - pad - h;
        return (
          <rect
            key={row.item_id}
            x={x}
            y={y}
            width={barWidth}
            height={h}
            rx={4}
            fill="rgba(126,255,167,0.9)"
          />
        );
      })}
    </svg>
  );
}

export default function InventoryTrendsClient() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateInputValue(d);
  });
  const [dateTo, setDateTo] = useState(() => toDateInputValue(new Date()));

  const [usageRows, setUsageRows] = useState<UsageRow[]>([]);
  const [itemMap, setItemMap] = useState<Record<string, { name: string; category: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadData(from: string, to: string) {
    setLoading(true);
    setErrorMessage(null);

    const supabase = createSupabaseBrowser();

    let query = supabase
      .from("inventory_transactions")
      .select("id,created_at,item_id,change_qty")
      .eq("reason", "usage")
      .order("created_at", { ascending: false });

    if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
    if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

    const { data, error } = await query;

    if (error) {
      console.error("[inventory-trends] usage load error:", error);
      setErrorMessage(error.message || "Failed to load usage trends.");
      setUsageRows([]);
      setItemMap({});
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as UsageRow[];
    setUsageRows(rows);

    const itemIds = Array.from(new Set(rows.map((row) => row.item_id).filter(Boolean)));
    if (itemIds.length === 0) {
      setItemMap({});
      setLoading(false);
      return;
    }

    const { data: itemsData, error: itemsError } = await supabase
      .from("inventory_items")
      .select("id,name,category")
      .in("id", itemIds);

    if (itemsError) {
      console.error("[inventory-trends] item lookup error:", itemsError);
      setErrorMessage(itemsError.message || "Failed to load item details.");
      setItemMap({});
      setLoading(false);
      return;
    }

    const nextMap: Record<string, { name: string; category: string | null }> = {};
    for (const item of (itemsData ?? []) as ItemRow[]) {
      nextMap[item.id] = { name: item.name, category: item.category };
    }

    setItemMap(nextMap);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData(dateFrom, dateTo);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [dateFrom, dateTo]);

  const { topItems, usageByWeek, topCategories } = useMemo(() => {
    const itemTotals = new Map<string, TopItemRow>();
    const weekTotals = new Map<string, number>();
    const categoryTotals = new Map<string, number>();

    for (const row of usageRows) {
      const used = Math.abs(Number(row.change_qty || 0));
      if (!Number.isFinite(used) || used <= 0) continue;

      const itemMeta = itemMap[row.item_id] ?? {
        name: row.item_id,
        category: null,
      };

      const existingItem = itemTotals.get(row.item_id);
      if (existingItem) {
        existingItem.total_used += used;
      } else {
        itemTotals.set(row.item_id, {
          item_id: row.item_id,
          item_name: itemMeta.name,
          category: itemMeta.category,
          total_used: used,
        });
      }

      const week = weekStartISO(row.created_at);
      if (week) {
        weekTotals.set(week, (weekTotals.get(week) ?? 0) + used);
      }

      const category = (itemMeta.category || "Uncategorized").trim() || "Uncategorized";
      categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + used);
    }

    const topItemsRows = Array.from(itemTotals.values())
      .sort((a, b) => b.total_used - a.total_used)
      .slice(0, 20);

    const weeklyRows = Array.from(weekTotals.entries())
      .map(([week_start, total_used]) => ({ week_start, total_used }))
      .sort((a, b) => a.week_start.localeCompare(b.week_start));

    const categoryRows = Array.from(categoryTotals.entries())
      .map(([category, total_used]) => ({ category, total_used }))
      .sort((a, b) => b.total_used - a.total_used);

    return {
      topItems: topItemsRows,
      usageByWeek: weeklyRows,
      topCategories: categoryRows,
    };
  }, [usageRows, itemMap]);

  function exportTopItemsCsv() {
    const rows: Array<Array<string | number>> = [
      ["item_name", "total_used", "category"],
      ...topItems.map((row) => [row.item_name, row.total_used, row.category ?? ""]),
    ];
    downloadCsv("inventory_trends_top_items.csv", rows);
  }

  function exportUsageByWeekCsv() {
    const rows: Array<Array<string | number>> = [
      ["week_start", "total_used"],
      ...usageByWeek.map((row) => [row.week_start, row.total_used]),
    ];
    downloadCsv("inventory_trends_usage_by_week.csv", rows);
  }

  function exportTopCategoriesCsv() {
    const rows: Array<Array<string | number>> = [
      ["category", "total_used"],
      ...topCategories.map((row) => [row.category, row.total_used]),
    ];
    downloadCsv("inventory_trends_top_categories.csv", rows);
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>Inventory Trends</h1>
      <div style={{ opacity: 0.75 }}>Usage trends based on inventory usage transactions.</div>

      <div style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
          <Field label="From">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle()} />
          </Field>
          <Field label="To">
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle()} />
          </Field>
          <div>
            <div style={{ fontSize: 13, opacity: 0.72, marginBottom: 6 }}>Run</div>
            <button type="button" onClick={() => void loadData(dateFrom, dateTo)} style={{ ...buttonStyle, width: "100%" }}>
              Apply
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ marginTop: 16, opacity: 0.75 }}>Loading trends...</div>
      ) : errorMessage ? (
        <div style={{ marginTop: 16, ...cardStyle(), color: "#ff9d9d" }}>{errorMessage}</div>
      ) : (
        <>
          <div style={{ marginTop: 16, ...cardStyle() }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>Top Used Items</div>
              <button type="button" onClick={exportTopItemsCsv} style={buttonStyle}>
                Export Top Used CSV
              </button>
            </div>

            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Item</th>
                    <th style={thStyle}>Total Used</th>
                    <th style={thStyle}>Category</th>
                  </tr>
                </thead>
                <tbody>
                  {topItems.length === 0 ? (
                    <tr>
                      <td style={tdStyle} colSpan={3}>No usage data.</td>
                    </tr>
                  ) : (
                    topItems.map((row) => (
                      <tr key={row.item_id}>
                        <td style={tdStyle}>{row.item_name}</td>
                        <td style={tdStyle}>{row.total_used}</td>
                        <td style={tdStyle}>{row.category ?? "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 10 }}>
              <SimpleBarChart rows={topItems} />
            </div>
          </div>

          <div style={{ marginTop: 16, ...cardStyle() }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>Usage by Week</div>
              <button type="button" onClick={exportUsageByWeekCsv} style={buttonStyle}>
                Export Usage by Week CSV
              </button>
            </div>

            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Week Start</th>
                    <th style={thStyle}>Total Used</th>
                  </tr>
                </thead>
                <tbody>
                  {usageByWeek.length === 0 ? (
                    <tr>
                      <td style={tdStyle} colSpan={2}>No weekly usage data.</td>
                    </tr>
                  ) : (
                    usageByWeek.map((row) => (
                      <tr key={row.week_start}>
                        <td style={tdStyle}>{row.week_start}</td>
                        <td style={tdStyle}>{row.total_used}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 10 }}>
              <SimpleLineChart rows={usageByWeek} />
            </div>
          </div>

          <div style={{ marginTop: 16, ...cardStyle() }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>Top Categories</div>
              <button type="button" onClick={exportTopCategoriesCsv} style={buttonStyle}>
                Export Top Categories CSV
              </button>
            </div>

            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Category</th>
                    <th style={thStyle}>Total Used</th>
                  </tr>
                </thead>
                <tbody>
                  {topCategories.length === 0 ? (
                    <tr>
                      <td style={tdStyle} colSpan={2}>No category usage data.</td>
                    </tr>
                  ) : (
                    topCategories.map((row) => (
                      <tr key={row.category}>
                        <td style={tdStyle}>{row.category}</td>
                        <td style={tdStyle}>{row.total_used}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 13, opacity: 0.72, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
