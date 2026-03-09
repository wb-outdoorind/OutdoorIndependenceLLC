export const PURCHASE_DEPARTMENTS = [
  "Mowing",
  "Administration",
  "Landscaping",
  "Fertilizing",
  "Maintenance",
] as const;

export type PurchaseDepartment = (typeof PURCHASE_DEPARTMENTS)[number];

export const PURCHASE_TIMELINE_OPTIONS = [
  "Urgent (Immediately/Less than 24 hours)",
  "High Priority (1-3 days)",
  "Standard (Within a week)",
  "Low Priority (Needed within 2 weeks)",
  "Very Low Priority (Needed within 1 month)",
] as const;

export type PurchaseTimeline = (typeof PURCHASE_TIMELINE_OPTIONS)[number];

export const PURCHASE_METHOD_OPTIONS = [
  "Credit Card",
  "Debit Card",
  "Cash",
  "Check",
  "Company Charge Account",
  "Other",
] as const;

export type PurchaseMethod = (typeof PURCHASE_METHOD_OPTIONS)[number];

export const PURCHASE_DECISION_OPTIONS = ["pending", "approved", "denied"] as const;
export type PurchaseDecision = (typeof PURCHASE_DECISION_OPTIONS)[number];

export const PURCHASE_REVIEW_STATUS_OPTIONS = [
  "pending",
  "approved",
  "partially_approved",
  "denied",
] as const;
export type PurchaseReviewStatus = (typeof PURCHASE_REVIEW_STATUS_OPTIONS)[number];

export const PURCHASE_OVERALL_STATUS_OPTIONS = [
  "pending_manager_approval",
  "pending_ap_approval",
  "approved",
  "partially_approved",
  "denied",
  "completed",
] as const;
export type PurchaseOverallStatus = (typeof PURCHASE_OVERALL_STATUS_OPTIONS)[number];

export const PURCHASE_ATTACHMENT_TYPES = ["quote", "receipt"] as const;
export type PurchaseAttachmentType = (typeof PURCHASE_ATTACHMENT_TYPES)[number];

export const PURCHASE_MANAGER_ROLES = ["owner", "operations_manager", "office_admin"] as const;
export const PURCHASE_AP_ROLES = ["owner", "operations_manager", "office_admin"] as const;
export const PURCHASE_ACCESS_ROLES = [
  "owner",
  "operations_manager",
  "office_admin",
  "mechanic",
] as const;

type AccessRole = (typeof PURCHASE_ACCESS_ROLES)[number];

function normalizeRole(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function canAccessPurchases(role: string | null | undefined) {
  return (PURCHASE_ACCESS_ROLES as readonly string[]).includes(normalizeRole(role));
}

export function canCreatePurchaseRequest(role: string | null | undefined) {
  return canAccessPurchases(role);
}

export function canManagerApprovePurchase(role: string | null | undefined) {
  return (PURCHASE_MANAGER_ROLES as readonly string[]).includes(normalizeRole(role));
}

export function canApApprovePurchase(role: string | null | undefined) {
  return (PURCHASE_AP_ROLES as readonly string[]).includes(normalizeRole(role));
}

export function isPurchaseDepartment(value: unknown): value is PurchaseDepartment {
  return typeof value === "string" && PURCHASE_DEPARTMENTS.includes(value as PurchaseDepartment);
}

export function isPurchaseTimeline(value: unknown): value is PurchaseTimeline {
  return typeof value === "string" && PURCHASE_TIMELINE_OPTIONS.includes(value as PurchaseTimeline);
}

export function isPurchaseMethod(value: unknown): value is PurchaseMethod {
  return typeof value === "string" && PURCHASE_METHOD_OPTIONS.includes(value as PurchaseMethod);
}

export function isPurchaseDecision(value: unknown): value is PurchaseDecision {
  return typeof value === "string" && PURCHASE_DECISION_OPTIONS.includes(value as PurchaseDecision);
}

export function isPurchaseAttachmentType(value: unknown): value is PurchaseAttachmentType {
  return typeof value === "string" && PURCHASE_ATTACHMENT_TYPES.includes(value as PurchaseAttachmentType);
}

export function timelineFromUrgency(value: unknown): PurchaseTimeline {
  const urgency = (typeof value === "string" ? value : "").trim().toLowerCase();
  if (urgency === "urgent") return "Urgent (Immediately/Less than 24 hours)";
  if (urgency === "high") return "High Priority (1-3 days)";
  if (urgency === "medium") return "Standard (Within a week)";
  if (urgency === "low") return "Low Priority (Needed within 2 weeks)";
  return "Standard (Within a week)";
}

export function purchaseOverallStatusLabel(status: string | null | undefined) {
  switch ((status ?? "").trim()) {
    case "pending_manager_approval":
      return "Pending Manager Approval";
    case "pending_ap_approval":
      return "Pending Accounts Payable";
    case "approved":
      return "Approved";
    case "partially_approved":
      return "Partially Approved";
    case "denied":
      return "Denied";
    case "completed":
      return "Completed";
    default:
      return "Pending";
  }
}

export function coercePurchaseReviewStatus(value: unknown): PurchaseReviewStatus {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw === "approved" || raw === "partially_approved" || raw === "denied") return raw;
  return "pending";
}

export function coercePurchaseDecision(value: unknown): PurchaseDecision {
  return isPurchaseDecision(value) ? value : "pending";
}

export function aggregateReviewStatus(decisions: PurchaseDecision[]): PurchaseReviewStatus {
  if (!decisions.length || decisions.every((decision) => decision === "pending")) return "pending";
  const approved = decisions.filter((decision) => decision === "approved").length;
  const denied = decisions.filter((decision) => decision === "denied").length;
  if (approved > 0 && denied > 0) return "partially_approved";
  if (approved > 0) return "approved";
  return "denied";
}

export function overallStatusFromReviews(
  managerStatus: PurchaseReviewStatus,
  apStatus: PurchaseReviewStatus
): PurchaseOverallStatus {
  if (managerStatus === "pending") return "pending_manager_approval";
  if (managerStatus === "denied") return "denied";
  if (apStatus === "pending") return "pending_ap_approval";
  if (apStatus === "denied") return "denied";
  if (apStatus === "partially_approved") return "partially_approved";
  return "approved";
}

export function isValidPurchaseOverallStatus(value: unknown): value is PurchaseOverallStatus {
  return typeof value === "string" && PURCHASE_OVERALL_STATUS_OPTIONS.includes(value as PurchaseOverallStatus);
}

export function isMechanicOrHigherRole(role: string | null | undefined): role is AccessRole {
  return canAccessPurchases(role);
}
