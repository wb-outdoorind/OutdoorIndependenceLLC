import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import EmployeesClient from "./EmployeesClient";

export default async function EmployeesPage() {
  const session = await getCurrentUserProfile();

  if (!session?.user) {
    redirect("/login");
  }

  const role = session?.profile?.role ?? "employee";

  return <EmployeesClient role={role} />;
}
