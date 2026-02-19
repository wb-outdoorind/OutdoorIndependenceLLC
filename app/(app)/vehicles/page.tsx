"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* ======================
   Supabase setup
====================== */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function getSupabase(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    throw new Error(
      "Missing env vars: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON);
}

/* ======================
   Types
====================== */

type VehicleRecord = {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  status: string | null;
  type: string | null;
  mileage: number | null;
};
type Role = "owner" | "office_admin" | "mechanic" | "employee";

function normalizeVehicleType(
  t: string | null
): "truck" | "car" | "skidsteer" | "loader" {
  const x = (t ?? "").trim().toLowerCase();
  if (x === "truck") return "truck";
  if (x === "car") return "car";
  if (x === "skidsteer" || x === "skid steer" || x === "skid_steer")
    return "skidsteer";
  if (x === "loader") return "loader";
  return "truck"; // safe default
}

/* ======================
   Styles
====================== */

function cardStyle(): CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 16,
    padding: 16,
    background: "rgba(255,255,255,0.03)",
  };
}

function inputStyle(): CSSProperties {
  return {
    width: "100%",
    padding: 10,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.03)",
    color: "inherit",
  };
}

/* ======================
   Page
====================== */

export default function VehiclesListPage() {
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Debug info
  const [rawCount, setRawCount] = useState<number | null>(null);
  const [debug, setDebug] = useState<string>("");

  const envOk = Boolean(SUPABASE_URL && SUPABASE_ANON);
  const isDev = process.env.NODE_ENV === "development";
  const [showDebug, setShowDebug] = useState(false);
  const [canCreateVehicle, setCanCreateVehicle] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);
      setDebug("");

      try {
        const supabase = getSupabase();

        const res = await supabase
          .from("vehicles")
          .select("id,name,make,model,year,status,type,mileage")
          .order("id", { ascending: true });

        if (!alive) return;

        if (res.error) {
          setErr(`${res.error.message}\n\n${JSON.stringify(res.error, null, 2)}`);
          setVehicles([]);
          setRawCount(null);
        } else {
          const rows = (res.data ?? []) as VehicleRecord[];
          setVehicles(rows);
          setRawCount(rows.length);
          setDebug(`Loaded ${rows.length} rows from vehicles`);
        }
      } catch (e) {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : String(e);
        setErr(msg);
        setVehicles([]);
        setRawCount(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const supabase = getSupabase();
        const { data: authData } = await supabase.auth.getUser();
        if (!alive || !authData.user) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", authData.user.id)
          .maybeSingle();

        if (!alive) return;
        const role = (profile?.role as Role | undefined) ?? "employee";
        setCanCreateVehicle(
          role === "owner" || role === "office_admin" || role === "mechanic"
        );
      } catch {
        if (!alive) return;
        setCanCreateVehicle(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return vehicles;

    return vehicles.filter((v) => {
      const hay = [
        v.id,
        v.name,
        v.make ?? "",
        v.model ?? "",
        typeof v.year === "number" ? String(v.year) : "",
        v.status ?? "",
        v.type ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(query);
    });
  }, [vehicles, q]);

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", paddingBottom: 32 }}>
      {/* DEBUG PANEL (dev only) */}
      {showDebug && (
        <div style={{ marginTop: 16, ...cardStyle() }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Debug</div>
          <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.4 }}>
            <div>
              SUPABASE_URL:{" "}
              <strong>{SUPABASE_URL ? "✅ set" : "❌ missing"}</strong>
            </div>
            <div>
              SUPABASE_ANON_KEY:{" "}
              <strong>{SUPABASE_ANON ? "✅ set" : "❌ missing"}</strong>
            </div>
            <div>
              Raw rows returned:{" "}
              <strong>{rawCount === null ? "—" : rawCount}</strong>
            </div>

            {debug ? <div style={{ marginTop: 6 }}>{debug}</div> : null}
            {!envOk ? (
              <div style={{ marginTop: 8, opacity: 0.9 }}>
                Fix: add env vars to <code>.env.local</code> and restart dev
                server.
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Header */}
      {isDev && (
        <button
          onClick={() => setShowDebug((s) => !s)}
          style={{
            marginTop: 12,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.05)",
            color: "inherit",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          {showDebug ? "Hide Debug" : "Show Debug"}
        </button>
      )}

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
          <h1 style={{ margin: 0 }}>Vehicles</h1>
          <div style={{ marginTop: 6, opacity: 0.75 }}>
            {loading ? "Loading vehicles..." : "Click a vehicle to view details."}
          </div>
        </div>

        <div style={{ minWidth: 260 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by ID, name, make, model, year..."
            style={inputStyle()}
          />
        </div>
      </div>

      {canCreateVehicle ? (
        <div style={{ marginTop: 12 }}>
          <Link href="/vehicles/new" style={addButtonStyle}>
            + Add Vehicle
          </Link>
        </div>
      ) : null}

      {/* List */}
      <div style={{ marginTop: 16, ...cardStyle() }}>
        {err ? (
          <div style={{ opacity: 0.95 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>
              Couldn’t load vehicles
            </div>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                opacity: 0.85,
                fontSize: 12,
                margin: 0,
              }}
            >
              {err}
            </pre>
          </div>
        ) : (
          <>
            <div style={{ opacity: 0.8, fontSize: 13, marginBottom: 10 }}>
              Showing <strong>{filtered.length}</strong> vehicle
              {filtered.length === 1 ? "" : "s"}.
            </div>

            {filtered.length === 0 ? (
              <div style={{ opacity: 0.75 }}>
                {loading ? "Loading…" : "No vehicles found."}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {filtered.map((v) => (
                  <Link
                    key={v.id}
                    href={`/vehicles/${encodeURIComponent(v.id)}`}
                    onClick={() => {
                      // ✅ store normalized type for downstream forms
                      const vt = normalizeVehicleType(v.type);
                      localStorage.setItem(`vehicle:${v.id}:type`, vt);

                      // ✅ store name so downstream forms can show it
                      localStorage.setItem(`vehicle:${v.id}:name`, v.name ?? "");

                      // ✅ store mileage for prefill + oil life
                      if (typeof v.mileage === "number") {
                        localStorage.setItem(
                          `vehicle:${v.id}:mileage`,
                          String(v.mileage)
                        );
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
                            {v.id} — {v.name}
                          </div>
                          <div
                            style={{
                              marginTop: 4,
                              opacity: 0.8,
                              fontSize: 13,
                            }}
                          >
                            {(v.make ?? "—")} • {(v.model ?? "—")} •{" "}
                            {typeof v.year === "number" ? v.year : "—"}
                            {v.type ? (
                              <>
                                {" "}
                                • <span style={{ opacity: 0.9 }}>{v.type}</span>
                              </>
                            ) : null}
                          </div>
                          <div style={{ marginTop: 6, opacity: 0.78, fontSize: 13 }}>
                            Current mileage:{" "}
                            <strong>
                              {typeof v.mileage === "number" ? `${v.mileage.toLocaleString()} mi` : "—"}
                            </strong>
                          </div>
                        </div>

                        <div
                          style={{
                            opacity: 0.75,
                            fontSize: 13,
                            alignSelf: "center",
                          }}
                        >
                          View →
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

const addButtonStyle: CSSProperties = {
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
