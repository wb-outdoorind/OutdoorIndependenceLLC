export type AccountabilitySignalItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  priority: "overdue" | "flagged" | "recent";
};

export type ApprovalDecisionItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export type TeamVisibilityItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export type PeopleHubCounts = {
  issues?: number;
  approvals?: number;
};
