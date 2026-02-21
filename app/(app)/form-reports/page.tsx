import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import FormReportsClient from "./FormReportsClient";

export default async function FormReportsPage() {
  const session = await getCurrentUserProfile();
  if (!session?.user) redirect("/login");

  const role = session?.profile?.role ?? "employee";
  const canView =
    role === "owner" ||
    role === "operations_manager" ||
    role === "office_admin" ||
    role === "mechanic";
  if (!canView) {
    redirect("/not-authorized?reason=accountability_center_requires_management_or_mechanic");
  }

  return <FormReportsClient />;
}
