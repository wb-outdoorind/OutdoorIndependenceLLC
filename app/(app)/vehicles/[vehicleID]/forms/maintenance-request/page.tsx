"use client";

import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { confirmLeaveForm, getSignedInDisplayName, useFormExitGuard } from "@/lib/forms";

type Urgency = "Low" | "Medium" | "High" | "Urgent";
type RequestStatus = "Open" | "In Progress" | "Closed";

type IssueIdentifiedDuring =
  | "Pre-Trip Inspection"
  | "Post-Trip Inspection"
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
type VehicleType = "truck" | "car" | "skidsteer" | "loader";

function vehicleMileageKey(vehicleId: string) {
  return `vehicle:${vehicleId}:mileage`;
}
function vehicleTypeKey(vehicleId: string) {
  return `vehicle:${vehicleId}:type`;
}
function vehicleNameKey(vehicleId: string) {
  return `vehicle:${vehicleId}:name`;
}

function isVehicleType(x: string | null): x is VehicleType {
  return x === "truck" || x === "car" || x === "skidsteer" || x === "loader";
}

function todayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function MaintenanceRequestPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useFormExitGuard();

  const prefillIssue = (searchParams.get("issue") || "").trim();
  const prefillIdentifiedDuring = (searchParams.get("identifiedDuring") || "").trim();
  const prefillSystem = (searchParams.get("systemAffected") || "").trim();
  const prefillUrgency = (searchParams.get("urgency") || "").trim();
  const prefillDetails = (searchParams.get("details") || "").trim();

  // ✅ folder: app/(app)/vehicles/[vehicleID]/maintenance-request/page.tsx
  const params = useParams<{ vehicleID?: string }>();
  const vehicleId = params?.vehicleID ? decodeURIComponent(params.vehicleID) : "";

  // Transfer fields from localStorage (written by vehicle list / detail page)
  const [vehicleName, setVehicleName] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("truck");

  const [requestDate, setRequestDate] = useState(todayYYYYMMDD());
  const [employee, setEmployee] = useState("");

  const [issueIdentifiedDuring, setIssueIdentifiedDuring] =
    useState<IssueIdentifiedDuring | "">(
      () => (prefillIdentifiedDuring as IssueIdentifiedDuring) || ""
    );

  const [drivabilityStatus, setDrivabilityStatus] =
    useState<DrivabilityStatus | "">("");

  const [unitStatus, setUnitStatus] = useState<UnitStatus | "">("");
  const [locationNote, setLocationNote] = useState("");

  const [systemAffected, setSystemAffected] = useState<SystemAffected | "">(
    () => (prefillSystem as SystemAffected) || ""
  );
  const [urgency, setUrgency] = useState<Urgency | "">(
    () => (prefillUrgency as Urgency) || ""
  );

  const [title, setTitle] = useState(
    () => (prefillIssue ? `${prefillSystem || "Maintenance"} issue: ${prefillIssue}` : "")
  );
  const [description, setDescription] = useState(() =>
    prefillIssue
      ? [
          `Reported from inspection failed item: ${prefillIssue}`,
          prefillDetails ? `Additional details: ${prefillDetails}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : ""
  );

  const [status] = useState<RequestStatus>("Open");
  const [mileage, setMileage] = useState("");

  const [mitigationApplied, setMitigationApplied] =
    useState<TriState | "">("");
  const [affectsNextShift, setAffectsNextShift] =
    useState<TriState | "">("");
  const [downtimeExpected, setDowntimeExpected] =
    useState<TriState | "">("");

  // ✅ load transfer data safely
  useEffect(() => {
    if (!vehicleId) return;
    if (typeof window === "undefined") return;

    const read = () => {
      const n = localStorage.getItem(vehicleNameKey(vehicleId));
      setVehicleName((n ?? "").trim());

      const t = localStorage.getItem(vehicleTypeKey(vehicleId));
      setVehicleType(isVehicleType(t) ? t : "truck");

      const savedMileage = localStorage.getItem(vehicleMileageKey(vehicleId));
      const m = savedMileage ? Number(savedMileage) : NaN;
      if (Number.isFinite(m) && m > 0) setMileage(String(m));
    };

    read();
    const t1 = window.setTimeout(read, 50);
    const t2 = window.setTimeout(read, 250);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [vehicleId]);

  useEffect(() => {
    void (async () => {
      const name = await getSignedInDisplayName();
      if (!name) return;
      setEmployee((prev) => (prev.trim() ? prev : name));
    })();
  }, []);

  const suggestedTitle = useMemo(() => {
    const base = `${systemAffected}`;
    const end = urgency === "Urgent" ? " (URGENT)" : "";
    return `${base} issue${end}`;
  }, [systemAffected, urgency]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!vehicleId) return alert("Missing vehicle ID in the URL.");

    const m = Number(mileage);
    if (!requestDate) return alert("Request Date is required.");
    if (!employee.trim()) return alert("Teammate is required.");
    if (!Number.isFinite(m) || m <= 0) return alert("Enter a valid mileage.");
    if (!issueIdentifiedDuring) return alert("Issue Identified During is required.");
    if (!drivabilityStatus) return alert("Drivability / Operational Status is required.");
    if (!unitStatus) return alert("Unit Status is required.");
    if (!systemAffected) return alert("System Affected / Issue Type is required.");
    if (!urgency) return alert("Urgency Level is required.");

    const finalTitle = title.trim() ? title.trim() : suggestedTitle;
    if (!finalTitle) return alert("Title is required.");
    if (!description.trim())
      return alert("Description of issue is required.");

    const supabase = createSupabaseBrowser();
    const combinedDescription = [
      `Title: ${finalTitle}`,
      "",
      description.trim(),
      "",
      `Teammate: ${employee.trim()}`,
      `Request Date: ${requestDate}`,
      `Mitigation Applied: ${mitigationApplied}`,
      `Affects Next Shift: ${affectsNextShift}`,
      `Downtime Expected: ${downtimeExpected}`,
      locationNote.trim() ? `Location Note: ${locationNote.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const { data: insertedRequest, error } = await supabase
      .from("maintenance_requests")
      .insert({
        vehicle_id: vehicleId,
        status,
        urgency,
        system_affected: systemAffected,
        drivability: drivabilityStatus,
        unit_status: unitStatus,
        issue_identified_during: issueIdentifiedDuring,
        description: combinedDescription,
      })
      .select("id")
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    localStorage.setItem(vehicleMileageKey(vehicleId), String(m));

    if (insertedRequest?.id) {
      try {
        await fetch("/api/form-reports/grade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            formType: "vehicle_maintenance_request",
            recordId: insertedRequest.id,
          }),
        });
      } catch (gradeError) {
        console.error("Auto grading failed for vehicle maintenance request:", gradeError);
      }
    }

    router.replace(`/vehicles/${encodeURIComponent(vehicleId)}`);
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>Maintenance Request Form</h1>

      <div style={{ opacity: 0.75, lineHeight: 1.4 }}>
        Vehicle ID: <strong>{vehicleId || "(missing)"}</strong>
        {vehicleName ? (
          <>
            {" "}
            • <strong>{vehicleName}</strong>
          </>
        ) : null}
        <span style={{ marginLeft: 10, opacity: 0.85 }}>
          Type: <strong>{vehicleType}</strong>
        </span>
      </div>

      {/* tiny debug so you KNOW the route is being hit */}
      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>
        Route: /vehicles/[vehicleID]/maintenance-request
      </div>

      <div style={{ marginTop: 14, ...cardStyle() }}>
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.35, opacity: 0.92 }}>
          The Maintenance Request Form is used to report any mechanical, safety,
          operational, or equipment-related issue identified during vehicle
          operation, inspections, or normal jobsite use.
        </div>
      </div>

      <form onSubmit={onSubmit} style={{ marginTop: 16 }}>
        {/* General */}
        <div style={cardStyle()}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>General</div>

          <div style={gridStyle()}>
            <Field label="Request Date *">
              <input
                type="date"
                value={requestDate}
                onChange={(e) => setRequestDate(e.target.value)}
                style={inputStyle()}
              />
            </Field>

            <Field label="Mileage *">
              <input
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 130120"
                style={inputStyle()}
                required
              />
            </Field>

            <Field label="Teammate *">
              <input
                value={employee}
                onChange={(e) => setEmployee(e.target.value)}
                placeholder="Teammate name"
                style={inputStyle()}
                required
              />
            </Field>
          </div>
        </div>

        {/* Classification */}
        <div style={{ marginTop: 16, ...cardStyle() }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Classification</div>

          <div style={gridStyle()}>
            <Field label="Issue Identified During *">
              <select
                value={issueIdentifiedDuring}
                onChange={(e) =>
                  setIssueIdentifiedDuring(e.target.value as IssueIdentifiedDuring)
                }
                style={inputStyle()}
              >
                <option value="">Select...</option>
                <option>Pre-Trip Inspection</option>
                <option>Post-Trip Inspection</option>
                <option>During Operation</option>
                <option>Jobsite Use</option>
                <option>Other</option>
              </select>
            </Field>

            <Field label="Drivability / Operational Status *">
              <select
                value={drivabilityStatus}
                onChange={(e) =>
                  setDrivabilityStatus(e.target.value as DrivabilityStatus)
                }
                style={inputStyle()}
              >
                <option value="">Select...</option>
                <option>Yes – Drivable</option>
                <option>Limited – Operate with caution</option>
                <option>No – Out of Service</option>
              </select>
            </Field>

            <Field label="Unit Status *">
              <select
                value={unitStatus}
                onChange={(e) => setUnitStatus(e.target.value as UnitStatus)}
                style={inputStyle()}
              >
                <option value="">Select...</option>
                <option>Active</option>
                <option>Red Tagged</option>
                <option>Parked in Yard</option>
                <option>On Jobsite</option>
                <option>Other</option>
              </select>
            </Field>

            <Field label="Current Location / Notes (optional)">
              <input
                value={locationNote}
                onChange={(e) => setLocationNote(e.target.value)}
                placeholder='e.g. "Back lot by salt pile"'
                style={inputStyle()}
              />
            </Field>
          </div>
        </div>

        {/* Issue Details */}
        <div style={{ marginTop: 16, ...cardStyle() }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Issue Details</div>

          <div style={gridStyle()}>
            <Field label="System Affected / Issue Type *">
              <select
                value={systemAffected}
                onChange={(e) =>
                  setSystemAffected(e.target.value as SystemAffected)
                }
                style={inputStyle()}
              >
                <option value="">Select...</option>
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

            <Field label="Urgency Level *">
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as Urgency)}
                style={inputStyle()}
              >
                <option value="">Select...</option>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
                <option>Urgent</option>
              </select>
            </Field>

            <Field label="Status">
              <input value={status} readOnly style={{ ...inputStyle(), opacity: 0.8 }} />
            </Field>

            <Field label="Title (short summary) *">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={suggestedTitle}
                style={inputStyle()}
              />
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                If left blank, we’ll use: <strong>{suggestedTitle}</strong>
              </div>
            </Field>
          </div>

          <div style={{ marginTop: 12 }}>
            <Field label="Description of Issue *">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                placeholder="Describe symptoms, when it happened, safety concerns, what you observed, etc."
                style={{ ...inputStyle(), resize: "vertical" }}
                required
              />
            </Field>
          </div>
        </div>

        {/* Optional */}
        <div style={{ marginTop: 16, ...cardStyle() }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Optional</div>

          <div style={gridStyle()}>
            <Field label="Temporary Mitigation Applied?">
              <select
                value={mitigationApplied}
                onChange={(e) => setMitigationApplied(e.target.value as TriState)}
                style={inputStyle()}
              >
                <option value="">Select...</option>
                <option>Yes</option>
                <option>No</option>
                <option>Not sure</option>
              </select>
            </Field>

            <Field label="Affects Next Shift?">
              <select
                value={affectsNextShift}
                onChange={(e) => setAffectsNextShift(e.target.value as TriState)}
                style={inputStyle()}
              >
                <option value="">Select...</option>
                <option>Yes</option>
                <option>No</option>
                <option>Not sure</option>
              </select>
            </Field>

            <Field label="Downtime Expected?">
              <select
                value={downtimeExpected}
                onChange={(e) => setDowntimeExpected(e.target.value as TriState)}
                style={inputStyle()}
              >
                <option value="">Select...</option>
                <option>Yes</option>
                <option>No</option>
                <option>Not sure</option>
              </select>
            </Field>
          </div>
        </div>

        {/* Actions */}
        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" style={buttonStyle()}>
            Submit Maintenance Request
          </button>

          <button
            type="button"
            onClick={() => {
              if (!confirmLeaveForm()) return;
              router.replace(`/vehicles/${encodeURIComponent(vehicleId)}`);
            }}
            style={secondaryButtonStyle()}
          >Discard & Return</button>
        </div>
      </form>
    </main>
  );
}

/* ---------- UI helpers ---------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>{label}</div>
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
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
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
    fontWeight: 800,
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
    fontWeight: 700,
    opacity: 0.9,
    cursor: "pointer",
  };
}
