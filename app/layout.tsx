import "./globals.css";
import BackButton from "@/components/BackButton";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#06080b",
          color: "#e9edf3",
          fontFamily: "Arial, Helvetica, sans-serif",
          minHeight: "100vh",
        }}
      >
        <BackButton />
        {children}
      </body>
    </html>
  );
}
