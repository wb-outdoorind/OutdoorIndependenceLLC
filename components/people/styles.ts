import {
  crmCardStyle,
  crmMutedTextStyle,
  crmSecondaryButtonStyle,
  crmSubtleCardStyle,
} from "@/components/crm/styles";

export const peopleHubCardStyle: React.CSSProperties = {
  ...crmCardStyle,
  display: "grid",
  gap: 14,
};

export const peopleHubStrongCardStyle: React.CSSProperties = {
  ...peopleHubCardStyle,
  background: "linear-gradient(180deg, rgba(19,28,42,0.96), rgba(11,17,27,0.94))",
  border: "1px solid rgba(116, 168, 255, 0.24)",
};

export const peopleHubMediumCardStyle: React.CSSProperties = {
  ...peopleHubCardStyle,
  background: "rgba(255,255,255,0.025)",
};

export const peopleHubQuietCardStyle: React.CSSProperties = {
  ...crmSubtleCardStyle,
  display: "grid",
  gap: 14,
  background: "rgba(255,255,255,0.025)",
};

export const peopleHubMutedTextStyle = crmMutedTextStyle;

export const peopleHubRowListStyle: React.CSSProperties = {
  display: "grid",
  gap: 0,
};

export const peopleHubRowLinkStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "12px 0",
  textDecoration: "none",
  color: "inherit",
  borderTop: "1px solid rgba(255,255,255,0.06)",
};

export const peopleHubRowContentStyle: React.CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 4,
};

export const peopleHubRowTitleStyle: React.CSSProperties = {
  fontWeight: 800,
  lineHeight: 1.3,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const peopleHubRowSubtitleStyle: React.CSSProperties = {
  ...crmMutedTextStyle,
  fontSize: 13,
  lineHeight: 1.35,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const peopleHubSectionMetaStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

export const peopleHubCountPillStyle: React.CSSProperties = {
  minHeight: 26,
  display: "inline-flex",
  alignItems: "center",
  padding: "0 9px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.05)",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0.2,
};

export const peopleHubSectionActionStyle: React.CSSProperties = {
  ...crmSecondaryButtonStyle,
  minHeight: 34,
  padding: "8px 12px",
  fontSize: 13,
};

export const peopleHubModuleLinkStyle: React.CSSProperties = {
  ...crmSecondaryButtonStyle,
  minHeight: 0,
  width: "100%",
  justifyContent: "space-between",
  padding: "12px 14px",
  background: "rgba(255,255,255,0.02)",
  border: "1px solid rgba(255,255,255,0.06)",
};

export const peopleHubHeaderCardStyle: React.CSSProperties = {
  ...peopleHubQuietCardStyle,
  gap: 10,
  padding: 16,
};

export const peopleHubBreadcrumbStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0.2,
  opacity: 0.72,
};
