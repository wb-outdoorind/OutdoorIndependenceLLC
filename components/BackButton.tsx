"use client";

import { usePathname, useRouter } from "next/navigation";

export default function BackButton() {
  const pathname = usePathname();
  const router = useRouter();

  if (!pathname || pathname === "/") return null;

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
          return;
        }
        router.push("/");
      }}
      style={{
        position: "fixed",
        left: 16,
        bottom: 16,
        zIndex: 999,
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.2)",
        background: "rgba(0,0,0,0.75)",
        color: "#fff",
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
