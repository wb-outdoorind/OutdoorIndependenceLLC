export type AppRole =
  | "owner"
  | "operations_manager"
  | "sales_manager"
  | "office_admin"
  | "mechanic"
  | "apprentice"
  | "employee"
  | "team_lead_1"
  | "team_lead_2"
  | "team_member_1"
  | "team_member_2";

export const ROLE_VIEW_COOKIE = "oi_view_as_role";
export const ROLE_VIEW_STORAGE_KEY = "oi:view-as-role";
export const ROLE_VIEW_CHANGED_EVENT = "oi:role-view-changed";

const ALL_ROLES: AppRole[] = [
  "owner",
  "operations_manager",
  "sales_manager",
  "office_admin",
  "mechanic",
  "team_lead_1",
  "team_lead_2",
  "team_member_1",
  "team_member_2",
  "apprentice",
  "employee",
];

export function normalizeRole(value: string | null | undefined): AppRole | null {
  if (!value) return null;
  const role = value.trim().toLowerCase();
  if (role === "teammate") return "team_member_1";
  return (ALL_ROLES.find((r) => r === role) ?? null) as AppRole | null;
}

export function canUseRoleView(actualRole: string | null | undefined) {
  const role = normalizeRole(actualRole);
  return role === "owner" || role === "operations_manager";
}

export function resolveEffectiveRole(
  actualRole: string | null | undefined,
  requestedRole: string | null | undefined
): AppRole {
  const actual = normalizeRole(actualRole) ?? "employee";
  if (!canUseRoleView(actual)) return actual;
  const requested = normalizeRole(requestedRole);
  return requested ?? actual;
}

export function roleLabel(role: string | null | undefined) {
  const normalized = normalizeRole(role);
  if (!normalized) return "Employee";
  return normalized.replaceAll("_", " ").replace(/\b\w/g, (s) => s.toUpperCase());
}

export function readRoleViewOverride() {
  if (typeof window === "undefined") return null;
  return normalizeRole(window.localStorage.getItem(ROLE_VIEW_STORAGE_KEY));
}

export function writeRoleViewOverride(role: AppRole | null) {
  if (typeof window === "undefined") return;
  if (!role) {
    window.localStorage.removeItem(ROLE_VIEW_STORAGE_KEY);
    document.cookie = `${ROLE_VIEW_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent(ROLE_VIEW_CHANGED_EVENT, { detail: { role: null } }));
    return;
  }
  window.localStorage.setItem(ROLE_VIEW_STORAGE_KEY, role);
  document.cookie = `${ROLE_VIEW_COOKIE}=${encodeURIComponent(role)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  window.dispatchEvent(new CustomEvent(ROLE_VIEW_CHANGED_EVENT, { detail: { role } }));
}
