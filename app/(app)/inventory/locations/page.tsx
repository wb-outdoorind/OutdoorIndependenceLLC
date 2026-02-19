"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type Role = "owner" | "operations_manager" | "office_admin" | "mechanic" | "employee";

type LocationRow = {
  id: string;
  name: string;
  location_type: string | null;
  notes: string | null;
  updated_at: string;
};

function canManageInventory(role: string | null | undefined) {
  return role === "owner" || role === "operations_manager" || role === "office_admin" || role === "mechanic";
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
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

export default function InventoryLocationsPage() {
  const [role, setRole] = useState<Role | null>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [locationType, setLocationType] = useState("");
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function loadData() {
    const supabase = createSupabaseBrowser();
    setLoading(true);
    setErrorMessage(null);

    const { data: authData } = await supabase.auth.getUser();
    if (authData.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .maybeSingle();
      setRole((profile?.role as Role | undefined) ?? "employee");
    } else {
      setRole(null);
    }

    const { data, error } = await supabase
      .from("inventory_locations")
      .select("id,name,location_type,notes,updated_at")
      .order("name", { ascending: true });

    if (error || !data) {
      if (error) console.error("[inventory-locations] load error:", error);
      setErrorMessage(error?.message || "Failed to load locations.");
      setLocations([]);
      setLoading(false);
      return;
    }

    setLocations(data as LocationRow[]);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!canManageInventory(role)) {
      setSubmitError("You do not have permission to create locations.");
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) return alert("Location name is required.");

    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from("inventory_locations")
      .upsert(
        {
          name: trimmedName,
          location_type: locationType.trim() || null,
          notes: notes.trim() || null,
        },
        { onConflict: "name" }
      );

    if (error) {
      console.error("[inventory-locations] create error:", error);
      setSubmitError(error.message);
      return;
    }

    setName("");
    setLocationType("");
    setNotes("");
    await loadData();
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>Inventory Locations</h1>
      <div style={{ opacity: 0.75 }}>Create and manage stock locations.</div>

      <div style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Locations</div>

        {loading ? (
          <div style={{ opacity: 0.75 }}>Loading locations...</div>
        ) : errorMessage ? (
          <div style={{ color: "#ff9d9d", opacity: 0.95 }}>{errorMessage}</div>
        ) : locations.length === 0 ? (
          <div style={{ opacity: 0.75 }}>No locations yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {locations.map((loc) => (
              <div
                key={loc.id}
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  padding: 12,
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 900 }}>{loc.name}</div>
                  <div style={{ opacity: 0.7, fontSize: 12 }}>{formatDateTime(loc.updated_at)}</div>
                </div>
                <div style={{ marginTop: 4, opacity: 0.82, fontSize: 13 }}>
                  Type: {loc.location_type ?? "-"}
                </div>
                {loc.notes ? <div style={{ marginTop: 6, opacity: 0.78 }}>{loc.notes}</div> : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Create Location</div>

        {!canManageInventory(role) ? (
          <div style={{ opacity: 0.8 }}>
            You do not have permission to create locations. (owner/operations_manager/office_admin/mechanic only)
          </div>
        ) : (
          <form onSubmit={onCreate}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <Field label="Name *">
                <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle()} required />
              </Field>

              <Field label="Location Type (optional)">
                <input value={locationType} onChange={(e) => setLocationType(e.target.value)} style={inputStyle()} placeholder="Supply area / Mowing cart / Maintenance bay" />
              </Field>
            </div>

            <div style={{ marginTop: 12 }}>
              <Field label="Notes (optional)">
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle(), resize: "vertical" }} />
              </Field>
            </div>

            {submitError ? <div style={{ marginTop: 8, color: "#ff9d9d" }}>{submitError}</div> : null}

            <div style={{ marginTop: 12 }}>
              <button type="submit" style={buttonStyle}>
                Save Location
              </button>
            </div>
          </form>
        )}
      </div>
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

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  fontWeight: 900,
  cursor: "pointer",
};
