"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type EquipmentRow = {
  id: string;
  name: string | null;
  equipment_type: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  serial_number: string | null;
  license_plate: string | null;
  fuel_type: string | null;
  current_hours: number | null;
  status: string | null;
  external_id: string | null;
};

type MaintenanceRequestPreviewRow = {
  id: string;
  equipment_id: string;
  created_at: string;
  status: string | null;
  urgency: string | null;
  system_affected: string | null;
  description: string | null;
};

type HistoryPreviewItem = {
  createdAt: string;
  title: string;
  status?: string;
  notes?: string;
};

function equipmentNameKey(equipmentId: string) {
  return `equipment:${equipmentId}:name`;
}

function equipmentTypeKey(equipmentId: string) {
  return `equipment:${equipmentId}:type`;
}

function equipmentHoursKey(equipmentId: string) {
  return `equipment:${equipmentId}:hours`;
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

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function cardStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 16,
    padding: 16,
    background: "rgba(255,255,255,0.03)",
  };
}

function pillStyle(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.04)",
    fontSize: 13,
    fontWeight: 800,
    textDecoration: "none",
    color: "inherit",
  };
}

function actionBtnStyle(): React.CSSProperties {
  return {
    textDecoration: "none",
    color: "inherit",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 14,
    padding: 14,
    background: "rgba(255,255,255,0.03)",
    fontWeight: 900,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  };
}

function isTrailerEquipmentType(value: string | null | undefined) {
  return (value ?? "").toLowerCase().includes("trailer");
}

function isMowerEquipmentType(value: string | null | undefined) {
  return (value ?? "").toLowerCase().includes("mower");
}

function isApplicatorEquipmentType(value: string | null | undefined) {
  const v = (value ?? "").toLowerCase();
  return v.includes("applicator") || (v.includes("turf") && v.includes("application"));
}

export default function EquipmentDetailPage() {
  const params = useParams<{ equipmentID: string }>();
  const routeEquipmentId = params.equipmentID;
  const equipmentIdFromRoute = decodeURIComponent(routeEquipmentId);

  const [equipment, setEquipment] = useState<EquipmentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [requestPreviewRows, setRequestPreviewRows] = useState<MaintenanceRequestPreviewRow[]>([]);
  const [requestPreviewError, setRequestPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadEquipment() {
      setLoading(true);
      setErrorMessage(null);

      const supabase = createSupabaseBrowser();
      const { data, error } = await supabase
        .from("equipment")
        .select(
          "id,name,equipment_type,make,model,year,serial_number,license_plate,fuel_type,current_hours,status,external_id"
        )
        .eq("id", equipmentIdFromRoute)
        .maybeSingle();

      if (!alive) return;
      if (error) {
        console.error("[equipment-detail] load error:", error);
        setEquipment(null);
        setErrorMessage(error.message);
        setLoading(false);
        return;
      }

      if (!data) {
        setEquipment(null);
        setErrorMessage(`Equipment not found. Tried id=\"${equipmentIdFromRoute}\"`);
        setLoading(false);
        return;
      }

      const row = data as EquipmentRow;
      localStorage.setItem(equipmentNameKey(row.id), row.name ?? "");
      localStorage.setItem(equipmentTypeKey(row.id), row.equipment_type ?? "");
      if (typeof row.current_hours === "number") {
        localStorage.setItem(equipmentHoursKey(row.id), String(row.current_hours));
      }

      setEquipment(row);
      setLoading(false);
    }

    loadEquipment();

    return () => {
      alive = false;
    };
  }, [equipmentIdFromRoute]);

  useEffect(() => {
    let alive = true;

    async function loadRequestPreview() {
      const supabase = createSupabaseBrowser();
      setRequestPreviewError(null);

      const { data, error } = await supabase
        .from("equipment_maintenance_requests")
        .select("id,equipment_id,created_at,status,urgency,system_affected,description")
        .eq("equipment_id", equipmentIdFromRoute)
        .order("created_at", { ascending: false })
        .limit(4);

      if (!alive) return;
      if (error || !data) {
        if (error) {
          console.error("[equipment-detail] preview load error:", error);
          setRequestPreviewError(error.message);
        }
        setRequestPreviewRows([]);
        return;
      }

      setRequestPreviewRows(data as MaintenanceRequestPreviewRow[]);
    }

    loadRequestPreview();

    return () => {
      alive = false;
    };
  }, [equipmentIdFromRoute]);

  const stableEquipmentId = equipment?.id ?? equipmentIdFromRoute;
  const routeIdForLinks = encodeURIComponent(stableEquipmentId);
  const isTrailerEquipment = isTrailerEquipmentType(equipment?.equipment_type);
  const isMowerEquipment = isMowerEquipmentType(equipment?.equipment_type);
  const isApplicatorEquipment = isApplicatorEquipmentType(equipment?.equipment_type);

  const historyPreview = useMemo<HistoryPreviewItem[]>(() => {
    return requestPreviewRows.map((r) => {
      const parsed = parseTitleAndDescription(r.description);
      return {
        createdAt: r.created_at,
        title:
          parsed.title ||
          (r.system_affected?.trim() ? `${r.system_affected} issue` : "Maintenance Request"),
        status: r.status ?? undefined,
        notes: parsed.description || undefined,
      };
    });
  }, [requestPreviewRows]);

  return (
    <main style={{ padding: 32, maxWidth: 1100, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>{equipment?.name ?? "Equipment"}</h1>
          <div style={{ marginTop: 6, opacity: 0.75 }}>
            Equipment ID: <strong>{stableEquipmentId}</strong>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Link href="/equipment" style={pillStyle()}>
            ← Back to Equipment
          </Link>

          <Link href={`/equipment/${routeIdForLinks}/history`} style={pillStyle()}>
            Full History →
          </Link>
        </div>
      </div>

      {loading ? (
        <div style={{ marginTop: 14, opacity: 0.75 }}>Loading equipment from Supabase...</div>
      ) : errorMessage ? (
        <div
          style={{
            marginTop: 14,
            border: "1px solid rgba(255,80,80,0.30)",
            background: "rgba(255,80,80,0.06)",
            padding: 12,
            borderRadius: 12,
          }}
        >
          <div style={{ fontWeight: 900 }}>Couldn’t load equipment</div>
          <div style={{ opacity: 0.8, marginTop: 6, fontSize: 13 }}>{errorMessage}</div>
        </div>
      ) : null}

      <div style={{ marginTop: 18, ...cardStyle() }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Specs</div>
          <div style={{ opacity: 0.8, fontWeight: 800 }}>{equipment?.status ?? "-"}</div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginTop: 14,
          }}
        >
          <Spec label="Type" value={equipment?.equipment_type ?? "-"} />
          <Spec label="Make" value={equipment?.make ?? "-"} />
          <Spec label="Model" value={equipment?.model ?? "-"} />
          <Spec label="Year" value={typeof equipment?.year === "number" ? String(equipment.year) : "-"} />
          <Spec label="Serial Number" value={equipment?.serial_number ?? "-"} />
          <Spec label="License Plate" value={equipment?.license_plate ?? "-"} />
          <Spec label="Fuel Type" value={equipment?.fuel_type ?? "-"} />
          <Spec
            label="Current Hours"
            value={
              typeof equipment?.current_hours === "number"
                ? equipment.current_hours.toLocaleString()
                : "-"
            }
          />
          <Spec label="External ID" value={equipment?.external_id ?? "-"} />
        </div>
      </div>

      <div style={{ marginTop: 18, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Forms</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
          <Link href={`/equipment/${routeIdForLinks}/forms/maintenance-request`} style={actionBtnStyle()}>
            <span>Maintenance Request</span>
            <span style={{ opacity: 0.75 }}>→</span>
          </Link>

          <Link href={`/equipment/${routeIdForLinks}/forms/maintenance-log`} style={actionBtnStyle()}>
            <span>Maintenance Log</span>
            <span style={{ opacity: 0.75 }}>→</span>
          </Link>

          <Link href={`/equipment/${routeIdForLinks}/forms/preventative-maintenance`} style={actionBtnStyle()}>
            <span>{isTrailerEquipment ? "Trailer PM Inspection" : isMowerEquipment ? "Mower PM Checklist" : isApplicatorEquipment ? "Applicator PM Inspection" : "Preventative Maintenance"}</span>
            <span style={{ opacity: 0.75 }}>→</span>
          </Link>

          <Link href={`/equipment/${routeIdForLinks}/history`} style={actionBtnStyle()}>
            <span>Full History</span>
            <span style={{ opacity: 0.75 }}>→</span>
          </Link>
        </div>
      </div>

      <div style={{ marginTop: 18, ...cardStyle() }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>Recent Maintenance History</div>
          <div style={{ opacity: 0.75, fontSize: 13 }}>Last 4 maintenance requests</div>
        </div>

        <div style={{ marginTop: 12 }}>
          {requestPreviewError ? (
            <div style={{ opacity: 0.9, color: "#ff9d9d" }}>Failed to load maintenance requests preview.</div>
          ) : historyPreview.length === 0 ? (
            <div style={{ opacity: 0.75 }}>No maintenance requests yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {historyPreview.map((r, idx) => (
                <div
                  key={`${r.createdAt}:${idx}`}
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 14,
                    padding: 12,
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 900 }}>{r.title}</div>
                    <div style={{ opacity: 0.75, fontSize: 13 }}>{formatDateTime(r.createdAt)}</div>
                  </div>

                  <div style={{ marginTop: 6, opacity: 0.82, fontSize: 13 }}>{r.status ?? "-"}</div>

                  {r.notes?.trim() ? (
                    <div style={{ marginTop: 8, opacity: 0.75, lineHeight: 1.35 }}>{r.notes}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ opacity: 0.7, fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 900, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}
