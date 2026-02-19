import "./globals.css";
import BackButton from "@/components/BackButton";
import AppPreferences from "@/components/AppPreferences";
import packageJson from "../package.json";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const appVersion = packageJson.version;
  const year = new Date().getFullYear();

  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <AppPreferences />
          <BackButton />
          <div className="app-content">{children}</div>
          <footer className="app-footer">
            <div className="app-footer-inner">
              <div className="app-footer-title">Outdoor Independence LLC Operations App</div>
              <div className="app-footer-meta">
                <span>Version {appVersion}</span>
                <span>© {year} Outdoor Independence LLC</span>
                <span>Web + Mobile</span>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
