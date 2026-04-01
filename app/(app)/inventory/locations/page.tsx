"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { readRoleViewOverride, resolveEffectiveRole, type AppRole } from "@/lib/roleView";

type Role = AppRole;

type LocationRow = {
  id: string;
  name: string;
  location_type: string | null;
  notes: string | null;
  updated_at: string;
};

function canManageInventory(role: string | null | undefined) {
  return role === "owner" || role === "operations_manager" || role === "sales_manager" || role === "office_admin" || role === "mechanic";
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
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocationType, setEditLocationType] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [locationActionBusy, setLocationActionBusy] = useState(false);
  const [locationActionError, setLocationActionError] = useState<string | null>(null);

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
      setRole(
        resolveEffectiveRole(
          (profile?.role as Role | undefined) ?? "employee",
          readRoleViewOverride()
        ) as Role
      );
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

  function startEditLocation(loc: LocationRow) {
    setEditingLocationId(loc.id);
    setEditName(loc.name);
    setEditLocationType(loc.location_type ?? "");
    setEditNotes(loc.notes ?? "");
    setLocationActionError(null);
  }

  function cancelEditLocation() {
    setEditingLocationId(null);
    setEditName("");
    setEditLocationType("");
    setEditNotes("");
    setLocationActionError(null);
  }

  async function onSaveLocationEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingLocationId) return;
    setLocationActionError(null);

    if (!canManageInventory(role)) {
      setLocationActionError("You do not have permission to edit locations.");
      return;
    }

    const trimmedName = editName.trim();
    if (!trimmedName) {
      alert("Location name is required.");
      return;
    }

    setLocationActionBusy(true);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from("inventory_locations")
      .update({
        name: trimmedName,
        location_type: editLocationType.trim() || null,
        notes: editNotes.trim() || null,
      })
      .eq("id", editingLocationId);
    if (error) {
      console.error("[inventory-locations] update error:", error);
      setLocationActionError(error.message);
      setLocationActionBusy(false);
      return;
    }

    setLocationActionBusy(false);
    cancelEditLocation();
    await loadData();
  }

  async function onDeleteLocation(locationId: string) {
    setLocationActionError(null);

    if (!canManageInventory(role)) {
      setLocationActionError("You do not have permission to delete locations.");
      return;
    }

    if (!window.confirm("Delete this location?")) return;

    setLocationActionBusy(true);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("inventory_locations").delete().eq("id", locationId);
    if (error) {
      console.error("[inventory-locations] delete error:", error);
      setLocationActionError(error.message);
      setLocationActionBusy(false);
      return;
    }

    setLocationActionBusy(false);
    if (editingLocationId === locationId) {
      cancelEditLocation();
    }
    await loadData();
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>Inventory Locations</h1>
      <div style={{ opacity: 0.75 }}>Create and manage stock locations.</div>

      <div style={{ marginTop: 16, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Locations</div>
        {locationActionError ? (
          <div style={{ marginBottom: 10, color: "#ff9d9d" }}>{locationActionError}</div>
        ) : null}

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
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>{formatDateTime(loc.updated_at)}</div>
                    {canManageInventory(role) ? (
                      <>
                        <button
                          type="button"
                          onClick={() => startEditLocation(loc)}
                          style={secondaryButtonStyle}
                          disabled={locationActionBusy}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDeleteLocation(loc.id)}
                          style={{ ...secondaryButtonStyle, borderColor: "rgba(255,120,120,0.45)", color: "#ffb3b3" }}
                          disabled={locationActionBusy}
                        >
                          Delete
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                {editingLocationId === loc.id && canManageInventory(role) ? (
                  <form onSubmit={onSaveLocationEdit} style={{ marginTop: 10 }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: 10,
                      }}
                    >
                      <Field label="Name *">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          style={inputStyle()}
                          required
                        />
                      </Field>
                      <Field label="Location Type (optional)">
                        <input
                          value={editLocationType}
                          onChange={(e) => setEditLocationType(e.target.value)}
                          style={inputStyle()}
                        />
                      </Field>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <Field label="Notes (optional)">
                        <textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          rows={3}
                          style={{ ...inputStyle(), resize: "vertical" }}
                        />
                      </Field>
                    </div>
                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="submit" style={buttonStyle} disabled={locationActionBusy}>
                        {locationActionBusy ? "Saving..." : "Save Changes"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditLocation}
                        style={secondaryButtonStyle}
                        disabled={locationActionBusy}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div style={{ marginTop: 4, opacity: 0.82, fontSize: 13 }}>
                      Type: {loc.location_type ?? "-"}
                    </div>
                    {loc.notes ? <div style={{ marginTop: 6, opacity: 0.78 }}>{loc.notes}</div> : null}
                  </>
                )}
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

const secondaryButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "transparent",
  color: "inherit",
  fontWeight: 700,
  cursor: "pointer",
  opacity: 0.9,
};
