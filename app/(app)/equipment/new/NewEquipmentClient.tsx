"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import {
  EQUIPMENT_SEASONS,
  inferEquipmentSeason,
  normalizeEquipmentSeason,
  type EquipmentSeason,
} from "@/lib/equipmentSeason";
import { buildEquipmentAssetIdPrefix, buildNextEquipmentAssetId, nextAssetIdForPrefix } from "@/lib/assetIdFormat";
import { readRoleViewOverride, resolveEffectiveRole, type AppRole } from "@/lib/roleView";

type EquipmentStatus = "Active" | "Inactive" | "Out of Service" | "Retired" | "Red Tagged";
type Role = AppRole;

export default function NewEquipmentClient() {
  const router = useRouter();

  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [equipmentType, setEquipmentType] = useState("");
  const [status, setStatus] = useState<EquipmentStatus | "">("");
  const [season, setSeason] = useState<EquipmentSeason>("Summer");
  const [seasonManuallySet, setSeasonManuallySet] = useState(false);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [fuelType, setFuelType] = useState("");
  const [currentHours, setCurrentHours] = useState("");
  const [externalId, setExternalId] = useState("");
  const [assetQr, setAssetQr] = useState("");
  const [canEditAssetId, setCanEditAssetId] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const assetIdPrefix = useMemo(
    () =>
      buildEquipmentAssetIdPrefix({
        season,
        equipmentType,
        make,
        name,
        id,
      }),
    [season, equipmentType, make, name, id]
  );
  const assetIdPreview = useMemo(() => nextAssetIdForPrefix(assetIdPrefix, []), [assetIdPrefix]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const supabase = createSupabaseBrowser();
      const { data: authData } = await supabase.auth.getUser();
      if (!alive || !authData.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .maybeSingle();
      if (!alive) return;
      const role = resolveEffectiveRole(
        (profile?.role as Role | undefined) ?? "employee",
        readRoleViewOverride()
      ) as Role;
      setCanEditAssetId(role === "owner" || role === "operations_manager");
    })();
    return () => {
      alive = false;
    };
  }, []);

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
    const resolvedSeason =
      normalizeEquipmentSeason(season) ??
      inferEquipmentSeason(trimmedType, trimmedName, trimmedId);

    setSubmitting(true);
    const supabase = createSupabaseBrowser();
    let resolvedAssetId = externalId.trim();
    if (!canEditAssetId || !resolvedAssetId) {
      const { data: existingRows, error: sequenceError } = await supabase
        .from("equipment")
        .select("external_id");
      if (sequenceError) {
        setSubmitting(false);
        setSubmitError(sequenceError.message);
        return;
      }
      resolvedAssetId = buildNextEquipmentAssetId({
        season: resolvedSeason,
        equipmentType: trimmedType,
        make: make.trim(),
        name: trimmedName,
        id: trimmedId,
        existingValues: (existingRows ?? []).map((row) => row.external_id as string | null),
      });
    }
    const { error } = await supabase.from("equipment").insert({
      id: trimmedId,
      name: trimmedName,
      equipment_type: trimmedType,
      status,
      season: resolvedSeason,
      make: make.trim() || null,
      model: model.trim() || null,
      year: parsedYear,
      serial_number: serialNumber.trim() || null,
      license_plate: licensePlate.trim() || null,
      fuel_type: fuelType.trim() || null,
      current_hours: parsedHours,
      external_id: resolvedAssetId || null,
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
              <input
                value={id}
                onChange={(e) => {
                  const next = e.target.value;
                  setId(next);
                  if (!seasonManuallySet) {
                    setSeason(inferEquipmentSeason(equipmentType, name, next));
                  }
                }}
                style={inputStyle}
                required
              />
            </Field>
            <Field label="Equipment Name *">
              <input
                value={name}
                onChange={(e) => {
                  const next = e.target.value;
                  setName(next);
                  if (!seasonManuallySet) {
                    setSeason(inferEquipmentSeason(equipmentType, next, id));
                  }
                }}
                style={inputStyle}
                required
              />
            </Field>
            <Field label="Equipment Type *">
              <input
                value={equipmentType}
                onChange={(e) => {
                  const next = e.target.value;
                  setEquipmentType(next);
                  if (!seasonManuallySet) {
                    setSeason(inferEquipmentSeason(next, name, id));
                  }
                }}
                style={inputStyle}
                required
              />
            </Field>
            <Field label="Season *">
              <select
                value={season}
                onChange={(e) => {
                  const next = normalizeEquipmentSeason(e.target.value);
                  if (!next) return;
                  setSeason(next);
                  setSeasonManuallySet(true);
                }}
                style={inputStyle}
                required
              >
                {EQUIPMENT_SEASONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
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
            <Field label="Asset ID">
              <input
                value={canEditAssetId ? externalId : externalId || assetIdPreview}
                onChange={(e) => setExternalId(e.target.value)}
                style={{ ...inputStyle, opacity: canEditAssetId ? 1 : 0.72 }}
                disabled={!canEditAssetId}
              />
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.65 }}>
                {canEditAssetId
                  ? "Owner and Operations Manager can override this value."
                  : "Auto-generated. Only Owner and Operations Manager can edit Asset ID."}
              </div>
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
