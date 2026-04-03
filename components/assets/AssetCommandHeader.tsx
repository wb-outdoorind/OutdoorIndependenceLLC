"use client";

import Link from "next/link";
import { useState } from "react";
import { assetLifecycleStatusTone } from "@/lib/assetLifecycleStatus";

type HeaderException = {
  label: string;
  tone?: "default" | "warning" | "danger";
};

type HeaderAction = {
  label: string;
  href: string;
};

type HeaderMeter = {
  label: string;
  value: string;
};

export default function AssetCommandHeader({
  assetName,
  assetId,
  status,
  fullHistoryHref,
  exceptions,
  actions,
  meters,
}: {
  assetName: string;
  assetId: string;
  status: string;
  fullHistoryHref: string;
  exceptions: HeaderException[];
  actions: HeaderAction[];
  meters: HeaderMeter[];
}) {
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);
  const [pressedAction, setPressedAction] = useState<string | null>(null);

  return (
    <section style={headerCardStyle}>
      <div style={headerTopRowStyle}>
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "1.85rem",
              lineHeight: 1.1,
              fontWeight: 700,
              letterSpacing: "0.01em",
            }}
          >
            {assetName}
          </h1>
          <div style={{ marginTop: 6, opacity: 0.76, fontSize: 13 }}>
            Asset ID: <strong>{assetId}</strong>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={statusPillStyle(status)}>{status}</span>
          <Link href={fullHistoryHref} style={historyLinkStyle}>
            Full History →
          </Link>
        </div>
      </div>

      {exceptions.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {exceptions.map((exception) => (
            <span key={exception.label} style={exceptionPillStyle(exception.tone ?? "default")}>
              {exception.label}
            </span>
          ))}
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {actions.map((action) => (
            <Link
              key={`${action.label}:${action.href}`}
              href={action.href}
              style={{
                ...actionPillStyle,
                background:
                  hoveredAction === `${action.label}:${action.href}`
                    ? "rgba(255,255,255,0.12)"
                    : actionPillStyle.background,
                transform:
                  pressedAction === `${action.label}:${action.href}`
                    ? "translateY(0px) scale(0.98)"
                    : hoveredAction === `${action.label}:${action.href}`
                      ? "translateY(-1px)"
                      : "translateY(0px)",
              }}
              onMouseEnter={() => setHoveredAction(`${action.label}:${action.href}`)}
              onMouseLeave={() => {
                setHoveredAction((prev) => (prev === `${action.label}:${action.href}` ? null : prev));
                setPressedAction((prev) => (prev === `${action.label}:${action.href}` ? null : prev));
              }}
              onMouseDown={() => setPressedAction(`${action.label}:${action.href}`)}
              onMouseUp={() => setPressedAction((prev) => (prev === `${action.label}:${action.href}` ? null : prev))}
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}

      <div style={meterRowStyle}>
        {meters.map((meter, index) => (
          <div key={meter.label} style={meterItemStyle}>
            <span style={meterLabelStyle}>{meter.label}</span>
            <span style={meterDashStyle}>—</span>
            <span style={meterValueStyle}>{meter.value}</span>
            {index < meters.length - 1 ? <span style={meterSeparatorStyle}>•</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

const headerCardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
  padding: 10,
  background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
  boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
};

const headerTopRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "flex-start",
  marginBottom: 8,
};

function statusPillStyle(status: string): React.CSSProperties {
  const tone = assetLifecycleStatusTone(status);
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.22)",
    background: "rgba(255,255,255,0.06)",
    fontSize: 12,
    fontWeight: 900,
  };
  if (tone === "active") {
    return {
      ...base,
      border: "1px solid rgba(0,255,120,0.30)",
      background: "rgba(0,255,120,0.10)",
    };
  }
  if (tone === "inactive") {
    return {
      ...base,
      border: "1px solid rgba(255,210,0,0.26)",
      background: "rgba(255,210,0,0.10)",
    };
  }
  if (tone === "warning") {
    return {
      ...base,
      border: "1px solid rgba(255,140,140,0.32)",
      background: "rgba(255,80,80,0.12)",
    };
  }
  if (tone === "danger") {
    return {
      ...base,
      border: "1px solid rgba(255,80,80,0.48)",
      background: "rgba(120,20,20,0.34)",
    };
  }
  if (tone === "retired") {
    return {
      ...base,
      border: "1px solid rgba(180,180,180,0.28)",
      background: "rgba(180,180,180,0.10)",
    };
  }
  return base;
}

const historyLinkStyle: React.CSSProperties = {
  textDecoration: "none",
  color: "inherit",
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.03)",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 800,
};

function exceptionPillStyle(tone: "default" | "warning" | "danger"): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "5px 9px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(255,255,255,0.05)",
  };
  if (tone === "danger") {
    return {
      ...base,
      border: "1px solid rgba(255,120,120,0.5)",
      background: "rgba(120,20,20,0.34)",
    };
  }
  if (tone === "warning") {
    return {
      ...base,
      border: "1px solid rgba(255,215,120,0.45)",
      background: "rgba(120,96,20,0.28)",
    };
  }
  return base;
}

const actionPillStyle: React.CSSProperties = {
  textDecoration: "none",
  color: "inherit",
  border: "1px solid rgba(255,255,255,0.28)",
  borderRadius: 999,
  padding: "8px 12px",
  background: "rgba(255,255,255,0.11)",
  fontSize: 13,
  fontWeight: 900,
  transition: "all 0.15s ease",
};

const meterRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 8,
  paddingTop: 8,
  borderTop: "1px solid rgba(255,255,255,0.04)",
};

const meterItemStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 12,
};

const meterLabelStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.5)",
};

const meterDashStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.45)",
};

const meterValueStyle: React.CSSProperties = {
  color: "#fff",
  fontWeight: 600,
};

const meterSeparatorStyle: React.CSSProperties = {
  opacity: 0.45,
  marginLeft: 2,
};
