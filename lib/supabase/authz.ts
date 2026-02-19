export type Role =
  | "owner"
  | "operations_manager"
  | "office_admin"
  | "mechanic"
  | "employee"
  | "team_member_1"
  | "team_member_2";

export function canCreateMaintenanceLog(role: Role) {
  return (
    role === "owner" ||
    role === "operations_manager" ||
    role === "office_admin" ||
    role === "mechanic"
  );
}

export function canManageEmployees(role: Role) {
  return role === "owner" || role === "operations_manager" || role === "office_admin";
}
