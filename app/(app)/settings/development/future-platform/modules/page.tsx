"use client";

import { useState } from "react";
import ModuleCard from "@/components/development/ModuleCard";
import { useFuturePlatformLab } from "@/components/development/FuturePlatformLabProvider";
import {
  FUTURE_PLATFORM_CATEGORIES,
  FUTURE_PLATFORM_CATEGORY_LABELS,
  FUTURE_PLATFORM_STATUSES,
  FUTURE_PLATFORM_STATUS_LABELS,
  type FuturePlatformCategory,
  type FuturePlatformModule,
  type FuturePlatformModuleStatus,
} from "@/lib/futurePlatformLab";
import { labCardStyle, labInputStyle, labMutedTextStyle } from "@/components/development/styles";

const PRIORITY_RANK: Record<FuturePlatformModule["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const CATEGORY_RANK: Record<FuturePlatformCategory, number> = {
  operations: 0,
  business: 1,
  finance: 2,
  system: 3,
};

export default function FuturePlatformModulesPage() {
  const { modules, updateModule } = useFuturePlatformLab();
  const [categoryFilter, setCategoryFilter] = useState<FuturePlatformCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<FuturePlatformModuleStatus | "all">("all");

  const visibleModules = modules
    .filter((module) => (categoryFilter === "all" ? true : module.category === categoryFilter))
    .filter((module) => (statusFilter === "all" ? true : module.status === statusFilter))
    .slice()
    .sort((left, right) => {
      if (CATEGORY_RANK[left.category] !== CATEGORY_RANK[right.category]) {
        return CATEGORY_RANK[left.category] - CATEGORY_RANK[right.category];
      }
      if (PRIORITY_RANK[left.priority] !== PRIORITY_RANK[right.priority]) {
        return PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
      }
      return left.name.localeCompare(right.name);
    });

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section style={{ ...labCardStyle, display: "grid", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Module Classification System</h2>
          <div style={{ ...labMutedTextStyle, marginTop: 8 }}>
            Track which modules are mature, which are still hardcoded to current operations, and
            which future systems need to exist before the app becomes a broader SaaS platform.
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
            <span style={{ opacity: 0.76 }}>Category</span>
            <select
              value={categoryFilter}
              style={labInputStyle}
              onChange={(event) => setCategoryFilter(event.target.value as FuturePlatformCategory | "all")}
            >
              <option value="all">All Categories</option>
              {FUTURE_PLATFORM_CATEGORIES.map((category) => (
                <option key={`category-${category}`} value={category}>
                  {FUTURE_PLATFORM_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
            <span style={{ opacity: 0.76 }}>Status</span>
            <select
              value={statusFilter}
              style={labInputStyle}
              onChange={(event) => setStatusFilter(event.target.value as FuturePlatformModuleStatus | "all")}
            >
              <option value="all">All Statuses</option>
              {FUTURE_PLATFORM_STATUSES.map((status) => (
                <option key={`status-${status}`} value={status}>
                  {FUTURE_PLATFORM_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: "grid", alignContent: "end" }}>
            <div
              style={{
                minHeight: 40,
                display: "flex",
                alignItems: "center",
                padding: "0 12px",
                borderRadius: 12,
                border: "1px solid var(--surface-border)",
                background: "rgba(255,255,255,0.03)",
                fontWeight: 700,
              }}
            >
              Showing {visibleModules.length} of {modules.length} modules
            </div>
          </div>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        }}
      >
        {visibleModules.map((module) => (
          <ModuleCard key={module.id} module={module} editable onChange={updateModule} />
        ))}
      </section>

      <section style={{ ...labCardStyle, display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Working Notes</h3>
        <div style={labMutedTextStyle}>
          Edits on this page update the in-lab state only. They are designed for product strategy
          sessions, not production configuration.
        </div>
      </section>
    </div>
  );
}
