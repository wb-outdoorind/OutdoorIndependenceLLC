import "./globals.css";
import BackButton from "@/components/BackButton";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <BackButton />
        {children}
      </body>
    </html>
  );
}
