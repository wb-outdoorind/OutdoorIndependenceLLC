import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import OpsClient from "./OpsClient";

export default async function OpsPage() {
  const session = await getCurrentUserProfile();
  const role = session?.profile?.role ?? "employee";

  const canView = role === "owner" || role === "office_admin" || role === "mechanic";
  if (!canView) {
    redirect("/not-authorized?reason=ops_requires_manager_or_mechanic&next=/");
  }

  return <OpsClient />;
}
