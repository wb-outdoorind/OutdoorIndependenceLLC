import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import { canAccessRoute } from "@/lib/routeAccess";
import NewEmployeeClient from "./NewEmployeeClient";

export default async function Page() {
  const session = await getCurrentUserProfile();
  if (!session?.user) redirect("/login");

  const role = session?.effectiveRole ?? "employee";
  if (!canAccessRoute(role, "employees_create")) {
    redirect("/not-authorized?reason=employees_create");
  }

  return <NewEmployeeClient />;
}
