"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
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

type ExtraFieldConfig = {
  label: string;
  placeholder: string;
  inputMode: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  required: boolean;
};

type EquipmentOption = {
  id: string;
  name: string | null;
  equipment_type: string | null;
  status: string | null;
  asset_qr: string | null;
};

type VehicleOption = {
  id: string;
  name: string | null;
  type: string | null;
  status: string | null;
};
type Role =
  | "owner"
  | "operations_manager"
  | "office_admin"
  | "mechanic"
  | "team_lead_1"
  | "team_lead_2"
  | "team_member_1"
  | "team_member_2"
  | "apprentice"
  | "employee";

const SECTION_EQUIPMENT_PICKERS: Record<string, string> = {
  truck: "Truck Loadout Equipment",
  trailer: "Trailer Identification",
  plow: "Attachment Selection",
  salter: "Salter Selection",
};

function isSectionEquipmentPicker(sectionId: string) {
  return Boolean(SECTION_EQUIPMENT_PICKERS[sectionId]);
}

function isAlwaysRequiredSection(sectionId: string) {
  return sectionId === "truck" || sectionId === "skid_loader";
}

function sectionUsesLoadoutBucket(sectionId: string) {
  return sectionId === "truck" || sectionId === "trailer" || sectionId === "salter";
}

function equipmentMatchesSection(sectionId: string, row: EquipmentOption) {
  const hay = `${row.name ?? ""} ${row.equipment_type ?? ""}`.toLowerCase();
  if (sectionId === "truck") {
    return !hay.includes("trailer");
  }
  if (sectionId === "trailer") {
    return !hay.includes("trailer");
  }
  if (sectionId === "plow") {
    return hay.includes("plow");
  }
  if (sectionId === "salter") {
    return hay.includes("salter") || hay.includes("salt") || hay.includes("spreader");
  }
  return true;
}

function sectionSelectionMatches(sectionId: string, row: EquipmentOption) {
  const hay = `${row.name ?? ""} ${row.equipment_type ?? ""}`.toLowerCase();
  if (sectionId === "trailer") return hay.includes("trailer");
  if (sectionId === "plow") return hay.includes("plow");
  if (sectionId === "salter") return hay.includes("salter") || hay.includes("salt") || hay.includes("spreader");
  return true;
}

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

function extraFieldConfig(itemKey: string): ExtraFieldConfig | null {
  const k = itemKey.toLowerCase();
  if (k === "fuel_level" || k === "def_level") {
    return { label: "Recorded Level", placeholder: "e.g. 75%", inputMode: "text", required: true };
  }
  if (k === "diag_codes_list") {
    return { label: "Diagnostic Codes", placeholder: "Enter displayed code(s)", inputMode: "text", required: false };
  }
  return null;
}

function parseDiagnosticCodes(raw: string) {
  return raw
    .split(/[\n,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function vehicleMileageKey(vehicleId: string) {
  return `vehicle:${vehicleId}:mileage`;
}

function vehicleTypeKey(vehicleId: string) {
  return `vehicle:${vehicleId}:type`;
}

function inspectionDraftKey(vehicleId: string, type: InspectionType) {
  return `inspection:draft:${type}:${vehicleId}`;
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

function ChoiceToggle({
  value,
  onChange,
}: {
  value: ChoiceOrBlank;
  onChange: (v: Choice) => void;
}) {
  const pill = (state: Choice, active: boolean): React.CSSProperties => ({
    padding: "6px 10px",
    borderRadius: 999,
    border: active
      ? state === "pass"
        ? "1px solid rgba(53, 156, 84, 0.8)"
        : "1px solid rgba(202, 64, 64, 0.8)"
      : "1px solid rgba(255,255,255,0.14)",
    background: active
      ? state === "pass"
        ? "rgba(53, 156, 84, 0.25)"
        : "rgba(202, 64, 64, 0.25)"
      : "rgba(255,255,255,0.03)",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    userSelect: "none",
  });

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <span style={pill("pass", value === "pass")} onClick={() => onChange("pass")}>
        Pass
      </span>
      <span style={pill("fail", value === "fail")} onClick={() => onChange("fail")}>
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
  const searchParams = useSearchParams();
  useFormExitGuard();

  // ✅ Get vehicle ID from route param (folder is [vehicleID])
  const params = useParams<{ vehicleID?: string }>();

  const vehicleId = useMemo(() => {
    const raw = params?.vehicleID ?? "";
    return raw ? decodeURIComponent(raw) : "";
  }, [params]);

  // ✅ Make vehicleType real state
  const [vehicleType, setVehicleType] = useState<VehicleType>("truck");

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
  const [diagCodeDraftByItem, setDiagCodeDraftByItem] = useState<Record<string, string>>({});
  const [failRequestLinks, setFailRequestLinks] = useState<Record<string, string>>({});
  const [equipmentOptions, setEquipmentOptions] = useState<EquipmentOption[]>([]);
  const [equipmentLoading, setEquipmentLoading] = useState(false);
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);
  const [vehicleLoading, setVehicleLoading] = useState(false);
  const [sectionEquipmentIds, setSectionEquipmentIds] = useState<Record<string, string[]>>({});
  const [sectionEquipmentSearch, setSectionEquipmentSearch] = useState<Record<string, string>>({});
  const [pickerOpenSectionId, setPickerOpenSectionId] = useState<string | null>(null);
  const [pickerModeBySection, setPickerModeBySection] = useState<Record<string, "search" | "scan">>({});
  const [pickerScanValueBySection, setPickerScanValueBySection] = useState<Record<string, string>>({});
  const [pickerErrorBySection, setPickerErrorBySection] = useState<Record<string, string>>({});
  const [trailerVehicleIds, setTrailerVehicleIds] = useState<string[]>([]);
  const [trailerVehicleLinks, setTrailerVehicleLinks] = useState<Record<string, string>>({});
  const [trailerVehiclePickerOpen, setTrailerVehiclePickerOpen] = useState(false);
  const [trailerVehiclePickerMode, setTrailerVehiclePickerMode] = useState<"search" | "scan">("search");
  const [trailerVehicleSearch, setTrailerVehicleSearch] = useState("");
  const [trailerVehicleScanValue, setTrailerVehicleScanValue] = useState("");
  const [trailerVehicleError, setTrailerVehicleError] = useState("");
  const [sectionSelectOpenId, setSectionSelectOpenId] = useState<string | null>(null);
  const [sectionSelectModeById, setSectionSelectModeById] = useState<Record<string, "search" | "scan">>({});
  const [sectionSelectSearchById, setSectionSelectSearchById] = useState<Record<string, string>>({});
  const [sectionSelectScanById, setSectionSelectScanById] = useState<Record<string, string>>({});
  const [sectionSelectErrorById, setSectionSelectErrorById] = useState<Record<string, string>>({});

  // Track the last vehicleType used to initialize; when it changes, rebuild
  const lastInitType = useRef<VehicleType>("truck");
  const restoredDraftRef = useRef(false);

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
          base[sec.id] = {
            ...existing,
            applicable: isAlwaysRequiredSection(sec.id) ? true : existing.applicable,
            items,
          };
          continue;
        }

        const items: Record<string, ChoiceOrBlank> = {};
        for (const it of sec.items) items[it.key] = "";
        base[sec.id] = {
          applicable: isAlwaysRequiredSection(sec.id) ? true : false,
          name: "",
          items,
        };
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
  const [currentUserRole, setCurrentUserRole] = useState<Role | null>(null);

  // Read vehicle metadata from local storage (with short retries for timing).
  useEffect(() => {
    if (!vehicleId) return;

    const read = () => {
      const raw = localStorage.getItem(vehicleTypeKey(vehicleId));
      setVehicleType(isVehicleType(raw) ? raw : "truck");
      const savedMileage = localStorage.getItem(vehicleMileageKey(vehicleId));
      const parsedMileage = savedMileage ? Number(savedMileage) : NaN;
      if (Number.isFinite(parsedMileage) && parsedMileage > 0) {
        setMileage((prev) => (prev.trim() ? prev : String(parsedMileage)));
      }
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
    if (!vehicleId || restoredDraftRef.current) return;
    const raw = localStorage.getItem(inspectionDraftKey(vehicleId, type));
    if (!raw) {
      restoredDraftRef.current = true;
      return;
    }
    try {
      const draft = JSON.parse(raw) as {
        inspectionDate?: string;
        mileage?: string;
        employee?: string;
        dashLightsOn?: string[];
        sectionState?: StoredInspectionRecord["sections"];
        itemExtraValues?: Record<string, string>;
        failRequestLinks?: Record<string, string>;
        exiting?: Record<string, ChoiceOrBlank>;
        inspectionStatus?: "Pass" | "Fail - Maintenance Required" | "Out of Service" | "";
        notes?: string;
        employeeSignature?: string;
        managerSignature?: string;
        sectionEquipmentIds?: Record<string, string[]>;
        trailerVehicleIds?: string[];
        trailerVehicleLinks?: Record<string, string>;
      };
      if (typeof draft.inspectionDate === "string") setInspectionDate(draft.inspectionDate);
      if (typeof draft.mileage === "string") setMileage(draft.mileage);
      if (typeof draft.employee === "string") setEmployee(draft.employee);
      if (Array.isArray(draft.dashLightsOn)) setDashLightsOn(draft.dashLightsOn);
      if (draft.sectionState && typeof draft.sectionState === "object") setSectionState(draft.sectionState);
      if (draft.itemExtraValues && typeof draft.itemExtraValues === "object") setItemExtraValues(draft.itemExtraValues);
      if (draft.failRequestLinks && typeof draft.failRequestLinks === "object") setFailRequestLinks(draft.failRequestLinks);
      if (draft.exiting && typeof draft.exiting === "object") setExiting(draft.exiting);
      if (typeof draft.inspectionStatus === "string") setInspectionStatus(draft.inspectionStatus);
      if (typeof draft.notes === "string") setNotes(draft.notes);
      if (typeof draft.employeeSignature === "string") setEmployeeSignature(draft.employeeSignature);
      if (typeof draft.managerSignature === "string") setManagerSignature(draft.managerSignature);
      if (draft.sectionEquipmentIds && typeof draft.sectionEquipmentIds === "object") {
        setSectionEquipmentIds(draft.sectionEquipmentIds);
      }
      if (Array.isArray(draft.trailerVehicleIds)) {
        setTrailerVehicleIds(draft.trailerVehicleIds);
      }
      if (draft.trailerVehicleLinks && typeof draft.trailerVehicleLinks === "object") {
        setTrailerVehicleLinks(draft.trailerVehicleLinks);
      }
    } catch (error) {
      console.error("Failed to restore inspection draft:", error);
    } finally {
      restoredDraftRef.current = true;
    }
  }, [vehicleId, type]);

  useEffect(() => {
    setSectionState((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const sec of visibleSections) {
        if (!isAlwaysRequiredSection(sec.id)) continue;
        const existing = next[sec.id];
        if (existing && !existing.applicable) {
          next[sec.id] = { ...existing, applicable: true };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [visibleSections]);

  useEffect(() => {
    // Keep trailer UI closed by default and never include current vehicle in trailer-linked list.
    setTrailerVehiclePickerOpen(false);
    setTrailerVehicleIds((prev) => prev.filter((id) => id !== vehicleId));

    // Trailer section should not be open by default for non-truck assets.
    if (vehicleType !== "truck") {
      setSectionState((prev) => {
        const trailerState = prev.trailer;
        if (!trailerState) return prev;
        if (!trailerState.applicable && !(trailerState.name ?? "").trim()) return prev;
        return {
          ...prev,
          trailer: { ...trailerState, applicable: false, name: "" },
        };
      });
      setSectionEquipmentIds((prev) => {
        if (!prev.trailer) return prev;
        const next = { ...prev };
        delete next.trailer;
        return next;
      });
      setTrailerVehicleIds([]);
      setTrailerVehicleLinks({});
    }
  }, [vehicleId, vehicleType]);

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
          setCurrentUserRole("employee");
          return;
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", authData.user.id)
          .maybeSingle();
        setCurrentUserRole((profile?.role as Role | undefined) ?? "employee");
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const linkedRequestId = (searchParams.get("linkedRequestId") || "").trim();
    const linkSectionId = (searchParams.get("linkSectionId") || "").trim();
    const linkItemKey = (searchParams.get("linkItemKey") || "").trim();
    if (!linkedRequestId || !linkSectionId || !linkItemKey) return;
    setFailRequestLinks((prev) => ({
      ...prev,
      [failLinkKey(linkSectionId, linkItemKey)]: linkedRequestId,
    }));
  }, [searchParams]);

  useEffect(() => {
    const linkedInspectionId = (searchParams.get("linkedInspectionId") || "").trim();
    const linkedVehicleId = (searchParams.get("linkedVehicleId") || "").trim();
    if (!linkedInspectionId || !linkedVehicleId) return;
    setTrailerVehicleLinks((prev) => ({
      ...prev,
      [linkedVehicleId]: linkedInspectionId,
    }));
  }, [searchParams]);

  useEffect(() => {
    if (!vehicleId) return;
    let active = true;
    void (async () => {
      setEquipmentLoading(true);
      const supabase = createSupabaseBrowser();
      const { data, error } = await supabase
        .from("equipment")
        .select("id,name,equipment_type,status,asset_qr")
        .order("name", { ascending: true })
        .limit(500);
      if (!active) return;
      setEquipmentLoading(false);
      if (error) {
        console.error("Failed loading equipment options:", error);
        setEquipmentOptions([]);
        return;
      }
      setEquipmentOptions((data ?? []) as EquipmentOption[]);
    })();
    return () => {
      active = false;
    };
  }, [vehicleId]);

  useEffect(() => {
    if (!vehicleId) return;
    let active = true;
    void (async () => {
      setVehicleLoading(true);
      const supabase = createSupabaseBrowser();
      const { data, error } = await supabase
        .from("vehicles")
        .select("id,name,type,status")
        .order("name", { ascending: true })
        .limit(500);
      if (!active) return;
      setVehicleLoading(false);
      if (error) {
        console.error("Failed loading vehicle options:", error);
        setVehicleOptions([]);
        return;
      }
      setVehicleOptions((data ?? []) as VehicleOption[]);
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
      [secId]: {
        ...prev[secId],
        applicable: isAlwaysRequiredSection(secId) ? true : applicable,
      },
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

  function addDiagnosticCode(sectionId: string, itemKey: string) {
    const detailKey = failLinkKey(sectionId, itemKey);
    const incoming = (diagCodeDraftByItem[detailKey] ?? "").trim();
    if (!incoming) return;
    const existing = parseDiagnosticCodes(itemExtraValues[detailKey] || "");
    if (!existing.some((v) => v.toLowerCase() === incoming.toLowerCase())) {
      setItemExtraValues((prev) => ({
        ...prev,
        [detailKey]: [...existing, incoming].join(", "),
      }));
    }
    setDiagCodeDraftByItem((prev) => ({ ...prev, [detailKey]: "" }));
  }

  function removeDiagnosticCode(sectionId: string, itemKey: string, value: string) {
    const detailKey = failLinkKey(sectionId, itemKey);
    const next = parseDiagnosticCodes(itemExtraValues[detailKey] || "").filter(
      (v) => v.toLowerCase() !== value.toLowerCase()
    );
    setItemExtraValues((prev) => ({
      ...prev,
      [detailKey]: next.join(", "),
    }));
  }

  function toggleDashLight(option: string, checked: boolean) {
    setDashLightsOn((prev) => {
      if (checked) {
        if (option === "None") return ["None"];
        const withoutNone = prev.filter((v) => v !== "None");
        return withoutNone.includes(option) ? withoutNone : [...withoutNone, option];
      }
      return prev.filter((v) => v !== option);
    });
  }

  function setSectionSearch(sectionId: string, value: string) {
    setSectionEquipmentSearch((prev) => ({ ...prev, [sectionId]: value }));
  }

  function addSectionEquipment(sectionId: string, id: string) {
    setSectionEquipmentIds((prev) => {
      const current = prev[sectionId] ?? [];
      if (current.includes(id)) return prev;
      return { ...prev, [sectionId]: [...current, id] };
    });
  }

  function removeSectionEquipment(sectionId: string, id: string) {
    setSectionEquipmentIds((prev) => ({
      ...prev,
      [sectionId]: (prev[sectionId] ?? []).filter((x) => x !== id),
    }));
  }

  function setPickerMode(sectionId: string, mode: "search" | "scan") {
    setPickerModeBySection((prev) => ({ ...prev, [sectionId]: mode }));
    setPickerErrorBySection((prev) => ({ ...prev, [sectionId]: "" }));
  }

  function findEquipmentByQr(sectionId: string, rawValue: string) {
    const value = rawValue.trim();
    if (!value) return null;
    let lastSegment = "";
    try {
      const u = new URL(value);
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length) lastSegment = decodeURIComponent(parts[parts.length - 1]);
    } catch {
      // not URL
    }
    const scoped = equipmentOptions.filter((row) => equipmentMatchesSection(sectionId, row));
    const candidates = [value, value.toLowerCase(), lastSegment, lastSegment.toLowerCase()].filter(Boolean);
    for (const candidate of candidates) {
      const found = scoped.find((row) => {
        const id = row.id.trim();
        const name = (row.name ?? "").trim();
        const qr = (row.asset_qr ?? "").trim();
        return (
          id === candidate ||
          id.toLowerCase() === candidate.toLowerCase() ||
          qr === candidate ||
          qr.toLowerCase() === candidate.toLowerCase() ||
          name === candidate ||
          name.toLowerCase() === candidate.toLowerCase()
        );
      });
      if (found) return found;
    }
    return null;
  }

  function findSectionSelectionByQr(sectionId: string, rawValue: string) {
    const value = rawValue.trim();
    if (!value) return null;
    let lastSegment = "";
    try {
      const u = new URL(value);
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length) lastSegment = decodeURIComponent(parts[parts.length - 1]);
    } catch {
      // not URL
    }
    const scoped = equipmentOptions.filter((row) => sectionSelectionMatches(sectionId, row));
    const candidates = [value, value.toLowerCase(), lastSegment, lastSegment.toLowerCase()].filter(Boolean);
    for (const candidate of candidates) {
      const found = scoped.find((row) => {
        const id = row.id.trim();
        const name = (row.name ?? "").trim();
        const qr = (row.asset_qr ?? "").trim();
        return (
          id === candidate ||
          id.toLowerCase() === candidate.toLowerCase() ||
          qr === candidate ||
          qr.toLowerCase() === candidate.toLowerCase() ||
          name === candidate ||
          name.toLowerCase() === candidate.toLowerCase()
        );
      });
      if (found) return found;
    }
    return null;
  }

  function saveDraft() {
    if (!vehicleId) return;
    const draft = {
      inspectionDate,
      mileage,
      employee,
      dashLightsOn,
      sectionState,
      itemExtraValues,
      failRequestLinks,
      sectionEquipmentIds,
      exiting,
      inspectionStatus,
      notes,
      employeeSignature,
      managerSignature,
      trailerVehicleIds,
      trailerVehicleLinks,
    };
    localStorage.setItem(inspectionDraftKey(vehicleId, type), JSON.stringify(draft));
  }

  function addTrailerVehicle(id: string) {
    if (id === vehicleId) {
      setTrailerVehicleError("Current vehicle is already this inspection context. Select a different vehicle.");
      return;
    }
    setTrailerVehicleIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setTrailerVehicleError("");
  }

  function removeTrailerVehicle(id: string) {
    setTrailerVehicleIds((prev) => prev.filter((x) => x !== id));
    setTrailerVehicleLinks((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function findVehicleByQr(rawValue: string) {
    const value = rawValue.trim();
    if (!value) return null;
    let lastSegment = "";
    try {
      const u = new URL(value);
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length) lastSegment = decodeURIComponent(parts[parts.length - 1]);
    } catch {
      // not URL
    }
    const candidates = [value, value.toLowerCase(), lastSegment, lastSegment.toLowerCase()].filter(Boolean);
    for (const candidate of candidates) {
      const found = vehicleOptions.find((row) => {
        const id = row.id.trim();
        const name = (row.name ?? "").trim();
        return (
          id === candidate ||
          id.toLowerCase() === candidate.toLowerCase() ||
          name === candidate ||
          name.toLowerCase() === candidate.toLowerCase()
        );
      });
      if (found) return found;
    }
    return null;
  }

  function openVehicleInspectionForLink(targetVehicleId: string) {
    if (!vehicleId) return;
    saveDraft();
    const returnTo =
      typeof window !== "undefined"
        ? window.location.pathname
        : `/vehicles/${encodeURIComponent(vehicleId)}/forms/${type}`;
    const q = new URLSearchParams({
      returnTo,
      linkedVehicleId: targetVehicleId,
    });
    router.push(`/vehicles/${encodeURIComponent(targetVehicleId)}/forms/${type}?${q.toString()}`);
  }

  function openFullRequestForm(sectionId: string, item: InspectionItem, sectionTitle: string) {
    if (!vehicleId) return;
    if (currentUserRole === "apprentice") {
      alert("Apprentice role cannot submit maintenance requests. Link to an existing request instead.");
      return;
    }
    const parsedMileage = Number(mileage);
    if (!Number.isFinite(parsedMileage) || parsedMileage <= 0) {
      alert("Enter a valid mileage in this inspection before opening the maintenance request form.");
      return;
    }

    saveDraft();
    const returnTo =
      typeof window !== "undefined"
        ? window.location.pathname
        : `/vehicles/${encodeURIComponent(vehicleId)}/forms/${type}`;
    const q = new URLSearchParams({
      issue: item.label,
      identifiedDuring: getIssueIdentifiedDuring(type),
      systemAffected: mapSystemAffected(item.label),
      urgency: "High",
      details: itemExtraValues[failLinkKey(sectionId, item.key)] || "",
      sourceMileage: String(parsedMileage),
      returnTo,
      linkSectionId: sectionId,
      linkItemKey: item.key,
      sectionTitle,
    });
    router.push(`/vehicles/${encodeURIComponent(vehicleId)}/forms/maintenance-request?${q.toString()}`);
  }

  function openLinkCurrentRequestPage(sectionId: string, itemKey: string) {
    if (!vehicleId) return;
    const returnTo =
      typeof window !== "undefined"
        ? window.location.pathname
        : `/vehicles/${encodeURIComponent(vehicleId)}/forms/${type}`;
    const q = new URLSearchParams({
      returnTo,
      linkSectionId: sectionId,
      linkItemKey: itemKey,
    });
    router.push(`/vehicles/${encodeURIComponent(vehicleId)}/forms/link-current-request?${q.toString()}`);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!vehicleId) return alert("Missing vehicle ID in the URL.");

    const m = Number(mileage);
    if (!inspectionDate) return alert("Inspection date is required.");
    if (!Number.isFinite(m) || m <= 0) return alert("Enter a valid mileage.");
    if (!employee.trim()) return alert("Teammate is required.");
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
      if (
        st?.applicable &&
        sec.nameFieldLabel &&
        !isSectionEquipmentPicker(sec.id)
      ) {
        if (!st.name?.trim())
          return alert(
            `${sec.nameFieldLabel} is required when ${sec.title} is applicable.`
          );
      }
      if (st?.applicable && isSectionEquipmentPicker(sec.id) && sec.id !== "truck" && !st.name?.trim()) {
        return alert(`Select the ${sec.title} item for this section.`);
      }
      if (sec.id === "truck" && st?.applicable && dashLightsOn.length === 0) {
        return alert("Please select all dash lights on for Truck Inspection.");
      }
      if (st?.applicable && sectionUsesLoadoutBucket(sec.id)) {
        const selected = sectionEquipmentIds[sec.id] ?? [];
        if (selected.length === 0) {
          return alert(`Select at least one item for ${sec.title}.`);
        }
      }
      if (sec.id === "trailer" && st?.applicable) {
        for (const linkedVehicleId of trailerVehicleIds) {
          const linkedInspectionId = (trailerVehicleLinks[linkedVehicleId] || "").trim();
          if (!linkedInspectionId) {
            const v = vehicleOptions.find((row) => row.id === linkedVehicleId);
            return alert(
              `Complete the ${type === "pre-trip" ? "Pre-Trip" : "Post-Trip"} inspection for linked vehicle "${v?.name ?? linkedVehicleId}" before submitting.`
            );
          }
        }
      }
      if (st?.applicable) {
        for (const it of sec.items) {
          const value = st.items?.[it.key] as ChoiceOrBlank;
          if (!value) return alert(`Please answer all checklist items before submitting.`);
          const extraCfg = extraFieldConfig(it.key);
          if (extraCfg?.required) {
            const extraVal = (itemExtraValues[failLinkKey(sec.id, it.key)] || "").trim();
            if (!extraVal) {
              return alert(`${extraCfg.label} is required for "${it.label}".`);
            }
          }
          if (value === "fail") {
            const link = (failRequestLinks[failLinkKey(sec.id, it.key)] || "").trim();
            if (!link) {
              return alert(`Complete the maintenance request form for failed item: "${it.label}".`);
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
          return alert(`Complete the maintenance request form for failed item: "${it.label}".`);
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
      sectionEquipmentIds,
      sectionEquipment: Object.fromEntries(
        Object.entries(sectionEquipmentIds).map(([sectionId, ids]) => [
          sectionId,
          equipmentOptions
            .filter((row) => ids.includes(row.id))
            .map((row) => ({
              id: row.id,
              name: row.name ?? row.id,
              equipment_type: row.equipment_type ?? null,
            })),
        ])
      ),
      trailerSelection:
        sectionState.trailer?.name && equipmentOptions.length
          ? (() => {
              const selected = equipmentOptions.find((row) => row.id === sectionState.trailer?.name);
              if (!selected) return { id: sectionState.trailer?.name };
              return {
                id: selected.id,
                name: selected.name ?? selected.id,
                equipment_type: selected.equipment_type ?? null,
              };
            })()
          : null,
      trailerLoadoutVehicles: trailerVehicleIds.map((id) => {
        const v = vehicleOptions.find((row) => row.id === id);
        return {
          id,
          name: v?.name ?? id,
          type: v?.type ?? null,
          linkedInspectionId: trailerVehicleLinks[id] ?? null,
        };
      }),
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
        localStorage.setItem(vehicleMileageKey(vehicleId), String(nextMileage));
      }
    } catch (vehicleMileageError) {
      console.error("Unexpected vehicle mileage sync error:", vehicleMileageError);
      localStorage.setItem(vehicleMileageKey(vehicleId), String(m));
    }

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

    localStorage.removeItem(inspectionDraftKey(vehicleId, type));

    const returnTo = (searchParams.get("returnTo") || "").trim();
    const linkedVehicleId = (searchParams.get("linkedVehicleId") || "").trim();
    if (insertedInspection?.id && returnTo && linkedVehicleId && typeof window !== "undefined") {
      try {
        const back = new URL(returnTo, window.location.origin);
        back.searchParams.set("linkedInspectionId", insertedInspection.id);
        back.searchParams.set("linkedVehicleId", linkedVehicleId);
        router.replace(`${back.pathname}${back.search}`);
        return;
      } catch (error) {
        console.error("Failed to build return URL for linked vehicle inspection:", error);
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

          </div>
        </div>

        {/* Sections */}
        <div style={{ marginTop: 16, display: "grid", gap: 16 }}>
          {visibleSections.map((sec) => {
            const st = sectionState[sec.id];
            if (!st) return null;
            const truckLoadoutAnchorKey = sec.items.some((item) => item.key === "equipment_secured")
              ? "equipment_secured"
              : sec.items.some((item) => item.key === "equipment_secured_next_day")
                ? "equipment_secured_next_day"
                : sec.items.some((item) => item.key === "equipment_clean_operational")
                  ? "equipment_clean_operational"
                  : "";
            const trailerLoadoutAnchorKey = sec.items.some((item) => item.key === "equipment_loaded")
              ? "equipment_loaded"
              : sec.items.some((item) => item.key === "equipment_checked")
                ? "equipment_checked"
                : sec.items[0]?.key ?? "";

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
                      cursor: isAlwaysRequiredSection(sec.id) ? "default" : "pointer",
                    }}
                  >
                    {isAlwaysRequiredSection(sec.id) ? (
                      <span style={{ fontWeight: 800, opacity: 0.88 }}>Required</span>
                    ) : (
                      <>
                        <input
                          type="checkbox"
                          checked={!!st.applicable}
                          onChange={(e) => setApplicable(sec.id, e.target.checked)}
                        />
                        <span style={{ fontWeight: 800 }}>Applicable</span>
                      </>
                    )}
                  </label>
                </div>

                {/* Optional name field when applicable */}
                {st.applicable && isSectionEquipmentPicker(sec.id) && sec.id !== "truck" ? (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>
                      {SECTION_EQUIPMENT_PICKERS[sec.id] || `${sec.title} Selection`} *
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                      Add by searching or scanning QR, then select.
                    </div>
                    <div style={{ marginTop: 10 }}>
                      {st.name?.trim() ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: 10,
                            padding: 8,
                            background: "rgba(255,255,255,0.02)",
                          }}
                        >
                          <div>
                            {(() => {
                              const row = equipmentOptions.find((r) => r.id === st.name);
                              return (
                                <span>
                                  <strong>{row?.name ?? st.name}</strong>
                                  <span style={{ opacity: 0.72 }}>
                                    {" "}
                                    · {row?.equipment_type ?? "Unspecified"}
                                  </span>
                                </span>
                              );
                            })()}
                          </div>
                          <button
                            type="button"
                            style={secondaryButtonStyle()}
                            onClick={() => setSectionName(sec.id, "")}
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, opacity: 0.72 }}>No item selected yet.</div>
                      )}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        style={buttonStyle()}
                        onClick={() => {
                          setSectionSelectOpenId(sec.id);
                          setSectionSelectModeById((prev) => ({ ...prev, [sec.id]: prev[sec.id] ?? "search" }));
                          setSectionSelectErrorById((prev) => ({ ...prev, [sec.id]: "" }));
                        }}
                      >
                        Add Equipment
                      </button>
                    </div>
                    {sectionSelectOpenId === sec.id ? (
                      <div
                        style={{
                          marginTop: 10,
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 12,
                          padding: 10,
                          background: "rgba(255,255,255,0.02)",
                          display: "grid",
                          gap: 8,
                        }}
                      >
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            style={sectionSelectModeById[sec.id] === "scan" ? secondaryButtonStyle() : buttonStyle()}
                            onClick={() => setSectionSelectModeById((prev) => ({ ...prev, [sec.id]: "search" }))}
                          >
                            Search
                          </button>
                          <button
                            type="button"
                            style={sectionSelectModeById[sec.id] === "scan" ? buttonStyle() : secondaryButtonStyle()}
                            onClick={() => setSectionSelectModeById((prev) => ({ ...prev, [sec.id]: "scan" }))}
                          >
                            Scan QR
                          </button>
                          <button
                            type="button"
                            style={secondaryButtonStyle()}
                            onClick={() => setSectionSelectOpenId(null)}
                          >
                            Close
                          </button>
                        </div>
                        {(sectionSelectModeById[sec.id] ?? "search") === "search" ? (
                          <>
                            <input
                              value={sectionSelectSearchById[sec.id] ?? ""}
                              onChange={(e) =>
                                setSectionSelectSearchById((prev) => ({ ...prev, [sec.id]: e.target.value }))
                              }
                              placeholder={`Search ${sec.title.toLowerCase()}...`}
                              style={inputStyle()}
                            />
                            <div
                              style={{
                                border: "1px solid rgba(255,255,255,0.12)",
                                borderRadius: 10,
                                padding: 10,
                                maxHeight: 200,
                                overflowY: "auto",
                                display: "grid",
                                gap: 8,
                              }}
                            >
                              {equipmentLoading ? (
                                <div style={{ opacity: 0.72 }}>Loading equipment...</div>
                              ) : (
                                (() => {
                                  const q = (sectionSelectSearchById[sec.id] ?? "").trim().toLowerCase();
                                  const visible = equipmentOptions
                                    .filter((row) => sectionSelectionMatches(sec.id, row))
                                    .filter((row) => {
                                      if (!q) return true;
                                      const hay = `${row.name ?? ""} ${row.equipment_type ?? ""} ${row.id}`.toLowerCase();
                                      return hay.includes(q);
                                    });
                                  if (!visible.length) return <div style={{ opacity: 0.72 }}>No matching items found.</div>;
                                  return visible.map((row) => (
                                    <button
                                      key={row.id}
                                      type="button"
                                      style={{ textAlign: "left", ...secondaryButtonStyle() }}
                                      onClick={() => {
                                        setSectionName(sec.id, row.id);
                                        setSectionSelectErrorById((prev) => ({ ...prev, [sec.id]: "" }));
                                      }}
                                    >
                                      <strong>{row.name ?? row.id}</strong>
                                      <span style={{ opacity: 0.72 }}>
                                        {" "}
                                        · {row.equipment_type ?? "Unspecified"}
                                      </span>
                                    </button>
                                  ));
                                })()
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <input
                              value={sectionSelectScanById[sec.id] ?? ""}
                              onChange={(e) =>
                                setSectionSelectScanById((prev) => ({ ...prev, [sec.id]: e.target.value }))
                              }
                              placeholder={`Scan or paste ${sec.title.toLowerCase()} QR value`}
                              style={inputStyle()}
                            />
                            <button
                              type="button"
                              style={buttonStyle()}
                              onClick={() => {
                                const found = findSectionSelectionByQr(sec.id, sectionSelectScanById[sec.id] ?? "");
                                if (!found) {
                                  setSectionSelectErrorById((prev) => ({
                                    ...prev,
                                    [sec.id]: `No matching ${sec.title.toLowerCase()} found.`,
                                  }));
                                  return;
                                }
                                setSectionName(sec.id, found.id);
                                setSectionSelectScanById((prev) => ({ ...prev, [sec.id]: "" }));
                                setSectionSelectErrorById((prev) => ({ ...prev, [sec.id]: "" }));
                              }}
                            >
                              Select
                            </button>
                            <div style={{ fontSize: 12, opacity: 0.72 }}>
                              Use your scanner/camera app and paste or scan into this field.
                            </div>
                          </>
                        )}
                        {sectionSelectErrorById[sec.id] ? (
                          <div style={{ fontSize: 12, color: "#ff9d9d" }}>{sectionSelectErrorById[sec.id]}</div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {st.applicable && sec.nameFieldLabel && !isSectionEquipmentPicker(sec.id) ? (
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

                {st.applicable && isSectionEquipmentPicker(sec.id) && sectionUsesLoadoutBucket(sec.id) && sec.id !== "truck" && sec.id !== "trailer" ? (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{SECTION_EQUIPMENT_PICKERS[sec.id]} *</div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                      Add equipment one-by-one to the selected bucket for this section.
                    </div>
                    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                      {(sectionEquipmentIds[sec.id] ?? []).length === 0 ? (
                        <div style={{ fontSize: 12, opacity: 0.72 }}>No equipment added yet.</div>
                      ) : (
                        (sectionEquipmentIds[sec.id] ?? []).map((id) => {
                          const row = equipmentOptions.find((opt) => opt.id === id);
                          return (
                            <div
                              key={id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                                border: "1px solid rgba(255,255,255,0.12)",
                                borderRadius: 10,
                                padding: 8,
                                background: "rgba(255,255,255,0.02)",
                              }}
                            >
                              <div>
                                <strong>{row?.name ?? id}</strong>
                                <span style={{ opacity: 0.72 }}>
                                  {" "}
                                  · {row?.equipment_type ?? "Unspecified"}
                                </span>
                              </div>
                              <button
                                type="button"
                                style={secondaryButtonStyle()}
                                onClick={() => removeSectionEquipment(sec.id, id)}
                              >
                                Remove
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        style={buttonStyle()}
                        onClick={() => {
                          setPickerOpenSectionId(sec.id);
                          setPickerMode(sec.id, pickerModeBySection[sec.id] ?? "search");
                        }}
                      >
                        Add Equipment
                      </button>
                    </div>
                    {pickerOpenSectionId === sec.id ? (
                      <div
                        style={{
                          marginTop: 10,
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 12,
                          padding: 10,
                          background: "rgba(255,255,255,0.02)",
                          display: "grid",
                          gap: 8,
                        }}
                      >
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            style={pickerModeBySection[sec.id] === "scan" ? secondaryButtonStyle() : buttonStyle()}
                            onClick={() => setPickerMode(sec.id, "search")}
                          >
                            Search
                          </button>
                          <button
                            type="button"
                            style={pickerModeBySection[sec.id] === "scan" ? buttonStyle() : secondaryButtonStyle()}
                            onClick={() => setPickerMode(sec.id, "scan")}
                          >
                            Scan QR
                          </button>
                          <button
                            type="button"
                            style={secondaryButtonStyle()}
                            onClick={() => setPickerOpenSectionId(null)}
                          >
                            Close
                          </button>
                        </div>
                        {(pickerModeBySection[sec.id] ?? "search") === "search" ? (
                          <>
                            <input
                              value={sectionEquipmentSearch[sec.id] ?? ""}
                              onChange={(e) => setSectionSearch(sec.id, e.target.value)}
                              placeholder="Search equipment..."
                              style={inputStyle()}
                            />
                            <div
                              style={{
                                border: "1px solid rgba(255,255,255,0.12)",
                                borderRadius: 10,
                                padding: 10,
                                maxHeight: 200,
                                overflowY: "auto",
                                display: "grid",
                                gap: 8,
                              }}
                            >
                              {equipmentLoading ? (
                                <div style={{ opacity: 0.72 }}>Loading equipment...</div>
                              ) : (
                                (() => {
                                  const q = (sectionEquipmentSearch[sec.id] ?? "").trim().toLowerCase();
                                  const visible = equipmentOptions
                                    .filter((row) => equipmentMatchesSection(sec.id, row))
                                    .filter((row) => {
                                      if (!q) return true;
                                      const hay = `${row.name ?? ""} ${row.equipment_type ?? ""} ${row.id}`.toLowerCase();
                                      return hay.includes(q);
                                    });
                                  if (!visible.length) {
                                    return <div style={{ opacity: 0.72 }}>No matching equipment found.</div>;
                                  }
                                  return visible.map((row) => (
                                    <button
                                      key={row.id}
                                      type="button"
                                      style={{
                                        textAlign: "left",
                                        ...secondaryButtonStyle(),
                                      }}
                                      onClick={() => {
                                        addSectionEquipment(sec.id, row.id);
                                        setPickerErrorBySection((prev) => ({ ...prev, [sec.id]: "" }));
                                      }}
                                    >
                                      <strong>{row.name ?? row.id}</strong>
                                      <span style={{ opacity: 0.72 }}>
                                        {" "}
                                        · {row.equipment_type ?? "Unspecified"}
                                      </span>
                                    </button>
                                  ));
                                })()
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <input
                              value={pickerScanValueBySection[sec.id] ?? ""}
                              onChange={(e) =>
                                setPickerScanValueBySection((prev) => ({ ...prev, [sec.id]: e.target.value }))
                              }
                              placeholder="Scan or paste equipment QR value"
                              style={inputStyle()}
                            />
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                style={buttonStyle()}
                                onClick={() => {
                                  const found = findEquipmentByQr(sec.id, pickerScanValueBySection[sec.id] ?? "");
                                  if (!found) {
                                    setPickerErrorBySection((prev) => ({
                                      ...prev,
                                      [sec.id]: "No matching equipment found for this section.",
                                    }));
                                    return;
                                  }
                                  addSectionEquipment(sec.id, found.id);
                                  setPickerScanValueBySection((prev) => ({ ...prev, [sec.id]: "" }));
                                  setPickerErrorBySection((prev) => ({ ...prev, [sec.id]: "" }));
                                }}
                              >
                                Add Equipment
                              </button>
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.72 }}>
                              Tip: You can use your phone scanner or hardware scanner and paste/scan the value here.
                            </div>
                          </>
                        )}
                        {pickerErrorBySection[sec.id] ? (
                          <div style={{ fontSize: 12, color: "#ff9d9d" }}>{pickerErrorBySection[sec.id]}</div>
                        ) : null}
                      </div>
                    ) : null}
                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                      Selected: <strong>{(sectionEquipmentIds[sec.id] ?? []).length}</strong>
                    </div>
                  </div>
                ) : null}

                {st.applicable && sec.id === "trailer" && false ? (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>Trailer Loadout Vehicles</div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                      Add each vehicle in this trailer loadout. Added vehicles must complete their own{" "}
                      {type === "pre-trip" ? "Pre-Trip" : "Post-Trip"} inspection before this form can submit.
                    </div>
                    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                      {trailerVehicleIds.length === 0 ? (
                        <div style={{ fontSize: 12, opacity: 0.72 }}>No vehicles added yet.</div>
                      ) : (
                        trailerVehicleIds.map((id) => {
                          const row = vehicleOptions.find((opt) => opt.id === id);
                          const linked = (trailerVehicleLinks[id] || "").trim();
                          return (
                            <div
                              key={id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                                border: "1px solid rgba(255,255,255,0.12)",
                                borderRadius: 10,
                                padding: 8,
                                background: "rgba(255,255,255,0.02)",
                              }}
                            >
                              <div style={{ display: "grid", gap: 4 }}>
                                <div>
                                  <strong>{row?.name ?? id}</strong>
                                  <span style={{ opacity: 0.72 }}>
                                    {" "}
                                    · {row?.type ?? "Unspecified"}
                                  </span>
                                </div>
                                <div style={{ fontSize: 12, opacity: linked ? 0.95 : 0.72 }}>
                                  {linked
                                    ? `Linked ${type === "pre-trip" ? "Pre-Trip" : "Post-Trip"}: ${linked}`
                                    : `No linked ${type === "pre-trip" ? "Pre-Trip" : "Post-Trip"} yet`}
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  style={buttonStyle()}
                                  onClick={() => openVehicleInspectionForLink(id)}
                                >
                                  {linked
                                    ? `Update ${type === "pre-trip" ? "Pre-Trip" : "Post-Trip"}`
                                    : `Complete ${type === "pre-trip" ? "Pre-Trip" : "Post-Trip"}`}
                                </button>
                                <button
                                  type="button"
                                  style={secondaryButtonStyle()}
                                  onClick={() => removeTrailerVehicle(id)}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        style={buttonStyle()}
                        onClick={() => {
                          setTrailerVehiclePickerOpen(true);
                          setTrailerVehicleError("");
                        }}
                      >
                        Add Vehicle
                      </button>
                    </div>
                    {trailerVehiclePickerOpen ? (
                      <div
                        style={{
                          marginTop: 10,
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 12,
                          padding: 10,
                          background: "rgba(255,255,255,0.02)",
                          display: "grid",
                          gap: 8,
                        }}
                      >
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            style={trailerVehiclePickerMode === "scan" ? secondaryButtonStyle() : buttonStyle()}
                            onClick={() => {
                              setTrailerVehiclePickerMode("search");
                              setTrailerVehicleError("");
                            }}
                          >
                            Search
                          </button>
                          <button
                            type="button"
                            style={trailerVehiclePickerMode === "scan" ? buttonStyle() : secondaryButtonStyle()}
                            onClick={() => {
                              setTrailerVehiclePickerMode("scan");
                              setTrailerVehicleError("");
                            }}
                          >
                            Scan QR
                          </button>
                          <button
                            type="button"
                            style={secondaryButtonStyle()}
                            onClick={() => setTrailerVehiclePickerOpen(false)}
                          >
                            Close
                          </button>
                        </div>
                        {trailerVehiclePickerMode === "search" ? (
                          <>
                            <input
                              value={trailerVehicleSearch}
                              onChange={(e) => setTrailerVehicleSearch(e.target.value)}
                              placeholder="Search vehicles..."
                              style={inputStyle()}
                            />
                            <div
                              style={{
                                border: "1px solid rgba(255,255,255,0.12)",
                                borderRadius: 10,
                                padding: 10,
                                maxHeight: 200,
                                overflowY: "auto",
                                display: "grid",
                                gap: 8,
                              }}
                            >
                              {vehicleLoading ? (
                                <div style={{ opacity: 0.72 }}>Loading vehicles...</div>
                              ) : (
                                (() => {
                                  const q = trailerVehicleSearch.trim().toLowerCase();
                                  const visible = vehicleOptions
                                    .filter((row) => row.id !== vehicleId)
                                    .filter((row) => {
                                      if (!q) return true;
                                      const hay = `${row.name ?? ""} ${row.type ?? ""} ${row.id}`.toLowerCase();
                                      return hay.includes(q);
                                    });
                                  if (!visible.length) {
                                    return <div style={{ opacity: 0.72 }}>No matching vehicles found.</div>;
                                  }
                                  return visible.map((row) => (
                                    <button
                                      key={row.id}
                                      type="button"
                                      style={{ textAlign: "left", ...secondaryButtonStyle() }}
                                      onClick={() => addTrailerVehicle(row.id)}
                                    >
                                      <strong>{row.name ?? row.id}</strong>
                                      <span style={{ opacity: 0.72 }}>
                                        {" "}
                                        · {row.type ?? "Unspecified"}
                                      </span>
                                    </button>
                                  ));
                                })()
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <input
                              value={trailerVehicleScanValue}
                              onChange={(e) => setTrailerVehicleScanValue(e.target.value)}
                              placeholder="Scan or paste vehicle QR value"
                              style={inputStyle()}
                            />
                            <button
                              type="button"
                              style={buttonStyle()}
                              onClick={() => {
                                const found = findVehicleByQr(trailerVehicleScanValue);
                                if (!found) {
                                  setTrailerVehicleError("No matching vehicle found.");
                                  return;
                                }
                                addTrailerVehicle(found.id);
                                setTrailerVehicleScanValue("");
                              }}
                            >
                              Add Vehicle
                            </button>
                            <div style={{ fontSize: 12, opacity: 0.72 }}>
                              Use your scanner/camera app and paste or scan into this field.
                            </div>
                          </>
                        )}
                        {trailerVehicleError ? (
                          <div style={{ fontSize: 12, color: "#ff9d9d" }}>{trailerVehicleError}</div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* Items (only show when applicable) */}
                {st.applicable ? (
                  <>
                    <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                      {sec.items.map((it) => (
                      <React.Fragment key={it.key}>
                      {sec.id === "truck" && it.key === truckLoadoutAnchorKey ? (
                        <div
                          style={{
                            padding: 12,
                            borderRadius: 12,
                            border: "1px solid rgba(255,255,255,0.12)",
                            background: "rgba(255,255,255,0.02)",
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>Truck Loadout Equipment *</div>
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                            Add equipment one-by-one to the selected bucket for this section.
                          </div>
                          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                            {(sectionEquipmentIds[sec.id] ?? []).length === 0 ? (
                              <div style={{ fontSize: 12, opacity: 0.72 }}>No equipment added yet.</div>
                            ) : (
                              (sectionEquipmentIds[sec.id] ?? []).map((id) => {
                                const row = equipmentOptions.find((opt) => opt.id === id);
                                return (
                                  <div
                                    key={id}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      gap: 8,
                                      border: "1px solid rgba(255,255,255,0.12)",
                                      borderRadius: 10,
                                      padding: 8,
                                      background: "rgba(255,255,255,0.02)",
                                    }}
                                  >
                                    <div>
                                      <strong>{row?.name ?? id}</strong>
                                      <span style={{ opacity: 0.72 }}>
                                        {" "}
                                        · {row?.equipment_type ?? "Unspecified"}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      style={secondaryButtonStyle()}
                                      onClick={() => removeSectionEquipment(sec.id, id)}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                );
                              })
                            )}
                          </div>
                          <div style={{ marginTop: 10 }}>
                            <button
                              type="button"
                              style={buttonStyle()}
                              onClick={() => {
                                setPickerOpenSectionId(sec.id);
                                setPickerMode(sec.id, pickerModeBySection[sec.id] ?? "search");
                              }}
                            >
                              Add Equipment
                            </button>
                          </div>
                          {pickerOpenSectionId === sec.id ? (
                            <div
                              style={{
                                marginTop: 10,
                                border: "1px solid rgba(255,255,255,0.12)",
                                borderRadius: 12,
                                padding: 10,
                                background: "rgba(255,255,255,0.02)",
                                display: "grid",
                                gap: 8,
                              }}
                            >
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  style={pickerModeBySection[sec.id] === "scan" ? secondaryButtonStyle() : buttonStyle()}
                                  onClick={() => setPickerMode(sec.id, "search")}
                                >
                                  Search
                                </button>
                                <button
                                  type="button"
                                  style={pickerModeBySection[sec.id] === "scan" ? buttonStyle() : secondaryButtonStyle()}
                                  onClick={() => setPickerMode(sec.id, "scan")}
                                >
                                  Scan QR
                                </button>
                                <button
                                  type="button"
                                  style={secondaryButtonStyle()}
                                  onClick={() => setPickerOpenSectionId(null)}
                                >
                                  Close
                                </button>
                              </div>
                              {(pickerModeBySection[sec.id] ?? "search") === "search" ? (
                                <>
                                  <input
                                    value={sectionEquipmentSearch[sec.id] ?? ""}
                                    onChange={(e) => setSectionSearch(sec.id, e.target.value)}
                                    placeholder="Search equipment..."
                                    style={inputStyle()}
                                  />
                                  <div
                                    style={{
                                      border: "1px solid rgba(255,255,255,0.12)",
                                      borderRadius: 10,
                                      padding: 10,
                                      maxHeight: 200,
                                      overflowY: "auto",
                                      display: "grid",
                                      gap: 8,
                                    }}
                                  >
                                    {equipmentLoading ? (
                                      <div style={{ opacity: 0.72 }}>Loading equipment...</div>
                                    ) : (
                                      (() => {
                                        const q = (sectionEquipmentSearch[sec.id] ?? "").trim().toLowerCase();
                                        const visible = equipmentOptions
                                          .filter((row) => equipmentMatchesSection(sec.id, row))
                                          .filter((row) => {
                                            if (!q) return true;
                                            const hay = `${row.name ?? ""} ${row.equipment_type ?? ""} ${row.id}`.toLowerCase();
                                            return hay.includes(q);
                                          });
                                        if (!visible.length) {
                                          return <div style={{ opacity: 0.72 }}>No matching equipment found.</div>;
                                        }
                                        return visible.map((row) => (
                                          <button
                                            key={row.id}
                                            type="button"
                                            style={{ textAlign: "left", ...secondaryButtonStyle() }}
                                            onClick={() => {
                                              addSectionEquipment(sec.id, row.id);
                                              setPickerErrorBySection((prev) => ({ ...prev, [sec.id]: "" }));
                                            }}
                                          >
                                            <strong>{row.name ?? row.id}</strong>
                                            <span style={{ opacity: 0.72 }}>
                                              {" "}
                                              · {row.equipment_type ?? "Unspecified"}
                                            </span>
                                          </button>
                                        ));
                                      })()
                                    )}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <input
                                    value={pickerScanValueBySection[sec.id] ?? ""}
                                    onChange={(e) =>
                                      setPickerScanValueBySection((prev) => ({ ...prev, [sec.id]: e.target.value }))
                                    }
                                    placeholder="Scan or paste equipment QR value"
                                    style={inputStyle()}
                                  />
                                  <button
                                    type="button"
                                    style={buttonStyle()}
                                    onClick={() => {
                                      const found = findEquipmentByQr(sec.id, pickerScanValueBySection[sec.id] ?? "");
                                      if (!found) {
                                        setPickerErrorBySection((prev) => ({
                                          ...prev,
                                          [sec.id]: "No matching equipment found for this section.",
                                        }));
                                        return;
                                      }
                                      addSectionEquipment(sec.id, found.id);
                                      setPickerScanValueBySection((prev) => ({ ...prev, [sec.id]: "" }));
                                      setPickerErrorBySection((prev) => ({ ...prev, [sec.id]: "" }));
                                    }}
                                  >
                                    Add Equipment
                                  </button>
                                </>
                              )}
                              {pickerErrorBySection[sec.id] ? (
                                <div style={{ fontSize: 12, color: "#ff9d9d" }}>{pickerErrorBySection[sec.id]}</div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {sec.id === "trailer" && it.key === trailerLoadoutAnchorKey ? (
                        <div
                          style={{
                            padding: 12,
                            borderRadius: 12,
                            border: "1px solid rgba(255,255,255,0.12)",
                            background: "rgba(255,255,255,0.02)",
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>Trailer Identification - Equipment and Vehicles *</div>
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                            Add loadout equipment and loadout vehicles. Linked vehicles must complete their own{" "}
                            {type === "pre-trip" ? "Pre-Trip" : "Post-Trip"} inspection before this form can submit.
                          </div>
                          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, opacity: 0.8 }}>Equipment</div>
                          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                            {(sectionEquipmentIds[sec.id] ?? []).length === 0 ? (
                              <div style={{ fontSize: 12, opacity: 0.72 }}>No equipment added yet.</div>
                            ) : (
                              (sectionEquipmentIds[sec.id] ?? []).map((id) => {
                                const row = equipmentOptions.find((opt) => opt.id === id);
                                return (
                                  <div key={id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 8, background: "rgba(255,255,255,0.02)" }}>
                                    <div>
                                      <strong>{row?.name ?? id}</strong>
                                      <span style={{ opacity: 0.72 }}>
                                        {" "}
                                        · {row?.equipment_type ?? "Unspecified"}
                                      </span>
                                    </div>
                                    <button type="button" style={secondaryButtonStyle()} onClick={() => removeSectionEquipment(sec.id, id)}>
                                      Remove
                                    </button>
                                  </div>
                                );
                              })
                            )}
                          </div>
                          <div style={{ marginTop: 10 }}>
                            <button
                              type="button"
                              style={buttonStyle()}
                              onClick={() => {
                                setPickerOpenSectionId(sec.id);
                                setPickerMode(sec.id, pickerModeBySection[sec.id] ?? "search");
                              }}
                            >
                              Add Equipment
                            </button>
                          </div>
                          {pickerOpenSectionId === sec.id ? (
                            <div style={{ marginTop: 10, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 10, background: "rgba(255,255,255,0.02)", display: "grid", gap: 8 }}>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button type="button" style={pickerModeBySection[sec.id] === "scan" ? secondaryButtonStyle() : buttonStyle()} onClick={() => setPickerMode(sec.id, "search")}>Search</button>
                                <button type="button" style={pickerModeBySection[sec.id] === "scan" ? buttonStyle() : secondaryButtonStyle()} onClick={() => setPickerMode(sec.id, "scan")}>Scan QR</button>
                                <button type="button" style={secondaryButtonStyle()} onClick={() => setPickerOpenSectionId(null)}>Close</button>
                              </div>
                              {(pickerModeBySection[sec.id] ?? "search") === "search" ? (
                                <>
                                  <input value={sectionEquipmentSearch[sec.id] ?? ""} onChange={(e) => setSectionSearch(sec.id, e.target.value)} placeholder="Search equipment..." style={inputStyle()} />
                                  <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, maxHeight: 200, overflowY: "auto", display: "grid", gap: 8 }}>
                                    {equipmentLoading ? <div style={{ opacity: 0.72 }}>Loading equipment...</div> : (() => {
                                      const q = (sectionEquipmentSearch[sec.id] ?? "").trim().toLowerCase();
                                      const visible = equipmentOptions.filter((row) => equipmentMatchesSection(sec.id, row)).filter((row) => {
                                        if (!q) return true;
                                        const hay = `${row.name ?? ""} ${row.equipment_type ?? ""} ${row.id}`.toLowerCase();
                                        return hay.includes(q);
                                      });
                                      if (!visible.length) return <div style={{ opacity: 0.72 }}>No matching equipment found.</div>;
                                      return visible.map((row) => (
                                        <button key={row.id} type="button" style={{ textAlign: "left", ...secondaryButtonStyle() }} onClick={() => {
                                          addSectionEquipment(sec.id, row.id);
                                          setPickerErrorBySection((prev) => ({ ...prev, [sec.id]: "" }));
                                        }}>
                                          <strong>{row.name ?? row.id}</strong>
                                          <span style={{ opacity: 0.72 }}> · {row.equipment_type ?? "Unspecified"}</span>
                                        </button>
                                      ));
                                    })()}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <input value={pickerScanValueBySection[sec.id] ?? ""} onChange={(e) => setPickerScanValueBySection((prev) => ({ ...prev, [sec.id]: e.target.value }))} placeholder="Scan or paste equipment QR value" style={inputStyle()} />
                                  <button type="button" style={buttonStyle()} onClick={() => {
                                    const found = findEquipmentByQr(sec.id, pickerScanValueBySection[sec.id] ?? "");
                                    if (!found) {
                                      setPickerErrorBySection((prev) => ({ ...prev, [sec.id]: "No matching equipment found for this section." }));
                                      return;
                                    }
                                    addSectionEquipment(sec.id, found.id);
                                    setPickerScanValueBySection((prev) => ({ ...prev, [sec.id]: "" }));
                                    setPickerErrorBySection((prev) => ({ ...prev, [sec.id]: "" }));
                                  }}>Add Equipment</button>
                                </>
                              )}
                              {pickerErrorBySection[sec.id] ? (
                                <div style={{ fontSize: 12, color: "#ff9d9d" }}>{pickerErrorBySection[sec.id]}</div>
                              ) : null}
                            </div>
                          ) : null}
                          <div style={{ marginTop: 12, fontSize: 12, fontWeight: 800, opacity: 0.8 }}>Vehicles</div>
                          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                            {trailerVehicleIds.length === 0 ? (
                              <div style={{ fontSize: 12, opacity: 0.72 }}>No vehicles added yet.</div>
                            ) : (
                              trailerVehicleIds.map((id) => {
                                const row = vehicleOptions.find((opt) => opt.id === id);
                                const linked = (trailerVehicleLinks[id] || "").trim();
                                return (
                                  <div key={id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 8, background: "rgba(255,255,255,0.02)" }}>
                                    <div style={{ display: "grid", gap: 4 }}>
                                      <div>
                                        <strong>{row?.name ?? id}</strong>
                                        <span style={{ opacity: 0.72 }}> · {row?.type ?? "Unspecified"}</span>
                                      </div>
                                      <div style={{ fontSize: 12, opacity: linked ? 0.95 : 0.72 }}>
                                        {linked
                                          ? `Linked ${type === "pre-trip" ? "Pre-Trip" : "Post-Trip"}: ${linked}`
                                          : `No linked ${type === "pre-trip" ? "Pre-Trip" : "Post-Trip"} yet`}
                                      </div>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                      <button type="button" style={buttonStyle()} onClick={() => openVehicleInspectionForLink(id)}>
                                        {linked ? `Update ${type === "pre-trip" ? "Pre-Trip" : "Post-Trip"}` : `Complete ${type === "pre-trip" ? "Pre-Trip" : "Post-Trip"}`}
                                      </button>
                                      <button type="button" style={secondaryButtonStyle()} onClick={() => removeTrailerVehicle(id)}>
                                        Remove
                                      </button>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                          <div style={{ marginTop: 10 }}>
                            <button type="button" style={buttonStyle()} onClick={() => {
                              setTrailerVehiclePickerOpen(true);
                              setTrailerVehicleError("");
                            }}>
                              Add Vehicle
                            </button>
                          </div>
                          {trailerVehiclePickerOpen ? (
                            <div style={{ marginTop: 10, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 10, background: "rgba(255,255,255,0.02)", display: "grid", gap: 8 }}>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button type="button" style={trailerVehiclePickerMode === "scan" ? secondaryButtonStyle() : buttonStyle()} onClick={() => { setTrailerVehiclePickerMode("search"); setTrailerVehicleError(""); }}>Search</button>
                                <button type="button" style={trailerVehiclePickerMode === "scan" ? buttonStyle() : secondaryButtonStyle()} onClick={() => { setTrailerVehiclePickerMode("scan"); setTrailerVehicleError(""); }}>Scan QR</button>
                                <button type="button" style={secondaryButtonStyle()} onClick={() => setTrailerVehiclePickerOpen(false)}>Close</button>
                              </div>
                              {trailerVehiclePickerMode === "search" ? (
                                <>
                                  <input value={trailerVehicleSearch} onChange={(e) => setTrailerVehicleSearch(e.target.value)} placeholder="Search vehicles..." style={inputStyle()} />
                                  <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 10, maxHeight: 200, overflowY: "auto", display: "grid", gap: 8 }}>
                                    {vehicleLoading ? <div style={{ opacity: 0.72 }}>Loading vehicles...</div> : (() => {
                                      const q = trailerVehicleSearch.trim().toLowerCase();
                                      const visible = vehicleOptions.filter((row) => row.id !== vehicleId).filter((row) => {
                                        if (!q) return true;
                                        const hay = `${row.name ?? ""} ${row.type ?? ""} ${row.id}`.toLowerCase();
                                        return hay.includes(q);
                                      });
                                      if (!visible.length) return <div style={{ opacity: 0.72 }}>No matching vehicles found.</div>;
                                      return visible.map((row) => (
                                        <button key={row.id} type="button" style={{ textAlign: "left", ...secondaryButtonStyle() }} onClick={() => addTrailerVehicle(row.id)}>
                                          <strong>{row.name ?? row.id}</strong>
                                          <span style={{ opacity: 0.72 }}> · {row.type ?? "Unspecified"}</span>
                                        </button>
                                      ));
                                    })()}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <input value={trailerVehicleScanValue} onChange={(e) => setTrailerVehicleScanValue(e.target.value)} placeholder="Scan or paste vehicle QR value" style={inputStyle()} />
                                  <button type="button" style={buttonStyle()} onClick={() => {
                                    const found = findVehicleByQr(trailerVehicleScanValue);
                                    if (!found) {
                                      setTrailerVehicleError("No matching vehicle found.");
                                      return;
                                    }
                                    addTrailerVehicle(found.id);
                                    setTrailerVehicleScanValue("");
                                  }}>Add Vehicle</button>
                                </>
                              )}
                              {trailerVehicleError ? <div style={{ fontSize: 12, color: "#ff9d9d" }}>{trailerVehicleError}</div> : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <div
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
                            const cfg = extraFieldConfig(it.key);
                            if (!cfg) return null;
                            const detailKey = failLinkKey(sec.id, it.key);
                            if (it.key === "diag_codes_list") {
                              const codes = parseDiagnosticCodes(itemExtraValues[detailKey] || "");
                              return (
                                <div>
                                  <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 6 }}>
                                    {cfg.label}
                                  </div>
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    <input
                                      value={diagCodeDraftByItem[detailKey] || ""}
                                      onChange={(e) =>
                                        setDiagCodeDraftByItem((prev) => ({
                                          ...prev,
                                          [detailKey]: e.target.value,
                                        }))
                                      }
                                      inputMode={cfg.inputMode}
                                      placeholder="Type code"
                                      style={{ ...inputStyle(), flex: "1 1 180px" }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          addDiagnosticCode(sec.id, it.key);
                                        }
                                      }}
                                    />
                                    <button
                                      type="button"
                                      style={buttonStyle()}
                                      onClick={() => addDiagnosticCode(sec.id, it.key)}
                                    >
                                      Add
                                    </button>
                                  </div>
                                  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    {codes.length === 0 ? (
                                      <span style={{ fontSize: 12, opacity: 0.68 }}>No diagnostic codes added.</span>
                                    ) : (
                                      codes.map((code) => (
                                        <span
                                          key={code}
                                          style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 6,
                                            padding: "5px 9px",
                                            borderRadius: 999,
                                            border: "1px solid rgba(255,255,255,0.14)",
                                            background: "rgba(255,255,255,0.05)",
                                            fontSize: 12,
                                            fontWeight: 700,
                                          }}
                                        >
                                          {code}
                                          <button
                                            type="button"
                                            onClick={() => removeDiagnosticCode(sec.id, it.key, code)}
                                            style={{
                                              border: "none",
                                              background: "transparent",
                                              color: "inherit",
                                              cursor: "pointer",
                                              opacity: 0.8,
                                              padding: 0,
                                              lineHeight: 1,
                                            }}
                                          >
                                            x
                                          </button>
                                        </span>
                                      ))
                                    )}
                                  </div>
                                </div>
                              );
                            }
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
                              <div style={{ fontSize: 12, opacity: 0.8 }}>
                                Complete the full maintenance request for this failed item, then return to continue this inspection.
                              </div>
                              {failRequestLinks[failLinkKey(sec.id, it.key)] ? (
                                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.92 }}>
                                  Linked Request:{" "}
                                  <strong>{failRequestLinks[failLinkKey(sec.id, it.key)]}</strong>
                                </div>
                              ) : null}
                              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  onClick={() => openFullRequestForm(sec.id, it, sec.title)}
                                  style={{
                                    ...buttonStyle(),
                                    opacity: currentUserRole === "apprentice" ? 0.6 : 1,
                                    cursor: currentUserRole === "apprentice" ? "not-allowed" : "pointer",
                                  }}
                                  disabled={currentUserRole === "apprentice"}
                                >
                                  {failRequestLinks[failLinkKey(sec.id, it.key)]
                                    ? "Update Linked Request"
                                    : "Complete Maintenance Request"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openLinkCurrentRequestPage(sec.id, it.key)}
                                  style={secondaryButtonStyle()}
                                >
                                  Link Current Request
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {sec.id === "truck" && it.key === "dashboard_operational" ? (
                        <div
                          style={{
                            marginTop: 6,
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
                          <div style={{ fontWeight: 700 }}>Dash Lights On? *</div>
                          <div style={{ display: "grid", gap: 6, minWidth: 240 }}>
                            <div
                              style={{
                                border: "1px solid rgba(255,255,255,0.14)",
                                borderRadius: 12,
                                padding: 10,
                                background: "rgba(255,255,255,0.03)",
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                                gap: 8,
                              }}
                            >
                              {DASH_LIGHT_OPTIONS.map((opt) => (
                                <label
                                  key={opt}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    cursor: "pointer",
                                    fontSize: 13,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={dashLightsOn.includes(opt)}
                                    onChange={(e) => toggleDashLight(opt, e.target.checked)}
                                  />
                                  <span>{opt}</span>
                                </label>
                              ))}
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.72 }}>
                              Select all that apply.
                            </div>
                          </div>
                        </div>
                      ) : null}
                      </React.Fragment>
                      ))}
                    </div>
                  </>
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
                        <div style={{ fontSize: 12, opacity: 0.8 }}>
                          Complete the full maintenance request for this failed item, then return to continue this inspection.
                        </div>
                        {failRequestLinks[failLinkKey("exiting", it.key)] ? (
                          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.92 }}>
                            Linked Request:{" "}
                            <strong>{failRequestLinks[failLinkKey("exiting", it.key)]}</strong>
                          </div>
                        ) : null}
                        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => openFullRequestForm("exiting", it, "Exiting / Securing")}
                            style={{
                              ...buttonStyle(),
                              opacity: currentUserRole === "apprentice" ? 0.6 : 1,
                              cursor: currentUserRole === "apprentice" ? "not-allowed" : "pointer",
                            }}
                            disabled={currentUserRole === "apprentice"}
                          >
                            {failRequestLinks[failLinkKey("exiting", it.key)]
                              ? "Update Linked Request"
                              : "Complete Maintenance Request"}
                          </button>
                          <button
                            type="button"
                            onClick={() => openLinkCurrentRequestPage("exiting", it.key)}
                            style={secondaryButtonStyle()}
                          >
                            Link Current Request
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
                style={{ ...inputStyle(), ...answerSelectToneStyle(inspectionStatus) }}
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
              const returnTo = (searchParams.get("returnTo") || "").trim();
              if (returnTo && returnTo.startsWith("/")) {
                router.replace(returnTo);
                return;
              }
              router.replace(`/vehicles/${encodeURIComponent(vehicleId)}`);
            }}
            style={secondaryButtonStyle()}
          >Discard & Return</button>
        </div>
      </form>
    </main>
  );
}
