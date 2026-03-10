"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type FormType =
  | "pre_trip"
  | "post_trip"
  | "vehicle_maintenance_request"
  | "vehicle_maintenance_log"
  | "vehicle_pm"
  | "equipment_maintenance_request"
  | "equipment_maintenance_log"
  | "equipment_pm";

type HistoryFilter = "pre_post" | "all" | FormType;
type HistoryAssetTypeFilter = "all" | "vehicle" | "equipment";
type HistoryScope = "mine" | "mine_plus_reports" | "all";

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

type HistoryItem = {
  key: string;
  formType: FormType;
  formLabel: string;
  createdAt: string;
  submittedBy: string | null;
  assetType: "vehicle" | "equipment";
  assetId: string;
  assetLabel: string;
  status: string | null;
  summary: string | null;
  href: string;
};

type FormsHistoryResponse = {
  items?: HistoryItem[];
  meta?: {
    scopeApplied?: HistoryScope;
    canViewFullHistory?: boolean;
    canUseDirectReportsScope?: boolean;
    nextCursor?: string | null;
  };
  error?: string;
};

type HistorySpecificAssetFilterOption = {
  value: string;
  label: string;
};

type FormOption = {
  id: FormType;
  label: string;
  assetType: "vehicle" | "equipment";
  requiresMaintenancePermission: boolean;
  requiresPmPermission?: boolean;
};

const FORM_OPTIONS: FormOption[] = [
  { id: "pre_trip", label: "Pre-Trip Inspection", assetType: "vehicle", requiresMaintenancePermission: false },
  { id: "post_trip", label: "Post-Trip Inspection", assetType: "vehicle", requiresMaintenancePermission: false },
  {
    id: "vehicle_maintenance_request",
    label: "Vehicle Maintenance Request",
    assetType: "vehicle",
    requiresMaintenancePermission: true,
  },
  {
    id: "vehicle_maintenance_log",
    label: "Vehicle Maintenance Log",
    assetType: "vehicle",
    requiresMaintenancePermission: true,
  },
  {
    id: "vehicle_pm",
    label: "Vehicle Preventative Maintenance",
    assetType: "vehicle",
    requiresMaintenancePermission: false,
    requiresPmPermission: true,
  },
  {
    id: "equipment_maintenance_request",
    label: "Equipment Maintenance Request",
    assetType: "equipment",
    requiresMaintenancePermission: true,
  },
  {
    id: "equipment_maintenance_log",
    label: "Equipment Maintenance Log",
    assetType: "equipment",
    requiresMaintenancePermission: true,
  },
  {
    id: "equipment_pm",
    label: "Equipment Preventative Maintenance",
    assetType: "equipment",
    requiresMaintenancePermission: false,
    requiresPmPermission: true,
  },
];

const FULL_HISTORY_ROLES = new Set([
  "owner",
  "operations_manager",
  "office_admin",
  "mechanic",
  "team_lead_1",
  "team_lead_2",
]);

const DIRECT_REPORT_SCOPE_ROLES = new Set([
  "owner",
  "operations_manager",
  "office_admin",
  "team_lead_1",
  "team_lead_2",
]);

const HISTORY_PAGE_SIZE = 120;

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

function badgeStyle(label: string): React.CSSProperties {
  const base: React.CSSProperties = {
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.16)",
    padding: "3px 9px",
    fontSize: 12,
    fontWeight: 800,
  };
  if (label.toLowerCase().includes("request")) {
    return { ...base, border: "1px solid rgba(255,210,0,0.28)", background: "rgba(255,210,0,0.1)" };
  }
  if (label.toLowerCase().includes("log")) {
    return { ...base, border: "1px solid rgba(170,170,255,0.24)", background: "rgba(170,170,255,0.08)" };
  }
  if (label.toLowerCase().includes("pm") || label.toLowerCase().includes("preventative")) {
    return { ...base, border: "1px solid rgba(0,255,120,0.24)", background: "rgba(0,255,120,0.08)" };
  }
  return { ...base, border: "1px solid rgba(100,180,255,0.28)", background: "rgba(100,180,255,0.09)" };
}

function canCreateMaintenanceForms(role: string | null | undefined) {
  return (role ?? "").trim() !== "apprentice";
}

function canCreatePmForms(role: string | null | undefined) {
  const r = (role ?? "").trim();
  return (
    r === "owner" ||
    r === "operations_manager" ||
    r === "office_admin" ||
    r === "mechanic"
  );
}

function canViewFullHistory(role: string | null | undefined) {
  return FULL_HISTORY_ROLES.has((role ?? "").trim());
}

function canUseDirectReportsScope(role: string | null | undefined) {
  return DIRECT_REPORT_SCOPE_ROLES.has((role ?? "").trim());
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

function formRoute(formType: FormType, assetId: string) {
  const id = encodeURIComponent(assetId);
  if (formType === "pre_trip") return `/vehicles/${id}/forms/pre-trip`;
  if (formType === "post_trip") return `/vehicles/${id}/forms/post-trip`;
  if (formType === "vehicle_maintenance_request") return `/vehicles/${id}/forms/maintenance-request`;
  if (formType === "vehicle_maintenance_log") return `/vehicles/${id}/forms/maintenance-log`;
  if (formType === "vehicle_pm") return `/vehicles/${id}/forms/preventative-maintenance`;
  if (formType === "equipment_maintenance_request") return `/equipment/${id}/forms/maintenance-request`;
  if (formType === "equipment_maintenance_log") return `/equipment/${id}/forms/maintenance-log`;
  return `/equipment/${id}/forms/preventative-maintenance`;
}

function formatDateTime(iso: string) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString();
}

function historyTypesForFilter(filter: HistoryFilter) {
  if (filter === "pre_post") return "pre_trip,post_trip";
  if (filter === "all") return "all";
  return filter;
}

export default function FormsClient({
  role,
  fullName,
  email,
}: {
  role: string;
  fullName: string | null;
  email: string | null;
}) {
  const router = useRouter();
  const scanInputRef = useRef<HTMLInputElement | null>(null);

  const [vehicles, setVehicles] = useState<VehicleAssetRow[]>([]);
  const [equipment, setEquipment] = useState<EquipmentAssetRow[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assetLoadError, setAssetLoadError] = useState<string | null>(null);

  const allowedFormOptions = useMemo(() => {
    const canCreateMaintenance = canCreateMaintenanceForms(role);
    const canCreatePm = canCreatePmForms(role);
    return FORM_OPTIONS.filter((opt) => {
      if (opt.requiresMaintenancePermission && !canCreateMaintenance) return false;
      if (opt.requiresPmPermission && !canCreatePm) return false;
      return true;
    });
  }, [role]);

  const [selectedFormType, setSelectedFormType] = useState<FormType>("pre_trip");
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [assetSearch, setAssetSearch] = useState("");
  const [scannerBuffer, setScannerBuffer] = useState("");
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerStatus, setScannerStatus] = useState("");
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

  const fullHistory = canViewFullHistory(role);
  const directReportsScopeAllowed = canUseDirectReportsScope(role);
  const [historyScope, setHistoryScope] = useState<HistoryScope>(
    fullHistory && directReportsScopeAllowed ? "mine_plus_reports" : "mine"
  );
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [historyAssetTypeFilter, setHistoryAssetTypeFilter] = useState<HistoryAssetTypeFilter>("all");
  const [historyAssetFilter, setHistoryAssetFilter] = useState<string>("all");
  const [historyAssetFilterMenuOpen, setHistoryAssetFilterMenuOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<HistoryItem[]>([]);
  const [historyNextCursor, setHistoryNextCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      setLoadingAssets(true);
      setAssetLoadError(null);
      const supabase = createSupabaseBrowser();
      const [vehiclesRes, equipmentRes] = await Promise.all([
        supabase
          .from("vehicles")
          .select("id,name,type,status,plate,asset,asset_qr")
          .order("name", { ascending: true })
          .limit(600),
        supabase
          .from("equipment")
          .select("id,name,equipment_type,status,external_id,asset_qr")
          .order("name", { ascending: true })
          .limit(600),
      ]);

      if (!active) return;

      if (vehiclesRes.error) {
        setAssetLoadError(vehiclesRes.error.message);
        setVehicles([]);
      } else {
        setVehicles((vehiclesRes.data ?? []) as VehicleAssetRow[]);
      }

      if (equipmentRes.error) {
        setAssetLoadError((prev) => prev ?? equipmentRes.error?.message ?? "Failed to load equipment.");
        setEquipment([]);
      } else {
        setEquipment((equipmentRes.data ?? []) as EquipmentAssetRow[]);
      }

      setLoadingAssets(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  const effectiveSelectedFormType = useMemo<FormType>(() => {
    if (allowedFormOptions.some((option) => option.id === selectedFormType)) return selectedFormType;
    return allowedFormOptions[0]?.id ?? "pre_trip";
  }, [allowedFormOptions, selectedFormType]);

  const selectedOption = useMemo(
    () => allowedFormOptions.find((opt) => opt.id === effectiveSelectedFormType) ?? allowedFormOptions[0] ?? null,
    [allowedFormOptions, effectiveSelectedFormType]
  );

  const effectiveHistoryScope: HistoryScope = useMemo(() => {
    if (!fullHistory) return "mine";
    if (!directReportsScopeAllowed && historyScope === "mine_plus_reports") return "mine";
    return historyScope;
  }, [directReportsScopeAllowed, fullHistory, historyScope]);

  const assetOptions = useMemo<AssetOption[]>(() => {
    if (!selectedOption) return [];
    if (selectedOption.assetType === "vehicle") {
      return vehicles.map((row) => ({
        id: row.id,
        label: `${row.name?.trim() || row.id}${row.type?.trim() ? ` (${row.type.trim()})` : ""}${row.status?.trim() ? ` · ${row.status.trim()}` : ""}`,
        searchText: [row.id, row.name ?? "", row.type ?? "", row.status ?? "", row.plate ?? "", row.asset ?? "", row.asset_qr ?? ""]
          .join(" ")
          .toLowerCase(),
      }));
    }

    return equipment.map((row) => ({
      id: row.id,
      label: `${row.name?.trim() || row.id}${row.equipment_type?.trim() ? ` (${row.equipment_type.trim()})` : ""}${row.status?.trim() ? ` · ${row.status.trim()}` : ""}`,
      searchText: [row.id, row.name ?? "", row.equipment_type ?? "", row.status ?? "", row.external_id ?? "", row.asset_qr ?? ""]
        .join(" ")
        .toLowerCase(),
    }));
  }, [equipment, selectedOption, vehicles]);

  const visibleAssetOptions = useMemo(() => {
    const q = assetSearch.trim().toLowerCase();
    if (!q) return assetOptions;
    return assetOptions.filter((option) => option.searchText.includes(q));
  }, [assetOptions, assetSearch]);

  const effectiveSelectedAssetId = useMemo(() => {
    if (!visibleAssetOptions.length) return "";
    if (visibleAssetOptions.some((option) => option.id === selectedAssetId)) return selectedAssetId;
    return visibleAssetOptions[0].id;
  }, [selectedAssetId, visibleAssetOptions]);

  const findAssetByQr = useCallback(
    (rawValue: string) => {
      const candidates = normalizedScanCandidates(rawValue);
      if (!candidates.length || !selectedOption) return null;

      if (selectedOption.assetType === "vehicle") {
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

      for (const candidate of candidates) {
        const found = equipment.find(
          (row) =>
            equalsCandidate(row.id, candidate) ||
            equalsCandidate(row.name, candidate) ||
            equalsCandidate(row.asset_qr, candidate) ||
            equalsCandidate(row.external_id, candidate)
        );
        if (found) return found.id;
      }
      return null;
    },
    [equipment, selectedOption, vehicles]
  );

  const completeScan = useCallback(
    (rawValue: string) => {
      const foundId = findAssetByQr(rawValue);
      if (!foundId) {
        const target = selectedOption?.assetType === "vehicle" ? "vehicle" : "equipment";
        setScannerError(`No matching ${target} found for this QR value.`);
        setScannerStatus("No matching asset found. Scan again.");
        setScannerBuffer("");
        requestAnimationFrame(() => scanInputRef.current?.focus());
        return;
      }

      setSelectedAssetId(foundId);
      setAssetSearch("");
      setScannerBuffer("");
      setScannerActive(false);
      setScannerStatus("Asset selected from QR.");
      setScannerError(null);
      scanInputRef.current?.blur();
    },
    [findAssetByQr, selectedOption]
  );

  function armScanner() {
    setScannerActive(true);
    setScannerBuffer("");
    setScannerError(null);
    setScannerStatus("Scanner ready. Scan the asset QR now.");
    requestAnimationFrame(() => scanInputRef.current?.focus());
  }

  useEffect(() => {
    if (!scannerActive) return;
    const value = scannerBuffer.trim();
    if (!value) return;
    const timer = window.setTimeout(() => {
      completeScan(value);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [completeScan, scannerActive, scannerBuffer]);

  useEffect(() => {
    if (scannerActive || !scannerStatus) return;
    const timer = window.setTimeout(() => setScannerStatus(""), 1800);
    return () => window.clearTimeout(timer);
  }, [scannerActive, scannerStatus]);

  useEffect(() => {
    let active = true;

    async function loadHistoryFirstPage() {
      setHistoryLoading(true);
      setHistoryLoadingMore(false);
      setHistoryError(null);
      setHistoryNextCursor(null);
      const scope = effectiveHistoryScope;
      const types = historyTypesForFilter(historyFilter);
      const url = `/api/forms/history?scope=${encodeURIComponent(scope)}&types=${encodeURIComponent(types)}&limit=${HISTORY_PAGE_SIZE}`;

      const res = await fetch(url, { method: "GET" });
      const json = (await res.json().catch(() => ({}))) as FormsHistoryResponse;
      if (!active) return;

      if (!res.ok) {
        setHistoryRows([]);
        setHistoryNextCursor(null);
        setHistoryError(json.error || "Failed to load form history.");
      } else {
        setHistoryRows(Array.isArray(json.items) ? json.items : []);
        setHistoryNextCursor(typeof json.meta?.nextCursor === "string" ? json.meta.nextCursor : null);
        setHistoryError(null);
      }

      setHistoryLoading(false);
    }

    void loadHistoryFirstPage();

    return () => {
      active = false;
    };
  }, [effectiveHistoryScope, historyFilter]);

  async function loadMoreHistory() {
    if (!historyNextCursor || historyLoadingMore || historyLoading) return;
    setHistoryLoadingMore(true);
    setHistoryError(null);

    const scope = effectiveHistoryScope;
    const types = historyTypesForFilter(historyFilter);
    const url = `/api/forms/history?scope=${encodeURIComponent(scope)}&types=${encodeURIComponent(types)}&limit=${HISTORY_PAGE_SIZE}&cursor=${encodeURIComponent(historyNextCursor)}`;

    const res = await fetch(url, { method: "GET" });
    const json = (await res.json().catch(() => ({}))) as FormsHistoryResponse;

    if (!res.ok) {
      setHistoryError(json.error || "Failed to load more history.");
      setHistoryLoadingMore(false);
      return;
    }

    const nextItems = Array.isArray(json.items) ? json.items : [];
    setHistoryRows((prev) => {
      if (!nextItems.length) return prev;
      const seen = new Set(prev.map((row) => row.key));
      const additions = nextItems.filter((row) => !seen.has(row.key));
      return additions.length ? [...prev, ...additions] : prev;
    });
    setHistoryNextCursor(typeof json.meta?.nextCursor === "string" ? json.meta.nextCursor : null);
    setHistoryLoadingMore(false);
  }

  const historyAssetOptions = useMemo<HistorySpecificAssetFilterOption[]>(() => {
    const map = new Map<string, string>();
    for (const row of historyRows) {
      if (historyAssetTypeFilter !== "all" && row.assetType !== historyAssetTypeFilter) continue;
      const key = `${row.assetType}:${row.assetId}`;
      const prefix = row.assetType === "vehicle" ? "Vehicle" : "Equipment";
      map.set(key, `${prefix}: ${row.assetLabel}`);
    }
    const options = Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: "all", label: "All assets" }, ...options];
  }, [historyAssetTypeFilter, historyRows]);

  const effectiveHistoryAssetFilter = useMemo(() => {
    if (historyAssetFilter === "all") return "all";
    if (historyAssetOptions.some((option) => option.value === historyAssetFilter)) {
      return historyAssetFilter;
    }
    return "all";
  }, [historyAssetFilter, historyAssetOptions]);

  const historyAssetFilterSummary = useMemo(() => {
    const typeLabel =
      historyAssetTypeFilter === "all"
        ? "All asset types"
        : historyAssetTypeFilter === "vehicle"
          ? "Vehicles"
          : "Equipment";
    const specificLabel =
      effectiveHistoryAssetFilter === "all"
        ? "All assets"
        : historyAssetOptions.find((option) => option.value === effectiveHistoryAssetFilter)?.label ?? "All assets";
    return `${typeLabel} · ${specificLabel}`;
  }, [effectiveHistoryAssetFilter, historyAssetOptions, historyAssetTypeFilter]);

  const filteredHistoryRows = useMemo(() => {
    return historyRows.filter((row) => {
      if (historyAssetTypeFilter !== "all" && row.assetType !== historyAssetTypeFilter) return false;
      if (effectiveHistoryAssetFilter !== "all" && `${row.assetType}:${row.assetId}` !== effectiveHistoryAssetFilter) {
        return false;
      }
      return true;
    });
  }, [effectiveHistoryAssetFilter, historyAssetTypeFilter, historyRows]);

  function launchForm() {
    if (!selectedOption || !effectiveSelectedAssetId) return;
    setLaunching(true);
    router.push(formRoute(selectedOption.id, effectiveSelectedAssetId));
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", paddingBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Forms</h1>
          <div style={{ opacity: 0.78 }}>
            Create blank forms and review submission history.
          </div>
        </div>
        <Link href="/" style={buttonStyle()}>
          Back Home
        </Link>
      </div>

      <div style={{ marginTop: 14, ...cardStyle(), display: "grid", gap: 12 }}>
        <div style={{ opacity: 0.8, fontSize: 13 }}>
          Signed in as <strong>{fullName?.trim() || email?.trim() || "Unknown user"}</strong> ({role.replaceAll("_", " ")})
        </div>

        <div style={{ fontWeight: 900, fontSize: 16 }}>Create Blank Form</div>

        {loadingAssets ? (
          <div style={{ opacity: 0.75 }}>Loading assets...</div>
        ) : assetLoadError ? (
          <div style={{ color: "#ff9d9d" }}>{assetLoadError}</div>
        ) : (
          <>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 800 }}>Form Type</span>
              <select
                value={effectiveSelectedFormType}
                onChange={(e) => setSelectedFormType(e.target.value as FormType)}
                style={inputStyle()}
              >
                {allowedFormOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 800 }}>Asset</span>
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) auto", gap: 8 }}>
                  <input
                    value={assetSearch}
                    onChange={(e) => setAssetSearch(e.target.value)}
                    placeholder={`Search ${selectedOption?.assetType ?? "asset"}...`}
                    style={inputStyle()}
                  />
                  <button type="button" onClick={armScanner} style={buttonStyle()}>
                    {scannerActive ? "Ready to Scan..." : "Scan QR"}
                  </button>
                </div>

                <input
                  ref={scanInputRef}
                  type="text"
                  value={scannerBuffer}
                  onChange={(e) => setScannerBuffer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    completeScan(scannerBuffer);
                  }}
                  aria-hidden="true"
                  tabIndex={-1}
                  style={{ position: "absolute", left: -9999, top: 0, width: 1, height: 1, opacity: 0 }}
                />
                {scannerStatus ? <div style={{ opacity: 0.78, fontSize: 12 }}>{scannerStatus}</div> : null}
                {scannerError ? <div style={{ color: "#ff9d9d", fontSize: 12 }}>{scannerError}</div> : null}
              </div>

              <select
                value={effectiveSelectedAssetId}
                onChange={(e) => setSelectedAssetId(e.target.value)}
                style={inputStyle()}
              >
                {visibleAssetOptions.length === 0 ? <option value="">No matching assets</option> : null}
                {visibleAssetOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={launchForm}
                style={buttonStyle()}
                disabled={!effectiveSelectedAssetId || launching || !selectedOption}
              >
                {launching ? "Opening..." : `Start ${selectedOption?.label ?? "Form"}`}
              </button>
              {!effectiveSelectedAssetId ? (
                <span style={{ opacity: 0.75, fontSize: 13 }}>
                  No assets available for this form type.
                </span>
              ) : null}
            </div>

            <div style={{ opacity: 0.72, fontSize: 12 }}>
              Maintenance request/log forms are hidden for Apprentice role. Preventative Maintenance forms are visible to mechanic and higher roles.
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: 16, ...cardStyle(), display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>Form History</div>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 800 }}>History Filter</span>
            <select
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value as HistoryFilter)}
              style={inputStyle()}
            >
              <option value="all">All Form Types</option>
              <option value="pre_post">Pre/Post Trip Inspections</option>
              <option value="pre_trip">Pre-Trip Inspections</option>
              <option value="post_trip">Post-Trip Inspections</option>
              <option value="vehicle_maintenance_request">Vehicle Maintenance Requests</option>
              <option value="vehicle_maintenance_log">Vehicle Maintenance Logs</option>
              <option value="vehicle_pm">Vehicle PM</option>
              <option value="equipment_maintenance_request">Equipment Maintenance Requests</option>
              <option value="equipment_maintenance_log">Equipment Maintenance Logs</option>
              <option value="equipment_pm">Equipment PM</option>
            </select>
          </label>

          <div style={{ display: "grid", gap: 6, position: "relative" }}>
            <span style={{ fontWeight: 800 }}>Asset Filters</span>
            <button
              type="button"
              onClick={() => setHistoryAssetFilterMenuOpen((prev) => !prev)}
              style={buttonStyle()}
            >
              {historyAssetFilterMenuOpen ? "Close Filters" : "Open Asset Filters"}
            </button>
            <div style={{ opacity: 0.72, fontSize: 12 }}>{historyAssetFilterSummary}</div>

            {historyAssetFilterMenuOpen ? (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  marginTop: 8,
                  zIndex: 5,
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 14,
                  background: "rgba(12,14,18,0.98)",
                  padding: 12,
                  display: "grid",
                  gap: 10,
                  boxShadow: "0 14px 36px rgba(0,0,0,0.35)",
                }}
              >
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, opacity: 0.78 }}>Asset Type</span>
                  <select
                    value={historyAssetTypeFilter}
                    onChange={(e) => setHistoryAssetTypeFilter(e.target.value as HistoryAssetTypeFilter)}
                    style={inputStyle()}
                  >
                    <option value="all">All asset types</option>
                    <option value="vehicle">Vehicles only</option>
                    <option value="equipment">Equipment only</option>
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, opacity: 0.78 }}>Specific Asset</span>
                  <select
                    value={effectiveHistoryAssetFilter}
                    onChange={(e) => setHistoryAssetFilter(e.target.value)}
                    style={inputStyle()}
                  >
                    {historyAssetOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryAssetTypeFilter("all");
                      setHistoryAssetFilter("all");
                    }}
                    style={buttonStyle()}
                  >
                    Clear
                  </button>
                  <button type="button" onClick={() => setHistoryAssetFilterMenuOpen(false)} style={buttonStyle()}>
                    Apply
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {fullHistory ? (
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 800 }}>History Scope</span>
              <select
                value={historyScope}
                onChange={(e) => setHistoryScope(e.target.value as HistoryScope)}
                style={inputStyle()}
              >
                <option value="mine">Mine</option>
                {directReportsScopeAllowed ? <option value="mine_plus_reports">Mine + Direct Reports</option> : null}
                <option value="all">All Teammates</option>
              </select>
            </label>
          ) : (
            <div style={{ opacity: 0.75, fontSize: 13, alignSelf: "end" }}>
              Viewing your own form history.
            </div>
          )}
        </div>

        {historyLoading ? <div style={{ opacity: 0.75 }}>Loading form history...</div> : null}
        {historyError ? <div style={{ color: "#ff9d9d" }}>{historyError}</div> : null}

        {!historyLoading && !historyError ? (
          <div style={{ display: "grid", gap: 10 }}>
            {filteredHistoryRows.length === 0 ? (
              <div style={{ opacity: 0.75 }}>No form history found for the selected filter.</div>
            ) : (
              filteredHistoryRows.map((row) => (
                <div
                  key={row.key}
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 14,
                    padding: 12,
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={badgeStyle(row.formLabel)}>{row.formLabel}</span>
                      <strong>{row.assetLabel}</strong>
                      {row.status ? (
                        <span
                          style={{
                            borderRadius: 999,
                            padding: "2px 8px",
                            fontSize: 11,
                            border: "1px solid rgba(255,255,255,0.16)",
                            opacity: 0.9,
                          }}
                        >
                          {row.status}
                        </span>
                      ) : null}
                    </div>
                    <div style={{ opacity: 0.72, fontSize: 13 }}>{formatDateTime(row.createdAt)}</div>
                  </div>

                  <div style={{ marginTop: 6, opacity: 0.82, fontSize: 13 }}>
                    Submitted by: <strong>{row.submittedBy?.trim() || "Unknown"}</strong>
                  </div>

                  {row.summary ? (
                    <div style={{ marginTop: 6, opacity: 0.78, lineHeight: 1.35 }}>{row.summary}</div>
                  ) : null}

                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Link href={row.href} style={buttonStyle()}>
                      See Form
                    </Link>
                    <Link
                      href={
                        row.assetType === "vehicle"
                          ? `/vehicles/${encodeURIComponent(row.assetId)}`
                          : `/equipment/${encodeURIComponent(row.assetId)}`
                      }
                      style={buttonStyle()}
                    >
                      Open Asset
                    </Link>
                  </div>
                </div>
              ))
            )}
            {!historyLoading && historyNextCursor ? (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
                <button type="button" onClick={loadMoreHistory} style={buttonStyle()} disabled={historyLoadingMore}>
                  {historyLoadingMore ? "Loading more..." : "Load More"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
