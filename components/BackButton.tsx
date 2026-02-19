"use client";

import { usePathname, useRouter } from "next/navigation";

function logicalBackTarget(pathname: string): string | null {
  if (pathname.startsWith("/vehicles/") && pathname.includes("/forms/")) return null;
  if (pathname.startsWith("/equipment/") && pathname.includes("/forms/")) return null;

  const hiddenRoots = new Set([
    "/",
    "/login",
    "/vehicles",
    "/equipment",
    "/inventory",
    "/employees",
    "/ops",
    "/academy",
    "/maintenance",
    "/scan",
    "/settings",
  ]);
  if (hiddenRoots.has(pathname)) return null;

  if (/^\/vehicles\/[^/]+\/history$/.test(pathname)) {
    return pathname.replace(/\/history$/, "");
  }
  if (/^\/vehicles\/[^/]+$/.test(pathname)) {
    return "/vehicles";
  }
  if (/^\/equipment\/[^/]+\/history$/.test(pathname)) {
    return pathname.replace(/\/history$/, "");
  }
  if (/^\/equipment\/[^/]+$/.test(pathname)) {
    return "/equipment";
  }
  if (/^\/inventory\/[^/]+$/.test(pathname)) return "/inventory";
  if (/^\/employees\/new$/.test(pathname)) return "/employees";
  if (/^\/employees\/[^/]+$/.test(pathname)) return "/employees";
  if (pathname.startsWith("/inventory/")) return "/inventory";
  if (pathname.startsWith("/admin/")) return "/";

  return "/";
}

export default function BackButton() {
  const pathname = usePathname();
  const router = useRouter();

  if (!pathname) return null;
  const target = logicalBackTarget(pathname);
  if (!target) return null;

  return (
    <button
      type="button"
      onClick={() => {
        router.replace(target);
      }}
      style={{
        position: "fixed",
        left: 16,
        bottom: 16,
        zIndex: 999,
        borderRadius: 999,
        border: "1px solid var(--surface-border-strong)",
        background: "var(--topnav-bg)",
        color: "var(--foreground)",
        padding: "10px 14px",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
      }}
      aria-label="Go back"
    >
      Back
    </button>
  );
}
