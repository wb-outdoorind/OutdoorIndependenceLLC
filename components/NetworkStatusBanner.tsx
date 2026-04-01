"use client";

import { useEffect, useState } from "react";

const OFFLINE_BANNER_DELAY_MS = 1200;

export default function NetworkStatusBanner() {
  const [online, setOnline] = useState(true);
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);

  useEffect(() => {
    let offlineTimer: number | null = null;

    const clearOfflineTimer = () => {
      if (offlineTimer !== null) {
        window.clearTimeout(offlineTimer);
        offlineTimer = null;
      }
    };

    const scheduleOfflineBanner = () => {
      clearOfflineTimer();
      offlineTimer = window.setTimeout(() => {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          setShowOfflineBanner(true);
        }
      }, OFFLINE_BANNER_DELAY_MS);
    };

    const onOnline = () => {
      setOnline(true);
      clearOfflineTimer();
      setShowOfflineBanner(false);
    };

    const onOffline = () => {
      setOnline(false);
      scheduleOfflineBanner();
    };

    const syncStatus = () => {
      const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;
      setOnline(isOnline);
      if (isOnline) {
        clearOfflineTimer();
        setShowOfflineBanner(false);
      } else {
        scheduleOfflineBanner();
      }
    };

    syncStatus();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("pageshow", syncStatus);
    document.addEventListener("visibilitychange", syncStatus);
    return () => {
      clearOfflineTimer();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("pageshow", syncStatus);
      document.removeEventListener("visibilitychange", syncStatus);
    };
  }, []);

  if (online || !showOfflineBanner) return null;

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
