"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

/* =========================
   Shared types (subset)
========================= */

type Urgency = "Low" | "Medium" | "High" | "Urgent";
type RequestStatus = "Open" | "In Progress" | "Closed";
type DrivabilityStatus =
  | "Yes – Drivable"
  | "Limited – Operate with caution"
  | "No – Out of Service";
type SystemAffected =
  | "Engine"
  | "Electrical"
  | "Hydraulics"
  | "Tires / Wheels"
  | "Brakes"
  | "Steering"
  | "Body / Frame"
  | "Attachment / Implement"
  | "Other";

type MaintenanceRequestIndexItem = {
  id: string;
  vehicleId: string;

  createdAt: string; // ISO
  requestDate: string; // yyyy-mm-dd

  status: RequestStatus;
  urgency: Urgency;
  systemAffected: SystemAffected;
  drivabilityStatus: DrivabilityStatus;

  title: string;
  employee?: string;

  maintenanceLogId?: string;
};

type VehicleMeta = {
  name?: string;
  type?: string;
};

type MaintenanceRequestRow = {
  id: string;
  vehicle_id: string;
  created_at: string;
  status: string | null;
  urgency: string | null;
  system_affected: string | null;
  drivability: string | null;
  description: string | null;
};

function urgencyRank(u: Urgency): number {
  // smaller = higher priority in sort
  switch (u) {
    case "Urgent":
      return 0;
    case "High":
      return 1;
    case "Medium":
      return 2;
    case "Low":
      return 3;
    default:
      return 9;
  }
}

function vehicleNameKey(vehicleId: string) {
  return `vehicle:${vehicleId}:name`;
}
function vehicleTypeKey(vehicleId: string) {
  return `vehicle:${vehicleId}:type`;
}

function readVehicleMeta(vehicleId: string): VehicleMeta {
  if (typeof window === "undefined") return {};
  const name = (localStorage.getItem(vehicleNameKey(vehicleId)) ?? "").trim();
  const type = (localStorage.getItem(vehicleTypeKey(vehicleId)) ?? "").trim();
  return {
    name: name || undefined,
    type: type || undefined,
  };
}

type StatusTab = "Open" | "In Progress" | "Closed";

export default function MaintenanceCenterPage() {
  const [tab, setTab] = useState<StatusTab>("Open");
  const [search, setSearch] = useState("");
  const [onlyOutOfService, setOnlyOutOfService] = useState(false);
  const [onlyUrgentHigh, setOnlyUrgentHigh] = useState(false);

  const [rows, setRows] = useState<MaintenanceRequestIndexItem[]>([]);
  const [metaMap, setMetaMap] = useState<Record<string, VehicleMeta>>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadRequests() {
      const supabase = createSupabaseBrowser();
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      console.log("[maintenance] user present:", Boolean(authData.user));
      if (authErr) console.error("[maintenance] auth check error:", authErr);

      setLoading(true);
      setErrorMessage(null);

      const { data, error } = await supabase
        .from("maintenance_requests")
        .select(
          "id,vehicle_id,created_at,status,urgency,system_affected,drivability,description"
        )
        .order("created_at", { ascending: false });

      if (!alive) return;
      if (error || !data) {
        if (error) console.error("[maintenance] load error:", error);
        setErrorMessage(error?.message || "Failed to load maintenance requests.");
        setRows([]);
        setMetaMap({});
        setLoading(false);
        return;
      }

      const mapped: MaintenanceRequestIndexItem[] = (data as MaintenanceRequestRow[]).map(
        (r) => ({
          id: r.id,
          vehicleId: r.vehicle_id,
          createdAt: r.created_at,
          requestDate: r.created_at.slice(0, 10),
          status:
            r.status === "Open" || r.status === "In Progress" || r.status === "Closed"
              ? r.status
              : "Open",
          urgency:
            r.urgency === "Low" ||
            r.urgency === "Medium" ||
            r.urgency === "High" ||
            r.urgency === "Urgent"
              ? r.urgency
              : "Medium",
          systemAffected:
            r.system_affected === "Engine" ||
            r.system_affected === "Electrical" ||
            r.system_affected === "Hydraulics" ||
            r.system_affected === "Tires / Wheels" ||
            r.system_affected === "Brakes" ||
            r.system_affected === "Steering" ||
            r.system_affected === "Body / Frame" ||
            r.system_affected === "Attachment / Implement" ||
            r.system_affected === "Other"
              ? r.system_affected
              : "Other",
          drivabilityStatus:
            r.drivability === "Yes – Drivable" ||
            r.drivability === "Limited – Operate with caution" ||
            r.drivability === "No – Out of Service"
              ? r.drivability
              : "Yes – Drivable",
          title: extractTitleFromDescription(r.description, r.system_affected),
        })
      );

      setRows(mapped);

      const mm: Record<string, VehicleMeta> = {};
      for (const r of mapped) {
        if (!mm[r.vehicleId]) mm[r.vehicleId] = readVehicleMeta(r.vehicleId);
      }
      setMetaMap(mm);
      setLoading(false);
    }

    loadRequests();

    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows
      .filter((r) => r.status === tab)
      .filter((r) => {
        if (!onlyOutOfService) return true;
        return r.drivabilityStatus === "No – Out of Service";
      })
      .filter((r) => {
        if (!onlyUrgentHigh) return true;
        return r.urgency === "Urgent" || r.urgency === "High";
      })
      .filter((r) => {
        if (!q) return true;
        const meta = metaMap[r.vehicleId];
        const hay = [
          r.id,
          r.vehicleId,
          r.title,
          r.employee ?? "",
          r.systemAffected,
          r.urgency,
          r.drivabilityStatus,
          meta?.name ?? "",
          meta?.type ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        // urgent first, then oldest first (createdAt ascending)
        const ur = urgencyRank(a.urgency) - urgencyRank(b.urgency);
        if (ur !== 0) return ur;
        // older first
        const ta = Date.parse(a.createdAt) || 0;
        const tb = Date.parse(b.createdAt) || 0;
        return ta - tb;
      });
  }, [rows, tab, search, onlyOutOfService, onlyUrgentHigh, metaMap]);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Maintenance Center</h1>
          <div style={{ opacity: 0.75 }}>
            Fleet-wide queue for mechanics — Open / In Progress / Closed.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vehicle, title, employee, etc."
            style={{ ...inputStyle, width: 320, maxWidth: "100%" }}
          />
          <label style={{ display: "flex", gap: 8, alignItems: "center", opacity: 0.9 }}>
            <input
              type="checkbox"
              checked={onlyOutOfService}
              onChange={(e) => setOnlyOutOfService(e.target.checked)}
            />
            Out of Service only
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", opacity: 0.9 }}>
            <input
              type="checkbox"
              checked={onlyUrgentHigh}
              onChange={(e) => setOnlyUrgentHigh(e.target.checked)}
            />
            Urgent/High only
          </label>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <TabButton active={tab === "Open"} onClick={() => setTab("Open")}>
          Open ({rows.filter((r) => r.status === "Open").length})
        </TabButton>
        <TabButton active={tab === "In Progress"} onClick={() => setTab("In Progress")}>
          In Progress ({rows.filter((r) => r.status === "In Progress").length})
        </TabButton>
        <TabButton active={tab === "Closed"} onClick={() => setTab("Closed")}>
          Closed ({rows.filter((r) => r.status === "Closed").length})
        </TabButton>
      </div>

      {/* List */}
      <div style={{ marginTop: 16, ...cardStyle }}>
        {loading ? (
          <div style={{ opacity: 0.75 }}>Loading maintenance requests...</div>
        ) : errorMessage ? (
          <div style={{ opacity: 0.9, color: "#ff9d9d" }}>{errorMessage}</div>
        ) : filtered.length === 0 ? (
          <div style={{ opacity: 0.75 }}>No requests found for this view.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((r) => {
              const meta = metaMap[r.vehicleId];
              const vehicleLabel = meta?.name
                ? `${meta.name} • ${r.vehicleId}`
                : r.vehicleId;

              const createLogHref = `/vehicles/${encodeURIComponent(
                r.vehicleId
              )}/maintenance-log?requestId=${encodeURIComponent(r.id)}`;

              const viewVehicleHref = `/vehicles/${encodeURIComponent(r.vehicleId)}`;

              const hasLog = !!r.maintenanceLogId;

              return (
                <div key={r.id} style={rowStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 900, marginBottom: 4 }}>{r.title}</div>
                      <div style={{ opacity: 0.8, fontSize: 13, lineHeight: 1.35 }}>
                        <strong>{vehicleLabel}</strong>
                        {meta?.type ? <span> • Type: {meta.type}</span> : null}
                        <span> • {r.systemAffected}</span>
                        <span> • Urgency: {badge(r.urgency)}</span>
                        <span> • Drivability: {badge(r.drivabilityStatus)}</span>
                      </div>
                      <div style={{ opacity: 0.65, fontSize: 12, marginTop: 6 }}>
                        Request Date: <strong>{r.requestDate}</strong> • Created:{" "}
                        <strong>{new Date(r.createdAt).toLocaleString()}</strong>
                        {r.employee ? (
                          <>
                            {" "}
                            • Employee: <strong>{r.employee}</strong>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      {!hasLog ? (
                        <Link href={createLogHref} style={buttonStyle}>
                          Create Log
                        </Link>
                      ) : (
                        <Link
                          href={`/vehicles/${encodeURIComponent(r.vehicleId)}`}
                          style={{ ...buttonStyle, opacity: 0.95 }}
                          title="Log already created; open vehicle to view history/log"
                        >
                          View Log (via Vehicle)
                        </Link>
                      )}

                      <Link href={viewVehicleHref} style={secondaryButtonStyle}>
                        Open Vehicle
                      </Link>
                    </div>
                  </div>

                  {hasLog ? (
                    <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                      Linked Log ID: <strong>{r.maintenanceLogId}</strong>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12, fontSize: 12, opacity: 0.65 }}>
        Tip: Mechanic can bookmark this page and work from top to bottom by urgency.
      </div>
    </main>
  );
}

function extractTitleFromDescription(
  description: string | null,
  systemAffected: string | null
) {
  if (description) {
    const firstLine = description.split("\n")[0]?.trim();
    if (firstLine?.startsWith("Title:")) {
      const parsed = firstLine.slice("Title:".length).trim();
      if (parsed) return parsed;
    }
  }
  return systemAffected?.trim() ? `${systemAffected} issue` : "Maintenance Request";
}

/* ---------------- UI bits ---------------- */

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...secondaryButtonStyle,
        background: active ? "rgba(255,255,255,0.10)" : "transparent",
        opacity: active ? 1 : 0.85,
        fontWeight: active ? 900 : 800,
      }}
    >
      {children}
    </button>
  );
}

function badge(text: string) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 8px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.16)",
        background: "rgba(255,255,255,0.05)",
        marginLeft: 6,
      }}
    >
      {text}
    </span>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 16,
  padding: 16,
  background: "rgba(255,255,255,0.03)",
};

const rowStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 14,
  padding: 14,
  background: "rgba(255,255,255,0.02)",
};

const inputStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  fontWeight: 900,
  textDecoration: "none",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "transparent",
  color: "inherit",
  fontWeight: 800,
  opacity: 0.9,
  textDecoration: "none",
};
