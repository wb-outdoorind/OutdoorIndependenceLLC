import type { MaintenanceRequestStatus } from "@/lib/maintenanceStatus";

export type AssetType = "vehicle" | "equipment";
export type Urgency = "Low" | "Medium" | "High" | "Urgent";

export type AssigneeOption = {
  id: string;
  label: string;
};

export type MaintenanceCardData = {
  key: string;
  id: string;
  assetType: AssetType;
  assetId: string;
  assetName: string;
  assetSubtitle: string | null;
  title: string;
  status: MaintenanceRequestStatus;
  priority: Urgency;
  assignedTo: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  overdue: boolean;
  waitingOnParts: boolean;
  waitingOnPartsSources: number;
  requestHref: string;
  assetHref: string;
};

export type ScheduleColumnData = {
  id: string;
  label: string;
  subtitle?: string;
  date: string | null;
  cards: MaintenanceCardData[];
};

export type DropCardArgs = {
  taskKey: string;
  targetDate: string | null;
  targetIndex: number | null;
};
