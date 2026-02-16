"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type Urgency = "Low" | "Medium" | "High" | "Urgent";
type RequestStatus = "Open" | "In Progress" | "Closed";

type IssueIdentifiedDuring =
  | "Pre-Use Inspection"
  | "Post-Use Inspection"
  | "During Operation"
  | "Jobsite Use"
  | "Other";

type DrivabilityStatus =
  | "Yes – Drivable"
  | "Limited – Operate with caution"
  | "No – Out of Service";

type UnitStatus =
  | "Active"
  | "Red Tagged"
  | "Parked in Yard"
  | "On Jobsite"
  | "Other";

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

type TriState = "Yes" | "No" | "Not sure";

function equipmentHoursKey(equipmentId: string) {
  return `equipment:${equipmentId}:hours`;
}

function equipmentNameKey(equipmentId: string) {
  return `equipment:${equipmentId}:name`;
}

function equipmentTypeKey(equipmentId: string) {
  return `equipment:${equipmentId}:type`;
}

function todayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function EquipmentMaintenanceRequestPage() {
  const router = useRouter();
  const params = useParams<{ equipmentID?: string }>();
  const equipmentId = params?.equipmentID ? decodeURIComponent(params.equipmentID) : "";

  const [equipmentName, setEquipmentName] = useState("");
  const [equipmentType, setEquipmentType] = useState("");

  const [requestDate, setRequestDate] = useState(todayYYYYMMDD());
  const [employee, setEmployee] = useState("");
  const [hours, setHours] = useState("");

  const [issueIdentifiedDuring, setIssueIdentifiedDuring] =
    useState<IssueIdentifiedDuring>("During Operation");
  const [drivabilityStatus, setDrivabilityStatus] =
    useState<DrivabilityStatus>("Yes – Drivable");
  const [unitStatus, setUnitStatus] = useState<UnitStatus>("Active");
  const [locationNote, setLocationNote] = useState("");

  const [systemAffected, setSystemAffected] = useState<SystemAffected>("Other");
  const [urgency, setUrgency] = useState<Urgency>("Medium");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [status] = useState<RequestStatus>("Open");
  const [mitigationApplied, setMitigationApplied] = useState<TriState>("Not sure");
  const [affectsNextShift, setAffectsNextShift] = useState<TriState>("Not sure");
  const [downtimeExpected, setDowntimeExpected] = useState<TriState>("Not sure");
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!equipmentId) return;
    if (typeof window === "undefined") return;

    const read = () => {
      setEquipmentName((localStorage.getItem(equipmentNameKey(equipmentId)) ?? "").trim());
      setEquipmentType((localStorage.getItem(equipmentTypeKey(equipmentId)) ?? "").trim());

      const savedHours = localStorage.getItem(equipmentHoursKey(equipmentId));
      const h = savedHours ? Number(savedHours) : NaN;
      if (Number.isFinite(h) && h >= 0) setHours(String(h));
    };

    read();
    const t1 = window.setTimeout(read, 50);
    const t2 = window.setTimeout(read, 250);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [equipmentId]);

  const suggestedTitle = useMemo(() => {
    const base = `${systemAffected}`;
    const end = urgency === "Urgent" ? " (URGENT)" : "";
    return `${base} issue${end}`;
  }, [systemAffected, urgency]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!equipmentId) return alert("Missing equipment ID in the URL.");

    const h = Number(hours);
    if (!requestDate) return alert("Request Date is required.");
    if (!employee.trim()) return alert("Employee is required.");
    if (!Number.isFinite(h) || h < 0) return alert("Enter valid hours.");

    const finalTitle = title.trim() ? title.trim() : suggestedTitle;
    if (!description.trim()) return alert("Description of issue is required.");

    const combinedDescription = [
      `Title: ${finalTitle}`,
      "",
      description.trim(),
      "",
      `Employee: ${employee.trim()}`,
      `Request Date: ${requestDate}`,
      `Hours: ${h}`,
      `Mitigation Applied: ${mitigationApplied}`,
      `Affects Next Shift: ${affectsNextShift}`,
      `Downtime Expected: ${downtimeExpected}`,
      locationNote.trim() ? `Location Note: ${locationNote.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("equipment_maintenance_requests").insert({
      equipment_id: equipmentId,
      status,
      urgency,
      system_affected: systemAffected,
      drivability: drivabilityStatus,
      unit_status: unitStatus,
      issue_identified_during: issueIdentifiedDuring,
      description: combinedDescription,
    });

    if (error) {
      console.error("Equipment maintenance request insert failed:", error);
      setSubmitError(error.message);
      return;
    }

    localStorage.setItem(equipmentHoursKey(equipmentId), String(h));
    router.push(`/equipment/${encodeURIComponent(equipmentId)}`);
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>Equipment Maintenance Request</h1>

      <div style={{ opacity: 0.75, lineHeight: 1.4 }}>
        Equipment ID: <strong>{equipmentId || "(missing)"}</strong>
        {equipmentName ? (
          <>
            {" "}• <strong>{equipmentName}</strong>
          </>
        ) : null}
        <span style={{ marginLeft: 10, opacity: 0.85 }}>
          Type: <strong>{equipmentType || "-"}</strong>
        </span>
      </div>

      {submitError ? (
        <div style={{ marginTop: 12, ...cardStyle(), color: "#ff9d9d", opacity: 0.95 }}>
          Failed to save request: {submitError}
        </div>
      ) : null}

      <form onSubmit={onSubmit} style={{ marginTop: 16 }}>
        <div style={cardStyle()}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>General</div>

          <div style={gridStyle()}>
            <Field label="Request Date *">
              <input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} style={inputStyle()} />
            </Field>

            <Field label="Current Hours *">
              <input value={hours} onChange={(e) => setHours(e.target.value)} inputMode="numeric" placeholder="e.g. 1530" style={inputStyle()} required />
            </Field>

            <Field label="Employee *">
              <input value={employee} onChange={(e) => setEmployee(e.target.value)} placeholder="Employee name" style={inputStyle()} required />
            </Field>
          </div>
        </div>

        <div style={{ marginTop: 16, ...cardStyle() }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Classification</div>

          <div style={gridStyle()}>
            <Field label="Issue Identified During *">
              <select value={issueIdentifiedDuring} onChange={(e) => setIssueIdentifiedDuring(e.target.value as IssueIdentifiedDuring)} style={inputStyle()}>
                <option>Pre-Use Inspection</option>
                <option>Post-Use Inspection</option>
                <option>During Operation</option>
                <option>Jobsite Use</option>
                <option>Other</option>
              </select>
            </Field>

            <Field label="Operational Status *">
              <select value={drivabilityStatus} onChange={(e) => setDrivabilityStatus(e.target.value as DrivabilityStatus)} style={inputStyle()}>
                <option>Yes – Drivable</option>
                <option>Limited – Operate with caution</option>
                <option>No – Out of Service</option>
              </select>
            </Field>

            <Field label="Unit Status *">
              <select value={unitStatus} onChange={(e) => setUnitStatus(e.target.value as UnitStatus)} style={inputStyle()}>
                <option>Active</option>
                <option>Red Tagged</option>
                <option>Parked in Yard</option>
                <option>On Jobsite</option>
                <option>Other</option>
              </select>
            </Field>

            <Field label="Current Location / Notes (optional)">
              <input value={locationNote} onChange={(e) => setLocationNote(e.target.value)} style={inputStyle()} />
            </Field>
          </div>
        </div>

        <div style={{ marginTop: 16, ...cardStyle() }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Issue Details</div>

          <div style={gridStyle()}>
            <Field label="System Affected *">
              <select value={systemAffected} onChange={(e) => setSystemAffected(e.target.value as SystemAffected)} style={inputStyle()}>
                <option>Engine</option>
                <option>Electrical</option>
                <option>Hydraulics</option>
                <option>Tires / Wheels</option>
                <option>Brakes</option>
                <option>Steering</option>
                <option>Body / Frame</option>
                <option>Attachment / Implement</option>
                <option>Other</option>
              </select>
            </Field>

            <Field label="Urgency *">
              <select value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)} style={inputStyle()}>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
                <option>Urgent</option>
              </select>
            </Field>

            <Field label="Title * (auto-suggested)">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={suggestedTitle} style={inputStyle()} />
            </Field>

            <Field label="Mitigation Applied?">
              <select value={mitigationApplied} onChange={(e) => setMitigationApplied(e.target.value as TriState)} style={inputStyle()}>
                <option>Yes</option>
                <option>No</option>
                <option>Not sure</option>
              </select>
            </Field>

            <Field label="Affects Next Shift?">
              <select value={affectsNextShift} onChange={(e) => setAffectsNextShift(e.target.value as TriState)} style={inputStyle()}>
                <option>Yes</option>
                <option>No</option>
                <option>Not sure</option>
              </select>
            </Field>

            <Field label="Downtime Expected?">
              <select value={downtimeExpected} onChange={(e) => setDowntimeExpected(e.target.value as TriState)} style={inputStyle()}>
                <option>Yes</option>
                <option>No</option>
                <option>Not sure</option>
              </select>
            </Field>
          </div>

          <div style={{ marginTop: 12 }}>
            <Field label="Description of Issue *">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={7} style={{ ...inputStyle(), resize: "vertical" }} required />
            </Field>
          </div>
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" style={buttonStyle()}>
            Submit Maintenance Request
          </button>

          <button type="button" onClick={() => router.push(`/equipment/${encodeURIComponent(equipmentId)}`)} style={secondaryButtonStyle()}>
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 13, opacity: 0.72, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function cardStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 16,
    padding: 16,
    background: "rgba(255,255,255,0.03)",
  };
}

function gridStyle(): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  };
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: 10,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.03)",
    color: "inherit",
  };
}

function buttonStyle(): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "inherit",
    fontWeight: 900,
    cursor: "pointer",
  };
}

function secondaryButtonStyle(): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "transparent",
    color: "inherit",
    fontWeight: 800,
    cursor: "pointer",
    opacity: 0.9,
  };
}
