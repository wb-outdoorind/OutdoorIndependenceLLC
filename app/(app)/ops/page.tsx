"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type OpsTab = "Overview" | "PM Due" | "Downtime" | "Failures" | "Performance";

type UnitRow = {
  id: string;
  name: string;
  status: string | null;
};

type RequestRow = {
  id: string;
  created_at: string;
  updated_at: string;
  status: string | null;
  description: string | null;
  vehicle_id?: string | null;
  equipment_id?: string | null;
};

type LowStockRow = {
  quantity: number;
  minimum_quantity: number;
};

function cardStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 16,
    padding: 16,
    background: "rgba(255,255,255,0.03)",
  };
}

function metricStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: 12,
    background: "rgba(255,255,255,0.02)",
  };
}

function daysBetween(from: string, to: string) {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function statusChipStyle(overdue: boolean): React.CSSProperties {
  return {
    borderRadius: 999,
    border: overdue
      ? "1px solid rgba(255,120,120,0.35)"
      : "1px solid rgba(255,230,120,0.35)",
    background: overdue ? "rgba(255,120,120,0.14)" : "rgba(255,230,120,0.12)",
    padding: "4px 9px",
    fontSize: 12,
    fontWeight: 800,
  };
}

export default function OpsPage() {
  const [tab, setTab] = useState<OpsTab>("Overview");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [outOfServiceCount, setOutOfServiceCount] = useState(0);
  const [openRequestCount, setOpenRequestCount] = useState(0);
  const [pmItems, setPmItems] = useState<Array<{ id: string; label: string; created_at: string; overdue: boolean }>>([]);
  const [lowInventoryCount, setLowInventoryCount] = useState(0);
  const [closedLast7Days, setClosedLast7Days] = useState(0);
  const [avgDaysToClose, setAvgDaysToClose] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setErrorMessage(null);

        const supabase = createSupabaseBrowser();

        const [vehiclesRes, equipmentRes, vehicleReqRes, equipmentReqRes, lowInvRes] = await Promise.all([
          supabase.from("vehicles").select("id,name,status"),
          supabase.from("equipment").select("id,name,status"),
          supabase
            .from("maintenance_requests")
            .select("id,vehicle_id,created_at,updated_at,status,description"),
          supabase
            .from("equipment_maintenance_requests")
            .select("id,equipment_id,created_at,updated_at,status,description"),
          supabase
            .from("inventory_items")
            .select("quantity,minimum_quantity")
            .eq("is_active", true),
        ]);

        if (
          vehiclesRes.error ||
          equipmentRes.error ||
          vehicleReqRes.error ||
          equipmentReqRes.error ||
          lowInvRes.error
        ) {
          console.error("[ops] load error:", {
            vehiclesError: vehiclesRes.error,
            equipmentError: equipmentRes.error,
            vehicleRequestsError: vehicleReqRes.error,
            equipmentRequestsError: equipmentReqRes.error,
            lowInventoryError: lowInvRes.error,
          });
          setErrorMessage(
            vehiclesRes.error?.message ||
              equipmentRes.error?.message ||
              vehicleReqRes.error?.message ||
              equipmentReqRes.error?.message ||
              lowInvRes.error?.message ||
              "Failed to load operations overview."
          );
          setLoading(false);
          return;
        }

        const unitRows: UnitRow[] = [
          ...(((vehiclesRes.data ?? []) as UnitRow[]) || []),
          ...(((equipmentRes.data ?? []) as UnitRow[]) || []),
        ];

        const out = unitRows.filter((u) => {
          const s = (u.status ?? "").trim();
          return s === "Red Tagged" || s === "Out of Service";
        }).length;

        const vehicleRequests = (vehicleReqRes.data ?? []) as RequestRow[];
        const equipmentRequests = (equipmentReqRes.data ?? []) as RequestRow[];
        const allRequests = [...vehicleRequests, ...equipmentRequests];

        const openRequests = allRequests.filter((r) => {
          const s = (r.status ?? "").trim();
          return s === "Open" || s === "In Progress";
        });

        const now = Date.now();
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

        const closed = allRequests.filter((r) => (r.status ?? "").trim() === "Closed");
        const closed7 = closed.filter((r) => {
          const t = new Date(r.updated_at).getTime();
          return Number.isFinite(t) && t >= sevenDaysAgo;
        }).length;

        const avgCloseDays = closed.length
          ? closed.reduce((sum, r) => sum + daysBetween(r.created_at, r.updated_at), 0) / closed.length
          : 0;

        const pmLike = openRequests
          .filter((r) => {
            const text = (r.description ?? "").toLowerCase();
            return text.includes("prevent") || text.includes("pm");
          })
          .map((r) => {
            const ageDays = daysBetween(r.created_at, new Date().toISOString());
            const overdue = ageDays > 14;
            const label = r.vehicle_id
              ? `Vehicle ${r.vehicle_id}`
              : r.equipment_id
              ? `Equipment ${r.equipment_id}`
              : "Unit";
            return {
              id: r.id,
              label,
              created_at: r.created_at,
              overdue,
            };
          })
          .sort((a, b) => Number(b.overdue) - Number(a.overdue));

        const lowStock = ((lowInvRes.data ?? []) as LowStockRow[]).filter(
          (row) => Number(row.quantity) <= Number(row.minimum_quantity)
        ).length;

        setOutOfServiceCount(out);
        setOpenRequestCount(openRequests.length);
        setPmItems(pmLike);
        setLowInventoryCount(lowStock);
        setClosedLast7Days(closed7);
        setAvgDaysToClose(Number(avgCloseDays.toFixed(1)));
        setLoading(false);
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const tabs: OpsTab[] = ["Overview", "PM Due", "Downtime", "Failures", "Performance"];

  const overviewCards = useMemo(
    () => [
      { label: "Out of Service Units", value: outOfServiceCount, tone: outOfServiceCount > 0 ? "alert" : "ok" },
      { label: "Open Maintenance Requests", value: openRequestCount, tone: openRequestCount > 0 ? "warn" : "ok" },
      { label: "Low Inventory", value: lowInventoryCount, tone: lowInventoryCount > 0 ? "warn" : "ok" },
    ],
    [outOfServiceCount, openRequestCount, lowInventoryCount]
  );

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>Maintenance Operations</h1>
      <div style={{ opacity: 0.75 }}>Maintenance operations overview and fleet service signals.</div>

      <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              border: tab === t ? "1px solid rgba(126,255,167,0.45)" : "1px solid rgba(255,255,255,0.14)",
              background: tab === t ? "rgba(126,255,167,0.14)" : "rgba(255,255,255,0.03)",
              color: "inherit",
              borderRadius: 12,
              padding: "9px 12px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? <div style={{ marginTop: 16, opacity: 0.75 }}>Loading operations data...</div> : null}
      {errorMessage ? (
        <div style={{ marginTop: 16, ...cardStyle(), color: "#ff9d9d" }}>{errorMessage}</div>
      ) : null}

      {!loading && !errorMessage && tab === "Overview" ? (
        <>
          <div
            style={{
              marginTop: 16,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            {overviewCards.map((card) => (
              <div key={card.label} style={metricStyle()}>
                <div style={{ fontSize: 12, opacity: 0.74 }}>{card.label}</div>
                <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4 }}>{card.value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, ...cardStyle() }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>PM Due / Overdue</div>
            {pmItems.length === 0 ? (
              <div style={{ opacity: 0.75 }}>
                No PM-tagged open requests found. PM requests are inferred from descriptions containing “PM” or “prevent”.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {pmItems.map((pm) => (
                  <div
                    key={pm.id}
                    style={{
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 12,
                      padding: 10,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800 }}>{pm.label}</div>
                      <div style={{ opacity: 0.75, fontSize: 12 }}>
                        Requested: {formatDateTime(pm.created_at)}
                      </div>
                    </div>
                    <div style={statusChipStyle(pm.overdue)}>{pm.overdue ? "Overdue" : "Due"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: 16, ...cardStyle() }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Maintenance Velocity Snapshot</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <div style={metricStyle()}>
                <div style={{ fontSize: 12, opacity: 0.74 }}>Open Request Count</div>
                <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{openRequestCount}</div>
              </div>
              <div style={metricStyle()}>
                <div style={{ fontSize: 12, opacity: 0.74 }}>Closed Last 7 Days</div>
                <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{closedLast7Days}</div>
              </div>
              <div style={metricStyle()}>
                <div style={{ fontSize: 12, opacity: 0.74 }}>Avg Time to Close</div>
                <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{avgDaysToClose} days</div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {!loading && !errorMessage && tab !== "Overview" ? (
        <div style={{ marginTop: 16, ...cardStyle() }}>
          <div style={{ fontWeight: 900 }}>{tab}</div>
          <div style={{ marginTop: 8, opacity: 0.75 }}>
            This tab is ready for detailed operational metrics and workflows.
          </div>
        </div>
      ) : null}
    </main>
  );
}
