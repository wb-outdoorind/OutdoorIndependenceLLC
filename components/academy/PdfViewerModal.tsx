"use client";

import { useEffect, useRef, useState } from "react";

type PdfViewerModalProps = {
  isOpen: boolean;
  signedUrl: string | null;
  title?: string;
  onClose: () => void;
};

type PDFDocumentProxy = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PDFPageProxy>;
};

type PDFPageProxy = {
  getViewport: (params: { scale: number }) => { width: number; height: number };
  render: (params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void> };
};

type PDFJsLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: string) => { promise: Promise<PDFDocumentProxy> };
};

declare global {
  interface Window {
    pdfjsLib?: PDFJsLib;
  }
}

let pdfJsPromise: Promise<PDFJsLib> | null = null;

function loadPdfJs(): Promise<PDFJsLib> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("PDF viewer is only available in the browser."));
  }

  if (window.pdfjsLib) {
    return Promise.resolve(window.pdfjsLib);
  }

  if (pdfJsPromise) {
    return pdfJsPromise;
  }

  pdfJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.js";
    script.async = true;
    script.onload = () => {
      const lib = window.pdfjsLib;
      if (!lib) {
        reject(new Error("Failed to initialize PDF.js."));
        return;
      }
      lib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js";
      resolve(lib);
    };
    script.onerror = () => reject(new Error("Failed to load PDF.js script."));
    document.body.appendChild(script);
  });

  return pdfJsPromise;
}

export default function PdfViewerModal({ isOpen, signedUrl, title, onClose }: PdfViewerModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !signedUrl) {
      setDoc(null);
      setNumPages(0);
      setPage(1);
      setErrorMessage(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const pdfjs = await loadPdfJs();
        const loadedDoc = await pdfjs.getDocument(signedUrl).promise;
        if (cancelled) return;
        setDoc(loadedDoc);
        setNumPages(loadedDoc.numPages);
        setPage(1);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to load PDF.";
        setErrorMessage(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, signedUrl]);

  useEffect(() => {
    if (!isOpen || !doc || !canvasRef.current) return;

    let cancelled = false;

    void (async () => {
      try {
        const pageDoc = await doc.getPage(page);
        if (cancelled || !canvasRef.current) return;

        const viewport = pageDoc.getViewport({ scale: 1.35 });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) {
          setErrorMessage("Unable to render PDF page.");
          return;
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await pageDoc.render({ canvasContext: context, viewport }).promise;
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to render PDF page.";
        setErrorMessage(message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, isOpen, page]);

  if (!isOpen || !signedUrl) return null;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title || "PDF Viewer"}>
        <div style={toolbarStyle}>
          <div style={{ fontWeight: 800 }}>{title || "Document"}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading || !!errorMessage}
              style={buttonStyle}
            >
              Prev
            </button>
            <div style={{ minWidth: 70, textAlign: "center", fontSize: 13 }}>
              {numPages > 0 ? `${page} / ${numPages}` : "- / -"}
            </div>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(numPages || 1, p + 1))}
              disabled={numPages === 0 || page >= numPages || loading || !!errorMessage}
              style={buttonStyle}
            >
              Next
            </button>
            <button type="button" onClick={onClose} style={buttonStyle}>
              Close
            </button>
          </div>
        </div>

        <div style={viewerWrapStyle}>
          {loading ? <div style={{ opacity: 0.75 }}>Loading PDF...</div> : null}
          {errorMessage ? <div style={{ color: "#ffb0b0" }}>{errorMessage}</div> : null}
          {!loading && !errorMessage ? (
            <div style={{ position: "relative", width: "100%", display: "grid", placeItems: "center" }}>
              <canvas ref={canvasRef} style={{ maxWidth: "100%", height: "auto", borderRadius: 8 }} />
              <div
                style={rightClickBlockerStyle}
                onContextMenu={(e) => {
                  e.preventDefault();
                }}
                onMouseDown={(e) => {
                  if (e.button === 2) e.preventDefault();
                }}
                aria-hidden="true"
              />
            </div>
          ) : null}
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

const viewerWrapStyle: React.CSSProperties = {
  padding: 12,
  overflow: "auto",
  display: "grid",
  placeItems: "start center",
};

const rightClickBlockerStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "transparent",
  cursor: "default",
};
