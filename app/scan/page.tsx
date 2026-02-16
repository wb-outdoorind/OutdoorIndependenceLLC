"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type DetectedBarcode = { rawValue?: string };
type BarcodeDetectorLike = {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;
type BrowserWithBarcodeDetector = Window & { BarcodeDetector?: BarcodeDetectorCtor };

export default function ScanPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<string>("Starting camera…");
  const [result, setResult] = useState<string>("");
  const [supported, setSupported] = useState<boolean>(true);
  const router = useRouter();


  async function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  useEffect(() => {
    let rafId = 0;
    let detector: BarcodeDetectorLike | null = null;

    async function start() {
      // BarcodeDetector support check
      const hasDetector =
        typeof window !== "undefined" &&
        "BarcodeDetector" in window;

      if (!hasDetector) {
        setSupported(false);
        setStatus("QR scanning not supported in this browser.");
        return;
      }

      try {
        const detectorCtor = (window as BrowserWithBarcodeDetector).BarcodeDetector;
        if (!detectorCtor) {
          setSupported(false);
          setStatus("QR scanning not supported in this browser.");
          return;
        }
        detector = new detectorCtor({ formats: ["qr_code"] });

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });

        streamRef.current = stream;

        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        setStatus("Point your camera at a QR code…");

        const tick = async () => {
          if (!videoRef.current || result) return;

          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes?.length) {
              const rawValue = (barcodes[0].rawValue ?? "").trim();

                // Accept either:
                // 1) a plain vehicleId like "TRK-102"
                // 2) a full URL that ends with /vehicles/<id> or contains it
                let vehicleId = rawValue;

                try {
                const url = new URL(rawValue);
                const parts = url.pathname.split("/").filter(Boolean);
                const vehiclesIndex = parts.indexOf("vehicles");
                if (vehiclesIndex !== -1 && parts[vehiclesIndex + 1]) {
                    vehicleId = parts[vehiclesIndex + 1];
                }
                } catch {
                // not a URL, treat as plain ID
                }

                setResult(rawValue);
                setStatus("✅ Scanned! Routing to vehicle…");
                await stopCamera();

                // route to the vehicle detail page
                router.push(`/vehicles/${encodeURIComponent(vehicleId)}`);
                return;

            }
          } catch {
            // ignore detect errors; keep scanning
          }

          rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
      } catch (e: unknown) {
        const errorName = e instanceof Error ? e.name : "";
        setStatus(
          errorName === "NotAllowedError"
            ? "Camera permission denied. Allow camera access and refresh."
            : "Could not start camera."
        );
      }
    }

    start();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isUrl = (() => {
    try {
      const u = new URL(result);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  })();

  return (
    <main style={{ padding: 32, maxWidth: 800, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Scan QR Code</h1>
        <Link href="/" style={{ alignSelf: "center" }}>
          ← Back to Home
        </Link>
      </div>

      <p style={{ opacity: 0.8 }}>{status}</p>

      {!supported ? (
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 14,
            padding: 16,
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <p style={{ marginTop: 0 }}>
            Your browser doesn’t support built-in QR scanning.
          </p>
          <p style={{ marginBottom: 0 }}>
            If you want, we can add a fallback library (works on iPhone too).
          </p>
        </div>
      ) : (
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 14,
            overflow: "hidden",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </div>
      )}

      {result ? (
        <div
          style={{
            marginTop: 16,
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 14,
            padding: 16,
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Result</div>
          <div style={{ wordBreak: "break-word" }}>{result}</div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => navigator.clipboard.writeText(result)}
              style={{ padding: "10px 12px" }}
            >
              Copy
            </button>

            {isUrl ? (
              <a href={result} style={{ padding: "10px 12px", display: "inline-block" }}>
                Open Link →
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
