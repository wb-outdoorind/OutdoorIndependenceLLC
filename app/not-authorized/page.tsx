import Link from "next/link";

export default function NotAuthorizedPage({
  searchParams,
}: {
  searchParams?: { next?: string; reason?: string };
}) {
  const next = searchParams?.next || "/";
  const reason = searchParams?.reason;

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 32 }}>
      <h1 style={{ marginBottom: 8 }}>Not authorized</h1>
      <div style={{ opacity: 0.8, lineHeight: 1.4 }}>
        You don’t have permission to access that page.
      </div>

      {reason ? (
        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>
          Reason: <strong>{reason}</strong>
        </div>
      ) : null}

      <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link
          href={next}
          style={{
            display: "inline-block",
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.06)",
            color: "inherit",
            textDecoration: "none",
            fontWeight: 800,
          }}
        >
          Go back
        </Link>

        <Link
          href="/"
          style={{
            display: "inline-block",
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "transparent",
            color: "inherit",
            textDecoration: "none",
            fontWeight: 700,
            opacity: 0.9,
          }}
        >
          Home
        </Link>
      </div>
    </main>
  );
}
