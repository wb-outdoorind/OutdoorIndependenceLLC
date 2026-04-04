import PeopleHubContainer from "@/components/people/PeopleHubContainer";
import type {
  AccountabilitySignalItem,
  ApprovalDecisionItem,
  TeamVisibilityItem,
} from "@/components/people/types";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  full_name: string | null;
  email: string | null;
};

type InspectionApprovalRow = {
  id: string | number;
  vehicle_id: string;
  inspection_type: string | null;
  lead_approval_requested_at: string | null;
  checklist: Record<string, unknown> | null;
};

type AccountabilityActionRow = {
  id: number;
  created_at: string;
  target_user_id: string | null;
  action_type: string;
  status: string;
  note: string | null;
  due_date: string | null;
};

type FlaggedGradeRow = {
  id: number;
  form_type: string;
  submitted_at: string;
  submitted_by: string | null;
  accountability_reason: string | null;
};

type RecentActivityRow = {
  id: number;
  form_type: string;
  submitted_at: string;
  submitted_by: string | null;
};

function profileName(profile: ProfileRow | null | undefined) {
  if (!profile) return "Unknown teammate";
  const direct = profile.full_name?.trim();
  if (direct) return direct;
  const first = profile.first_name?.trim() ?? "";
  const last = profile.last_name?.trim() ?? "";
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  const nickname = profile.nickname?.trim();
  if (nickname) return nickname;
  return profile.email?.trim() || "Unknown teammate";
}

function isUuid(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    normalized
  );
}

function formatDateLabel(value: string | null | undefined) {
  if (!value) return "date unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function checklistTeammateName(checklist: Record<string, unknown> | null | undefined) {
  const raw = checklist && typeof checklist.employee === "string" ? checklist.employee.trim() : "";
  return raw || "Unknown teammate";
}

function vehicleLabel(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed ? `Vehicle ${trimmed}` : "Vehicle pending";
}

function titleCase(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  if (!normalized) return "Unknown";
  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export default async function FuturePlatformPeopleHubPreviewPage() {
  const session = await getCurrentUserProfileStrict();
  const userId = session?.user?.id ?? null;
  const admin = createSupabaseAdmin();

  const [
    approvalsRes,
    actionsRes,
    flaggedRes,
    teamActivityRes,
  ] = await Promise.all([
    userId
      ? admin
          .from("inspections")
          .select(
            "id,vehicle_id,inspection_type,lead_approval_requested_at,checklist",
            { count: "exact" }
          )
          .eq("lead_approver_id", userId)
          .eq("lead_approval_status", "pending")
          .order("lead_approval_requested_at", { ascending: true })
          .limit(5)
      : Promise.resolve({ data: [], count: 0, error: null }),
    admin
      .from("accountability_actions")
      .select("id,created_at,target_user_id,action_type,status,note,due_date")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(40),
    admin
      .from("form_submission_grades")
      .select("id,form_type,submitted_at,submitted_by,accountability_reason")
      .eq("accountability_flag", true)
      .order("submitted_at", { ascending: false })
      .limit(40),
    admin
      .from("form_submission_grades")
      .select("id,form_type,submitted_at,submitted_by")
      .order("submitted_at", { ascending: false })
      .limit(40),
  ]);

  if (approvalsRes.error) {
    console.error("[people-hub] approvals load error", approvalsRes.error);
  }
  if (actionsRes.error) {
    console.error("[people-hub] accountability actions load error", actionsRes.error);
  }
  if (flaggedRes.error) {
    console.error("[people-hub] flagged forms load error", flaggedRes.error);
  }
  if (teamActivityRes.error) {
    console.error("[people-hub] team visibility load error", teamActivityRes.error);
  }

  const approvalRows = ((approvalsRes.data ?? []) as InspectionApprovalRow[]).slice(0, 5);
  const actionRows = ((actionsRes.data ?? []) as AccountabilityActionRow[]).slice();
  const flaggedRows = ((flaggedRes.data ?? []) as FlaggedGradeRow[]).slice();
  const teamActivityRows = ((teamActivityRes.data ?? []) as RecentActivityRow[]).slice();

  const profileIds = new Set<string>();
  actionRows.forEach((row) => {
    if (isUuid(row.target_user_id)) profileIds.add(row.target_user_id!.trim());
  });
  flaggedRows.forEach((row) => {
    if (isUuid(row.submitted_by)) profileIds.add(row.submitted_by!.trim());
  });
  teamActivityRows.forEach((row) => {
    if (isUuid(row.submitted_by)) profileIds.add(row.submitted_by!.trim());
  });

  const profileMap = new Map<string, ProfileRow>();
  if (profileIds.size) {
    const profilesRes = await admin
      .from("profiles")
      .select("id,first_name,last_name,nickname,full_name,email")
      .in("id", Array.from(profileIds));

    if (profilesRes.error) {
      console.error("[people-hub] profile lookup error", profilesRes.error);
    } else {
      for (const profile of (profilesRes.data ?? []) as ProfileRow[]) {
        profileMap.set(profile.id, profile);
      }
    }
  }

  const approvalItems: ApprovalDecisionItem[] = approvalRows.map((row) => {
    const teammate = checklistTeammateName(row.checklist);
    const inspectionType = row.inspection_type === "Post-Trip" ? "Post-Trip" : "Pre-Trip";
    return {
      id: `approval-${row.id}`,
      title: teammate,
      subtitle: `${inspectionType} • ${vehicleLabel(row.vehicle_id)} • Requested ${formatDateLabel(
        row.lead_approval_requested_at
      )}`,
      href: `/approvals?inspection=${encodeURIComponent(String(row.id))}`,
    };
  });

  function nameForPersonRef(value: string | null | undefined) {
    const normalized = (value ?? "").trim();
    if (!normalized) return "Unknown teammate";
    if (isUuid(normalized)) return profileName(profileMap.get(normalized));
    return normalized;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdueItems: AccountabilitySignalItem[] = actionRows
    .filter((row) => row.status === "open" && row.due_date && new Date(row.due_date) < today)
    .sort((left, right) => new Date(left.due_date ?? "").getTime() - new Date(right.due_date ?? "").getTime())
    .map((row) => {
      const teammate = profileName(row.target_user_id ? profileMap.get(row.target_user_id) : null);
      return {
        id: `accountability-overdue-${row.id}`,
        title: teammate,
        subtitle: `${titleCase(row.action_type)} • Due ${formatDateLabel(row.due_date)}${
          row.note?.trim() ? ` • ${row.note.trim()}` : ""
        }`,
        href: "/form-reports",
        priority: "overdue" as const,
      };
    });

  const flaggedItems: AccountabilitySignalItem[] = flaggedRows
    .sort((left, right) => new Date(right.submitted_at).getTime() - new Date(left.submitted_at).getTime())
    .map((row) => {
      const teammate = nameForPersonRef(row.submitted_by);
      return {
        id: `accountability-flagged-${row.id}`,
        title: teammate,
        subtitle: `${titleCase(row.form_type)} flagged • ${row.accountability_reason?.trim() || "Needs review"} • ${formatDateLabel(
          row.submitted_at
        )}`,
        href: "/form-reports",
        priority: "flagged" as const,
      };
    });

  const recentItems: AccountabilitySignalItem[] = actionRows
    .filter((row) => row.status === "open" && (!row.due_date || new Date(row.due_date) >= today))
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .map((row) => {
      const teammate = nameForPersonRef(row.target_user_id);
      return {
        id: `accountability-recent-${row.id}`,
        title: teammate,
        subtitle: `${titleCase(row.action_type)} • Added ${formatDateLabel(row.created_at)}${
          row.note?.trim() ? ` • ${row.note.trim()}` : ""
        }`,
        href: "/form-reports",
        priority: "recent" as const,
      };
    });

  const accountabilityItems = [...overdueItems, ...flaggedItems, ...recentItems].slice(0, 5);

  const seenTeammates = new Set<string>();
  const teamVisibilityItems: TeamVisibilityItem[] = [];
  for (const row of teamActivityRows) {
    const teammateRef = row.submitted_by?.trim();
    const teammateName = nameForPersonRef(teammateRef);
    const dedupeKey = teammateRef || teammateName;
    if (!dedupeKey || teammateName === "Unknown teammate" || seenTeammates.has(dedupeKey)) continue;
    seenTeammates.add(dedupeKey);
    teamVisibilityItems.push({
      id: `activity-${row.id}`,
      title: teammateName,
      subtitle: `${titleCase(row.form_type)} submitted • ${formatDateLabel(row.submitted_at)}`,
      href:
        teammateRef && isUuid(teammateRef)
          ? `/employees/${encodeURIComponent(teammateRef)}`
          : "/employees",
    });
    if (teamVisibilityItems.length >= 5) break;
  }

  return (
    <PeopleHubContainer
      accountabilityItems={accountabilityItems}
      approvalItems={approvalItems}
      teamVisibilityItems={teamVisibilityItems}
      counts={{
        issues: overdueItems.length + flaggedItems.length + recentItems.length,
        approvals: approvalsRes.count ?? approvalItems.length,
      }}
    />
  );
}
