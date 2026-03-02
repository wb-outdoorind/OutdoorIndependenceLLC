import type { SupabaseClient } from "@supabase/supabase-js";

type ServerAuditParams = {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  tableName?: string | null;
  recordId?: string | null;
  eventType?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  meta?: unknown;
};

export async function writeServerAudit(admin: SupabaseClient, params: ServerAuditParams) {
  const { error } = await admin.from("audit_logs").insert({
    actor_id: params.actorId ?? null,
    actor_role: params.actorRole ?? null,
    action: params.action,
    table_name: params.tableName ?? null,
    record_id: params.recordId ?? null,
    event_type: params.eventType ?? params.action,
    entity_type: params.entityType ?? params.tableName ?? null,
    entity_id: params.entityId ?? params.recordId ?? null,
    before_data: params.beforeData ?? null,
    after_data: params.afterData ?? null,
    meta: params.meta ?? null,
  });

  if (error) {
    console.warn("Server audit insert failed:", error.message);
  }
}
