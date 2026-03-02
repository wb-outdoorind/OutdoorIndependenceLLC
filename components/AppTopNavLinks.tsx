"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function AppTopNavLinks() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLead, setIsLead] = useState(false);
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

  if (pathname === "/settings") return null;

  return (
    <nav className="app-topnav-links">
      <Link href="/" className="app-topnav-link">Home</Link>
      <Link href="/scan" className="app-topnav-link">Scan QR</Link>
      <Link href="/vehicles" className="app-topnav-link">Vehicles</Link>
      <Link href="/equipment" className="app-topnav-link">Equipment</Link>
      <Link href="/inventory" className="app-topnav-link">Inventory</Link>
      <Link href="/maintenance" className="app-topnav-link">Maintenance Center</Link>
      <Link href="/academy" className="app-topnav-link">OI Academy</Link>
      <Link href="/employees" className="app-topnav-link">Teammates</Link>
      <Link href="/notifications" className="app-topnav-link">
        Notifications{unreadCount > 0 ? ` (${unreadCount})` : ""}
      </Link>
      <Link href="/form-reports" className="app-topnav-link">Accountability Center</Link>
      <Link href="/approvals" className="app-topnav-link">Approvals</Link>
      <Link href="/settings" className="app-topnav-link">Settings</Link>
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
