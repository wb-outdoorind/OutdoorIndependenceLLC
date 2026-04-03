export const ASSET_LIFECYCLE_STATUSES = [
  "Active",
  "Inactive",
  "Out of Service",
  "Retired",
  "Red Tagged",
] as const;

export type AssetLifecycleStatus = (typeof ASSET_LIFECYCLE_STATUSES)[number];

const lifecycleStatusSet = new Set<string>(ASSET_LIFECYCLE_STATUSES);

const normalizedStatusMap: Record<string, AssetLifecycleStatus> = {
  active: "Active",
  inactive: "Inactive",
  "out of service": "Out of Service",
  retired: "Retired",
  "red tagged": "Red Tagged",
};

export type AssetLifecycleStatusTone = "active" | "inactive" | "warning" | "retired" | "danger" | "default";

export function isAssetLifecycleStatus(value: unknown): value is AssetLifecycleStatus {
  return typeof value === "string" && lifecycleStatusSet.has(value);
}

export function normalizeAssetLifecycleStatus(value: unknown): AssetLifecycleStatus | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isAssetLifecycleStatus(trimmed)) return trimmed;
  const mapped = normalizedStatusMap[trimmed.toLowerCase()];
  return mapped ?? null;
}

export function assetLifecycleStatusTone(value: unknown): AssetLifecycleStatusTone {
  const status = normalizeAssetLifecycleStatus(value);
  if (status === "Active") return "active";
  if (status === "Inactive") return "inactive";
  if (status === "Out of Service") return "warning";
  if (status === "Retired") return "retired";
  if (status === "Red Tagged") return "danger";
  return "default";
}

export function sortLifecycleStatusesForFilter(statuses: string[]) {
  const known = ASSET_LIFECYCLE_STATUSES.filter((status) => statuses.includes(status));
  const knownSet = new Set<string>(known);
  const extras = statuses
    .filter((status) => !knownSet.has(status))
    .sort((a, b) => a.localeCompare(b));
  return [...known, ...extras];
}
