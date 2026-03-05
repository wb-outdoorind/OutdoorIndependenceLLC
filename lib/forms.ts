"use client";

import { createElement, useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

export const FORM_DRAFT_SAVE_EVENT = "oi:form-draft-save";
export const FORM_DRAFT_CLEAR_EVENT = "oi:form-draft-clear";

export function requestFormDraftSave() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FORM_DRAFT_SAVE_EVENT));
}

export function requestFormDraftClear() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FORM_DRAFT_CLEAR_EVENT));
}

export function useFormExitGuard(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    // Keep the user on this entry unless they confirm leaving.
    window.history.pushState({ formGuard: true }, "", window.location.href);

    const onPopState = () => {
      const shouldLeave = window.confirm(
        "Leave this form? Your local draft will stay available and auto-restore when you return."
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
        "Leave this form? Your local draft will stay available and auto-restore when you return."
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
    "Leave this form? Your local draft will stay available and auto-restore when you return."
  );
}

export function useUnsavedChangesState(enabled = true) {
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const onInputLike = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const field = target.closest("input, textarea, select, [contenteditable='true']");
      if (!field) return;
      if (field.getAttribute("data-no-dirty-track") === "true") return;
      setIsDirty(true);
    };

    document.addEventListener("input", onInputLike, true);
    document.addEventListener("change", onInputLike, true);
    return () => {
      document.removeEventListener("input", onInputLike, true);
      document.removeEventListener("change", onInputLike, true);
    };
  }, [enabled]);

  return { isDirty, setIsDirty };
}

export function UnsavedChangesBanner({ isDirty }: { isDirty: boolean }) {
  if (!isDirty) return null;
  return createElement(
    "div",
    {
      style: {
        marginBottom: 12,
        padding: "8px 10px",
        borderRadius: 10,
        border: "1px solid rgba(255,190,100,0.45)",
        background: "rgba(255,190,100,0.14)",
        color: "inherit",
        fontSize: 12,
        fontWeight: 700,
      },
    },
    "Unsaved changes"
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
