"use client";

import Link from "next/link";
import { labButtonStyle, labCardStyle, labMutedTextStyle } from "@/components/development/styles";

type DevelopmentSectionCardProps = {
  title: string;
  description: string;
  href: string;
};

export default function DevelopmentSectionCard({
  title,
  description,
  href,
}: DevelopmentSectionCardProps) {
  return (
    <div
      style={{
        ...labCardStyle,
        display: "grid",
        gap: 12,
        background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4, opacity: 0.7 }}>
            William Only
          </div>
          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800 }}>{title}</div>
        </div>
        <div
          style={{
            alignSelf: "start",
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid rgba(116, 168, 255, 0.24)",
            background: "rgba(33, 74, 141, 0.22)",
            color: "#bcd9ff",
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          Development
        </div>
      </div>

      <div style={labMutedTextStyle}>{description}</div>

      <div>
        <Link href={href} style={labButtonStyle}>
          Open Future Platform Lab
        </Link>
      </div>
    </div>
  );
}
