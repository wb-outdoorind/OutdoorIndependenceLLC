import Link from "next/link";
import LogoutButton from "./logout-button";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const tiles = [
  { title: "Equipment", href: "/equipment", desc: "Track equipment records, specs, and history" },
  { title: "Vehicles", href: "/vehicles", desc: "Vehicle info, inspections, and maintenance" },
  { title: "Inventory", href: "/inventory?filter=low", desc: "Parts, stock levels, reorder tracking" },
  { title: "Employees", href: "/employees", desc: "Team list, roles, and permissions" },
  { title: "Operations & Inspections", href: "/ops", desc: "Dashboards, inspections, maintenance history" },
  { title: "Scan QR Code", href: "/scan", desc: "Scan an asset QR code to pull it up fast" },
  { title: "Maintenance Center", href: "/maintenance", desc: "Fleet-wide maintenance queue for mechanics" },

];

type InventoryLowStockRow = {
  quantity: number;
  minimum_quantity: number;
};

export default async function Home() {
  let lowStockCount = 0;
  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from("inventory_items")
      .select("quantity,minimum_quantity")
      .eq("is_active", true);

    if (error) {
      console.error("[dashboard] failed to load low stock count:", error);
    } else {
      lowStockCount = ((data ?? []) as InventoryLowStockRow[]).filter(
        (item) => Number(item.quantity) <= Number(item.minimum_quantity)
      ).length;
    }
  } catch (error) {
    console.error("[dashboard] unexpected low stock count error:", error);
  }

  return (
    <main style={{ padding: 32, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
  <div>
    <h1 style={{ fontSize: 34, marginBottom: 6 }}>Home</h1>
    <p style={{ opacity: 0.75, marginTop: 0 }}>
      Choose a section to manage assets and operations.
    </p>
  </div>

  <LogoutButton />
</div>

      <p style={{ opacity: 0.75, marginTop: 0 }}>
      </p>

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
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 16,
              padding: 18,
              textDecoration: "none",
              color: "inherit",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
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
            <div style={{ opacity: 0.72, marginTop: 8, lineHeight: 1.35 }}>
              {t.desc}
            </div>

            <div style={{ marginTop: 14, opacity: 0.8, fontSize: 13 }}>
              Open →
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
