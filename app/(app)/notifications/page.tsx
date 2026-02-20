import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import NotificationsClient from "./NotificationsClient";

export default async function NotificationsPage() {
  const session = await getCurrentUserProfile();
  if (!session?.user) redirect("/login");
  return <NotificationsClient role={session.profile?.role ?? null} />;
}
