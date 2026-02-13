"use client";

import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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

type MaintenanceLogRecord = {
  id: string;
  vehicleId: string;

  createdAt: string; // ISO
  serviceDate: string; // yyyy-mm-dd

  mileage: number;
  title: string;
  status: MaintenanceLogStatus;
  notes: string;

  // link to request (when created from request)
  requestId?: string;
  origin?: "manual" | "from_request";

  // receipt photos
  receiptPhotos?: Attachment[];

  // optional: costs/vendor
  laborCost?: number;
  partsCost?: number;
  totalCost?: number;
  vendorName?: string;
  invoiceNumber?: string;

  // optional: preventative
  nextDueMileage?: number;
  intervalMiles?: number;
  nextDueDate?: string;
  intervalDays?: number;
  resetOilLife?: boolean;

  closedAt?: string; // ISO when log is closed
};

/* =========================
   Keys
========================= */

function vehicleMileageKey(vehicleId: string) {
  return `vehicle:${vehicleId}:mileage`;
}
function maintenanceLogKey(vehicleId: string) {
  return `vehicle:${vehicleId}:maintenance_log`;
}
function maintenanceRequestKey(vehicleId: string) {
  return `vehicle:${vehicleId}:maintenance_request`;
}

const REQUESTS_INDEX_KEY = "maintenance:requests:index";

/* =========================
   Index type
========================= */
type MaintenanceRequestIndexItem = {
  id: string;
  vehicleId: string;
  createdAt: string;
  requestDate: string;
  status: RequestStatus;
  urgency: Urgency;
  systemAffected: SystemAffected;
  drivabilityStatus: DrivabilityStatus;
  title: string;
  employee?: string;
  maintenanceLogId?: string;
};

function safeJSON<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function upsertRequestIndex(item: Partial<MaintenanceRequestIndexItem> & { id: string }) {
  const existing = safeJSON<MaintenanceRequestIndexItem[]>(
    localStorage.getItem(REQUESTS_INDEX_KEY),
    []
  );

  const idx = existing.findIndex((x) => x.id === item.id);
  if (idx >= 0) {
    existing[idx] = { ...existing[idx], ...item } as MaintenanceRequestIndexItem;
  } else {
    // If missing, we can’t fully reconstruct; best effort:
    existing.unshift(item as MaintenanceRequestIndexItem);
  }
  localStorage.setItem(REQUESTS_INDEX_KEY, JSON.stringify(existing));
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

  const [linkedRequest, setLinkedRequest] = useState<MaintenanceRequestRecord | null>(null);
  const [currentVehicleMileage, setCurrentVehicleMileage] = useState<number | null>(null);

  // load current vehicle mileage + request (if requestId present)
  useEffect(() => {
    if (!vehicleId) return;
    if (typeof window === "undefined") return;

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
            `Employee: ${req.employee}`,
            `Urgency: ${req.urgency}`,
            `System: ${req.systemAffected}`,
            `Drivability: ${req.drivabilityStatus}`,
            "",
            "Issue Description:",
            req.description,
          ].join("\n")
    );
  }, [vehicleId, requestId, router]);

  const totalCost = useMemo(() => {
    const l = Number(laborCost);
    const p = Number(partsCost);
    const lf = Number.isFinite(l) ? l : 0;
    const pf = Number.isFinite(p) ? p : 0;
    if (!laborCost.trim() && !partsCost.trim()) return "";
    return String(lf + pf);
  }, [laborCost, partsCost]);

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

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();

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

    const nowIso = new Date().toISOString();
    const logId = crypto.randomUUID();

    const record: MaintenanceLogRecord = {
      id: logId,
      vehicleId,
      createdAt: nowIso,
      serviceDate,
      mileage: m,
      title: title.trim(),
      status,
      notes: notes.trim(),
      requestId: requestId || undefined,
      origin: requestId ? "from_request" : "manual",
      receiptPhotos: receiptPhotos.length ? receiptPhotos : undefined,

      vendorName: vendorName.trim() ? vendorName.trim() : undefined,
      invoiceNumber: invoiceNumber.trim() ? invoiceNumber.trim() : undefined,
      laborCost: Number.isFinite(l) ? l : undefined,
      partsCost: Number.isFinite(p) ? p : undefined,
      totalCost: totalCost.trim() ? Number(totalCost) : undefined,

      nextDueMileage: nextDueMileage.trim() ? Number(nextDueMileage) : undefined,
      resetOilLife: resetOilLife || undefined,

      closedAt: status === "Closed" ? nowIso : undefined,
    };

    // write log record per vehicle
    const existingLogs = safeJSON<MaintenanceLogRecord[]>(
      localStorage.getItem(maintenanceLogKey(vehicleId)),
      []
    );
    existingLogs.unshift(record);
    localStorage.setItem(maintenanceLogKey(vehicleId), JSON.stringify(existingLogs));

    // update vehicle mileage (only forward)
    localStorage.setItem(vehicleMileageKey(vehicleId), String(m));

    // If linked to request:
    if (requestId) {
      const reqKey = maintenanceRequestKey(vehicleId);
      const requests = safeJSON<MaintenanceRequestRecord[]>(
        localStorage.getItem(reqKey),
        []
      );
      const idx = requests.findIndex((r) => r.id === requestId);

      if (idx >= 0) {
        const req = requests[idx];

        // enforce one request → one log
        if (req.maintenanceLogId) {
          alert("This request already has a maintenance log. Not creating a duplicate link.");
        } else {
          const nextStatus: RequestStatus =
            status === "Closed" ? "Closed" : "In Progress";

          requests[idx] = {
            ...req,
            status: nextStatus,
            maintenanceLogId: logId,
            closedAt: status === "Closed" ? nowIso : req.closedAt,
          };
          localStorage.setItem(reqKey, JSON.stringify(requests));

          // update global index too
          upsertRequestIndex({
            id: requestId,
            status: nextStatus,
            maintenanceLogId: logId,
          });
        }
      }
    }

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

