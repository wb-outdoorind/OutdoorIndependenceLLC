export const crmCardStyle: React.CSSProperties = {
  border: "1px solid var(--surface-border)",
  borderRadius: 18,
  padding: 18,
  background: "var(--surface)",
};

export const crmSubtleCardStyle: React.CSSProperties = {
  ...crmCardStyle,
  background: "rgba(255,255,255,0.03)",
};

export const crmPrimaryButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 40,
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(116, 168, 255, 0.32)",
  background: "rgba(33, 74, 141, 0.28)",
  color: "#d7e7ff",
  textDecoration: "none",
  fontWeight: 800,
};

export const crmSecondaryButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 40,
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid var(--surface-border)",
  background: "rgba(255,255,255,0.05)",
  color: "inherit",
  textDecoration: "none",
  fontWeight: 800,
};

export const crmDangerButtonStyle: React.CSSProperties = {
  ...crmSecondaryButtonStyle,
  border: "1px solid rgba(255, 126, 126, 0.24)",
  background: "rgba(126, 29, 29, 0.22)",
  color: "#ffd0d0",
};

export const crmInputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 40,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid var(--surface-border)",
  background: "rgba(8,12,19,0.88)",
  color: "inherit",
};

export const crmTextareaStyle: React.CSSProperties = {
  ...crmInputStyle,
  minHeight: 132,
  padding: "12px 14px",
  lineHeight: 1.5,
  resize: "vertical",
};

export const crmMutedTextStyle: React.CSSProperties = {
  opacity: 0.76,
  lineHeight: 1.5,
};

export const crmModalBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1500,
  background: "rgba(0,0,0,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  overflow: "hidden",
};

export const crmModalCardStyle: React.CSSProperties = {
  width: "min(860px, 100%)",
  height: "auto",
  maxHeight: "90vh",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  border: "1px solid var(--surface-border)",
  borderRadius: 20,
  background: "linear-gradient(180deg, rgba(16,21,31,0.98), rgba(9,13,20,0.98))",
  boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
};

export const crmModalHeaderStyle: React.CSSProperties = {
  flexShrink: 0,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "start",
  padding: "24px 24px 18px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

export const crmModalBodyStyle: React.CSSProperties = {
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  padding: "0 24px 20px",
  scrollbarGutter: "stable",
};

export const crmModalFooterStyle: React.CSSProperties = {
  flexShrink: 0,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  justifyContent: "flex-end",
  padding: "16px 24px 24px",
  borderTop: "1px solid rgba(255,255,255,0.08)",
};
