"use client";

import { useEffect, useMemo, useState } from "react";

type AssetType = "vehicle" | "equipment";
type ActionStatus = "Open" | "In Review" | "Resolved";
type TrendAction = {
  id: string;
  action_type: string;
  status: ActionStatus;
  summary: string;
  created_at: string;
  resolved_at: string | null;
};

export default function TrendActionsPanel({
  assetType,
  assetId,
  canView,
  healthPoints,
  mechanicPoints,
}: {
  assetType: AssetType;
  assetId: string;
  canView: boolean;
  healthPoints: number[];
  mechanicPoints: number[];
}) {
  const [actions, setActions] = useState<TrendAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingActionId, setSavingActionId] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const pointsKey = useMemo(
    () => `${healthPoints.join(",")}|${mechanicPoints.join(",")}`,
    [healthPoints, mechanicPoints]
  );

  useEffect(() => {
    if (!canView || !assetId) return;
    let alive = true;
    void (async () => {
      const res = await fetch(`/api/trend-actions?assetType=${encodeURIComponent(assetType)}&assetId=${encodeURIComponent(assetId)}`);
      const data = await res.json();
      if (!alive) return;
      if (!res.ok) {
        setError(data?.error || "Failed to load trend actions.");
        setActions([]);
        setLoading(false);
        return;
      }
      setActions((data?.actions ?? []) as TrendAction[]);
      setError(null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [assetType, assetId, canView, refreshNonce]);

  useEffect(() => {
    if (!canView || !assetId) return;
    if (healthPoints.length < 3 && mechanicPoints.length < 3) return;
    let alive = true;
    void (async () => {
      const res = await fetch("/api/trend-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetType,
          assetId,
          healthPoints,
          mechanicPoints,
        }),
      });
      if (!alive) return;
      if (!res.ok) {
        const data = await res.json();
        setError(data?.error || "Failed to evaluate trend actions.");
        return;
      }
      setRefreshNonce((v) => v + 1);
    })();
    return () => {
      alive = false;
    };
  }, [assetType, assetId, canView, healthPoints, mechanicPoints, pointsKey]);

  async function updateStatus(actionId: string, status: ActionStatus) {
    setSavingActionId(actionId);
    setError(null);
    const res = await fetch("/api/trend-actions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionId, status }),
    });
    const data = await res.json();
    setSavingActionId(null);
    if (!res.ok) {
      setError(data?.error || "Failed to update action status.");
      return;
    }
    setRefreshNonce((v) => v + 1);
  }

  if (!canView) return null;

  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 900, marginBottom: 10 }}>Trend Actions</div>
      {loading ? <div style={{ opacity: 0.75 }}>Loading trend actions...</div> : null}
      {error ? <div style={{ color: "#ff9d9d" }}>{error}</div> : null}
      {!loading && !actions.length ? (
        <div style={{ opacity: 0.75 }}>No trend actions currently open.</div>
      ) : null}
      {actions.length ? (
        <div style={{ display: "grid", gap: 8 }}>
          {actions.map((action) => (
            <div key={action.id} style={rowStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{action.summary}</div>
                  <div style={{ opacity: 0.72, fontSize: 12 }}>
                    {action.action_type} · Created {new Date(action.created_at).toLocaleString()}
                    {action.resolved_at ? ` · Resolved ${new Date(action.resolved_at).toLocaleString()}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(["Open", "In Review", "Resolved"] as ActionStatus[]).map((nextStatus) => (
                    <button
                      key={`${action.id}:${nextStatus}`}
                      type="button"
                      onClick={() => updateStatus(action.id, nextStatus)}
                      disabled={savingActionId === action.id || action.status === nextStatus}
                      style={{
                        ...buttonStyle,
                        opacity: action.status === nextStatus ? 1 : 0.82,
                        background:
                          action.status === nextStatus ? "rgba(126,255,167,0.14)" : "rgba(255,255,255,0.03)",
                      }}
                    >
                      {nextStatus}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  marginTop: 18,
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 16,
  padding: 16,
  background: "rgba(255,255,255,0.03)",
};

const rowStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  padding: 10,
  background: "rgba(255,255,255,0.02)",
};

const buttonStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 10,
  padding: "6px 9px",
  color: "inherit",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 12,
};
