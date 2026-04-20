import type { CSSProperties } from "react";

type ScheduleTimeFieldProps = {
  value: string | null;
  onChange: (time: string | null) => void;
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.04)",
  color: "inherit",
  fontSize: 13,
};

export default function ScheduleTimeField({ value, onChange }: ScheduleTimeFieldProps) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 11, opacity: 0.72 }}>Scheduled Time (optional)</span>
      <input
        type="time"
        value={value ?? ""}
        onChange={(event) => {
          const next = event.target.value.trim();
          onChange(next ? next : null);
        }}
        style={inputStyle}
      />
    </label>
  );
}
