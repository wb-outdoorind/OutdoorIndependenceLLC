"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type DetectedBarcode = { rawValue?: string };
type BarcodeDetectorLike = {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;
type BrowserWithBarcodeDetector = Window & { BarcodeDetector?: BarcodeDetectorCtor };

export default function ScanPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<string>("Starting camera...");
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

  function parseDirectRoute(rawValue: string) {
    const trimmed = rawValue.trim();

    try {
      const url = new URL(trimmed);
      const parts = url.pathname.split("/").filter(Boolean);
      const vehiclesIndex = parts.indexOf("vehicles");
      if (vehiclesIndex !== -1 && parts[vehiclesIndex + 1]) {
        return { kind: "vehicle" as const, id: decodeURIComponent(parts[vehiclesIndex + 1]) };
      }

      const equipmentIndex = parts.indexOf("equipment");
      if (equipmentIndex !== -1 && parts[equipmentIndex + 1]) {
        return { kind: "equipment" as const, id: decodeURIComponent(parts[equipmentIndex + 1]) };
      }
    } catch {
      // not a URL
    }

    return null;
  }

  async function findRouteByQr(rawValue: string) {
    const supabase = createSupabaseBrowser();

    const direct = parseDirectRoute(rawValue);
    if (direct) return direct;

    const lookup = rawValue.trim();
    if (!lookup) return null;

    // 1) vehicles by asset_qr (preferred)
    const vehicleByAssetQr = await supabase
      .from("vehicles")
      .select("id")
      .eq("asset_qr", lookup)
      .limit(1)
      .maybeSingle();

    if (vehicleByAssetQr.data?.id) {
      return { kind: "vehicle" as const, id: vehicleByAssetQr.data.id };
    }

    if (vehicleByAssetQr.error) {
      // fallback for legacy schema that may still use 'asset'
      const vehicleByAsset = await supabase
        .from("vehicles")
        .select("id")
        .eq("asset", lookup)
        .limit(1)
        .maybeSingle();

      if (vehicleByAsset.data?.id) {
        return { kind: "vehicle" as const, id: vehicleByAsset.data.id };
      }
    }

    // 2) equipment by asset_qr
    const equipmentByAssetQr = await supabase
      .from("equipment")
      .select("id")
      .eq("asset_qr", lookup)
      .limit(1)
      .maybeSingle();

    if (equipmentByAssetQr.data?.id) {
      return { kind: "equipment" as const, id: equipmentByAssetQr.data.id };
    }

    return null;
  }

  useEffect(() => {
    let rafId = 0;
    let detector: BarcodeDetectorLike | null = null;

    async function start() {
      const hasDetector = typeof window !== "undefined" && "BarcodeDetector" in window;

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

        setStatus("Point your camera at a QR code...");

        const tick = async () => {
          if (!videoRef.current || result) return;
          if (!detector) return;

          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes?.length) {
              const rawValue = (barcodes[0].rawValue ?? "").trim();
              if (!rawValue) {
                rafId = requestAnimationFrame(tick);
                return;
              }

              setResult(rawValue);
              setStatus("Scanned. Looking up asset...");

              const route = await findRouteByQr(rawValue);
              await stopCamera();

              if (route?.kind === "vehicle") {
                setStatus("Scanned vehicle. Routing...");
                router.push(`/vehicles/${encodeURIComponent(route.id)}`);
                return;
              }

              if (route?.kind === "equipment") {
                setStatus("Scanned equipment. Routing...");
                router.push(`/equipment/${encodeURIComponent(route.id)}`);
                return;
              }

              setStatus("QR scanned, but no matching vehicle/equipment asset was found.");
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
          <p style={{ marginTop: 0 }}>Your browser doesn’t support built-in QR scanning.</p>
          <p style={{ marginBottom: 0 }}>If needed, we can add a fallback scanning library.</p>
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
            <button onClick={() => navigator.clipboard.writeText(result)} style={{ padding: "10px 12px" }}>
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
