"use client";

import { useEffect, useState } from "react";

export default function NetworkStatusBanner() {
  const [online, setOnline] = useState(() => {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
  });

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1100,
        width: "100%",
        borderBottom: "1px solid rgba(255,120,120,0.45)",
        background: "rgba(120,20,20,0.92)",
        color: "#fff",
        padding: "8px 14px",
        textAlign: "center",
        fontWeight: 700,
        fontSize: 13,
      }}
    >
      You are offline. Changes may not save until network connectivity returns.
    </div>
  );
}
