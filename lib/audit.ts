import { createSupabaseBrowser } from "@/lib/supabase/client";

export async function writeAudit(params: {
  action: string;
  table_name: string;
  record_id?: string;
  event_type?: string;
  entity_type?: string;
  entity_id?: string;
  before_data?: unknown;
  after_data?: unknown;
  meta?: unknown;
}) {
  const supabase = createSupabaseBrowser();
  let actorId: string | null = null;
  let actorRole: string | null = null;

  const { data: authData } = await supabase.auth.getUser();
  actorId = authData.user?.id ?? null;
  if (actorId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", actorId)
      .maybeSingle();
    actorRole = typeof profile?.role === "string" ? profile.role : null;
  }

  const { error } = await supabase.from("audit_logs").insert({
    action: params.action,
    table_name: params.table_name,
    record_id: params.record_id ?? null,
    event_type: params.event_type ?? params.action,
    entity_type: params.entity_type ?? params.table_name,
    entity_id: params.entity_id ?? params.record_id ?? null,
    actor_id: actorId,
    actor_role: actorRole,
    before_data: params.before_data ?? null,
    after_data: params.after_data ?? null,
    meta: params.meta ?? null,
  });

  // Don’t block user flow on audit failures, but log for debugging
  if (error) {
    console.warn("Audit insert failed:", error.message);
  }
}
