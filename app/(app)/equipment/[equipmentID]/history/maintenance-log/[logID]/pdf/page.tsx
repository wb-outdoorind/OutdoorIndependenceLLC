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

type LogRow = {
  id: string;
  equipment_id: string;
  created_at: string;
  request_id: string | null;
  hours: number | null;
  notes: string | null;
  status_update: string | null;
};

type PrintableLog = {
  id: string;
  equipmentId: string;
  equipmentName: string | null;
  equipmentType: string | null;
  createdAt: string;
  requestId: string | null;
  hours: number | null;
  notes: string;
  statusUpdate: string | null;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
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

export default function EquipmentMaintenanceLogPdfPage() {
  const params = useParams<{ equipmentID: string; logID: string }>();
  const equipmentId = decodeURIComponent(params.equipmentID);
  const logId = decodeURIComponent(params.logID);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<PrintableLog | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError(null);
      const supabase = createSupabaseBrowser();
      const [{ data: logData, error: logError }, { data: equipmentData, error: equipmentError }] =
        await Promise.all([
          supabase
            .from("equipment_maintenance_logs")
            .select("id,equipment_id,created_at,request_id,hours,notes,status_update")
            .eq("id", logId)
            .eq("equipment_id", equipmentId)
            .maybeSingle(),
          supabase
            .from("equipment")
            .select("id,name,equipment_type")
            .eq("id", equipmentId)
            .maybeSingle(),
        ]);

      if (!active) return;
      if (logError) {
        setError(logError.message || "Failed to load maintenance log.");
        setRecord(null);
        setLoading(false);
        return;
      }
      if (!logData) {
        setError("Maintenance log not found.");
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

      const row = logData as LogRow;
      const equipment = (equipmentData as EquipmentRow | null) ?? null;
      setRecord({
        id: row.id,
        equipmentId: row.equipment_id,
        equipmentName: equipment?.name ?? null,
        equipmentType: equipment?.equipment_type ?? null,
        createdAt: row.created_at,
        requestId: row.request_id,
        hours: row.hours,
        notes: row.notes ?? "",
        statusUpdate: row.status_update,
      });
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [equipmentId, logId]);

  const backHref = useMemo(
    () =>
      `/equipment/${encodeURIComponent(equipmentId)}/history?focusType=${encodeURIComponent(
        "Maintenance Log"
      )}&focusId=${encodeURIComponent(logId)}`,
    [equipmentId, logId]
  );

  const metadataItems = useMemo(() => {
    if (!record) return [];
    return [
      {
        label: "Equipment",
        value: record.equipmentName ? `${record.equipmentName} (${record.equipmentId})` : record.equipmentId,
      },
      { label: "Equipment Type", value: record.equipmentType || "-" },
      { label: "Status Update", value: record.statusUpdate || "-" },
      { label: "Reading", value: typeof record.hours === "number" ? `${record.hours.toLocaleString()} hrs` : "-" },
      { label: "Linked Request", value: record.requestId || "-" },
      { label: "Submitted At", value: formatDateTime(record.createdAt) },
    ];
  }, [record]);

  if (loading) {
    return (
      <PrintableDocumentShell
        backHref={backHref}
        backLabel="Back to Equipment History"
        title="Maintenance Log PDF View"
        subtitle="Loading completed form..."
        documentId={`Log #${logId}`}
      >
        <div style={sectionBlockStyle()}>Loading maintenance log...</div>
      </PrintableDocumentShell>
    );
  }

  if (error || !record) {
    return (
      <PrintableDocumentShell
        backHref={backHref}
        backLabel="Back to Equipment History"
        title="Maintenance Log PDF View"
        subtitle="Unable to load completed form."
        documentId={`Log #${logId}`}
      >
        <div style={{ ...sectionBlockStyle(), color: "#a00000", fontWeight: 700 }}>
          {error || "Maintenance log not found."}
        </div>
      </PrintableDocumentShell>
    );
  }

  const employeeSignature = signatureValue("");
  const managerSignature = signatureValue("");

  return (
    <PrintableDocumentShell
      backHref={backHref}
      backLabel="Back to Equipment History"
      title="Equipment Maintenance Log Record"
      subtitle="Completed operational form document preview."
      documentId={`Log #${record.id}`}
      metadataItems={metadataItems}
      footerNote={`Generated: ${formatDateTime(new Date().toISOString())}`}
    >
      <div className="print-block print-section-checklist" style={sectionBlockStyle()}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Service Summary</div>
        <table className="print-checklist-table" style={tableStyle()}>
          <thead>
            <tr>
              <th style={thStyle()}>Field</th>
              <th style={thStyle()}>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdStyle()}>Log ID</td>
              <td style={tdStyle()}>{record.id}</td>
            </tr>
            <tr>
              <td style={tdStyle()}>Linked Request ID</td>
              <td style={tdStyle()}>{record.requestId || "-"}</td>
            </tr>
            <tr>
              <td style={tdStyle()}>Status Update</td>
              <td style={tdStyle()}>{record.statusUpdate || "-"}</td>
            </tr>
            <tr>
              <td style={tdStyle()}>Current Hours</td>
              <td style={tdStyle()}>
                {typeof record.hours === "number" ? `${record.hours.toLocaleString()} hrs` : "-"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="print-block print-notes-block" style={{ ...sectionBlockStyle(), padding: "12px 14px" }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Notes</div>
        <div className="print-notes-content" style={{ whiteSpace: "pre-wrap", lineHeight: 1.42, minHeight: 20 }}>
          {record.notes.trim() ? record.notes : "No notes recorded."}
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
