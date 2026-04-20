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

type PmEventRow = {
  id: string;
  equipment_id: string;
  created_at: string;
  template_id: string | null;
  hours: number | null;
  notes: string | null;
  result: unknown;
};

type ChecklistRow = {
  item: string;
  result: string;
};

type SignatureData = {
  employeeSignature?: string;
  managerSignature?: string;
};

type PrintablePmRecord = {
  id: string;
  equipmentId: string;
  equipmentName: string | null;
  equipmentType: string | null;
  createdAt: string;
  templateId: string | null;
  hours: number | null;
  notes: string;
  summary: string;
  mode: string;
  checklistRows: ChecklistRow[];
  detailRows: Array<{ label: string; value: string }>;
  signatures: SignatureData;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function humanizeKey(value: string) {
  return value
    .replaceAll("_", " ")
    .trim()
    .replace(/\b\w/g, (s) => s.toUpperCase());
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

function signatureValue(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  return { value: trimmed, signed: trimmed.length > 0 };
}

function formatChoiceValue(value: unknown) {
  if (value === "pass") return "Pass";
  if (value === "fail") return "Fail";
  if (value === "na") return "N/A";
  if (value === "pass_with_repairs") return "Pass With Repairs";
  if (value === "fail_out_of_service") return "Fail — Out Of Service";
  if (value === "yes") return "Yes";
  if (value === "no") return "No";
  if (typeof value === "string") return humanizeKey(value);
  return value == null ? "-" : String(value);
}

function parseResult(raw: unknown) {
  if (!raw || typeof raw !== "object") return {} as Record<string, unknown>;
  return raw as Record<string, unknown>;
}

function extractChecklistRows(result: Record<string, unknown>): ChecklistRow[] {
  const mode = typeof result.mode === "string" ? result.mode : "";

  if (mode === "trailer_pm") {
    const trailerPm = result.trailerPm;
    if (!trailerPm || typeof trailerPm !== "object") return [];
    const checks = (trailerPm as { checks?: unknown }).checks;
    if (!checks || typeof checks !== "object") return [];
    return Object.entries(checks as Record<string, unknown>).map(([key, value]) => ({
      item: humanizeKey(key),
      result: formatChoiceValue(value),
    }));
  }

  if (mode === "mower_pm") {
    const mowerPm = result.mowerPm;
    if (!mowerPm || typeof mowerPm !== "object") return [];
    const checks = (mowerPm as { checks?: unknown }).checks;
    if (!checks || typeof checks !== "object") return [];
    return Object.entries(checks as Record<string, unknown>).map(([key, value]) => ({
      item: humanizeKey(key),
      result: formatChoiceValue(value),
    }));
  }

  if (mode === "applicator_pm") {
    const applicatorPm = result.applicatorPm;
    if (!applicatorPm || typeof applicatorPm !== "object") return [];
    const checks = (applicatorPm as { checks?: unknown }).checks;
    if (!checks || typeof checks !== "object") return [];
    return Object.entries(checks as Record<string, unknown>).map(([key, value]) => ({
      item: humanizeKey(key),
      result: formatChoiceValue(value),
    }));
  }

  const responsesRaw = result.responses;
  const responses = responsesRaw && typeof responsesRaw === "object" ? (responsesRaw as Record<string, unknown>) : null;
  const checklistItemsRaw = result.checklistItems;
  const checklistItems = Array.isArray(checklistItemsRaw)
    ? (checklistItemsRaw as Array<{ key?: unknown; label?: unknown }>)
    : [];

  if (checklistItems.length && responses) {
    return checklistItems.map((item, index) => {
      const key = typeof item?.key === "string" && item.key.trim() ? item.key.trim() : `item_${index}`;
      const label =
        typeof item?.label === "string" && item.label.trim() ? item.label.trim() : humanizeKey(key);
      return {
        item: label,
        result: formatChoiceValue(responses[key]),
      };
    });
  }

  return [];
}

function extractDetailRows(result: Record<string, unknown>) {
  const detailRows: Array<{ label: string; value: string }> = [];
  const mode = typeof result.mode === "string" ? result.mode : "template_pm";

  detailRows.push({ label: "PM Mode", value: humanizeKey(mode) });

  if (typeof result.summary === "string" && result.summary.trim()) {
    detailRows.push({ label: "Summary", value: result.summary.trim() });
  }

  if (mode === "trailer_pm") {
    const trailerPm = result.trailerPm && typeof result.trailerPm === "object"
      ? (result.trailerPm as Record<string, unknown>)
      : null;
    if (trailerPm) {
      detailRows.push({ label: "Trailer Type", value: formatChoiceValue(trailerPm.trailerType) });
      detailRows.push({ label: "Inspection Date", value: formatChoiceValue(trailerPm.inspectionDate) });
      detailRows.push({ label: "PM Result", value: formatChoiceValue(trailerPm.trailerPmResult) });
      detailRows.push({ label: "Next PM Due", value: formatChoiceValue(trailerPm.nextPmDueDate) });
      detailRows.push({ label: "Inspector", value: formatChoiceValue(trailerPm.inspector) });
    }
    return detailRows;
  }

  if (mode === "mower_pm") {
    const mowerPm = result.mowerPm && typeof result.mowerPm === "object"
      ? (result.mowerPm as Record<string, unknown>)
      : null;
    if (mowerPm) {
      detailRows.push({ label: "Date", value: formatChoiceValue(mowerPm.date) });
      detailRows.push({ label: "Employee", value: formatChoiceValue(mowerPm.employee) });
      detailRows.push({ label: "Oil Change Needed", value: formatChoiceValue(mowerPm.oilChangeNeeded) });
      detailRows.push({ label: "Belt Change Needed", value: formatChoiceValue(mowerPm.beltChangeNeeded) });
      detailRows.push({ label: "Employee Date", value: formatChoiceValue(mowerPm.employeeDate) });
      detailRows.push({ label: "Lead Date", value: formatChoiceValue(mowerPm.leadDate) });
    }
    return detailRows;
  }

  if (mode === "applicator_pm") {
    const applicatorPm = result.applicatorPm && typeof result.applicatorPm === "object"
      ? (result.applicatorPm as Record<string, unknown>)
      : null;
    if (applicatorPm) {
      detailRows.push({ label: "Date", value: formatChoiceValue(applicatorPm.date) });
      detailRows.push({ label: "PM Result", value: formatChoiceValue(applicatorPm.equipmentPmResult) });
      detailRows.push({ label: "Next PM Due", value: formatChoiceValue(applicatorPm.nextPmDue) });
      detailRows.push({ label: "Inspector", value: formatChoiceValue(applicatorPm.inspectorSignature) });
    }
    return detailRows;
  }

  if (typeof result.templateName === "string" && result.templateName.trim()) {
    detailRows.push({ label: "Template", value: result.templateName.trim() });
  }

  return detailRows;
}

function extractSignatures(result: Record<string, unknown>): SignatureData {
  const mode = typeof result.mode === "string" ? result.mode : "";

  if (mode === "trailer_pm") {
    const trailerPm = result.trailerPm && typeof result.trailerPm === "object"
      ? (result.trailerPm as Record<string, unknown>)
      : null;
    return {
      employeeSignature: typeof trailerPm?.signature === "string" ? trailerPm.signature : "",
      managerSignature: "",
    };
  }

  if (mode === "mower_pm") {
    const mowerPm = result.mowerPm && typeof result.mowerPm === "object"
      ? (result.mowerPm as Record<string, unknown>)
      : null;
    return {
      employeeSignature: typeof mowerPm?.employeeSignature === "string" ? mowerPm.employeeSignature : "",
      managerSignature: typeof mowerPm?.leadSignature === "string" ? mowerPm.leadSignature : "",
    };
  }

  if (mode === "applicator_pm") {
    const applicatorPm = result.applicatorPm && typeof result.applicatorPm === "object"
      ? (result.applicatorPm as Record<string, unknown>)
      : null;
    return {
      employeeSignature:
        typeof applicatorPm?.inspectorSignature === "string" ? applicatorPm.inspectorSignature : "",
      managerSignature: "",
    };
  }

  return { employeeSignature: "", managerSignature: "" };
}

export default function EquipmentPreventativeMaintenancePdfPage() {
  const params = useParams<{ equipmentID: string; eventID: string }>();
  const equipmentId = decodeURIComponent(params.equipmentID);
  const eventId = decodeURIComponent(params.eventID);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<PrintablePmRecord | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError(null);
      const supabase = createSupabaseBrowser();
      const [{ data: eventData, error: eventError }, { data: equipmentData, error: equipmentError }] =
        await Promise.all([
          supabase
            .from("equipment_pm_events")
            .select("id,equipment_id,created_at,template_id,hours,notes,result")
            .eq("id", eventId)
            .eq("equipment_id", equipmentId)
            .maybeSingle(),
          supabase
            .from("equipment")
            .select("id,name,equipment_type")
            .eq("id", equipmentId)
            .maybeSingle(),
        ]);

      if (!active) return;
      if (eventError) {
        setError(eventError.message || "Failed to load preventative maintenance event.");
        setRecord(null);
        setLoading(false);
        return;
      }
      if (!eventData) {
        setError("Preventative maintenance event not found.");
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

      const event = eventData as PmEventRow;
      const equipment = (equipmentData as EquipmentRow | null) ?? null;
      const result = parseResult(event.result);
      const summary =
        typeof result.summary === "string" && result.summary.trim() ? result.summary.trim() : "PM event submitted";
      const mode = typeof result.mode === "string" && result.mode.trim() ? result.mode.trim() : "template_pm";

      setRecord({
        id: event.id,
        equipmentId: event.equipment_id,
        equipmentName: equipment?.name ?? null,
        equipmentType: equipment?.equipment_type ?? null,
        createdAt: event.created_at,
        templateId: event.template_id,
        hours: event.hours,
        notes: event.notes ?? "",
        summary,
        mode,
        checklistRows: extractChecklistRows(result),
        detailRows: extractDetailRows(result),
        signatures: extractSignatures(result),
      });
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [equipmentId, eventId]);

  const backHref = useMemo(
    () =>
      `/equipment/${encodeURIComponent(equipmentId)}/history?focusType=${encodeURIComponent(
        "Preventative Maintenance"
      )}&focusId=${encodeURIComponent(eventId)}`,
    [equipmentId, eventId]
  );

  const metadataItems = useMemo(() => {
    if (!record) return [];
    return [
      {
        label: "Equipment",
        value: record.equipmentName ? `${record.equipmentName} (${record.equipmentId})` : record.equipmentId,
      },
      { label: "Equipment Type", value: record.equipmentType || "-" },
      { label: "PM Mode", value: humanizeKey(record.mode) },
      { label: "Summary", value: record.summary },
      {
        label: "Reading",
        value: typeof record.hours === "number" ? `${record.hours.toLocaleString()} hrs` : "-",
      },
      { label: "Linked Template", value: record.templateId || "-" },
      { label: "Submitted At", value: formatDateTime(record.createdAt) },
    ];
  }, [record]);

  if (loading) {
    return (
      <PrintableDocumentShell
        backHref={backHref}
        backLabel="Back to Equipment History"
        title="Preventative Maintenance PDF View"
        subtitle="Loading completed form..."
        documentId={`PM Event #${eventId}`}
      >
        <div style={sectionBlockStyle()}>Loading preventative maintenance event...</div>
      </PrintableDocumentShell>
    );
  }

  if (error || !record) {
    return (
      <PrintableDocumentShell
        backHref={backHref}
        backLabel="Back to Equipment History"
        title="Preventative Maintenance PDF View"
        subtitle="Unable to load completed form."
        documentId={`PM Event #${eventId}`}
      >
        <div style={{ ...sectionBlockStyle(), color: "#a00000", fontWeight: 700 }}>
          {error || "Preventative maintenance event not found."}
        </div>
      </PrintableDocumentShell>
    );
  }

  const employeeSignature = signatureValue(record.signatures.employeeSignature);
  const managerSignature = signatureValue(record.signatures.managerSignature);

  return (
    <PrintableDocumentShell
      backHref={backHref}
      backLabel="Back to Equipment History"
      title="Equipment Preventative Maintenance Record"
      subtitle="Completed operational form document preview."
      documentId={`PM Event #${record.id}`}
      metadataItems={metadataItems}
      footerNote={`Generated: ${formatDateTime(new Date().toISOString())}`}
    >
      <div className="print-block print-keep-together" style={sectionBlockStyle()}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>PM Event Summary</div>
        <table className="print-checklist-table" style={tableStyle()}>
          <thead>
            <tr>
              <th style={thStyle()}>Field</th>
              <th style={thStyle()}>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdStyle()}>Event ID</td>
              <td style={tdStyle()}>{record.id}</td>
            </tr>
            {record.detailRows.map((row) => (
              <tr key={`${row.label}:${row.value}`}>
                <td style={tdStyle()}>{row.label}</td>
                <td style={tdStyle()}>{row.value || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {record.checklistRows.length > 0 ? (
        <div className="print-block print-section-checklist" style={sectionBlockStyle()}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Checklist Results</div>
          <table className="print-checklist-table" style={tableStyle()}>
            <thead>
              <tr>
                <th style={thStyle()}>Checklist Item</th>
                <th style={{ ...thStyle(), width: 180, textAlign: "right" }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {record.checklistRows.map((row, index) => {
                const rowBg = index % 2 === 0 ? "#ffffff" : "#f6f6f6";
                return (
                  <tr key={`${row.item}:${index}`}>
                    <td style={{ ...tdStyle(), background: rowBg }}>{row.item}</td>
                    <td
                      style={{
                        ...tdStyle(),
                        background: rowBg,
                        fontWeight: 700,
                        textAlign: "right",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.result}
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
