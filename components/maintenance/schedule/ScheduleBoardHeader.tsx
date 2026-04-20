import type { CSSProperties } from "react";

type ScheduleBoardHeaderProps = {
  weekRangeLabel: string;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
};

const buttonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(255,255,255,0.08)",
  color: "inherit",
  borderRadius: 10,
  padding: "10px 12px",
  fontWeight: 800,
  cursor: "pointer",
  lineHeight: 1,
};

export default function ScheduleBoardHeader({
  weekRangeLabel,
  onPrevWeek,
  onNextWeek,
  onToday,
}: ScheduleBoardHeaderProps) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" style={buttonStyle} onClick={onPrevWeek}>
        Previous Week
      </button>
      <button type="button" style={buttonStyle} onClick={onToday}>
        This Week
      </button>
      <button type="button" style={buttonStyle} onClick={onNextWeek}>
        Next Week
      </button>
      <span style={{ fontWeight: 900 }}>{weekRangeLabel}</span>
    </div>
  );
}
