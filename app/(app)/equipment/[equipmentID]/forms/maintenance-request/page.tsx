"use client";

import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { loadEquipmentContext } from "@/lib/assetContext";
import { syncEquipmentHoursForward } from "@/lib/assetReadings";
import {
  confirmLeaveForm,
  getSignedInDisplayName,
  requestFormDraftClear,
  UnsavedChangesBanner,
  useFormExitGuard,
  useUnsavedChangesState,
} from "@/lib/forms";
import {
  coerceMaintenanceRequestStatus,
  MAINTENANCE_REQUEST_STATUSES,
  type MaintenanceRequestStatus,
} from "@/lib/maintenanceStatus";
import { readRoleViewOverride, resolveEffectiveRole, type AppRole } from "@/lib/roleView";

type Urgency = "Low" | "Medium" | "High" | "Urgent";
type RequestStatus = MaintenanceRequestStatus;

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
type Role = AppRole;

function todayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

function parseFieldValue(raw: string | null, field: string) {
  if (!raw) return "";
  const prefix = `${field}:`;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim();
    }
  }
  return "";
}

function canEditManagedForms(role: Role | null) {
  return (
    role === "owner" ||
    role === "operations_manager" ||
    role === "office_admin" ||
    role === "mechanic"
  );
}

export default function EquipmentMaintenanceRequestPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isDirty } = useUnsavedChangesState();
  useFormExitGuard(isDirty);
  const params = useParams<{ equipmentID?: string }>();
  const equipmentId = params?.equipmentID ? decodeURIComponent(params.equipmentID) : "";
  const editId = (searchParams.get("editId") || "").trim();
  const rawReturnTo = (searchParams.get("returnTo") || "").trim();
  const returnTo = rawReturnTo.startsWith("/") ? rawReturnTo : "";
  const isEditMode = editId.length > 0;

  const [equipmentName, setEquipmentName] = useState("");
  const [equipmentType, setEquipmentType] = useState("");

  const [requestDate, setRequestDate] = useState(todayYYYYMMDD());
  const [employee, setEmployee] = useState("");
  const [hours, setHours] = useState("");

  const [issueIdentifiedDuring, setIssueIdentifiedDuring] =
    useState<IssueIdentifiedDuring | "">("");
  const [drivabilityStatus, setDrivabilityStatus] =
    useState<DrivabilityStatus | "">("");
  const [unitStatus, setUnitStatus] = useState<UnitStatus | "">("");
  const [locationNote, setLocationNote] = useState("");

  const [systemAffected, setSystemAffected] = useState<SystemAffected | "">("");
  const [urgency, setUrgency] = useState<Urgency | "">("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [status, setStatus] = useState<RequestStatus>("Open");
  const [mitigationApplied, setMitigationApplied] = useState<TriState | "">("");
  const [affectsNextShift, setAffectsNextShift] = useState<TriState | "">("");
  const [downtimeExpected, setDowntimeExpected] = useState<TriState | "">("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const canEditExistingManagedForms = canEditManagedForms(userRole);

  useEffect(() => {
    if (!equipmentId) return;
    let active = true;
    void (async () => {
      const supabase = createSupabaseBrowser();
      const { data, error } = await loadEquipmentContext(supabase, equipmentId);
      if (!active) return;
      if (error) {
        console.error("Failed loading equipment context:", error);
        return;
      }
      setEquipmentName((data?.name ?? "").trim());
      setEquipmentType((data?.equipment_type ?? "").trim());
      const h = Number(data?.current_hours);
      if (Number.isFinite(h) && h >= 0) setHours(String(h));
    })();
    return () => {
      active = false;
    };
  }, [equipmentId]);

  useEffect(() => {
    void (async () => {
      const name = await getSignedInDisplayName();
      if (!name) return;
      setEmployee((prev) => (prev.trim() ? prev : name));
    })();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        const supabase = createSupabaseBrowser();
        const { data: authData } = await supabase.auth.getUser();
        if (!authData.user) {
          setUserRole("employee");
          return;
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", authData.user.id)
          .maybeSingle();
        setUserRole(
          resolveEffectiveRole(
            (profile?.role as Role | undefined) ?? "employee",
            readRoleViewOverride()
          ) as Role
        );
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isEditMode || !equipmentId) return;
    let active = true;

    void (async () => {
      const supabase = createSupabaseBrowser();
      const { data, error } = await supabase
        .from("equipment_maintenance_requests")
        .select(
          "id,equipment_id,status,urgency,system_affected,drivability,unit_status,issue_identified_during,description,created_at"
        )
        .eq("id", editId)
        .eq("equipment_id", equipmentId)
        .maybeSingle();

      if (!active) return;
      if (error || !data) {
        console.error("Failed loading equipment maintenance request for edit:", error);
        return;
      }

      const parsed = parseTitleAndDescription(data.description);
      const teammate = parseFieldValue(data.description, "Teammate");
      const parsedRequestDate = parseFieldValue(data.description, "Request Date");
      const parsedHours = parseFieldValue(data.description, "Hours");
      const mitigation = parseFieldValue(data.description, "Mitigation Applied");
      const affects = parseFieldValue(data.description, "Affects Next Shift");
      const downtime = parseFieldValue(data.description, "Downtime Expected");
      const location = parseFieldValue(data.description, "Location Note");

      setStatus(
        coerceMaintenanceRequestStatus(data.status, "Open")
      );
      setIssueIdentifiedDuring(
        data.issue_identified_during === "Pre-Use Inspection" ||
          data.issue_identified_during === "Post-Use Inspection" ||
          data.issue_identified_during === "During Operation" ||
          data.issue_identified_during === "Jobsite Use" ||
          data.issue_identified_during === "Other"
          ? data.issue_identified_during
          : ""
      );
      setDrivabilityStatus(
        data.drivability === "Yes – Drivable" ||
          data.drivability === "Limited – Operate with caution" ||
          data.drivability === "No – Out of Service"
          ? data.drivability
          : ""
      );
      setUnitStatus(
        data.unit_status === "Active" ||
          data.unit_status === "Red Tagged" ||
          data.unit_status === "Parked in Yard" ||
          data.unit_status === "On Jobsite" ||
          data.unit_status === "Other"
          ? data.unit_status
          : ""
      );
      setSystemAffected(
        data.system_affected === "Engine" ||
          data.system_affected === "Electrical" ||
          data.system_affected === "Hydraulics" ||
          data.system_affected === "Tires / Wheels" ||
          data.system_affected === "Brakes" ||
          data.system_affected === "Steering" ||
          data.system_affected === "Body / Frame" ||
          data.system_affected === "Attachment / Implement" ||
          data.system_affected === "Other"
          ? data.system_affected
          : ""
      );
      setUrgency(
        data.urgency === "Low" || data.urgency === "Medium" || data.urgency === "High" || data.urgency === "Urgent"
          ? data.urgency
          : ""
      );
      setTitle(parsed.title || "");
      setDescription(parsed.description || "");
      if (teammate) setEmployee(teammate);
      if (/^\d{4}-\d{2}-\d{2}$/.test(parsedRequestDate)) {
        setRequestDate(parsedRequestDate);
      } else if (typeof data.created_at === "string" && /^\d{4}-\d{2}-\d{2}/.test(data.created_at)) {
        setRequestDate(data.created_at.slice(0, 10));
      }
      if (parsedHours && Number.isFinite(Number(parsedHours))) {
        setHours(parsedHours);
      }
      if (mitigation === "Yes" || mitigation === "No" || mitigation === "Not sure") {
        setMitigationApplied(mitigation);
      }
      if (affects === "Yes" || affects === "No" || affects === "Not sure") {
        setAffectsNextShift(affects);
      }
      if (downtime === "Yes" || downtime === "No" || downtime === "Not sure") {
        setDowntimeExpected(downtime);
      }
      if (location) setLocationNote(location);
    })();

    return () => {
      active = false;
    };
  }, [editId, equipmentId, isEditMode]);

  const suggestedTitle = useMemo(() => {
    const base = `${systemAffected}`;
    const end = urgency === "Urgent" ? " (URGENT)" : "";
    return `${base} issue${end}`;
  }, [systemAffected, urgency]);

  if (userRole === "apprentice") {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 32 }}>
        <h1 style={{ marginBottom: 6 }}>Equipment Maintenance Request</h1>
        <div style={{ opacity: 0.8, marginTop: 12 }}>
          Apprentice role does not have access to submit maintenance requests.
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => router.replace(`/equipment/${encodeURIComponent(equipmentId)}`)}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              color: "inherit",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Back to Equipment
          </button>
        </div>
      </main>
    );
  }

  if (isEditMode && userRole !== null && !canEditExistingManagedForms) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 32 }}>
        <h1 style={{ marginBottom: 6 }}>Equipment Maintenance Request</h1>
        <div style={{ opacity: 0.8, marginTop: 12 }}>
          Only mechanic and higher roles can edit existing maintenance requests.
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => router.replace(`/equipment/${encodeURIComponent(equipmentId)}`)}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              color: "inherit",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Back to Equipment
          </button>
        </div>
      </main>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!equipmentId) return alert("Missing equipment ID in the URL.");
    if (userRole === "apprentice") {
      return alert("Apprentice role cannot submit maintenance requests.");
    }
    if (isEditMode && userRole === null) {
      return alert("Loading permissions. Please try again.");
    }
    if (isEditMode && userRole !== null && !canEditExistingManagedForms) {
      return alert("Only mechanic and higher roles can edit maintenance requests.");
    }

    const h = Number(hours);
    if (!requestDate) return alert("Request Date is required.");
    if (!employee.trim()) return alert("Teammate is required.");
    if (!Number.isFinite(h) || h < 0) return alert("Enter valid hours.");
    if (!issueIdentifiedDuring) return alert("Issue Identified During is required.");
    if (!drivabilityStatus) return alert("Operational Status is required.");
    if (!unitStatus) return alert("Unit Status is required.");
    if (!systemAffected) return alert("System Affected is required.");
    if (!urgency) return alert("Urgency is required.");

    const finalTitle = title.trim() ? title.trim() : suggestedTitle;
    if (!description.trim()) return alert("Description of issue is required.");

    const combinedDescription = [
      `Title: ${finalTitle}`,
      "",
      description.trim(),
      "",
      `Teammate: ${employee.trim()}`,
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
    let savedRequestId = editId;
    let error: { message: string } | null = null;

    if (isEditMode) {
      const { data: updatedRequest, error: updateError } = await supabase
        .from("equipment_maintenance_requests")
        .update({
          status,
          urgency,
          system_affected: systemAffected,
          drivability: drivabilityStatus,
          unit_status: unitStatus,
          issue_identified_during: issueIdentifiedDuring,
          description: combinedDescription,
        })
        .eq("id", editId)
        .eq("equipment_id", equipmentId)
        .select("id")
        .maybeSingle();
      error = updateError;
      savedRequestId = updatedRequest?.id ?? editId;
    } else {
      const { data: insertedRequest, error: insertError } = await supabase
        .from("equipment_maintenance_requests")
        .insert({
          equipment_id: equipmentId,
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
      error = insertError;
      savedRequestId = insertedRequest?.id ?? "";
    }

    if (error) {
      console.error("Equipment maintenance request save failed:", error);
      setSubmitError(error.message);
      return;
    }

    const equipmentHoursSync = await syncEquipmentHoursForward({
      supabase,
      equipmentId,
      hours: h,
    });
    if (!equipmentHoursSync.ok) {
      console.error("Equipment hours sync error:", equipmentHoursSync.message);
    }

    if (savedRequestId) {
      try {
        await fetch("/api/form-reports/grade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            formType: "equipment_maintenance_request",
            recordId: savedRequestId,
          }),
        });
      } catch (gradeError) {
        console.error("Auto grading failed for equipment maintenance request:", gradeError);
      }
    }

    requestFormDraftClear();
    router.replace(returnTo || `/equipment/${encodeURIComponent(equipmentId)}`);
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>
        {isEditMode ? "Edit Equipment Maintenance Request" : "Equipment Maintenance Request"}
      </h1>

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

      <UnsavedChangesBanner isDirty={isDirty} />
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

            <Field label="Teammate *">
              <input value={employee} onChange={(e) => setEmployee(e.target.value)} placeholder="Teammate name" style={inputStyle()} required />
            </Field>
          </div>
        </div>

        <div style={{ marginTop: 16, ...cardStyle() }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Classification</div>

          <div style={gridStyle()}>
            <Field label="Issue Identified During *">
              <select value={issueIdentifiedDuring} onChange={(e) => setIssueIdentifiedDuring(e.target.value as IssueIdentifiedDuring)} style={inputStyle()}>
                <option value="">Select...</option>
                <option>Pre-Use Inspection</option>
                <option>Post-Use Inspection</option>
                <option>During Operation</option>
                <option>Jobsite Use</option>
                <option>Other</option>
              </select>
            </Field>

            <Field label="Operational Status *">
              <select value={drivabilityStatus} onChange={(e) => setDrivabilityStatus(e.target.value as DrivabilityStatus)} style={{ ...inputStyle(), ...answerSelectToneStyle(drivabilityStatus) }}>
                <option value="">Select...</option>
                <option>Yes – Drivable</option>
                <option>Limited – Operate with caution</option>
                <option>No – Out of Service</option>
              </select>
            </Field>

            <Field label="Unit Status *">
              <select value={unitStatus} onChange={(e) => setUnitStatus(e.target.value as UnitStatus)} style={inputStyle()}>
                <option value="">Select...</option>
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

            <Field label="Urgency *">
              <select value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)} style={inputStyle()}>
                <option value="">Select...</option>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
                <option>Urgent</option>
              </select>
            </Field>

            <Field label="Status">
              {isEditMode && canEditExistingManagedForms ? (
                <select value={status} onChange={(e) => setStatus(e.target.value as RequestStatus)} style={inputStyle()}>
                  {MAINTENANCE_REQUEST_STATUSES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={status} readOnly style={{ ...inputStyle(), opacity: 0.8 }} />
              )}
            </Field>

            <Field label="Title * (auto-suggested)">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={suggestedTitle} style={inputStyle()} />
            </Field>

            <Field label="Mitigation Applied?">
              <select value={mitigationApplied} onChange={(e) => setMitigationApplied(e.target.value as TriState)} style={{ ...inputStyle(), ...answerSelectToneStyle(mitigationApplied) }}>
                <option value="">Select...</option>
                <option>Yes</option>
                <option>No</option>
                <option>Not sure</option>
              </select>
            </Field>

            <Field label="Affects Next Shift?">
              <select value={affectsNextShift} onChange={(e) => setAffectsNextShift(e.target.value as TriState)} style={{ ...inputStyle(), ...answerSelectToneStyle(affectsNextShift) }}>
                <option value="">Select...</option>
                <option>Yes</option>
                <option>No</option>
                <option>Not sure</option>
              </select>
            </Field>

            <Field label="Downtime Expected?">
              <select value={downtimeExpected} onChange={(e) => setDowntimeExpected(e.target.value as TriState)} style={{ ...inputStyle(), ...answerSelectToneStyle(downtimeExpected) }}>
                <option value="">Select...</option>
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
            {isEditMode ? "Save Changes" : "Submit Maintenance Request"}
          </button>

          <button
            type="button"
            onClick={() => {
              if (!confirmLeaveForm()) return;
              router.replace(`/equipment/${encodeURIComponent(equipmentId)}`);
            }}
            style={secondaryButtonStyle()}
          >Discard & Return</button>
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

function answerSelectToneStyle(value: string): React.CSSProperties {
  const v = value.trim().toLowerCase();
  if (v === "pass" || v === "yes" || v.startsWith("yes ")) {
    return {
      borderColor: "rgba(53, 156, 84, 0.75)",
      background: "rgba(53, 156, 84, 0.18)",
    };
  }
  if (v === "fail" || v === "no" || v.startsWith("no ")) {
    return {
      borderColor: "rgba(202, 64, 64, 0.75)",
      background: "rgba(202, 64, 64, 0.18)",
    };
  }
  return {};
}
