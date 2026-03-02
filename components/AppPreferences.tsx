"use client";

import { useEffect } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { normalizeRole, writeRoleViewOverride } from "@/lib/roleView";

export type AppTheme = "dark" | "light";
export type AppTextSize = "sm" | "md" | "lg";

const THEME_KEY = "oi:theme";
const TEXT_SIZE_KEY = "oi:text_size";

export function readTheme(): AppTheme {
  if (typeof window === "undefined") return "dark";
  const value = localStorage.getItem(THEME_KEY);
  return value === "light" ? "light" : "dark";
}

export function readTextSize(): AppTextSize {
  if (typeof window === "undefined") return "md";
  const value = localStorage.getItem(TEXT_SIZE_KEY);
  if (value === "sm" || value === "md" || value === "lg") return value;
  return "md";
}

export function applyPreferences(theme: AppTheme, textSize: AppTextSize) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-text-size", textSize);
}

export function saveTheme(theme: AppTheme) {
  if (typeof window === "undefined") return;
  localStorage.setItem(THEME_KEY, theme);
}

export function saveTextSize(textSize: AppTextSize) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TEXT_SIZE_KEY, textSize);
}

export default function AppPreferences() {
  useEffect(() => {
    applyPreferences(readTheme(), readTextSize());

    let active = true;
    void (async () => {
      const supabase = createSupabaseBrowser();
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id ?? null;
      if (!active || !userId) return;

      const { data } = await supabase
        .from("user_ui_preferences")
        .select("theme,text_size,role_view_override")
        .eq("user_id", userId)
        .maybeSingle();
      if (!active || !data) return;

      const theme = data.theme === "light" ? "light" : "dark";
      const textSize =
        data.text_size === "sm" || data.text_size === "md" || data.text_size === "lg"
          ? data.text_size
          : "md";
      applyPreferences(theme, textSize);
      saveTheme(theme);
      saveTextSize(textSize);
      writeRoleViewOverride(normalizeRole(data.role_view_override) ?? null);
    })();

    return () => {
      active = false;
    };
  }, []);

  return null;
}
