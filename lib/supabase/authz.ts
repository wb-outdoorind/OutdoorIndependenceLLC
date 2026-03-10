import type { AppRole } from "@/lib/roleView";
import { isManagementRole, isMechanicOrHigher } from "@/lib/roles";

export type Role = AppRole;

export function canCreateMaintenanceLog(role: Role) {
  return isMechanicOrHigher(role);
}

export function canManageEmployees(role: Role) {
  return isManagementRole(role);
}
