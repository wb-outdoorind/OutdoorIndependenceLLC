"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { canAccessRoute } from "@/lib/routeAccess";
import {
  cacheNotificationPreferences,
  loadNotificationPreferences,
  NOTIFICATION_PREFERENCES_UPDATED_EVENT,
  readCachedNotificationPreferences,
  isMaintenanceRealtimeToastKind,
  shouldShowMaintenanceToast,
  notificationActionHref,
  notificationActionLabel,
  subscribeToUserNotificationChanges,
  type NotificationRealtimeRow,
} from "@/lib/notificationRealtime";
import { type UserNotificationPreferences } from "@/lib/userNotificationPreferences";
import { isWilliamPlanningUser } from "@/lib/williamPlanningAccess";
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

type RealtimeToast = {
  id: number;
  title: string;
  body: string;
  href: string;
  actionLabel: string;
};

const TOAST_SEEN_STORAGE_PREFIX = "oi:maintenance-realtime-toast-seen";

function readSeenToastIds(userId: string | null) {
  if (typeof window === "undefined" || !userId) return new Set<number>();
  const raw = window.sessionStorage.getItem(`${TOAST_SEEN_STORAGE_PREFIX}:${userId}`);
  if (!raw) return new Set<number>();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set<number>();
    return new Set(
      parsed
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
        .slice(-250)
    );
  } catch {
    return new Set<number>();
  }
}

function writeSeenToastIds(userId: string | null, ids: Set<number>) {
  if (typeof window === "undefined" || !userId) return;
  const values = Array.from(ids).filter((value) => Number.isFinite(value)).slice(-250);
  window.sessionStorage.setItem(`${TOAST_SEEN_STORAGE_PREFIX}:${userId}`, JSON.stringify(values));
}

export default function AppTopNavLinks() {
  const pathname = usePathname();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isLead, setIsLead] = useState(false);
  const [actualRole, setActualRole] = useState<AppRole | null>(null);
  const [viewAsRole, setViewAsRole] = useState<AppRole | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [canViewWilliamOnlyWork, setCanViewWilliamOnlyWork] = useState(false);
  const [realtimeToasts, setRealtimeToasts] = useState<RealtimeToast[]>([]);
  const [notificationPrefs, setNotificationPrefs] = useState<UserNotificationPreferences>(() =>
    readCachedNotificationPreferences(null)
  );
  const [pendingApprovals, setPendingApprovals] = useState<
    Array<{ id: string; inspectionType: string; vehicleId: string; teammateName: string }>
  >([]);
  const toastTimersRef = useRef<Map<number, number>>(new Map());
  const seenToastIdsRef = useRef<Set<number>>(new Set());
  const effectiveNavRole = viewAsRole ?? actualRole;
  const canViewMaintenanceCenter = canAccessRoute(effectiveNavRole, "maintenance_center");

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
      if (!active) return;
      if (!authData.user) {
        setCurrentUserId(null);
        setCanViewWilliamOnlyWork(false);
        return;
      }
      setCurrentUserId(authData.user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("role,email")
        .eq("id", authData.user.id)
        .maybeSingle();
      if (!active) return;
      setActualRole((profile?.role as AppRole | undefined) ?? "employee");
      setViewAsRole(readRoleViewOverride());
      setCanViewWilliamOnlyWork(isWilliamPlanningUser(profile, authData.user));
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
    seenToastIdsRef.current = readSeenToastIds(currentUserId);
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      setNotificationPrefs(readCachedNotificationPreferences(null));
      return;
    }
    setNotificationPrefs(readCachedNotificationPreferences(currentUserId));
    void loadNotificationPreferences(currentUserId).then((prefs) => {
      setNotificationPrefs(prefs);
    });
  }, [currentUserId]);

  useEffect(() => {
    const onPreferencesUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ userId?: string; prefs?: UserNotificationPreferences }>;
      if (!customEvent.detail || !customEvent.detail.userId || !customEvent.detail.prefs) return;
      if (customEvent.detail.userId !== currentUserId) return;
      cacheNotificationPreferences(customEvent.detail.userId, customEvent.detail.prefs);
      setNotificationPrefs(customEvent.detail.prefs);
    };
    window.addEventListener(NOTIFICATION_PREFERENCES_UPDATED_EVENT, onPreferencesUpdated);
    return () => {
      window.removeEventListener(NOTIFICATION_PREFERENCES_UPDATED_EVENT, onPreferencesUpdated);
    };
  }, [currentUserId]);

  const dismissRealtimeToast = useCallback((id: number) => {
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setRealtimeToasts((prev) => prev.filter((row) => row.id !== id));
  }, []);

  const pushRealtimeToast = useCallback(
    (row: NotificationRealtimeRow) => {
      const href = notificationActionHref(row);
      if (!href) return;
      const toast: RealtimeToast = {
        id: row.id,
        title: row.title,
        body: row.body,
        href,
        actionLabel: notificationActionLabel(row),
      };
      setRealtimeToasts((prev) => {
        if (prev.some((entry) => entry.id === toast.id)) return prev;
        return [toast, ...prev].slice(0, 3);
      });
      const timer = window.setTimeout(() => dismissRealtimeToast(toast.id), 8_000);
      toastTimersRef.current.set(toast.id, timer);
    },
    [dismissRealtimeToast]
  );

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    const supabase = createSupabaseBrowser();

    async function refreshUnreadCount() {
      const res = await fetch("/api/notifications", { method: "GET" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setUnreadCount(Number(json.unreadCount || 0));
    }

    const unsubscribe = subscribeToUserNotificationChanges({
      supabase,
      userId: currentUserId,
      onInsert: (row) => {
        if (!row.is_read) {
          setUnreadCount((prev) => prev + 1);
        }
        if (!canViewMaintenanceCenter) return;
        if (!isMaintenanceRealtimeToastKind(row.kind)) return;
        if (!shouldShowMaintenanceToast(row.kind, notificationPrefs)) return;
        const seen = seenToastIdsRef.current;
        if (seen.has(row.id)) return;
        seen.add(row.id);
        writeSeenToastIds(currentUserId, seen);
        pushRealtimeToast(row);
      },
      onUpdate: () => {
        void refreshUnreadCount();
      },
      onDelete: () => {
        void refreshUnreadCount();
      },
    });

    return unsubscribe;
  }, [canViewMaintenanceCenter, currentUserId, notificationPrefs, pushRealtimeToast]);

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
  const canViewFertilizingOperations = canAccessRoute(effectiveNavRole, "fertilizing_operations");
  const canViewCrm = canAccessRoute(effectiveNavRole, "crm");
  const canViewEstimates = canAccessRoute(effectiveNavRole, "estimates") && canViewWilliamOnlyWork;
  const canViewPurchases = canAccessRoute(effectiveNavRole, "purchases");
  const canViewAccountability = canAccessRoute(effectiveNavRole, "accountability_center");
  const canViewApprovals = canAccessRoute(effectiveNavRole, "lead_approvals");
  const showLeadApprovalCard = canViewApprovals && isLead && pendingApprovals.length > 0;

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

      {realtimeToasts.length ? (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: showLeadApprovalCard ? 150 : 16,
            zIndex: 1501,
            display: "grid",
            gap: 10,
            width: "min(360px, calc(100vw - 32px))",
          }}
        >
          {realtimeToasts.map((toast) => (
            <div
              key={toast.id}
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(10,16,28,0.96)",
                boxShadow: "0 14px 28px rgba(0,0,0,0.4)",
                padding: 12,
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 13 }}>{toast.title}</div>
              <div style={{ fontSize: 12, opacity: 0.9, lineHeight: 1.35 }}>{toast.body}</div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={{
                    borderRadius: 10,
                    border: "1px solid rgba(140,200,255,0.5)",
                    background: "rgba(44,108,170,0.34)",
                    color: "#eaf4ff",
                    fontWeight: 800,
                    padding: "7px 10px",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    dismissRealtimeToast(toast.id);
                    router.push(toast.href);
                  }}
                >
                  {toast.actionLabel}
                </button>
                <button
                  type="button"
                  style={{
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(255,255,255,0.06)",
                    color: "inherit",
                    fontWeight: 700,
                    padding: "7px 10px",
                    cursor: "pointer",
                  }}
                  onClick={() => dismissRealtimeToast(toast.id)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {showLeadApprovalCard ? (
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
