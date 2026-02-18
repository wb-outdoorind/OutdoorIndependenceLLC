"use client";

import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { writeAudit } from "@/lib/audit";

/* =========================
   Types (aligned with request)
========================= */

type RequestStatus = "Open" | "In Progress" | "Closed";
type Urgency = "Low" | "Medium" | "High" | "Urgent";
type DrivabilityStatus =
  | "Yes – Drivable"
  | "Limited – Operate with caution"
  | "No – Out of Service";
type SystemAffected =
  | "Engine"
  | "Electrical"
  | "Hydraulics"
  | "Tires / Wheels"
  | "Brakes"
  | "Steering"
  | "Body / Frame"
  | "Attachment / Implement"
  | "Other";

type Attachment = {
  id: string;
  createdAt: string; // ISO
  name: string;
  mime: string;
  dataUrl: string; // NOTE: localStorage size limit; keep #/size small
  kind?: "receipt" | "issue" | "other";
};

type MaintenanceRequestRecord = {
  id: string;
  vehicleId: string;

  createdAt: string; // ISO
  requestDate: string; // yyyy-mm-dd

  employee: string;

  drivabilityStatus: DrivabilityStatus;
  systemAffected: SystemAffected;
  urgency: Urgency;

  title: string;
  description: string;

  status: RequestStatus;

  // new fields we’ll start using
  maintenanceLogId?: string;
  closedAt?: string;

  // optional future: photos?: Attachment[]
};

type MaintenanceLogStatus = "Closed" | "In Progress";
type Role = "owner" | "office_admin" | "mechanic" | "employee";

type InventoryItem = {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  location_id: string | null;
};

type InventoryLocation = {
  id: string;
  name: string;
};

type PartUsed = {
  item_id: string;
  name: string;
  quantity_used: number;
  from_location_id: string | null;
};

function canManagePartsUsage(role: Role | null) {
  return role === "owner" || role === "office_admin" || role === "mechanic";
}

/* =========================
   Keys
========================= */

function vehicleMileageKey(vehicleId: string) {
  return `vehicle:${vehicleId}:mileage`;
}
function maintenanceRequestKey(vehicleId: string) {
  return `vehicle:${vehicleId}:maintenance_request`;
}

function safeJSON<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function todayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* =========================
   Page
========================= */

export default function MaintenanceLogPage() {
  const router = useRouter();
  const params = useParams<{ vehicleID?: string }>();
  const sp = useSearchParams();

  const vehicleId = params?.vehicleID ? decodeURIComponent(params.vehicleID) : "";
  const requestId = sp?.get("requestId") ? decodeURIComponent(sp.get("requestId")!) : "";

  const [title, setTitle] = useState("");
  const [mileage, setMileage] = useState("");
  const [status, setStatus] = useState<MaintenanceLogStatus>("Closed");
  const [notes, setNotes] = useState("");
  const [serviceDate, setServiceDate] = useState(todayYYYYMMDD());

  const [receiptPhotos, setReceiptPhotos] = useState<Attachment[]>([]);

  // optional fields (keep simple defaults)
  const [vendorName, setVendorName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [laborCost, setLaborCost] = useState("");
  const [partsCost, setPartsCost] = useState("");

  // preventative
  const [nextDueMileage, setNextDueMileage] = useState("");
  const [resetOilLife, setResetOilLife] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryLocations, setInventoryLocations] = useState<InventoryLocation[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [partSearch, setPartSearch] = useState("");
  const [selectedPartId, setSelectedPartId] = useState("");
  const [selectedPartQty, setSelectedPartQty] = useState("1");
  const [partsUsed, setPartsUsed] = useState<PartUsed[]>([]);
  const [userRole, setUserRole] = useState<Role | null>(null);

  const [linkedRequest, setLinkedRequest] = useState<MaintenanceRequestRecord | null>(null);
  const [currentVehicleMileage, setCurrentVehicleMileage] = useState<number | null>(null);
  const canSubmitPartsUsage = canManagePartsUsage(userRole);

  // load current vehicle mileage + request (if requestId present)
  useEffect(() => {
    if (!vehicleId) return;
    if (typeof window === "undefined") return;

    const timer = window.setTimeout(() => {
      // vehicle mileage
      const saved = localStorage.getItem(vehicleMileageKey(vehicleId));
      const m = saved ? Number(saved) : NaN;
      if (Number.isFinite(m) && m > 0) {
        setCurrentVehicleMileage(m);
        // If user hasn’t typed yet, prefill:
        setMileage((prev) => (prev.trim() ? prev : String(m)));
      }

      // request linking
      if (!requestId) return;

      const requests = safeJSON<MaintenanceRequestRecord[]>(
        localStorage.getItem(maintenanceRequestKey(vehicleId)),
        []
      );

      const req = requests.find((r) => r.id === requestId) ?? null;
      setLinkedRequest(req);

      if (!req) return;

      // Enforce 1 request → 1 log
      if (req.maintenanceLogId) {
        alert("This request already has a maintenance log. Opening the vehicle instead.");
        router.push(`/vehicles/${encodeURIComponent(vehicleId)}`);
        return;
      }

      // Autofill log form from request (only if user hasn’t typed yet)
      setTitle((prev) => (prev.trim() ? prev : req.title));
      setNotes((prev) =>
        prev.trim()
          ? prev
          : [
              `From Request (${req.id})`,
              `Teammate: ${req.employee}`,
              `Urgency: ${req.urgency}`,
              `System: ${req.systemAffected}`,
              `Drivability: ${req.drivabilityStatus}`,
              "",
              "Issue Description:",
              req.description,
            ].join("\n")
      );
    }, 0);

    return () => window.clearTimeout(timer);
  }, [vehicleId, requestId, router]);

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
    if (!canSubmitPartsUsage) return;

    const timer = window.setTimeout(() => {
      void (async () => {
        setInventoryLoading(true);
        setInventoryError(null);

        const supabase = createSupabaseBrowser();
        const [itemsRes, locationsRes] = await Promise.all([
          supabase
            .from("inventory_items")
            .select("id,name,category,quantity,location_id")
            .eq("is_active", true)
            .order("name", { ascending: true }),
          supabase.from("inventory_locations").select("id,name").order("name", { ascending: true }),
        ]);

        if (itemsRes.error || locationsRes.error) {
          console.error("[maintenance-log] failed to load inventory data:", {
            itemsError: itemsRes.error,
            locationsError: locationsRes.error,
          });
          setInventoryError(
            itemsRes.error?.message || locationsRes.error?.message || "Failed to load inventory."
          );
          setInventoryItems([]);
          setInventoryLocations([]);
          setInventoryLoading(false);
          return;
        }

        setInventoryItems((itemsRes.data ?? []) as InventoryItem[]);
        setInventoryLocations((locationsRes.data ?? []) as InventoryLocation[]);
        setInventoryLoading(false);
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [canSubmitPartsUsage]);

  const totalCost = useMemo(() => {
    const l = Number(laborCost);
    const p = Number(partsCost);
    const lf = Number.isFinite(l) ? l : 0;
    const pf = Number.isFinite(p) ? p : 0;
    if (!laborCost.trim() && !partsCost.trim()) return "";
    return String(lf + pf);
  }, [laborCost, partsCost]);

  const filteredInventoryItems = useMemo(() => {
    const q = partSearch.trim().toLowerCase();
    const usedIds = new Set(partsUsed.map((p) => p.item_id));
    const available = inventoryItems.filter((item) => !usedIds.has(item.id));
    if (!q) return available;
    return available.filter((item) =>
      [item.name, item.category ?? "", item.id].join(" ").toLowerCase().includes(q)
    );
  }, [inventoryItems, partSearch, partsUsed]);

  function addPartUsed() {
    if (!selectedPartId) return;
    const qty = Math.trunc(Number(selectedPartQty));
    if (!Number.isFinite(qty) || qty <= 0) {
      alert("Enter a valid quantity used.");
      return;
    }

    const selected = inventoryItems.find((item) => item.id === selectedPartId);
    if (!selected) return;
    if (qty > selected.quantity) {
      alert(`Qty Used (${qty}) cannot exceed available quantity (${selected.quantity}).`);
      return;
    }

    setPartsUsed((prev) => [
      ...prev,
      {
        item_id: selected.id,
        name: selected.name,
        quantity_used: qty,
        from_location_id: selected.location_id ?? null,
      },
    ]);
    setSelectedPartId("");
    setSelectedPartQty("1");
  }

  function removePartUsed(itemId: string) {
    setPartsUsed((prev) => prev.filter((p) => p.item_id !== itemId));
  }

  function updatePartFromLocation(itemId: string, fromLocationId: string) {
    setPartsUsed((prev) =>
      prev.map((part) =>
        part.item_id === itemId
          ? { ...part, from_location_id: fromLocationId || null }
          : part
      )
    );
  }

  async function onPickReceiptPhoto(file: File) {
    // Basic size guard: refuse very large images (localStorage risk)
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

    setReceiptPhotos((prev) => {
      const next = [att, ...prev];
      // limit to 3 receipts for localStorage safety
      return next.slice(0, 3);
    });
  }

  function removeReceiptPhoto(id: string) {
    setReceiptPhotos((prev) => prev.filter((p) => p.id !== id));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!vehicleId) return alert("Missing vehicle ID in the URL.");

    const m = Number(mileage);
    if (!title.trim()) return alert("Please enter a title (what was done).");
    if (!Number.isFinite(m) || m <= 0) return alert("Please enter a valid mileage.");

    // mileage rollback guard
    if (currentVehicleMileage != null && m < currentVehicleMileage) {
      return alert(
        `Mileage cannot be less than the current stored vehicle mileage (${currentVehicleMileage}).`
      );
    }

    const l = Number(laborCost);
    const p = Number(partsCost);

    const supabase = createSupabaseBrowser();
    const { data: insertedLog, error } = await supabase
      .from("maintenance_logs")
      .insert({
      vehicle_id: vehicleId,
      request_id: requestId || null,
      mileage: m,
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
            nextDueMileage.trim() ? `Next Due Mileage: ${nextDueMileage.trim()}` : "",
            resetOilLife ? "Reset Oil Life: Yes" : "",
          ]
            .filter(Boolean)
            .join("\n"),
      status_update: status,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Maintenance log insert failed:", error);
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

      for (const part of partsUsed) {
        const qty = Math.trunc(Number(part.quantity_used));
        if (!Number.isFinite(qty) || qty <= 0) {
          setSubmitError(`Invalid Qty Used for ${part.name}.`);
          return;
        }
        const matchedItem = inventoryItems.find((item) => item.id === part.item_id);
        if (matchedItem && qty > matchedItem.quantity) {
          setSubmitError(
            `Qty Used for ${part.name} exceeds available quantity (${matchedItem.quantity}).`
          );
          return;
        }
      }

      const txPayload = partsUsed.map((part) => ({
        item_id: part.item_id,
        from_location_id: part.from_location_id ?? null,
        to_location_id: null,
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

    // update vehicle mileage (only forward)
    localStorage.setItem(vehicleMileageKey(vehicleId), String(m));

    router.push(`/vehicles/${encodeURIComponent(vehicleId)}`);
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>Maintenance Log</h1>
      <div style={{ opacity: 0.75, lineHeight: 1.4 }}>
        Vehicle ID: <strong>{vehicleId || "(missing)"}</strong>
        {requestId ? (
          <>
            {" "}
            • Linked Request: <strong>{requestId}</strong>
          </>
        ) : null}
      </div>

      {requestId && !linkedRequest ? (
        <div style={{ marginTop: 12, ...cardStyle, opacity: 0.9 }}>
          Could not find the request in localStorage for this vehicle. You can still log manually.
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
              <input
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                style={inputStyle}
              />
            </Field>

            <Field label="Mileage *">
              <input
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 129450"
                style={inputStyle}
                required
              />
              {currentVehicleMileage != null ? (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                  Current stored mileage: <strong>{currentVehicleMileage}</strong>
                </div>
              ) : null}
            </Field>

            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as MaintenanceLogStatus)}
                style={inputStyle}
              >
                <option value="Closed">Closed</option>
                <option value="In Progress">In Progress</option>
              </select>
            </Field>

            <Field label="Reset Oil Life?">
              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={resetOilLife}
                  onChange={(e) => setResetOilLife(e.target.checked)}
                />
                <span style={{ opacity: 0.85 }}>Yes (only for oil service)</span>
              </label>
            </Field>

            <Field label="Next Due Mileage (optional)">
              <input
                value={nextDueMileage}
                onChange={(e) => setNextDueMileage(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 135000"
                style={inputStyle}
              />
            </Field>

            <Field label="Title (required)">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Replaced front brake pads"
                style={inputStyle}
                required
              />
            </Field>
          </div>

          <div style={{ marginTop: 12 }}>
            <Field label="Notes">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={7}
                placeholder="Parts used, labor, details, etc."
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </Field>
          </div>
        </div>

        <div style={{ marginTop: 16, ...cardStyle }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Costs (optional)</div>

          <div style={gridStyle}>
            <Field label="Vendor / Shop (optional)">
              <input
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder="e.g. ABC Truck Repair"
                style={inputStyle}
              />
            </Field>

            <Field label="Invoice # (optional)">
              <input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-10492"
                style={inputStyle}
              />
            </Field>

            <Field label="Labor Cost (optional)">
              <input
                value={laborCost}
                onChange={(e) => setLaborCost(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 220"
                style={inputStyle}
              />
            </Field>

            <Field label="Parts Cost (optional)">
              <input
                value={partsCost}
                onChange={(e) => setPartsCost(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 145.50"
                style={inputStyle}
              />
            </Field>

            <Field label="Total (auto)">
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
                placeholder="Search by part name/category"
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

            <Field label="Quantity Used">
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

          {partsUsed.length ? (
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
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 4 }}>
                        Pulled From Location
                      </div>
                      <select
                        value={part.from_location_id ?? ""}
                        onChange={(e) => updatePartFromLocation(part.item_id, e.target.value)}
                        style={{ ...inputStyle, maxWidth: 280 }}
                        disabled={!canSubmitPartsUsage}
                      >
                        <option value="">Not specified</option>
                        {inventoryLocations.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.name}
                          </option>
                        ))}
                      </select>
                    </div>
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
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Receipt Photos (optional)</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ ...buttonStyle, cursor: "pointer" }}>
              Take / Add Receipt Photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPickReceiptPhoto(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>

            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Limit: 3 photos • Keep them small for localStorage.
            </div>
          </div>

          {receiptPhotos.length ? (
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
              {receiptPhotos.map((p) => (
                <div key={p.id} style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 10 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.dataUrl}
                    alt={p.name}
                    style={{ width: "100%", borderRadius: 10, display: "block" }}
                  />
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8, wordBreak: "break-word" }}>
                    {p.name}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeReceiptPhoto(p.id)}
                    style={{ ...secondaryButtonStyle, marginTop: 8, width: "100%" }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 10, opacity: 0.7 }}>No receipt photos added.</div>
          )}
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" style={buttonStyle}>
            Save Maintenance Log
          </button>

          <button
            type="button"
            onClick={() => router.push(`/vehicles/${encodeURIComponent(vehicleId)}`)}
            style={secondaryButtonStyle}
          >
            Cancel
          </button>

          <a href="/maintenance" style={{ ...secondaryButtonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            Maintenance Center
          </a>
        </div>
      </form>
    </main>
  );
}

/* =========================
   Helpers
========================= */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

/* =========================
   Styles
========================= */

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 16,
  padding: 16,
  background: "rgba(255,255,255,0.03)",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
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
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "transparent",
  color: "inherit",
  fontWeight: 800,
  opacity: 0.9,
};
