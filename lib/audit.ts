import { createSupabaseBrowser } from "@/lib/supabase/client";

export async function writeAudit(params: {
  action: string;
  table_name: string;
  record_id?: string;
  meta?: unknown;
}) {
  const supabase = createSupabaseBrowser();

  const { error } = await supabase.from("audit_logs").insert({
    action: params.action,
    table_name: params.table_name,
    record_id: params.record_id ?? null,
    meta: params.meta ?? null,
  });

  // Don’t block user flow on audit failures, but log for debugging
  if (error) {
    console.warn("Audit insert failed:", error.message);
  }
}
