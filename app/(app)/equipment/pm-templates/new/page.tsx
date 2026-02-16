import Link from "next/link";

export default function NewEquipmentPmTemplateStubPage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>Create Equipment PM Template</h1>
      <div style={{ opacity: 0.8, lineHeight: 1.5 }}>
        Template creation UI is not implemented yet.
      </div>
      <div style={{ marginTop: 12 }}>
        <Link href="/equipment" style={{ color: "inherit" }}>
          ← Back to Equipment
        </Link>
      </div>
    </main>
  );
}
