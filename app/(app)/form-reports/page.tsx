import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import FormReportsClient from "./FormReportsClient";

export default async function FormReportsPage() {
  const session = await getCurrentUserProfile();
  if (!session?.user) redirect("/login");

  const role = session?.profile?.role ?? "employee";
  const canView = role === "owner" || role === "operations_manager";
  if (!canView) {
    redirect("/not-authorized?reason=form_reports_requires_owner_or_operations_manager");
  }

  return <FormReportsClient />;
}
