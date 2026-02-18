"use client";

import { useEffect, useRef } from "react";

type VideoViewerModalProps = {
  isOpen: boolean;
  signedUrl: string | null;
  title?: string;
  onClose: () => void;
  contentId?: string;
};

const VIEW_LOG_DEBOUNCE_MS = 1200;

export default function VideoViewerModal({
  isOpen,
  signedUrl,
  title,
  onClose,
  contentId,
}: VideoViewerModalProps) {
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoggedAtRef = useRef(0);
  const activeUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeUrlRef.current !== signedUrl) {
      activeUrlRef.current = signedUrl;
      lastLoggedAtRef.current = 0;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    }
  }, [signedUrl]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  function logViewDebounced() {
    if (!signedUrl || !contentId) return;

    const now = Date.now();
    if (now - lastLoggedAtRef.current < VIEW_LOG_DEBOUNCE_MS) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      lastLoggedAtRef.current = Date.now();

      void fetch("/api/academy/view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_id: contentId,
        }),
      }).catch((error: unknown) => {
        console.error("[academy] failed to log video view:", error);
      });
    }, VIEW_LOG_DEBOUNCE_MS);
  }

  if (!isOpen || !signedUrl) return null;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || "Video Viewer"}
      >
        <div style={toolbarStyle}>
          <div style={{ fontWeight: 800 }}>{title || "Training Video"}</div>
          <button type="button" onClick={onClose} style={buttonStyle}>
            Close
          </button>
        </div>

        <div style={videoWrapStyle}>
          <video
            src={signedUrl}
            controls
            autoPlay
            controlsList="nodownload noplaybackrate noremoteplayback"
            disablePictureInPicture
            disableRemotePlayback
            onPlay={logViewDebounced}
            style={videoStyle}
          />
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.68)",
  zIndex: 1000,
  display: "grid",
  placeItems: "center",
  padding: 16,
};

const modalStyle: React.CSSProperties = {
  width: "min(1000px, 100%)",
  maxHeight: "92vh",
  display: "grid",
  gridTemplateRows: "auto 1fr",
  background: "rgba(18,20,22,0.98)",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 14,
  overflow: "hidden",
};

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  padding: 12,
  borderBottom: "1px solid rgba(255,255,255,0.12)",
};

const buttonStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.18)",
  background: "transparent",
  color: "inherit",
  borderRadius: 9,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const videoWrapStyle: React.CSSProperties = {
  padding: 12,
  overflow: "auto",
};

const videoStyle: React.CSSProperties = {
  width: "100%",
  maxHeight: "72vh",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 8,
  background: "#000",
};
