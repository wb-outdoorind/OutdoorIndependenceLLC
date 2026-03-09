"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { canAccessRoute } from "@/lib/routeAccess";
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
  const [menuOpen, setMenuOpen] = useState(false);
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
    if (!menuOpen) return;
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [menuOpen]);

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
  const effectiveNavRole = viewAsRole ?? actualRole;
  const canViewMaintenanceCenter = canAccessRoute(effectiveNavRole, "maintenance_center");

  const navLinks: Array<{ href: string; label: string; badge?: number }> = [
    { href: "/", label: "Home" },
    { href: "/scan", label: "Scan QR" },
    { href: "/vehicles", label: "Vehicles" },
    { href: "/equipment", label: "Equipment" },
    { href: "/forms", label: "Forms" },
    { href: "/inventory", label: "Inventory" },
  ];
  if (canViewMaintenanceCenter) {
    navLinks.push({ href: "/maintenance", label: "Maintenance Center" });
  }
  navLinks.push({ href: "/academy", label: "OI Academy" });
  navLinks.push({ href: "/employees", label: "Teammates" });
  navLinks.push({ href: "/notifications", label: "Notifications", badge: unreadCount > 0 ? unreadCount : undefined });
  navLinks.push({ href: "/form-reports", label: "Accountability Center" });
  if (canViewAudit) {
    navLinks.push({ href: "/audit", label: "Audit Trail" });
  }
  navLinks.push({ href: "/approvals", label: "Approvals" });
  navLinks.push({ href: "/settings", label: "Settings" });

  function isLinkActive(href: string) {
    if (!pathname) return false;
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav className="app-topnav-menu-wrap">
      <button
        type="button"
        className="app-topnav-menu-button"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        aria-controls="app-topnav-drawer"
        onClick={() => setMenuOpen((prev) => !prev)}
      >
        <span className="app-topnav-menu-icon" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span>Menu</span>
        {unreadCount > 0 ? <span className="app-topnav-menu-badge">{unreadCount}</span> : null}
      </button>

      <div
        className={`app-topnav-drawer-backdrop${menuOpen ? " open" : ""}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden={!menuOpen}
      />

      <aside
        id="app-topnav-drawer"
        className={`app-topnav-drawer${menuOpen ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="App navigation"
      >
        <div className="app-topnav-drawer-header">
          <div className="app-topnav-drawer-title">Directory</div>
          <button
            type="button"
            className="app-topnav-drawer-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Close navigation menu"
          >
            Close
          </button>
        </div>

        <div className="app-topnav-drawer-links">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`app-topnav-drawer-link${isLinkActive(link.href) ? " active" : ""}`}
              onClick={() => setMenuOpen(false)}
            >
              <span>{link.label}</span>
              {link.badge ? <span className="app-topnav-menu-badge">{link.badge}</span> : null}
            </Link>
          ))}
        </div>

        {showViewAsBadge ? (
          <div className="app-topnav-drawer-view-as">
            <span>Viewing as: {roleLabel(viewAsRole)}</span>
            <button
              type="button"
              onClick={() => {
                writeRoleViewOverride(null);
                setViewAsRole(null);
                setMenuOpen(false);
                router.refresh();
              }}
            >
              Reset
            </button>
          </div>
        ) : null}
      </aside>

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
