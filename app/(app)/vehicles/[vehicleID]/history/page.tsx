"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

/* =========================
   Types
========================= */

type Choice = "pass" | "fail" | "na";

type TripInspectionRecord = {
  id: string;
  createdAt: string;
  mileage?: number;

  // old + new compatible
  defectsFound?: boolean;
  notes?: string;

  // new fields (from shared InspectionForm)
  type?: "pre-trip" | "post-trip";
  inspectionDate?: string; // yyyy-mm-dd
  employee?: string;
  inspectionStatus?: "Pass" | "Fail - Maintenance Required" | "Out of Service";

  // detailed section results (if present)
  sections?: Record<
    string,
    {
      applicable: boolean;
      name?: string;
      items: Record<string, Choice>;
    }
  >;

  // post-trip only
  exiting?: Record<string, Choice>;
};

type InspectionRow = {
  id: string;
  created_at: string;
  vehicle_id: string;
  inspection_type: string;
  checklist: unknown;
  overall_status: string | null;
  mileage: number | null;
};

type VehiclePMRecord = {
  id: string;
  vehicleId: string;
  createdAt: string;
  mileage: number;
  oilChangePerformed: boolean;
  notes?: string;
};

type RequestStatus = "Open" | "In Progress" | "Closed";
type Urgency = "Low" | "Medium" | "High" | "Urgent";

type MaintenanceRequestRecord = {
  id: string;
  vehicleId: string;
  createdAt: string;
  requestDate?: string;

  // compatibility (old)
  mileage?: number;
  title: string;
  status: RequestStatus;
  priority?: string;
  notes?: string;

  // new
  employee?: string;
  issueIdentifiedDuring?: string;
  drivabilityStatus?: string;
  unitStatus?: string;
  locationNote?: string;

  systemAffected?: string;
  urgency?: Urgency;

  description?: string;
  mitigationApplied?: string;
  affectsNextShift?: string;
  downtimeExpected?: string;
};

type MaintenanceRequestRow = {
  id: string;
  vehicle_id: string;
  created_at: string;
  status: string | null;
  urgency: string | null;
  system_affected: string | null;
  drivability: string | null;
  issue_identified_during: string | null;
  unit_status: string | null;
  description: string | null;
};


type MaintenanceLogRecord = {
  id: string;
  createdAt: string;
  mileage?: number;
  statusUpdate?: string;
  notes?: string;
};

type MaintenanceLogRow = {
  id: string;
  created_at: string;
  mileage: number | null;
  status_update: string | null;
  notes: string | null;
  vehicle_id: string;
};

type TimelineType =
  | "Pre-Trip"
  | "Post-Trip"
  | "Vehicle PM"
  | "Maintenance Log"
  | "Maintenance Request";

type TimelineItem = {
  id: string;
  type: TimelineType;
  createdAt: string; // ISO
  mileage?: number;
  title: string;
  subtitle?: string;
  notes?: string;
};

type FilterValue = "All" | TimelineType;

function vehiclePmKey(vehicleId: string) {
  return `vehicle:${vehicleId}:vehicle_pm`;
}

/* =========================
   Helpers
========================= */

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function badgeStyle(type: TimelineType): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.04)",
    fontWeight: 800,
  };

  if (type === "Vehicle PM")
    return { ...base, border: "1px solid rgba(0,255,120,0.22)", background: "rgba(0,255,120,0.08)" };

  if (type === "Pre-Trip")
    return { ...base, border: "1px solid rgba(100,180,255,0.22)", background: "rgba(100,180,255,0.08)" };

  if (type === "Post-Trip")
    return { ...base, border: "1px solid rgba(160,120,255,0.22)", background: "rgba(160,120,255,0.08)" };

  if (type === "Maintenance Request")
    return { ...base, border: "1px solid rgba(255,210,0,0.26)", background: "rgba(255,210,0,0.10)" };

  // Maintenance Log (default fallback)
  return { ...base, border: "1px solid rgba(170,170,255,0.22)", background: "rgba(170,170,255,0.06)" };
}

function cardStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 16,
    padding: 16,
    background: "rgba(255,255,255,0.03)",
  };
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderRadius: 999,
    border: active ? "1px solid rgba(255,255,255,0.26)" : "1px solid rgba(255,255,255,0.14)",
    background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 800,
  };
}

function failSummaryFromSections(sections?: TripInspectionRecord["sections"]) {
  if (!sections) return "";

  const labels: Record<string, string> = {
    truck: "Truck",
    trailer: "Trailer",
    plow: "Plow",
    salter: "Salter",
    skid_loader: "Skid/Loader",
  };

  const parts: string[] = [];

  for (const [secId, sec] of Object.entries(sections)) {
    if (!sec?.applicable) continue;

    let fails = 0;
    for (const v of Object.values(sec.items || {})) if (v === "fail") fails++;

    if (fails > 0) parts.push(`${labels[secId] ?? secId}(${fails})`);
  }

  return parts.length ? `Fails: ${parts.join(", ")}` : "";
}

function hasInspectionFailures(
  sections?: TripInspectionRecord["sections"],
  exiting?: TripInspectionRecord["exiting"]
) {
  if (sections) {
    for (const sec of Object.values(sections)) {
      if (!sec?.applicable) continue;
      for (const v of Object.values(sec.items || {})) if (v === "fail") return true;
    }
  }
  if (exiting) {
    for (const v of Object.values(exiting)) if (v === "fail") return true;
  }
  return false;
}

function parseChecklist(value: unknown): Partial<TripInspectionRecord> {
  if (!value || typeof value !== "object") return {};
  return value as Partial<TripInspectionRecord>;
}

/* =========================
   Page
========================= */

export default function VehicleHistoryPage() {
  const params = useParams<{ vehicleID: string }>();
  const vehicleId = decodeURIComponent(params.vehicleID);

  const [filter, setFilter] = useState<FilterValue>("All");
  const [inspectionRows, setInspectionRows] = useState<TripInspectionRecord[]>([]);
  const [requestRows, setRequestRows] = useState<MaintenanceRequestRecord[]>([]);
  const [logRows, setLogRows] = useState<MaintenanceLogRecord[]>([]);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [logError, setLogError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadInspections() {
      const supabase = createSupabaseBrowser();
      setInspectionError(null);

      const { data, error } = await supabase
        .from("inspections")
        .select("id,created_at,vehicle_id,inspection_type,checklist,overall_status,mileage")
        .eq("vehicle_id", params.vehicleID)
        .order("created_at", { ascending: false });

      if (!alive) return;
      if (error || !data) {
        if (error) console.error("[vehicle-history] inspections load error:", error);
        setInspectionError(error?.message || "Failed to load inspections.");
        setInspectionRows([]);
        return;
      }

      const mapped = (data as InspectionRow[]).map((r) => {
        const checklist = parseChecklist(r.checklist);
        return {
          id: r.id,
          createdAt: r.created_at,
          mileage: r.mileage ?? undefined,
          type: r.inspection_type === "Post-Trip" ? "post-trip" : "pre-trip",
          inspectionDate: typeof checklist.inspectionDate === "string" ? checklist.inspectionDate : undefined,
          employee: typeof checklist.employee === "string" ? checklist.employee : undefined,
          inspectionStatus:
            r.overall_status === "Pass" ||
            r.overall_status === "Fail - Maintenance Required" ||
            r.overall_status === "Out of Service"
              ? r.overall_status
              : typeof checklist.inspectionStatus === "string"
                ? (checklist.inspectionStatus as TripInspectionRecord["inspectionStatus"])
                : undefined,
          defectsFound:
            typeof checklist.defectsFound === "boolean" ? checklist.defectsFound : undefined,
          notes: typeof checklist.notes === "string" ? checklist.notes : undefined,
          sections: checklist.sections,
          exiting: checklist.exiting,
        } as TripInspectionRecord;
      });

      setInspectionRows(mapped);
    }

    loadInspections();

    return () => {
      alive = false;
    };
  }, [params.vehicleID]);

  useEffect(() => {
    let alive = true;

    async function loadRequests() {
      const supabase = createSupabaseBrowser();
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      console.log("[vehicle-history] user present:", Boolean(authData.user));
      if (authErr) console.error("[vehicle-history] auth check error:", authErr);
      setRequestError(null);

      const { data, error } = await supabase
        .from("maintenance_requests")
        .select(
          "id,vehicle_id,created_at,status,urgency,system_affected,drivability,issue_identified_during,unit_status,description"
        )
        .eq("vehicle_id", params.vehicleID)
        .order("created_at", { ascending: false });

      if (!alive) return;
      if (error || !data) {
        if (error) console.error("[vehicle-history] load error:", error);
        setRequestError(error?.message || "Failed to load maintenance requests.");
        setRequestRows([]);
        return;
      }

      const mapped = (data as MaintenanceRequestRow[]).map((r) => {
        const parsed = parseTitleAndDescription(r.description);
        return {
          id: r.id,
          vehicleId: r.vehicle_id,
          createdAt: r.created_at,
          requestDate: r.created_at.slice(0, 10),
          title: parsed.title || (r.system_affected ? `${r.system_affected} issue` : "Maintenance Request"),
          status:
            r.status === "Open" || r.status === "In Progress" || r.status === "Closed"
              ? r.status
              : "Open",
          urgency:
            r.urgency === "Low" || r.urgency === "Medium" || r.urgency === "High" || r.urgency === "Urgent"
              ? r.urgency
              : undefined,
          systemAffected: r.system_affected ?? undefined,
          drivabilityStatus: r.drivability ?? undefined,
          issueIdentifiedDuring: r.issue_identified_during ?? undefined,
          unitStatus: r.unit_status ?? undefined,
          description: parsed.description || undefined,
        } as MaintenanceRequestRecord;
      });

      setRequestRows(mapped);
    }

    loadRequests();

    return () => {
      alive = false;
    };
  }, [vehicleId, params.vehicleID]);

  useEffect(() => {
    let alive = true;

    async function loadLogs() {
      const supabase = createSupabaseBrowser();
      setLogError(null);

      const { data, error } = await supabase
        .from("maintenance_logs")
        .select("id,created_at,mileage,status_update,notes,vehicle_id")
        .eq("vehicle_id", params.vehicleID)
        .order("created_at", { ascending: false });

      if (!alive) return;
      if (error || !data) {
        if (error) console.error("[vehicle-history] maintenance_logs load error:", error);
        setLogError(error?.message || "Failed to load maintenance logs.");
        setLogRows([]);
        return;
      }

      setLogRows(
        (data as MaintenanceLogRow[]).map((r) => ({
          id: r.id,
          createdAt: r.created_at,
          mileage: r.mileage ?? undefined,
          statusUpdate: r.status_update ?? undefined,
          notes: r.notes ?? undefined,
        }))
      );
    }

    loadLogs();

    return () => {
      alive = false;
    };
  }, [params.vehicleID]);

  const items = useMemo(() => {
    if (typeof window === "undefined") return [] as TimelineItem[];

    const preTrips = inspectionRows.filter((x) => x.type !== "post-trip").map(
      (x): TimelineItem => {
        const defects =
          typeof x.defectsFound === "boolean"
            ? x.defectsFound
            : hasInspectionFailures(x.sections, x.exiting);
        const status = x.inspectionStatus;
        const failSummary = failSummaryFromSections(x.sections);

        return {
          id: x.id,
          type: "Pre-Trip",
          createdAt: x.createdAt,
          mileage: x.mileage,
          title: defects ? "Pre-Trip — Defects Found" : "Pre-Trip — No Defects",
          subtitle: [status ? status : defects ? "Action needed" : "OK", x.employee ? `Driver: ${x.employee}` : null, x.inspectionDate ? `Date: ${x.inspectionDate}` : null, failSummary ? failSummary : null]
            .filter(Boolean)
            .join(" • "),
          notes: x.notes?.trim() ? x.notes : undefined,
        };
      }
    );

    const postTrips = inspectionRows.filter((x) => x.type === "post-trip").map(
      (x): TimelineItem => {
        const defects =
          typeof x.defectsFound === "boolean"
            ? x.defectsFound
            : hasInspectionFailures(x.sections, x.exiting);
        const status = x.inspectionStatus;
        const failSummary = failSummaryFromSections(x.sections);

        return {
          id: x.id,
          type: "Post-Trip",
          createdAt: x.createdAt,
          mileage: x.mileage,
          title: defects ? "Post-Trip — Defects Found" : "Post-Trip — No Defects",
          subtitle: [status ? status : defects ? "Action needed" : "OK", x.employee ? `Driver: ${x.employee}` : null, x.inspectionDate ? `Date: ${x.inspectionDate}` : null, failSummary ? failSummary : null]
            .filter(Boolean)
            .join(" • "),
          notes: x.notes?.trim() ? x.notes : undefined,
        };
      }
    );

    const pms = safeParse<VehiclePMRecord[]>(localStorage.getItem(vehiclePmKey(vehicleId)), []).map(
      (x): TimelineItem => ({
        id: x.id,
        type: "Vehicle PM",
        createdAt: x.createdAt,
        mileage: x.mileage,
        title: x.oilChangePerformed ? "Vehicle PM — Oil Change Performed" : "Vehicle PM",
        subtitle: x.oilChangePerformed ? "Oil life reset" : undefined,
        notes: x.notes?.trim() ? x.notes : undefined,
      })
    );

    const requests = requestRows.map((x): TimelineItem => {
      const pr = x.urgency ?? x.priority; // supports old "priority"
      const details = [
        x.status,
        pr ? String(pr) : null,
        x.systemAffected ? `System: ${x.systemAffected}` : null,
        x.drivabilityStatus ? x.drivabilityStatus : null,
        x.employee ? `Emp: ${x.employee}` : null,
        x.requestDate ? `Date: ${x.requestDate}` : null,
        x.issueIdentifiedDuring ? x.issueIdentifiedDuring : null,
        x.unitStatus ? x.unitStatus : null,
      ]
        .filter(Boolean)
        .join(" • ");

      // prefer long description; fall back to notes (old)
      const noteText =
        (x.description && x.description.trim()) ? x.description.trim() :
        (x.notes && x.notes.trim()) ? x.notes.trim() :
        undefined;

      return {
        id: x.id,
        type: "Maintenance Request",
        createdAt: x.createdAt,
        mileage: x.mileage,
        title: x.title?.trim() ? x.title : "Maintenance Request",
        subtitle: details || undefined,
        notes: noteText,
      };
    });


    const logs = logRows.map(
      (x): TimelineItem => ({
        id: x.id,
        type: "Maintenance Log",
        createdAt: x.createdAt,
        mileage: x.mileage,
        title: "Maintenance Log",
        subtitle: x.statusUpdate,
        notes: x.notes?.trim() ? x.notes : undefined,
      })
    );

    const merged = [...preTrips, ...postTrips, ...pms, ...logs, ...requests].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return merged;
  }, [vehicleId, inspectionRows, requestRows, logRows]);

  const filtered = useMemo(() => {
    if (filter === "All") return items;
    return items.filter((x) => x.type === filter);
  }, [items, filter]);

  return (
    <main style={{ paddingBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Vehicle History</h1>
          <div style={{ marginTop: 6, opacity: 0.75 }}>
            Vehicle ID: <strong>{vehicleId}</strong>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Link
            href={`/vehicles/${encodeURIComponent(vehicleId)}`}
            style={{
              textDecoration: "none",
              color: "inherit",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.04)",
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            ← Back to Vehicle
          </Link>
        </div>
      </div>

      {inspectionError ? (
        <div style={{ marginTop: 12, ...cardStyle(), color: "#ff9d9d", opacity: 0.95 }}>
          {inspectionError}
        </div>
      ) : null}

      {requestError ? (
        <div style={{ marginTop: 12, ...cardStyle(), color: "#ff9d9d", opacity: 0.95 }}>
          {requestError}
        </div>
      ) : null}

      {logError ? (
        <div style={{ marginTop: 12, ...cardStyle(), color: "#ff9d9d", opacity: 0.95 }}>
          {logError}
        </div>
      ) : null}

      {/* Filters */}
      <div style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Filter</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => setFilter("All")} style={chipStyle(filter === "All")}>All</button>
          <button onClick={() => setFilter("Pre-Trip")} style={chipStyle(filter === "Pre-Trip")}>Pre-Trip</button>
          <button onClick={() => setFilter("Post-Trip")} style={chipStyle(filter === "Post-Trip")}>Post-Trip</button>
          <button onClick={() => setFilter("Vehicle PM")} style={chipStyle(filter === "Vehicle PM")}>Vehicle PM</button>
          <button onClick={() => setFilter("Maintenance Request")} style={chipStyle(filter === "Maintenance Request")}>
            Maintenance Requests
          </button>
          <button onClick={() => setFilter("Maintenance Log")} style={chipStyle(filter === "Maintenance Log")}>
            Maintenance Logs
          </button>
        </div>

        <div style={{ marginTop: 10, opacity: 0.7, fontSize: 13 }}>
          Showing <strong>{filtered.length}</strong> item{filtered.length === 1 ? "" : "s"}.
        </div>
      </div>

      {/* Timeline */}
      <div style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Timeline</div>

        {filtered.length === 0 ? (
          <div style={{ opacity: 0.75 }}>
            No history yet. Submit a <strong>Pre-Trip</strong>, <strong>Post-Trip</strong>, <strong>Vehicle PM</strong>,
            or a <strong>Maintenance Log</strong>.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((x) => (
              <div
                key={`${x.type}:${x.id}`}
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 14,
                  padding: 12,
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={badgeStyle(x.type)}>{x.type}</span>
                    <div style={{ fontWeight: 900 }}>{x.title}</div>
                  </div>

                  <div style={{ opacity: 0.75, fontSize: 13 }}>{formatDateTime(x.createdAt)}</div>
                </div>

                <div style={{ marginTop: 6, opacity: 0.82, fontSize: 13 }}>
                  {typeof x.mileage === "number" ? <span>{x.mileage.toLocaleString()} mi</span> : null}
                  {x.subtitle ? <span>{typeof x.mileage === "number" ? " • " : ""}{x.subtitle}</span> : null}
                </div>

                {x.notes ? <div style={{ marginTop: 8, opacity: 0.75, lineHeight: 1.35 }}>{x.notes}</div> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function parseTitleAndDescription(raw: string | null) {
  if (!raw) return { title: "", description: "" };
  const lines = raw.split("\n");
  const firstLine = lines[0]?.trim() ?? "";

  let title = "";
  if (firstLine.startsWith("Title:")) {
    title = firstLine.slice("Title:".length).trim();
  }

  if (lines.length <= 2) return { title, description: raw.trim() };
  const description = lines.slice(2).join("\n").trim();
  return { title, description };
}
