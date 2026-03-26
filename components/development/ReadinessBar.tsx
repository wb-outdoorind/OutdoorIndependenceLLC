type ReadinessBarProps = {
  value: number;
  label?: string;
};

function barColor(value: number) {
  if (value >= 75) return "#59d48a";
  if (value >= 50) return "#7db2ff";
  if (value >= 25) return "#ffb766";
  return "#ff7d7d";
}

export default function ReadinessBar({ value, label }: ReadinessBarProps) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
        <span style={{ opacity: 0.74 }}>{label ?? "Completeness"}</span>
        <strong>{safeValue}%</strong>
      </div>
      <div
        aria-hidden="true"
        style={{
          width: "100%",
          height: 10,
          borderRadius: 999,
          overflow: "hidden",
          background: "rgba(255,255,255,0.08)",
        }}
      >
        <div
          style={{
            width: `${safeValue}%`,
            height: "100%",
            borderRadius: 999,
            background: barColor(safeValue),
            boxShadow: `0 0 18px ${barColor(safeValue)}33`,
          }}
        />
      </div>
    </div>
  );
}
