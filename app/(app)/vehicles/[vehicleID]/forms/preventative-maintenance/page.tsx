"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

function vehicleMileageKey(vehicleId: string) {
  return `vehicle:${vehicleId}:mileage`;
}

function vehicleLastOilChangeMileageKey(vehicleId: string) {
  return `vehicle:${vehicleId}:lastOilChangeMileage`;
}

type VehiclePMRecord = {
  id: string;
  vehicleId: string;
  createdAt: string;
  mileage: number;
  oilChangePerformed: boolean;
  notes: string;
};

function vehiclePmStorageKey(vehicleId: string) {
  return `vehicle:${vehicleId}:vehicle_pm`;
}

export default function VehiclePreventativeMaintenanceForm() {
  const router = useRouter();
  const params = useParams<{ vehicleID: string }>();
  const vehicleId = params.vehicleID;

  const [mileage, setMileage] = useState("");
  const [oilChangePerformed, setOilChangePerformed] = useState(true);
  const [notes, setNotes] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const m = Number(mileage);
    if (!Number.isFinite(m) || m <= 0) {
      alert("Enter a valid mileage.");
      return;
    }

    const record: VehiclePMRecord = {
      id: crypto.randomUUID(),
      vehicleId,
      createdAt: new Date().toISOString(),
      mileage: m,
      oilChangePerformed,
      notes,
    };

    const existing = JSON.parse(localStorage.getItem(vehiclePmStorageKey(vehicleId)) || "[]");
    existing.unshift(record);
    localStorage.setItem(vehiclePmStorageKey(vehicleId), JSON.stringify(existing));

    // Always update mileage
    localStorage.setItem(vehicleMileageKey(vehicleId), String(m));

    // If oil change was performed, set the last oil change mileage
    if (oilChangePerformed) {
      localStorage.setItem(vehicleLastOilChangeMileageKey(vehicleId), String(m));
    }

    router.push(`/vehicles/${encodeURIComponent(vehicleId)}`);
  }

  return (
    <main style={{ maxWidth: 700, margin: "0 auto" }}>
      <h1>Vehicle Preventative Maintenance</h1>
      <div style={{ opacity: 0.75, marginTop: 6 }}>
        Vehicle ID: <strong>{vehicleId}</strong>
      </div>

      <form onSubmit={onSubmit} style={{ marginTop: 18 }}>
        <Field label="Mileage (required)">
          <input
            value={mileage}
            onChange={(e) => setMileage(e.target.value)}
            inputMode="numeric"
            style={inputStyle}
            placeholder="e.g. 128450"
            required
          />
        </Field>

        <Field label="Oil change performed?">
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={oilChangePerformed}
              onChange={(e) => setOilChangePerformed(e.target.checked)}
            />
            Yes — set last oil change mileage to this mileage
          </label>
        </Field>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            style={{ ...inputStyle, resize: "vertical" }}
            placeholder="Work performed, filters, oil type, etc."
          />
        </Field>

        <button type="submit" style={buttonStyle}>
          Save Vehicle PM
        </button>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  fontWeight: 700,
};
