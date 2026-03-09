import { roleLabel } from "@/lib/roleView";

export type EmployeeBadgeOption = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
  full_name?: string | null;
  email?: string | null;
  department?: string | null;
  role?: string | null;
  status?: string | null;
};

function clean(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return normalized || "";
}

function normalizeTokens(value: string | null | undefined) {
  return clean(value)
    .replace(/\s+/g, " ")
    .trim();
}

export function employeeBadgePrimary(option: EmployeeBadgeOption) {
  const nickname = normalizeTokens(option.nickname);
  const first = normalizeTokens(option.first_name);
  const last = normalizeTokens(option.last_name);
  if ((nickname || first) && last) return `${nickname || first}, ${last}`;
  if (nickname) return nickname;
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;
  const fullName = normalizeTokens(option.full_name);
  if (fullName) return fullName;
  const email = normalizeTokens(option.email);
  if (email) return email;
  return option.id;
}

export function employeeBadgeSecondary(option: EmployeeBadgeOption) {
  const department = normalizeTokens(option.department);
  return `${department || "No Department"} - ${roleLabel(option.role)}`;
}

export function employeeBadgeSearchText(option: EmployeeBadgeOption) {
  return [
    option.nickname,
    option.first_name,
    option.last_name,
    option.full_name,
    option.email,
    option.department,
    option.role,
  ]
    .map((value) => normalizeTokens(value))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function employeeBadgeInitials(option: EmployeeBadgeOption) {
  const nickname = normalizeTokens(option.nickname);
  const first = normalizeTokens(option.first_name);
  const last = normalizeTokens(option.last_name);
  const fullName = normalizeTokens(option.full_name);

  const firstToken = nickname || first || fullName.split(" ")[0] || "";
  const secondToken = last || fullName.split(" ")[1] || "";
  const initials = `${firstToken.slice(0, 1)}${secondToken.slice(0, 1)}`.toUpperCase();
  return initials || "U";
}

export async function fetchEmployeeAvatarUrls(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (!uniqueIds.length) return {} as Record<string, string>;

  const res = await fetch("/api/employees/avatar-urls", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids: uniqueIds }),
  });
  if (!res.ok) return {} as Record<string, string>;
  const json = (await res.json().catch(() => ({}))) as { urls?: Record<string, string> };
  if (!json.urls || typeof json.urls !== "object") return {} as Record<string, string>;
  return json.urls;
}
