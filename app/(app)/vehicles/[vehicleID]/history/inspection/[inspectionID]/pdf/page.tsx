"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import PrintableDocumentShell from "@/components/forms/PrintableDocumentShell";

type Choice = "pass" | "fail" | "na";

type TripInspectionRecord = {
  id: string;
  createdAt: string;
  vehicleId: string;
  vehicleName: string | null;
  vehicleType: string | null;
  inspectionType: "Pre-Trip" | "Post-Trip";
  mileage: number | null;
  inspectionDate?: string;
  employee?: string;
  submissionStatus?: string;
  leadApprovalStatus?: "not_requested" | "pending" | "approved" | "rejected" | null;
  leadApprovalRequestedAt?: string | null;
  leadApprovedAt?: string | null;
  notes?: string;
  employeeSignature?: string;
  sections?: Record<
    string,
    {
      applicable: boolean;
      name?: string;
      items: Record<string, Choice | string>;
    }
  >;
  exiting?: Record<string, Choice | string>;
};

type InspectionRow = {
  id: string;
  created_at: string;
  vehicle_id: string;
  inspection_type: string;
  checklist: unknown;
  overall_status: string | null;
  mileage: number | null;
  lead_approval_status: "not_requested" | "pending" | "approved" | "rejected" | null;
  lead_approval_requested_at: string | null;
  lead_approved_at: string | null;
};

type VehicleRow = {
  id: string;
  name: string | null;
  type: string | null;
};

const INSPECTION_SECTION_LABELS: Record<string, string> = {
  truck: "Truck Inspection",
  trailer: "Trailer Inspection",
  plow: "Attachment Selection",
  salter: "Salter Selection",
  skid_loader: "Skid / Loader Inspection",
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function normalizeVehicleType(value: string | null | undefined) {
  const type = (value ?? "").trim().toLowerCase();
  if (type === "skidsteer" || type === "skid steer" || type === "skid_steer") return "skidsteer";
  if (type === "loader") return "loader";
  if (type === "car") return "car";
  return "truck";
}

function isHoursBasedVehicleType(value: string | null | undefined) {
  const type = normalizeVehicleType(value);
  return type === "skidsteer" || type === "loader";
}

function humanizeKey(value: string) {
  return value
    .replaceAll("_", " ")
    .trim()
    .replace(/\b\w/g, (s) => s.toUpperCase());
}

function formatChoiceValue(value: string | undefined) {
  if (value === "pass") return "Pass";
  if (value === "fail") return "Fail";
  if (value === "na") return "N/A";
  return value ? humanizeKey(value) : "Not Answered";
}

function parseChecklist(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function labelLeadApprovalStatus(status: TripInspectionRecord["leadApprovalStatus"]) {
  if (status === "pending") return "Pending";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  if (status === "not_requested") return "Not Requested";
  return "Not Requested";
}

function sectionBlockStyle(): React.CSSProperties {
  return {
    border: "1px solid #c1c1c1",
    borderRadius: 8,
    padding: 12,
    display: "grid",
    gap: 9,
  };
}

function checklistTableStyle(): React.CSSProperties {
  return {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 12.5,
  };
}

function thStyle(): React.CSSProperties {
  return {
    border: "1px solid #b9b9b9",
    textAlign: "left",
    padding: "8px 10px",
    background: "#e8e8e8",
    fontWeight: 800,
    fontSize: 12,
  };
}

function tdStyle(): React.CSSProperties {
  return { border: "1px solid #c1c1c1", padding: "7px 10px" };
}

function renderSignature(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  return { value: trimmed, signed: Boolean(trimmed) };
}

function checklistRowBackground(index: number) {
  return index % 2 === 0 ? "#ffffff" : "#f6f6f6";
}

export default function InspectionPdfViewPage() {
  const params = useParams<{ vehicleID: string; inspectionID: string }>();
  const vehicleId = decodeURIComponent(params.vehicleID);
  const inspectionId = decodeURIComponent(params.inspectionID);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inspection, setInspection] = useState<TripInspectionRecord | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError(null);
      const supabase = createSupabaseBrowser();
      const [{ data, error: loadError }, { data: vehicleData, error: vehicleError }] = await Promise.all([
        supabase
          .from("inspections")
          .select(
            "id,created_at,vehicle_id,inspection_type,checklist,overall_status,mileage,lead_approval_status,lead_approval_requested_at,lead_approved_at"
          )
          .eq("id", inspectionId)
          .eq("vehicle_id", vehicleId)
          .maybeSingle(),
        supabase.from("vehicles").select("id,name,type").eq("id", vehicleId).maybeSingle(),
      ]);

      if (!active) return;
      if (loadError) {
        setError(loadError.message || "Failed to load inspection.");
        setInspection(null);
        setLoading(false);
        return;
      }
      if (!data) {
        setError("Inspection not found.");
        setInspection(null);
        setLoading(false);
        return;
      }
      if (vehicleError) {
        setError(vehicleError.message || "Failed to load vehicle details.");
        setInspection(null);
        setLoading(false);
        return;
      }

      const row = data as InspectionRow;
      const vehicle = (vehicleData as VehicleRow | null) ?? null;
      const checklist = parseChecklist(row.checklist);
      const type = row.inspection_type === "Post-Trip" ? "Post-Trip" : "Pre-Trip";

      const mapped: TripInspectionRecord = {
        id: row.id,
        createdAt: row.created_at,
        vehicleId: row.vehicle_id,
        vehicleName: vehicle?.name ?? null,
        vehicleType: vehicle?.type ?? null,
        inspectionType: type,
        mileage: row.mileage,
        inspectionDate: typeof checklist.inspectionDate === "string" ? checklist.inspectionDate : undefined,
        employee: typeof checklist.employee === "string" ? checklist.employee : undefined,
        submissionStatus:
          row.overall_status ||
          (typeof checklist.inspectionStatus === "string" ? checklist.inspectionStatus : undefined),
        leadApprovalStatus: row.lead_approval_status,
        leadApprovalRequestedAt: row.lead_approval_requested_at,
        leadApprovedAt: row.lead_approved_at,
        notes: typeof checklist.notes === "string" ? checklist.notes : undefined,
        employeeSignature:
          typeof checklist.employeeSignature === "string" ? checklist.employeeSignature : undefined,
        sections:
          checklist.sections && typeof checklist.sections === "object"
            ? (checklist.sections as TripInspectionRecord["sections"])
            : undefined,
        exiting:
          checklist.exiting && typeof checklist.exiting === "object"
            ? (checklist.exiting as TripInspectionRecord["exiting"])
            : undefined,
      };

      setInspection(mapped);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [inspectionId, vehicleId]);

  const backHref = useMemo(
    () =>
      `/vehicles/${encodeURIComponent(vehicleId)}/history?focusType=${encodeURIComponent(
        inspection?.inspectionType ?? "Pre-Trip"
      )}&focusId=${encodeURIComponent(inspectionId)}`,
    [inspection?.inspectionType, inspectionId, vehicleId]
  );

  const metadataItems = useMemo(() => {
    if (!inspection) return [];
    const readingUnit = isHoursBasedVehicleType(inspection.vehicleType) ? "hrs" : "mi";
    return [
      {
        label: "Vehicle",
        value: inspection.vehicleName
          ? `${inspection.vehicleName} (${inspection.vehicleId})`
          : inspection.vehicleId,
      },
      { label: "Vehicle Type", value: humanizeKey(normalizeVehicleType(inspection.vehicleType)) },
      { label: "Teammate", value: inspection.employee || "-" },
      { label: "Inspection Date", value: inspection.inspectionDate || "-" },
      { label: "Submitted At", value: formatDateTime(inspection.createdAt) },
      {
        label: "Reading",
        value:
          typeof inspection.mileage === "number"
            ? `${inspection.mileage.toLocaleString()} ${readingUnit}`
            : "-",
      },
      { label: "Submission Status", value: inspection.submissionStatus || "Submitted" },
      { label: "Lead Audit Status", value: labelLeadApprovalStatus(inspection.leadApprovalStatus) },
      {
        label: "Lead Audit Requested",
        value: inspection.leadApprovalRequestedAt ? formatDateTime(inspection.leadApprovalRequestedAt) : "-",
      },
      {
        label: "Lead Audit Completed",
        value: inspection.leadApprovedAt ? formatDateTime(inspection.leadApprovedAt) : "-",
      },
    ];
  }, [inspection]);

  if (loading) {
    return (
      <PrintableDocumentShell
        backHref={backHref}
        backLabel="Back to Vehicle History"
        title="Inspection PDF View"
        subtitle="Loading completed inspection..."
        documentId={`Inspection #${inspectionId}`}
      >
        <div style={sectionBlockStyle()}>Loading inspection...</div>
      </PrintableDocumentShell>
    );
  }

  if (error || !inspection) {
    return (
      <PrintableDocumentShell
        backHref={backHref}
        backLabel="Back to Vehicle History"
        title="Inspection PDF View"
        subtitle="Unable to load completed inspection."
        documentId={`Inspection #${inspectionId}`}
      >
        <div style={{ ...sectionBlockStyle(), color: "#a00000", fontWeight: 700 }}>
          {error || "Inspection not found."}
        </div>
      </PrintableDocumentShell>
    );
  }

  const employeeSignature = renderSignature(inspection.employeeSignature);
  return (
    <PrintableDocumentShell
      backHref={backHref}
      backLabel="Back to Vehicle History"
      title={`${inspection.inspectionType} Inspection Record`}
      subtitle="Completed operational form document preview."
      documentId={`Inspection #${inspection.id}`}
      metadataItems={metadataItems}
      footerNote={`Generated: ${formatDateTime(new Date().toISOString())}`}
    >
      {Object.entries(inspection.sections ?? {})
        .filter(([, section]) => section?.applicable)
        .map(([sectionId, section]) => (
          <div key={sectionId} className="print-block print-section-checklist" style={sectionBlockStyle()}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>
              {INSPECTION_SECTION_LABELS[sectionId] ?? humanizeKey(sectionId)}
            </div>
            {section.name ? (
              <div style={{ fontSize: 12, color: "#333" }}>
                Selection: <strong>{section.name}</strong>
              </div>
            ) : null}
            <table className="print-checklist-table" style={checklistTableStyle()}>
              <thead>
                <tr>
                  <th style={thStyle()}>Checklist Item</th>
                  <th style={{ ...thStyle(), width: 160, textAlign: "right" }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(section.items ?? {}).map(([itemKey, value], index) => {
                  const rowBg = checklistRowBackground(index);
                  return (
                    <tr key={`${sectionId}:${itemKey}`}>
                      <td style={{ ...tdStyle(), background: rowBg }}>{humanizeKey(itemKey)}</td>
                      <td
                        style={{
                          ...tdStyle(),
                          background: rowBg,
                          fontWeight: 700,
                          textAlign: "right",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatChoiceValue(value)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

      {inspection.inspectionType === "Post-Trip" && inspection.exiting ? (
        <div className="print-block print-section-checklist" style={sectionBlockStyle()}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>End-of-Shift Checklist</div>
          <table className="print-checklist-table" style={checklistTableStyle()}>
            <thead>
              <tr>
                <th style={thStyle()}>Checklist Item</th>
                <th style={{ ...thStyle(), width: 160, textAlign: "right" }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(inspection.exiting).map(([itemKey, value], index) => {
                const rowBg = checklistRowBackground(index);
                return (
                  <tr key={`exiting:${itemKey}`}>
                    <td style={{ ...tdStyle(), background: rowBg }}>{humanizeKey(itemKey)}</td>
                    <td
                      style={{
                        ...tdStyle(),
                        background: rowBg,
                        fontWeight: 700,
                        textAlign: "right",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatChoiceValue(value)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="print-block print-notes-block" style={{ ...sectionBlockStyle(), padding: "12px 14px" }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Notes</div>
        <div className="print-notes-content" style={{ whiteSpace: "pre-wrap", lineHeight: 1.45, minHeight: 20 }}>
          {inspection.notes && inspection.notes.trim() ? inspection.notes.trim() : "No notes recorded."}
        </div>
      </div>

      <div
        className="print-block print-signatures-block"
        style={{
          ...sectionBlockStyle(),
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: 16,
          alignItems: "start",
          padding: "12px 14px",
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.03em",
              textTransform: "uppercase",
              color: "#444",
            }}
          >
            Employee Signature
          </div>
          <div
            className="print-signature-line"
            style={{
              borderBottom: "1.5px solid #333",
              minHeight: 24,
              display: "flex",
              alignItems: "flex-end",
              padding: "0 2px 3px",
            }}
          >
            {employeeSignature.signed ? (
              <span style={{ fontWeight: 700, fontStyle: "italic", fontSize: 12.5 }}>
                {employeeSignature.value}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </PrintableDocumentShell>
  );
}
