import Link from "next/link";
import Image from "next/image";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const baseTiles = [
  { title: "Scan QR Code", href: "/scan", desc: "Scan an asset QR code to pull it up fast" },
  { title: "Vehicles", href: "/vehicles", desc: "Vehicle info, inspections, and maintenance" },
  { title: "Equipment", href: "/equipment", desc: "Track equipment records, specs, and history" },
  { title: "Inventory", href: "/inventory?filter=low", desc: "Parts, stock levels, reorder tracking" },
  { title: "Maintenance Center", href: "/maintenance", desc: "Queue, PM planning, downtime, and maintenance operations" },
  { title: "OI Academy", href: "/academy", desc: "SOP PDFs and training videos" },
  { title: "Teammates", href: "/employees", desc: "Team list, roles, and permissions" },
];

type InventoryLowStockRow = {
  quantity: number;
  minimum_quantity: number;
};

type ProfileRow = {
  role: string | null;
  full_name: string | null;
  email: string | null;
};

type VehicleRequestRow = {
  status: string | null;
  urgency: string | null;
  description: string | null;
};

type EquipmentRequestRow = {
  status: string | null;
  urgency: string | null;
  description: string | null;
};

type GradeRow = {
  score: number | null;
  accountability_flag: boolean | null;
};

type InspectionRow = {
  inspection_type: string | null;
  overall_status: string | null;
  created_at: string;
  checklist: unknown;
};

type DashboardData = {
  title: string;
  subtitle: string;
  stats: Array<{ label: string; value: string }>;
  actions: Array<{ label: string; href: string }>;
};

function parseChecklistEmployee(checklist: unknown) {
  if (!checklist || typeof checklist !== "object") return "";
  const employee = (checklist as Record<string, unknown>).employee;
  if (typeof employee !== "string") return "";
  return employee.trim();
}

function todayDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export default async function Home() {
  let lowStockCount = 0;
  let role: string | null = null;
  let tiles = [...baseTiles];
  let dashboard: DashboardData | null = null;

  try {
    const supabase = await createServerSupabase();
    const { data: authData } = await supabase.auth.getUser();

    let profile: ProfileRow | null = null;
    if (authData.user?.id) {
      const { data } = await supabase
        .from("profiles")
        .select("role,full_name,email")
        .eq("id", authData.user.id)
        .maybeSingle();
      profile = (data as ProfileRow | null) ?? null;
      role = profile?.role ?? null;
    }

    const { data: inventoryRows, error: inventoryError } = await supabase
      .from("inventory_items")
      .select("quantity,minimum_quantity")
      .eq("is_active", true);

    if (inventoryError) {
      console.error("[dashboard] failed to load low stock count:", inventoryError);
    } else {
      lowStockCount = ((inventoryRows ?? []) as InventoryLowStockRow[]).filter(
        (item) => Number(item.quantity) <= Number(item.minimum_quantity)
      ).length;
    }

    const isLeadership =
      role === "owner" || role === "operations_manager" || role === "office_admin";
    const isMechanic = role === "mechanic";

    if (role === "owner" || role === "operations_manager") {
      tiles = [
        ...tiles,
        {
          title: "Form Reports",
          href: "/form-reports",
          desc: "Auto-graded form quality, teammate scores, and accountability flags",
        },
      ];
    }

    if (isLeadership) {
      const [vehicleReqRes, equipmentReqRes, gradesRes] = await Promise.all([
        supabase
          .from("maintenance_requests")
          .select("status,urgency")
          .in("status", ["Open", "In Progress"]),
        supabase
          .from("equipment_maintenance_requests")
          .select("status,urgency")
          .in("status", ["Open", "In Progress"]),
        supabase
          .from("form_submission_grades")
          .select("score,accountability_flag")
          .order("submitted_at", { ascending: false })
          .limit(400),
      ]);

      const vehicleReqs = (vehicleReqRes.data ?? []) as VehicleRequestRow[];
      const equipmentReqs = (equipmentReqRes.data ?? []) as EquipmentRequestRow[];
      const grades = (gradesRes.data ?? []) as GradeRow[];

      const openQueue = vehicleReqs.length + equipmentReqs.length;
      const urgentQueue = [...vehicleReqs, ...equipmentReqs].filter((row) => {
        const urgency = (row.urgency ?? "").trim();
        return urgency === "High" || urgency === "Urgent";
      }).length;
      const accountabilityFlags = grades.filter((row) => row.accountability_flag === true).length;
      const avgFormScore = grades.length
        ? Math.round(
            grades.reduce((sum, row) => sum + Number(row.score ?? 0), 0) / grades.length
          )
        : 0;

      dashboard = {
        title: "Operations Dashboard",
        subtitle:
          role === "office_admin"
            ? "Live operations overview for office administration."
            : "Live operations overview for leadership.",
        stats: [
          { label: "Open Queue", value: String(openQueue) },
          { label: "High/Urgent", value: String(urgentQueue) },
          { label: "Low Stock", value: String(lowStockCount) },
          { label: "Avg Form Score", value: `${avgFormScore}%` },
          { label: "Accountability Flags", value: String(accountabilityFlags) },
        ],
        actions: [
          { label: "Open Maintenance Center", href: "/maintenance" },
          { label: "View Form Reports", href: "/form-reports" },
          { label: "Open Inventory Alerts", href: "/inventory/alerts" },
        ],
      };
    } else if (isMechanic) {
      const [vehicleReqRes, equipmentReqRes] = await Promise.all([
        supabase
          .from("maintenance_requests")
          .select("status,urgency")
          .in("status", ["Open", "In Progress"]),
        supabase
          .from("equipment_maintenance_requests")
          .select("status,urgency")
          .in("status", ["Open", "In Progress"]),
      ]);

      const vehicleReqs = (vehicleReqRes.data ?? []) as VehicleRequestRow[];
      const equipmentReqs = (equipmentReqRes.data ?? []) as EquipmentRequestRow[];
      const openQueue = vehicleReqs.length + equipmentReqs.length;
      const urgentQueue = [...vehicleReqs, ...equipmentReqs].filter((row) => {
        const urgency = (row.urgency ?? "").trim();
        return urgency === "High" || urgency === "Urgent";
      }).length;

      dashboard = {
        title: "Mechanic Dashboard",
        subtitle: "Active queue, priority issues, and parts risk.",
        stats: [
          { label: "Open Queue", value: String(openQueue) },
          { label: "High/Urgent", value: String(urgentQueue) },
          { label: "Low Stock Parts", value: String(lowStockCount) },
        ],
        actions: [
          { label: "Open Maintenance Center", href: "/maintenance" },
          { label: "Open Inventory", href: "/inventory" },
          { label: "Open Notifications", href: "/notifications" },
        ],
      };
    } else {
      const teammateName =
        (profile?.full_name || "").trim() ||
        ((profile?.email || "").split("@")[0] || "").trim();
      const teammateNeedle = teammateName.toLowerCase();
      const today = todayDateKey();

      const [inspectionsRes, vehicleReqRes, equipmentReqRes] = await Promise.all([
        supabase
          .from("inspections")
          .select("inspection_type,overall_status,created_at,checklist")
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("maintenance_requests")
          .select("status,description")
          .in("status", ["Open", "In Progress"])
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("equipment_maintenance_requests")
          .select("status,description")
          .in("status", ["Open", "In Progress"])
          .order("created_at", { ascending: false })
          .limit(300),
      ]);

      const inspections = (inspectionsRes.data ?? []) as InspectionRow[];
      const vehicleReqs = (vehicleReqRes.data ?? []) as VehicleRequestRow[];
      const equipmentReqs = (equipmentReqRes.data ?? []) as EquipmentRequestRow[];

      const myTodayInspections = inspections.filter((row) => {
        if (!row.created_at.startsWith(today)) return false;
        const employee = parseChecklistEmployee(row.checklist).toLowerCase();
        if (!employee || !teammateNeedle) return false;
        return employee === teammateNeedle;
      });

      const preTripToday = myTodayInspections.filter(
        (row) => (row.inspection_type ?? "").trim() === "Pre-Trip"
      ).length;
      const postTripToday = myTodayInspections.filter(
        (row) => (row.inspection_type ?? "").trim() === "Post-Trip"
      ).length;
      const issueReportsToday = myTodayInspections.filter((row) => {
        const s = (row.overall_status ?? "").trim();
        return s === "Fail - Maintenance Required" || s === "Out of Service";
      }).length;

      const myOpenVehicleRequests = vehicleReqs.filter((row) =>
        (row.description ?? "").toLowerCase().includes(`teammate: ${teammateNeedle}`)
      ).length;
      const myOpenEquipmentRequests = equipmentReqs.filter((row) =>
        (row.description ?? "").toLowerCase().includes(`teammate: ${teammateNeedle}`)
      ).length;

      dashboard = {
        title: "Teammate Dashboard",
        subtitle: "Today’s completion status and your active issues.",
        stats: [
          { label: "Pre-Trips Today", value: String(preTripToday) },
          { label: "Post-Trips Today", value: String(postTripToday) },
          { label: "Issues Reported Today", value: String(issueReportsToday) },
          {
            label: "Your Open Requests",
            value: String(myOpenVehicleRequests + myOpenEquipmentRequests),
          },
        ],
        actions: [
          { label: "Scan QR to Start", href: "/scan" },
          { label: "Open Vehicles", href: "/vehicles" },
          { label: "Open Notifications", href: "/notifications" },
        ],
      };
    }
  } catch (error) {
    console.error("[dashboard] unexpected dashboard load error:", error);
  }

  return (
    <main
      style={{
        padding: "calc(40px + env(safe-area-inset-top)) 20px 28px 8px",
        maxWidth: 1100,
        margin: "0 auto",
        color: "var(--foreground)",
        background: "var(--background)",
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <Image
          src="/App_Logo.png"
          alt="Outdoor Independence logo"
          width={300}
          height={56}
          className="brand-logo"
          style={{ height: 56, width: "auto", objectFit: "contain" }}
        />
        <Link href="/settings" style={headerButtonStyle}>
          Settings
        </Link>
      </div>
      <h1 style={{ margin: "6px 0 10px", textAlign: "center" }}>Home</h1>
      <p style={{ opacity: 0.75, marginTop: 0 }}>
        Choose a section to manage assets and operations.
      </p>

      {dashboard ? (
        <section style={{ ...dashboardCardStyle, marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>{dashboard.title}</div>
              <div style={{ opacity: 0.75, marginTop: 4 }}>{dashboard.subtitle}</div>
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 10,
            }}
          >
            {dashboard.stats.map((stat) => (
              <div key={stat.label} style={statCardStyle}>
                <div style={{ opacity: 0.72, fontSize: 12 }}>{stat.label}</div>
                <div style={{ fontWeight: 900, fontSize: 22, marginTop: 2 }}>{stat.value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {dashboard.actions.map((action) => (
              <Link key={action.href} href={action.href} style={dashboardActionStyle}>
                {action.label}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
          marginTop: 22,
        }}
      >
        {tiles.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            style={{
              border: "1px solid var(--surface-border)",
              borderRadius: 16,
              padding: 18,
              textDecoration: "none",
              color: "inherit",
              background: "var(--surface)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 800 }}>{t.title}</div>
              {t.title === "Inventory" && lowStockCount > 0 ? (
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: "#ffdfdf",
                    background: "rgba(190,40,40,0.45)",
                    border: "1px solid rgba(255,120,120,0.6)",
                    borderRadius: 999,
                    padding: "3px 9px",
                  }}
                >
                  {lowStockCount} Low
                </div>
              ) : null}
            </div>
            <div style={{ opacity: 0.82, marginTop: 8, lineHeight: 1.35 }}>
              {t.desc}
            </div>

            <div style={{ marginTop: 14, opacity: 0.85, fontSize: 13 }}>Open →</div>
          </Link>
        ))}
      </div>
    </main>
  );
}

const headerButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid var(--surface-border)",
  background: "var(--surface)",
  color: "inherit",
  textDecoration: "none",
  fontWeight: 800,
};

const dashboardCardStyle: React.CSSProperties = {
  border: "1px solid var(--surface-border)",
  borderRadius: 16,
  padding: 16,
  background: "var(--surface)",
};

const statCardStyle: React.CSSProperties = {
  border: "1px solid var(--surface-border)",
  borderRadius: 12,
  padding: 10,
  background: "rgba(255,255,255,0.02)",
};

const dashboardActionStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid var(--surface-border)",
  background: "rgba(255,255,255,0.05)",
  color: "inherit",
  textDecoration: "none",
  fontWeight: 800,
  fontSize: 13,
};
