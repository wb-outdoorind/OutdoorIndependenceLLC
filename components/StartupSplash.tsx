"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const DEFAULT_DURATION_MS = 3000;
const REDUCED_MOTION_DURATION_MS = 260;

function isNativeCapacitorRuntime() {
  if (typeof window === "undefined") return false;
  const maybeCapacitor = (
    window as Window & {
      Capacitor?: { isNativePlatform?: () => boolean };
    }
  ).Capacitor;

  if (typeof maybeCapacitor?.isNativePlatform === "function") {
    try {
      if (maybeCapacitor.isNativePlatform()) return true;
    } catch {
      // no-op
    }
  }

  return /\bCapacitor\b/i.test(window.navigator?.userAgent || "");
}

function getNavigationType() {
  if (typeof window === "undefined") return "navigate";

  const entries = window.performance.getEntriesByType("navigation");
  const first = entries[0];
  if (first && "type" in first) {
    const type = (first as PerformanceNavigationTiming).type;
    if (typeof type === "string" && type) return type;
  }

  const legacyNavigation = (window.performance as Performance & { navigation?: { type?: number } }).navigation;
  if (legacyNavigation?.type === 1) return "reload";
  if (legacyNavigation?.type === 2) return "back_forward";
  return "navigate";
}

function shouldShowStartupSplash() {
  if (typeof window === "undefined") return false;
  if (isNativeCapacitorRuntime()) return true;
  return getNavigationType() === "reload";
}

export default function StartupSplash() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!shouldShowStartupSplash()) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = prefersReducedMotion ? REDUCED_MOTION_DURATION_MS : DEFAULT_DURATION_MS;
    const showTimer = window.setTimeout(() => setVisible(true), 0);
    const hideTimer = window.setTimeout(() => setVisible(false), duration);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="startup-splash" aria-hidden="true">
      <Image
        src="/App_Logo_Circle_Transparent.png"
        alt=""
        width={220}
        height={220}
        priority
        className="startup-splash-logo"
      />
    </div>
  );
}
