"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type EquipmentDocumentType = "registration";

type EquipmentDocumentRow = {
  id: string;
  equipment_id: string;
  doc_type: EquipmentDocumentType;
  file_name: string;
  created_at: string;
  updated_at: string;
};

const DOC_LABELS: Record<EquipmentDocumentType, string> = {
  registration: "Equipment Registration",
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

export default function EquipmentDocumentsSection({
  equipmentId,
  canManage,
}: {
  equipmentId: string;
  canManage: boolean;
}) {
  const [docs, setDocs] = useState<EquipmentDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const registrationInputRef = useRef<HTMLInputElement | null>(null);

  const loadDocs = useCallback(async () => {
    if (!equipmentId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/equipment-documents?equipmentId=${encodeURIComponent(equipmentId)}`, {
      method: "GET",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      items?: EquipmentDocumentRow[];
    };
    if (!res.ok) {
      setError(json.error || "Failed to load equipment documents.");
      setDocs([]);
      setLoading(false);
      return;
    }
    setDocs(Array.isArray(json.items) ? json.items : []);
    setLoading(false);
  }, [equipmentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDocs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDocs]);

  const registrationDoc = useMemo(
    () => docs.find((row) => row.doc_type === "registration") ?? null,
    [docs],
  );

  async function onUpload(file: File | null) {
    setMessage(null);
    if (!file) return;
    if (!ensurePdf(file)) {
      setMessage("Only PDF files are allowed for equipment registration.");
      return;
    }

    setIsUploading(true);
    const form = new FormData();
    form.append("equipmentId", equipmentId);
    form.append("docType", "registration");
    form.append("file", file);

    const res = await fetch("/api/equipment-documents", {
      method: "POST",
      body: form,
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setIsUploading(false);

    if (!res.ok) {
      setMessage(json.error || "Upload failed.");
      return;
    }
    setMessage("Equipment registration PDF saved.");
    await loadDocs();
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ opacity: 0.74, marginBottom: 12, fontSize: 13 }}>
        Upload and view equipment registration PDF.
      </div>

      {loading ? <div style={{ opacity: 0.75, marginBottom: 10 }}>Loading document...</div> : null}
      {error ? <div style={{ color: "#ff9d9d", marginBottom: 10 }}>{error}</div> : null}
      {message ? <div style={{ opacity: 0.86, marginBottom: 10 }}>{message}</div> : null}

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 10,
          background: "rgba(255,255,255,0.02)",
          display: "grid",
          gap: 8,
          maxWidth: 480,
        }}
      >
        <div style={{ fontWeight: 800 }}>{DOC_LABELS.registration}</div>
        {registrationDoc ? (
          <div style={{ fontSize: 12, opacity: 0.78 }}>
            {registrationDoc.file_name} • Updated {new Date(registrationDoc.updated_at).toLocaleString()}
          </div>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.74 }}>No file uploaded.</div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {registrationDoc ? (
            <a
              href={`/api/equipment-documents/view?id=${encodeURIComponent(registrationDoc.id)}`}
              target="_blank"
              rel="noreferrer"
              style={fileButtonStyle()}
            >
              View PDF
            </a>
          ) : null}

          {canManage ? (
            <>
              <input
                ref={registrationInputRef}
                type="file"
                accept=".pdf,application/pdf"
                style={{ display: "none" }}
                onChange={(e) => {
                  const selected = e.target.files?.[0] ?? null;
                  void onUpload(selected);
                  e.currentTarget.value = "";
                }}
              />
              <button
                type="button"
                style={fileButtonStyle()}
                onClick={() => registrationInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? "Uploading..." : registrationDoc ? "Replace PDF" : "Upload PDF"}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
