"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type CopilotContext = {
  route: string;
  pageTitle: string;
  assetType: string | null;
  assetId: string | null;
  formType: string | null;
  payload: Record<string, unknown>;
};

function inferAssetType(pathname: string) {
  if (pathname.includes("/vehicles/")) return "vehicle";
  if (pathname.includes("/equipment/")) return "equipment";
  if (pathname.includes("/inventory/")) return "inventory";
  return null;
}

function inferAssetId(pathname: string) {
  const match = pathname.match(/^\/(?:vehicles|equipment|inventory)\/([^/]+)/);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

function inferFormType(pathname: string) {
  const match = pathname.match(/\/forms\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function buildContext(route: string, pathname: string): CopilotContext {
  const pageTitle = typeof document !== "undefined" ? document.title || "App" : "App";
  const h1 = typeof document !== "undefined" ? document.querySelector("h1")?.textContent?.trim() ?? "" : "";

  return {
    route,
    pageTitle,
    assetType: inferAssetType(pathname),
    assetId: inferAssetId(pathname),
    formType: inferFormType(pathname),
    payload: {
      heading: h1 || null,
      viewport:
        typeof window !== "undefined"
          ? { width: window.innerWidth, height: window.innerHeight }
          : null,
      timestamp: new Date().toISOString(),
      pathname,
    },
  };
}

export default function CopilotBubble() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const route = useMemo(() => (search ? `${pathname}?${search}` : pathname), [pathname, search]);

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [sessionNote, setSessionNote] = useState("");
  const [contextSavedAt, setContextSavedAt] = useState<string | null>(null);
  const lastRouteSentRef = useRef<string>("");

  const context = useMemo(() => buildContext(route, pathname), [route, pathname]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const res = await fetch("/api/copilot/access", { method: "GET" });
      if (!active) return;
      if (!res.ok) {
        setAllowed(false);
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { allowed?: boolean };
      setAllowed(json.allowed === true);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (allowed !== true) return;
    if (lastRouteSentRef.current === route) return;
    lastRouteSentRef.current = route;

    void (async () => {
      const res = await fetch("/api/copilot/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(context),
      });
      if (!res.ok) return;
      setContextSavedAt(new Date().toLocaleTimeString());
    })();
  }, [allowed, route, context]);

  async function onSendPrompt() {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setBusy(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/copilot/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmed,
          context,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        response?: string;
        error?: string;
      };

      if (!res.ok) {
        setErrorMessage(json.error || "Copilot request failed.");
        return;
      }

      setResponse(json.response || "No response returned.");
      setContextSavedAt(new Date().toLocaleTimeString());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Copilot request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onSyncSessionNote() {
    const trimmed = sessionNote.trim();
    if (!trimmed) return;

    setSyncBusy(true);
    setSyncErrorMessage(null);
    try {
      const res = await fetch("/api/copilot/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...context,
          payload: {
            ...context.payload,
            kind: "session_summary",
            source: "manual_chat_sync",
            summary: trimmed.slice(0, 2000),
          },
        }),
      });

      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSyncErrorMessage(json.error || "Session sync failed.");
        return;
      }

      setSessionNote("");
      setContextSavedAt(new Date().toLocaleTimeString());
    } catch (error) {
      setSyncErrorMessage(error instanceof Error ? error.message : "Session sync failed.");
    } finally {
      setSyncBusy(false);
    }
  }

  if (allowed !== true) return null;

  return (
    <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 1600 }}>
      {open ? (
        <div
          style={{
            width: 360,
            maxWidth: "calc(100vw - 24px)",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(8,10,14,0.96)",
            boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
            padding: 12,
            color: "var(--foreground)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div style={{ fontWeight: 900, fontSize: 14 }}>Edit Copilot</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 8,
                background: "rgba(255,255,255,0.04)",
                color: "inherit",
                padding: "4px 8px",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              Close
            </button>
          </div>

          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.78, lineHeight: 1.35 }}>
            Context auto-attached: <code>{context.route}</code>
            {context.assetId ? (
              <>
                <br />
                Asset: {context.assetType} {context.assetId}
              </>
            ) : null}
            {contextSavedAt ? (
              <>
                <br />
                Last context sync: {contextSavedAt}
              </>
            ) : null}
          </div>

          <textarea
            value={sessionNote}
            onChange={(e) => setSessionNote(e.target.value)}
            placeholder="Paste key chat/session notes to sync this context across devices..."
            style={{
              width: "100%",
              marginTop: 10,
              minHeight: 64,
              resize: "vertical",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(255,255,255,0.03)",
              color: "inherit",
              padding: 10,
              fontSize: 12,
            }}
          />

          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => void onSyncSessionNote()}
              disabled={syncBusy || !sessionNote.trim()}
              style={{
                border: "1px solid rgba(144,190,255,0.4)",
                borderRadius: 10,
                background: "rgba(21,54,106,0.45)",
                color: "#eaf3ff",
                fontWeight: 800,
                padding: "7px 11px",
                cursor: syncBusy ? "default" : "pointer",
                opacity: syncBusy || !sessionNote.trim() ? 0.72 : 1,
                fontSize: 12,
              }}
            >
              {syncBusy ? "Syncing..." : "Sync Session Note"}
            </button>
          </div>

          {syncErrorMessage ? (
            <div style={{ marginTop: 8, color: "#ffb3b3", fontSize: 12 }}>{syncErrorMessage}</div>
          ) : null}

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask for edits using the current screen context..."
            style={{
              width: "100%",
              marginTop: 10,
              minHeight: 94,
              resize: "vertical",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(255,255,255,0.03)",
              color: "inherit",
              padding: 10,
              fontSize: 13,
            }}
          />

          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => void onSendPrompt()}
              disabled={busy}
              style={{
                border: "1px solid rgba(126,255,167,0.42)",
                borderRadius: 10,
                background: "rgba(16,90,44,0.5)",
                color: "#e9ffef",
                fontWeight: 800,
                padding: "8px 12px",
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.72 : 1,
              }}
            >
              {busy ? "Sending..." : "Send"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPrompt("");
                setResponse("");
                setErrorMessage(null);
              }}
              style={{
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 10,
                background: "rgba(255,255,255,0.04)",
                color: "inherit",
                fontWeight: 700,
                padding: "8px 10px",
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          </div>

          {errorMessage ? (
            <div style={{ marginTop: 10, color: "#ffb3b3", fontSize: 12 }}>{errorMessage}</div>
          ) : null}

          {response ? (
            <div
              style={{
                marginTop: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: 10,
                padding: 10,
                background: "rgba(255,255,255,0.03)",
                fontSize: 13,
                lineHeight: 1.4,
                whiteSpace: "pre-wrap",
              }}
            >
              {response}
            </div>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.22)",
            background: "rgba(9,12,18,0.94)",
            color: "var(--foreground)",
            padding: "10px 14px",
            fontWeight: 900,
            fontSize: 14,
            cursor: "pointer",
            boxShadow: "0 14px 34px rgba(0,0,0,0.4)",
          }}
          aria-label="Open Edit Copilot"
        >
          Edit
        </button>
      )}
    </div>
  );
}
