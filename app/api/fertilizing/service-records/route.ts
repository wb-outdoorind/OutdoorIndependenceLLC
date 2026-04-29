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
  calibrationVerified?: boolean | string | null;
  precipitation?: string;
  additionalNotes?: string;
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

function asBooleanOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === "yes" || normalized === "true") return true;
    if (normalized === "no" || normalized === "false") return false;
  }
  return null;
}

function normalizePrecipitation(value: unknown) {
  const normalized = asString(value).toLowerCase();
  if (!normalized) return null;
  if (normalized === "n/a" || normalized === "na") return "N/A";
  if (normalized === "light") return "Light";
  if (normalized === "moderate") return "Moderate";
  if (normalized === "heavy") return "Heavy";
  return null;
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
  calibrationVerified: boolean | null;
  precipitation: string | null;
  additionalNotes: string | null;
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
  let page = pdf.addPage([612, 792]);
  const margin = 38;
  const pageWidth = 612 - margin * 2;
  let y = 764;

  function newPage() {
    page = pdf.addPage([612, 792]);
    y = 764;
  }

  function ensureSpace(height: number) {
    if (y - height < 40) newPage();
  }

  function drawLine(yPos: number) {
    page.drawLine({
      start: { x: margin, y: yPos },
      end: { x: margin + pageWidth, y: yPos },
      thickness: 0.75,
      color: rgb(0.82, 0.82, 0.82),
    });
  }

  function drawTextAt(text: string, x: number, yPos: number, options?: { size?: number; bold?: boolean }) {
    page.drawText(text, {
      x,
      y: yPos,
      size: options?.size ?? 10,
      font: options?.bold ? bold : font,
      color: rgb(0.08, 0.08, 0.08),
    });
  }

  function writeSectionHeading(title: string) {
    ensureSpace(22);
    drawTextAt(title, margin, y, { size: 11, bold: true });
    y -= 6;
    drawLine(y);
    y -= 14;
  }

  function writeField(label: string, value: string) {
    ensureSpace(16);
    drawTextAt(`${label}:`, margin, y, { size: 10, bold: true });
    drawTextAt(value || "-", margin + 130, y, { size: 10 });
    y -= 14;
  }

  function writeWrappedField(label: string, value: string) {
    ensureSpace(16);
    drawTextAt(`${label}:`, margin, y, { size: 10, bold: true });
    const wrapped = wrapText(value || "-", 78);
    drawTextAt(wrapped[0] || "-", margin + 130, y, { size: 10 });
    y -= 14;
    for (const line of wrapped.slice(1)) {
      ensureSpace(14);
      drawTextAt(line, margin + 130, y, { size: 10 });
      y -= 14;
    }
  }

  function displayAmount(total: number | null, unit: string | null) {
    if (total === null) return "-";
    return `${total} ${unit ?? ""}`.trim();
  }

  const clientName = params.client ? fullClientName(params.client) || "Unknown client" : "Unknown client";
  const serviceAddress = `${params.property.address_line_1}${params.property.address_line_2 ? `, ${params.property.address_line_2}` : ""}, ${params.property.city}, ${params.property.state} ${params.property.postal_code}`;
  const targetIssue = Array.from(new Set(params.chemicals.map((row) => asString(row.targetPest)).filter(Boolean))).join("; ") || "-";
  const areaSqft = params.chemicals.find((row) => row.applicationAreaSqft != null)?.applicationAreaSqft ?? Number(params.property.lawn_sqft || 0);
  const applicationRate = params.chemicals.find((row) => asString(row.applicationRate))?.applicationRate ?? "-";
  const totalChemicalApplied = (() => {
    const rows = params.chemicals.filter((row) => row.totalApplied != null);
    if (!rows.length) return "-";
    const units = new Set(rows.map((row) => asString(row.units)));
    if (units.size === 1) {
      const summed = rows.reduce((sum, row) => sum + (row.totalApplied ?? 0), 0);
      const [unit] = [...units];
      return `${Number(summed.toFixed(4))} ${unit}`.trim();
    }
    return "Multiple (see chemical table)";
  })();

  drawTextAt("Outdoor Independence LLC", margin, y, { size: 14, bold: true });
  y -= 18;
  drawTextAt("Chemical Tracking Record", margin, y, { size: 13, bold: true });
  drawTextAt(`Record ID: ${params.recordId}`, margin + 390, y, { size: 10 });
  y -= 12;
  drawLine(y);
  y -= 14;

  writeSectionHeading("Client Information");
  writeField("Client Name", clientName);
  writeWrappedField("Service Address", serviceAddress);

  writeSectionHeading("Application Details");
  writeField("Applicator Name", params.applicatorName || "-");
  writeField("Date of Application", params.serviceDate || "-");
  writeField("Start Time", params.startTime || "-");
  writeField("End Time", params.endTime || "-");

  writeSectionHeading("Chemical Information Used");
  ensureSpace(30);
  const tableX = margin;
  const tableWidth = pageWidth;
  const colWidths = [180, 86, 84, 106, 70];
  const headerY = y;
  const headerH = 18;
  const rowH = 17;

  page.drawRectangle({
    x: tableX,
    y: headerY - headerH,
    width: tableWidth,
    height: headerH,
    color: rgb(0.94, 0.94, 0.94),
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 0.75,
  });
  const headers = ["Chemical Name", "EPA Reg. #", "Concentration", "Amount Used", "Unit"];
  let xCursor = tableX + 6;
  headers.forEach((label, idx) => {
    drawTextAt(label, xCursor, headerY - 12, { size: 9, bold: true });
    xCursor += colWidths[idx] ?? 0;
  });
  y = headerY - headerH;

  const rows = params.chemicals.length
    ? params.chemicals
    : [
        {
          chemicalName: "-",
          epaRegistrationNumber: null,
          concentration: null,
          totalApplied: null,
          units: null,
        },
      ];

  rows.forEach((chem) => {
    ensureSpace(rowH + 2);
    page.drawRectangle({
      x: tableX,
      y: y - rowH,
      width: tableWidth,
      height: rowH,
      borderColor: rgb(0.82, 0.82, 0.82),
      borderWidth: 0.5,
    });
    const values = [
      chem.chemicalName || "-",
      chem.epaRegistrationNumber ?? "-",
      chem.concentration ?? "-",
      displayAmount(chem.totalApplied ?? null, null),
      chem.units ?? "-",
    ];
    let rowX = tableX + 6;
    values.forEach((value, idx) => {
      drawTextAt(value, rowX, y - 12, { size: 9 });
      rowX += colWidths[idx] ?? 0;
    });
    y -= rowH;
  });
  y -= 10;

  writeSectionHeading("Targeting Details");
  writeField("Target Pest / Issue", targetIssue);
  writeField(
    "Application Area",
    areaSqft && Number.isFinite(Number(areaSqft))
      ? `${Number(areaSqft).toLocaleString()} sqft`
      : "-"
  );
  writeField("Total Chemical Applied", totalChemicalApplied);
  writeField("Application Rate", applicationRate || "-");

  writeSectionHeading("Equipment Details");
  writeField(
    "Calibration Verified",
    params.calibrationVerified === null ? "-" : params.calibrationVerified ? "Yes" : "No"
  );
  writeWrappedField(
    "Equipment Used",
    params.equipmentUsed.length ? params.equipmentUsed.join(", ") : "None listed"
  );

  writeSectionHeading("Weather Conditions (At Time of Application)");
  writeField(
    "Temperature",
    params.weatherTemperatureF === null ? "-" : `${params.weatherTemperatureF} °F`
  );
  writeField(
    "Wind Speed",
    params.weatherWindSpeedMph === null ? "-" : `${params.weatherWindSpeedMph} mph`
  );
  writeField("Precipitation", params.precipitation || "-");
  writeField("Wind Direction", params.weatherWindDirection || "-");
  writeField("Conditions", params.weatherConditions || "-");
  writeField("Observed At", params.weatherObservedAt || "-");
  writeField("Weather Source", params.weatherSource || "-");
  writeWrappedField("Additional Notes", params.additionalNotes || "-");

  writeSectionHeading("Applicator Sign-Off");
  writeField("Applicator Signature", params.signatureText || "-");
  writeField("Date", params.serviceDate || "-");

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
  const calibrationVerified = asBooleanOrNull(body.calibrationVerified);
  const precipitation = normalizePrecipitation(body.precipitation);
  const additionalNotes = asNullable(body.additionalNotes);
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
  if (asString(body.precipitation) && !precipitation) {
    return NextResponse.json({ error: "Precipitation must be N/A, Light, Moderate, or Heavy." }, { status: 400 });
  }
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
      calibration_verified: calibrationVerified,
      precipitation,
      additional_notes: additionalNotes,
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
    const { error: rollbackError } = await admin.from("fert_service_records").delete().eq("id", recordId);
    if (rollbackError) {
      return NextResponse.json(
        {
          error: `Chemical rows failed: ${chemicalsError.message}. Rollback failed: ${rollbackError.message}`,
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: chemicalsError.message }, { status: 500 });
  }

  let pdfFilename: string | undefined;
  let pdfBase64: string | undefined;
  let warning: string | undefined;
  let emailAttempted = 0;
  let emailSent = 0;
  let emailFailed = 0;
  const resendApiKey = process.env.RESEND_API_KEY?.trim() || "";

  try {
    const pdfBytes = await buildServicePdf({
      recordId,
      property: propertyData as PropertyRow,
      client: clientData,
      applicatorName: applicatorName || session.profile?.full_name || session.profile?.email || session.user.id,
      applicatorLicense: applicatorLicenseNumber,
      serviceDate,
      startTime,
      endTime,
      calibrationVerified,
      precipitation,
      additionalNotes,
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

    pdfBase64 = Buffer.from(pdfBytes).toString("base64");
    pdfFilename = `fert-service-${recordId}.pdf`;

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

    if (pdfFilename && pdfBase64 && resendApiKey && recipientSet.size > 0) {
      const pdfFilenameForEmail = pdfFilename;
      const pdfBase64ForEmail = pdfBase64;
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
            pdfFilename: pdfFilenameForEmail,
            pdfBase64: pdfBase64ForEmail,
          })
        )
      );
      for (const result of results) {
        if (result.status === "fulfilled") emailSent += 1;
        else emailFailed += 1;
      }
    }
  } catch (error) {
    warning = error instanceof Error ? error.message : "PDF/email follow-up failed after submission.";
  }

  return NextResponse.json({
    ok: true,
    serviceRecordId: recordId,
    pdfFilename,
    pdfBase64,
    warning,
    email: {
      configured: Boolean(resendApiKey),
      attempted: emailAttempted,
      sent: emailSent,
      failed: emailFailed,
    },
  });
}
