import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserProfile, createServerSupabase } from "@/lib/supabase/server";
import DigestDetailsClient, { type DigestActionRow, type DigestAssetLabelMap } from "./DigestDetailsClient";

type VehicleRow = {
  id: string;
  name: string | null;
  status: string | null;
};

type EquipmentRow = {
  id: string;
  name: string | null;
  status: string | null;
};

function normalizeDateKey(value: string) {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

export default async function DigestDetailsPage({ params }: { params: Promise<{ date: string }> }) {
  const session = await getCurrentUserProfile();
  if (!session?.user) redirect("/login");

  const role = session.profile?.role ?? null;
  const canView = role === "owner" || role === "mechanic";
  if (!canView) {
    redirect("/not-authorized?reason=digest_details_requires_owner_or_mechanic&next=/notifications");
  }

  const resolvedParams = await params;
  const dateKey = normalizeDateKey(decodeURIComponent(resolvedParams.date || ""));
  if (!dateKey) {
    redirect("/notifications");
  }

  const supabase = await createServerSupabase();
  const endExclusive = new Date(`${dateKey}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  const { data: actionsData, error: actionsError } = await supabase
    .from("trend_actions")
    .select("id,asset_type,asset_id,action_type,status,summary,detail,created_at,resolved_at")
    .lte("created_at", endExclusive.toISOString())
    .order("created_at", { ascending: false })
    .limit(500);

  if (actionsError) {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", paddingBottom: 32 }}>
        <h1 style={{ marginBottom: 8 }}>Digest Details</h1>
        <div style={{ color: "#ff9d9d" }}>Failed to load trend actions: {actionsError.message}</div>
        <div style={{ marginTop: 14 }}>
          <Link href="/notifications" style={buttonStyle}>Back to Notifications</Link>
        </div>
      </main>
    );
  }

  const actions = (actionsData ?? []) as DigestActionRow[];
  const vehicleIds = Array.from(new Set(actions.filter((a) => a.asset_type === "vehicle").map((a) => a.asset_id)));
  const equipmentIds = Array.from(new Set(actions.filter((a) => a.asset_type === "equipment").map((a) => a.asset_id)));

  const [vehiclesRes, equipmentRes] = await Promise.all([
    vehicleIds.length
      ? supabase.from("vehicles").select("id,name,status").in("id", vehicleIds)
      : Promise.resolve({ data: [], error: null }),
    equipmentIds.length
      ? supabase.from("equipment").select("id,name,status").in("id", equipmentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const labelMap: DigestAssetLabelMap = {};
  for (const row of ((vehiclesRes.data ?? []) as VehicleRow[])) {
    const label = row.name?.trim() || row.id;
    const status = row.status?.trim();
    labelMap[`vehicle:${row.id}`] = status ? `Vehicle: ${label} [${status}]` : `Vehicle: ${label}`;
  }
  for (const row of ((equipmentRes.data ?? []) as EquipmentRow[])) {
    const label = row.name?.trim() || row.id;
    const status = row.status?.trim();
    labelMap[`equipment:${row.id}`] = status ? `Equipment: ${label} [${status}]` : `Equipment: ${label}`;
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", paddingBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ marginBottom: 6 }}>Digest Details ({dateKey})</h1>
        <Link href="/notifications" style={buttonStyle}>Back to Notifications</Link>
      </div>
      <div style={{ opacity: 0.75, marginBottom: 14 }}>
        Snapshot includes trend actions created on or before this digest date.
      </div>
      <DigestDetailsClient initialActions={actions} assetLabels={labelMap} dateKey={dateKey} />
    </main>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  fontWeight: 800,
  textDecoration: "none",
};
