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

  async function findRouteByQr(rawValue: string) {
    const supabase = createSupabaseBrowser();
    const qrTrimmed = rawValue.trim();
    const qrLower = qrTrimmed.toLowerCase();
    if (!qrTrimmed) return null;

    let lastSegment: string | null = null;
    try {
      const u = new URL(rawValue);
      const pathParts = u.pathname.split("/").filter(Boolean);
      lastSegment = pathParts.length ? decodeURIComponent(pathParts[pathParts.length - 1]) : null;
    } catch {
      // not a URL; no last segment
    }

    console.log("[scan] barcode.rawValue:", rawValue);
    console.log("[scan] qrTrimmed:", qrTrimmed);
    console.log("[scan] qrLower:", qrLower);
    if (lastSegment) {
      console.log("[scan] lastSegment:", lastSegment);
    }

    // 1) vehicles exact on id
    const vehicleById = await supabase
      .from("vehicles")
      .select("id")
      .eq("id", qrTrimmed)
      .limit(1)
      .maybeSingle();
    console.log("[scan] vehicles eq(id, qrTrimmed) found:", Boolean(vehicleById.data?.id));
    console.log("[scan] vehicles eq(id, qrTrimmed) error:", vehicleById.error);
    if (vehicleById.data?.id) {
      console.log("[scan] matched vehicle by id", { id: vehicleById.data.id });
      return { kind: "vehicle" as const, id: vehicleById.data.id };
    }

    // 2) equipment exact on id
    const equipmentById = await supabase
      .from("equipment")
      .select("id")
      .eq("id", qrTrimmed)
      .limit(1)
      .maybeSingle();
    console.log("[scan] equipment eq(id, qrTrimmed) found:", Boolean(equipmentById.data?.id));
    console.log("[scan] equipment eq(id, qrTrimmed) error:", equipmentById.error);
    if (equipmentById.data?.id) {
      console.log("[scan] matched equipment by id", { id: equipmentById.data.id });
      return { kind: "equipment" as const, id: equipmentById.data.id };
    }

    // 3) vehicles exact on asset (fallback)
    const vehicleAssetExact = await supabase
      .from("vehicles")
      .select("id")
      .eq("asset", qrTrimmed)
      .limit(1)
      .maybeSingle();
    console.log("[scan] vehicles eq(asset, qrTrimmed) found:", Boolean(vehicleAssetExact.data?.id));
    console.log("[scan] vehicles eq(asset, qrTrimmed) error:", vehicleAssetExact.error);
    if (vehicleAssetExact.data?.id) {
      console.log("[scan] matched vehicle by asset exact", { id: vehicleAssetExact.data.id });
      return { kind: "vehicle" as const, id: vehicleAssetExact.data.id };
    }

    // 4) vehicles ilike on asset (fallback)
    const vehicleAssetIlike = await supabase
      .from("vehicles")
      .select("id")
      .ilike("asset", qrTrimmed)
      .limit(1)
      .maybeSingle();
    console.log("[scan] vehicles ilike(asset, qrTrimmed) found:", Boolean(vehicleAssetIlike.data?.id));
    console.log("[scan] vehicles ilike(asset, qrTrimmed) error:", vehicleAssetIlike.error);
    if (vehicleAssetIlike.data?.id) {
      console.log("[scan] matched vehicle by asset ilike", { id: vehicleAssetIlike.data.id });
      return { kind: "vehicle" as const, id: vehicleAssetIlike.data.id };
    }

    // 5) vehicles ilike on lastSegment when QR is URL
    if (lastSegment) {
      const vehicleLastSegment = await supabase
        .from("vehicles")
        .select("id")
        .ilike("asset", lastSegment)
        .limit(1)
        .maybeSingle();
      console.log("[scan] vehicles ilike(asset, lastSegment) found:", Boolean(vehicleLastSegment.data?.id));
      console.log("[scan] vehicles ilike(asset, lastSegment) error:", vehicleLastSegment.error);
      if (vehicleLastSegment.data?.id) {
        console.log("[scan] matched vehicle lastSegment", { id: vehicleLastSegment.data.id });
        return { kind: "vehicle" as const, id: vehicleLastSegment.data.id };
      }
    }

    // 6) equipment exact on asset_qr
    const equipmentExact = await supabase
      .from("equipment")
      .select("id")
      .eq("asset_qr", qrTrimmed)
      .limit(1)
      .maybeSingle();
    console.log("[scan] equipment eq(asset_qr, qrTrimmed) found:", Boolean(equipmentExact.data?.id));
    console.log("[scan] equipment eq(asset_qr, qrTrimmed) error:", equipmentExact.error);
    if (equipmentExact.data?.id) {
      console.log("[scan] matched equipment exact", { id: equipmentExact.data.id });
      return { kind: "equipment" as const, id: equipmentExact.data.id };
    }

    // 7) equipment ilike on asset_qr
    const equipmentIlike = await supabase
      .from("equipment")
      .select("id")
      .ilike("asset_qr", qrTrimmed)
      .limit(1)
      .maybeSingle();
    console.log("[scan] equipment ilike(asset_qr, qrTrimmed) found:", Boolean(equipmentIlike.data?.id));
    console.log("[scan] equipment ilike(asset_qr, qrTrimmed) error:", equipmentIlike.error);
    if (equipmentIlike.data?.id) {
      console.log("[scan] matched equipment ilike", { id: equipmentIlike.data.id });
      return { kind: "equipment" as const, id: equipmentIlike.data.id };
    }

    // 8) equipment ilike on lastSegment when QR is URL
    if (lastSegment) {
      const equipmentLastSegment = await supabase
        .from("equipment")
        .select("id")
        .ilike("asset_qr", lastSegment)
        .limit(1)
        .maybeSingle();
      console.log("[scan] equipment ilike(asset_qr, lastSegment) found:", Boolean(equipmentLastSegment.data?.id));
      console.log("[scan] equipment ilike(asset_qr, lastSegment) error:", equipmentLastSegment.error);
      if (equipmentLastSegment.data?.id) {
        console.log("[scan] matched equipment lastSegment", { id: equipmentLastSegment.data.id });
        return { kind: "equipment" as const, id: equipmentLastSegment.data.id };
      }
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
              const rawValue = barcodes[0].rawValue ?? "";
              const qrTrimmed = rawValue.trim();
              const qrLower = qrTrimmed.toLowerCase();
              console.log("[scan] detected barcode.rawValue:", rawValue);
              console.log("[scan] detected qrTrimmed:", qrTrimmed);
              console.log("[scan] detected qrLower:", qrLower);

              if (!qrTrimmed) {
                rafId = requestAnimationFrame(tick);
                return;
              }

              setResult(qrTrimmed);
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
