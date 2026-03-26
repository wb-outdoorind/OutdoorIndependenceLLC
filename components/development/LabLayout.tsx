"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFuturePlatformLab } from "@/components/development/FuturePlatformLabProvider";
import {
  FUTURE_PLATFORM_CATEGORY_LABELS,
  type FuturePlatformCategory,
} from "@/lib/futurePlatformLab";
import { labButtonStyle, labCardStyle, labMutedTextStyle, labSubtleCardStyle } from "@/components/development/styles";

const LAB_TABS = [
  { href: "/settings/development/future-platform", label: "Overview" },
  { href: "/settings/development/future-platform/modules", label: "Modules" },
  { href: "/settings/development/future-platform/roadmap", label: "Roadmap" },
  { href: "/settings/development/future-platform/workflows", label: "Workflows" },
  { href: "/settings/development/future-platform/readiness", label: "Readiness" },
];

export default function LabLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { summary } = useFuturePlatformLab();

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section
        style={{
          ...labCardStyle,
          background:
            "linear-gradient(180deg, rgba(18,26,39,0.95) 0%, rgba(11,17,27,0.92) 100%)",
        }}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <Link href="/settings" style={{ ...labButtonStyle, padding: "8px 12px" }}>
              Back to Settings
            </Link>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4, opacity: 0.7 }}>
              Development / Future Platform Lab
            </div>
          </div>

          <div>
            <h1 style={{ margin: "4px 0 8px", fontSize: "clamp(28px, 4vw, 40px)" }}>Future Platform Lab</h1>
            <div style={{ ...labMutedTextStyle, maxWidth: 880 }}>
              Private strategy space for William to evaluate which parts of the app are SaaS-ready,
              where the biggest product gaps are, and how core workflows should evolve from internal
              operations into a future platform.
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              marginTop: 6,
            }}
          >
            <SummaryCard label="Tracked Modules" value={`${summary.totalModules}`} />
            <SummaryCard label="SaaS-Ready Share" value={`${summary.saasReadyPercent}%`} />
            <SummaryCard label="Critical Gaps" value={`${summary.criticalGapCount}`} />
            <SummaryCard label="Mapped Workflows" value={`${summary.workflowCount}`} />
          </div>
        </div>
      </section>

      <section style={{ ...labSubtleCardStyle, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {LAB_TABS.map((tab) => {
            const active =
              tab.href === "/settings/development/future-platform"
                ? pathname === tab.href
                : pathname?.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                style={{
                  ...labButtonStyle,
                  background: active ? "rgba(33, 74, 141, 0.28)" : "rgba(255,255,255,0.04)",
                  border: active
                    ? "1px solid rgba(116, 168, 255, 0.28)"
                    : "1px solid var(--surface-border)",
                  color: active ? "#bcd9ff" : "inherit",
                }}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          }}
        >
          {summary.categoryBreakdown.map((item) => (
            <div key={item.category} style={{ ...labSubtleCardStyle, padding: 14 }}>
              <div style={{ fontWeight: 800 }}>{FUTURE_PLATFORM_CATEGORY_LABELS[item.category as FuturePlatformCategory]}</div>
              <div style={{ marginTop: 10, display: "grid", gap: 4, fontSize: 13 }}>
                <span style={{ opacity: 0.78 }}>Tracked: {item.total}</span>
                <span style={{ opacity: 0.78 }}>Ready or close: {item.ready}</span>
                <span style={{ opacity: 0.78 }}>Missing: {item.missing}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ ...labMutedTextStyle, fontSize: 13 }}>
          Planning data stays local to this lab for now. It does not touch production modules, live
          business records, or existing workflows.
        </div>
      </section>

      <div>{children}</div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ ...labSubtleCardStyle, padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.35, opacity: 0.68 }}>{label}</div>
      <div style={{ marginTop: 10, fontSize: 28, fontWeight: 900 }}>{value}</div>
    </div>
  );
}
