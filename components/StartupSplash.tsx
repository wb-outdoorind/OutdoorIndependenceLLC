"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const DEFAULT_DURATION_MS = 1500;
const REDUCED_MOTION_DURATION_MS = 260;

export default function StartupSplash() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = prefersReducedMotion ? REDUCED_MOTION_DURATION_MS : DEFAULT_DURATION_MS;
    const hideTimer = window.setTimeout(() => setVisible(false), duration);

    return () => {
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
