"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type InventoryLocation = {
  id: string;
  name: string;
};

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export default function NewInventoryItemClient() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [externalId, setExternalId] = useState("");
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [minimumQuantity, setMinimumQuantity] = useState("0");
  const [locationId, setLocationId] = useState("");
  const [supplier, setSupplier] = useState("");
  const [supplierLink, setSupplierLink] = useState("");
  const [notes, setNotes] = useState("");

  const [newLocationName, setNewLocationName] = useState("");
  const [creatingLocation, setCreatingLocation] = useState(false);

  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadLocations() {
      setLoading(true);
      const supabase = createSupabaseBrowser();
      const { data, error } = await supabase
        .from("inventory_locations")
        .select("id,name")
        .order("name", { ascending: true });

      if (!alive) return;
      if (error || !data) {
        if (error) console.error("[inventory-new] locations load error:", error);
        setLocations([]);
        setLoading(false);
        return;
      }

      setLocations(data as InventoryLocation[]);
      setLoading(false);
    }

    loadLocations();

    return () => {
      alive = false;
    };
  }, []);

  const suggestedId = useMemo(() => slugify(name || "item"), [name]);

  async function createLocationInline() {
    const trimmed = newLocationName.trim();
    if (!trimmed) return;

    setCreatingLocation(true);
    const supabase = createSupabaseBrowser();

    const { error: upsertError } = await supabase
      .from("inventory_locations")
      .upsert({ name: trimmed }, { onConflict: "name" });

    if (upsertError) {
      console.error("[inventory-new] create location error:", upsertError);
      setSubmitError(upsertError.message);
      setCreatingLocation(false);
      return;
    }

    const { data: locationRow, error: getError } = await supabase
      .from("inventory_locations")
      .select("id,name")
      .eq("name", trimmed)
      .maybeSingle();

    if (getError || !locationRow) {
      if (getError) console.error("[inventory-new] fetch location error:", getError);
      setSubmitError(getError?.message || "Failed to fetch created location.");
      setCreatingLocation(false);
      return;
    }

    const created = locationRow as InventoryLocation;
    setLocations((prev) => {
      if (prev.some((x) => x.id === created.id)) return prev;
      return [...prev, created].sort((a, b) => a.name.localeCompare(b.name));
    });
    setLocationId(created.id);
    setNewLocationName("");
    setCreatingLocation(false);
  }

  async function findUniqueId(baseId: string) {
    const supabase = createSupabaseBrowser();

    let idx = 1;
    while (idx < 10000) {
      const candidate = idx === 1 ? baseId : `${baseId}_${idx}`;
      const { data, error } = await supabase
        .from("inventory_items")
        .select("id")
        .eq("id", candidate)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) return candidate;
      idx += 1;
    }

    throw new Error("Unable to generate unique item id.");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const trimmedName = name.trim();
    if (!trimmedName) return alert("Item name is required.");

    const q = Number(quantity);
    const minQ = Number(minimumQuantity);

    if (!Number.isFinite(q) || q < 0) return alert("Quantity must be 0 or greater.");
    if (!Number.isFinite(minQ) || minQ < 0) return alert("Minimum quantity must be 0 or greater.");

    const baseId = slugify(trimmedName || "item") || "item";

    try {
      const uniqueId = await findUniqueId(baseId);
      const supabase = createSupabaseBrowser();

      const { error } = await supabase.from("inventory_items").insert({
        id: uniqueId,
        external_id: externalId.trim() || null,
        name: trimmedName,
        category: category.trim() || null,
        quantity: Math.trunc(q),
        minimum_quantity: Math.trunc(minQ),
        location_id: locationId || null,
        supplier: supplier.trim() || null,
        supplier_link: supplierLink.trim() || null,
        notes: notes.trim() || null,
        is_active: true,
      });

      if (error) {
        console.error("[inventory-new] insert error:", error);
        setSubmitError(error.message);
        return;
      }

      router.push(`/inventory/${encodeURIComponent(uniqueId)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create item.";
      setSubmitError(message);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>New Inventory Item</h1>
      <div style={{ opacity: 0.75 }}>Create a stock item and initial quantity.</div>

      {submitError ? (
        <div style={{ marginTop: 12, ...cardStyle(), color: "#ff9d9d", opacity: 0.95 }}>
          {submitError}
        </div>
      ) : null}

      <form onSubmit={onSubmit} style={{ marginTop: 16 }}>
        <div style={cardStyle()}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Item</div>
          <div style={gridStyle()}>
            <Field label="Item Name *">
              <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle()} required />
            </Field>

            <Field label="Generated ID (preview)">
              <input value={suggestedId || "item"} readOnly style={{ ...inputStyle(), opacity: 0.85 }} />
            </Field>

            <Field label="External ID (optional)">
              <input value={externalId} onChange={(e) => setExternalId(e.target.value)} style={inputStyle()} />
            </Field>

            <Field label="Category (optional)">
              <input value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle()} />
            </Field>
          </div>
        </div>

        <div style={{ marginTop: 16, ...cardStyle() }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Stock</div>
          <div style={gridStyle()}>
            <Field label="Quantity *">
              <input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric" style={inputStyle()} required />
            </Field>

            <Field label="Minimum Quantity *">
              <input value={minimumQuantity} onChange={(e) => setMinimumQuantity(e.target.value)} inputMode="numeric" style={inputStyle()} required />
            </Field>

            <Field label="Location (optional)">
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={inputStyle()}>
                <option value="">None</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Create Location Inline (optional)">
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  style={inputStyle()}
                  disabled={loading || creatingLocation}
                />
                <button
                  type="button"
                  onClick={createLocationInline}
                  style={secondaryButtonStyle()}
                  disabled={creatingLocation || !newLocationName.trim()}
                >
                  Add
                </button>
              </div>
            </Field>
          </div>
        </div>

        <div style={{ marginTop: 16, ...cardStyle() }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Supplier</div>
          <div style={gridStyle()}>
            <Field label="Supplier (optional)">
              <input value={supplier} onChange={(e) => setSupplier(e.target.value)} style={inputStyle()} />
            </Field>

            <Field label="Supplier Link (optional)">
              <input value={supplierLink} onChange={(e) => setSupplierLink(e.target.value)} style={inputStyle()} />
            </Field>
          </div>

          <div style={{ marginTop: 12 }}>
            <Field label="Notes (optional)">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} style={{ ...inputStyle(), resize: "vertical" }} />
            </Field>
          </div>
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" style={buttonStyle()}>
            Create Item
          </button>

          <button type="button" onClick={() => router.push("/inventory")} style={secondaryButtonStyle()}>
            Cancel
          </button>
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

function cardStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 16,
    padding: 16,
    background: "rgba(255,255,255,0.03)",
  };
}

function gridStyle(): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
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

function buttonStyle(): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "inherit",
    fontWeight: 900,
    cursor: "pointer",
  };
}

function secondaryButtonStyle(): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "transparent",
    color: "inherit",
    fontWeight: 800,
    cursor: "pointer",
    opacity: 0.9,
  };
}
