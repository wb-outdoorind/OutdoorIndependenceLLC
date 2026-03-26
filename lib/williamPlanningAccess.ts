type EmailCarrier = {
  email?: string | null;
} | null | undefined;

export const WILLIAM_PLANNING_EMAIL = "wb@outdoorind.org";

function normalizeEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function isWilliamPlanningUser(profile?: EmailCarrier, user?: EmailCarrier) {
  return [normalizeEmail(user?.email), normalizeEmail(profile?.email)].some(
    (email) => email === WILLIAM_PLANNING_EMAIL
  );
}
