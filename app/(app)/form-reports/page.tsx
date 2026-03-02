import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import { canAccessRoute } from "@/lib/routeAccess";
import FormReportsClient from "./FormReportsClient";

export default async function FormReportsPage() {
  const session = await getCurrentUserProfile();
  if (!session?.user) redirect("/login");

  const role = session?.effectiveRole ?? "employee";
  if (!canAccessRoute(role, "accountability_center")) {
    redirect("/not-authorized?reason=accountability_center_requires_management_or_mechanic");
  }

  return <FormReportsClient />;
}
