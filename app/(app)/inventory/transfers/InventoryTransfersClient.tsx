"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useEffect } from "react";

type InventoryItemRow = {
  id: string;
  name: string;
  location_id: string | null;
  quantity: number;
  is_active: boolean;
};

type InventoryLocationRow = {
  id: string;
  name: string;
};

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
  ...buttonStyle,
  background: "transparent",
  opacity: 0.9,
};

export default function InventoryTransfersClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const prefillItemId = sp?.get("itemId") ? decodeURIComponent(sp.get("itemId") as string) : "";
  const prefillFromLocationId = sp?.get("fromLocationId")
    ? decodeURIComponent(sp.get("fromLocationId") as string)
    : "";

  const [items, setItems] = useState<InventoryItemRow[]>([]);
  const [locations, setLocations] = useState<InventoryLocationRow[]>([]);

  const [itemSearch, setItemSearch] = useState("");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("1");
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setErrorMessage(null);

        const supabase = createSupabaseBrowser();
        const [itemsRes, locationsRes] = await Promise.all([
          supabase
            .from("inventory_items")
            .select("id,name,location_id,quantity,is_active")
            .eq("is_active", true)
            .order("name", { ascending: true }),
          supabase.from("inventory_locations").select("id,name").order("name", { ascending: true }),
        ]);

        if (itemsRes.error || locationsRes.error) {
          console.error("[inventory-transfers] load error:", {
            itemsError: itemsRes.error,
            locationsError: locationsRes.error,
          });
          setErrorMessage(itemsRes.error?.message || locationsRes.error?.message || "Failed to load transfer data.");
          setItems([]);
          setLocations([]);
          setLoading(false);
          return;
        }

        const itemsData = (itemsRes.data ?? []) as InventoryItemRow[];
        setItems(itemsData);
        setLocations((locationsRes.data ?? []) as InventoryLocationRow[]);

        if (prefillItemId && itemsData.some((i) => i.id === prefillItemId)) {
          setItemId(prefillItemId);
          const item = itemsData.find((i) => i.id === prefillItemId);
          if (item?.location_id) {
            setFromLocationId(item.location_id);
          }
        }

        if (prefillFromLocationId) {
          setFromLocationId(prefillFromLocationId);
        }

        setLoading(false);
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [prefillItemId, prefillFromLocationId]);

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => [item.id, item.name].join(" ").toLowerCase().includes(q));
  }, [items, itemSearch]);

  const selectedItem = useMemo(() => items.find((item) => item.id === itemId) ?? null, [items, itemId]);

  function onSelectItem(nextItemId: string) {
    setItemId(nextItemId);
    if (!nextItemId) return;

    const nextItem = items.find((item) => item.id === nextItemId);
    if (nextItem?.location_id) {
      setFromLocationId(nextItem.location_id);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);

    if (!itemId) return alert("Select an item.");

    const qtyNum = Math.trunc(Number(qty));
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      return alert("Qty to move must be a positive integer.");
    }

    if (!fromLocationId) return alert("Select a from location.");
    if (!toLocationId) return alert("Select a to location.");
    if (fromLocationId === toLocationId) return alert("From and To locations must be different.");

    setSubmitting(true);
    const supabase = createSupabaseBrowser();

    const { error: txError } = await supabase.from("inventory_transactions").insert({
      item_id: itemId,
      from_location_id: fromLocationId,
      to_location_id: toLocationId,
      change_qty: 0,
      reason: "transfer",
      notes: notes.trim() || null,
    });

    if (txError) {
      console.error("[inventory-transfers] transaction insert error:", txError);
      setSubmitError(txError.message);
      setSubmitting(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("inventory_items")
      .update({ location_id: toLocationId })
      .eq("id", itemId);

    if (updateError) {
      console.error("[inventory-transfers] item location update error:", updateError);
      setSubmitError(updateError.message);
      setSubmitting(false);
      return;
    }

    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              location_id: toLocationId,
            }
          : item
      )
    );

    setQty("1");
    setNotes("");
    setItemSearch("");
    setItemId("");
    setFromLocationId("");
    setToLocationId("");
    setSubmitting(false);
    setSuccessMessage("Transfer saved.");
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>Inventory Transfers</h1>
      <div style={{ opacity: 0.75 }}>Move inventory between locations.</div>

      {errorMessage ? (
        <div style={{ marginTop: 12, ...cardStyle(), color: "#ff9d9d" }}>{errorMessage}</div>
      ) : null}
      {successMessage ? (
        <div style={{ marginTop: 12, ...cardStyle(), color: "#b8ffd9" }}>{successMessage}</div>
      ) : null}

      <form onSubmit={onSubmit} style={{ marginTop: 16 }}>
        <div style={cardStyle()}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <Field label="Item Search">
              <input
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Search by item name"
                style={inputStyle()}
                disabled={loading}
              />
            </Field>

            <Field label="Item *">
              <select value={itemId} onChange={(e) => onSelectItem(e.target.value)} style={inputStyle()} required disabled={loading}>
                <option value="">Select item</option>
                {filteredItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.quantity} available)
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Qty to Move *">
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                inputMode="numeric"
                placeholder="1"
                style={inputStyle()}
                required
              />
            </Field>

            <Field label="From Location *">
              <select
                value={fromLocationId}
                onChange={(e) => setFromLocationId(e.target.value)}
                style={inputStyle()}
                required
                disabled={loading}
              >
                <option value="">Select from location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="To Location *">
              <select
                value={toLocationId}
                onChange={(e) => setToLocationId(e.target.value)}
                style={inputStyle()}
                required
                disabled={loading}
              >
                <option value="">Select to location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div style={{ marginTop: 12 }}>
            <Field label="Notes (optional)">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                style={{ ...inputStyle(), resize: "vertical" }}
              />
            </Field>
          </div>

          {selectedItem ? (
            <div style={{ marginTop: 8, opacity: 0.75, fontSize: 13 }}>
              Available quantity: <strong>{selectedItem.quantity}</strong>
            </div>
          ) : null}

          {submitError ? (
            <div style={{ marginTop: 10, color: "#ff9d9d" }}>{submitError}</div>
          ) : null}

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" style={buttonStyle} disabled={submitting || loading}>
              {submitting ? "Saving..." : "Save Transfer"}
            </button>

            <button
              type="button"
              style={secondaryButtonStyle}
              onClick={() => router.push(itemId ? `/inventory/${encodeURIComponent(itemId)}` : "/inventory")}
            >
              Cancel
            </button>
          </div>
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
