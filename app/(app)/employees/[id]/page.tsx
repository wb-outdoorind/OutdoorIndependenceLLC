import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import EditEmployeeClient from "./EditEmployeeClient";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await getCurrentUserProfile();
  if (!session?.user) redirect("/login");

  const role = session?.profile?.role ?? "employee";
  if (role !== "owner" && role !== "office_admin") {
    redirect("/not-authorized?reason=employees_cannot_edit");
  }

  return <EditEmployeeClient id={id} />;
}
