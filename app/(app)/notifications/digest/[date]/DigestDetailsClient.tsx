"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type DigestActionRow = {
  id: string;
  asset_type: "vehicle" | "equipment";
  asset_id: string;
  action_type: "asset_health_decline" | "mechanic_decline";
  status: "Open" | "In Review" | "Resolved";
  summary: string;
  detail: unknown;
  created_at: string;
  resolved_at: string | null;
};

export type DigestAssetLabelMap = Record<string, string>;

type ActionStatus = "Open" | "In Review" | "Resolved";

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
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 10,
    padding: "7px 10px",
    color: "inherit",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 12,
    textDecoration: "none",
    background: "rgba(255,255,255,0.04)",
  };
}

function ageDays(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function labelForAction(action: DigestActionRow, labels: DigestAssetLabelMap) {
  const key = `${action.asset_type}:${action.asset_id}`;
  return labels[key] || key;
}

function assetHref(action: DigestActionRow) {
  if (action.asset_type === "vehicle") return `/vehicles/${encodeURIComponent(action.asset_id)}`;
  return `/equipment/${encodeURIComponent(action.asset_id)}`;
}

export default function DigestDetailsClient({
  initialActions,
  assetLabels,
  dateKey,
}: {
  initialActions: DigestActionRow[];
  assetLabels: DigestAssetLabelMap;
  dateKey: string;
}) {
  const [actions, setActions] = useState<DigestActionRow[]>(initialActions);
  const [savingActionId, setSavingActionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const metrics = useMemo(() => {
    const open = actions.filter((a) => a.status === "Open").length;
    const inReview = actions.filter((a) => a.status === "In Review").length;
    const resolved = actions.filter((a) => a.status === "Resolved").length;
    const assetHealthDeclines = actions.filter((a) => a.action_type === "asset_health_decline").length;
    const mechanicDeclines = actions.filter((a) => a.action_type === "mechanic_decline").length;
    const aging7 = actions.filter((a) => a.status !== "Resolved" && ageDays(a.created_at) >= 7).length;
    const aging14 = actions.filter((a) => a.status !== "Resolved" && ageDays(a.created_at) >= 14).length;
    const byAsset = new Map<string, number>();
    for (const action of actions) {
      const key = `${action.asset_type}:${action.asset_id}`;
      byAsset.set(key, (byAsset.get(key) ?? 0) + 1);
    }
    const topAssets = Array.from(byAsset.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, count]) => ({ key, count }));

    return {
      open,
      inReview,
      resolved,
      assetHealthDeclines,
      mechanicDeclines,
      aging7,
      aging14,
      topAssets,
    };
  }, [actions]);

  async function updateStatus(actionId: string, status: ActionStatus) {
    setSavingActionId(actionId);
    setErrorMessage(null);
    const res = await fetch("/api/trend-actions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionId, status }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSavingActionId(null);
      setErrorMessage(json?.error || "Failed to update trend action status.");
      return;
    }

    setActions((prev) =>
      prev.map((a) =>
        a.id === actionId
          ? {
              ...a,
              status,
              resolved_at: status === "Resolved" ? new Date().toISOString() : null,
            }
          : a
      )
    );
    setSavingActionId(null);
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section style={cardStyle()}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Digest Metrics</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 10,
          }}
        >
          <Metric label="Open" value={metrics.open} />
          <Metric label="In Review" value={metrics.inReview} />
          <Metric label="Resolved" value={metrics.resolved} />
          <Metric label="Asset Health Declines" value={metrics.assetHealthDeclines} />
          <Metric label="Mechanic Declines" value={metrics.mechanicDeclines} />
          <Metric label="Aging 7+ Days" value={metrics.aging7} />
          <Metric label="Aging 14+ Days" value={metrics.aging14} />
        </div>
      </section>

      <section style={cardStyle()}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Top Affected Assets</div>
        {metrics.topAssets.length === 0 ? (
          <div style={{ opacity: 0.75 }}>No affected assets found for this digest date.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {metrics.topAssets.map((asset) => {
              const [assetType, assetId] = asset.key.split(":");
              const link = assetType === "vehicle" ? `/vehicles/${encodeURIComponent(assetId)}` : `/equipment/${encodeURIComponent(assetId)}`;
              const label = assetLabels[asset.key] || asset.key;
              return (
                <Link
                  key={`${asset.key}:${asset.count}`}
                  href={link}
                  style={{
                    ...buttonStyle(),
                    justifyContent: "space-between",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <span>{label}</span>
                  <strong>{asset.count}</strong>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section style={cardStyle()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>Trend Actions ({dateKey})</div>
          <div style={{ opacity: 0.75, fontSize: 13 }}>Click an asset to open details, or update action status inline.</div>
        </div>

        {errorMessage ? <div style={{ color: "#ff9d9d", marginBottom: 10 }}>{errorMessage}</div> : null}

        {actions.length === 0 ? (
          <div style={{ opacity: 0.75 }}>No trend actions found for this digest date.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {actions.map((action) => {
              const label = labelForAction(action, assetLabels);
              return (
                <div
                  key={action.id}
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    padding: 10,
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 250 }}>
                      <Link href={assetHref(action)} style={{ color: "inherit", fontWeight: 800 }}>
                        {label}
                      </Link>
                      <div style={{ opacity: 0.88, marginTop: 4 }}>{action.summary}</div>
                      <div style={{ opacity: 0.68, marginTop: 4, fontSize: 12 }}>
                        {action.action_type} · {action.status} · Age {ageDays(action.created_at)} day(s)
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "start" }}>
                      {(["Open", "In Review", "Resolved"] as ActionStatus[]).map((status) => (
                        <button
                          key={`${action.id}:${status}`}
                          type="button"
                          onClick={() => void updateStatus(action.id, status)}
                          disabled={savingActionId === action.id || action.status === status}
                          style={{
                            ...buttonStyle(),
                            background:
                              action.status === status ? "rgba(126,255,167,0.14)" : "rgba(255,255,255,0.04)",
                            opacity: action.status === status ? 1 : 0.9,
                          }}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 10 }}>
      <div style={{ opacity: 0.7, fontSize: 12 }}>{label}</div>
      <div style={{ marginTop: 2, fontWeight: 900, fontSize: 22 }}>{value}</div>
    </div>
  );
}
