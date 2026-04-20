"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import PrintableDocumentShell from "@/components/forms/PrintableDocumentShell";

type EquipmentRow = {
  id: string;
  name: string | null;
  equipment_type: string | null;
};

type RequestRow = {
  id: string;
  equipment_id: string;
  created_at: string;
  status: string | null;
  urgency: string | null;
  system_affected: string | null;
  drivability: string | null;
  issue_identified_during: string | null;
  unit_status: string | null;
  description: string | null;
};

type PrintableRequest = {
  id: string;
  equipmentId: string;
  equipmentName: string | null;
  equipmentType: string | null;
  createdAt: string;
  status: string | null;
  urgency: string | null;
  systemAffected: string | null;
  drivability: string | null;
  issueIdentifiedDuring: string | null;
  unitStatus: string | null;
  title: string;
  narrative: string;
  teammate: string;
  requestDate: string;
  hours: string;
  locationNote: string;
  mitigationApplied: string;
  affectsNextShift: string;
  downtimeExpected: string;
  rawDescription: string;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function parseTitleAndDescription(raw: string | null) {
  if (!raw) return { title: "", description: "" };
  const lines = raw.split("\n");
  const firstLine = lines[0]?.trim() ?? "";
  let title = "";
  if (firstLine.startsWith("Title:")) title = firstLine.slice("Title:".length).trim();
  if (lines.length <= 2) return { title, description: raw.trim() };
  return { title, description: lines.slice(2).join("\n").trim() };
}

function parseFieldValue(raw: string | null, field: string) {
  if (!raw) return "";
  const prefix = `${field}:`;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length).trim();
  }
  return "";
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

function tableStyle(): React.CSSProperties {
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

function signatureValue(value: string) {
  const trimmed = value.trim();
  return { value: trimmed, signed: trimmed.length > 0 };
}

export default function EquipmentMaintenanceRequestPdfPage() {
  const params = useParams<{ equipmentID: string; requestID: string }>();
  const equipmentId = decodeURIComponent(params.equipmentID);
  const requestId = decodeURIComponent(params.requestID);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<PrintableRequest | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError(null);
      const supabase = createSupabaseBrowser();
      const [{ data: requestData, error: requestError }, { data: equipmentData, error: equipmentError }] =
        await Promise.all([
          supabase
            .from("equipment_maintenance_requests")
            .select(
              "id,equipment_id,created_at,status,urgency,system_affected,drivability,issue_identified_during,unit_status,description"
            )
            .eq("id", requestId)
            .eq("equipment_id", equipmentId)
            .maybeSingle(),
          supabase
            .from("equipment")
            .select("id,name,equipment_type")
            .eq("id", equipmentId)
            .maybeSingle(),
        ]);

      if (!active) return;
      if (requestError) {
        setError(requestError.message || "Failed to load request.");
        setRecord(null);
        setLoading(false);
        return;
      }
      if (!requestData) {
        setError("Maintenance request not found.");
        setRecord(null);
        setLoading(false);
        return;
      }
      if (equipmentError) {
        setError(equipmentError.message || "Failed to load equipment details.");
        setRecord(null);
        setLoading(false);
        return;
      }

      const request = requestData as RequestRow;
      const equipment = (equipmentData as EquipmentRow | null) ?? null;
      const parsed = parseTitleAndDescription(request.description);
      const teammate = parseFieldValue(request.description, "Teammate");
      const requestDate = parseFieldValue(request.description, "Request Date");
      const hours = parseFieldValue(request.description, "Hours");
      const locationNote = parseFieldValue(request.description, "Location Note");
      const mitigationApplied = parseFieldValue(request.description, "Mitigation Applied");
      const affectsNextShift = parseFieldValue(request.description, "Affects Next Shift");
      const downtimeExpected = parseFieldValue(request.description, "Downtime Expected");

      setRecord({
        id: request.id,
        equipmentId: request.equipment_id,
        equipmentName: equipment?.name ?? null,
        equipmentType: equipment?.equipment_type ?? null,
        createdAt: request.created_at,
        status: request.status,
        urgency: request.urgency,
        systemAffected: request.system_affected,
        drivability: request.drivability,
        issueIdentifiedDuring: request.issue_identified_during,
        unitStatus: request.unit_status,
        title: parsed.title || (request.system_affected?.trim() ? `${request.system_affected} issue` : "Maintenance Request"),
        narrative: parsed.description,
        teammate,
        requestDate,
        hours,
        locationNote,
        mitigationApplied,
        affectsNextShift,
        downtimeExpected,
        rawDescription: request.description ?? "",
      });
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [equipmentId, requestId]);

  const backHref = useMemo(
    () =>
      `/equipment/${encodeURIComponent(equipmentId)}/history?focusType=${encodeURIComponent(
        "Maintenance Request"
      )}&focusId=${encodeURIComponent(requestId)}`,
    [equipmentId, requestId]
  );

  const metadataItems = useMemo(() => {
    if (!record) return [];
    return [
      {
        label: "Equipment",
        value: record.equipmentName ? `${record.equipmentName} (${record.equipmentId})` : record.equipmentId,
      },
      { label: "Equipment Type", value: record.equipmentType || "-" },
      { label: "Title", value: record.title },
      { label: "Status", value: record.status || "-" },
      { label: "Urgency", value: record.urgency || "-" },
      { label: "System Affected", value: record.systemAffected || "-" },
      { label: "Teammate", value: record.teammate || "-" },
      { label: "Request Date", value: record.requestDate || "-" },
      { label: "Submitted At", value: formatDateTime(record.createdAt) },
      { label: "Reading", value: record.hours ? `${record.hours} hrs` : "-" },
      { label: "Issue Identified During", value: record.issueIdentifiedDuring || "-" },
      { label: "Unit Status", value: record.unitStatus || "-" },
    ];
  }, [record]);

  if (loading) {
    return (
      <PrintableDocumentShell
        backHref={backHref}
        backLabel="Back to Equipment History"
        title="Maintenance Request PDF View"
        subtitle="Loading completed form..."
        documentId={`Request #${requestId}`}
      >
        <div style={sectionBlockStyle()}>Loading maintenance request...</div>
      </PrintableDocumentShell>
    );
  }

  if (error || !record) {
    return (
      <PrintableDocumentShell
        backHref={backHref}
        backLabel="Back to Equipment History"
        title="Maintenance Request PDF View"
        subtitle="Unable to load completed form."
        documentId={`Request #${requestId}`}
      >
        <div style={{ ...sectionBlockStyle(), color: "#a00000", fontWeight: 700 }}>
          {error || "Maintenance request not found."}
        </div>
      </PrintableDocumentShell>
    );
  }

  const employeeSignature = signatureValue(record.teammate);
  const managerSignature = signatureValue("");

  return (
    <PrintableDocumentShell
      backHref={backHref}
      backLabel="Back to Equipment History"
      title="Equipment Maintenance Request Record"
      subtitle="Completed operational form document preview."
      documentId={`Request #${record.id}`}
      metadataItems={metadataItems}
      footerNote={`Generated: ${formatDateTime(new Date().toISOString())}`}
    >
      <div className="print-block print-keep-together" style={sectionBlockStyle()}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Issue Narrative</div>
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.38 }}>
          {record.narrative.trim() ? record.narrative : "No narrative provided."}
        </div>
      </div>

      <div className="print-block print-section-checklist" style={sectionBlockStyle()}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Operational Detail</div>
        <table className="print-checklist-table" style={tableStyle()}>
          <thead>
            <tr>
              <th style={thStyle()}>Field</th>
              <th style={thStyle()}>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdStyle()}>Drivability</td>
              <td style={tdStyle()}>{record.drivability || "-"}</td>
            </tr>
            <tr>
              <td style={tdStyle()}>Location Note</td>
              <td style={tdStyle()}>{record.locationNote || "-"}</td>
            </tr>
            <tr>
              <td style={tdStyle()}>Mitigation Applied</td>
              <td style={tdStyle()}>{record.mitigationApplied || "-"}</td>
            </tr>
            <tr>
              <td style={tdStyle()}>Affects Next Shift</td>
              <td style={tdStyle()}>{record.affectsNextShift || "-"}</td>
            </tr>
            <tr>
              <td style={tdStyle()}>Downtime Expected</td>
              <td style={tdStyle()}>{record.downtimeExpected || "-"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="print-block print-notes-block" style={{ ...sectionBlockStyle(), padding: "12px 14px" }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Notes</div>
        <div className="print-notes-content" style={{ whiteSpace: "pre-wrap", lineHeight: 1.42, minHeight: 20 }}>
          {record.rawDescription.trim() ? record.rawDescription : "No notes recorded."}
        </div>
      </div>

      <div
        className="print-block print-signatures-block"
        style={{
          ...sectionBlockStyle(),
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
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
            Manager Signature
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
            {managerSignature.signed ? (
              <span style={{ fontWeight: 700, fontStyle: "italic", fontSize: 12.5 }}>
                {managerSignature.value}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </PrintableDocumentShell>
  );
}
