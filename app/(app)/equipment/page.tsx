"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type EquipmentRow = {
  id: string;
  name: string;
  equipment_type: string | null;
  status: string | null;
  current_hours: number | null;
  make: string | null;
  model: string | null;
  year: number | null;
};
type Role = "owner" | "operations_manager" | "office_admin" | "mechanic" | "employee";

function equipmentNameKey(equipmentId: string) {
  return `equipment:${equipmentId}:name`;
}

function equipmentTypeKey(equipmentId: string) {
  return `equipment:${equipmentId}:type`;
}

function equipmentHoursKey(equipmentId: string) {
  return `equipment:${equipmentId}:hours`;
}

function pickCategory(typeValue: string, nameValue: string, idValue: string) {
  const hay = `${typeValue} ${nameValue} ${idValue}`.toLowerCase();
  if (hay.includes("backpack blower")) return "BackpackBlower";
  if (hay.includes("hand blower") || hay.includes("blower hand")) return "HandBlower";
  if (hay.includes("truck")) return "Truck";
  if (hay.includes("trailer")) return "Trailer";
  if (hay.includes("mower")) return "Mower";
  if (hay.includes("applicator") || hay.includes("sprayer")) return "Applicator";
  if (hay.includes("skid")) return "SkidSteer";
  if (hay.includes("blower")) return "Blower";
  return "Equipment";
}

function toPascalToken(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

function withoutDuplicatePrefix(category: string, typeToken: string) {
  const lowerCategory = category.toLowerCase();
  const lowerType = typeToken.toLowerCase();
  if (lowerType === lowerCategory) return "Unit";
  if (lowerType.startsWith(lowerCategory)) {
    const trimmed = typeToken.slice(category.length);
    return trimmed || "Unit";
  }
  return typeToken;
}

function chooseSubtypeToken(typeValue: string, nameValue: string, idValue: string, category: string) {
  const hay = `${typeValue} ${nameValue} ${idValue}`.toLowerCase();

  if (category === "BackpackBlower") return "BackpackBlower";
  if (category === "HandBlower") return "HandBlower";
  if (category === "Blower") {
    if (hay.includes("backpack")) return "BackpackBlower";
    if (hay.includes("hand")) return "HandBlower";
    return "Blower";
  }

  const base = toPascalToken(typeValue || nameValue || idValue) || "Unit";
  return withoutDuplicatePrefix(category, base);
}

function buildConciseEquipmentId(row: EquipmentRow, indexByGroup: Record<string, number>) {
  const category = pickCategory(row.equipment_type ?? "", row.name ?? "", row.id);
  const subtype = chooseSubtypeToken(
    row.equipment_type ?? "",
    row.name ?? "",
    row.id,
    category
  );
  const groupKey = `${category}|${subtype}`;
  indexByGroup[groupKey] = (indexByGroup[groupKey] ?? 0) + 1;
  if (subtype === "Unit") return `${category}_${indexByGroup[groupKey]}`;
  if (subtype === category) return `${category}_${indexByGroup[groupKey]}`;
  return `${category}_${subtype}_${indexByGroup[groupKey]}`;
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

export default function EquipmentListPage() {
  const [rows, setRows] = useState<EquipmentRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canCreateEquipment, setCanCreateEquipment] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadEquipment() {
      setLoading(true);
      setErrorMessage(null);

      const supabase = createSupabaseBrowser();
      const { data, error } = await supabase
        .from("equipment")
        .select("id,name,equipment_type,status,current_hours,make,model,year")
        .order("name", { ascending: true });

      if (!alive) return;
      if (error || !data) {
        if (error) console.error("[equipment-list] load error:", error);
        setErrorMessage(error?.message || "Failed to load equipment.");
        setRows([]);
        setLoading(false);
        return;
      }

      setRows(data as EquipmentRow[]);
      setLoading(false);
    }

    loadEquipment();

    return () => {
      alive = false;
    };
  }, []);

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
      const role = (profile?.role as Role | undefined) ?? "employee";
      setCanCreateEquipment(
        role === "owner" || role === "operations_manager" || role === "office_admin" || role === "mechanic"
      );
    })();

    return () => {
      alive = false;
    };
  }, []);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.status?.trim()) set.add(r.status.trim());
    }
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter((r) => {
      if (statusFilter !== "All" && (r.status ?? "") !== statusFilter) return false;
      if (!q) return true;

      const hay = [
        r.id,
        r.name,
        r.equipment_type ?? "",
        r.status ?? "",
        typeof r.current_hours === "number" ? String(r.current_hours) : "",
        r.make ?? "",
        r.model ?? "",
        typeof r.year === "number" ? String(r.year) : "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [rows, search, statusFilter]);

  const conciseIdByEquipmentId = useMemo(() => {
    const map: Record<string, string> = {};
    const indexByGroup: Record<string, number> = {};
    for (const row of rows) {
      map[row.id] = buildConciseEquipmentId(row, indexByGroup);
    }
    return map;
  }, [rows]);

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", paddingBottom: 32 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginTop: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Equipment</h1>
          <div style={{ marginTop: 6, opacity: 0.75 }}>
            {loading ? "Loading equipment..." : "Click a record to view details."}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ID, name, type, status..."
            style={{ ...inputStyle(), width: 320, maxWidth: "100%" }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ ...inputStyle(), width: 180 }}
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {canCreateEquipment ? (
        <div style={{ marginTop: 12 }}>
          <Link href="/equipment/new" style={addButtonStyle}>
            + Add Equipment
          </Link>
        </div>
      ) : null}

      <div style={{ marginTop: 16, ...cardStyle() }}>
        {errorMessage ? (
          <div style={{ opacity: 0.9, color: "#ff9d9d" }}>{errorMessage}</div>
        ) : filtered.length === 0 ? (
          <div style={{ opacity: 0.75 }}>{loading ? "Loading..." : "No equipment found."}</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((r) => (
              <Link
                key={r.id}
                href={`/equipment/${encodeURIComponent(r.id)}`}
                onClick={() => {
                  localStorage.setItem(equipmentNameKey(r.id), r.name ?? "");
                  localStorage.setItem(equipmentTypeKey(r.id), r.equipment_type ?? "");
                  if (typeof r.current_hours === "number") {
                    localStorage.setItem(equipmentHoursKey(r.id), String(r.current_hours));
                  }
                }}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 14,
                    padding: 12,
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 16 }}>
                        {conciseIdByEquipmentId[r.id] ?? r.id} - {r.name}
                      </div>
                      <div style={{ marginTop: 3, opacity: 0.6, fontSize: 12 }}>Original ID: {r.id}</div>
                      <div style={{ marginTop: 4, opacity: 0.8, fontSize: 13 }}>
                        Type: {r.equipment_type ?? "-"} • Status: {r.status ?? "-"}
                      </div>
                      <div style={{ marginTop: 4, opacity: 0.7, fontSize: 12 }}>
                        {r.make ?? "-"} • {r.model ?? "-"} • {typeof r.year === "number" ? r.year : "-"}
                      </div>
                    </div>

                    <div style={{ textAlign: "right", minWidth: 120 }}>
                      <div style={{ opacity: 0.7, fontSize: 12 }}>Current Hours</div>
                      <div style={{ fontWeight: 900, fontSize: 18 }}>
                        {typeof r.current_hours === "number" ? r.current_hours.toLocaleString() : "-"}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

const addButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  textDecoration: "none",
  color: "inherit",
  fontWeight: 900,
  border: "1px solid rgba(126,255,167,0.35)",
  background: "rgba(126,255,167,0.14)",
  borderRadius: 12,
  padding: "10px 14px",
};
