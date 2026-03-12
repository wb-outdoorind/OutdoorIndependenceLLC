import Link from "next/link";
import { redirect } from "next/navigation";
import { canAccessRoute } from "@/lib/routeAccess";
import { getCurrentUserProfile } from "@/lib/supabase/server";

export default async function FertilizingOperationsPage() {
  const session = await getCurrentUserProfile();
  if (!session?.user) {
    redirect("/login?next=%2Ffertilizing");
  }

  const role = session.effectiveRole ?? "employee";
  if (!canAccessRoute(role, "fertilizing_operations")) {
    redirect("/not-authorized?reason=fertilizing_operations_requires_mechanic_or_higher&next=/fertilizing");
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", paddingBottom: 36 }}>
      <section style={cardStyle}>
        <h1 style={{ marginTop: 0, marginBottom: 8 }}>Fertilizing Operations Dashboard</h1>
        <p style={{ marginTop: 0, opacity: 0.84 }}>
          Phase 1 is now available in the data model. Dashboard workflows and service execution UI are next.
        </p>
        <div style={gridStyle}>
          <div style={panelStyle}>
            <div style={panelTitleStyle}>Clients & Properties</div>
            <div style={panelBodyStyle}>
              Foundation tables are in place for client records, addresses, lawn size, property type, and gate/pet
              fields.
            </div>
          </div>
          <div style={panelStyle}>
            <div style={panelTitleStyle}>Compliance Fields Ready</div>
            <div style={panelBodyStyle}>
              Chemical records support EPA registration number, batch/lot number, re-entry/PPE notes, applicator
              license, and legal signature mode.
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/maintenance" style={buttonStyle}>
            Open Maintenance Operations Dashboard
          </Link>
          <Link href="/academy" style={buttonStyle}>
            Open OI Academy
          </Link>
        </div>
      </section>
    </main>
  );
}

const cardStyle = {
  border: "1px solid var(--surface-border)",
  borderRadius: 16,
  background: "var(--surface)",
  padding: 18,
};

const gridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  marginTop: 14,
};

const panelStyle = {
  border: "1px solid var(--surface-border)",
  borderRadius: 12,
  padding: 14,
  background: "rgba(255,255,255,0.03)",
};

const panelTitleStyle = {
  fontWeight: 800,
  marginBottom: 6,
};

const panelBodyStyle = {
  opacity: 0.85,
  lineHeight: 1.4,
};

const buttonStyle = {
  border: "1px solid var(--surface-border)",
  borderRadius: 10,
  padding: "9px 12px",
  textDecoration: "none",
  color: "inherit",
  fontWeight: 700,
  background: "rgba(255,255,255,0.03)",
};
