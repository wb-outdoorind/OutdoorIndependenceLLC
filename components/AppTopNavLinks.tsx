"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import {
  canUseRoleView,
  readRoleViewOverride,
  roleLabel,
  writeRoleViewOverride,
  type AppRole,
} from "@/lib/roleView";

export default function AppTopNavLinks() {
  const pathname = usePathname();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLead, setIsLead] = useState(false);
  const [actualRole, setActualRole] = useState<AppRole | null>(null);
  const [viewAsRole, setViewAsRole] = useState<AppRole | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<
    Array<{ id: string; inspectionType: string; vehicleId: string; teammateName: string }>
  >([]);

  useEffect(() => {
    let active = true;
    async function load() {
      const [res, approvalsRes] = await Promise.all([
        fetch("/api/notifications", { method: "GET" }),
        fetch("/api/inspections/lead-approvals?summary=1", { method: "GET" }),
      ]);
      const json = await res.json().catch(() => ({}));
      const approvalsJson = await approvalsRes.json().catch(() => ({}));
      if (!active) return;
      if (res.ok) {
        setUnreadCount(Number(json.unreadCount || 0));
      }
      if (approvalsRes.ok) {
        setIsLead(approvalsJson.isLead === true);
        setPendingApprovals(
          ((approvalsJson.pending ?? []) as Array<{
            id: string;
            inspectionType: string;
            vehicleId: string;
            teammateName: string;
          }>).slice(0, 1)
        );
      } else {
        setIsLead(false);
        setPendingApprovals([]);
      }
    }
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const supabase = createSupabaseBrowser();
      const { data: authData } = await supabase.auth.getUser();
      if (!active || !authData.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .maybeSingle();
      if (!active) return;
      setActualRole((profile?.role as AppRole | undefined) ?? "employee");
      setViewAsRole(readRoleViewOverride());
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function syncStickyTop() {
      const header = document.querySelector(".app-topnav");
      if (!(header instanceof HTMLElement)) return;
      const rect = header.getBoundingClientRect();
      const stickyTop = Math.max(0, Math.ceil(rect.bottom + 6));
      document.documentElement.style.setProperty("--table-sticky-top", `${stickyTop}px`);
    }

    syncStickyTop();
    const header = document.querySelector(".app-topnav");
    let observer: ResizeObserver | null = null;
    if (header instanceof HTMLElement && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => syncStickyTop());
      observer.observe(header);
    }
    window.addEventListener("resize", syncStickyTop);
    window.addEventListener("orientationchange", syncStickyTop);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncStickyTop);
      window.removeEventListener("orientationchange", syncStickyTop);
    };
  }, [pathname, unreadCount, pendingApprovals.length, actualRole, viewAsRole]);

  if (pathname === "/settings") return null;

  const showViewAsBadge = Boolean(
    actualRole &&
      canUseRoleView(actualRole) &&
      viewAsRole &&
      viewAsRole !== actualRole
  );
  const canViewAudit =
    actualRole === "owner" ||
    actualRole === "operations_manager" ||
    actualRole === "office_admin" ||
    actualRole === "mechanic";

  return (
    <nav className="app-topnav-links">
      <Link href="/" className="app-topnav-link">Home</Link>
      <Link href="/scan" className="app-topnav-link">Scan QR</Link>
      <Link href="/vehicles" className="app-topnav-link">Vehicles</Link>
      <Link href="/equipment" className="app-topnav-link">Equipment</Link>
      <Link href="/forms" className="app-topnav-link">Forms</Link>
      <Link href="/inventory" className="app-topnav-link">Inventory</Link>
      <Link href="/maintenance" className="app-topnav-link">Maintenance Center</Link>
      <Link href="/academy" className="app-topnav-link">OI Academy</Link>
      <Link href="/employees" className="app-topnav-link">Teammates</Link>
      <Link href="/notifications" className="app-topnav-link">
        Notifications{unreadCount > 0 ? ` (${unreadCount})` : ""}
      </Link>
      <Link href="/form-reports" className="app-topnav-link">Accountability Center</Link>
      {canViewAudit ? <Link href="/audit" className="app-topnav-link">Audit Trail</Link> : null}
      <Link href="/approvals" className="app-topnav-link">Approvals</Link>
      <Link href="/settings" className="app-topnav-link">Settings</Link>
      {showViewAsBadge ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(20, 69, 35, 0.3)",
            padding: "8px 10px",
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          Viewing as: {roleLabel(viewAsRole)}
          <button
            type="button"
            onClick={() => {
              writeRoleViewOverride(null);
              setViewAsRole(null);
              router.refresh();
            }}
            style={{
              border: "1px solid rgba(255,255,255,0.32)",
              borderRadius: 999,
              background: "rgba(255,255,255,0.08)",
              color: "inherit",
              padding: "2px 8px",
              fontSize: 11,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Reset
          </button>
        </span>
      ) : null}
      {isLead && pendingApprovals.length > 0 ? (
        <Link
          href={`/approvals?inspection=${encodeURIComponent(pendingApprovals[0].id)}`}
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            zIndex: 1500,
            maxWidth: 320,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(10,16,28,0.94)",
            color: "inherit",
            padding: "12px 14px",
            textDecoration: "none",
            boxShadow: "0 16px 32px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 13 }}>Approve {pendingApprovals[0].inspectionType}</div>
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.85 }}>
            {pendingApprovals[0].teammateName || "Teammate"} submitted for vehicle {pendingApprovals[0].vehicleId}.
          </div>
          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: "#9fcbff" }}>Open approvals</div>
        </Link>
      ) : null}
    </nav>
  );
}
