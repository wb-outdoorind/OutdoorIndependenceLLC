import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";
import { canAccessRoute } from "@/lib/routeAccess";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ChemicalInput = {
  productId?: string;
  chemicalName?: string;
  epaRegistrationNumber?: string;
  batchLotNumber?: string;
  concentration?: string;
  targetPest?: string;
  totalApplied?: number | string | null;
  units?: string;
  applicationAreaSqft?: number | string | null;
  applicationRate?: string;
  reentryIntervalPpeNotes?: string;
};

type SubmitBody = {
  propertyId?: string;
  applicatorName?: string;
  applicatorLicenseNumber?: string;
  serviceDate?: string;
  startTime?: string;
  endTime?: string;
  weatherTemperatureF?: number | string | null;
  weatherWindSpeedMph?: number | string | null;
  weatherWindDirection?: string;
  weatherConditions?: string;
  weatherObservedAt?: string;
  weatherSource?: string;
  equipmentUsed?: string[];
  signatureMode?: "typed" | "drawn";
  typedLegalSignature?: string;
  drawnSignatureData?: string;
  chemicals?: ChemicalInput[];
};

type PropertyRow = {
  id: string;
  client_id: string;
  property_name: string;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state: string;
  postal_code: string;
  lawn_sqft: number | string;
  lawn_acres: number | string;
};

type ClientRow = {
  id: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  email: string | null;
};

type RecordInsertRow = {
  id: string;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNullable(value: unknown) {
  const next = asString(value);
  return next.length ? next : null;
}

function asDateOrNull(value: unknown) {
  const next = asString(value);
  if (!next) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : null;
}

function asTimeOrNull(value: unknown) {
  const next = asString(value);
  if (!next) return null;
  return /^\d{2}:\d{2}(:\d{2})?$/.test(next) ? next : null;
}

function asNumberOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function asTimestampOrNull(value: unknown) {
  const next = asString(value);
  if (!next) return null;
  const time = new Date(next).getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
}

function asStringList(value: unknown, maxItems = 30) {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const next = asString(item);
    if (!next) continue;
    if (out.includes(next)) continue;
    out.push(next);
    if (out.length >= maxItems) break;
  }
  return out;
}

function fullClientName(client: ClientRow) {
  return [asString(client.first_name), asString(client.middle_name), asString(client.last_name)]
    .filter(Boolean)
    .join(" ");
}

function wrapText(line: string, maxLength = 90) {
  const words = line.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const out: string[] = [];
  let current = words[0] ?? "";
  for (const word of words.slice(1)) {
    if ((current + " " + word).length <= maxLength) {
      current += ` ${word}`;
    } else {
      out.push(current);
      current = word;
    }
  }
  out.push(current);
  return out;
}

async function buildServicePdf(params: {
  recordId: string;
  property: PropertyRow;
  client: ClientRow | null;
  applicatorName: string;
  applicatorLicense: string;
  serviceDate: string | null;
  startTime: string | null;
  endTime: string | null;
  weatherTemperatureF: number | null;
  weatherWindSpeedMph: number | null;
  weatherWindDirection: string | null;
  weatherConditions: string | null;
  weatherObservedAt: string | null;
  weatherSource: string | null;
  equipmentUsed: string[];
  chemicals: Array<{
    chemicalName: string;
    epaRegistrationNumber: string | null;
    batchLotNumber: string | null;
    concentration: string | null;
    targetPest: string | null;
    totalApplied: number | null;
    units: string | null;
    applicationAreaSqft: number | null;
    applicationRate: string | null;
    reentryIntervalPpeNotes: string | null;
  }>;
  signatureText: string;
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);
  const margin = 42;
  let y = 760;

  function drawText(text: string, options?: { size?: number; bold?: boolean; color?: [number, number, number] }) {
    page.drawText(text, {
      x: margin,
      y,
      size: options?.size ?? 10,
      font: options?.bold ? bold : font,
      color: options?.color ? rgb(options.color[0], options.color[1], options.color[2]) : rgb(0.1, 0.1, 0.1),
    });
    y -= (options?.size ?? 10) + 4;
  }

  drawText("Outdoor Independence LLC - Chemical Tracking Form", { size: 15, bold: true });
  drawText(`Record ID: ${params.recordId}`);
  drawText(`Client: ${params.client ? fullClientName(params.client) || "Unknown client" : "Unknown client"}`);
  drawText(`Property: ${params.property.property_name}`);
  drawText(
    `Address: ${params.property.address_line_1}${params.property.address_line_2 ? `, ${params.property.address_line_2}` : ""}, ${params.property.city}, ${params.property.state} ${params.property.postal_code}`
  );
  drawText(
    `Applicator: ${params.applicatorName || "-"}  |  License: ${params.applicatorLicense || "-"}  |  Date: ${params.serviceDate || "-"}`
  );
  drawText(`Start: ${params.startTime || "-"}  |  End: ${params.endTime || "-"}`);
  drawText(`Lawn: ${Number(params.property.lawn_sqft || 0).toLocaleString()} sqft (${Number(params.property.lawn_acres || 0).toFixed(3)} acres)`);
  drawText(
    `Weather: ${params.weatherConditions || "-"} | Temp: ${params.weatherTemperatureF ?? "-"} F | Wind: ${params.weatherWindSpeedMph ?? "-"} mph ${params.weatherWindDirection || ""}`.trim()
  );
  drawText(`Weather Source: ${params.weatherSource || "-"} | Observed: ${params.weatherObservedAt || "-"}`);
  drawText("");

  drawText("Equipment Used", { size: 12, bold: true });
  if (params.equipmentUsed.length) {
    params.equipmentUsed.forEach((item, index) => {
      for (const wrapped of wrapText(`${index + 1}. ${item}`, 95)) {
        drawText(wrapped);
      }
    });
  } else {
    drawText("None listed");
  }
  drawText("");

  drawText("Chemicals", { size: 12, bold: true });
  params.chemicals.forEach((chem, index) => {
    drawText(`${index + 1}. ${chem.chemicalName}`, { bold: true });
    const lines = [
      `EPA#: ${chem.epaRegistrationNumber ?? "-"} | Batch/Lot#: ${chem.batchLotNumber ?? "-"}`,
      `Concentration: ${chem.concentration ?? "-"} | Target Pest: ${chem.targetPest ?? "-"}`,
      `Total Applied: ${chem.totalApplied ?? "-"} ${chem.units ?? ""} | Area: ${chem.applicationAreaSqft ?? "-"} sqft`,
      `Application Rate: ${chem.applicationRate ?? "-"}`,
      `Re-entry/PPE Notes: ${chem.reentryIntervalPpeNotes ?? "-"}`,
    ];
    for (const line of lines) {
      for (const wrapped of wrapText(line)) drawText(`   ${wrapped}`);
    }
    drawText("");
  });

  drawText("Legal Signature", { size: 12, bold: true });
  for (const wrapped of wrapText(params.signatureText, 95)) {
    drawText(wrapped);
  }

  return pdf.save();
}

async function sendResendEmail(params: {
  resendApiKey: string;
  fromEmail: string;
  to: string;
  subject: string;
  html: string;
  pdfFilename: string;
  pdfBase64: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.fromEmail,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      attachments: [
        {
          filename: params.pdfFilename,
          content: params.pdfBase64,
        },
      ],
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Resend failed (${response.status}): ${text.slice(0, 220)}`);
  }
}

export async function POST(req: Request) {
  const ip = readClientIp(req);
  const ipLimit = await evaluateRateLimit({
    key: `fert-service:ip:${ip}`,
    limit: 80,
    windowMs: 60_000,
  });
  if (!ipLimit.ok) return rateLimitExceededResponse(ipLimit);

  const session = await getCurrentUserProfileStrict();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.effectiveRole ?? "employee";
  if (!canAccessRoute(role, "fertilizing_operations")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const userLimit = await evaluateRateLimit({
    key: `fert-service:user:${session.user.id}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!userLimit.ok) return rateLimitExceededResponse(userLimit);

  const body = (await req.json().catch(() => ({}))) as SubmitBody;
  const propertyId = asString(body.propertyId);
  const applicatorName = asString(body.applicatorName);
  const applicatorLicenseNumber = asString(body.applicatorLicenseNumber);
  const serviceDate = asDateOrNull(body.serviceDate);
  const startTime = asTimeOrNull(body.startTime);
  const endTime = asTimeOrNull(body.endTime);
  const signatureMode = body.signatureMode === "drawn" ? "drawn" : "typed";
  const typedLegalSignature = asString(body.typedLegalSignature);
  const drawnSignatureData = asString(body.drawnSignatureData);
  const weatherTemperatureF = asNumberOrNull(body.weatherTemperatureF);
  const weatherWindSpeedMph = asNumberOrNull(body.weatherWindSpeedMph);
  const weatherWindDirection = asNullable(body.weatherWindDirection);
  const weatherConditions = asNullable(body.weatherConditions);
  const weatherObservedAt = asTimestampOrNull(body.weatherObservedAt);
  const weatherSource = asNullable(body.weatherSource);
  const equipmentUsed = asStringList(body.equipmentUsed);

  const rawChemicals = Array.isArray(body.chemicals) ? body.chemicals : [];
  const chemicals = rawChemicals
    .map((row) => ({
      productId: asNullable(row.productId),
      chemicalName: asString(row.chemicalName),
      epaRegistrationNumber: asNullable(row.epaRegistrationNumber),
      batchLotNumber: asNullable(row.batchLotNumber),
      concentration: asNullable(row.concentration),
      targetPest: asNullable(row.targetPest),
      totalApplied: asNumberOrNull(row.totalApplied),
      units: asNullable(row.units),
      applicationAreaSqft: asNumberOrNull(row.applicationAreaSqft),
      applicationRate: asNullable(row.applicationRate),
      reentryIntervalPpeNotes: asNullable(row.reentryIntervalPpeNotes),
    }))
    .filter((row) => row.chemicalName.length > 0);

  if (!propertyId) return NextResponse.json({ error: "Property is required." }, { status: 400 });
  if (!chemicals.length) return NextResponse.json({ error: "At least one chemical is required." }, { status: 400 });
  if (signatureMode === "typed" && !typedLegalSignature) {
    return NextResponse.json({ error: "Typed legal signature is required." }, { status: 400 });
  }
  if (signatureMode === "drawn" && !drawnSignatureData) {
    return NextResponse.json({ error: "Drawn signature data is required." }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  const { data: propertyData, error: propertyError } = await admin
    .from("fert_properties")
    .select("id,client_id,property_name,address_line_1,address_line_2,city,state,postal_code,lawn_sqft,lawn_acres")
    .eq("id", propertyId)
    .maybeSingle();
  if (propertyError) return NextResponse.json({ error: propertyError.message }, { status: 500 });
  if (!propertyData) return NextResponse.json({ error: "Property not found." }, { status: 404 });

  let clientData: ClientRow | null = null;
  if (propertyData.client_id) {
    const { data, error } = await admin
      .from("fert_clients")
      .select("id,first_name,middle_name,last_name,email")
      .eq("id", propertyData.client_id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    clientData = (data as ClientRow | null) ?? null;
  }

  const signatureText = signatureMode === "typed" ? typedLegalSignature : "Drawn signature captured";

  const { data: recordData, error: recordError } = await admin
    .from("fert_service_records")
    .insert({
      property_id: propertyId,
      applicator_id: session.user.id,
      applicator_name: applicatorName || null,
      applicator_license_number: applicatorLicenseNumber || null,
      service_date: serviceDate,
      start_time: startTime,
      end_time: endTime,
      weather_temperature_f: weatherTemperatureF,
      weather_wind_speed_mph: weatherWindSpeedMph,
      weather_wind_direction: weatherWindDirection,
      weather_conditions: weatherConditions,
      weather_observed_at: weatherObservedAt,
      weather_source: weatherSource,
      equipment_used: equipmentUsed,
      typed_legal_signature: signatureMode === "typed" ? typedLegalSignature : null,
      signature_drawn_data: signatureMode === "drawn" ? drawnSignatureData : null,
      signature_mode: signatureMode,
    })
    .select("id")
    .single();
  if (recordError) return NextResponse.json({ error: recordError.message }, { status: 500 });

  const recordId = (recordData as RecordInsertRow).id;
  const { error: chemicalsError } = await admin.from("fert_service_chemicals").insert(
    chemicals.map((row) => ({
      service_record_id: recordId,
      product_id: row.productId,
      chemical_name: row.chemicalName,
      epa_registration_number: row.epaRegistrationNumber,
      batch_lot_number: row.batchLotNumber,
      concentration: row.concentration,
      target_pest: row.targetPest,
      total_applied: row.totalApplied,
      units: row.units,
      application_area_sqft: row.applicationAreaSqft,
      application_rate: row.applicationRate,
      reentry_interval_ppe_notes: row.reentryIntervalPpeNotes,
    }))
  );
  if (chemicalsError) {
    return NextResponse.json({ error: chemicalsError.message }, { status: 500 });
  }

  const pdfBytes = await buildServicePdf({
    recordId,
    property: propertyData as PropertyRow,
    client: clientData,
    applicatorName: applicatorName || session.profile?.full_name || session.profile?.email || session.user.id,
    applicatorLicense: applicatorLicenseNumber,
    serviceDate,
    startTime,
    endTime,
    weatherTemperatureF,
    weatherWindSpeedMph,
    weatherWindDirection,
    weatherConditions,
    weatherObservedAt,
    weatherSource,
    equipmentUsed,
    chemicals,
    signatureText,
  });

  const pdfBase64 = Buffer.from(pdfBytes).toString("base64");
  const pdfFilename = `fert-service-${recordId}.pdf`;

  const resendApiKey = process.env.RESEND_API_KEY?.trim() || "";
  const fromEmail =
    process.env.FERTILIZING_FROM_EMAIL?.trim() ||
    process.env.TREND_DIGEST_FROM_EMAIL?.trim() ||
    process.env.ALERTS_FROM_EMAIL?.trim() ||
    "onboarding@resend.dev";

  const recipientSet = new Set<string>();
  const applicatorEmail = asString(session.profile?.email) || asString(session.user.email);
  const clientEmail = asString(clientData?.email);
  if (applicatorEmail) recipientSet.add(applicatorEmail);
  if (clientEmail) recipientSet.add(clientEmail);

  let emailAttempted = 0;
  let emailSent = 0;
  let emailFailed = 0;

  if (resendApiKey && recipientSet.size > 0) {
    const recipients = [...recipientSet];
    emailAttempted = recipients.length;
    const subject = `Chemical Tracking Submission • ${propertyData.property_name}`;
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.45">
        <h2 style="margin:0 0 10px">Chemical Tracking Submission</h2>
        <p style="margin:0 0 6px"><strong>Record ID:</strong> ${recordId}</p>
        <p style="margin:0 0 6px"><strong>Property:</strong> ${propertyData.property_name}</p>
        <p style="margin:0 0 6px"><strong>Applicator:</strong> ${applicatorName || "-"}</p>
        <p style="margin:0 0 14px"><strong>Date:</strong> ${serviceDate || "-"}</p>
        <p style="margin:0 0 14px"><strong>Weather:</strong> ${weatherConditions || "-"} · ${weatherTemperatureF ?? "-"} F · ${weatherWindSpeedMph ?? "-"} mph ${weatherWindDirection || ""}</p>
        <p style="margin:0 0 14px"><strong>Equipment Used:</strong> ${equipmentUsed.length ? equipmentUsed.join(", ") : "None listed"}</p>
        <p style="margin:0">Attached: PDF summary</p>
      </div>
    `;

    const results = await Promise.allSettled(
      recipients.map((email) =>
        sendResendEmail({
          resendApiKey,
          fromEmail,
          to: email,
          subject,
          html,
          pdfFilename,
          pdfBase64,
        })
      )
    );
    for (const result of results) {
      if (result.status === "fulfilled") emailSent += 1;
      else emailFailed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    serviceRecordId: recordId,
    pdfFilename,
    pdfBase64,
    email: {
      configured: Boolean(resendApiKey),
      attempted: emailAttempted,
      sent: emailSent,
      failed: emailFailed,
    },
  });
}
