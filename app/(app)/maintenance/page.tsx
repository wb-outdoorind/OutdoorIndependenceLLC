"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import OpsClient from "@/app/(app)/ops/OpsClient";
import { readRoleViewOverride, resolveEffectiveRole, type AppRole } from "@/lib/roleView";

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

type EntityScope = "All" | "Vehicles" | "Equipment";

type QueueItem = {
  id: string;
  entityType: "vehicle" | "equipment";
  entityId: string;
  createdAt: string;
  requestDate: string;
  status: RequestStatus;
  urgency: Urgency;
  systemAffected: SystemAffected;
  drivabilityStatus: DrivabilityStatus;
  title: string;
};

type VehicleRequestRow = {
  id: string;
  vehicle_id: string;
  created_at: string;
  status: string | null;
  urgency: string | null;
  system_affected: string | null;
  drivability: string | null;
  description: string | null;
};

type EquipmentRequestRow = {
  id: string;
  equipment_id: string;
  created_at: string;
  status: string | null;
  urgency: string | null;
  system_affected: string | null;
  drivability: string | null;
  description: string | null;
};

type VehicleMetaRow = {
  id: string;
  name: string | null;
  type: string | null;
};

type EquipmentMetaRow = {
  id: string;
  name: string | null;
  equipment_type: string | null;
};

type StatusTab = "Open" | "In Progress" | "Closed";
type MaintenanceSection = "queue" | "operations";
type Role = AppRole;

type GradeRow = {
  score: number | null;
  submitted_at: string;
  submitted_by: string | null;
};

type ProfileRoleRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

type TeammateOpsMetrics = {
  daily: number;
  weekly: number;
  monthly: number;
  ytd: number;
  formCount: number;
};

function urgencyRank(u: Urgency): number {
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

function asStatus(v: string | null): RequestStatus {
  if (v === "Open" || v === "In Progress" || v === "Closed") return v;
  return "Open";
}

function asUrgency(v: string | null): Urgency {
  if (v === "Low" || v === "Medium" || v === "High" || v === "Urgent") return v;
  return "Medium";
}

function asSystemAffected(v: string | null): SystemAffected {
  if (
    v === "Engine" ||
    v === "Electrical" ||
    v === "Hydraulics" ||
    v === "Tires / Wheels" ||
    v === "Brakes" ||
    v === "Steering" ||
    v === "Body / Frame" ||
    v === "Attachment / Implement" ||
    v === "Other"
  ) {
    return v;
  }
  return "Other";
}

function asDrivability(v: string | null): DrivabilityStatus {
  if (
    v === "Yes – Drivable" ||
    v === "Limited – Operate with caution" ||
    v === "No – Out of Service"
  ) {
    return v;
  }
  return "Yes – Drivable";
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

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek() {
  const d = startOfToday();
  const day = d.getDay();
  const diffToMonday = (day + 6) % 7;
  d.setDate(d.getDate() - diffToMonday);
  return d;
}

function startOfMonth() {
  const d = startOfToday();
  d.setDate(1);
  return d;
}

function startOfYear() {
  const d = startOfToday();
  d.setMonth(0, 1);
  return d;
}

function averageScoreFromRows(rows: GradeRow[]) {
  if (!rows.length) return 0;
  const total = rows.reduce((sum, row) => sum + Number(row.score ?? 0), 0);
  return Math.round(total / rows.length);
}

function normalizedName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export default function MaintenanceCenterPage() {
  const [section, setSection] = useState<MaintenanceSection>(() => {
    if (typeof window === "undefined") return "queue";
    const raw = new URLSearchParams(window.location.search).get("section");
    return raw === "operations" ? "operations" : "queue";
  });
  const [tab, setTab] = useState<StatusTab>("Open");
  const [entityScope, setEntityScope] = useState<EntityScope>("All");
  const [search, setSearch] = useState("");
  const [onlyOutOfService, setOnlyOutOfService] = useState(false);
  const [onlyUrgentHigh, setOnlyUrgentHigh] = useState(false);

  const [rows, setRows] = useState<QueueItem[]>([]);
  const [vehicleMetaMap, setVehicleMetaMap] = useState<Record<string, { name?: string; type?: string }>>({});
  const [equipmentMetaMap, setEquipmentMetaMap] = useState<Record<string, { name?: string; type?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canViewOperations, setCanViewOperations] = useState(false);
  const [userRole, setUserRole] = useState<Role>("employee");
  const [roleResolved, setRoleResolved] = useState(false);
  const [expandedTeamDashboard, setExpandedTeamDashboard] = useState(false);
  const [teammateMetrics, setTeammateMetrics] = useState<TeammateOpsMetrics>({
    daily: 0,
    weekly: 0,
    monthly: 0,
    ytd: 0,
    formCount: 0,
  });
  const [teammateMetricsLoading, setTeammateMetricsLoading] = useState(true);
  const [teammateMetricsError, setTeammateMetricsError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    void (async () => {
      const supabase = createSupabaseBrowser();
      const { data: authData } = await supabase.auth.getUser();
      if (!alive) return;

      if (!authData.user) {
        setCanViewOperations(false);
        setUserRole("employee");
        setRoleResolved(true);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .maybeSingle();

      if (!alive) return;
      const role = resolveEffectiveRole(
        (profile?.role as Role | undefined) ?? "employee",
        readRoleViewOverride()
      ) as Role;
      setUserRole(role);
      setCanViewOperations(
        role === "owner" || role === "operations_manager" || role === "office_admin" || role === "mechanic"
      );
      setRoleResolved(true);
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    void (async () => {
      setTeammateMetricsLoading(true);
      setTeammateMetricsError(null);

      const supabase = createSupabaseBrowser();
      const [gradesRes, profilesRes] = await Promise.all([
        supabase
          .from("form_submission_grades")
          .select("score,submitted_at,submitted_by")
          .order("submitted_at", { ascending: false })
          .limit(4000),
        supabase
          .from("profiles")
          .select("id,full_name,email,role")
          .in("role", ["apprentice", "team_member_1", "team_member_2", "team_lead_1", "team_lead_2"])
          .eq("status", "Active"),
      ]);

      if (!alive) return;
      if (gradesRes.error || profilesRes.error) {
        setTeammateMetricsError(
          gradesRes.error?.message || profilesRes.error?.message || "Failed to load teammate dashboard metrics."
        );
        setTeammateMetricsLoading(false);
        return;
      }

      const grades = (gradesRes.data ?? []) as GradeRow[];
      const teammateProfiles = (profilesRes.data ?? []) as ProfileRoleRow[];

      const allowedNames = new Set<string>();
      for (const profile of teammateProfiles) {
        allowedNames.add(normalizedName(profile.full_name));
        allowedNames.add(normalizedName(profile.email));
        allowedNames.add(normalizedName(profile.id));
      }

      const filtered = grades.filter((row) => allowedNames.has(normalizedName(row.submitted_by)));

      const todayStart = startOfToday();
      const weekStart = startOfWeek();
      const monthStart = startOfMonth();
      const yearStart = startOfYear();

      const dailyRows = filtered.filter((row) => new Date(row.submitted_at) >= todayStart);
      const weeklyRows = filtered.filter((row) => new Date(row.submitted_at) >= weekStart);
      const monthlyRows = filtered.filter((row) => new Date(row.submitted_at) >= monthStart);
      const ytdRows = filtered.filter((row) => new Date(row.submitted_at) >= yearStart);

      setTeammateMetrics({
        daily: averageScoreFromRows(dailyRows),
        weekly: averageScoreFromRows(weeklyRows),
        monthly: averageScoreFromRows(monthlyRows),
        ytd: averageScoreFromRows(ytdRows),
        formCount: filtered.length,
      });
      setTeammateMetricsLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadRequests() {
      const supabase = createSupabaseBrowser();
      setLoading(true);
      setErrorMessage(null);

      const [vehicleRes, equipmentRes, vehicleMetaRes, equipmentMetaRes] = await Promise.all([
        supabase
          .from("maintenance_requests")
          .select("id,vehicle_id,created_at,status,urgency,system_affected,drivability,description")
          .order("created_at", { ascending: false }),
        supabase
          .from("equipment_maintenance_requests")
          .select("id,equipment_id,created_at,status,urgency,system_affected,drivability,description")
          .order("created_at", { ascending: false }),
        supabase.from("vehicles").select("id,name,type"),
        supabase.from("equipment").select("id,name,equipment_type"),
      ]);

      if (!alive) return;

      if (vehicleRes.error || equipmentRes.error || vehicleMetaRes.error || equipmentMetaRes.error) {
        console.error("[maintenance] load error:", {
          vehicleResError: vehicleRes.error,
          equipmentResError: equipmentRes.error,
          vehicleMetaError: vehicleMetaRes.error,
          equipmentMetaError: equipmentMetaRes.error,
        });
        setErrorMessage(
          vehicleRes.error?.message ||
            equipmentRes.error?.message ||
            vehicleMetaRes.error?.message ||
            equipmentMetaRes.error?.message ||
            "Failed to load maintenance queue."
        );
        setRows([]);
        setVehicleMetaMap({});
        setEquipmentMetaMap({});
        setLoading(false);
        return;
      }

      const vehicleItems: QueueItem[] = (vehicleRes.data as VehicleRequestRow[]).map((r) => ({
        id: r.id,
        entityType: "vehicle",
        entityId: r.vehicle_id,
        createdAt: r.created_at,
        requestDate: r.created_at.slice(0, 10),
        status: asStatus(r.status),
        urgency: asUrgency(r.urgency),
        systemAffected: asSystemAffected(r.system_affected),
        drivabilityStatus: asDrivability(r.drivability),
        title: extractTitleFromDescription(r.description, r.system_affected),
      }));

      const equipmentItems: QueueItem[] = (equipmentRes.data as EquipmentRequestRow[]).map((r) => ({
        id: r.id,
        entityType: "equipment",
        entityId: r.equipment_id,
        createdAt: r.created_at,
        requestDate: r.created_at.slice(0, 10),
        status: asStatus(r.status),
        urgency: asUrgency(r.urgency),
        systemAffected: asSystemAffected(r.system_affected),
        drivabilityStatus: asDrivability(r.drivability),
        title: extractTitleFromDescription(r.description, r.system_affected),
      }));

      const vm: Record<string, { name?: string; type?: string }> = {};
      for (const row of (vehicleMetaRes.data as VehicleMetaRow[]) ?? []) {
        vm[row.id] = {
          name: row.name ?? undefined,
          type: row.type ?? undefined,
        };
      }

      const em: Record<string, { name?: string; type?: string }> = {};
      for (const row of (equipmentMetaRes.data as EquipmentMetaRow[]) ?? []) {
        em[row.id] = {
          name: row.name ?? undefined,
          type: row.equipment_type ?? undefined,
        };
      }

      setRows([...vehicleItems, ...equipmentItems]);
      setVehicleMetaMap(vm);
      setEquipmentMetaMap(em);
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
        if (entityScope === "All") return true;
        if (entityScope === "Vehicles") return r.entityType === "vehicle";
        return r.entityType === "equipment";
      })
      .filter((r) => (onlyOutOfService ? r.drivabilityStatus === "No – Out of Service" : true))
      .filter((r) => (onlyUrgentHigh ? r.urgency === "Urgent" || r.urgency === "High" : true))
      .filter((r) => {
        if (!q) return true;

        const meta =
          r.entityType === "vehicle" ? vehicleMetaMap[r.entityId] : equipmentMetaMap[r.entityId];

        const hay = [
          r.id,
          r.entityId,
          r.title,
          r.systemAffected,
          r.urgency,
          r.drivabilityStatus,
          meta?.name ?? "",
          meta?.type ?? "",
          r.entityType,
        ]
          .join(" ")
          .toLowerCase();

        return hay.includes(q);
      })
      .sort((a, b) => {
        const ur = urgencyRank(a.urgency) - urgencyRank(b.urgency);
        if (ur !== 0) return ur;
        const ta = Date.parse(a.createdAt) || 0;
        const tb = Date.parse(b.createdAt) || 0;
        return ta - tb;
      });
  }, [rows, tab, entityScope, search, onlyOutOfService, onlyUrgentHigh, vehicleMetaMap, equipmentMetaMap]);

  const counts = useMemo(() => {
    return {
      open: rows.filter((r) => r.status === "Open").length,
      inProgress: rows.filter((r) => r.status === "In Progress").length,
      closed: rows.filter((r) => r.status === "Closed").length,
    };
  }, [rows]);

  const canViewTeammateOperations =
    userRole === "apprentice" ||
    userRole === "team_member_1" ||
    userRole === "team_member_2" ||
    userRole === "team_lead_1" ||
    userRole === "team_lead_2";

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Maintenance Center</h1>
          <div style={{ opacity: 0.75 }}>
            Queue, analytics, PM planning, downtime, and service performance in one place.
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={() => setSection("queue")}
          style={{
            ...sectionCardStyle,
            border: section === "queue" ? "1px solid rgba(126,255,167,0.45)" : sectionCardStyle.border,
            background: section === "queue" ? "rgba(126,255,167,0.12)" : sectionCardStyle.background,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Request Queue</div>
            {userRole === "apprentice" ? (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 900,
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.08)",
                }}
              >
                View Only
              </span>
            ) : null}
          </div>
          <div style={{ opacity: 0.78, marginTop: 8 }}>Open, in-progress, and closed requests across vehicles and equipment.</div>
        </button>

        <button
          type="button"
          onClick={() => setSection("operations")}
          style={{
            ...sectionCardStyle,
            border: section === "operations" ? "1px solid rgba(126,255,167,0.45)" : sectionCardStyle.border,
            background: section === "operations" ? "rgba(126,255,167,0.12)" : sectionCardStyle.background,
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 18 }}>Administrative Operations Dashboard</div>
          <div style={{ opacity: 0.78, marginTop: 8 }}>PM due, downtime, failure trends, and maintenance performance.</div>
        </button>
      </div>

      {section === "operations" ? (
        <div style={{ marginTop: 16 }}>
          {!roleResolved ? (
            <div style={cardStyle}>Loading operations access...</div>
          ) : canViewOperations ? (
            <>
              <OpsClient embedded title="Administrative Operations Dashboard" />
              <div style={{ marginTop: 12, ...cardStyle }}>
                <button
                  type="button"
                  onClick={() => setExpandedTeamDashboard((prev) => !prev)}
                  style={buttonStyle}
                >
                  Expand dashboard
                </button>
                {expandedTeamDashboard ? (
                  <div style={{ marginTop: 12 }}>
                    <TeammateOperationsDashboard
                      loading={teammateMetricsLoading}
                      error={teammateMetricsError}
                      metrics={teammateMetrics}
                    />
                  </div>
                ) : null}
              </div>
            </>
          ) : canViewTeammateOperations ? (
            <TeammateOperationsDashboard
              loading={teammateMetricsLoading}
              error={teammateMetricsError}
              metrics={teammateMetrics}
            />
          ) : (
            <div style={cardStyle}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Administrative Operations Dashboard Access Required</div>
              <div style={{ opacity: 0.8 }}>
                This section is available to owner, operations manager, office admin, and mechanic roles.
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
        {userRole === "apprentice" ? (
          <div style={{ marginTop: 16, ...cardStyle }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Role Restriction</div>
            <div style={{ opacity: 0.8 }}>
              Apprentice role cannot create maintenance requests or maintenance logs. Use this queue for visibility only.
            </div>
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search unit, title, urgency, etc."
            style={{ ...inputStyle, width: 320, maxWidth: "100%" }}
          />

          <select
            value={entityScope}
            onChange={(e) => setEntityScope(e.target.value as EntityScope)}
            style={{ ...inputStyle, width: 170 }}
          >
            <option value="All">All</option>
            <option value="Vehicles">Vehicles</option>
            <option value="Equipment">Equipment</option>
          </select>

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

      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <TabButton active={tab === "Open"} onClick={() => setTab("Open")}>
          Open ({counts.open})
        </TabButton>
        <TabButton active={tab === "In Progress"} onClick={() => setTab("In Progress")}>
          In Progress ({counts.inProgress})
        </TabButton>
        <TabButton active={tab === "Closed"} onClick={() => setTab("Closed")}>
          Closed ({counts.closed})
        </TabButton>
      </div>

      <div style={{ marginTop: 16, ...cardStyle }}>
        {loading ? (
          <div style={{ opacity: 0.75 }}>Loading maintenance queue...</div>
        ) : errorMessage ? (
          <div style={{ opacity: 0.9, color: "#ff9d9d" }}>{errorMessage}</div>
        ) : filtered.length === 0 ? (
          <div style={{ opacity: 0.75 }}>No requests found for this view.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((r) => {
              const meta =
                r.entityType === "vehicle" ? vehicleMetaMap[r.entityId] : equipmentMetaMap[r.entityId];

              const unitLabel = meta?.name ? `${meta.name} • ${r.entityId}` : r.entityId;
              const kindLabel = r.entityType === "vehicle" ? "Vehicle" : "Equipment";

              const createLogHref =
                r.entityType === "vehicle"
                  ? `/vehicles/${encodeURIComponent(r.entityId)}/forms/maintenance-log?requestId=${encodeURIComponent(r.id)}`
                  : `/equipment/${encodeURIComponent(r.entityId)}/forms/maintenance-log?requestId=${encodeURIComponent(r.id)}`;

              const openUnitHref =
                r.entityType === "vehicle"
                  ? `/vehicles/${encodeURIComponent(r.entityId)}`
                  : `/equipment/${encodeURIComponent(r.entityId)}`;

              return (
                <div key={`${r.entityType}:${r.id}`} style={rowStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 900, marginBottom: 4 }}>{r.title}</div>
                      <div style={{ opacity: 0.8, fontSize: 13, lineHeight: 1.35 }}>
                        <strong>{kindLabel}: {unitLabel}</strong>
                        {meta?.type ? <span> • Type: {meta.type}</span> : null}
                        <span> • {r.systemAffected}</span>
                        <span> • Urgency: {badge(r.urgency)}</span>
                        <span> • Drivability: {badge(r.drivabilityStatus)}</span>
                      </div>
                      <div style={{ opacity: 0.65, fontSize: 12, marginTop: 6 }}>
                        Request Date: <strong>{r.requestDate}</strong> • Created: <strong>{new Date(r.createdAt).toLocaleString()}</strong>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      {userRole !== "apprentice" ? (
                        <Link href={createLogHref} style={buttonStyle}>
                          Create Log
                        </Link>
                      ) : (
                        <span style={{ ...secondaryButtonStyle, opacity: 0.6, cursor: "not-allowed" }}>
                          Log Restricted
                        </span>
                      )}

                      <Link href={openUnitHref} style={secondaryButtonStyle}>
                        Open {kindLabel}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12, fontSize: 12, opacity: 0.65 }}>
        Tip: Work top-to-bottom by urgency for faster turnaround.
      </div>
        </>
      )}
    </main>
  );
}

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

function TeammateOperationsDashboard({
  loading,
  error,
  metrics,
}: {
  loading: boolean;
  error: string | null;
  metrics: TeammateOpsMetrics;
}) {
  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 900, fontSize: 18 }}>Teammate Operations Dashboard</div>
      <div style={{ opacity: 0.78, marginTop: 6 }}>
        Average form scores for apprentice through team lead 2.
      </div>
      {loading ? (
        <div style={{ marginTop: 12, opacity: 0.75 }}>Loading teammate score metrics...</div>
      ) : error ? (
        <div style={{ marginTop: 12, color: "#ff9d9d" }}>{error}</div>
      ) : (
        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
          }}
        >
          <div style={teammateStatCardStyle}>
            <div style={{ opacity: 0.72, fontSize: 12 }}>Today Avg Score</div>
            <div style={{ fontWeight: 900, marginTop: 4, fontSize: 24 }}>{metrics.daily}%</div>
          </div>
          <div style={teammateStatCardStyle}>
            <div style={{ opacity: 0.72, fontSize: 12 }}>Week Avg Score</div>
            <div style={{ fontWeight: 900, marginTop: 4, fontSize: 24 }}>{metrics.weekly}%</div>
          </div>
          <div style={teammateStatCardStyle}>
            <div style={{ opacity: 0.72, fontSize: 12 }}>Month Avg Score</div>
            <div style={{ fontWeight: 900, marginTop: 4, fontSize: 24 }}>{metrics.monthly}%</div>
          </div>
          <div style={teammateStatCardStyle}>
            <div style={{ opacity: 0.72, fontSize: 12 }}>Year To Date Avg Score</div>
            <div style={{ fontWeight: 900, marginTop: 4, fontSize: 24 }}>{metrics.ytd}%</div>
          </div>
          <div style={teammateStatCardStyle}>
            <div style={{ opacity: 0.72, fontSize: 12 }}>Tracked Forms</div>
            <div style={{ fontWeight: 900, marginTop: 4, fontSize: 24 }}>{metrics.formCount}</div>
          </div>
        </div>
      )}
    </div>
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

const sectionCardStyle: React.CSSProperties = {
  textAlign: "left",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
  padding: 16,
  cursor: "pointer",
};

const teammateStatCardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  padding: 12,
  background: "rgba(255,255,255,0.02)",
};
