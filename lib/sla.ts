export type SlaLevel = "on_track" | "due_soon" | "overdue";

export type SlaStatus = {
  level: SlaLevel;
  text: string;
  hoursElapsed: number;
  hoursTarget: number;
};

type RequestStatus = "Open" | "In Progress" | "Closed";
type FlagReviewStatus = "open" | "in_review" | "resolved";

type RequestUrgency = "Low" | "Medium" | "High" | "Urgent";

function hoursBetween(nowMs: number, iso: string | null | undefined) {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const hours = (nowMs - ms) / (1000 * 60 * 60);
  return hours < 0 ? 0 : hours;
}

function toSla(hoursElapsed: number, hoursTarget: number): SlaStatus {
  const roundedElapsed = Math.max(0, Math.round(hoursElapsed * 10) / 10);
  const roundedTarget = Math.max(0.1, Math.round(hoursTarget * 10) / 10);

  if (roundedElapsed >= roundedTarget) {
    const overdueBy = Math.round((roundedElapsed - roundedTarget) * 10) / 10;
    return {
      level: "overdue",
      text: `Overdue by ${overdueBy}h`,
      hoursElapsed: roundedElapsed,
      hoursTarget: roundedTarget,
    };
  }

  const remaining = Math.max(0, roundedTarget - roundedElapsed);
  if (remaining <= roundedTarget * 0.35) {
    return {
      level: "due_soon",
      text: `Due in ${Math.round(remaining * 10) / 10}h`,
      hoursElapsed: roundedElapsed,
      hoursTarget: roundedTarget,
    };
  }

  return {
    level: "on_track",
    text: `On track (${Math.round(remaining * 10) / 10}h left)`,
    hoursElapsed: roundedElapsed,
    hoursTarget: roundedTarget,
  };
}

export function getApprovalSla(params: {
  requestedAt: string | null | undefined;
  status: "pending" | "approved" | "rejected" | "not_requested";
  nowMs?: number;
}) {
  if (params.status !== "pending") return null;
  const nowMs = params.nowMs ?? Date.now();
  const elapsed = hoursBetween(nowMs, params.requestedAt);
  if (elapsed === null) return null;
  return toSla(elapsed, 2);
}

export function getMaintenanceRequestSla(params: {
  createdAt: string | null | undefined;
  status: RequestStatus;
  urgency: RequestUrgency;
  nowMs?: number;
}) {
  if (params.status === "Closed") return null;
  const nowMs = params.nowMs ?? Date.now();
  const elapsed = hoursBetween(nowMs, params.createdAt);
  if (elapsed === null) return null;

  const targetByUrgency: Record<RequestUrgency, number> = {
    Urgent: 2,
    High: 8,
    Medium: 24,
    Low: 48,
  };
  const baseTarget = targetByUrgency[params.urgency] ?? 24;
  const effectiveTarget = params.status === "In Progress" ? baseTarget * 1.5 : baseTarget;

  return toSla(elapsed, effectiveTarget);
}

export function getFlaggedQueueSla(params: {
  submittedAt: string;
  reviewStatus: FlagReviewStatus;
  reviewCreatedAt?: string | null;
  nowMs?: number;
}) {
  if (params.reviewStatus === "resolved") return null;
  const nowMs = params.nowMs ?? Date.now();
  const basisIso = params.reviewCreatedAt || params.submittedAt;
  const elapsed = hoursBetween(nowMs, basisIso);
  if (elapsed === null) return null;
  return toSla(elapsed, 48);
}
