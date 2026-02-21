"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { confirmLeaveForm, getSignedInDisplayName, useFormExitGuard } from "@/lib/forms";

export type Choice = "pass" | "fail";
type ChoiceOrBlank = Choice | "";
export type VehicleType = "truck" | "car" | "skidsteer" | "loader";

export type InspectionItem = {
  key: string;
  label: string;
};

export type InspectionSection = {
  id: string;
  title: string;
  applicableLabel: string;
  nameFieldLabel?: string; // e.g. Trailer Name / Plow Name
  items: InspectionItem[];
  vehicleTypes?: VehicleType[];
};

export type InspectionType = "pre-trip" | "post-trip";

type StoredInspectionRecord = {
  id: string;
  vehicleId: string;
  type: InspectionType;
  createdAt: string;
  inspectionDate: string; // yyyy-mm-dd
  mileage: number;
  employee: string;

  sections: Record<
    string,
    {
      applicable: boolean;
      name?: string;
      items: Record<string, ChoiceOrBlank>;
    }
  >;

  exiting?: Record<string, ChoiceOrBlank>;

  defectsFound: boolean;
  inspectionStatus: "Pass" | "Fail - Maintenance Required" | "Out of Service";
  notes: string;

  employeeSignature: string;
  managerSignature?: string;
};

type OpenMaintenanceRequest = {
  id: string;
  status: string | null;
  urgency: string | null;
  system_affected: string | null;
  description: string | null;
  created_at: string;
};

type ExtraFieldConfig = {
  label: string;
  placeholder: string;
  inputMode: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  required: boolean;
};

const DASH_LIGHT_OPTIONS = [
  "None",
  "Check Engine",
  "ABS",
  "Oil Pressure",
  "Battery / Charging",
  "Coolant Temp",
  "Brake",
  "Traction Control",
  "Airbag / SRS",
  "TPMS",
  "DEF / Emissions",
  "Other",
] as const;

function failLinkKey(sectionId: string, itemKey: string) {
  return `${sectionId}::${itemKey}`;
}

function getIssueIdentifiedDuring(type: InspectionType) {
  return type === "pre-trip" ? "Pre-Trip Inspection" : "Post-Trip Inspection";
}

function mapSystemAffected(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("brake")) return "Brakes";
  if (l.includes("steer")) return "Steering";
  if (l.includes("tire") || l.includes("wheel") || l.includes("lug")) return "Tires / Wheels";
  if (l.includes("elect") || l.includes("light") || l.includes("battery") || l.includes("strobe")) return "Electrical";
  if (l.includes("hydraulic") || l.includes("hose") || l.includes("coupler")) return "Hydraulics";
  if (l.includes("engine") || l.includes("coolant") || l.includes("oil") || l.includes("belt") || l.includes("fuel")) return "Engine";
  if (l.includes("frame") || l.includes("body") || l.includes("door") || l.includes("gate")) return "Body / Frame";
  if (l.includes("attachment") || l.includes("plow") || l.includes("salter") || l.includes("bucket")) return "Attachment / Implement";
  return "Other";
}

function extraFieldConfig(itemKey: string, label: string): ExtraFieldConfig | null {
  const k = itemKey.toLowerCase();
  const l = label.toLowerCase();
  if (k.includes("tire") || l.includes("psi")) {
    return { label: "Measured PSI", placeholder: "e.g. 42.5", inputMode: "decimal", required: true };
  }
  if (k === "fuel_level" || k === "def_level") {
    return { label: "Recorded Level", placeholder: "e.g. 75%", inputMode: "text", required: true };
  }
  if (k === "diag_codes_list") {
    return { label: "Diagnostic Codes", placeholder: "Enter displayed code(s)", inputMode: "text", required: false };
  }
  return null;
}

function vehicleMileageKey(vehicleId: string) {
  return `vehicle:${vehicleId}:mileage`;
}

function vehicleTypeKey(vehicleId: string) {
  return `vehicle:${vehicleId}:type`;
}

function todayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function cardStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 16,
    padding: 16,
    background: "rgba(255,255,255,0.03)",
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

function ChoiceToggle({
  value,
  onChange,
}: {
  value: ChoiceOrBlank;
  onChange: (v: Choice) => void;
}) {
  const pill = (active: boolean): React.CSSProperties => ({
    padding: "6px 10px",
    borderRadius: 999,
    border: active
      ? "1px solid rgba(255,255,255,0.26)"
      : "1px solid rgba(255,255,255,0.14)",
    background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    userSelect: "none",
  });

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <span style={pill(value === "pass")} onClick={() => onChange("pass")}>
        Pass
      </span>
      <span style={pill(value === "fail")} onClick={() => onChange("fail")}>
        Fail
      </span>
    </div>
  );
}

function isVehicleType(x: string | null): x is VehicleType {
  return x === "truck" || x === "car" || x === "skidsteer" || x === "loader";
}

export default function InspectionForm({
  type,
  title,
  intro,
  sections,
  exitingItems,
  acknowledgementText,
}: {
  type: InspectionType;
  title: string;
  intro: string;
  sections: InspectionSection[];
  exitingItems?: InspectionItem[]; // post-trip only
  acknowledgementText: string;
}) {
  const router = useRouter();
  useFormExitGuard();

  // ✅ Get vehicle ID from route param (folder is [vehicleID])
  const params = useParams<{ vehicleID?: string }>();

  const vehicleId = useMemo(() => {
    const raw = params?.vehicleID ?? "";
    return raw ? decodeURIComponent(raw) : "";
  }, [params]);

  // ✅ Make vehicleType real state
  const [vehicleType, setVehicleType] = useState<VehicleType>("truck");

  // ✅ Read localStorage reliably (immediate + short retry)
  useEffect(() => {
    if (!vehicleId) return;

    const read = () => {
      const raw = localStorage.getItem(vehicleTypeKey(vehicleId));
      setVehicleType(isVehicleType(raw) ? raw : "truck");
    };

    read();

    // retry shortly after mount (covers timing cases)
    const t1 = window.setTimeout(read, 50);
    const t2 = window.setTimeout(read, 250);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [vehicleId]);

  // ✅ Filter sections based on vehicleType
  const visibleSections = useMemo(() => {
    return sections.filter((sec) => {
      if (!sec.vehicleTypes || sec.vehicleTypes.length === 0) return true;
      return sec.vehicleTypes.includes(vehicleType);
    });
  }, [sections, vehicleType]);

  const [inspectionDate, setInspectionDate] = useState(todayYYYYMMDD());
  const [mileage, setMileage] = useState("");
  const [employee, setEmployee] = useState("");
  const [dashLightsOn, setDashLightsOn] = useState<string[]>([]);

  // ✅ sectionState must rebuild when vehicleType/visibleSections changes
  const [sectionState, setSectionState] =
    useState<StoredInspectionRecord["sections"]>({});
  const [itemExtraValues, setItemExtraValues] = useState<Record<string, string>>({});
  const [failRequestLinks, setFailRequestLinks] = useState<Record<string, string>>({});
  const [openRequests, setOpenRequests] = useState<OpenMaintenanceRequest[]>([]);
  const [creatingFailLinkKey, setCreatingFailLinkKey] = useState<string | null>(null);

  // Track the last vehicleType used to initialize; when it changes, rebuild
  const lastInitType = useRef<VehicleType>("truck");

  useEffect(() => {
    if (!vehicleId) return;

    // If vehicleType changed (truck -> loader), rebuild sections state cleanly
    const typeChanged = lastInitType.current !== vehicleType;
    lastInitType.current = vehicleType;

    setSectionState((prev) => {
      // When the type changes, start fresh to avoid stale sections lingering
      const base: StoredInspectionRecord["sections"] = typeChanged ? {} : { ...prev };

      // Ensure all visible sections exist with defaults
      for (const sec of visibleSections) {
        const existing = base[sec.id];
        if (existing) {
          // Ensure any newly-added items exist
          const items = { ...existing.items };
          for (const it of sec.items) {
            if (!items[it.key]) items[it.key] = "";
          }
          base[sec.id] = { ...existing, items };
          continue;
        }

        const items: Record<string, ChoiceOrBlank> = {};
        for (const it of sec.items) items[it.key] = "";
        base[sec.id] = { applicable: false, name: "", items };
      }

      // Drop sections that are not visible for this vehicle type
      for (const key of Object.keys(base)) {
        if (!visibleSections.some((s) => s.id === key)) delete base[key];
      }

      return base;
    });
  }, [vehicleId, vehicleType, visibleSections]);

  const [exiting, setExiting] = useState<Record<string, ChoiceOrBlank>>(() => {
    const m: Record<string, ChoiceOrBlank> = {};
    (exitingItems ?? []).forEach((it) => (m[it.key] = ""));
    return m;
  });

  const [inspectionStatus, setInspectionStatus] = useState<
    "Pass" | "Fail - Maintenance Required" | "Out of Service" | ""
  >("");
  const [notes, setNotes] = useState("");
  const [employeeSignature, setEmployeeSignature] = useState("");
  const [managerSignature, setManagerSignature] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const name = await getSignedInDisplayName();
      if (!name) return;
      setEmployee((prev) => (prev.trim() ? prev : name));
    })();
  }, []);

  useEffect(() => {
    if (!vehicleId) return;
    let active = true;
    void (async () => {
      const supabase = createSupabaseBrowser();
      const { data, error } = await supabase
        .from("maintenance_requests")
        .select("id,status,urgency,system_affected,description,created_at")
        .eq("vehicle_id", vehicleId)
        .in("status", ["Open", "In Progress"])
        .order("created_at", { ascending: false })
        .limit(100);
      if (!active) return;
      if (error) {
        console.error("Failed loading open maintenance requests:", error);
        setOpenRequests([]);
        return;
      }
      setOpenRequests((data ?? []) as OpenMaintenanceRequest[]);
    })();
    return () => {
      active = false;
    };
  }, [vehicleId]);

  const defectsFound = useMemo(() => {
    for (const sec of visibleSections) {
      const st = sectionState[sec.id];
      if (!st?.applicable) continue;

      for (const it of sec.items) {
        if (st.items?.[it.key] === "fail") return true;
      }
    }

    for (const it of exitingItems ?? []) {
      if (exiting[it.key] === "fail") return true;
    }

    return false;
  }, [visibleSections, sectionState, exitingItems, exiting]);

  const statusHint = useMemo(() => {
    if (defectsFound && inspectionStatus === "Pass")
      return "Defects found — status should not be Pass.";
    return "";
  }, [defectsFound, inspectionStatus]);

  function setApplicable(secId: string, applicable: boolean) {
    setSectionState((prev) => ({
      ...prev,
      [secId]: { ...prev[secId], applicable },
    }));
  }

  function setSectionName(secId: string, name: string) {
    setSectionState((prev) => ({
      ...prev,
      [secId]: { ...prev[secId], name },
    }));
  }

  function setItem(secId: string, itemKey: string, value: Choice) {
    setSectionState((prev) => ({
      ...prev,
      [secId]: {
        ...prev[secId],
        items: { ...prev[secId].items, [itemKey]: value },
      },
    }));
  }

  function setExitItem(itemKey: string, value: Choice) {
    setExiting((prev) => ({ ...prev, [itemKey]: value }));
  }

  function setItemExtraValue(sectionId: string, itemKey: string, value: string) {
    setItemExtraValues((prev) => ({
      ...prev,
      [failLinkKey(sectionId, itemKey)]: value,
    }));
  }

  async function quickCreateRequest(sectionTitle: string, itemLabel: string, linkKey: string) {
    if (!vehicleId) return;
    const supabase = createSupabaseBrowser();
    setCreatingFailLinkKey(linkKey);
    const description = [
      `Auto-created from ${type === "pre-trip" ? "Pre-Trip" : "Post-Trip"} failure`,
      `Section: ${sectionTitle}`,
      `Failed Item: ${itemLabel}`,
      `Teammate: ${employee.trim() || "Unknown"}`,
      notes.trim() ? `Inspection Notes: ${notes.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const { data, error } = await supabase
      .from("maintenance_requests")
      .insert({
        vehicle_id: vehicleId,
        status: "Open",
        urgency: "High",
        system_affected: mapSystemAffected(itemLabel),
        drivability: "Limited – Operate with caution",
        unit_status: "Active",
        issue_identified_during: getIssueIdentifiedDuring(type),
        description,
      })
      .select("id,status,urgency,system_affected,description,created_at")
      .single();
    setCreatingFailLinkKey(null);
    if (error || !data) {
      alert(error?.message || "Failed to create maintenance request.");
      return;
    }

    setOpenRequests((prev) => [data as OpenMaintenanceRequest, ...prev]);
    setFailRequestLinks((prev) => ({ ...prev, [linkKey]: data.id }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!vehicleId) return alert("Missing vehicle ID in the URL.");

    const m = Number(mileage);
    if (!inspectionDate) return alert("Inspection date is required.");
    if (!Number.isFinite(m) || m <= 0) return alert("Enter a valid mileage.");
    if (!employee.trim()) return alert("Teammate is required.");
    if (dashLightsOn.length === 0) return alert("Please select dash light status.");
    if (!inspectionStatus) return alert("Inspection status is required.");

    if (defectsFound && !notes.trim())
      return alert("Notes are required when any item is marked Fail.");

    if (defectsFound && inspectionStatus === "Pass") {
      return alert(
        "Defects were found — set Inspection Status to Fail or Out of Service."
      );
    }

    for (const sec of visibleSections) {
      const st = sectionState[sec.id];
      if (st?.applicable && sec.nameFieldLabel) {
        if (!st.name?.trim())
          return alert(
            `${sec.nameFieldLabel} is required when ${sec.title} is applicable.`
          );
      }
      if (st?.applicable) {
        for (const it of sec.items) {
          const value = st.items?.[it.key] as ChoiceOrBlank;
          if (!value) return alert(`Please answer all checklist items before submitting.`);
          const extraCfg = extraFieldConfig(it.key, it.label);
          if (extraCfg?.required) {
            const extraVal = (itemExtraValues[failLinkKey(sec.id, it.key)] || "").trim();
            if (!extraVal) {
              return alert(`${extraCfg.label} is required for "${it.label}".`);
            }
          }
          if (value === "fail") {
            const link = (failRequestLinks[failLinkKey(sec.id, it.key)] || "").trim();
            if (!link) {
              return alert(`Link or create a maintenance request for failed item: "${it.label}".`);
            }
          }
        }
      }
    }

    for (const it of exitingItems ?? []) {
      const value = exiting[it.key] as ChoiceOrBlank;
      if (!value) return alert("Please answer all exiting checklist items before submitting.");
      if (value === "fail") {
        const link = (failRequestLinks[failLinkKey("exiting", it.key)] || "").trim();
        if (!link) {
          return alert(`Link or create a maintenance request for failed item: "${it.label}".`);
        }
      }
    }

    if (!employeeSignature.trim())
      return alert("Teammate Signature is required.");

    const checklist = {
      sections: sectionState,
      exiting: exitingItems ? exiting : undefined,
      defectsFound,
      inspectionStatus,
      notes: notes.trim(),
      employee: employee.trim(),
      inspectionDate,
      employeeSignature: employeeSignature.trim(),
      managerSignature: managerSignature.trim()
        ? managerSignature.trim()
        : undefined,
      dashLightsOn,
      itemExtraValues,
      failRequestLinks,
      type,
    };

    const supabase = createSupabaseBrowser();
    const { data: insertedInspection, error } = await supabase
      .from("inspections")
      .insert({
        vehicle_id: vehicleId,
        inspection_type: type === "pre-trip" ? "Pre-Trip" : "Post-Trip",
        checklist,
        overall_status: inspectionStatus,
        mileage: m,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Inspection insert failed:", error);
      setSubmitError(error.message);
      return;
    }

    localStorage.setItem(vehicleMileageKey(vehicleId), String(m));

    if (insertedInspection?.id) {
      try {
        await fetch("/api/form-reports/grade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            formType: "inspection",
            recordId: insertedInspection.id,
          }),
        });
      } catch (gradeError) {
        console.error("Auto grading failed for inspection:", gradeError);
      }
    }

    router.replace(`/vehicles/${encodeURIComponent(vehicleId)}`);
  }

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>{title}</h1>

      <div style={{ opacity: 0.75 }}>
        Vehicle ID: <strong>{vehicleId || "(missing)"}</strong>
        <span style={{ marginLeft: 10, opacity: 0.8 }}>
          Type: <strong>{vehicleType}</strong>
        </span>
      </div>

      <div style={{ marginTop: 14, ...cardStyle() }}>
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.35, opacity: 0.92 }}>
          {intro}
        </div>
      </div>

      {submitError ? (
        <div style={{ marginTop: 12, ...cardStyle(), color: "#ff9d9d", opacity: 0.95 }}>
          Failed to save inspection: {submitError}
        </div>
      ) : null}

      <form onSubmit={onSubmit} style={{ marginTop: 16 }}>
        {/* General Info */}
        <div style={cardStyle()}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>
            General Information
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>
                Inspection Date *
              </div>
              <input
                type="date"
                value={inspectionDate}
                onChange={(e) => setInspectionDate(e.target.value)}
                style={inputStyle()}
              />
            </div>

            <div>
              <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>
                Mileage *
              </div>
              <input
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 130120"
                style={inputStyle()}
              />
            </div>

            <div>
              <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>
                Teammate *
              </div>
              <input
                value={employee}
                onChange={(e) => setEmployee(e.target.value)}
                placeholder="Teammate name"
                style={inputStyle()}
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>
                Dash Lights On? * (Select all that apply)
              </div>
              <select
                multiple
                value={dashLightsOn}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                  if (values.includes("None") && values.length > 1) {
                    setDashLightsOn(values.filter((v) => v !== "None"));
                  } else {
                    setDashLightsOn(values);
                  }
                }}
                style={{ ...inputStyle(), minHeight: 120 }}
              >
                {DASH_LIGHT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setDashLightsOn(DASH_LIGHT_OPTIONS.filter((o) => o !== "None"))}
                  style={secondaryButtonStyle()}
                >
                  Select All Lights
                </button>
                <button
                  type="button"
                  onClick={() => setDashLightsOn(["None"])}
                  style={secondaryButtonStyle()}
                >
                  No Dash Lights On
                </button>
                <button
                  type="button"
                  onClick={() => setDashLightsOn([])}
                  style={secondaryButtonStyle()}
                >
                  Clear Selection
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sections */}
        <div style={{ marginTop: 16, display: "grid", gap: 16 }}>
          {visibleSections.map((sec) => {
            const st = sectionState[sec.id];
            if (!st) return null;

            return (
              <div key={sec.id} style={cardStyle()}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 900 }}>{sec.title}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {sec.applicableLabel}
                    </div>
                  </div>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!st.applicable}
                      onChange={(e) => setApplicable(sec.id, e.target.checked)}
                    />
                    <span style={{ fontWeight: 800 }}>Applicable</span>
                  </label>
                </div>

                {/* Optional name field when applicable */}
                {st.applicable && sec.nameFieldLabel ? (
                  <div style={{ marginTop: 12 }}>
                    <div
                      style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}
                    >
                      {sec.nameFieldLabel} *
                    </div>
                    <input
                      value={st.name ?? ""}
                      onChange={(e) => setSectionName(sec.id, e.target.value)}
                      placeholder={sec.nameFieldLabel}
                      style={inputStyle()}
                    />
                  </div>
                ) : null}

                {/* Items (only show when applicable) */}
                {st.applicable ? (
                  <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                    {sec.items.map((it) => (
                      <div
                        key={it.key}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          gap: 12,
                          alignItems: "center",
                          padding: 12,
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: "rgba(255,255,255,0.02)",
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{it.label}</div>
                        <div style={{ display: "grid", gap: 8 }}>
                          <ChoiceToggle
                            value={st.items[it.key]}
                            onChange={(v) => setItem(sec.id, it.key, v)}
                          />
                          {(() => {
                            const cfg = extraFieldConfig(it.key, it.label);
                            if (!cfg) return null;
                            const detailKey = failLinkKey(sec.id, it.key);
                            return (
                              <div>
                                <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 6 }}>
                                  {cfg.label}
                                  {cfg.required ? " *" : ""}
                                </div>
                                <input
                                  value={itemExtraValues[detailKey] || ""}
                                  onChange={(e) => setItemExtraValue(sec.id, it.key, e.target.value)}
                                  inputMode={cfg.inputMode}
                                  placeholder={cfg.placeholder}
                                  style={inputStyle()}
                                />
                              </div>
                            );
                          })()}
                          {st.items[it.key] === "fail" ? (
                            <div
                              style={{
                                border: "1px dashed rgba(255,255,255,0.2)",
                                borderRadius: 10,
                                padding: 10,
                                background: "rgba(255,120,120,0.06)",
                              }}
                            >
                              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
                                Maintenance Request Link Required
                              </div>
                              <select
                                value={failRequestLinks[failLinkKey(sec.id, it.key)] || ""}
                                onChange={(e) =>
                                  setFailRequestLinks((prev) => ({
                                    ...prev,
                                    [failLinkKey(sec.id, it.key)]: e.target.value,
                                  }))
                                }
                                style={inputStyle()}
                              >
                                <option value="">Select existing open request...</option>
                                {openRequests.map((req) => (
                                  <option key={req.id} value={req.id}>
                                    {req.id.slice(0, 8)} · {req.system_affected || "Issue"} · {req.urgency || "n/a"} ·{" "}
                                    {new Date(req.created_at).toLocaleDateString()}
                                  </option>
                                ))}
                              </select>
                              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void quickCreateRequest(sec.title, it.label, failLinkKey(sec.id, it.key))
                                  }
                                  style={buttonStyle()}
                                  disabled={creatingFailLinkKey === failLinkKey(sec.id, it.key)}
                                >
                                  {creatingFailLinkKey === failLinkKey(sec.id, it.key)
                                    ? "Creating..."
                                    : "Create & Link Request"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    window.open(
                                      `/vehicles/${encodeURIComponent(vehicleId)}/forms/maintenance-request?issue=${encodeURIComponent(
                                        it.label
                                      )}&identifiedDuring=${encodeURIComponent(getIssueIdentifiedDuring(type))}&systemAffected=${encodeURIComponent(
                                        mapSystemAffected(it.label)
                                      )}&urgency=High&details=${encodeURIComponent(
                                        itemExtraValues[failLinkKey(sec.id, it.key)] || ""
                                      )}`,
                                      "_blank",
                                      "noopener,noreferrer"
                                    )
                                  }
                                  style={secondaryButtonStyle()}
                                >
                                  Open Full Request Form
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ marginTop: 12, fontSize: 13, opacity: 0.7 }}>
                    Mark as applicable to show questions.
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Exiting items (post-trip only) */}
        {(exitingItems?.length ?? 0) > 0 ? (
          <div style={{ marginTop: 16, ...cardStyle() }}>
            <div style={{ fontWeight: 900, marginBottom: 12 }}>
              Exiting / Securing
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {exitingItems!.map((it) => (
                <div
                  key={it.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 12,
                    alignItems: "center",
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{it.label}</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    <ChoiceToggle
                      value={exiting[it.key]}
                      onChange={(v) => setExitItem(it.key, v)}
                    />
                    {exiting[it.key] === "fail" ? (
                      <div
                        style={{
                          border: "1px dashed rgba(255,255,255,0.2)",
                          borderRadius: 10,
                          padding: 10,
                          background: "rgba(255,120,120,0.06)",
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
                          Maintenance Request Link Required
                        </div>
                        <select
                          value={failRequestLinks[failLinkKey("exiting", it.key)] || ""}
                          onChange={(e) =>
                            setFailRequestLinks((prev) => ({
                              ...prev,
                              [failLinkKey("exiting", it.key)]: e.target.value,
                            }))
                          }
                          style={inputStyle()}
                        >
                          <option value="">Select existing open request...</option>
                          {openRequests.map((req) => (
                            <option key={req.id} value={req.id}>
                              {req.id.slice(0, 8)} · {req.system_affected || "Issue"} · {req.urgency || "n/a"} ·{" "}
                              {new Date(req.created_at).toLocaleDateString()}
                            </option>
                          ))}
                        </select>
                        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() =>
                              void quickCreateRequest("Exiting / Securing", it.label, failLinkKey("exiting", it.key))
                            }
                            style={buttonStyle()}
                            disabled={creatingFailLinkKey === failLinkKey("exiting", it.key)}
                          >
                            {creatingFailLinkKey === failLinkKey("exiting", it.key)
                              ? "Creating..."
                              : "Create & Link Request"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Status + Notes */}
        <div style={{ marginTop: 16, ...cardStyle() }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Result</div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>
                Inspection Status *
              </div>
              <select
                value={inspectionStatus}
                onChange={(e) =>
                  setInspectionStatus(
                    e.target.value as StoredInspectionRecord["inspectionStatus"] | ""
                  )
                }
                style={inputStyle()}
              >
                <option value="">Select status...</option>
                <option value="Pass">Pass</option>
                <option value="Fail - Maintenance Required">
                  Fail - Maintenance Required
                </option>
                <option value="Out of Service">Out of Service</option>
              </select>
              {statusHint ? (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                  {statusHint}
                </div>
              ) : null}
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>
                Notes {defectsFound ? "*" : ""}
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  defectsFound
                    ? "Required when any item is marked Fail"
                    : "Optional"
                }
                style={{ ...inputStyle(), minHeight: 90, resize: "vertical" }}
              />
            </div>
          </div>
        </div>

        {/* Acknowledgement + signatures */}
        <div style={{ marginTop: 16, ...cardStyle() }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>
            Acknowledgement
          </div>
          <div
            style={{ whiteSpace: "pre-wrap", lineHeight: 1.35, opacity: 0.92 }}
          >
            {acknowledgementText}
          </div>

          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>
                Teammate Signature *
              </div>
              <input
                value={employeeSignature}
                onChange={(e) => setEmployeeSignature(e.target.value)}
                placeholder="Type full name"
                style={inputStyle()}
              />
            </div>

            <div>
              <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>
                Manager Signature (optional)
              </div>
              <input
                value={managerSignature}
                onChange={(e) => setManagerSignature(e.target.value)}
                placeholder="Type full name"
                style={inputStyle()}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" style={buttonStyle()}>
            Submit
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
