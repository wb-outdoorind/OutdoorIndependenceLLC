"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type Role = "owner" | "office_admin" | "mechanic" | "employee";

type InventoryItemRow = {
  id: string;
  external_id: string | null;
  name: string;
  category: string | null;
  quantity: number;
  minimum_quantity: number;
  location_id: string | null;
  supplier: string | null;
  supplier_link: string | null;
  notes: string | null;
  is_active: boolean;
  updated_at: string;
};

type InventoryLocationRow = {
  id: string;
  name: string;
};

type InventoryTransactionRow = {
  id: string;
  created_at: string;
  item_id: string;
  from_location_id: string | null;
  to_location_id: string | null;
  change_qty: number;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_by: string;
};

function canManageInventory(role: string | null | undefined) {
  return role === "owner" || role === "office_admin" || role === "mechanic";
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

export default function InventoryItemDetailPage() {
  const params = useParams<{ id: string }>();
  const itemId = decodeURIComponent(params.id);

  const [item, setItem] = useState<InventoryItemRow | null>(null);
  const [locations, setLocations] = useState<InventoryLocationRow[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransactionRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);

  const [changeQty, setChangeQty] = useState("");
  const [reason, setReason] = useState("adjustment");
  const [toLocationId, setToLocationId] = useState("");
  const [referenceType, setReferenceType] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

    const [itemRes, locationsRes, txRes] = await Promise.all([
      supabase
        .from("inventory_items")
        .select(
          "id,external_id,name,category,quantity,minimum_quantity,location_id,supplier,supplier_link,notes,is_active,updated_at"
        )
        .eq("id", itemId)
        .maybeSingle(),
      supabase.from("inventory_locations").select("id,name").order("name", { ascending: true }),
      supabase
        .from("inventory_transactions")
        .select(
          "id,created_at,item_id,from_location_id,to_location_id,change_qty,reason,reference_type,reference_id,notes,created_by"
        )
        .eq("item_id", itemId)
        .order("created_at", { ascending: false }),
    ]);

    if (itemRes.error || locationsRes.error || txRes.error) {
      console.error("[inventory-detail] load error:", {
        itemError: itemRes.error,
        locationsError: locationsRes.error,
        transactionsError: txRes.error,
      });
      setErrorMessage(itemRes.error?.message || locationsRes.error?.message || txRes.error?.message || "Failed to load item.");
      setItem(null);
      setLocations([]);
      setTransactions([]);
      setLoading(false);
      return;
    }

    if (!itemRes.data) {
      setErrorMessage(`Item not found. Tried id=\"${itemId}\"`);
      setItem(null);
      setLocations((locationsRes.data ?? []) as InventoryLocationRow[]);
      setTransactions((txRes.data ?? []) as InventoryTransactionRow[]);
      setLoading(false);
      return;
    }

    setItem(itemRes.data as InventoryItemRow);
    setLocations((locationsRes.data ?? []) as InventoryLocationRow[]);
    setTransactions((txRes.data ?? []) as InventoryTransactionRow[]);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const locationNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const l of locations) map[l.id] = l.name;
    return map;
  }, [locations]);

  async function onAdjustSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!canManageInventory(role)) {
      setSubmitError("You do not have permission to adjust inventory.");
      return;
    }

    const delta = Number(changeQty);
    if (!Number.isFinite(delta) || delta === 0) {
      return alert("Change quantity must be a non-zero number.");
    }

    setSubmitting(true);
    const supabase = createSupabaseBrowser();

    const { error } = await supabase.from("inventory_transactions").insert({
      item_id: itemId,
      from_location_id: item?.location_id ?? null,
      to_location_id: toLocationId || null,
      change_qty: Math.trunc(delta),
      reason: reason || "adjustment",
      reference_type: referenceType.trim() || null,
      reference_id: referenceId.trim() || null,
      notes: notes.trim() || null,
    });

    if (error) {
      console.error("[inventory-detail] transaction insert error:", error);
      setSubmitError(error.message);
      setSubmitting(false);
      return;
    }

    setChangeQty("");
    setReason("adjustment");
    setToLocationId("");
    setReferenceType("");
    setReferenceId("");
    setNotes("");
    setSubmitting(false);

    await loadData();
  }

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", paddingBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>{item?.name ?? "Inventory Item"}</h1>
          <div style={{ marginTop: 6, opacity: 0.75 }}>
            Item ID: <strong>{itemId}</strong>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Link href="/inventory" style={secondaryButtonStyle}>
            ← Back to Inventory
          </Link>
          <Link
            href={`/inventory/transfers?itemId=${encodeURIComponent(itemId)}${
              item?.location_id ? `&fromLocationId=${encodeURIComponent(item.location_id)}` : ""
            }`}
            style={secondaryButtonStyle}
          >
            Quick Transfer
          </Link>
        </div>
      </div>

      {loading ? (
        <div style={{ marginTop: 14, opacity: 0.75 }}>Loading item...</div>
      ) : errorMessage ? (
        <div style={{ marginTop: 14, ...cardStyle(), color: "#ff9d9d" }}>{errorMessage}</div>
      ) : item ? (
        <>
          <div style={{ marginTop: 16, ...cardStyle() }}>
            <div style={{ fontWeight: 900, marginBottom: 12 }}>Details</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <Spec label="Name" value={item.name} />
              <Spec label="External ID" value={item.external_id ?? "-"} />
              <Spec label="Category" value={item.category ?? "-"} />
              <Spec label="Current Quantity" value={String(item.quantity)} />
              <Spec label="Minimum Quantity" value={String(item.minimum_quantity)} />
              <Spec label="Location" value={item.location_id ? locationNameById[item.location_id] ?? "-" : "-"} />
              <Spec label="Supplier" value={item.supplier ?? "-"} />
              <Spec label="Supplier Link" value={item.supplier_link ?? "-"} />
              <Spec label="Status" value={item.is_active ? "Active" : "Inactive"} />
              <Spec label="Updated" value={formatDateTime(item.updated_at)} />
            </div>

            {item.notes ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ opacity: 0.72, fontSize: 12 }}>Notes</div>
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.35 }}>{item.notes}</div>
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 16, ...cardStyle() }}>
            <div style={{ fontWeight: 900, marginBottom: 12 }}>Adjust Quantity</div>

            {!canManageInventory(role) ? (
              <div style={{ opacity: 0.8 }}>
                You do not have permission to adjust inventory. (owner/office_admin/mechanic only)
              </div>
            ) : (
              <form onSubmit={onAdjustSubmit}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <Field label="Change Qty * (positive or negative)">
                    <input value={changeQty} onChange={(e) => setChangeQty(e.target.value)} inputMode="numeric" style={inputStyle()} required />
                  </Field>

                  <Field label="Reason">
                    <select value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle()}>
                      <option value="adjustment">adjustment</option>
                      <option value="usage">usage</option>
                      <option value="restock">restock</option>
                      <option value="transfer">transfer</option>
                    </select>
                  </Field>

                  <Field label="To Location (optional)">
                    <select value={toLocationId} onChange={(e) => setToLocationId(e.target.value)} style={inputStyle()}>
                      <option value="">None</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Reference Type (optional)">
                    <input value={referenceType} onChange={(e) => setReferenceType(e.target.value)} style={inputStyle()} />
                  </Field>

                  <Field label="Reference ID (optional)">
                    <input value={referenceId} onChange={(e) => setReferenceId(e.target.value)} style={inputStyle()} />
                  </Field>
                </div>

                <div style={{ marginTop: 12 }}>
                  <Field label="Notes (optional)">
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle(), resize: "vertical" }} />
                  </Field>
                </div>

                {submitError ? (
                  <div style={{ marginTop: 10, color: "#ff9d9d", opacity: 0.95 }}>{submitError}</div>
                ) : null}

                <div style={{ marginTop: 12 }}>
                  <button type="submit" disabled={submitting} style={buttonStyle}>
                    {submitting ? "Saving..." : "Apply Adjustment"}
                  </button>
                </div>
              </form>
            )}
          </div>

          <div style={{ marginTop: 16, ...cardStyle() }}>
            <div style={{ fontWeight: 900, marginBottom: 12 }}>Transaction History</div>

            {transactions.length === 0 ? (
              <div style={{ opacity: 0.75 }}>No transactions yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    style={{
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 12,
                      padding: 10,
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 800 }}>
                        {tx.change_qty > 0 ? "+" : ""}
                        {tx.change_qty} • {tx.reason ?? "-"}
                      </div>
                      <div style={{ opacity: 0.72, fontSize: 12 }}>{formatDateTime(tx.created_at)}</div>
                    </div>

                    <div style={{ marginTop: 6, opacity: 0.82, fontSize: 13 }}>
                      From: {tx.from_location_id ? locationNameById[tx.from_location_id] ?? tx.from_location_id : "-"}
                      {"  →  "}
                      To: {tx.to_location_id ? locationNameById[tx.to_location_id] ?? tx.to_location_id : "-"}
                    </div>

                    {(tx.reference_type || tx.reference_id) ? (
                      <div style={{ marginTop: 4, opacity: 0.78, fontSize: 12 }}>
                        Ref: {tx.reference_type ?? "-"} / {tx.reference_id ?? "-"}
                      </div>
                    ) : null}

                    {tx.notes ? (
                      <div style={{ marginTop: 6, opacity: 0.78, lineHeight: 1.35 }}>{tx.notes}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
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

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ opacity: 0.72, fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 900, wordBreak: "break-word" }}>{value}</div>
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
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "transparent",
  color: "inherit",
  fontWeight: 800,
  opacity: 0.9,
  textDecoration: "none",
};
