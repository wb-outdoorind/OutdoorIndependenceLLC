export type Role =
  | "owner"
  | "operations_manager"
  | "office_admin"
  | "mechanic"
  | "apprentice"
  | "employee"
  | "team_lead_1"
  | "team_lead_2"
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
