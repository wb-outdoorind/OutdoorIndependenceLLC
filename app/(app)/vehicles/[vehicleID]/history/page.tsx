"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

/* =========================
   Types
========================= */

type Choice = "pass" | "fail" | "na";

type TripInspectionRecord = {
  id: string;
  vehicleId: string;
  createdAt: string;
  mileage: number;

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
  mileage: number;
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


type MaintenanceLogRecord = {
  id: string;
  vehicleId: string;
  createdAt: string;
  mileage: number;
  title: string;
  status: "Closed" | "In Progress";
  notes: string;
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

/* =========================
   Storage Keys
========================= */

function preTripKey(vehicleId: string) {
  return `vehicle:${vehicleId}:pretrip`;
}

function postTripKey(vehicleId: string) {
  return `vehicle:${vehicleId}:posttrip`;
}

function vehiclePmKey(vehicleId: string) {
  return `vehicle:${vehicleId}:vehicle_pm`;
}

function maintenanceRequestKey(vehicleId: string) {
  return `vehicle:${vehicleId}:maintenance_request`;
}

function maintenanceLogKey(vehicleId: string) {
  return `vehicle:${vehicleId}:maintenance_log`;
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

/* =========================
   Page
========================= */

export default function VehicleHistoryPage({ params }: { params: { vehicleId: string } }) {
  const vehicleId = params.vehicleId;

  const [filter, setFilter] = useState<FilterValue>("All");

  const items = useMemo(() => {
    if (typeof window === "undefined") return [] as TimelineItem[];

    const preTrips = safeParse<TripInspectionRecord[]>(localStorage.getItem(preTripKey(vehicleId)), []).map(
      (x): TimelineItem => {
        const defects = Boolean(x.defectsFound);
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

    const postTrips = safeParse<TripInspectionRecord[]>(localStorage.getItem(postTripKey(vehicleId)), []).map(
      (x): TimelineItem => {
        const defects = Boolean(x.defectsFound);
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

        const requests = safeParse<MaintenanceRequestRecord[]>(
      localStorage.getItem(maintenanceRequestKey(vehicleId)),
      []
    ).map((x): TimelineItem => {
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


    const logs = safeParse<MaintenanceLogRecord[]>(localStorage.getItem(maintenanceLogKey(vehicleId)), []).map(
      (x): TimelineItem => ({
        id: x.id,
        type: "Maintenance Log",
        createdAt: x.createdAt,
        mileage: x.mileage,
        title: x.title?.trim() ? x.title : "Maintenance Log",
        subtitle: x.status,
        notes: x.notes?.trim() ? x.notes : undefined,
      })
    );

    const merged = [...preTrips, ...postTrips, ...pms, ...logs, ...requests].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return merged;
  }, [vehicleId]);

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
