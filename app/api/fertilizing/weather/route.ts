import { NextResponse } from "next/server";
import { evaluateRateLimit, rateLimitExceededResponse, readClientIp } from "@/lib/apiRateLimit";
import { canAccessRoute } from "@/lib/routeAccess";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";

export const runtime = "nodejs";

type WeatherBody = {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  propertyName?: string;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function weatherCodeLabel(code: number | null) {
  switch (code) {
    case 0:
      return "Clear sky";
    case 1:
    case 2:
    case 3:
      return "Partly cloudy";
    case 45:
    case 48:
      return "Fog";
    case 51:
    case 53:
    case 55:
      return "Drizzle";
    case 56:
    case 57:
      return "Freezing drizzle";
    case 61:
    case 63:
    case 65:
      return "Rain";
    case 66:
    case 67:
      return "Freezing rain";
    case 71:
    case 73:
    case 75:
      return "Snow";
    case 77:
      return "Snow grains";
    case 80:
    case 81:
    case 82:
      return "Rain showers";
    case 85:
    case 86:
      return "Snow showers";
    case 95:
      return "Thunderstorm";
    case 96:
    case 99:
      return "Thunderstorm with hail";
    default:
      return "Unknown";
  }
}

function cardinalDirection(degrees: number | null) {
  if (degrees === null || !Number.isFinite(degrees)) return "";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const idx = Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16;
  return dirs[idx] ?? "";
}

export async function POST(req: Request) {
  const ip = readClientIp(req);
  const ipLimit = await evaluateRateLimit({
    key: `fert-weather:ip:${ip}`,
    limit: 120,
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
    key: `fert-weather:user:${session.user.id}`,
    limit: 40,
    windowMs: 60_000,
  });
  if (!userLimit.ok) return rateLimitExceededResponse(userLimit);

  const body = (await req.json().catch(() => ({}))) as WeatherBody;
  const addressLine1 = asString(body.addressLine1);
  const addressLine2 = asString(body.addressLine2);
  const city = asString(body.city);
  const state = asString(body.state);
  const postalCode = asString(body.postalCode);
  const propertyName = asString(body.propertyName);

  const query = [propertyName, addressLine1, addressLine2, city, state, postalCode, "US"]
    .filter(Boolean)
    .join(", ");
  if (!query) return NextResponse.json({ error: "Address is required." }, { status: 400 });

  const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geocodeUrl.searchParams.set("name", query);
  geocodeUrl.searchParams.set("count", "1");
  geocodeUrl.searchParams.set("language", "en");
  geocodeUrl.searchParams.set("format", "json");

  const geoRes = await fetch(geocodeUrl, { method: "GET", cache: "no-store" });
  if (!geoRes.ok) {
    const text = await geoRes.text().catch(() => "");
    return NextResponse.json({ error: `Geocoding failed (${geoRes.status}): ${text.slice(0, 160)}` }, { status: 502 });
  }
  const geoJson = (await geoRes.json().catch(() => ({}))) as {
    results?: Array<{
      latitude?: number;
      longitude?: number;
      name?: string;
      admin1?: string;
      country?: string;
    }>;
  };
  const first = geoJson.results?.[0];
  const latitude = Number(first?.latitude);
  const longitude = Number(first?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ error: "Unable to geocode this address." }, { status: 404 });
  }

  const wxUrl = new URL("https://api.open-meteo.com/v1/forecast");
  wxUrl.searchParams.set("latitude", String(latitude));
  wxUrl.searchParams.set("longitude", String(longitude));
  wxUrl.searchParams.set("current", "temperature_2m,wind_speed_10m,wind_direction_10m,weather_code");
  wxUrl.searchParams.set("temperature_unit", "fahrenheit");
  wxUrl.searchParams.set("wind_speed_unit", "mph");
  wxUrl.searchParams.set("timezone", "auto");

  const wxRes = await fetch(wxUrl, { method: "GET", cache: "no-store" });
  if (!wxRes.ok) {
    const text = await wxRes.text().catch(() => "");
    return NextResponse.json({ error: `Weather lookup failed (${wxRes.status}): ${text.slice(0, 160)}` }, { status: 502 });
  }
  const wxJson = (await wxRes.json().catch(() => ({}))) as {
    current?: {
      time?: string;
      temperature_2m?: number;
      wind_speed_10m?: number;
      wind_direction_10m?: number;
      weather_code?: number;
    };
  };
  const current = wxJson.current ?? {};
  const temperatureF = Number(current.temperature_2m);
  const windSpeedMph = Number(current.wind_speed_10m);
  const windDirectionDeg = Number(current.wind_direction_10m);
  const weatherCode = Number(current.weather_code);
  const observedAt = asString(current.time);

  return NextResponse.json({
    ok: true,
    source: "open-meteo",
    location: {
      latitude,
      longitude,
      name: [first?.name, first?.admin1, first?.country].filter(Boolean).join(", "),
    },
    weather: {
      temperatureF: Number.isFinite(temperatureF) ? Number(temperatureF.toFixed(2)) : null,
      windSpeedMph: Number.isFinite(windSpeedMph) ? Number(windSpeedMph.toFixed(2)) : null,
      windDirectionDegrees: Number.isFinite(windDirectionDeg) ? Number(windDirectionDeg.toFixed(0)) : null,
      windDirectionLabel: cardinalDirection(Number.isFinite(windDirectionDeg) ? windDirectionDeg : null),
      conditions: weatherCodeLabel(Number.isFinite(weatherCode) ? weatherCode : null),
      observedAt: observedAt || null,
    },
  });
}
