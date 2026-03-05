"use client";

import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { loadVehicleContext } from "@/lib/assetContext";
import {
  confirmLeaveForm,
  getSignedInDisplayName,
  requestFormDraftClear,
  UnsavedChangesBanner,
  useFormExitGuard,
  useUnsavedChangesState,
} from "@/lib/forms";
import { readRoleViewOverride, resolveEffectiveRole, type AppRole } from "@/lib/roleView";

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
type Role = AppRole;

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

function isHoursBasedVehicleType(type: VehicleType) {
  return type === "skidsteer" || type === "loader";
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

export default function MaintenanceRequestPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isDirty } = useUnsavedChangesState();
  useFormExitGuard(isDirty);

  const prefillIssue = (searchParams.get("issue") || "").trim();
  const prefillIdentifiedDuring = (searchParams.get("identifiedDuring") || "").trim();
  const prefillSystem = (searchParams.get("systemAffected") || "").trim();
  const prefillUrgency = (searchParams.get("urgency") || "").trim();
  const prefillDetails = (searchParams.get("details") || "").trim();
  const sourceMileage = (searchParams.get("sourceMileage") || "").trim();
  const rawReturnTo = (searchParams.get("returnTo") || "").trim();
  const editId = (searchParams.get("editId") || "").trim();
  const linkSectionId = (searchParams.get("linkSectionId") || "").trim();
  const linkItemKey = (searchParams.get("linkItemKey") || "").trim();
  const returnTo = rawReturnTo.startsWith("/") ? rawReturnTo : "";
  const isEditMode = editId.length > 0;
  const parsedSourceMileage = Number(sourceMileage);

  // ✅ folder: app/(app)/vehicles/[vehicleID]/maintenance-request/page.tsx
  const params = useParams<{ vehicleID?: string }>();
  const vehicleId = params?.vehicleID ? decodeURIComponent(params.vehicleID) : "";

  const [vehicleName, setVehicleName] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("truck");
  const [currentVehicleMileage, setCurrentVehicleMileage] = useState<number | null>(null);

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

  const [status, setStatus] = useState<RequestStatus>("Open");
  const [mileage, setMileage] = useState(() =>
    Number.isFinite(parsedSourceMileage) && parsedSourceMileage > 0
      ? String(parsedSourceMileage)
      : ""
  );

  const [mitigationApplied, setMitigationApplied] =
    useState<TriState | "">("");
  const [affectsNextShift, setAffectsNextShift] =
    useState<TriState | "">("");
  const [downtimeExpected, setDowntimeExpected] =
    useState<TriState | "">("");
  const [userRole, setUserRole] = useState<Role | null>(null);
  const usesHours = isHoursBasedVehicleType(vehicleType);
  const readingLabel = usesHours ? "Hours" : "Mileage";
  const canEditExistingManagedForms = canEditManagedForms(userRole);

  useEffect(() => {
    if (!vehicleId) return;
    let active = true;

    void (async () => {
      const supabase = createSupabaseBrowser();
      const { data, error } = await loadVehicleContext(supabase, vehicleId);
      if (!active) return;
      if (error) {
        console.error("Failed loading vehicle context:", error);
        return;
      }
      setVehicleName((data?.name ?? "").trim());
      setVehicleType(isVehicleType(data?.type ?? null) ? (data?.type as VehicleType) : "truck");
      const dbMileage = Number(data?.mileage);
      if (Number.isFinite(dbMileage) && dbMileage > 0) {
        setCurrentVehicleMileage(dbMileage);
        setMileage((prev) => (prev.trim() ? prev : String(dbMileage)));
      } else {
        setCurrentVehicleMileage(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [vehicleId]);

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
    if (!isEditMode || !vehicleId) return;
    let active = true;

    void (async () => {
      const supabase = createSupabaseBrowser();
      const { data, error } = await supabase
        .from("maintenance_requests")
        .select(
          "id,vehicle_id,status,urgency,system_affected,drivability,unit_status,issue_identified_during,description,created_at"
        )
        .eq("id", editId)
        .eq("vehicle_id", vehicleId)
        .maybeSingle();

      if (!active) return;
      if (error || !data) {
        console.error("Failed loading maintenance request for edit:", error);
        return;
      }

      const parsed = parseTitleAndDescription(data.description);
      const teammate = parseFieldValue(data.description, "Teammate");
      const parsedRequestDate = parseFieldValue(data.description, "Request Date");
      const mitigation = parseFieldValue(data.description, "Mitigation Applied");
      const affects = parseFieldValue(data.description, "Affects Next Shift");
      const downtime = parseFieldValue(data.description, "Downtime Expected");
      const location = parseFieldValue(data.description, "Location Note");

      setStatus(
        data.status === "Open" || data.status === "In Progress" || data.status === "Closed"
          ? data.status
          : "Open"
      );
      setIssueIdentifiedDuring(
        data.issue_identified_during === "Pre-Trip Inspection" ||
          data.issue_identified_during === "Post-Trip Inspection" ||
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
  }, [editId, isEditMode, vehicleId]);

  const suggestedTitle = useMemo(() => {
    const base = `${systemAffected}`;
    const end = urgency === "Urgent" ? " (URGENT)" : "";
    return `${base} issue${end}`;
  }, [systemAffected, urgency]);

  if (userRole === "apprentice") {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 32 }}>
        <h1 style={{ marginBottom: 6 }}>Vehicle Maintenance Request</h1>
        <div style={{ opacity: 0.8, marginTop: 12 }}>
          Apprentice role does not have access to submit maintenance requests.
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => router.replace(`/vehicles/${encodeURIComponent(vehicleId)}`)}
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
            Back to Vehicle
          </button>
        </div>
      </main>
    );
  }

  if (isEditMode && userRole !== null && !canEditExistingManagedForms) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 32 }}>
        <h1 style={{ marginBottom: 6 }}>Vehicle Maintenance Request</h1>
        <div style={{ opacity: 0.8, marginTop: 12 }}>
          Only mechanic and higher roles can edit existing maintenance requests.
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => router.replace(`/vehicles/${encodeURIComponent(vehicleId)}`)}
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
            Back to Vehicle
          </button>
        </div>
      </main>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!vehicleId) return alert("Missing vehicle ID in the URL.");
    if (userRole === "apprentice") {
      return alert("Apprentice role cannot submit maintenance requests.");
    }
    if (isEditMode && userRole === null) {
      return alert("Loading permissions. Please try again.");
    }
    if (isEditMode && userRole !== null && !canEditExistingManagedForms) {
      return alert("Only mechanic and higher roles can edit maintenance requests.");
    }

    const m = Number(mileage);
    if (!requestDate) return alert("Request Date is required.");
    if (!employee.trim()) return alert("Teammate is required.");
    if (!Number.isFinite(m) || m <= 0) return alert(`Enter valid ${readingLabel.toLowerCase()}.`);
    if (currentVehicleMileage != null && m < currentVehicleMileage) {
      return alert(
        `${readingLabel} cannot be lower than the current tracked value (${currentVehicleMileage.toLocaleString()}).`
      );
    }
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

    let savedRequestId = editId;
    let error: { message: string } | null = null;

    if (isEditMode) {
      const { data: updatedRequest, error: updateError } = await supabase
        .from("maintenance_requests")
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
        .eq("vehicle_id", vehicleId)
        .select("id")
        .maybeSingle();
      error = updateError;
      savedRequestId = updatedRequest?.id ?? editId;
    } else {
      const { data: insertedRequest, error: insertError } = await supabase
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
      error = insertError;
      savedRequestId = insertedRequest?.id ?? "";
    }

    if (error) {
      alert(error.message);
      return;
    }

    if (savedRequestId) {
      try {
        await fetch("/api/form-reports/grade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            formType: "vehicle_maintenance_request",
            recordId: savedRequestId,
          }),
        });
      } catch (gradeError) {
        console.error("Auto grading failed for vehicle maintenance request:", gradeError);
      }
    }

    try {
      const { data: vehicleRow, error: vehicleReadError } = await supabase
        .from("vehicles")
        .select("mileage")
        .eq("id", vehicleId)
        .maybeSingle();
      if (vehicleReadError) {
        console.error("Failed to read vehicle mileage:", vehicleReadError);
      } else {
        const existingMileage = Number(vehicleRow?.mileage ?? 0);
        const nextMileage =
          Number.isFinite(existingMileage) && existingMileage > 0
            ? Math.max(existingMileage, m)
            : m;
        const { error: vehicleUpdateError } = await supabase
          .from("vehicles")
          .update({ mileage: nextMileage })
          .eq("id", vehicleId);
        if (vehicleUpdateError) {
          console.error("Failed to update vehicle mileage:", vehicleUpdateError);
        }
      }
    } catch (vehicleMileageError) {
      console.error("Unexpected vehicle mileage sync error:", vehicleMileageError);
    }

    requestFormDraftClear();

    if (returnTo && savedRequestId && linkSectionId && linkItemKey) {
      const q = new URLSearchParams({
        linkedRequestId: savedRequestId,
        linkSectionId,
        linkItemKey,
      });
      router.replace(`${returnTo}${returnTo.includes("?") ? "&" : "?"}${q.toString()}`);
      return;
    }

    router.replace(returnTo || `/vehicles/${encodeURIComponent(vehicleId)}`);
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>
        {isEditMode ? "Edit Maintenance Request" : "Maintenance Request Form"}
      </h1>

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

      <div style={{ marginTop: 14, ...cardStyle() }}>
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.35, opacity: 0.92 }}>
          The Maintenance Request Form is used to report any mechanical, safety,
          operational, or equipment-related issue identified during vehicle
          operation, inspections, or normal jobsite use.
        </div>
      </div>

      <UnsavedChangesBanner isDirty={isDirty} />
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

            <Field label={`${readingLabel} *`}>
              <>
                <input
                  value={mileage}
                  onChange={(e) => setMileage(e.target.value)}
                  inputMode="numeric"
                  placeholder="e.g. 130120"
                  style={inputStyle()}
                  required
                />
                {currentVehicleMileage != null ? (
                  <div style={{ marginTop: 6, opacity: 0.72, fontSize: 12 }}>
                    Current tracked {readingLabel.toLowerCase()}: <strong>{currentVehicleMileage.toLocaleString()}</strong>
                  </div>
                ) : null}
              </>
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
                style={{ ...inputStyle(), ...answerSelectToneStyle(drivabilityStatus) }}
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
                style={{ ...inputStyle(), ...answerSelectToneStyle(mitigationApplied) }}
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
                style={{ ...inputStyle(), ...answerSelectToneStyle(affectsNextShift) }}
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
                style={{ ...inputStyle(), ...answerSelectToneStyle(downtimeExpected) }}
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
            {isEditMode ? "Save Changes" : "Submit Maintenance Request"}
          </button>

          <button
            type="button"
            onClick={() => {
              if (!confirmLeaveForm()) return;
              router.replace(returnTo || `/vehicles/${encodeURIComponent(vehicleId)}`);
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
