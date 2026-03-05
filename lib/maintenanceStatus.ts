export const MAINTENANCE_REQUEST_STATUSES = [
  "Open",
  "Pending Approval",
  "Scheduled",
  "In Progress",
  "Waiting on Parts",
  "External Repair",
  "On Hold",
  "Closed",
] as const;

export type MaintenanceRequestStatus = (typeof MAINTENANCE_REQUEST_STATUSES)[number];

export const MAINTENANCE_ACTIVE_STATUSES = MAINTENANCE_REQUEST_STATUSES.filter(
  (status) => status !== "Closed"
) as Exclude<MaintenanceRequestStatus, "Closed">[];

export const MAINTENANCE_IN_PROGRESS_STATUSES = [
  "Scheduled",
  "In Progress",
  "Waiting on Parts",
  "External Repair",
  "On Hold",
] as const satisfies MaintenanceRequestStatus[];

const statusSet = new Set<string>(MAINTENANCE_REQUEST_STATUSES);
const activeStatusSet = new Set<string>(MAINTENANCE_ACTIVE_STATUSES);
const inProgressStatusSet = new Set<string>(MAINTENANCE_IN_PROGRESS_STATUSES);

export function isMaintenanceRequestStatus(value: unknown): value is MaintenanceRequestStatus {
  return typeof value === "string" && statusSet.has(value);
}

export function coerceMaintenanceRequestStatus(
  value: unknown,
  fallback: MaintenanceRequestStatus = "Open"
): MaintenanceRequestStatus {
  return isMaintenanceRequestStatus(value) ? value : fallback;
}

export function isMaintenanceActiveStatus(value: unknown) {
  return typeof value === "string" && activeStatusSet.has(value);
}

export function isMaintenanceClosedStatus(value: unknown) {
  return value === "Closed";
}

export function isMaintenanceInProgressStatus(value: unknown) {
  return typeof value === "string" && inProgressStatusSet.has(value);
}

