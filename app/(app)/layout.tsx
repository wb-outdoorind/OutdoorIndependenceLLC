import Link from "next/link";


function TopNav() {
  const linkStyle: React.CSSProperties = {
    textDecoration: "none",
    color: "inherit",
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.03)",
    fontSize: 14,
  };

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        borderBottom: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(0,0,0,0.75)",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "14px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
        }}
      >
        <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
  <div style={{ fontWeight: 800, lineHeight: 1.1 }}>
    Inspection App
  </div>
  <div style={{ fontSize: 12, opacity: 0.7 }}>
    Operations & Maintenance
  </div>
</Link>


        <nav style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/equipment" style={linkStyle}>Equipment</Link>
          <Link href="/vehicles" style={linkStyle}>Vehicles</Link>
          <Link href="/inventory" style={linkStyle}>Inventory</Link>
          <Link href="/employees" style={linkStyle}>Employees</Link>
          <Link href="/ops" style={linkStyle}>Ops & Inspections</Link>
        </nav>
      </div>
    </header>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNav />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 32 }}>
        {children}
      </main>
    </>
  );
}
