import type { CSSProperties } from "react";

const STICKY_HEADER_BASE: CSSProperties = {
  position: "sticky",
  top: "var(--table-sticky-top)",
  zIndex: 30,
  background: "var(--topnav-bg)",
  backdropFilter: "blur(2px)",
};

export function asStickyTableHeader(style: CSSProperties): CSSProperties {
  return {
    ...style,
    ...STICKY_HEADER_BASE,
  };
}
