import type { CSSProperties } from "react";
import type { AssigneeOption } from "./types";

type AssigneeSelectProps = {
  value: string | null;
  options: AssigneeOption[];
  onChange: (userId: string | null) => void;
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

export default function AssigneeSelect({ value, options, onChange }: AssigneeSelectProps) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 11, opacity: 0.72 }}>Assigned Mechanic</span>
      <select
        value={value ?? ""}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next === "" ? null : next);
        }}
        style={inputStyle}
      >
        <option value="">Unassigned</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
