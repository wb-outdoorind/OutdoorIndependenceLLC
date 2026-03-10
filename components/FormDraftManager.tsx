"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { FORM_DRAFT_CLEAR_EVENT, FORM_DRAFT_SAVE_EVENT } from "@/lib/forms";

type TrackableElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

type StoredField =
  | { index: number; kind: "value"; value: string }
  | { index: number; kind: "checked"; checked: boolean }
  | { index: number; kind: "select-multiple"; values: string[] };

type StoredDraft = {
  version: 1;
  savedAt: string;
  fields: StoredField[];
};

const DRAFT_STORAGE_PREFIX = "oi:form-draft:v1:";

function shouldEnableForPath(pathname: string) {
  if (!pathname) return false;
  if (pathname === "/login" || pathname === "/change-password" || pathname.startsWith("/auth/")) {
    return false;
  }
  if (pathname.includes("/forms/")) return true;
  if (pathname.endsWith("/new")) return true;
  if (pathname === "/maintenance/pm/new") return true;
  return false;
}

function isTrackableInput(input: HTMLInputElement) {
  const type = input.type.toLowerCase();
  if (type === "hidden" || type === "submit" || type === "button") return false;
  if (type === "reset" || type === "image" || type === "file" || type === "password") return false;
  return true;
}

function isTrackableElement(el: TrackableElement) {
  if (el.closest("[data-no-draft='true']")) return false;
  if (el.hasAttribute("data-no-draft")) return false;
  if (el instanceof HTMLInputElement) return isTrackableInput(el);
  return true;
}

function collectTrackableElements() {
  const all = Array.from(document.querySelectorAll<TrackableElement>("input, textarea, select"));
  return all.filter((el) => isTrackableElement(el));
}

function dispatchFieldEvents(el: Element) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function setNativeTextValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const prototype = Object.getPrototypeOf(el) as Record<string, unknown>;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor?.set) {
    descriptor.set.call(el, value);
  } else {
    (el as { value: string }).value = value;
  }
}

function setNativeCheckedValue(el: HTMLInputElement, checked: boolean) {
  const prototype = Object.getPrototypeOf(el) as Record<string, unknown>;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "checked");
  if (descriptor?.set) {
    descriptor.set.call(el, checked);
  } else {
    el.checked = checked;
  }
}

function serializeDraft(): StoredDraft | null {
  const elements = collectTrackableElements();
  if (!elements.length) return null;

  const fields: StoredField[] = [];
  for (const [index, el] of elements.entries()) {
    if (el instanceof HTMLInputElement) {
      const type = el.type.toLowerCase();
      if (type === "checkbox" || type === "radio") {
        fields.push({ index, kind: "checked", checked: !!el.checked });
      } else {
        fields.push({ index, kind: "value", value: el.value ?? "" });
      }
      continue;
    }

    if (el instanceof HTMLSelectElement && el.multiple) {
      fields.push({
        index,
        kind: "select-multiple",
        values: Array.from(el.selectedOptions).map((option) => option.value),
      });
      continue;
    }

    fields.push({ index, kind: "value", value: el.value ?? "" });
  }

  return {
    version: 1,
    savedAt: new Date().toISOString(),
    fields,
  };
}

function applyDraft(draft: StoredDraft) {
  const elements = collectTrackableElements();
  for (const field of draft.fields) {
    const el = elements[field.index];
    if (!el) continue;

    if (field.kind === "checked") {
      if (el instanceof HTMLInputElement) {
        setNativeCheckedValue(el, field.checked);
        dispatchFieldEvents(el);
      }
      continue;
    }

    if (field.kind === "select-multiple") {
      if (el instanceof HTMLSelectElement) {
        const set = new Set(field.values);
        for (const option of Array.from(el.options)) {
          option.selected = set.has(option.value);
        }
        dispatchFieldEvents(el);
      }
      continue;
    }

    setNativeTextValue(el, field.value);
    dispatchFieldEvents(el);
  }
}

function formatSavedAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function FormDraftManager() {
  const pathname = usePathname() ?? "";
  const enabled = useMemo(() => shouldEnableForPath(pathname), [pathname]);
  const storageKey = useMemo(() => `${DRAFT_STORAGE_PREFIX}${pathname}`, [pathname]);

  const restoredKeyRef = useRef<string>("");
  const saveTimerRef = useRef<number | null>(null);
  const [hasTrackableFields, setHasTrackableFields] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!enabled) return;

    const update = () => {
      setHasTrackableFields(collectTrackableElements().length > 0);
      setHasDraft(Boolean(window.localStorage.getItem(storageKey)));
    };

    update();
    const observer = new MutationObserver(() => update());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [enabled, storageKey]);

  useEffect(() => {
    if (!enabled || !hasTrackableFields) return;
    if (restoredKeyRef.current === storageKey) return;
    restoredKeyRef.current = storageKey;

    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as StoredDraft;
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.fields)) return;
      applyDraft(parsed);
      const at = formatSavedAt(parsed.savedAt);
      window.setTimeout(() => {
        setStatusText(at ? `Draft restored (${at})` : "Draft restored");
      }, 0);
    } catch (error) {
      console.error("Failed to restore local form draft:", error);
    }
  }, [enabled, hasTrackableFields, storageKey]);

  useEffect(() => {
    if (!enabled || !hasTrackableFields) return;

    const saveNow = (manual = false) => {
      const snapshot = serializeDraft();
      if (!snapshot) return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
        setHasDraft(true);
        setSaveError("");
        if (manual) {
          const at = formatSavedAt(snapshot.savedAt);
          setStatusText(at ? `Draft saved (${at})` : "Draft saved");
        }
      } catch (error) {
        console.error("Failed to save local form draft:", error);
        setSaveError("Draft save failed: local storage is full or blocked on this device.");
        if (manual) {
          setStatusText("Draft save failed");
        }
      }
    };

    const clearNow = (manual = false) => {
      window.localStorage.removeItem(storageKey);
      setHasDraft(false);
      setSaveError("");
      if (manual) setStatusText("Draft cleared");
    };

    const scheduleSave = () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => saveNow(false), 350);
    };

    const onInputLike = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const field = target.closest("input, textarea, select");
      if (!field) return;
      const fieldElement = field as TrackableElement;
      if (!isTrackableElement(fieldElement)) return;
      scheduleSave();
    };

    const onPageHide = () => saveNow(false);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") saveNow(false);
    };
    const onManualSave = () => saveNow(true);
    const onManualClear = () => clearNow(true);

    window.addEventListener("beforeunload", onPageHide);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(FORM_DRAFT_SAVE_EVENT, onManualSave);
    window.addEventListener(FORM_DRAFT_CLEAR_EVENT, onManualClear);
    document.addEventListener("input", onInputLike, true);
    document.addEventListener("change", onInputLike, true);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      window.removeEventListener("beforeunload", onPageHide);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(FORM_DRAFT_SAVE_EVENT, onManualSave);
      window.removeEventListener(FORM_DRAFT_CLEAR_EVENT, onManualClear);
      document.removeEventListener("input", onInputLike, true);
      document.removeEventListener("change", onInputLike, true);
    };
  }, [enabled, hasTrackableFields, storageKey]);

  useEffect(() => {
    if (!statusText) return;
    const timer = window.setTimeout(() => setStatusText(""), 3500);
    return () => window.clearTimeout(timer);
  }, [statusText]);

  if (!enabled || !hasTrackableFields) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: "max(16px, env(safe-area-inset-bottom))",
        zIndex: 1200,
        display: "grid",
        gap: 8,
        justifyItems: "end",
      }}
    >
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(FORM_DRAFT_SAVE_EVENT))}
          style={{
            border: "1px solid rgba(126,255,167,0.45)",
            borderRadius: 10,
            padding: "8px 12px",
            background: "rgba(126,255,167,0.14)",
            color: "inherit",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Save Draft
        </button>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(FORM_DRAFT_CLEAR_EVENT))}
          disabled={!hasDraft}
          style={{
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 10,
            padding: "8px 12px",
            background: "rgba(255,255,255,0.06)",
            color: "inherit",
            fontWeight: 700,
            cursor: hasDraft ? "pointer" : "not-allowed",
            opacity: hasDraft ? 1 : 0.6,
          }}
        >
          Clear Draft
        </button>
      </div>
      {saveError ? (
        <div
          style={{
            border: "1px solid rgba(255,120,120,0.4)",
            borderRadius: 8,
            padding: "6px 10px",
            background: "rgba(64,14,14,0.8)",
            fontSize: 12,
            fontWeight: 700,
            color: "#ffd5d5",
            maxWidth: 320,
          }}
        >
          {saveError}
        </div>
      ) : null}
      {statusText ? (
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.16)",
            borderRadius: 8,
            padding: "6px 10px",
            background: "rgba(0,0,0,0.68)",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {statusText}
        </div>
      ) : null}
    </div>
  );
}
