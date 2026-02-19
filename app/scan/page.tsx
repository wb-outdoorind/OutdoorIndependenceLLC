"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

    async function handleScanned(rawValue: string) {
      const qrTrimmed = rawValue.trim();
      if (!qrTrimmed) return false;

      setResult(qrTrimmed);
      setStatus("Scanned. Looking up asset...");

      const route = await findRouteByQr(rawValue);
      await stopCamera();

      if (route?.kind === "vehicle") {
        setStatus("Scanned vehicle. Routing...");
        router.push(`/vehicles/${encodeURIComponent(route.id)}`);
        return true;
      }

      if (route?.kind === "equipment") {
        setStatus("Scanned equipment. Routing...");
        router.push(`/equipment/${encodeURIComponent(route.id)}`);
        return true;
      }

      setStatus("QR scanned, but no matching vehicle/equipment asset was found.");
      return true;
    }

    async function start() {
      const hasDetector = typeof window !== "undefined" && "BarcodeDetector" in window;

      try {
        if (hasDetector) {
          const detectorCtor = (window as BrowserWithBarcodeDetector).BarcodeDetector;
          if (detectorCtor) {
            detector = new detectorCtor({ formats: ["qr_code"] });
            setStatus("Point your camera at a QR code...");
          }
        } else {
          setStatus("Point your camera at a QR code... (fallback scanner)");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });

        streamRef.current = stream;

        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const tick = async () => {
          if (!videoRef.current || result) return;
          if (videoRef.current.readyState < 2) {
            rafId = requestAnimationFrame(tick);
            return;
          }

          try {
            let rawValue = "";

            if (detector) {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes?.length) {
                rawValue = barcodes[0].rawValue ?? "";
              }
            } else {
              const video = videoRef.current;
              const canvas = canvasRef.current;
              if (canvas && video.videoWidth > 0 && video.videoHeight > 0) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext("2d", { willReadFrequently: true });
                if (ctx) {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                  const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "dontInvert",
                  });
                  rawValue = code?.data ?? "";
                }
              }
            }

            if (rawValue.trim()) {
              await handleScanned(rawValue);
              return;
            }
          } catch {
            // ignore detect errors; keep scanning
          }

          rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
      } catch (e: unknown) {
        setSupported(false);
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
    <main
      style={{
        padding: "calc(40px + env(safe-area-inset-top)) 20px 28px 8px",
        maxWidth: 920,
        margin: "0 auto",
        minHeight: "100vh",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <Image
          src="/App_Logo.png"
          alt="Outdoor Independence logo"
          width={300}
          height={56}
          className="brand-logo"
          style={{ height: 56, width: "auto", objectFit: "contain" }}
        />
        <Link href="/" style={topLinkStyle}>
          Back Home
        </Link>
      </div>

      <section style={panelStyle}>
        <h1 style={{ marginTop: 0, marginBottom: 8 }}>Scan QR Code</h1>
        <p style={{ opacity: 0.8, marginTop: 0 }}>{status}</p>

        {!supported ? (
          <div style={cardStyle}>
            <p style={{ marginTop: 0 }}>Could not start camera on this device/browser.</p>
            <p style={{ marginBottom: 0 }}>Allow camera permission and reload this page.</p>
          </div>
        ) : (
          <div style={cameraFrameStyle}>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{ width: "100%", height: "auto", display: "block" }}
            />
            <canvas ref={canvasRef} style={{ display: "none" }} />
          </div>
        )}

        {result ? (
          <div style={{ ...cardStyle, marginTop: 16 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Result</div>
            <div style={{ wordBreak: "break-word" }}>{result}</div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => navigator.clipboard.writeText(result)} style={actionButtonStyle}>
                Copy
              </button>

              {isUrl ? (
                <a href={result} style={{ ...actionButtonStyle, textDecoration: "none", display: "inline-block" }}>
                  Open Link →
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

const panelStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 16,
  padding: 16,
  background: "rgba(255,255,255,0.03)",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 14,
  padding: 16,
  background: "rgba(255,255,255,0.03)",
};

const cameraFrameStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 14,
  overflow: "hidden",
  background: "rgba(255,255,255,0.03)",
};

const topLinkStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  textDecoration: "none",
  fontWeight: 800,
};

const actionButtonStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};
