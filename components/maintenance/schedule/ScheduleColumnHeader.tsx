import type { CSSProperties } from "react";

type ScheduleColumnHeaderProps = {
  label: string;
  subtitle?: string;
  count: number;
};

const badgeStyle: CSSProperties = {
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.2)",
  padding: "2px 8px",
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

export default function ScheduleColumnHeader({ label, subtitle, count }: ScheduleColumnHeaderProps) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
      <div>
        <div style={{ fontWeight: 900 }}>{label}</div>
        {subtitle ? <div style={{ fontSize: 11, opacity: 0.72 }}>{subtitle}</div> : null}
      </div>
      <span style={badgeStyle}>{count}</span>
    </div>
  );
}
