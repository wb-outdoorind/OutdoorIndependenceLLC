import { redirect } from "next/navigation";
import { canAccessRoute } from "@/lib/routeAccess";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import PurchasesClient from "../PurchasesClient";

export default async function NewPurchaseRequestPage() {
  const session = await getCurrentUserProfile();
  if (!session?.user) {
    redirect("/login?next=%2Fpurchases%2Fnew");
  }

  const role = session.effectiveRole ?? "employee";
  if (!canAccessRoute(role, "purchases")) {
    redirect("/not-authorized?reason=purchases_requires_mechanic_or_higher&next=/purchases/new");
  }

  const fullName =
    typeof session.profile?.full_name === "string"
      ? session.profile.full_name
      : null;
  const email =
    typeof session.profile?.email === "string"
      ? session.profile.email
      : session.user.email ?? null;

  return <PurchasesClient role={role} fullName={fullName} email={email} mode="new" />;
}
