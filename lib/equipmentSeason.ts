export type EquipmentSeason = "All" | "Summer" | "Winter";

export const EQUIPMENT_SEASONS: EquipmentSeason[] = ["All", "Summer", "Winter"];

const ALL_SEASON_KEYWORDS = ["truck", "trailer", "trlr", "loader", "skid"];
const WINTER_SEASON_KEYWORDS = ["snow", "plow", "salter", "salt", "deicer", "de-icer", "sander"];

function includesAny(haystack: string, keywords: string[]) {
  return keywords.some((keyword) => haystack.includes(keyword));
}

export function inferEquipmentSeason(...values: Array<string | null | undefined>): EquipmentSeason {
  const haystack = values
    .map((value) => (value ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");

  if (!haystack) return "Summer";
  if (includesAny(haystack, ALL_SEASON_KEYWORDS)) return "All";
  if (includesAny(haystack, WINTER_SEASON_KEYWORDS)) return "Winter";
  return "Summer";
}

export function normalizeEquipmentSeason(value: string | null | undefined): EquipmentSeason | null {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "all") return "All";
  if (normalized === "summer") return "Summer";
  if (normalized === "winter") return "Winter";
  return null;
}
