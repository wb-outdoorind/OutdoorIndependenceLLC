import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import FormsClient from "./FormsClient";

export default async function FormsPage() {
  const session = await getCurrentUserProfile();
  if (!session?.user) {
    redirect("/login?next=%2Fforms");
  }

  const role = session.effectiveRole ?? "employee";
  const fullName = typeof session.profile?.full_name === "string" ? session.profile.full_name : null;
  const email =
    typeof session.profile?.email === "string"
      ? session.profile.email
      : session.user.email ?? null;

  return <FormsClient role={role} fullName={fullName} email={email} />;
}
