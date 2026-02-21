"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function AppTopNavLinks() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      const res = await fetch("/api/notifications", { method: "GET" });
      const json = await res.json().catch(() => ({}));
      if (!active) return;
      if (res.ok) {
        setUnreadCount(Number(json.unreadCount || 0));
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
      <Link href="/settings" className="app-topnav-link">Settings</Link>
    </nav>
  );
}
