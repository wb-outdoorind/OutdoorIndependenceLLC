"use client";

import { useEffect } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

export function useFormExitGuard(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    // Keep the user on this entry unless they confirm leaving.
    window.history.pushState({ formGuard: true }, "", window.location.href);

    const onPopState = () => {
      const shouldLeave = window.confirm(
        "Leave this form? Unsaved entries will be discarded, and you will not be able to return to this draft."
      );
      if (!shouldLeave) {
        window.history.pushState({ formGuard: true }, "", window.location.href);
      }
    };

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const link = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!link) return;
      if (link.target === "_blank") return;
      if (link.hasAttribute("download")) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (event.button !== 0) return;

      const href = link.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      const shouldLeave = window.confirm(
        "Leave this form? Unsaved entries will be discarded, and you will not be able to return to this draft."
      );
      if (!shouldLeave) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onDocumentClick, true);

    return () => {
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [enabled]);
}

export function confirmLeaveForm() {
  return window.confirm(
    "Leave this form? Unsaved entries will be discarded, and you will not be able to return to this draft."
  );
}

export async function getSignedInDisplayName() {
  const supabase = createSupabaseBrowser();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return "";

  const user = authData.user;
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email")
    .eq("id", user.id)
    .maybeSingle();

  const fullName = (profile?.full_name || "").trim();
  if (fullName) return fullName;

  const email = (profile?.email || user.email || "").trim();
  if (!email) return "";

  return email.split("@")[0] || email;
}
