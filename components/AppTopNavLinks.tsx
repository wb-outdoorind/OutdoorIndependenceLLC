"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AppTopNavLinks() {
  const pathname = usePathname();
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
      <Link href="/settings" className="app-topnav-link">Settings</Link>
    </nav>
  );
}
