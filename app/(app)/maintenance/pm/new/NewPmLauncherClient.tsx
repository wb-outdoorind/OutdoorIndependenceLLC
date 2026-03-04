"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type PmKind = "vehicle_pm" | "trailer_pm" | "mower_pm" | "applicator_pm" | "equipment_pm";

type VehicleAssetRow = {
  id: string;
  name: string | null;
  type: string | null;
  status: string | null;
  plate: string | null;
  asset: string | null;
  asset_qr: string | null;
};

type EquipmentAssetRow = {
  id: string;
  name: string | null;
  equipment_type: string | null;
  status: string | null;
  external_id: string | null;
  asset_qr: string | null;
};

type AssetOption = {
  id: string;
  label: string;
  searchText: string;
};

function cardStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 16,
    padding: 16,
    background: "rgba(255,255,255,0.03)",
  };
}

function buttonStyle(): React.CSSProperties {
  return {
    padding: "9px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "inherit",
    fontWeight: 800,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
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

function pmKindLabel(kind: PmKind) {
  if (kind === "vehicle_pm") return "Vehicle PM";
  if (kind === "trailer_pm") return "Trailer PM";
  if (kind === "mower_pm") return "Mower PM";
  if (kind === "applicator_pm") return "Applicator PM";
  return "Standard Equipment PM";
}

function normalizedScanCandidates(rawValue: string) {
  const value = rawValue.trim();
  if (!value) return [];
  let lastSegment = "";
  try {
    const u = new URL(value);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length) lastSegment = decodeURIComponent(parts[parts.length - 1]);
  } catch {
    // not a URL
  }
  return [value, value.toLowerCase(), lastSegment, lastSegment.toLowerCase()].filter(Boolean);
}

function equalsCandidate(value: string | null | undefined, candidate: string) {
  const v = (value ?? "").trim();
  if (!v) return false;
  return v === candidate || v.toLowerCase() === candidate.toLowerCase();
}

export default function NewPmLauncherClient({ role }: { role: string }) {
  const router = useRouter();
  const [pmKind, setPmKind] = useState<PmKind>("vehicle_pm");
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [assetSearch, setAssetSearch] = useState("");
  const [assetQrInput, setAssetQrInput] = useState("");
  const [assetQrError, setAssetQrError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<VehicleAssetRow[]>([]);
  const [equipment, setEquipment] = useState<EquipmentAssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      setLoading(true);
      setErrorMessage(null);
      const supabase = createSupabaseBrowser();
      const [vehiclesRes, equipmentRes] = await Promise.all([
        supabase
          .from("vehicles")
          .select("id,name,type,status,plate,asset,asset_qr")
          .order("name", { ascending: true })
          .limit(500),
        supabase
          .from("equipment")
          .select("id,name,equipment_type,status,external_id,asset_qr")
          .order("name", { ascending: true })
          .limit(500),
      ]);

      if (!active) return;

      if (vehiclesRes.error) {
        setErrorMessage(vehiclesRes.error.message);
        setVehicles([]);
      } else {
        setVehicles((vehiclesRes.data ?? []) as VehicleAssetRow[]);
      }

      if (equipmentRes.error) {
        setErrorMessage((prev) => prev ?? equipmentRes.error?.message ?? "Failed to load equipment.");
        setEquipment([]);
      } else {
        setEquipment((equipmentRes.data ?? []) as EquipmentAssetRow[]);
      }

      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  const assetOptions = useMemo<AssetOption[]>(() => {
    if (pmKind === "vehicle_pm") {
      return vehicles.map((row) => ({
        id: row.id,
        label: `${row.name?.trim() || row.id} · ${row.type?.trim() || "vehicle"}${row.status?.trim() ? ` · ${row.status.trim()}` : ""}`,
        searchText: [
          row.id,
          row.name ?? "",
          row.type ?? "",
          row.status ?? "",
          row.plate ?? "",
          row.asset ?? "",
          row.asset_qr ?? "",
        ]
          .join(" ")
          .toLowerCase(),
      }));
    }

    const filteredEquipment = equipment.filter((row) => {
      if (pmKind === "trailer_pm") return isTrailerEquipmentType(row.equipment_type);
      if (pmKind === "mower_pm") return isMowerEquipmentType(row.equipment_type);
      if (pmKind === "applicator_pm") return isApplicatorEquipmentType(row.equipment_type);
      return !isTrailerEquipmentType(row.equipment_type) && !isMowerEquipmentType(row.equipment_type) && !isApplicatorEquipmentType(row.equipment_type);
    });

    return filteredEquipment.map((row) => ({
      id: row.id,
      label: `${row.name?.trim() || row.id} · ${row.equipment_type?.trim() || "equipment"}${row.status?.trim() ? ` · ${row.status.trim()}` : ""}`,
      searchText: [
        row.id,
        row.name ?? "",
        row.equipment_type ?? "",
        row.status ?? "",
        row.external_id ?? "",
        row.asset_qr ?? "",
      ]
        .join(" ")
        .toLowerCase(),
    }));
  }, [equipment, pmKind, vehicles]);
  const visibleAssetOptions = useMemo(() => {
    const q = assetSearch.trim().toLowerCase();
    if (!q) return assetOptions;
    return assetOptions.filter((opt) => opt.searchText.includes(q));
  }, [assetOptions, assetSearch]);
  const effectiveSelectedAssetId = useMemo(() => {
    if (!visibleAssetOptions.length) return "";
    if (visibleAssetOptions.some((opt) => opt.id === selectedAssetId)) return selectedAssetId;
    return visibleAssetOptions[0].id;
  }, [visibleAssetOptions, selectedAssetId]);

  function findAssetIdByQr(rawValue: string) {
    const candidates = normalizedScanCandidates(rawValue);
    if (!candidates.length) return null;
    if (pmKind === "vehicle_pm") {
      for (const candidate of candidates) {
        const found = vehicles.find(
          (row) =>
            equalsCandidate(row.id, candidate) ||
            equalsCandidate(row.name, candidate) ||
            equalsCandidate(row.asset_qr, candidate) ||
            equalsCandidate(row.asset, candidate) ||
            equalsCandidate(row.plate, candidate)
        );
        if (found) return found.id;
      }
      return null;
    }

    const filteredEquipment = equipment.filter((row) => {
      if (pmKind === "trailer_pm") return isTrailerEquipmentType(row.equipment_type);
      if (pmKind === "mower_pm") return isMowerEquipmentType(row.equipment_type);
      if (pmKind === "applicator_pm") return isApplicatorEquipmentType(row.equipment_type);
      return !isTrailerEquipmentType(row.equipment_type) && !isMowerEquipmentType(row.equipment_type) && !isApplicatorEquipmentType(row.equipment_type);
    });

    for (const candidate of candidates) {
      const found = filteredEquipment.find(
        (row) =>
          equalsCandidate(row.id, candidate) ||
          equalsCandidate(row.name, candidate) ||
          equalsCandidate(row.asset_qr, candidate) ||
          equalsCandidate(row.external_id, candidate)
      );
      if (found) return found.id;
    }
    return null;
  }

  function selectAssetByQr() {
    const foundId = findAssetIdByQr(assetQrInput);
    if (!foundId) {
      setAssetQrError("No matching asset found for this QR value.");
      return;
    }
    setSelectedAssetId(foundId);
    setAssetSearch("");
    setAssetQrInput("");
    setAssetQrError(null);
  }

  function launchPm() {
    if (!effectiveSelectedAssetId) return;
    const encoded = encodeURIComponent(effectiveSelectedAssetId);
    const href =
      pmKind === "vehicle_pm"
        ? `/vehicles/${encoded}/forms/preventative-maintenance`
        : `/equipment/${encoded}/forms/preventative-maintenance`;
    setLaunching(true);
    router.push(href);
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Create Blank PM</h1>
          <div style={{ opacity: 0.78 }}>Choose PM type and asset, then start the inspection form.</div>
        </div>
        <Link href="/maintenance?section=operations" style={buttonStyle()}>
          Back to Maintenance
        </Link>
      </div>

      <div style={{ marginTop: 14, ...cardStyle(), display: "grid", gap: 12 }}>
        <div style={{ opacity: 0.8, fontSize: 13 }}>
          Role: <strong>{role}</strong>
        </div>

        {loading ? (
          <div style={{ opacity: 0.75 }}>Loading assets...</div>
        ) : errorMessage ? (
          <div style={{ color: "#ff9d9d" }}>{errorMessage}</div>
        ) : (
          <>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 800 }}>PM Type</span>
              <select value={pmKind} onChange={(e) => setPmKind(e.target.value as PmKind)} style={inputStyle()}>
                <option value="vehicle_pm">Vehicle PM</option>
                <option value="trailer_pm">Trailer PM</option>
                <option value="mower_pm">Mower PM</option>
                <option value="applicator_pm">Applicator PM</option>
                <option value="equipment_pm">Standard Equipment PM</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 800 }}>Asset</span>
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(240px, 1fr)", gap: 8 }}>
                  <input
                    value={assetSearch}
                    onChange={(e) => setAssetSearch(e.target.value)}
                    placeholder="Search asset..."
                    style={inputStyle()}
                  />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                    <input
                      value={assetQrInput}
                      onChange={(e) => {
                        setAssetQrInput(e.target.value);
                        if (assetQrError) setAssetQrError(null);
                      }}
                      placeholder="Scan asset QR..."
                      style={inputStyle()}
                    />
                    <button type="button" onClick={selectAssetByQr} style={buttonStyle()}>
                      Scan QR
                    </button>
                  </div>
                </div>
                {assetQrError ? <div style={{ color: "#ff9d9d", fontSize: 12 }}>{assetQrError}</div> : null}
              </div>
              <select
                value={effectiveSelectedAssetId}
                onChange={(e) => setSelectedAssetId(e.target.value)}
                style={inputStyle()}
              >
                {visibleAssetOptions.length === 0 ? <option value="">No matching assets</option> : null}
                {visibleAssetOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={launchPm}
                style={buttonStyle()}
                disabled={!effectiveSelectedAssetId || launching}
              >
                {launching ? "Opening..." : `Start ${pmKindLabel(pmKind)}`}
              </button>
              {!effectiveSelectedAssetId ? (
                <span style={{ opacity: 0.75, fontSize: 13 }}>No assets available for this PM type.</span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
