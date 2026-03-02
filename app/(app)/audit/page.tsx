import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import { canAccessRoute } from "@/lib/routeAccess";
import AuditTrailClient from "./AuditTrailClient";

export default async function AuditTrailPage() {
  const session = await getCurrentUserProfile();
  if (!session?.user) redirect("/login");

  const role = session.effectiveRole ?? "employee";
  if (!canAccessRoute(role, "audit_trail")) {
    redirect("/not-authorized?reason=audit_trail_requires_management_or_mechanic&next=/");
  }

  return <AuditTrailClient />;
}
