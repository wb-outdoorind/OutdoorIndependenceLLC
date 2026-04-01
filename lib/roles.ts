import { normalizeRole, type AppRole } from "@/lib/roleView";

export const MANAGEMENT_ROLES: readonly AppRole[] = [
  "owner",
  "operations_manager",
  "sales_manager",
  "office_admin",
];

export const MANAGEMENT_OR_MECHANIC_ROLES: readonly AppRole[] = [
  ...MANAGEMENT_ROLES,
  "mechanic",
];

export const TEAMMATE_ROLES: readonly AppRole[] = [
  "apprentice",
  "team_member_1",
  "team_member_2",
  "team_lead_1",
  "team_lead_2",
];

export const LEAD_APPROVAL_ROLES: readonly AppRole[] = [
  ...MANAGEMENT_ROLES,
  "team_lead_1",
  "team_lead_2",
];

export function hasAnyRole(
  role: string | null | undefined,
  allowed: readonly AppRole[]
) {
  const normalized = normalizeRole(role) ?? "employee";
  return allowed.includes(normalized);
}

export function isManagementRole(role: string | null | undefined) {
  return hasAnyRole(role, MANAGEMENT_ROLES);
}

export function isMechanicOrHigher(role: string | null | undefined) {
  return hasAnyRole(role, MANAGEMENT_OR_MECHANIC_ROLES);
}

export function isTeammateRole(role: string | null | undefined) {
  return hasAnyRole(role, TEAMMATE_ROLES);
}
