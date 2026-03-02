import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import LeadApprovalsClient from "./LeadApprovalsClient";

const ALLOWED = new Set([
  "owner",
  "operations_manager",
  "office_admin",
  "team_lead_1",
  "team_lead_2",
]);

export default async function ApprovalsPage() {
  const session = await getCurrentUserProfile();
  if (!session?.user) redirect("/login");
  const role = session.profile?.role ?? null;
  if (!role || !ALLOWED.has(role)) {
    redirect("/not-authorized?reason=lead_approvals_requires_lead_role&next=/approvals");
  }
  return <LeadApprovalsClient />;
}
