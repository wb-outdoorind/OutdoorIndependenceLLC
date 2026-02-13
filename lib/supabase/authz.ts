export type Role = "owner" | "office_admin" | "mechanic" | "employee";

export function canCreateMaintenanceLog(role: Role) {
  return role === "owner" || role === "office_admin" || role === "mechanic";
}

export function canManageEmployees(role: Role) {
  return role === "owner" || role === "office_admin";
}
