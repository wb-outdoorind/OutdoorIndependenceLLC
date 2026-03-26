import { redirect } from "next/navigation";
import { getCurrentUserProfileStrict } from "@/lib/supabase/server";
import { isWilliamPlanningUser } from "@/lib/williamPlanningAccess";

export default async function DevelopmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentUserProfileStrict();

  if (!session?.user) {
    redirect("/login?next=%2Fsettings%2Fdevelopment%2Ffuture-platform");
  }

  if (!isWilliamPlanningUser(session.profile, session.user)) {
    redirect("/not-authorized?reason=william_only_future_platform_lab&next=/settings");
  }

  return <>{children}</>;
}
