"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const SPLASH_SEEN_KEY = "oi:startup_splash_seen";
const DEFAULT_DURATION_MS = 980;
const REDUCED_MOTION_DURATION_MS = 260;

export default function StartupSplash() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hasSeenSplash = window.sessionStorage.getItem(SPLASH_SEEN_KEY) === "1";
    if (hasSeenSplash) return;

    window.sessionStorage.setItem(SPLASH_SEEN_KEY, "1");
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = prefersReducedMotion ? REDUCED_MOTION_DURATION_MS : DEFAULT_DURATION_MS;
    const showTimer = window.setTimeout(() => setVisible(true), 16);
    const hideTimer = window.setTimeout(() => setVisible(false), duration + 16);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="startup-splash" aria-hidden="true">
      <Image
        src="/App_Logo.png"
        alt=""
        width={170}
        height={32}
        priority
        className="startup-splash-logo brand-logo"
      />
    </div>
  );
}
