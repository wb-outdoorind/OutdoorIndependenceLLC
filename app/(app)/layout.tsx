import Link from "next/link";
import Image from "next/image";

function TopNav() {
  return (
    <header className="app-topnav">
      <div className="app-topnav-inner">
        <Link href="/" className="app-brand">
          <div className="app-brand-row">
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

        <nav className="app-topnav-links">
          <Link href="/equipment" className="app-topnav-link">Equipment</Link>
          <Link href="/vehicles" className="app-topnav-link">Vehicles</Link>
          <Link href="/inventory" className="app-topnav-link">Inventory</Link>
          <Link href="/employees" className="app-topnav-link">Teammates</Link>
          <Link href="/ops" className="app-topnav-link">Maintenance Operations</Link>
        </nav>
      </div>
    </header>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNav />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "clamp(14px, 2.8vw, 32px)" }}>
        {children}
      </main>
    </>
  );
}
