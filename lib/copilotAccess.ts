type CopilotProfile = {
  role?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  middle_initial?: string | null;
  last_name?: string | null;
  nickname?: string | null;
  email?: string | null;
} | null;

type CopilotUser = {
  email?: string | null;
} | null;

const ALLOWED_ROLES = new Set(["owner", "operations_manager", "office_admin", "mechanic"]);

const WILLIAM_EMAILS = new Set([
  "wb@outdoorind.org",
  "william.p.bingen@gmail.com",
]);

const WILLIAM_NAMES = new Set([
  "william bingen",
  "will bingen",
]);

function normalizeValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function buildNameCandidates(profile: CopilotProfile) {
  if (!profile) return [] as string[];
  const candidates = new Set<string>();

  const fullName = normalizeValue(profile.full_name);
  if (fullName) candidates.add(fullName);

  const first = normalizeValue(profile.first_name);
  const last = normalizeValue(profile.last_name);
  const nickname = normalizeValue(profile.nickname);

  if (first && last) candidates.add(`${first} ${last}`);
  if (nickname && last) candidates.add(`${nickname} ${last}`);

  return Array.from(candidates);
}

function isAllowedRole(role: string | null | undefined) {
  return ALLOWED_ROLES.has(normalizeValue(role));
}

function isWilliamIdentity(profile: CopilotProfile, user: CopilotUser) {
  const emails = [
    normalizeValue(user?.email),
    normalizeValue(profile?.email),
  ].filter(Boolean);

  if (emails.some((email) => WILLIAM_EMAILS.has(email))) return true;

  const names = buildNameCandidates(profile);
  return names.some((name) => WILLIAM_NAMES.has(name));
}

export function canAccessCopilot(params: {
  role: string | null | undefined;
  profile: CopilotProfile;
  user: CopilotUser;
}) {
  if (!isAllowedRole(params.role)) return false;
  return isWilliamIdentity(params.profile, params.user);
}

