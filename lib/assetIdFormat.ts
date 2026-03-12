import { inferEquipmentSeason, normalizeEquipmentSeason } from "@/lib/equipmentSeason";

type AssetSeason = "All" | "Summer" | "Winter";

const COMPANY_WORDS = new Set([
  "the",
  "and",
  "of",
  "inc",
  "llc",
  "co",
  "corp",
  "corporation",
  "company",
]);

function cleanToken(token: string) {
  return token.replace(/[^a-z0-9]/gi, "").trim();
}

function splitTokens(value: string | null | undefined) {
  return (value ?? "")
    .split(/[\s/_-]+/)
    .map((part) => cleanToken(part).toLowerCase())
    .filter(Boolean);
}

function brandCode(make: string | null | undefined) {
  const tokens = splitTokens(make).filter((token) => !COMPANY_WORDS.has(token));
  if (!tokens.length) return "X";
  if (tokens.length === 1) return tokens[0].slice(0, 1).toUpperCase();
  return tokens
    .slice(0, 2)
    .map((token) => token.slice(0, 1).toUpperCase())
    .join("");
}

function seasonCode(season: AssetSeason) {
  if (season === "All") return "A";
  if (season === "Winter") return "W";
  return "S";
}

function simpleAssetPrefixForEquipmentType(value: string | null | undefined) {
  const hay = (value ?? "").toLowerCase();
  if (hay.includes("trailer") || hay.includes("trlr")) return "Trailer";
  if (hay.includes("truck")) return "Truck";
  return null;
}

function simpleAssetPrefixForVehicleType(value: string | null | undefined) {
  const type = (value ?? "").trim().toLowerCase();
  if (type === "truck") return "Truck";
  if (type === "trailer") return "Trailer";
  return null;
}

function fallbackTypeCode(value: string | null | undefined) {
  const tokens = splitTokens(value).filter((token) => !COMPANY_WORDS.has(token));
  if (!tokens.length) return "EQ";
  if (tokens.length === 1) return tokens[0].slice(0, 3).toUpperCase();
  return tokens
    .slice(0, 3)
    .map((token) => token.slice(0, 1).toUpperCase())
    .join("");
}

function equipmentTypeCode(equipmentType: string | null | undefined, name: string | null | undefined) {
  const hay = `${equipmentType ?? ""} ${name ?? ""}`.toLowerCase();
  if (hay.includes("hedge") && hay.includes("trimmer")) return "HT";
  if (hay.includes("backpack") && hay.includes("blower")) return "BB";
  if (hay.includes("hand") && hay.includes("blower")) return "HB";
  if (hay.includes("snow") && hay.includes("blower")) return "SB";
  if (hay.includes("string") && hay.includes("trimmer")) return "ST";
  if (hay.includes("zero") && hay.includes("turn")) return "ZT";
  if (hay.includes("walk") && hay.includes("behind")) return "WB";
  if (hay.includes("mower")) return "MW";
  if (hay.includes("truck")) return "TRK";
  if (hay.includes("trailer") || hay.includes("trlr")) return "TR";
  if (hay.includes("loader")) return "LD";
  if (hay.includes("skid")) return "SKD";
  if (hay.includes("salter") || hay.includes("sander")) return "SLT";
  if (hay.includes("plow")) return "PLW";
  if (hay.includes("sprayer") || hay.includes("applicator")) return "SPR";
  return fallbackTypeCode(equipmentType || name);
}

function vehicleTypeCode(vehicleType: string | null | undefined) {
  const type = (vehicleType ?? "").trim().toLowerCase();
  if (type === "truck") return "TRK";
  if (type === "car") return "CAR";
  if (type === "skidsteer" || type === "skid steer" || type === "skid_steer") return "SKD";
  if (type === "loader") return "LD";
  return fallbackTypeCode(vehicleType);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nextAssetIdForSimplePrefix(prefix: string, existingValues: Array<string | null | undefined>) {
  const matcher = new RegExp(`^${escapeRegex(prefix)}_(\\d+)$`);
  let maxSeq = 0;
  for (const value of existingValues) {
    const text = (value ?? "").trim();
    const m = matcher.exec(text);
    if (!m) continue;
    const parsed = Number(m[1]);
    if (Number.isInteger(parsed) && parsed > maxSeq) {
      maxSeq = parsed;
    }
  }
  return `${prefix}_${maxSeq + 1}`;
}

export function buildEquipmentAssetIdPrefix(args: {
  season: string | null | undefined;
  equipmentType: string | null | undefined;
  make: string | null | undefined;
  name?: string | null | undefined;
  id?: string | null | undefined;
}) {
  const normalizedSeason =
    normalizeEquipmentSeason(args.season) ??
    inferEquipmentSeason(args.equipmentType, args.name, args.id);
  return `${seasonCode(normalizedSeason)}-${equipmentTypeCode(args.equipmentType, args.name)}-${brandCode(args.make)}`;
}

export function buildVehicleAssetIdPrefix(args: {
  vehicleType: string | null | undefined;
  make: string | null | undefined;
}) {
  const simplePrefix = simpleAssetPrefixForVehicleType(args.vehicleType);
  if (simplePrefix) return simplePrefix;
  return `${seasonCode("All")}-${vehicleTypeCode(args.vehicleType)}-${brandCode(args.make)}`;
}

export function nextAssetIdForPrefix(prefix: string, existingValues: Array<string | null | undefined>) {
  if (prefix === "Truck" || prefix === "Trailer") {
    return nextAssetIdForSimplePrefix(prefix, existingValues);
  }

  const matcher = new RegExp(`^${escapeRegex(prefix)}-(\\d+)$`);
  let maxSeq = 0;
  for (const value of existingValues) {
    const text = (value ?? "").trim();
    const m = matcher.exec(text);
    if (!m) continue;
    const parsed = Number(m[1]);
    if (Number.isInteger(parsed) && parsed > maxSeq) {
      maxSeq = parsed;
    }
  }
  return `${prefix}-${maxSeq + 1}`;
}

export function buildNextVehicleAssetId(args: {
  vehicleType: string | null | undefined;
  make: string | null | undefined;
  existingValues: Array<string | null | undefined>;
}) {
  const prefix = buildVehicleAssetIdPrefix({
    vehicleType: args.vehicleType,
    make: args.make,
  });
  return nextAssetIdForPrefix(prefix, args.existingValues);
}

export function buildNextEquipmentAssetId(args: {
  season: string | null | undefined;
  equipmentType: string | null | undefined;
  make: string | null | undefined;
  name?: string | null | undefined;
  id?: string | null | undefined;
  existingValues: Array<string | null | undefined>;
}) {
  const simplePrefix = simpleAssetPrefixForEquipmentType(args.equipmentType);
  if (simplePrefix) {
    return nextAssetIdForSimplePrefix(simplePrefix, args.existingValues);
  }

  const prefix = buildEquipmentAssetIdPrefix({
    season: args.season,
    equipmentType: args.equipmentType,
    make: args.make,
    name: args.name,
    id: args.id,
  });
  return nextAssetIdForPrefix(prefix, args.existingValues);
}
