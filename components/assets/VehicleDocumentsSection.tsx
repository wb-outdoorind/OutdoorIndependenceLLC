"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type VehicleDocumentType = "registration" | "insurance";

type VehicleDocumentRow = {
  id: string;
  vehicle_id: string;
  doc_type: VehicleDocumentType;
  file_name: string;
  created_at: string;
  updated_at: string;
};

const DOC_LABELS: Record<VehicleDocumentType, string> = {
  registration: "Vehicle Registration",
  insurance: "Insurance Card",
};

function fileButtonStyle(): React.CSSProperties {
  return {
    textDecoration: "none",
    color: "inherit",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 12,
    padding: "8px 10px",
    background: "rgba(255,255,255,0.04)",
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  };
}

function ensurePdf(file: File) {
  const name = file.name.toLowerCase();
  const mime = (file.type || "").toLowerCase();
  const mimeLooksPdf = !mime || mime === "application/pdf" || mime.includes("pdf");
  return name.endsWith(".pdf") && mimeLooksPdf;
}

export default function VehicleDocumentsSection({
  vehicleId,
  canManage,
}: {
  vehicleId: string;
  canManage: boolean;
}) {
  const [docs, setDocs] = useState<VehicleDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingType, setUploadingType] = useState<VehicleDocumentType | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const registrationInputRef = useRef<HTMLInputElement | null>(null);
  const insuranceInputRef = useRef<HTMLInputElement | null>(null);

  const loadDocs = useCallback(async () => {
    if (!vehicleId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/vehicle-documents?vehicleId=${encodeURIComponent(vehicleId)}`, {
      method: "GET",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      items?: VehicleDocumentRow[];
    };
    if (!res.ok) {
      setError(json.error || "Failed to load vehicle documents.");
      setDocs([]);
      setLoading(false);
      return;
    }
    setDocs(Array.isArray(json.items) ? json.items : []);
    setLoading(false);
  }, [vehicleId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDocs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDocs]);

  const docsByType = useMemo(() => {
    const index: Partial<Record<VehicleDocumentType, VehicleDocumentRow>> = {};
    for (const row of docs) {
      if (!index[row.doc_type]) index[row.doc_type] = row;
    }
    return index;
  }, [docs]);

  async function onUpload(docType: VehicleDocumentType, file: File | null) {
    setMessage(null);
    if (!file) return;

    if (!ensurePdf(file)) {
      setMessage("Only PDF files are allowed for registration and insurance documents.");
      return;
    }

    setUploadingType(docType);
    const form = new FormData();
    form.append("vehicleId", vehicleId);
    form.append("docType", docType);
    form.append("file", file);

    const res = await fetch("/api/vehicle-documents", {
      method: "POST",
      body: form,
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setUploadingType(null);

    if (!res.ok) {
      setMessage(json.error || "Upload failed.");
      return;
    }

    setMessage(`${DOC_LABELS[docType]} PDF saved.`);
    await loadDocs();
  }

  return (
    <div>
      <div style={{ opacity: 0.74, marginBottom: 12, fontSize: 13 }}>
        Upload and view required vehicle PDFs only: registration and insurance card.
      </div>

      {loading ? <div style={{ opacity: 0.75, marginBottom: 10 }}>Loading documents...</div> : null}
      {error ? <div style={{ color: "#ff9d9d", marginBottom: 10 }}>{error}</div> : null}
      {message ? <div style={{ opacity: 0.86, marginBottom: 10 }}>{message}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, marginBottom: 12 }}>
        {(["registration", "insurance"] as VehicleDocumentType[]).map((docType) => {
          const row = docsByType[docType] ?? null;
          const isBusy = uploadingType === docType;
          const fileInputRef = docType === "registration" ? registrationInputRef : insuranceInputRef;

          return (
            <div
              key={docType}
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                padding: 10,
                background: "rgba(255,255,255,0.02)",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 800 }}>{DOC_LABELS[docType]}</div>
              {row ? (
                <div style={{ fontSize: 12, opacity: 0.78 }}>
                  {row.file_name} • Updated {new Date(row.updated_at).toLocaleString()}
                </div>
              ) : (
                <div style={{ fontSize: 12, opacity: 0.74 }}>No file uploaded.</div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {row ? (
                  <a href={`/api/vehicle-documents/view?id=${encodeURIComponent(row.id)}`} target="_blank" rel="noreferrer" style={fileButtonStyle()}>
                    View PDF
                  </a>
                ) : null}

                {canManage ? (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const selected = e.target.files?.[0] ?? null;
                        void onUpload(docType, selected);
                        e.currentTarget.value = "";
                      }}
                    />
                    <button
                      type="button"
                      style={fileButtonStyle()}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isBusy}
                    >
                      {isBusy ? "Uploading..." : row ? "Replace PDF" : "Upload PDF"}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
