import type { CSSProperties } from "react";

export const labCardStyle: CSSProperties = {
  border: "1px solid var(--surface-border)",
  borderRadius: 18,
  background: "var(--surface)",
  padding: 18,
};

export const labSubtleCardStyle: CSSProperties = {
  ...labCardStyle,
  background: "rgba(255,255,255,0.03)",
};

export const labButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  minHeight: 40,
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid var(--surface-border)",
  background: "rgba(255,255,255,0.05)",
  color: "inherit",
  textDecoration: "none",
  fontWeight: 700,
};

export const labInputStyle: CSSProperties = {
  width: "100%",
  minHeight: 40,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid var(--surface-border)",
  background: "rgba(8,12,19,0.88)",
  color: "inherit",
};

export const labTextareaStyle: CSSProperties = {
  ...labInputStyle,
  minHeight: 90,
  resize: "vertical",
};

export const labMutedTextStyle: CSSProperties = {
  opacity: 0.74,
  lineHeight: 1.5,
};
