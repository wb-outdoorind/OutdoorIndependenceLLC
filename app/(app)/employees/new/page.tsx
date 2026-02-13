import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import NewEmployeeClient from "./NewEmployeeClient";

export default async function Page() {
  const session = await getCurrentUserProfile();
  if (!session?.user) redirect("/login");

  const role = session?.profile?.role ?? "employee";
  if (role !== "owner" && role !== "office_admin") {
    redirect("/not-authorized?reason=employees_create");
  }

  return <NewEmployeeClient />;
}
