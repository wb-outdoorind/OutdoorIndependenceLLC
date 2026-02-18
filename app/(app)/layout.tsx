import Link from "next/link";
import Image from "next/image";


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
          padding: "8px 16px 12px 8px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
        }}
      >
        <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Image
              src="/App_Logo.png"
              alt="Outdoor Independence logo"
              width={32}
              height={32}
              style={{ objectFit: "contain", borderRadius: 8 }}
            />
            <div>
              <div style={{ fontWeight: 800, lineHeight: 1.1 }}>Inspection App</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Operations & Maintenance</div>
            </div>
          </div>
        </Link>


        <nav style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/equipment" style={linkStyle}>Equipment</Link>
          <Link href="/vehicles" style={linkStyle}>Vehicles</Link>
          <Link href="/inventory" style={linkStyle}>Inventory</Link>
          <Link href="/employees" style={linkStyle}>Teammates</Link>
          <Link href="/ops" style={linkStyle}>Maintenance Operations</Link>
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
