import "./globals.css";
import BackButton from "@/components/BackButton";
import AppPreferences from "@/components/AppPreferences";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppPreferences />
        <BackButton />
        {children}
      </body>
    </html>
  );
}
