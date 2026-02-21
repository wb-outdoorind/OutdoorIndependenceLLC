"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { confirmLeaveForm, getSignedInDisplayName, useFormExitGuard } from "@/lib/forms";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type PMChoice = "" | "pass" | "fail" | "na";
type YesNo = "" | "yes" | "no";
type PMResult = "" | "pass" | "pass_with_repairs" | "fail_out_of_service";

type TruckPMRecord = {
  id: string;
  vehicleId: string;
  createdAt: string;
  mileage: number;
  oilChangePerformed: boolean;
  notes: string;
  inspectionDate: string;
  inspectorName: string;
  oilLifePercentage: number;
  oilLifeReset: boolean;
  nextPmDueDate: string;
  pmResult: PMResult;
  checks: Record<string, PMChoice>;
  tirePressures: {
    lfMeasured: number;
    lfActual: number;
    rfMeasured: number;
    rfActual: number;
    lrMeasured: number;
    lrActual: number;
    rrMeasured: number;
    rrActual: number;
    // compatibility for any views that may still read `target`
    lfTarget?: number;
    rfTarget?: number;
    lrTarget?: number;
    rrTarget?: number;
    correctedPsi: number;
  };
  tireActions: {
    rotationNeeded: YesNo;
    rotationPerformed: YesNo;
    alignmentNeeded: YesNo;
    alignmentPerformed: YesNo;
    balanceNeeded: YesNo;
  };
  photoNames: string[];
  signature: string;
};

const CHECK_SECTIONS: Array<{ title: string; items: Array<{ key: string; label: string }> }> = [
  {
    title: "Engine & Fluids",
    items: [
      { key: "engineOilCondition", label: "Engine oil condition" },
      { key: "coolantLevelCondition", label: "Coolant level & condition" },
      { key: "powerSteeringFluidCondition", label: "Power steering fluid condition" },
      { key: "brakeFluidLevel", label: "Brake fluid level" },
      { key: "transmissionFluidCondition", label: "Transmission fluid condition (if applicable)" },
      { key: "washerFluidLevel", label: "Washer fluid level" },
      { key: "noVisibleFluidLeaks", label: "No visible fluid leaks" },
    ],
  },
  {
    title: "Fuel, Air & Emissions",
    items: [
      { key: "fuelSystemCondition", label: "Fuel system condition (including gas cap)" },
      { key: "engineAirFilter", label: "Engine air filter" },
      { key: "passengerCabinAirFilter", label: "Passenger cabin air filter" },
      { key: "evapControlSystem", label: "Evaporative control system" },
      { key: "engineTransmissionTransferCase", label: "Engine/transmission/transfer case condition" },
      { key: "engineCoolingSystem", label: "Engine cooling system condition (leaks, fan, radiator)" },
      { key: "differentialsNoLeaks", label: "Differential(s) free of leaks" },
      { key: "driveAxlesCondition", label: "Drive axle(s) condition" },
      { key: "driveshaftsAndUJoints", label: "Driveshaft(s) & U-joints condition" },
      { key: "cvAxlesBoots", label: "CV axles / boots condition (if equipped)" },
      { key: "fourWdOperation", label: "4WD operation (if equipped)" },
    ],
  },
  {
    title: "Belts & Hoses / Braking",
    items: [
      { key: "engineAccessoryBelts", label: "Engine & accessory belts condition" },
      { key: "enginePowerSteeringHvacHoses", label: "Engine, power steering & HVAC hoses" },
      { key: "brakePedalFeel", label: "Brake pedal feel normal" },
      { key: "brakePadsShoes", label: "Brake pads / shoes within specification" },
      { key: "rotorsDrums", label: "Rotors / drums condition acceptable" },
      { key: "brakeLinesHoses", label: "Brake lines & hoses intact" },
      { key: "parkingBrake", label: "Parking brake operates correctly" },
      { key: "absWarningLight", label: "ABS warning light status" },
    ],
  },
  {
    title: "Steering & Suspension",
    items: [
      { key: "steeringFreePlay", label: "Steering free play within limits" },
      { key: "steeringComponents", label: "Steering components & linkage secure" },
      { key: "ballJointsTieRods", label: "Ball joints & tie rods secure" },
      { key: "shocksStruts", label: "Shocks / struts condition acceptable" },
      { key: "springsIntact", label: "Springs intact" },
      { key: "noAbnormalNoises", label: "No abnormal noises" },
    ],
  },
  {
    title: "Wheels & Tires",
    items: [
      { key: "treadDepthAcceptable", label: "Tread depth acceptable" },
      { key: "noSidewallDamage", label: "No sidewall damage or bulges" },
      { key: "lugNutsTight", label: "Lug nuts tight" },
      { key: "sparePresentUsable", label: "Spare tire present & usable" },
      { key: "wheelBearingsCondition", label: "Wheel bearings condition (noise/play)" },
    ],
  },
  {
    title: "Lights & Electrical",
    items: [
      { key: "headlights", label: "Headlights (high / low beam)" },
      { key: "brakeLights", label: "Brake lights" },
      { key: "turnSignals", label: "Turn signals" },
      { key: "hazardLights", label: "Hazard lights" },
      { key: "markerLicenseLights", label: "Marker / license lights" },
      { key: "reverseLights", label: "Reverse lights" },
      { key: "hornOperational", label: "Horn operational" },
      { key: "batteryTerminals", label: "Battery secure & terminals clean" },
      { key: "chargingSystemWarningLight", label: "Charging system warning light" },
    ],
  },
  {
    title: "Exhaust System",
    items: [
      { key: "exhaustComponentsSecure", label: "Exhaust components secure" },
      { key: "noExhaustLeakDamage", label: "No excessive exhaust leaks or damage" },
    ],
  },
  {
    title: "Frame, Body & Chassis",
    items: [
      { key: "frameCondition", label: "Frame condition acceptable" },
      { key: "noExcessiveRust", label: "No excessive rust or structural damage" },
      { key: "bedSecure", label: "Bed secure (if applicable)" },
      { key: "tailgateOperation", label: "Tailgate / dump body operation (if applicable)" },
      { key: "bumpersSecure", label: "Bumpers secure" },
      { key: "mirrorsIntact", label: "Mirrors intact" },
      { key: "bodyComponentsLubricated", label: "Body components lubricated" },
      { key: "chassisComponentsLubricated", label: "Chassis components lubricated" },
      { key: "underbodyDamage", label: "Underbody damage observed (plow, curb, debris)" },
    ],
  },
  {
    title: "Interior & Safety",
    items: [
      { key: "seatBeltsFunctional", label: "Seat belts functional" },
      { key: "restraintComponents", label: "Restraint system components acceptable" },
      { key: "windshieldCondition", label: "Windshield condition acceptable" },
      { key: "wipersWasher", label: "Wipers & washer operate" },
      { key: "gaugesWarningLights", label: "Gauges & warning lights functional" },
      { key: "fireExtinguisher", label: "Fire extinguisher present (if required)" },
      { key: "heaterDefroster", label: "Cab heater / defroster operational" },
    ],
  },
];

function vehicleMileageKey(vehicleId: string) {
  return `vehicle:${vehicleId}:mileage`;
}

function vehicleLastOilChangeMileageKey(vehicleId: string) {
  return `vehicle:${vehicleId}:lastOilChangeMileage`;
}

function vehiclePmStorageKey(vehicleId: string) {
  return `vehicle:${vehicleId}:vehicle_pm`;
}

function addMonthsIso(dateIso: string, months: number) {
  const dt = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return "";
  dt.setMonth(dt.getMonth() + months);
  return dt.toISOString().slice(0, 10);
}

export default function VehiclePreventativeMaintenanceForm() {
  const router = useRouter();
  useFormExitGuard();
  const params = useParams<{ vehicleID: string }>();
  const vehicleId = params.vehicleID;

  const initialSavedMileage = (() => {
    if (typeof window === "undefined") return null;
    const value = Number(localStorage.getItem(vehicleMileageKey(vehicleId)));
    return Number.isFinite(value) && value > 0 ? value : null;
  })();

  const todayIso = new Date().toISOString().slice(0, 10);

  const [inspectionDate, setInspectionDate] = useState(todayIso);
  const [inspectorName, setInspectorName] = useState("");
  const [mileage, setMileage] = useState(initialSavedMileage != null ? String(initialSavedMileage) : "");

  const [oilLifePercentage, setOilLifePercentage] = useState("");
  const [oilChangePerformed, setOilChangePerformed] = useState<YesNo>("");
  const [oilLifeReset, setOilLifeReset] = useState<YesNo>("");

  const [checks, setChecks] = useState<Record<string, PMChoice>>(() => {
    const state: Record<string, PMChoice> = {};
    for (const section of CHECK_SECTIONS) {
      for (const item of section.items) {
        state[item.key] = "";
      }
    }
    return state;
  });

  const [lfMeasured, setLfMeasured] = useState("");
  const [lfActual, setLfActual] = useState("");
  const [rfMeasured, setRfMeasured] = useState("");
  const [rfActual, setRfActual] = useState("");
  const [lrMeasured, setLrMeasured] = useState("");
  const [lrActual, setLrActual] = useState("");
  const [rrMeasured, setRrMeasured] = useState("");
  const [rrActual, setRrActual] = useState("");
  const [correctedPsi, setCorrectedPsi] = useState("");

  const [rotationNeeded, setRotationNeeded] = useState<YesNo>("");
  const [rotationPerformed, setRotationPerformed] = useState<YesNo>("");
  const [alignmentNeeded, setAlignmentNeeded] = useState<YesNo>("");
  const [alignmentPerformed, setAlignmentPerformed] = useState<YesNo>("");
  const [balanceNeeded, setBalanceNeeded] = useState<YesNo>("");

  const [pmResult, setPmResult] = useState<PMResult>("");
  const [repairsNotes, setRepairsNotes] = useState("");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);

  const [signature, setSignature] = useState("");
  const [nextPmDueDate, setNextPmDueDate] = useState(() => addMonthsIso(todayIso, 4));

  const nextPmRecommended = useMemo(() => addMonthsIso(inspectionDate, 4), [inspectionDate]);

  useEffect(() => {
    void (async () => {
      const name = await getSignedInDisplayName();
      if (!name) return;
      setInspectorName((prev) => (prev.trim() ? prev : name));
    })();
  }, []);

  function updateCheck(key: string, value: PMChoice) {
    setChecks((prev) => ({ ...prev, [key]: value }));
  }

  function parseDecimal(value: string) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const m = Number(mileage);
    if (!Number.isInteger(m) || m <= 0) {
      alert("Mileage must be a valid integer greater than zero.");
      return;
    }

    if (initialSavedMileage != null && m < initialSavedMileage) {
      alert(`Mileage cannot be lower than current saved mileage (${initialSavedMileage.toLocaleString()}).`);
      return;
    }

    const oilPct = Number(oilLifePercentage);
    if (!Number.isFinite(oilPct) || oilPct < 0 || oilPct > 100) {
      alert("Oil life percentage must be between 0 and 100.");
      return;
    }

    const requiredChecks = Object.entries(checks);
    const missingCheck = requiredChecks.find(([, value]) => !value);
    if (missingCheck) {
      alert("Please complete all required checklist items.");
      return;
    }
    if (!oilChangePerformed || !oilLifeReset) {
      alert("Please complete all required yes/no selections.");
      return;
    }
    if (!rotationNeeded || !rotationPerformed || !alignmentNeeded || !alignmentPerformed || !balanceNeeded) {
      alert("Please complete all required tire action selections.");
      return;
    }
    if (!pmResult) {
      alert("Vehicle PM Result is required.");
      return;
    }

    const pressures = {
      lfMeasured: parseDecimal(lfMeasured),
      lfActual: parseDecimal(lfActual),
      rfMeasured: parseDecimal(rfMeasured),
      rfActual: parseDecimal(rfActual),
      lrMeasured: parseDecimal(lrMeasured),
      lrActual: parseDecimal(lrActual),
      rrMeasured: parseDecimal(rrMeasured),
      rrActual: parseDecimal(rrActual),
      correctedPsi: parseDecimal(correctedPsi),
    };

    if (Object.values(pressures).some((v) => v == null || (v as number) < 0)) {
      alert("Please enter valid tire pressure values (decimal format)." );
      return;
    }

    if (!inspectionDate) {
      alert("Inspection date is required.");
      return;
    }
    if (!inspectorName.trim()) {
      alert("Employee / Inspector is required.");
      return;
    }
    if (!repairsNotes.trim()) {
      alert("Repairs Needed / Notes is required.");
      return;
    }
    if (!signature.trim()) {
      alert("Inspector signature is required.");
      return;
    }
    if (!nextPmDueDate) {
      alert("Next PM due date is required.");
      return;
    }

    const record: TruckPMRecord = {
      id: crypto.randomUUID(),
      vehicleId,
      createdAt: new Date(`${inspectionDate}T12:00:00`).toISOString(),
      mileage: m,
      oilChangePerformed: oilChangePerformed === "yes",
      notes: repairsNotes.trim(),
      inspectionDate,
      inspectorName: inspectorName.trim(),
      oilLifePercentage: oilPct,
      oilLifeReset: oilLifeReset === "yes",
      nextPmDueDate,
      pmResult,
      checks,
      tirePressures: {
        lfMeasured: pressures.lfMeasured as number,
        lfActual: pressures.lfActual as number,
        rfMeasured: pressures.rfMeasured as number,
        rfActual: pressures.rfActual as number,
        lrMeasured: pressures.lrMeasured as number,
        lrActual: pressures.lrActual as number,
        rrMeasured: pressures.rrMeasured as number,
        rrActual: pressures.rrActual as number,
        lfTarget: pressures.lfActual as number,
        rfTarget: pressures.rfActual as number,
        lrTarget: pressures.lrActual as number,
        rrTarget: pressures.rrActual as number,
        correctedPsi: pressures.correctedPsi as number,
      },
      tireActions: {
        rotationNeeded,
        rotationPerformed,
        alignmentNeeded,
        alignmentPerformed,
        balanceNeeded,
      },
      photoNames: photoFiles.map((f) => f.name),
      signature: signature.trim(),
    };

    const existing = JSON.parse(localStorage.getItem(vehiclePmStorageKey(vehicleId)) || "[]");
    existing.unshift(record);
    localStorage.setItem(vehiclePmStorageKey(vehicleId), JSON.stringify(existing));

    localStorage.setItem(vehicleMileageKey(vehicleId), String(m));
    if (oilChangePerformed === "yes") {
      localStorage.setItem(vehicleLastOilChangeMileageKey(vehicleId), String(m));
    }

    try {
      const supabase = createSupabaseBrowser();
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
    }

    router.replace(`/vehicles/${encodeURIComponent(vehicleId)}`);
  }

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", paddingBottom: 36 }}>
      <h1 style={{ marginBottom: 6 }}>Truck Preventative Maintenance Inspection</h1>
      <div style={{ opacity: 0.78, lineHeight: 1.42 }}>
        The Truck Preventative Maintenance (PM) Inspection is a scheduled mechanical and safety inspection performed
        to ensure company trucks remain in safe operating condition and proactively identify wear, defects, or
        maintenance needs. Any unsafe condition found must be documented and corrected before returning the vehicle to service.
      </div>

      <form onSubmit={onSubmit} style={{ marginTop: 16, display: "grid", gap: 14 }}>
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: 10 }}>Identification & Inspection Information</h2>
          <div style={gridStyle}>
            <Field label="Vehicle *">
              <input value={vehicleId} readOnly style={{ ...inputStyle, opacity: 0.86 }} />
            </Field>
            <Field label="Inspection Date *">
              <input type="date" value={inspectionDate} onChange={(e) => setInspectionDate(e.target.value)} style={inputStyle} required />
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>Date format: mm/dd/yyyy</div>
            </Field>
            <Field label="Employee / Inspector *">
              <input value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} style={inputStyle} required />
            </Field>
            <Field label="Mileage * (Integer)">
              <input value={mileage} onChange={(e) => setMileage(e.target.value)} inputMode="numeric" style={inputStyle} required />
            </Field>
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: 10 }}>Engine & Fluids</h2>
          <div style={gridStyle}>
            <Field label="Oil life percentage *">
              <input value={oilLifePercentage} onChange={(e) => setOilLifePercentage(e.target.value)} inputMode="decimal" style={inputStyle} required />
            </Field>
            <Field label="Oil change performed *">
              <YesNoSelect value={oilChangePerformed} onChange={setOilChangePerformed} />
            </Field>
            <Field label="Oil life reset *">
              <YesNoSelect value={oilLifeReset} onChange={setOilLifeReset} />
            </Field>
          </div>

          <SectionChecklist
            items={CHECK_SECTIONS.find((s) => s.title === "Engine & Fluids")?.items ?? []}
            checks={checks}
            onChange={updateCheck}
          />
        </section>

        <section style={cardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: 10 }}>Fuel, Air & Emissions</h2>
          <SectionChecklist
            items={CHECK_SECTIONS.find((s) => s.title === "Fuel, Air & Emissions")?.items ?? []}
            checks={checks}
            onChange={updateCheck}
          />
        </section>

        <section style={cardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: 10 }}>Belts & Hoses / Braking</h2>
          <SectionChecklist
            items={CHECK_SECTIONS.find((s) => s.title === "Belts & Hoses / Braking")?.items ?? []}
            checks={checks}
            onChange={updateCheck}
          />
        </section>

        <section style={cardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: 10 }}>Steering & Suspension</h2>
          <SectionChecklist
            items={CHECK_SECTIONS.find((s) => s.title === "Steering & Suspension")?.items ?? []}
            checks={checks}
            onChange={updateCheck}
          />
        </section>

        <section style={cardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: 10 }}>Wheels & Tires</h2>
          <SectionChecklist
            items={CHECK_SECTIONS.find((s) => s.title === "Wheels & Tires")?.items ?? []}
            checks={checks}
            onChange={updateCheck}
          />

          <div style={{ ...gridStyle, marginTop: 12 }}>
            <Field label="Left front tire pressure measured * (decimal)">
              <input value={lfMeasured} onChange={(e) => setLfMeasured(e.target.value)} inputMode="decimal" style={inputStyle} required />
            </Field>
            <Field label="Left front tire pressure actual * (decimal)">
              <input value={lfActual} onChange={(e) => setLfActual(e.target.value)} inputMode="decimal" style={inputStyle} required />
            </Field>
            <Field label="Right front tire pressure measured * (decimal)">
              <input value={rfMeasured} onChange={(e) => setRfMeasured(e.target.value)} inputMode="decimal" style={inputStyle} required />
            </Field>
            <Field label="Right front tire pressure actual * (decimal)">
              <input value={rfActual} onChange={(e) => setRfActual(e.target.value)} inputMode="decimal" style={inputStyle} required />
            </Field>
            <Field label="Left rear tire pressure measured * (decimal)">
              <input value={lrMeasured} onChange={(e) => setLrMeasured(e.target.value)} inputMode="decimal" style={inputStyle} required />
            </Field>
            <Field label="Left rear tire pressure actual * (decimal)">
              <input value={lrActual} onChange={(e) => setLrActual(e.target.value)} inputMode="decimal" style={inputStyle} required />
            </Field>
            <Field label="Right rear tire pressure measured * (decimal)">
              <input value={rrMeasured} onChange={(e) => setRrMeasured(e.target.value)} inputMode="decimal" style={inputStyle} required />
            </Field>
            <Field label="Right rear tire pressure actual * (decimal)">
              <input value={rrActual} onChange={(e) => setRrActual(e.target.value)} inputMode="decimal" style={inputStyle} required />
            </Field>
            <Field label="Corrected PSI * (decimal)">
              <input value={correctedPsi} onChange={(e) => setCorrectedPsi(e.target.value)} inputMode="decimal" style={inputStyle} required />
            </Field>
          </div>

          <div style={{ ...gridStyle, marginTop: 12 }}>
            <Field label="Tire rotation needed *">
              <YesNoSelect value={rotationNeeded} onChange={setRotationNeeded} />
            </Field>
            <Field label="Tire rotation performed *">
              <YesNoSelect value={rotationPerformed} onChange={setRotationPerformed} />
            </Field>
            <Field label="Alignment needed *">
              <YesNoSelect value={alignmentNeeded} onChange={setAlignmentNeeded} />
            </Field>
            <Field label="Alignment performed *">
              <YesNoSelect value={alignmentPerformed} onChange={setAlignmentPerformed} />
            </Field>
            <Field label="Balance needed *">
              <YesNoSelect value={balanceNeeded} onChange={setBalanceNeeded} />
            </Field>
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: 10 }}>Lights & Electrical</h2>
          <SectionChecklist
            items={CHECK_SECTIONS.find((s) => s.title === "Lights & Electrical")?.items ?? []}
            checks={checks}
            onChange={updateCheck}
          />
        </section>

        <section style={cardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: 10 }}>Exhaust System</h2>
          <SectionChecklist
            items={CHECK_SECTIONS.find((s) => s.title === "Exhaust System")?.items ?? []}
            checks={checks}
            onChange={updateCheck}
          />
        </section>

        <section style={cardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: 10 }}>Frame, Body & Chassis</h2>
          <SectionChecklist
            items={CHECK_SECTIONS.find((s) => s.title === "Frame, Body & Chassis")?.items ?? []}
            checks={checks}
            onChange={updateCheck}
          />
        </section>

        <section style={cardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: 10 }}>Interior & Safety</h2>
          <SectionChecklist
            items={CHECK_SECTIONS.find((s) => s.title === "Interior & Safety")?.items ?? []}
            checks={checks}
            onChange={updateCheck}
          />
        </section>

        <section style={cardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: 10 }}>Inspection Results</h2>
          <div style={gridStyle}>
            <Field label="Vehicle PM Result *">
              <select value={pmResult} onChange={(e) => setPmResult(e.target.value as PMResult)} style={inputStyle} required>
                <option value="">Select...</option>
                <option value="pass">Pass</option>
                <option value="pass_with_repairs">Pass with repairs needed</option>
                <option value="fail_out_of_service">Fail - out of service</option>
              </select>
            </Field>
            <Field label="Photo Upload (optional)">
              <div style={uploadDropStyle}>
                <div style={{ marginBottom: 8, opacity: 0.82 }}>Drop files here or browse</div>
                <input
                  type="file"
                  multiple
                  onChange={(e) => setPhotoFiles(Array.from(e.target.files ?? []))}
                  style={{ color: "inherit" }}
                />
                {photoFiles.length > 0 ? (
                  <div style={{ marginTop: 8, opacity: 0.78, fontSize: 13 }}>
                    {photoFiles.map((f) => f.name).join(", ")}
                  </div>
                ) : null}
              </div>
            </Field>
          </div>

          <Field label="Repairs Needed / Notes *">
            <textarea
              value={repairsNotes}
              onChange={(e) => setRepairsNotes(e.target.value)}
              rows={6}
              style={{ ...inputStyle, resize: "vertical" }}
              required
            />
          </Field>
        </section>

        <section style={cardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: 10 }}>Acknowledgement</h2>
          <div style={{ opacity: 0.8, lineHeight: 1.4, marginBottom: 12 }}>
            By entering my name and submitting this form, I certify that I have personally performed this preventative
            maintenance inspection and that the information provided is true, accurate, and complete to the best of my
            knowledge. I acknowledge that this inspection reflects the vehicle condition at the time of service.
          </div>

          <div style={gridStyle}>
            <Field label="Inspector Signature *">
              <input value={signature} onChange={(e) => setSignature(e.target.value)} style={inputStyle} required />
            </Field>
            <Field label="Next PM Due Date *">
              <input type="date" value={nextPmDueDate} onChange={(e) => setNextPmDueDate(e.target.value)} style={inputStyle} required />
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>
                Suggested: {nextPmRecommended || "-"} (approximately 4 months after inspection date)
              </div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>Date format: mm/dd/yyyy</div>
            </Field>
          </div>
        </section>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" style={primaryButtonStyle}>Save Truck PM Inspection</button>
          <button
            type="button"
            onClick={() => {
              if (!confirmLeaveForm()) return;
              router.replace(`/vehicles/${encodeURIComponent(vehicleId)}`);
            }}
            style={secondaryButtonStyle}
          >Discard & Return</button>
        </div>
      </form>
    </main>
  );
}

function SectionChecklist({
  items,
  checks,
  onChange,
}: {
  items: Array<{ key: string; label: string }>;
  checks: Record<string, PMChoice>;
  onChange: (key: string, value: PMChoice) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map((item) => (
        <div key={item.key} style={checkRowStyle}>
          <div style={{ fontWeight: 700 }}>{item.label} *</div>
          <select
            value={checks[item.key] ?? ""}
            onChange={(e) => onChange(item.key, e.target.value as PMChoice)}
            style={{ ...inputStyle, maxWidth: 180 }}
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
  );
}

function YesNoSelect({ value, onChange }: { value: YesNo; onChange: (value: YesNo) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as YesNo)} style={inputStyle} required>
      <option value="">Select...</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 13, opacity: 0.74, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 16,
  padding: 16,
  background: "rgba(255,255,255,0.03)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
};

const checkRowStyle: React.CSSProperties = {
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

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

const uploadDropStyle: React.CSSProperties = {
  border: "1px dashed rgba(255,255,255,0.22)",
  borderRadius: 12,
  padding: 12,
  background: "rgba(255,255,255,0.02)",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(126,255,167,0.35)",
  background: "rgba(126,255,167,0.14)",
  color: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)",
  color: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};
