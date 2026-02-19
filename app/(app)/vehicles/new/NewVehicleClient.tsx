"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type VehicleType = "truck" | "car" | "skidsteer" | "loader";
type VehicleStatus = "Active" | "Inactive" | "Out of Service" | "Retired";

export default function NewVehicleClient() {
  const router = useRouter();

  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<VehicleType | "">("");
  const [status, setStatus] = useState<VehicleStatus | "">("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [plate, setPlate] = useState("");
  const [vin, setVin] = useState("");
  const [fuel, setFuel] = useState("");
  const [mileage, setMileage] = useState("");
  const [asset, setAsset] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const trimmedId = id.trim();
    const trimmedName = name.trim();
    if (!trimmedId) return setSubmitError("Vehicle ID is required.");
    if (!trimmedName) return setSubmitError("Vehicle name is required.");
    if (!type) return setSubmitError("Vehicle type is required.");
    if (!status) return setSubmitError("Vehicle status is required.");

    const parsedYear = year.trim() ? Number(year) : null;
    if (year.trim() && (!Number.isInteger(parsedYear) || (parsedYear ?? 0) < 1900)) {
      return setSubmitError("Year must be a valid integer.");
    }

    const parsedMileage = mileage.trim() ? Number(mileage) : null;
    if (mileage.trim() && (!Number.isFinite(parsedMileage) || (parsedMileage ?? 0) < 0)) {
      return setSubmitError("Mileage must be a valid non-negative number.");
    }

    setSubmitting(true);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("vehicles").insert({
      id: trimmedId,
      name: trimmedName,
      type,
      status,
      make: make.trim() || null,
      model: model.trim() || null,
      year: parsedYear,
      plate: plate.trim() || null,
      vin: vin.trim() || null,
      fuel: fuel.trim() || null,
      mileage: parsedMileage,
      asset: asset.trim() || null,
    });

    setSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }

    router.replace(`/vehicles/${encodeURIComponent(trimmedId)}`);
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Add Vehicle</h1>
          <div style={{ opacity: 0.75 }}>Create a new vehicle record.</div>
        </div>
        <Link href="/vehicles" style={secondaryButtonStyle}>
          Back to Vehicles
        </Link>
      </div>

      {submitError ? (
        <div style={{ marginTop: 12, ...cardStyle, color: "#ff9d9d" }}>{submitError}</div>
      ) : null}

      <form onSubmit={onSubmit} style={{ marginTop: 16, display: "grid", gap: 14 }}>
        <section style={cardStyle}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Required</div>
          <div style={gridStyle}>
            <Field label="Vehicle ID *">
              <input value={id} onChange={(e) => setId(e.target.value)} style={inputStyle} required />
            </Field>
            <Field label="Vehicle Name *">
              <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} required />
            </Field>
            <Field label="Vehicle Type *">
              <select value={type} onChange={(e) => setType(e.target.value as VehicleType)} style={inputStyle} required>
                <option value="">Select...</option>
                <option value="truck">Truck</option>
                <option value="car">Car</option>
                <option value="skidsteer">Skidsteer</option>
                <option value="loader">Loader</option>
              </select>
            </Field>
            <Field label="Status *">
              <select value={status} onChange={(e) => setStatus(e.target.value as VehicleStatus)} style={inputStyle} required>
                <option value="">Select...</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Out of Service">Out of Service</option>
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
            <Field label="License Plate">
              <input value={plate} onChange={(e) => setPlate(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="VIN">
              <input value={vin} onChange={(e) => setVin(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Fuel Type">
              <input value={fuel} onChange={(e) => setFuel(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Mileage">
              <input value={mileage} onChange={(e) => setMileage(e.target.value)} inputMode="numeric" style={inputStyle} />
            </Field>
            <Field label="Asset Tag / QR">
              <input value={asset} onChange={(e) => setAsset(e.target.value)} style={inputStyle} />
            </Field>
          </div>
        </section>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" style={buttonStyle} disabled={submitting}>
            {submitting ? "Saving..." : "Create Vehicle"}
          </button>
          <Link href="/vehicles" style={secondaryButtonStyle}>
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
