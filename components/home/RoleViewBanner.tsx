"use client";

import { useRouter } from "next/navigation";
import {
  canUseRoleView,
  roleLabel,
  writeRoleViewOverride,
  type AppRole,
} from "@/lib/roleView";

type Props = {
  actualRole: string | null;
  effectiveRole: string | null;
};

export default function RoleViewBanner({ actualRole, effectiveRole }: Props) {
  const router = useRouter();
  const actual = (actualRole ?? null) as AppRole | null;
  const effective = (effectiveRole ?? null) as AppRole | null;

  if (!actual || !effective) return null;
  if (!canUseRoleView(actual)) return null;
  if (actual === effective) return null;

  return (
    <div
      style={{
        marginTop: 10,
        marginBottom: 12,
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.22)",
        background: "rgba(20, 69, 35, 0.3)",
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700 }}>
        You are previewing as {roleLabel(effective)}.
      </div>
      <button
        type="button"
        onClick={() => {
          writeRoleViewOverride(null);
          router.refresh();
        }}
        style={{
          border: "1px solid rgba(255,255,255,0.32)",
          borderRadius: 999,
          background: "rgba(255,255,255,0.08)",
          color: "inherit",
          padding: "6px 10px",
          fontSize: 12,
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        Reset to Actual Role
      </button>
    </div>
  );
}
