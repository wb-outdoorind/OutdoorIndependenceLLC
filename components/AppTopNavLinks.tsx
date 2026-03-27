"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { canAccessRoute } from "@/lib/routeAccess";
import {
  canUseRoleView,
  readRoleViewOverride,
  ROLE_VIEW_CHANGED_EVENT,
  ROLE_VIEW_STORAGE_KEY,
  roleLabel,
  writeRoleViewOverride,
  type AppRole,
} from "@/lib/roleView";
import { isMechanicOrHigher } from "@/lib/roles";

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
    let timer: number | null = null;
    let inFlight = false;

    async function load() {
      if (!active || inFlight) return;
      inFlight = true;
      try {
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
      } catch {
        if (!active) return;
        setIsLead(false);
        setPendingApprovals([]);
      } finally {
        inFlight = false;
      }
    }

    function scheduleNext(ms = 30_000) {
      if (!active) return;
      timer = window.setTimeout(() => {
        if (document.visibilityState === "visible") {
          void load();
        }
        scheduleNext(30_000);
      }, ms);
    }

    function onVisibilityOrFocus() {
      if (document.visibilityState === "visible") {
        void load();
      }
    }

    void load();
    scheduleNext();
    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
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

    const onStorage = (event: StorageEvent) => {
      if (event.key !== ROLE_VIEW_STORAGE_KEY) return;
      setViewAsRole(readRoleViewOverride());
    };
    const onRoleViewChanged = () => {
      setViewAsRole(readRoleViewOverride());
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(ROLE_VIEW_CHANGED_EVENT, onRoleViewChanged);

    return () => {
      active = false;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ROLE_VIEW_CHANGED_EVENT, onRoleViewChanged);
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
  const canViewAudit = isMechanicOrHigher(actualRole);
  const effectiveNavRole = viewAsRole ?? actualRole;
  const canViewMaintenanceCenter = canAccessRoute(effectiveNavRole, "maintenance_center");
  const canViewFertilizingOperations = canAccessRoute(effectiveNavRole, "fertilizing_operations");
  const canViewCrm = canAccessRoute(effectiveNavRole, "crm");
  const canViewEstimates = canAccessRoute(effectiveNavRole, "estimates");
  const canViewPurchases = canAccessRoute(effectiveNavRole, "purchases");
  const canViewAccountability = canAccessRoute(effectiveNavRole, "accountability_center");
  const canViewApprovals = canAccessRoute(effectiveNavRole, "lead_approvals");

  const navLinks: Array<{ href: string; label: string; badge?: number }> = [
    { href: "/", label: "Home" },
    { href: "/scan", label: "Scan QR" },
    { href: "/vehicles", label: "Vehicles" },
    { href: "/equipment", label: "Equipment" },
    { href: "/forms", label: "Forms" },
    { href: "/inventory", label: "Inventory" },
  ];
  if (canViewFertilizingOperations) {
    navLinks.push({ href: "/fertilizing", label: "Fertilizing Ops" });
  }
  if (canViewCrm) {
    navLinks.push({ href: "/crm", label: "CRM" });
  }
  if (canViewEstimates) {
    navLinks.push({ href: "/estimates", label: "Estimates" });
  }
  if (canViewPurchases) {
    navLinks.push({ href: "/purchases", label: "Purchases" });
  }
  if (canViewMaintenanceCenter) {
    navLinks.push({ href: "/maintenance", label: "Maintenance Operations Dashboard" });
  }
  navLinks.push({ href: "/academy", label: "OI Academy" });
  navLinks.push({ href: "/employees", label: "Teammates" });
  navLinks.push({ href: "/notifications", label: "Notifications", badge: unreadCount > 0 ? unreadCount : undefined });
  if (canViewAccountability) {
    navLinks.push({ href: "/form-reports", label: "Accountability Center" });
  }
  if (canViewAudit) {
    navLinks.push({ href: "/audit", label: "Audit Trail" });
  }
  if (canViewApprovals) {
    navLinks.push({ href: "/approvals", label: "Approvals" });
  }
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

      {canViewApprovals && isLead && pendingApprovals.length > 0 ? (
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
