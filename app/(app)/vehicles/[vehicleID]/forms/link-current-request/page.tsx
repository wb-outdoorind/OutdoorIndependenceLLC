"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { confirmLeaveForm, useFormExitGuard } from "@/lib/forms";

type OpenRequest = {
  id: string;
  created_at: string;
  status: string | null;
  urgency: string | null;
  system_affected: string | null;
  issue_identified_during: string | null;
  drivability: string | null;
  description: string | null;
};

export default function LinkCurrentRequestPage() {
  const router = useRouter();
  const params = useParams<{ vehicleID?: string }>();
  const searchParams = useSearchParams();
  useFormExitGuard();

  const vehicleId = params?.vehicleID ? decodeURIComponent(params.vehicleID) : "";
  const rawReturnTo = (searchParams.get("returnTo") || "").trim();
  const linkSectionId = (searchParams.get("linkSectionId") || "").trim();
  const linkItemKey = (searchParams.get("linkItemKey") || "").trim();
  const returnTo = rawReturnTo.startsWith("/") ? rawReturnTo : `/vehicles/${encodeURIComponent(vehicleId)}`;

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<OpenRequest[]>([]);
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    if (!vehicleId) return;
    let alive = true;
    void (async () => {
      setLoading(true);
      setErrorMessage(null);
      const supabase = createSupabaseBrowser();
      const { data, error } = await supabase
        .from("maintenance_requests")
        .select("id,created_at,status,urgency,system_affected,issue_identified_during,drivability,description")
        .eq("vehicle_id", vehicleId)
        .in("status", ["Open", "In Progress"])
        .order("created_at", { ascending: false });

      if (!alive) return;
      if (error) {
        setRows([]);
        setErrorMessage(error.message);
        setLoading(false);
        return;
      }

      const nextRows = (data ?? []) as OpenRequest[];
      setRows(nextRows);
      setSelectedId((prev) => (prev && nextRows.some((r) => r.id === prev) ? prev : nextRows[0]?.id ?? ""));
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [vehicleId]);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  function onLinkSelected() {
    if (!selectedId) return;
    if (!linkSectionId || !linkItemKey) {
      alert("Missing inspection item context for linking.");
      return;
    }
    const q = new URLSearchParams({
      linkedRequestId: selectedId,
      linkSectionId,
      linkItemKey,
    });
    router.replace(`${returnTo}${returnTo.includes("?") ? "&" : "?"}${q.toString()}`);
  }

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", paddingBottom: 28 }}>
      <h1 style={{ marginBottom: 6 }}>Link Current Request</h1>
      <div style={{ opacity: 0.78, lineHeight: 1.45 }}>
        Browse current open vehicle requests and link one to this failed inspection item.
      </div>

      <div style={{ marginTop: 10, fontSize: 13, opacity: 0.72 }}>
        Vehicle ID: <strong>{vehicleId || "(missing)"}</strong>
      </div>

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "minmax(300px, 420px) minmax(360px, 1fr)",
          gap: 14,
        }}
      >
        <section style={cardStyle()}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Open Requests</div>
          {loading ? <div style={{ opacity: 0.72 }}>Loading requests...</div> : null}
          {errorMessage ? <div style={{ color: "#ff9d9d" }}>{errorMessage}</div> : null}
          {!loading && !errorMessage && rows.length === 0 ? (
            <div style={{ opacity: 0.75 }}>No open requests found for this vehicle.</div>
          ) : null}
          <div style={{ display: "grid", gap: 8 }}>
            {rows.map((r) => {
              const active = selectedId === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  style={{
                    textAlign: "left",
                    padding: 10,
                    borderRadius: 12,
                    border: active
                      ? "1px solid rgba(255,255,255,0.4)"
                      : "1px solid rgba(255,255,255,0.14)",
                    background: active ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.02)",
                    color: "inherit",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 800 }}>{r.system_affected || "Issue"} · {r.urgency || "n/a"}</div>
                  <div style={{ fontSize: 12, opacity: 0.76, marginTop: 2 }}>
                    {r.id.slice(0, 8)} · {r.status || "Open"} · {new Date(r.created_at).toLocaleString()}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section style={cardStyle()}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Request Detail</div>
          {!selected ? (
            <div style={{ opacity: 0.75 }}>Select a request to read details.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div><strong>ID:</strong> {selected.id}</div>
              <div><strong>Status:</strong> {selected.status || "n/a"}</div>
              <div><strong>Urgency:</strong> {selected.urgency || "n/a"}</div>
              <div><strong>System:</strong> {selected.system_affected || "n/a"}</div>
              <div><strong>Identified During:</strong> {selected.issue_identified_during || "n/a"}</div>
              <div><strong>Drivability:</strong> {selected.drivability || "n/a"}</div>
              <div><strong>Created:</strong> {new Date(selected.created_at).toLocaleString()}</div>
              <div>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Description</div>
                <div
                  style={{
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: 12,
                    padding: 12,
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.35,
                    background: "rgba(255,255,255,0.02)",
                    minHeight: 120,
                  }}
                >
                  {selected.description?.trim() || "No description."}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={onLinkSelected} style={buttonStyle()} disabled={!selectedId}>
          Link Selected Request
        </button>
        <button
          type="button"
          onClick={() => {
            if (!confirmLeaveForm()) return;
            router.replace(returnTo);
          }}
          style={secondaryButtonStyle()}
        >
          Back To Inspection
        </button>
      </div>
    </main>
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

function buttonStyle(): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "inherit",
    fontWeight: 800,
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
    fontWeight: 700,
    opacity: 0.9,
    cursor: "pointer",
  };
}
