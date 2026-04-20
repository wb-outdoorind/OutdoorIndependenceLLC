import { redirect } from "next/navigation";
import { canAccessRoute } from "@/lib/routeAccess";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import PurchasesClient from "../PurchasesClient";

type PurchaseDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PurchaseDetailPage({ params }: PurchaseDetailPageProps) {
  const session = await getCurrentUserProfile();
  if (!session?.user) {
    const nextId = encodeURIComponent((await params).id ?? "");
    redirect(`/login?next=%2Fpurchases%2F${nextId}`);
  }

  const role = session.effectiveRole ?? "employee";
  if (!canAccessRoute(role, "purchases")) {
    const nextId = encodeURIComponent((await params).id ?? "");
    redirect(`/not-authorized?reason=purchases_requires_mechanic_or_higher&next=/purchases/${nextId}`);
  }

  const fullName =
    typeof session.profile?.full_name === "string"
      ? session.profile.full_name
      : null;
  const email =
    typeof session.profile?.email === "string"
      ? session.profile.email
      : session.user.email ?? null;

  const { id } = await params;

  return (
    <PurchasesClient
      role={role}
      fullName={fullName}
      email={email}
      mode="detail"
      requestId={decodeURIComponent(id)}
    />
  );
}
