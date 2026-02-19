"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type EquipmentStatus = "Active" | "Inactive" | "Out of Service" | "Retired" | "Red Tagged";

export default function NewEquipmentClient() {
  const router = useRouter();

  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [equipmentType, setEquipmentType] = useState("");
  const [status, setStatus] = useState<EquipmentStatus | "">("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [fuelType, setFuelType] = useState("");
  const [currentHours, setCurrentHours] = useState("");
  const [externalId, setExternalId] = useState("");
  const [assetQr, setAssetQr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const trimmedId = id.trim();
    const trimmedName = name.trim();
    const trimmedType = equipmentType.trim();
    if (!trimmedId) return setSubmitError("Equipment ID is required.");
    if (!trimmedName) return setSubmitError("Equipment name is required.");
    if (!trimmedType) return setSubmitError("Equipment type is required.");
    if (!status) return setSubmitError("Equipment status is required.");

    const parsedYear = year.trim() ? Number(year) : null;
    if (year.trim() && (!Number.isInteger(parsedYear) || (parsedYear ?? 0) < 1900)) {
      return setSubmitError("Year must be a valid integer.");
    }

    const parsedHours = currentHours.trim() ? Number(currentHours) : null;
    if (currentHours.trim() && (!Number.isFinite(parsedHours) || (parsedHours ?? 0) < 0)) {
      return setSubmitError("Current hours must be a valid non-negative number.");
    }

    setSubmitting(true);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("equipment").insert({
      id: trimmedId,
      name: trimmedName,
      equipment_type: trimmedType,
      status,
      make: make.trim() || null,
      model: model.trim() || null,
      year: parsedYear,
      serial_number: serialNumber.trim() || null,
      license_plate: licensePlate.trim() || null,
      fuel_type: fuelType.trim() || null,
      current_hours: parsedHours,
      external_id: externalId.trim() || null,
      asset_qr: assetQr.trim() || null,
    });
    setSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }

    router.replace(`/equipment/${encodeURIComponent(trimmedId)}`);
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Add Equipment</h1>
          <div style={{ opacity: 0.75 }}>Create a new equipment record.</div>
        </div>
        <Link href="/equipment" style={secondaryButtonStyle}>
          Back to Equipment
        </Link>
      </div>

      {submitError ? (
        <div style={{ marginTop: 12, ...cardStyle, color: "#ff9d9d" }}>{submitError}</div>
      ) : null}

      <form onSubmit={onSubmit} style={{ marginTop: 16, display: "grid", gap: 14 }}>
        <section style={cardStyle}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Required</div>
          <div style={gridStyle}>
            <Field label="Equipment ID *">
              <input value={id} onChange={(e) => setId(e.target.value)} style={inputStyle} required />
            </Field>
            <Field label="Equipment Name *">
              <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} required />
            </Field>
            <Field label="Equipment Type *">
              <input value={equipmentType} onChange={(e) => setEquipmentType(e.target.value)} style={inputStyle} required />
            </Field>
            <Field label="Status *">
              <select value={status} onChange={(e) => setStatus(e.target.value as EquipmentStatus)} style={inputStyle} required>
                <option value="">Select...</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Out of Service">Out of Service</option>
                <option value="Red Tagged">Red Tagged</option>
                <option value="Retired">Retired</option>
              </select>
            </Field>
          </div>
        </section>

        <section style={cardStyle}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Details (optional)</div>
          <div style={gridStyle}>
            <Field label="Make">
              <input value={make} onChange={(e) => setMake(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Model">
              <input value={model} onChange={(e) => setModel(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Year">
              <input value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" style={inputStyle} />
            </Field>
            <Field label="Serial Number">
              <input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="License Plate">
              <input value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Fuel Type">
              <input value={fuelType} onChange={(e) => setFuelType(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Current Hours">
              <input value={currentHours} onChange={(e) => setCurrentHours(e.target.value)} inputMode="numeric" style={inputStyle} />
            </Field>
            <Field label="External ID">
              <input value={externalId} onChange={(e) => setExternalId(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Asset QR / Tag">
              <input value={assetQr} onChange={(e) => setAssetQr(e.target.value)} style={inputStyle} />
            </Field>
          </div>
        </section>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" style={buttonStyle} disabled={submitting}>
            {submitting ? "Saving..." : "Create Equipment"}
          </button>
          <Link href="/equipment" style={secondaryButtonStyle}>
            Cancel
          </Link>
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

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 16,
  padding: 16,
  background: "rgba(255,255,255,0.03)",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

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
  border: "1px solid rgba(126,255,167,0.35)",
  background: "rgba(126,255,167,0.14)",
  color: "inherit",
  fontWeight: 800,
  cursor: "pointer",
  textDecoration: "none",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "transparent",
  color: "inherit",
  fontWeight: 800,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};
