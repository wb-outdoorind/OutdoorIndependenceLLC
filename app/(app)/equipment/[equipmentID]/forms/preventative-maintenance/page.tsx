"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { confirmLeaveForm, getSignedInDisplayName, useFormExitGuard } from "@/lib/forms";

type Choice = "" | "pass" | "fail" | "na";
type TrailerChoice = "" | "pass" | "fail" | "na";
type MowerChoice = "" | "pass" | "fail" | "na";
type TrailerPmResult = "" | "pass" | "pass_with_repairs" | "fail_out_of_service";
type TrailerTypeValue = "" | "dump_trailer" | "chipper_trailer" | "enclosed_trailer" | "flatbed_trailer" | "other_trailer";
type YesNo = "" | "yes" | "no";

type EquipmentRow = {
  id: string;
  name: string | null;
  equipment_type: string | null;
  current_hours: number | null;
};

type TemplateRow = {
  id: string;
  equipment_type: string;
  name: string;
  checklist: unknown;
  is_active: boolean;
};

type ChecklistItem = {
  key: string;
  label: string;
};

type TrailerSection = {
  title: string;
  items: ChecklistItem[];
};

const TRAILER_BASE_SECTIONS: TrailerSection[] = [
  {
    title: "Coupler & Hitch",
    items: [
      { key: "coupler_secure", label: "Coupler secure (no cracks or damage)" },
      { key: "latch_operates", label: "Latch operates correctly" },
      { key: "safety_chains", label: "Safety chains present and undamaged" },
      { key: "breakaway_cable", label: "Breakaway cable attached and functional" },
    ],
  },
  {
    title: "Brakes",
    items: [
      { key: "brake_operation", label: "Brake operation normal" },
      { key: "brake_shoes_pads", label: "Brake shoes / pads within specification" },
      { key: "no_grease_oil_contamination", label: "No grease or oil contamination" },
      { key: "brake_wiring_intact", label: "Brake wiring intact" },
    ],
  },
  {
    title: "Wheels & Tires",
    items: [
      { key: "tread_depth_ok", label: "Tread depth acceptable" },
      { key: "tire_pressure_ok", label: "Tire pressure within specification" },
      { key: "no_sidewall_cracks", label: "No sidewall cracks or bulges" },
      { key: "lug_nuts_tight", label: "Lug nuts tight" },
      { key: "wheel_bearings_ok", label: "Wheel bearings free of play or noise" },
    ],
  },
  {
    title: "Lights & Electrical",
    items: [
      { key: "tail_lights", label: "Tail lights operational" },
      { key: "brake_lights", label: "Brake lights operational" },
      { key: "turn_signals", label: "Turn signals operational" },
      { key: "marker_clearance_lights", label: "Marker / clearance lights operational" },
      { key: "wiring_secured", label: "Wiring secured with no visible damage" },
    ],
  },
  {
    title: "Guards & Controls (If Applicable)",
    items: [
      { key: "safety_guards", label: "Safety guards and shields installed" },
      { key: "emergency_stop", label: "Emergency stop functions correctly" },
      { key: "control_levers_switches", label: "Control levers and switches operate properly" },
      { key: "decals_labels", label: "Decals and warning labels legible" },
    ],
  },
  {
    title: "Frame & Body",
    items: [
      { key: "frame_condition", label: "Frame condition acceptable" },
      { key: "no_excessive_rust_cracks", label: "No excessive rust or cracks" },
      { key: "crossmembers_secure", label: "Crossmembers secure" },
      { key: "deck_bed_condition", label: "Deck / bed condition acceptable" },
      { key: "fenders_secure", label: "Fenders secure" },
      { key: "toolboxes_racks_secure", label: "Toolboxes or racks secure (if equipped)" },
      { key: "doors_latches_gates", label: "Doors, latches, and gates operate correctly" },
    ],
  },
];

const TRAILER_ENGINE_POWER_SECTION: TrailerSection = {
  title: "Engine & Power System (If Applicable)",
  items: [
    { key: "engine_oil_level", label: "Engine oil level and condition" },
    { key: "fuel_lines_secure", label: "Fuel lines secure with no leaks" },
    { key: "air_filter_clean", label: "Air filter clean and serviceable" },
    { key: "cooling_unobstructed", label: "Cooling system unobstructed" },
    { key: "exhaust_secure", label: "Exhaust secure with no leaks" },
  ],
};

const TRAILER_HYDRAULIC_SECTION: TrailerSection = {
  title: "Hydraulic System (If Applicable)",
  items: [
    { key: "hydraulic_fluid_level", label: "Hydraulic fluid level acceptable" },
    { key: "hoses_fittings_intact", label: "Hoses and fittings intact" },
    { key: "winch_cable_rope", label: "Winch cable or rope condition acceptable" },
    { key: "winch_operation", label: "Winch operates smoothly (forward and reverse)" },
    { key: "safety_hooks_guards", label: "Safety hooks and guards in place" },
  ],
};

const MOWER_SECTIONS: TrailerSection[] = [
  {
    title: "Pre-Service Cleaning",
    items: [
      { key: "mower_blown_off", label: "Mower blown off using blower" },
      { key: "debris_removed", label: "All debris removed from mower" },
    ],
  },
  {
    title: "Fuel & Air System",
    items: [
      { key: "gas_level", label: "Gas filled to proper level" },
      { key: "air_filters_blown", label: "Air filters blown" },
      { key: "air_filters_damage", label: "Air filters checked for damage" },
    ],
  },
  {
    title: "Blade Service",
    items: [
      { key: "blades_removed", label: "Blades removed" },
      { key: "blades_inspected", label: "Blades inspected for damage" },
      { key: "blades_sharpened", label: "Blades sharpened" },
      { key: "blades_reinstalled", label: "Blades reinstalled" },
      { key: "blades_hand_tightened", label: "Blades hand-tightened until flush with PTO" },
      { key: "blades_zipped", label: "Blades zipped 2–3 times with impact drill" },
    ],
  },
  {
    title: "Oil Change",
    items: [
      { key: "oil_drained", label: "Oil drained from engine" },
      { key: "oil_filter_removed", label: "Oil filter removed" },
      { key: "new_oil_on_filter", label: "New oil applied to new filter" },
      { key: "new_oil_filter_installed", label: "New oil filter installed" },
      { key: "oil_drain_plug_replaced", label: "Oil drain plug replaced" },
      { key: "engine_oil_level", label: "Engine oil filled to proper level" },
    ],
  },
  {
    title: "Final Wash",
    items: [
      { key: "mower_rinsed", label: "Mower rinsed" },
      { key: "washed_with_soap", label: "Washed with soap" },
      { key: "pressure_washed", label: "Pressure washed" },
    ],
  },
];

const APPLICATOR_SECTIONS: TrailerSection[] = [
  {
    title: "Engine & Fluids",
    items: [
      { key: "app_engine_oil", label: "Engine oil level & condition" },
      { key: "app_fuel_system", label: "Fuel level / fuel system secure" },
      { key: "app_air_filter", label: "Air filter clean & serviceable" },
      { key: "app_cooling", label: "Cooling fins / radiator clean" },
      { key: "app_no_leaks", label: "No visible fuel or oil leaks" },
    ],
  },
  {
    title: "Pump & Spray System",
    items: [
      { key: "app_pump_oil", label: "Pump oil level (if applicable)" },
      { key: "app_pump_smooth", label: "Pump operates smoothly" },
      { key: "app_noise_vibration", label: "No abnormal noise or vibration" },
      { key: "app_intake_strainer", label: "Intake strainer clean" },
      { key: "app_pressure_regulator", label: "Pressure regulator operates correctly" },
    ],
  },
  {
    title: "Tank & Plumbing",
    items: [
      { key: "app_tank_condition", label: "Tank condition (no cracks or leaks)" },
      { key: "app_tank_lid", label: "Tank lid secure" },
      { key: "app_hoses_secure", label: "Hoses secure with no leaks" },
      { key: "app_valves", label: "Valves operate correctly" },
      { key: "app_agitation", label: "Agitation system functioning" },
    ],
  },
  {
    title: "Spray Controls & Application",
    items: [
      { key: "app_spray_gun_boom", label: "Spray gun / boom condition acceptable" },
      { key: "app_nozzles", label: "Nozzle tips clean and not worn" },
      { key: "app_flow_rate", label: "Flow rate consistent" },
      { key: "app_pressure_gauge", label: "Pressure gauge functional" },
      { key: "app_shutoff_valves", label: "Shutoff valves operate correctly" },
    ],
  },
  {
    title: "Wheels, Axels & Tires",
    items: [
      { key: "app_tires_inflated", label: "Tires properly inflated" },
      { key: "app_tread", label: "Tread condition acceptable" },
      { key: "app_lugs", label: "Lug nuts tight" },
      { key: "app_axles", label: "Axles secure" },
      { key: "app_bearings", label: "No bearing noise or play" },
    ],
  },
  {
    title: "Frame & Chassis",
    items: [
      { key: "app_frame_condition", label: "Frame condition acceptable" },
      { key: "app_rust_cracks", label: "No excessive rust or cracks" },
      { key: "app_welds", label: "Welds intact" },
      { key: "app_mounting_hardware", label: "Mounting hardware secure" },
      { key: "app_hitch_tongue", label: "Hitch / tongue secure (if tow-behind)" },
    ],
  },
  {
    title: "Electrical",
    items: [
      { key: "app_battery", label: "Battery secure" },
      { key: "app_wiring", label: "Wiring secured and undamaged" },
      { key: "app_switches", label: "Switches operate correctly" },
      { key: "app_hour_meter", label: "Hour meter functional (If applicable)" },
    ],
  },
  {
    title: "Safety & Labels",
    items: [
      { key: "app_emergency_shutoff", label: "Emergency shutoff functions" },
      { key: "app_guards", label: "Guards & shields in place" },
      { key: "app_warning_labels", label: "Warning labels legible" },
      { key: "app_ppe_storage", label: "PPE storage present (if required)" },
    ],
  },
];

function allTrailerItems(): ChecklistItem[] {
  return [
    ...TRAILER_BASE_SECTIONS.flatMap((s) => s.items),
    ...TRAILER_ENGINE_POWER_SECTION.items,
    ...TRAILER_HYDRAULIC_SECTION.items,
  ];
}

function trailerSectionsForType(trailerType: TrailerTypeValue): TrailerSection[] {
  const sections = [...TRAILER_BASE_SECTIONS];
  if (trailerType === "chipper_trailer") sections.splice(4, 0, TRAILER_ENGINE_POWER_SECTION);
  if (trailerType === "dump_trailer") sections.splice(4, 0, TRAILER_HYDRAULIC_SECTION);
  return sections;
}

function isTrailerEquipmentType(value: string | null | undefined) {
  return (value ?? "").toLowerCase().includes("trailer");
}

function isMowerEquipmentType(value: string | null | undefined) {
  return (value ?? "").toLowerCase().includes("mower");
}

function isApplicatorEquipmentType(value: string | null | undefined) {
  const v = (value ?? "").toLowerCase();
  return v.includes("applicator") || (v.includes("turf") && v.includes("application"));
}

function equipmentHoursKey(equipmentId: string) {
  return `equipment:${equipmentId}:hours`;
}

function normalizeChecklist(raw: unknown): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  if (!raw) return items;

  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i += 1) {
      const entry = raw[i];
      if (typeof entry === "string" && entry.trim()) {
        items.push({ key: `item_${i}`, label: entry.trim() });
        continue;
      }
      if (entry && typeof entry === "object") {
        const obj = entry as { key?: unknown; label?: unknown; name?: unknown };
        const key = typeof obj.key === "string" && obj.key.trim() ? obj.key.trim() : `item_${i}`;
        const labelCandidate = typeof obj.label === "string" ? obj.label : typeof obj.name === "string" ? obj.name : "";
        const label = labelCandidate.trim() || key;
        items.push({ key, label });
      }
    }
    return items;
  }

  if (typeof raw === "object") {
    const obj = raw as { items?: unknown } & Record<string, unknown>;

    if (Array.isArray(obj.items)) return normalizeChecklist(obj.items);

    const entries = Object.entries(obj).filter(([k]) => k !== "items");
    for (let i = 0; i < entries.length; i += 1) {
      const [key, value] = entries[i];
      if (!key.trim()) continue;

      if (typeof value === "string" && value.trim()) {
        items.push({ key, label: value.trim() });
      } else if (value && typeof value === "object") {
        const maybe = value as { label?: unknown; name?: unknown };
        const labelCandidate = typeof maybe.label === "string" ? maybe.label : typeof maybe.name === "string" ? maybe.name : "";
        items.push({ key, label: labelCandidate.trim() || key });
      } else {
        items.push({ key, label: key });
      }
    }
  }

  return items;
}

function addMonthsIso(dateIso: string, months: number) {
  const dt = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return "";
  dt.setMonth(dt.getMonth() + months);
  return dt.toISOString().slice(0, 10);
}

function ChoiceToggle({ value, onChange }: { value: Choice; onChange: (v: Choice) => void }) {
  const pill = (active: boolean): React.CSSProperties => ({
    padding: "6px 10px",
    borderRadius: 999,
    border: active ? "1px solid rgba(255,255,255,0.26)" : "1px solid rgba(255,255,255,0.14)",
    background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    userSelect: "none",
  });

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <span style={pill(value === "pass")} onClick={() => onChange("pass")}>Pass</span>
      <span style={pill(value === "fail")} onClick={() => onChange("fail")}>Fail</span>
      <span style={pill(value === "na")} onClick={() => onChange("na")}>N/A</span>
    </div>
  );
}

export default function EquipmentPreventativeMaintenancePage() {
  const router = useRouter();
  useFormExitGuard();
  const params = useParams<{ equipmentID: string }>();
  const equipmentId = decodeURIComponent(params.equipmentID);

  const [equipment, setEquipment] = useState<EquipmentRow | null>(null);
  const [template, setTemplate] = useState<TemplateRow | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);

  const [hours, setHours] = useState("");
  const [notes, setNotes] = useState("");
  const [resultState, setResultState] = useState<Record<string, Choice>>({});

  const todayIso = new Date().toISOString().slice(0, 10);
  const [inspectionDate, setInspectionDate] = useState(todayIso);
  const [trailerType, setTrailerType] = useState<TrailerTypeValue>("");
  const [inspector, setInspector] = useState("");
  const [trailerPmResult, setTrailerPmResult] = useState<TrailerPmResult>("");
  const [trailerNotes, setTrailerNotes] = useState("");
  const [signature, setSignature] = useState("");
  const [nextPmDueDate, setNextPmDueDate] = useState(() => addMonthsIso(todayIso, 4));
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [trailerChecks, setTrailerChecks] = useState<Record<string, TrailerChoice>>(() =>
    allTrailerItems().reduce<Record<string, TrailerChoice>>((acc, item) => {
      acc[item.key] = "";
      return acc;
    }, {})
  );
  const [employee, setEmployee] = useState("");
  const [oilFilterInspectDate, setOilFilterInspectDate] = useState("");
  const [oilFilterInspectHours, setOilFilterInspectHours] = useState("");
  const [oilChangeNeeded, setOilChangeNeeded] = useState<YesNo>("");
  const [newOilFilterDate, setNewOilFilterDate] = useState("");
  const [newOilFilterHours, setNewOilFilterHours] = useState("");
  const [beltChangeNeeded, setBeltChangeNeeded] = useState<YesNo>("");
  const [mowerNotes, setMowerNotes] = useState("");
  const [employeeSignature, setEmployeeSignature] = useState("");
  const [employeeDate, setEmployeeDate] = useState(todayIso);
  const [leadSignature, setLeadSignature] = useState("");
  const [leadDate, setLeadDate] = useState(todayIso);
  const [mowerChecks, setMowerChecks] = useState<Record<string, MowerChoice>>(() =>
    MOWER_SECTIONS.flatMap((s) => s.items).reduce<Record<string, MowerChoice>>((acc, item) => {
      acc[item.key] = "";
      return acc;
    }, { mower_belts_inspected: "" })
  );
  const [applicatorChecks, setApplicatorChecks] = useState<Record<string, MowerChoice>>(() =>
    APPLICATOR_SECTIONS.flatMap((s) => s.items).reduce<Record<string, MowerChoice>>((acc, item) => {
      acc[item.key] = "";
      return acc;
    }, {})
  );
  const [applicatorPmResult, setApplicatorPmResult] = useState<TrailerPmResult>("");
  const [applicatorNotes, setApplicatorNotes] = useState("");
  const [applicatorSignature, setApplicatorSignature] = useState("");
  const [applicatorNextPmDue, setApplicatorNextPmDue] = useState(() => addMonthsIso(todayIso, 4));

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setLoadError(null);

      const supabase = createSupabaseBrowser();
      const { data: equipmentData, error: equipmentError } = await supabase
        .from("equipment")
        .select("id,name,equipment_type,current_hours")
        .eq("id", equipmentId)
        .maybeSingle();

      if (!alive) return;
      if (equipmentError) {
        console.error("[equipment-pm] equipment load error:", equipmentError);
        setLoadError(equipmentError.message);
        setLoading(false);
        return;
      }

      const eq = (equipmentData as EquipmentRow | null) ?? null;
      if (!eq) {
        setLoadError(`Equipment not found. Tried id="${equipmentId}"`);
        setLoading(false);
        return;
      }

      setEquipment(eq);
      if (typeof eq.current_hours === "number") setHours(String(eq.current_hours));

      if (isTrailerEquipmentType(eq.equipment_type)) {
        setTemplate(null);
        setItems([]);
        setLoading(false);
        return;
      }

      if (isMowerEquipmentType(eq.equipment_type)) {
        setTemplate(null);
        setItems([]);
        setLoading(false);
        return;
      }

      if (isApplicatorEquipmentType(eq.equipment_type)) {
        setTemplate(null);
        setItems([]);
        setLoading(false);
        return;
      }

      if (!eq.equipment_type?.trim()) {
        setTemplate(null);
        setItems([]);
        setLoading(false);
        return;
      }

      const { data: templateData, error: templateError } = await supabase
        .from("equipment_pm_templates")
        .select("id,equipment_type,name,checklist,is_active")
        .eq("equipment_type", eq.equipment_type)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!alive) return;
      if (templateError) {
        console.error("[equipment-pm] template load error:", templateError);
        setLoadError(templateError.message);
        setLoading(false);
        return;
      }

      const tpl = (templateData as TemplateRow | null) ?? null;
      setTemplate(tpl);

      const normalized = normalizeChecklist(tpl?.checklist);
      setItems(normalized);
      setResultState(
        normalized.reduce<Record<string, Choice>>((acc, item) => {
          acc[item.key] = "";
          return acc;
        }, {})
      );

      setLoading(false);
    }

    load();

    return () => {
      alive = false;
    };
  }, [equipmentId]);

  useEffect(() => {
    void (async () => {
      const name = await getSignedInDisplayName();
      if (!name) return;
      setInspector((prev) => (prev.trim() ? prev : name));
      setEmployee((prev) => (prev.trim() ? prev : name));
    })();
  }, []);

  const isTrailerEquipment = isTrailerEquipmentType(equipment?.equipment_type);
  const isMowerEquipment = isMowerEquipmentType(equipment?.equipment_type);
  const isApplicatorEquipment = isApplicatorEquipmentType(equipment?.equipment_type);

  const trailerSections = useMemo(() => trailerSectionsForType(trailerType), [trailerType]);
  const trailerItemKeys = useMemo(() => trailerSections.flatMap((section) => section.items.map((item) => item.key)), [trailerSections]);
  const trailerFailCount = useMemo(
    () => trailerItemKeys.filter((key) => trailerChecks[key] === "fail").length,
    [trailerChecks, trailerItemKeys]
  );
  const mowerItemKeys = useMemo(
    () => [...MOWER_SECTIONS.flatMap((section) => section.items.map((item) => item.key)), "mower_belts_inspected"],
    []
  );
  const mowerFailCount = useMemo(
    () => mowerItemKeys.filter((key) => mowerChecks[key] === "fail").length,
    [mowerChecks, mowerItemKeys]
  );
  const applicatorItemKeys = useMemo(() => APPLICATOR_SECTIONS.flatMap((section) => section.items.map((item) => item.key)), []);
  const applicatorFailCount = useMemo(
    () => applicatorItemKeys.filter((key) => applicatorChecks[key] === "fail").length,
    [applicatorChecks, applicatorItemKeys]
  );

  const failCount = useMemo(() => Object.values(resultState).filter((v) => v === "fail").length, [resultState]);
  const nextPmRecommended = useMemo(() => addMonthsIso(inspectionDate, 4), [inspectionDate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!equipment) {
      setSubmitError("Equipment not loaded.");
      return;
    }

    const parsedHours = hours.trim() ? Number(hours) : null;

    const supabase = createSupabaseBrowser();

    if (isTrailerEquipment) {
      if (hours.trim() && (!Number.isFinite(parsedHours) || !Number.isInteger(parsedHours) || (parsedHours ?? 0) < 0)) {
        alert("Mileage / hours must be a valid integer.");
        return;
      }
      if (!inspectionDate) {
        alert("Inspection date is required.");
        return;
      }
      if (!trailerType) {
        alert("Trailer type is required.");
        return;
      }
      if (!inspector.trim()) {
        alert("Inspector is required.");
        return;
      }
      if (!trailerNotes.trim()) {
        alert("Repairs Needed / Additional Notes is required.");
        return;
      }
      if (!signature.trim()) {
        alert("Inspector signature is required.");
        return;
      }
      if (!nextPmDueDate) {
        alert("Next PM Due Date is required.");
        return;
      }
      if (!trailerPmResult) {
        alert("Trailer PM Result is required.");
        return;
      }

      const missingKey = trailerItemKeys.find((key) => !trailerChecks[key]);
      if (missingKey) {
        alert("Please complete all required checklist fields.");
        return;
      }

      const summary = trailerFailCount > 0 ? `${trailerFailCount} failed item(s)` : "All trailer PM checks passed";
      const { error } = await supabase.from("equipment_pm_events").insert({
        equipment_id: equipment.id,
        template_id: null,
        hours: parsedHours,
        notes: trailerNotes.trim() || null,
        result: {
          mode: "trailer_pm",
          summary,
          trailerPm: {
            trailer: equipment.name ?? equipment.id,
            equipmentType: equipment.equipment_type ?? null,
            trailerType,
            inspectionDate,
            mileageOrHours: parsedHours,
            inspector: inspector.trim(),
            checks: trailerChecks,
            trailerPmResult,
            repairsNotes: trailerNotes.trim(),
            photoNames: photoFiles.map((f) => f.name),
            signature: signature.trim(),
            nextPmDueDate,
          },
        },
      });

      if (error) {
        console.error("[equipment-trailer-pm] event insert failed:", error);
        setSubmitError(error.message);
        return;
      }

      if (parsedHours != null) localStorage.setItem(equipmentHoursKey(equipment.id), String(parsedHours));
      router.replace(`/equipment/${encodeURIComponent(equipment.id)}`);
      return;
    }

    if (isMowerEquipment) {
      if (hours.trim() && (!Number.isFinite(parsedHours) || (parsedHours ?? 0) < 0)) {
        alert("Hours must be a valid number.");
        return;
      }
      if (!inspectionDate) {
        alert("Date is required.");
        return;
      }
      if (!employee.trim()) {
        alert("Employee is required.");
        return;
      }
      if (!employeeSignature.trim()) {
        alert("Employee signature is required.");
        return;
      }
      if (!employeeDate) {
        alert("Employee date is required.");
        return;
      }
      if (!leadSignature.trim()) {
        alert("Lead signature is required.");
        return;
      }
      if (!leadDate) {
        alert("Lead date is required.");
        return;
      }
      if (!oilChangeNeeded || !beltChangeNeeded) {
        alert("Please complete all required yes/no selections.");
        return;
      }

      const parsedInspectHours = oilFilterInspectHours.trim() ? Number(oilFilterInspectHours) : null;
      if (oilFilterInspectHours.trim() && (!Number.isFinite(parsedInspectHours) || (parsedInspectHours ?? 0) < 0)) {
        alert("Hours on oil filter inspected must be a valid decimal.");
        return;
      }
      const parsedNewFilterHours = newOilFilterHours.trim() ? Number(newOilFilterHours) : null;
      if (newOilFilterHours.trim() && (!Number.isFinite(parsedNewFilterHours) || (parsedNewFilterHours ?? 0) < 0)) {
        alert("Hours recorded on new oil filter must be a valid decimal.");
        return;
      }

      const missingMowerKey = mowerItemKeys.find((key) => !mowerChecks[key]);
      if (missingMowerKey) {
        alert("Please complete all mower checklist fields.");
        return;
      }

      const summary = mowerFailCount > 0 ? `${mowerFailCount} failed item(s)` : "All mower PM checks passed";
      const { error } = await supabase.from("equipment_pm_events").insert({
        equipment_id: equipment.id,
        template_id: null,
        hours: parsedHours,
        notes: mowerNotes.trim() || null,
        result: {
          mode: "mower_pm",
          summary,
          mowerPm: {
            date: inspectionDate,
            employee: employee.trim(),
            equipment: equipment.name ?? equipment.id,
            equipmentType: equipment.equipment_type ?? null,
            hours: parsedHours,
            checks: mowerChecks,
            oilFilterInspectDate: oilFilterInspectDate || null,
            oilFilterInspectHours: parsedInspectHours,
            oilChangeNeeded,
            newOilFilterDate: newOilFilterDate || null,
            newOilFilterHours: parsedNewFilterHours,
            beltChangeNeeded,
            notes: mowerNotes.trim(),
            photoNames: photoFiles.map((f) => f.name),
            employeeSignature: employeeSignature.trim(),
            employeeDate,
            leadSignature: leadSignature.trim(),
            leadDate,
          },
        },
      });

      if (error) {
        console.error("[equipment-mower-pm] event insert failed:", error);
        setSubmitError(error.message);
        return;
      }

      if (parsedHours != null) localStorage.setItem(equipmentHoursKey(equipment.id), String(parsedHours));
      router.replace(`/equipment/${encodeURIComponent(equipment.id)}`);
      return;
    }

    if (isApplicatorEquipment) {
      if (hours.trim() && (!Number.isFinite(parsedHours) || !Number.isInteger(parsedHours) || (parsedHours ?? 0) < 0)) {
        alert("Engine hours must be a valid integer.");
        return;
      }
      if (!inspectionDate) {
        alert("Date is required.");
        return;
      }
      const missingApplicatorKey = applicatorItemKeys.find((key) => !applicatorChecks[key]);
      if (missingApplicatorKey) {
        alert("Please complete all applicator checklist fields.");
        return;
      }
      if (!applicatorNotes.trim()) {
        alert("Repairs Needed / Notes is required.");
        return;
      }
      if (!applicatorSignature.trim()) {
        alert("Inspector signature is required.");
        return;
      }
      if (!applicatorNextPmDue) {
        alert("Next PM Due is required.");
        return;
      }
      if (!applicatorPmResult) {
        alert("Equipment PM Result is required.");
        return;
      }

      const summary = applicatorFailCount > 0 ? `${applicatorFailCount} failed item(s)` : "All applicator PM checks passed";
      const { error } = await supabase.from("equipment_pm_events").insert({
        equipment_id: equipment.id,
        template_id: null,
        hours: parsedHours,
        notes: applicatorNotes.trim() || null,
        result: {
          mode: "applicator_pm",
          summary,
          applicatorPm: {
            equipment: equipment.name ?? equipment.id,
            equipmentType: equipment.equipment_type ?? null,
            engineHours: parsedHours,
            date: inspectionDate,
            checks: applicatorChecks,
            equipmentPmResult: applicatorPmResult,
            repairsNotes: applicatorNotes.trim(),
            photoNames: photoFiles.map((f) => f.name),
            inspectorSignature: applicatorSignature.trim(),
            nextPmDue: applicatorNextPmDue,
          },
        },
      });

      if (error) {
        console.error("[equipment-applicator-pm] event insert failed:", error);
        setSubmitError(error.message);
        return;
      }

      if (parsedHours != null) localStorage.setItem(equipmentHoursKey(equipment.id), String(parsedHours));
      router.replace(`/equipment/${encodeURIComponent(equipment.id)}`);
      return;
    }

    if (hours.trim() && (!Number.isFinite(parsedHours) || (parsedHours ?? 0) < 0)) {
      alert("Enter valid hours.");
      return;
    }
    const missingResult = items.find((item) => !resultState[item.key]);
    if (missingResult) {
      alert("Please complete all required checklist items.");
      return;
    }

    const summary = failCount > 0 ? `${failCount} failed item(s)` : "All checked items passed";
    const { error } = await supabase.from("equipment_pm_events").insert({
      equipment_id: equipment.id,
      template_id: template?.id ?? null,
      hours: parsedHours,
      notes: notes.trim() || null,
      result: {
        templateName: template?.name ?? null,
        summary,
        checklistItems: items,
        responses: resultState,
      },
    });

    if (error) {
      console.error("[equipment-pm] event insert failed:", error);
      setSubmitError(error.message);
      return;
    }

    if (parsedHours != null) localStorage.setItem(equipmentHoursKey(equipment.id), String(parsedHours));
    router.replace(`/equipment/${encodeURIComponent(equipment.id)}`);
  }

  const missingTemplate = !isTrailerEquipment && !isMowerEquipment && !isApplicatorEquipment && !loading && !loadError && (!template || items.length === 0);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>
        {isTrailerEquipment
          ? "Trailer Preventative Maintenance Inspection"
          : isMowerEquipment
            ? "Mower Preventative Maintenance (PM) Checklist"
            : isApplicatorEquipment
              ? "Turf Application Equipment Preventative Maintenance (PM) Inspection"
            : "Equipment Preventative Maintenance"}
      </h1>
      <div style={{ opacity: 0.75, lineHeight: 1.4 }}>
        Equipment ID: <strong>{equipmentId}</strong>
        {equipment?.name ? (
          <>
            {" "}• <strong>{equipment.name}</strong>
          </>
        ) : null}
        <span style={{ marginLeft: 10, opacity: 0.85 }}>
          Type: <strong>{equipment?.equipment_type ?? "-"}</strong>
        </span>
      </div>

      {loading ? <div style={{ marginTop: 12, opacity: 0.75 }}>Loading form...</div> : null}

      {loadError ? (
        <div style={{ marginTop: 12, ...cardStyle(), color: "#ff9d9d", opacity: 0.95 }}>{loadError}</div>
      ) : null}

      {submitError ? (
        <div style={{ marginTop: 12, ...cardStyle(), color: "#ff9d9d", opacity: 0.95 }}>
          Failed to save PM event: {submitError}
        </div>
      ) : null}

      {isTrailerEquipment ? (
        <form onSubmit={onSubmit} style={{ marginTop: 16, display: "grid", gap: 14 }}>
          <section style={cardStyle()}>
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>General Information</h2>
            <div style={gridStyle()}>
              <Field label="Trailer *">
                <input value={equipment?.name ?? equipmentId} readOnly style={{ ...inputStyle(), opacity: 0.86 }} />
              </Field>
              <Field label="Inspection Date *">
                <input type="date" value={inspectionDate} onChange={(e) => setInspectionDate(e.target.value)} style={inputStyle()} required />
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>Date format: mm/dd/yyyy</div>
              </Field>
              <Field label="Mileage / Hours (If applicable)">
                <input value={hours} onChange={(e) => setHours(e.target.value)} inputMode="numeric" style={inputStyle()} />
              </Field>
              <Field label="Trailer Type *">
                <select value={trailerType} onChange={(e) => setTrailerType(e.target.value as TrailerTypeValue)} style={inputStyle()} required>
                  <option value="">Select...</option>
                  <option value="dump_trailer">Dump Trailer</option>
                  <option value="chipper_trailer">Chipper Trailer</option>
                  <option value="enclosed_trailer">Enclosed Trailer</option>
                  <option value="flatbed_trailer">Flatbed Trailer</option>
                  <option value="other_trailer">Other Trailer</option>
                </select>
              </Field>
              <Field label="Inspector *">
                <input value={inspector} onChange={(e) => setInspector(e.target.value)} style={inputStyle()} required />
              </Field>
            </div>
          </section>

          {trailerSections.map((section) => (
            <section key={section.title} style={cardStyle()}>
              <h2 style={{ marginTop: 0, marginBottom: 10 }}>{section.title}</h2>
              <div style={{ display: "grid", gap: 10 }}>
                {section.items.map((item) => (
                  <div key={item.key} style={checkRowStyle()}>
                    <div style={{ fontWeight: 700 }}>{item.label} *</div>
                    <select
                      value={trailerChecks[item.key] ?? ""}
                      onChange={(e) => setTrailerChecks((prev) => ({ ...prev, [item.key]: e.target.value as TrailerChoice }))}
                      style={{ ...inputStyle(), maxWidth: 180 }}
                      required
                    >
                      <option value="">Select...</option>
                      <option value="pass">Pass</option>
                      <option value="fail">Fail</option>
                      <option value="na">N/A</option>
                    </select>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <section style={cardStyle()}>
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>Final Assessment</h2>
            <div style={gridStyle()}>
              <Field label="Trailer PM Result *">
                <select value={trailerPmResult} onChange={(e) => setTrailerPmResult(e.target.value as TrailerPmResult)} style={inputStyle()} required>
                  <option value="">Select...</option>
                  <option value="pass">Pass</option>
                  <option value="pass_with_repairs">Pass with repairs needed</option>
                  <option value="fail_out_of_service">Fail - out of service</option>
                </select>
              </Field>
              <Field label="Photo Upload">
                <div style={uploadDropStyle()}>
                  <div style={{ marginBottom: 8, opacity: 0.82 }}>Drop files here or browse</div>
                  <input type="file" multiple onChange={(e) => setPhotoFiles(Array.from(e.target.files ?? []))} style={{ color: "inherit" }} />
                  {photoFiles.length > 0 ? (
                    <div style={{ marginTop: 8, opacity: 0.78, fontSize: 13 }}>{photoFiles.map((f) => f.name).join(", ")}</div>
                  ) : null}
                </div>
              </Field>
            </div>

            <Field label="Repairs Needed / Additional Notes *">
              <textarea value={trailerNotes} onChange={(e) => setTrailerNotes(e.target.value)} rows={6} style={{ ...inputStyle(), resize: "vertical" }} required />
            </Field>
          </section>

          <section style={cardStyle()}>
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>Acknowledgement</h2>
            <div style={{ opacity: 0.8, lineHeight: 1.4, marginBottom: 12 }}>
              By entering my name and submitting this form, I certify that I have personally performed this trailer
              preventative maintenance inspection and that the information provided is true, accurate, and complete to
              the best of my knowledge. I acknowledge that this inspection reflects the condition of the trailer at
              the time of service and that any identified defects, maintenance needs, or unsafe conditions have been
              accurately documented.
            </div>

            <div style={gridStyle()}>
              <Field label="Inspector Signature *">
                <input value={signature} onChange={(e) => setSignature(e.target.value)} style={inputStyle()} required />
              </Field>
              <Field label="Next PM Due Date *">
                <input type="date" value={nextPmDueDate} onChange={(e) => setNextPmDueDate(e.target.value)} style={inputStyle()} required />
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>
                  Suggested: {nextPmRecommended || "-"} (approximately 4 months after inspection date)
                </div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>Date format: mm/dd/yyyy</div>
              </Field>
            </div>
          </section>

          <div style={{ marginTop: 4, opacity: 0.76, fontSize: 13 }}>
            Summary: {trailerFailCount > 0 ? `${trailerFailCount} failed item(s)` : "All trailer PM checks passed"}
          </div>

          <div style={{ marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" style={buttonStyle()}>
              Save Trailer PM Inspection
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
      ) : null}

      {isMowerEquipment ? (
        <form onSubmit={onSubmit} style={{ marginTop: 16, display: "grid", gap: 14 }}>
          <section style={cardStyle()}>
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>General Details</h2>
            <div style={{ opacity: 0.78, lineHeight: 1.4, marginBottom: 10 }}>
              Scheduled preventative maintenance inspection for mower reliability, safety, and service tracking.
            </div>
            <div style={gridStyle()}>
              <Field label="Date *">
                <input type="date" value={inspectionDate} onChange={(e) => setInspectionDate(e.target.value)} style={inputStyle()} required />
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>Date format: mm/dd/yyyy</div>
              </Field>
              <Field label="Employee *">
                <input value={employee} onChange={(e) => setEmployee(e.target.value)} style={inputStyle()} required />
              </Field>
              <Field label="Equipment (Mower) *">
                <input value={equipment?.name ?? equipmentId} readOnly style={{ ...inputStyle(), opacity: 0.86 }} />
              </Field>
              <Field label="Hours (if applicable)">
                <input value={hours} onChange={(e) => setHours(e.target.value)} inputMode="decimal" style={inputStyle()} />
              </Field>
            </div>
          </section>

          {MOWER_SECTIONS.slice(0, 3).map((section) => (
            <section key={section.title} style={cardStyle()}>
              <h2 style={{ marginTop: 0, marginBottom: 10 }}>{section.title}</h2>
              <div style={{ display: "grid", gap: 10 }}>
                {section.items.map((item) => (
                  <div key={item.key} style={checkRowStyle()}>
                    <div style={{ fontWeight: 700 }}>{item.label}</div>
                    <select
                      value={mowerChecks[item.key] ?? ""}
                      onChange={(e) => setMowerChecks((prev) => ({ ...prev, [item.key]: e.target.value as MowerChoice }))}
                      style={{ ...inputStyle(), maxWidth: 180 }}
                      required
                    >
                      <option value="">Select...</option>
                      <option value="pass">Pass</option>
                      <option value="fail">Fail</option>
                      <option value="na">N/A</option>
                    </select>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <section style={cardStyle()}>
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>Oil & Filter Inspection</h2>
            <div style={gridStyle()}>
              <Field label="Date on oil filter inspected">
                <input type="date" value={oilFilterInspectDate} onChange={(e) => setOilFilterInspectDate(e.target.value)} style={inputStyle()} />
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>Date format: mm/dd/yyyy</div>
              </Field>
              <Field label="Hours on oil filter inspected (If applicable)">
                <input value={oilFilterInspectHours} onChange={(e) => setOilFilterInspectHours(e.target.value)} inputMode="decimal" style={inputStyle()} />
              </Field>
              <Field label="Oil change needed?">
                <select value={oilChangeNeeded} onChange={(e) => setOilChangeNeeded(e.target.value as YesNo)} style={inputStyle()}>
                  <option value="">Select...</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </Field>
            </div>
          </section>

          <section style={cardStyle()}>
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>Oil Change</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {MOWER_SECTIONS[3].items.map((item) => (
                <div key={item.key} style={checkRowStyle()}>
                  <div style={{ fontWeight: 700 }}>{item.label}</div>
                  <select
                    value={mowerChecks[item.key] ?? ""}
                    onChange={(e) => setMowerChecks((prev) => ({ ...prev, [item.key]: e.target.value as MowerChoice }))}
                    style={{ ...inputStyle(), maxWidth: 180 }}
                    required
                  >
                    <option value="">Select...</option>
                    <option value="pass">Pass</option>
                    <option value="fail">Fail</option>
                    <option value="na">N/A</option>
                  </select>
                </div>
              ))}
            </div>
            <div style={{ ...gridStyle(), marginTop: 12 }}>
              <Field label="Date on new oil filter">
                <input type="date" value={newOilFilterDate} onChange={(e) => setNewOilFilterDate(e.target.value)} style={inputStyle()} />
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>Date format: mm/dd/yyyy</div>
              </Field>
              <Field label="Hours recorded on new oil filter (If applicable)">
                <input value={newOilFilterHours} onChange={(e) => setNewOilFilterHours(e.target.value)} inputMode="decimal" style={inputStyle()} />
              </Field>
            </div>
          </section>

          <section style={cardStyle()}>
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>Belts & Drive System</h2>
            <div style={gridStyle()}>
              <Field label="Mower belts inspected for quality">
                <select
                  value={mowerChecks.mower_belts_inspected ?? ""}
                  onChange={(e) => setMowerChecks((prev) => ({ ...prev, mower_belts_inspected: e.target.value as MowerChoice }))}
                  style={inputStyle()}
                  required
                >
                  <option value="">Select...</option>
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                  <option value="na">N/A</option>
                </select>
              </Field>
              <Field label="Belt change needed?">
                <select value={beltChangeNeeded} onChange={(e) => setBeltChangeNeeded(e.target.value as YesNo)} style={inputStyle()}>
                  <option value="">Select...</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </Field>
            </div>
          </section>

          <section style={cardStyle()}>
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>Final Wash</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {MOWER_SECTIONS[4].items.map((item) => (
                <div key={item.key} style={checkRowStyle()}>
                  <div style={{ fontWeight: 700 }}>{item.label}</div>
                  <select
                    value={mowerChecks[item.key] ?? ""}
                    onChange={(e) => setMowerChecks((prev) => ({ ...prev, [item.key]: e.target.value as MowerChoice }))}
                    style={{ ...inputStyle(), maxWidth: 180 }}
                    required
                  >
                    <option value="">Select...</option>
                    <option value="pass">Pass</option>
                    <option value="fail">Fail</option>
                    <option value="na">N/A</option>
                  </select>
                </div>
              ))}
            </div>
          </section>

          <section style={cardStyle()}>
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>Acknowledgement</h2>
            <div style={{ opacity: 0.8, lineHeight: 1.4, marginBottom: 12 }}>
              By entering my name and submitting this form, I certify that I have personally performed this mower
              preventative maintenance inspection and that the information provided is true, accurate, and complete to
              the best of my knowledge. I acknowledge that this inspection reflects the equipment condition at the
              time of service and that any identified defects, maintenance needs, or unsafe conditions have been
              accurately documented.
            </div>

            <Field label="Notes / Additional Observations">
              <textarea value={mowerNotes} onChange={(e) => setMowerNotes(e.target.value)} rows={5} style={{ ...inputStyle(), resize: "vertical" }} />
            </Field>

            <Field label="Photo Upload">
              <div style={uploadDropStyle()}>
                <div style={{ marginBottom: 8, opacity: 0.82 }}>Drop files here or browse</div>
                <input type="file" multiple onChange={(e) => setPhotoFiles(Array.from(e.target.files ?? []))} style={{ color: "inherit" }} />
                {photoFiles.length > 0 ? (
                  <div style={{ marginTop: 8, opacity: 0.78, fontSize: 13 }}>{photoFiles.map((f) => f.name).join(", ")}</div>
                ) : null}
              </div>
            </Field>

            <div style={{ ...gridStyle(), marginTop: 12 }}>
              <Field label="Employee Signature & Date *">
                <input value={employeeSignature} onChange={(e) => setEmployeeSignature(e.target.value)} style={inputStyle()} required />
              </Field>
              <Field label="Employee Date *">
                <input type="date" value={employeeDate} onChange={(e) => setEmployeeDate(e.target.value)} style={inputStyle()} required />
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>Date format: mm/dd/yyyy</div>
              </Field>
              <Field label="Lead Signature *">
                <input value={leadSignature} onChange={(e) => setLeadSignature(e.target.value)} style={inputStyle()} required />
              </Field>
              <Field label="Lead Date *">
                <input type="date" value={leadDate} onChange={(e) => setLeadDate(e.target.value)} style={inputStyle()} required />
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>Date format: mm/dd/yyyy</div>
              </Field>
            </div>
          </section>

          <div style={{ marginTop: 4, opacity: 0.76, fontSize: 13 }}>
            Summary: {mowerFailCount > 0 ? `${mowerFailCount} failed item(s)` : "All mower PM checks passed"}
          </div>

          <div style={{ marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" style={buttonStyle()}>
              Save Mower PM Checklist
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
      ) : null}

      {isApplicatorEquipment ? (
        <form onSubmit={onSubmit} style={{ marginTop: 16, display: "grid", gap: 14 }}>
          <section style={cardStyle()}>
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>General Details</h2>
            <div style={{ opacity: 0.78, lineHeight: 1.4, marginBottom: 10 }}>
              Scheduled mechanical and safety inspection for turf application equipment to keep systems reliable,
              maintain safe operation, and support compliance documentation.
            </div>
            <div style={gridStyle()}>
              <Field label="Equipment *">
                <input value={equipment?.name ?? equipmentId} readOnly style={{ ...inputStyle(), opacity: 0.86 }} />
              </Field>
              <Field label="Engine Hours">
                <input value={hours} onChange={(e) => setHours(e.target.value)} inputMode="numeric" style={inputStyle()} />
              </Field>
              <Field label="Date *">
                <input type="date" value={inspectionDate} onChange={(e) => setInspectionDate(e.target.value)} style={inputStyle()} required />
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>Date format: mm/dd/yyyy</div>
              </Field>
            </div>
          </section>

          {APPLICATOR_SECTIONS.map((section) => (
            <section key={section.title} style={cardStyle()}>
              <h2 style={{ marginTop: 0, marginBottom: 10 }}>{section.title}</h2>
              <div style={{ display: "grid", gap: 10 }}>
                {section.items.map((item) => (
                  <div key={item.key} style={checkRowStyle()}>
                    <div style={{ fontWeight: 700 }}>{item.label}</div>
                    <select
                      value={applicatorChecks[item.key] ?? ""}
                      onChange={(e) => setApplicatorChecks((prev) => ({ ...prev, [item.key]: e.target.value as MowerChoice }))}
                      style={{ ...inputStyle(), maxWidth: 180 }}
                      required
                    >
                      <option value="">Select...</option>
                      <option value="pass">Pass</option>
                      <option value="fail">Fail</option>
                      <option value="na">N/A</option>
                    </select>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <section style={cardStyle()}>
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>Final Assessment</h2>
            <div style={gridStyle()}>
              <Field label="Equipment PM Result">
                <select value={applicatorPmResult} onChange={(e) => setApplicatorPmResult(e.target.value as TrailerPmResult)} style={inputStyle()} required>
                  <option value="">Select...</option>
                  <option value="pass">Pass</option>
                  <option value="pass_with_repairs">Pass with repairs needed</option>
                  <option value="fail_out_of_service">Fail - out of service</option>
                </select>
              </Field>
              <Field label="Photo Upload">
                <div style={uploadDropStyle()}>
                  <div style={{ marginBottom: 8, opacity: 0.82 }}>Drop files here or browse</div>
                  <input type="file" multiple onChange={(e) => setPhotoFiles(Array.from(e.target.files ?? []))} style={{ color: "inherit" }} />
                  {photoFiles.length > 0 ? (
                    <div style={{ marginTop: 8, opacity: 0.78, fontSize: 13 }}>{photoFiles.map((f) => f.name).join(", ")}</div>
                  ) : null}
                </div>
              </Field>
            </div>
            <Field label="Repairs Needed / Notes *">
              <textarea value={applicatorNotes} onChange={(e) => setApplicatorNotes(e.target.value)} rows={5} style={{ ...inputStyle(), resize: "vertical" }} required />
            </Field>
          </section>

          <section style={cardStyle()}>
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>Acknowledgement</h2>
            <div style={{ opacity: 0.8, lineHeight: 1.4, marginBottom: 12 }}>
              By entering my name and submitting this form, I certify that I have personally performed this
              preventative maintenance inspection and that the information provided is true, accurate, and complete to
              the best of my knowledge. I acknowledge that this inspection reflects the condition of the equipment at
              the time of service and that any identified defects, maintenance needs, or unsafe conditions have been
              accurately documented.
            </div>
            <div style={gridStyle()}>
              <Field label="Inspector Signature *">
                <input value={applicatorSignature} onChange={(e) => setApplicatorSignature(e.target.value)} style={inputStyle()} required />
              </Field>
              <Field label="Next PM Due *">
                <input type="date" value={applicatorNextPmDue} onChange={(e) => setApplicatorNextPmDue(e.target.value)} style={inputStyle()} required />
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>Date format: mm/dd/yyyy</div>
              </Field>
            </div>
          </section>

          <div style={{ marginTop: 4, opacity: 0.76, fontSize: 13 }}>
            Summary: {applicatorFailCount > 0 ? `${applicatorFailCount} failed item(s)` : "All applicator PM checks passed"}
          </div>

          <div style={{ marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" style={buttonStyle()}>
              Save Applicator PM Inspection
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
      ) : null}

      {missingTemplate ? (
        <div style={{ marginTop: 12, ...cardStyle() }}>
          <div style={{ fontWeight: 900 }}>No PM template found for this equipment type.</div>
          <div style={{ marginTop: 8, opacity: 0.8 }}>
            Create a template for <strong>{equipment?.equipment_type ?? "this type"}</strong> to enable PM events.
          </div>
          <Link
            href={`/equipment/pm-templates/new?equipmentType=${encodeURIComponent(equipment?.equipment_type ?? "")}`}
            style={{ display: "inline-block", marginTop: 10, ...buttonStyle() }}
          >
            Create PM Template
          </Link>
        </div>
      ) : null}

      {!isTrailerEquipment && !missingTemplate && template ? (
        <form onSubmit={onSubmit} style={{ marginTop: 16 }}>
          <div style={cardStyle()}>
            <div style={{ fontWeight: 900 }}>{template.name}</div>
            <div style={{ marginTop: 4, opacity: 0.75, fontSize: 13 }}>
              {items.length} checklist item{items.length === 1 ? "" : "s"}
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {items.map((item) => (
                <div
                  key={item.key}
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    padding: 10,
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>{item.label}</div>
                  <ChoiceToggle
                    value={resultState[item.key] ?? ""}
                    onChange={(v) => setResultState((prev) => ({ ...prev, [item.key]: v }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 16, ...cardStyle() }}>
            <div style={gridStyle()}>
              <Field label="Hours (optional)">
                <input value={hours} onChange={(e) => setHours(e.target.value)} inputMode="numeric" placeholder="e.g. 1540" style={inputStyle()} />
              </Field>

              <Field label="Summary">
                <div style={{ ...inputStyle(), opacity: 0.85, minHeight: 42 }}>
                  {failCount > 0 ? `${failCount} failed item(s)` : "All checked items passed"}
                </div>
              </Field>
            </div>

            <div style={{ marginTop: 12 }}>
              <Field label="Notes (optional)">
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} style={{ ...inputStyle(), resize: "vertical" }} />
              </Field>
            </div>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" style={buttonStyle()}>
              Save PM Event
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
      ) : null}
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

function checkRowStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: 10,
    background: "rgba(255,255,255,0.02)",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
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

function uploadDropStyle(): React.CSSProperties {
  return {
    border: "1px dashed rgba(255,255,255,0.22)",
    borderRadius: 12,
    padding: 12,
    background: "rgba(255,255,255,0.02)",
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
    textDecoration: "none",
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
