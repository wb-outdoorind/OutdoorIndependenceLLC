import type { SupabaseClient } from "@supabase/supabase-js";

const COPILOT_RETENTION_DAYS = 90;
const COPILOT_MAX_EVENTS_PER_USER = 2000;
const OVERFLOW_BATCH_SIZE = 300;
const OVERFLOW_MAX_PASSES = 8;

type CopilotAdmin = SupabaseClient;

export async function pruneCopilotContextEvents(admin: CopilotAdmin, userId: string) {
  const cutoff = new Date(Date.now() - COPILOT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await admin
    .from("copilot_context_events")
    .delete()
    .eq("user_id", userId)
    .lt("created_at", cutoff);

  for (let pass = 0; pass < OVERFLOW_MAX_PASSES; pass += 1) {
    const { data: overflowRows, error: overflowReadError } = await admin
      .from("copilot_context_events")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(COPILOT_MAX_EVENTS_PER_USER, COPILOT_MAX_EVENTS_PER_USER + OVERFLOW_BATCH_SIZE - 1);

    if (overflowReadError || !overflowRows?.length) break;

    const overflowIds = overflowRows.map((row) => row.id);
    const { error: overflowDeleteError } = await admin
      .from("copilot_context_events")
      .delete()
      .in("id", overflowIds);

    if (overflowDeleteError || overflowRows.length < OVERFLOW_BATCH_SIZE) break;
  }
}
