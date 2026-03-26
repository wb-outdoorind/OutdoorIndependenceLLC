import type { CSSProperties } from "react";
import { labelFuturePlatformValue } from "@/lib/futurePlatformLab";

const badgeToneStyles: Record<string, CSSProperties> = {
  mature: {
    color: "#b8ffd6",
    background: "rgba(53, 156, 84, 0.18)",
    border: "1px solid rgba(126,255,167,0.24)",
  },
  reusable: {
    color: "#b8ffd6",
    background: "rgba(53, 156, 84, 0.18)",
    border: "1px solid rgba(126,255,167,0.24)",
  },
  low: {
    color: "#d7deea",
    background: "rgba(138,146,166,0.18)",
    border: "1px solid rgba(170,178,198,0.2)",
  },
  later: {
    color: "#d7deea",
    background: "rgba(138,146,166,0.18)",
    border: "1px solid rgba(170,178,198,0.2)",
  },
  partial: {
    color: "#ffe39d",
    background: "rgba(158, 118, 31, 0.2)",
    border: "1px solid rgba(255, 208, 106, 0.22)",
  },
  needs_config: {
    color: "#bcd9ff",
    background: "rgba(33, 74, 141, 0.28)",
    border: "1px solid rgba(116, 168, 255, 0.24)",
  },
  medium: {
    color: "#bcd9ff",
    background: "rgba(33, 74, 141, 0.28)",
    border: "1px solid rgba(116, 168, 255, 0.24)",
  },
  now: {
    color: "#bcd9ff",
    background: "rgba(33, 74, 141, 0.28)",
    border: "1px solid rgba(116, 168, 255, 0.24)",
  },
  early: {
    color: "#ffd8b2",
    background: "rgba(114, 65, 16, 0.26)",
    border: "1px solid rgba(255, 171, 94, 0.22)",
  },
  hardcoded: {
    color: "#ffd8b2",
    background: "rgba(114, 65, 16, 0.26)",
    border: "1px solid rgba(255, 171, 94, 0.22)",
  },
  high: {
    color: "#ffd8b2",
    background: "rgba(114, 65, 16, 0.26)",
    border: "1px solid rgba(255, 171, 94, 0.22)",
  },
  next: {
    color: "#ffd8b2",
    background: "rgba(114, 65, 16, 0.26)",
    border: "1px solid rgba(255, 171, 94, 0.22)",
  },
  missing: {
    color: "#ffb8b8",
    background: "rgba(126, 29, 29, 0.3)",
    border: "1px solid rgba(255, 126, 126, 0.24)",
  },
  internal_only: {
    color: "#ffb8b8",
    background: "rgba(126, 29, 29, 0.3)",
    border: "1px solid rgba(255, 126, 126, 0.24)",
  },
  critical: {
    color: "#ffb8b8",
    background: "rgba(126, 29, 29, 0.3)",
    border: "1px solid rgba(255, 126, 126, 0.24)",
  },
};

export default function StatusBadge({ value, label }: { value: string; label?: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 28,
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: 0.2,
        ...(badgeToneStyles[value] ?? badgeToneStyles.low),
      }}
    >
      {label ?? labelFuturePlatformValue(value)}
    </span>
  );
}
