import Link from "next/link";
import Image from "next/image";
import AppTopNavLinks from "@/components/AppTopNavLinks";

function TopNav() {
  return (
    <header className="app-topnav">
      <div className="app-topnav-inner">
        <Link href="/" className="app-brand">
          <div className="app-brand-row">
            <Image
              src="/App_Logo.png"
              alt="Outdoor Independence logo"
              width={300}
              height={56}
              className="brand-logo"
              style={{ height: 56, width: "auto", objectFit: "contain" }}
            />
          </div>
        </Link>

        <AppTopNavLinks />
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
