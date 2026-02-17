"use client";

import Image from "next/image";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { writeAudit } from "@/lib/audit";

type MaintenanceLogStatus = "Closed" | "In Progress";
type Role = "owner" | "office_admin" | "mechanic" | "employee";

type EquipmentRequestOption = {
  id: string;
  created_at: string;
  status: string | null;
  description: string | null;
};

type Attachment = {
  id: string;
  createdAt: string;
  name: string;
  mime: string;
  dataUrl: string;
  kind?: "receipt" | "issue" | "other";
};

type InventoryItem = {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
};

type PartUsed = {
  item_id: string;
  name: string;
  quantity_used: number;
};

function canManagePartsUsage(role: Role | null) {
  return role === "owner" || role === "office_admin" || role === "mechanic";
}

function equipmentHoursKey(equipmentId: string) {
  return `equipment:${equipmentId}:hours`;
}

function todayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseTitle(description: string | null) {
  if (!description) return "Request";
  const firstLine = description.split("\n")[0]?.trim() ?? "";
  if (firstLine.startsWith("Title:")) {
    const parsed = firstLine.slice("Title:".length).trim();
    if (parsed) return parsed;
  }
  return "Request";
}

export default function EquipmentMaintenanceLogPage() {
  const router = useRouter();
  const params = useParams<{ equipmentID?: string }>();
  const sp = useSearchParams();

  const equipmentId = params?.equipmentID ? decodeURIComponent(params.equipmentID) : "";
  const queryRequestId = sp?.get("requestId") ? decodeURIComponent(sp.get("requestId")!) : "";
  const initialStoredHours = (() => {
    if (typeof window === "undefined" || !equipmentId) return null;
    const saved = localStorage.getItem(equipmentHoursKey(equipmentId));
    const h = saved ? Number(saved) : NaN;
    return Number.isFinite(h) && h >= 0 ? h : null;
  })();

  const [title, setTitle] = useState("");
  const [hours, setHours] = useState(() =>
    initialStoredHours != null ? String(initialStoredHours) : ""
  );
  const [status, setStatus] = useState<MaintenanceLogStatus>("Closed");
  const [notes, setNotes] = useState("");
  const [serviceDate, setServiceDate] = useState(todayYYYYMMDD());

  const [receiptPhotos, setReceiptPhotos] = useState<Attachment[]>([]);
  const [vendorName, setVendorName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [laborCost, setLaborCost] = useState("");
  const [partsCost, setPartsCost] = useState("");
  const [nextDueHours, setNextDueHours] = useState("");

  const [requestOptions, setRequestOptions] = useState<EquipmentRequestOption[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [partSearch, setPartSearch] = useState("");
  const [selectedPartId, setSelectedPartId] = useState("");
  const [selectedPartQty, setSelectedPartQty] = useState("1");
  const [partsUsed, setPartsUsed] = useState<PartUsed[]>([]);
  const [currentHours] = useState<number | null>(initialStoredHours);
  const canSubmitPartsUsage = canManagePartsUsage(userRole);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        const supabase = createSupabaseBrowser();
        const { data: authData } = await supabase.auth.getUser();
        if (!authData.user) {
          setUserRole("employee");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", authData.user.id)
          .maybeSingle();
        setUserRole((profile?.role as Role | undefined) ?? "employee");
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!equipmentId) return;
    let alive = true;

    async function loadRequests() {
      const supabase = createSupabaseBrowser();
      setLoadError(null);

      const { data, error } = await supabase
        .from("equipment_maintenance_requests")
        .select("id,created_at,status,description")
        .eq("equipment_id", equipmentId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (!alive) return;
      if (error || !data) {
        if (error) console.error("[equipment-maintenance-log] request list load error:", error);
        setLoadError(error?.message || "Failed to load request list.");
        setRequestOptions([]);
        return;
      }

      const options = data as EquipmentRequestOption[];
      setRequestOptions(options);

      const linked = queryRequestId && options.some((r) => r.id === queryRequestId) ? queryRequestId : "";
      setSelectedRequestId(linked);
      if (linked) {
        const req = options.find((r) => r.id === linked);
        if (req) {
          setTitle((prev) => (prev.trim() ? prev : parseTitle(req.description)));
        }
      }
    }

    loadRequests();

    return () => {
      alive = false;
    };
  }, [equipmentId, queryRequestId]);

  const totalCost = useMemo(() => {
    const l = Number(laborCost);
    const p = Number(partsCost);
    const lf = Number.isFinite(l) ? l : 0;
    const pf = Number.isFinite(p) ? p : 0;
    if (!laborCost.trim() && !partsCost.trim()) return "";
    return String(lf + pf);
  }, [laborCost, partsCost]);

  useEffect(() => {
    if (!canSubmitPartsUsage) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        setInventoryLoading(true);
        setInventoryError(null);
        const supabase = createSupabaseBrowser();
        const { data, error } = await supabase
          .from("inventory_items")
          .select("id,name,category,quantity")
          .eq("is_active", true)
          .order("name", { ascending: true });
        if (error) {
          console.error("[equipment-maintenance-log] inventory load error:", error);
          setInventoryError(error.message);
          setInventoryItems([]);
          setInventoryLoading(false);
          return;
        }
        setInventoryItems((data ?? []) as InventoryItem[]);
        setInventoryLoading(false);
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [canSubmitPartsUsage]);

  const filteredInventoryItems = useMemo(() => {
    const q = partSearch.trim().toLowerCase();
    const usedIds = new Set(partsUsed.map((p) => p.item_id));
    const available = inventoryItems.filter((item) => !usedIds.has(item.id));
    if (!q) return available;
    return available.filter((item) =>
      [item.id, item.name, item.category ?? ""].join(" ").toLowerCase().includes(q)
    );
  }, [inventoryItems, partSearch, partsUsed]);

  function addPartUsed() {
    if (!selectedPartId) return;
    const qty = Math.trunc(Number(selectedPartQty));
    if (!Number.isFinite(qty) || qty <= 0) {
      alert("Enter a valid Qty Used.");
      return;
    }
    const selected = inventoryItems.find((item) => item.id === selectedPartId);
    if (!selected) return;
    setPartsUsed((prev) => [
      ...prev,
      { item_id: selected.id, name: selected.name, quantity_used: qty },
    ]);
    setSelectedPartId("");
    setSelectedPartQty("1");
  }

  function removePartUsed(itemId: string) {
    setPartsUsed((prev) => prev.filter((p) => p.item_id !== itemId));
  }

  async function onPickReceiptPhoto(file: File) {
    if (file.size > 2_000_000) {
      alert("That photo is large (>2MB). Please retake at a lower resolution or crop it.");
      return;
    }

    const dataUrl = await fileToDataUrl(file);
    const att: Attachment = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      name: file.name || "receipt.jpg",
      mime: file.type || "image/jpeg",
      dataUrl,
      kind: "receipt",
    };

    setReceiptPhotos((prev) => [att, ...prev].slice(0, 3));
  }

  function removeReceiptPhoto(id: string) {
    setReceiptPhotos((prev) => prev.filter((p) => p.id !== id));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!equipmentId) return alert("Missing equipment ID in the URL.");

    const h = Number(hours);
    if (!title.trim()) return alert("Please enter a title (what was done).");
    if (!Number.isFinite(h) || h < 0) return alert("Please enter valid hours.");

    if (currentHours != null && h < currentHours) {
      return alert(`Hours cannot be less than the current stored hours (${currentHours}).`);
    }

    const l = Number(laborCost);
    const p = Number(partsCost);

    const supabase = createSupabaseBrowser();
    const { data: insertedLog, error } = await supabase
      .from("equipment_maintenance_logs")
      .insert({
        equipment_id: equipmentId,
        request_id: selectedRequestId || null,
        hours: h,
        notes: notes.trim()
          ? notes.trim()
          : [
              `Title: ${title.trim()}`,
              serviceDate ? `Service Date: ${serviceDate}` : "",
              vendorName.trim() ? `Vendor: ${vendorName.trim()}` : "",
              invoiceNumber.trim() ? `Invoice: ${invoiceNumber.trim()}` : "",
              Number.isFinite(l) ? `Labor Cost: ${l}` : "",
              Number.isFinite(p) ? `Parts Cost: ${p}` : "",
              totalCost.trim() ? `Total Cost: ${totalCost}` : "",
              nextDueHours.trim() ? `Next Due Hours: ${nextDueHours.trim()}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
        status_update: status,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Equipment maintenance log insert failed:", error);
      setSubmitError(error.message);
      return;
    }

    if (partsUsed.length > 0) {
      if (!canSubmitPartsUsage) {
        setSubmitError("You do not have permission to submit parts usage.");
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) {
        console.error("Failed to resolve auth user for inventory usage logs:", authError);
        setSubmitError("Maintenance log saved, but failed to apply parts usage (missing auth user).");
        return;
      }

      const txPayload = partsUsed.map((part) => ({
        item_id: part.item_id,
        change_qty: -Math.abs(part.quantity_used),
        reason: "usage",
        reference_type: "maintenance_log",
        reference_id: insertedLog.id,
        notes: null,
        created_by: authData.user.id,
      }));

      const { error: txError } = await supabase.from("inventory_transactions").insert(txPayload);
      if (txError) {
        console.error("Inventory usage insert failed:", txError);
        if (
          txError.message.toLowerCase().includes("below 0") ||
          txError.message.toLowerCase().includes("cannot go below")
        ) {
          setSubmitError(
            "Not enough inventory quantity for one or more selected parts. Reduce Qty Used and try again."
          );
          return;
        }
        setSubmitError(
          `Maintenance log saved, but failed to record parts used: ${txError.message}`
        );
        return;
      }

      await writeAudit({
        action: "inventory_usage",
        table_name: "inventory_transactions",
        meta: {
          maintenance_log_id: insertedLog.id,
          items: partsUsed.map((part) => ({
            item_id: part.item_id,
            qty: part.quantity_used,
          })),
        },
      });
    }

    localStorage.setItem(equipmentHoursKey(equipmentId), String(h));
    router.push(`/equipment/${encodeURIComponent(equipmentId)}`);
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>Equipment Maintenance Log</h1>
      <div style={{ opacity: 0.75, lineHeight: 1.4 }}>
        Equipment ID: <strong>{equipmentId || "(missing)"}</strong>
      </div>

      {loadError ? (
        <div style={{ marginTop: 12, ...cardStyle, opacity: 0.95, color: "#ff9d9d" }}>
          Failed to load request links: {loadError}
        </div>
      ) : null}

      {submitError ? (
        <div style={{ marginTop: 12, ...cardStyle, opacity: 0.95, color: "#ff9d9d" }}>
          Failed to save maintenance log: {submitError}
        </div>
      ) : null}

      <form onSubmit={onSubmit} style={{ marginTop: 16 }}>
        <div style={cardStyle}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Service</div>

          <div style={gridStyle}>
            <Field label="Service Date *">
              <input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} style={inputStyle} />
            </Field>

            <Field label="Hours *">
              <input value={hours} onChange={(e) => setHours(e.target.value)} inputMode="numeric" placeholder="e.g. 1530" style={inputStyle} required />
              {currentHours != null ? (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                  Current stored hours: <strong>{currentHours}</strong>
                </div>
              ) : null}
            </Field>

            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value as MaintenanceLogStatus)} style={inputStyle}>
                <option value="Closed">Closed</option>
                <option value="In Progress">In Progress</option>
              </select>
            </Field>

            <Field label="Linked Request (optional)">
              <select value={selectedRequestId} onChange={(e) => setSelectedRequestId(e.target.value)} style={inputStyle}>
                <option value="">None</option>
                {requestOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {parseTitle(r.description)} • {new Date(r.created_at).toLocaleDateString()} • {r.status ?? "Open"}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Next Due Hours (optional)">
              <input value={nextDueHours} onChange={(e) => setNextDueHours(e.target.value)} inputMode="numeric" placeholder="e.g. 1800" style={inputStyle} />
            </Field>

            <Field label="Title (required)">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Replaced hydraulic hose" style={inputStyle} required />
            </Field>
          </div>

          <div style={{ marginTop: 12 }}>
            <Field label="Notes">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={7} placeholder="Parts used, labor, details, etc." style={{ ...inputStyle, resize: "vertical" }} />
            </Field>
          </div>
        </div>

        <div style={{ marginTop: 16, ...cardStyle }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Costs (optional)</div>

          <div style={gridStyle}>
            <Field label="Vendor / Shop (optional)">
              <input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="e.g. ABC Heavy Repair" style={inputStyle} />
            </Field>

            <Field label="Invoice # (optional)">
              <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="e.g. INV-10492" style={inputStyle} />
            </Field>

            <Field label="Labor Cost (optional)">
              <input value={laborCost} onChange={(e) => setLaborCost(e.target.value)} inputMode="decimal" placeholder="e.g. 220" style={inputStyle} />
            </Field>

            <Field label="Parts Cost (optional)">
              <input value={partsCost} onChange={(e) => setPartsCost(e.target.value)} inputMode="decimal" placeholder="e.g. 80" style={inputStyle} />
            </Field>

            <Field label="Total Cost">
              <input value={totalCost} readOnly style={{ ...inputStyle, opacity: 0.85 }} />
            </Field>
          </div>
        </div>

        <div style={{ marginTop: 16, ...cardStyle }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Parts Used</div>
          {!canSubmitPartsUsage ? (
            <div style={{ opacity: 0.75, marginBottom: 10 }}>
              Parts usage entry is limited to owner, office_admin, or mechanic.
            </div>
          ) : null}

          <div style={gridStyle}>
            <Field label="Search Inventory">
              <input
                value={partSearch}
                onChange={(e) => setPartSearch(e.target.value)}
                placeholder="Search by item name/category"
                style={inputStyle}
                disabled={!canSubmitPartsUsage}
              />
            </Field>

            <Field label="Part">
              <select
                value={selectedPartId}
                onChange={(e) => setSelectedPartId(e.target.value)}
                style={inputStyle}
                disabled={!canSubmitPartsUsage || inventoryLoading || filteredInventoryItems.length === 0}
              >
                <option value="">
                  {inventoryLoading
                    ? "Loading parts..."
                    : filteredInventoryItems.length
                    ? "Select a part"
                    : "No matching parts"}
                </option>
                {filteredInventoryItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.quantity} in stock)
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Qty Used">
              <input
                value={selectedPartQty}
                onChange={(e) => setSelectedPartQty(e.target.value)}
                inputMode="numeric"
                placeholder="1"
                style={inputStyle}
                disabled={!canSubmitPartsUsage}
              />
            </Field>
          </div>

          <div style={{ marginTop: 12 }}>
            <button type="button" onClick={addPartUsed} style={secondaryButtonStyle} disabled={!canSubmitPartsUsage}>
              Add Part
            </button>
          </div>

          {inventoryError ? (
            <div style={{ marginTop: 10, color: "#ff9d9d" }}>
              Failed to load inventory items: {inventoryError}
            </div>
          ) : null}

          {partsUsed.length > 0 ? (
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {partsUsed.map((part) => (
                <div
                  key={part.item_id}
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    padding: 10,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800 }}>{part.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Qty Used: {part.quantity_used}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removePartUsed(part.item_id)}
                    style={secondaryButtonStyle}
                    disabled={!canSubmitPartsUsage}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 10, opacity: 0.7 }}>No parts added.</div>
          )}
        </div>

        <div style={{ marginTop: 16, ...cardStyle }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Receipts / Photos (optional)</div>
          <div style={{ opacity: 0.72, fontSize: 13, marginBottom: 10 }}>
            Attach receipt photos for reference only (stored in form state).
          </div>

          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              onPickReceiptPhoto(f);
              e.currentTarget.value = "";
            }}
          />

          {receiptPhotos.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginTop: 12 }}>
              {receiptPhotos.map((p) => (
                <div key={p.id} style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 8, background: "rgba(255,255,255,0.02)" }}>
                  <Image
                    src={p.dataUrl}
                    alt={p.name}
                    width={280}
                    height={210}
                    unoptimized
                    style={{ width: "100%", borderRadius: 8, display: "block", aspectRatio: "4 / 3", objectFit: "cover" }}
                  />
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>{p.name}</div>
                  <button type="button" onClick={() => removeReceiptPhoto(p.id)} style={{ marginTop: 6, ...tinyButtonStyle }}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" style={buttonStyle}>
            Save Maintenance Log
          </button>

          <button type="button" onClick={() => router.push(`/equipment/${encodeURIComponent(equipmentId)}`)} style={secondaryButtonStyle}>
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

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("Failed to read file"));
    r.readAsDataURL(file);
  });
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
  cursor: "pointer",
  opacity: 0.9,
};

const tinyButtonStyle: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  fontSize: 12,
  cursor: "pointer",
};
