import Link from "next/link";
import LogoutButton from "./logout-button";

const tiles = [
  { title: "Equipment", href: "/equipment", desc: "Track equipment records, specs, and history" },
  { title: "Vehicles", href: "/vehicles", desc: "Vehicle info, inspections, and maintenance" },
  { title: "Inventory", href: "/inventory", desc: "Parts, stock levels, reorder tracking" },
  { title: "Employees", href: "/employees", desc: "Team list, roles, and permissions" },
  { title: "Operations & Inspections", href: "/ops", desc: "Dashboards, inspections, maintenance history" },
  { title: "Scan QR Code", href: "/scan", desc: "Scan an asset QR code to pull it up fast" },
  { title: "Maintenance Center", href: "/maintenance", desc: "Fleet-wide maintenance queue for mechanics" },

];

export default function Home() {
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
            <div style={{ fontSize: 18, fontWeight: 800 }}>{t.title}</div>
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
