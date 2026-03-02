import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import { canAccessRoute } from "@/lib/routeAccess";
import LeadApprovalsClient from "./LeadApprovalsClient";

export default async function ApprovalsPage() {
  const session = await getCurrentUserProfile();
  if (!session?.user) redirect("/login");
  const role = session.effectiveRole ?? null;
  if (!canAccessRoute(role, "lead_approvals")) {
    redirect("/not-authorized?reason=lead_approvals_requires_lead_role&next=/approvals");
  }
  return <LeadApprovalsClient />;
}
