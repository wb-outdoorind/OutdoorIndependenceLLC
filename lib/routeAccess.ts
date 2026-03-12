import { normalizeRole, type AppRole } from "@/lib/roleView";
import {
  LEAD_APPROVAL_ROLES,
  MANAGEMENT_OR_MECHANIC_ROLES,
  MANAGEMENT_ROLES,
} from "@/lib/roles";

export type RouteAccessKey =
  | "ops_dashboard"
  | "maintenance_center"
  | "fertilizing_operations"
  | "purchases"
  | "accountability_center"
  | "vehicles_create"
  | "equipment_create"
  | "employees_create"
  | "lead_approvals"
  | "digest_details"
  | "audit_trail";

const ACCESS_MATRIX: Record<RouteAccessKey, AppRole[]> = {
  ops_dashboard: [...MANAGEMENT_OR_MECHANIC_ROLES],
  maintenance_center: [...MANAGEMENT_OR_MECHANIC_ROLES],
  fertilizing_operations: [...MANAGEMENT_OR_MECHANIC_ROLES],
  purchases: [...MANAGEMENT_OR_MECHANIC_ROLES],
  accountability_center: [...MANAGEMENT_OR_MECHANIC_ROLES],
  vehicles_create: [...MANAGEMENT_OR_MECHANIC_ROLES],
  equipment_create: [...MANAGEMENT_OR_MECHANIC_ROLES],
  employees_create: [...MANAGEMENT_ROLES],
  lead_approvals: [...LEAD_APPROVAL_ROLES],
  digest_details: ["owner", "mechanic"],
  audit_trail: [...MANAGEMENT_OR_MECHANIC_ROLES],
};

export function canAccessRoute(role: string | null | undefined, key: RouteAccessKey) {
  const normalized = normalizeRole(role) ?? "employee";
  return ACCESS_MATRIX[key].includes(normalized);
}

export function routeAccessRoles(key: RouteAccessKey) {
  return [...ACCESS_MATRIX[key]];
}
