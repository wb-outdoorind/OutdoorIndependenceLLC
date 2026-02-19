import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import AcademyAdminClient from "./AcademyAdminClient";

export default async function AcademyAdminPage() {
  const session = await getCurrentUserProfile();
  const role = session?.profile?.role ?? "employee";

  const canManage = role === "owner" || role === "operations_manager" || role === "office_admin";
  if (!canManage) {
    redirect("/not-authorized?reason=academy_admin_requires_owner_or_office_admin&next=/academy");
  }

  return <AcademyAdminClient />;
}
