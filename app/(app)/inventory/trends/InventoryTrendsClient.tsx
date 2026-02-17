"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type TrendsView = "overview" | "items" | "categories" | "reference" | "location";

type UsageRow = {
  id: string;
  created_at: string;
  item_id: string;
  change_qty: number;
  reference_type: string | null;
  reference_id: string | null;
  from_location_id: string | null;
  to_location_id: string | null;
};

type ItemRow = {
  id: string;
  name: string;
  category: string | null;
  location_id: string | null;
};

type LocationRow = {
  id: string;
  name: string;
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

type ReferenceRow = {
  reference_type: string;
  reference_id: string;
  total_used: number;
};

type LocationUsageRow = {
  location_label: string;
  total_used: number;
};

function toDateInputValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

function SimpleBarChart({ rows }: { rows: Array<{ key: string; value: number }> }) {
  if (rows.length === 0) return <div style={{ opacity: 0.75 }}>No data.</div>;

  const width = 760;
  const height = 240;
  const pad = 28;
  const shown = rows.slice(0, 10);
  const maxVal = Math.max(...shown.map((r) => r.value), 1);
  const slot = (width - pad * 2) / shown.length;
  const barWidth = Math.max(8, slot * 0.62);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 240, display: "block" }}>
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="rgba(255,255,255,0.35)" />
      {shown.map((row, idx) => {
        const h = (row.value / maxVal) * (height - pad * 2);
        const x = pad + idx * slot + (slot - barWidth) / 2;
        const y = height - pad - h;
        return (
          <rect
            key={row.key}
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
  const [view, setView] = useState<TrendsView>("overview");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateInputValue(d);
  });
  const [dateTo, setDateTo] = useState(() => toDateInputValue(new Date()));

  const [usageRows, setUsageRows] = useState<UsageRow[]>([]);
  const [itemMap, setItemMap] = useState<Record<string, { name: string; category: string | null; location_id: string | null }>>({});
  const [locationMap, setLocationMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadData(from: string, to: string) {
    setLoading(true);
    setErrorMessage(null);

    const supabase = createSupabaseBrowser();

    let query = supabase
      .from("inventory_transactions")
      .select("id,created_at,item_id,change_qty,reference_type,reference_id,from_location_id,to_location_id")
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
      setLocationMap({});
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as UsageRow[];
    setUsageRows(rows);

    const itemIds = Array.from(new Set(rows.map((row) => row.item_id).filter(Boolean)));
    const locationIdsFromRows = Array.from(
      new Set(
        rows
          .flatMap((row) => [row.from_location_id, row.to_location_id])
          .filter((id): id is string => Boolean(id))
      )
    );

    if (itemIds.length === 0) {
      setItemMap({});
      setLocationMap({});
      setLoading(false);
      return;
    }

    const { data: itemsData, error: itemsError } = await supabase
      .from("inventory_items")
      .select("id,name,category,location_id")
      .in("id", itemIds);

    if (itemsError) {
      console.error("[inventory-trends] item lookup error:", itemsError);
      setErrorMessage(itemsError.message || "Failed to load item details.");
      setItemMap({});
      setLocationMap({});
      setLoading(false);
      return;
    }

    const nextItemMap: Record<string, { name: string; category: string | null; location_id: string | null }> = {};
    const locationIdsFromItems: string[] = [];
    for (const item of (itemsData ?? []) as ItemRow[]) {
      nextItemMap[item.id] = { name: item.name, category: item.category, location_id: item.location_id };
      if (item.location_id) locationIdsFromItems.push(item.location_id);
    }

    const allLocationIds = Array.from(new Set([...locationIdsFromRows, ...locationIdsFromItems]));
    if (allLocationIds.length > 0) {
      const { data: locationsData, error: locationsError } = await supabase
        .from("inventory_locations")
        .select("id,name")
        .in("id", allLocationIds);

      if (locationsError) {
        console.error("[inventory-trends] location lookup error:", locationsError);
        setErrorMessage(locationsError.message || "Failed to load location details.");
        setItemMap(nextItemMap);
        setLocationMap({});
        setLoading(false);
        return;
      }

      const nextLocationMap: Record<string, string> = {};
      for (const loc of (locationsData ?? []) as LocationRow[]) {
        nextLocationMap[loc.id] = loc.name;
      }
      setLocationMap(nextLocationMap);
    } else {
      setLocationMap({});
    }

    setItemMap(nextItemMap);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData(dateFrom, dateTo);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [dateFrom, dateTo]);

  const computed = useMemo(() => {
    const itemTotals = new Map<string, TopItemRow>();
    const weekTotals = new Map<string, number>();
    const categoryTotals = new Map<string, number>();
    const refTotals = new Map<string, ReferenceRow>();
    const locationTotals = new Map<string, LocationUsageRow>();

    let totalUsage = 0;
    let locationDataAvailable = false;

    for (const row of usageRows) {
      const used = Math.abs(Number(row.change_qty || 0));
      if (!Number.isFinite(used) || used <= 0) continue;
      totalUsage += used;

      const itemMeta = itemMap[row.item_id] ?? {
        name: row.item_id,
        category: null,
        location_id: null,
      };

      const itemExisting = itemTotals.get(row.item_id);
      if (itemExisting) itemExisting.total_used += used;
      else {
        itemTotals.set(row.item_id, {
          item_id: row.item_id,
          item_name: itemMeta.name,
          category: itemMeta.category,
          total_used: used,
        });
      }

      const week = weekStartISO(row.created_at);
      if (week) weekTotals.set(week, (weekTotals.get(week) ?? 0) + used);

      const category = (itemMeta.category || "Uncategorized").trim() || "Uncategorized";
      categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + used);

      const refType = (row.reference_type || "other").trim() || "other";
      const refId = (row.reference_id || "(none)").trim() || "(none)";
      const refKey = `${refType}::${refId}`;
      const refExisting = refTotals.get(refKey);
      if (refExisting) refExisting.total_used += used;
      else refTotals.set(refKey, { reference_type: refType, reference_id: refId, total_used: used });

      const fromLabel = row.from_location_id
        ? locationMap[row.from_location_id] ?? row.from_location_id
        : itemMeta.location_id
        ? locationMap[itemMeta.location_id] ?? itemMeta.location_id
        : "-";

      if (fromLabel !== "-") {
        locationDataAvailable = true;
        const locKey = fromLabel;
        const locExisting = locationTotals.get(locKey);
        if (locExisting) locExisting.total_used += used;
        else locationTotals.set(locKey, { location_label: fromLabel, total_used: used });
      }
    }

    const topItems = Array.from(itemTotals.values())
      .sort((a, b) => b.total_used - a.total_used)
      .slice(0, 20);

    const usageByWeek = Array.from(weekTotals.entries())
      .map(([week_start, total_used]) => ({ week_start, total_used }))
      .sort((a, b) => a.week_start.localeCompare(b.week_start));

    const topCategories = Array.from(categoryTotals.entries())
      .map(([category, total_used]) => ({ category, total_used }))
      .sort((a, b) => b.total_used - a.total_used);

    const byReference = Array.from(refTotals.values()).sort((a, b) => b.total_used - a.total_used);
    const byLocation = Array.from(locationTotals.values()).sort((a, b) => b.total_used - a.total_used);

    return {
      totalUsage,
      transactionCount: usageRows.length,
      topItems,
      usageByWeek,
      topCategories,
      byReference,
      byLocation,
      locationDataAvailable,
    };
  }, [usageRows, itemMap, locationMap]);

  const itemDrilldown = useMemo(() => {
    if (!selectedItemId) return [] as WeekRow[];
    const totals = new Map<string, number>();
    for (const row of usageRows) {
      if (row.item_id !== selectedItemId) continue;
      const used = Math.abs(Number(row.change_qty || 0));
      if (!Number.isFinite(used) || used <= 0) continue;
      const week = weekStartISO(row.created_at);
      if (!week) continue;
      totals.set(week, (totals.get(week) ?? 0) + used);
    }
    return Array.from(totals.entries())
      .map(([week_start, total_used]) => ({ week_start, total_used }))
      .sort((a, b) => a.week_start.localeCompare(b.week_start));
  }, [usageRows, selectedItemId]);

  const categoryDrilldown = useMemo(() => {
    if (!selectedCategory) return [] as TopItemRow[];
    return computed.topItems.filter(
      (row) => ((row.category || "Uncategorized").trim() || "Uncategorized") === selectedCategory
    );
  }, [computed.topItems, selectedCategory]);

  function exportOverviewCsv() {
    const rows: Array<Array<string | number>> = [
      ["week_start", "total_used"],
      ...computed.usageByWeek.map((row) => [row.week_start, row.total_used]),
    ];
    downloadCsv("inventory_trends_overview.csv", rows);
  }

  function exportItemsCsv() {
    const rows: Array<Array<string | number>> = [
      ["item_name", "total_used", "category"],
      ...computed.topItems.map((row) => [row.item_name, row.total_used, row.category ?? ""]),
    ];
    downloadCsv("inventory_trends_items.csv", rows);
  }

  function exportCategoriesCsv() {
    const rows: Array<Array<string | number>> = [
      ["category", "total_used"],
      ...computed.topCategories.map((row) => [row.category, row.total_used]),
    ];
    downloadCsv("inventory_trends_categories.csv", rows);
  }

  function exportReferenceCsv() {
    const rows: Array<Array<string | number>> = [
      ["reference_type", "reference_id", "total_used"],
      ...computed.byReference.map((row) => [row.reference_type, row.reference_id, row.total_used]),
    ];
    downloadCsv("inventory_trends_by_reference.csv", rows);
  }

  function exportLocationCsv() {
    const rows: Array<Array<string | number>> = [
      ["from_location", "total_used"],
      ...computed.byLocation.map((row) => [row.location_label, row.total_used]),
    ];
    downloadCsv("inventory_trends_by_location.csv", rows);
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

      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {([
          ["overview", "Overview"],
          ["items", "Items"],
          ["categories", "Categories"],
          ["reference", "By Reference"],
          ["location", "By Location"],
        ] as Array<[TrendsView, string]>).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            style={{
              ...buttonStyle,
              background: view === key ? "rgba(126,255,167,0.16)" : "rgba(255,255,255,0.03)",
              border: view === key ? "1px solid rgba(126,255,167,0.45)" : buttonStyle.border,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ marginTop: 16, opacity: 0.75 }}>Loading trends...</div>
      ) : errorMessage ? (
        <div style={{ marginTop: 16, ...cardStyle(), color: "#ff9d9d" }}>{errorMessage}</div>
      ) : (
        <>
          {view === "overview" ? (
            <>
              <div style={{ marginTop: 16, ...cardStyle() }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 900 }}>Overview</div>
                  <button type="button" onClick={exportOverviewCsv} style={buttonStyle}>
                    Export Overview CSV
                  </button>
                </div>
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                  <Metric label="Total Used" value={String(computed.totalUsage)} />
                  <Metric label="Usage Transactions" value={String(computed.transactionCount)} />
                  <Metric label="Distinct Items" value={String(computed.topItems.length)} />
                </div>
              </div>

              <div style={{ marginTop: 16, ...cardStyle() }}>
                <div style={{ fontWeight: 900, marginBottom: 12 }}>Usage by Week</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Week Start</th>
                        <th style={thStyle}>Total Used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {computed.usageByWeek.length === 0 ? (
                        <tr>
                          <td style={tdStyle} colSpan={2}>No weekly usage data.</td>
                        </tr>
                      ) : (
                        computed.usageByWeek.map((row) => (
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
                  <SimpleLineChart rows={computed.usageByWeek} />
                </div>
              </div>

              <div style={{ marginTop: 16, ...cardStyle() }}>
                <div style={{ fontWeight: 900, marginBottom: 12 }}>Top 10 Items</div>
                <SimpleBarChart
                  rows={computed.topItems.slice(0, 10).map((row) => ({ key: row.item_id, value: row.total_used }))}
                />
              </div>
            </>
          ) : null}

          {view === "items" ? (
            <div style={{ marginTop: 16, ...cardStyle() }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 900 }}>Top Used Items</div>
                <button type="button" onClick={exportItemsCsv} style={buttonStyle}>
                  Export Items CSV
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
                    {computed.topItems.length === 0 ? (
                      <tr>
                        <td style={tdStyle} colSpan={3}>No usage data.</td>
                      </tr>
                    ) : (
                      computed.topItems.map((row) => (
                        <tr
                          key={row.item_id}
                          style={{ cursor: "pointer", background: selectedItemId === row.item_id ? "rgba(126,255,167,0.08)" : "transparent" }}
                          onClick={() => setSelectedItemId(row.item_id)}
                        >
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
                <SimpleBarChart
                  rows={computed.topItems.slice(0, 10).map((row) => ({ key: row.item_id, value: row.total_used }))}
                />
              </div>

              {selectedItemId ? (
                <div style={{ marginTop: 14, ...cardStyle() }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>
                    Item Drilldown: {itemMap[selectedItemId]?.name ?? selectedItemId}
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Week Start</th>
                          <th style={thStyle}>Total Used</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itemDrilldown.length === 0 ? (
                          <tr>
                            <td style={tdStyle} colSpan={2}>No weekly data for this item.</td>
                          </tr>
                        ) : (
                          itemDrilldown.map((row) => (
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
                    <SimpleLineChart rows={itemDrilldown} />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {view === "categories" ? (
            <div style={{ marginTop: 16, ...cardStyle() }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 900 }}>Category Totals</div>
                <button type="button" onClick={exportCategoriesCsv} style={buttonStyle}>
                  Export Categories CSV
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
                    {computed.topCategories.length === 0 ? (
                      <tr>
                        <td style={tdStyle} colSpan={2}>No category usage data.</td>
                      </tr>
                    ) : (
                      computed.topCategories.map((row) => (
                        <tr
                          key={row.category}
                          style={{ cursor: "pointer", background: selectedCategory === row.category ? "rgba(126,255,167,0.08)" : "transparent" }}
                          onClick={() => setSelectedCategory(row.category)}
                        >
                          <td style={tdStyle}>{row.category}</td>
                          <td style={tdStyle}>{row.total_used}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 10 }}>
                <SimpleBarChart
                  rows={computed.topCategories.slice(0, 10).map((row) => ({ key: row.category, value: row.total_used }))}
                />
              </div>

              {selectedCategory ? (
                <div style={{ marginTop: 14, ...cardStyle() }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>
                    Top Items in {selectedCategory}
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Item</th>
                          <th style={thStyle}>Total Used</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoryDrilldown.length === 0 ? (
                          <tr>
                            <td style={tdStyle} colSpan={2}>No items in this category for selected range.</td>
                          </tr>
                        ) : (
                          categoryDrilldown.map((row) => (
                            <tr key={row.item_id}>
                              <td style={tdStyle}>{row.item_name}</td>
                              <td style={tdStyle}>{row.total_used}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {view === "reference" ? (
            <div style={{ marginTop: 16, ...cardStyle() }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 900 }}>By Reference</div>
                <button type="button" onClick={exportReferenceCsv} style={buttonStyle}>
                  Export Reference CSV
                </button>
              </div>
              <div style={{ marginTop: 12, overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Reference Type</th>
                      <th style={thStyle}>Reference ID</th>
                      <th style={thStyle}>Total Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {computed.byReference.length === 0 ? (
                      <tr>
                        <td style={tdStyle} colSpan={3}>No reference usage data.</td>
                      </tr>
                    ) : (
                      computed.byReference.map((row) => (
                        <tr key={`${row.reference_type}::${row.reference_id}`}>
                          <td style={tdStyle}>{row.reference_type}</td>
                          <td style={tdStyle}>
                            {row.reference_type === "maintenance_log" ? (
                              <a href="/maintenance" style={{ color: "inherit" }}>
                                {row.reference_id}
                              </a>
                            ) : (
                              row.reference_id
                            )}
                          </td>
                          <td style={tdStyle}>{row.total_used}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {view === "location" ? (
            <div style={{ marginTop: 16, ...cardStyle() }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 900 }}>By Location</div>
                <button type="button" onClick={exportLocationCsv} style={buttonStyle}>
                  Export Location CSV
                </button>
              </div>

              {!computed.locationDataAvailable ? (
                <div style={{ marginTop: 12, opacity: 0.8 }}>
                  Location usage data is not available for this range. To enable accurate location trends, include from/to
                  locations on inventory transactions.
                </div>
              ) : (
                <div style={{ marginTop: 12, overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>From Location</th>
                        <th style={thStyle}>Total Used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {computed.byLocation.map((row) => (
                        <tr key={row.location_label}>
                          <td style={tdStyle}>{row.location_label}</td>
                          <td style={tdStyle}>{row.total_used}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 10 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 18 }}>{value}</div>
    </div>
  );
}
