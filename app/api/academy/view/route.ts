import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ViewBody = {
  content_id: string;
  vehicle_id?: string | null;
  asset_type?: string | null;
};

function parseBody(value: unknown): ViewBody | null {
  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;

  const contentId = typeof obj.content_id === "string" ? obj.content_id.trim() : "";
  if (!contentId) return null;

  let vehicleId: string | null | undefined;
  if (typeof obj.vehicle_id === "string") {
    const trimmed = obj.vehicle_id.trim();
    vehicleId = trimmed || null;
  } else if (obj.vehicle_id === null || obj.vehicle_id === undefined) {
    vehicleId = obj.vehicle_id as null | undefined;
  }

  let assetType: string | null | undefined;
  if (typeof obj.asset_type === "string") {
    const trimmed = obj.asset_type.trim();
    assetType = trimmed || null;
  } else if (obj.asset_type === null || obj.asset_type === undefined) {
    assetType = obj.asset_type as null | undefined;
  }

  return {
    content_id: contentId,
    vehicle_id: vehicleId,
    asset_type: assetType,
  };
}

async function writeAuditServer(params: {
  action: string;
  table_name: string;
  record_id?: string;
  meta?: unknown;
}) {
  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.from("audit_logs").insert({
      action: params.action,
      table_name: params.table_name,
      record_id: params.record_id ?? null,
      meta: params.meta ?? null,
    });

    if (error) {
      console.warn("[academy/view] audit insert failed:", error.message);
    }
  } catch (error) {
    console.warn("[academy/view] audit write threw:", error);
  }
}

export async function POST(req: Request) {
  try {
    const bodyJson: unknown = await req.json();
    const body = parseBody(bodyJson);
    if (!body) {
      return NextResponse.json({ error: "Invalid body. content_id is required." }, { status: 400 });
    }

    const supabase = await createServerSupabase();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenMinutesAgoIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: recent, error: recentError } = await supabase
      .from("academy_views")
      .select("id, viewed_at")
      .eq("viewer_id", user.id)
      .eq("content_id", body.content_id)
      .gte("viewed_at", tenMinutesAgoIso)
      .order("viewed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentError) {
      console.error("[academy/view] recent lookup failed:", recentError);
      if ((recentError as { code?: string }).code === "42501") {
        return NextResponse.json({ error: "Not allowed by RLS." }, { status: 403 });
      }
      return NextResponse.json({ error: recentError.message }, { status: 500 });
    }

    if (recent?.id) {
      await writeAuditServer({
        action: "view_academy_content",
        table_name: "academy_views",
        record_id: body.content_id,
        meta: {
          user_id: user.id,
          content_id: body.content_id,
          vehicle_id: body.vehicle_id ?? null,
          asset_type: body.asset_type ?? null,
          recorded: false,
          reason: "debounced_recent_view",
        },
      });
      return NextResponse.json({ ok: true, recorded: false });
    }

    const insertPayload: Record<string, string | null> = {
      content_id: body.content_id,
      viewer_id: user.id,
    };
    if (typeof body.vehicle_id !== "undefined") {
      insertPayload.vehicle_id = body.vehicle_id ?? null;
    }
    if (typeof body.asset_type !== "undefined") {
      insertPayload.asset_type = body.asset_type ?? null;
    }

    let insertedId: string | null = null;

    const { data: inserted, error: insertError } = await supabase
      .from("academy_views")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertError) {
      if ((insertError as { code?: string }).code === "42501") {
        console.error("[academy/view] insert blocked by RLS:", insertError);
        return NextResponse.json({ error: "Not allowed by RLS." }, { status: 403 });
      }

      const missingOptionalColumns = (insertError as { code?: string }).code === "42703";

      if (!missingOptionalColumns) {
        console.error("[academy/view] insert failed:", insertError);
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      // Backward-compatible fallback if academy_views does not have optional columns yet.
      const { data: fallbackInserted, error: fallbackError } = await supabase
        .from("academy_views")
        .insert({
          content_id: body.content_id,
          viewer_id: user.id,
        })
        .select("id")
        .single();

      if (fallbackError) {
        if ((fallbackError as { code?: string }).code === "42501") {
          console.error("[academy/view] fallback blocked by RLS:", fallbackError);
          return NextResponse.json({ error: "Not allowed by RLS." }, { status: 403 });
        }
        console.error("[academy/view] fallback insert failed:", fallbackError);
        return NextResponse.json({ error: fallbackError.message }, { status: 500 });
      }

      insertedId = (fallbackInserted as { id?: string } | null)?.id ?? null;
    } else {
      insertedId = (inserted as { id?: string } | null)?.id ?? null;
    }

    await writeAuditServer({
      action: "view_academy_content",
      table_name: "academy_views",
      record_id: insertedId ?? body.content_id,
      meta: {
        user_id: user.id,
        content_id: body.content_id,
        vehicle_id: body.vehicle_id ?? null,
        asset_type: body.asset_type ?? null,
        recorded: true,
      },
    });

    return NextResponse.json({ ok: true, recorded: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record academy view";
    console.error("[academy/view] route error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
