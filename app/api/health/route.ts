import { NextResponse } from "next/server";
import packageJson from "@/package.json";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "outdoor-independence-operations-app",
    version: packageJson.version,
    timestamp: new Date().toISOString(),
  });
}
