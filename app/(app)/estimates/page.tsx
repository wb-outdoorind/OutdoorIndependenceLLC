import Link from "next/link";
import EstimateShell from "@/components/estimates/EstimateShell";
import {
  crmCardStyle,
  crmMutedTextStyle,
  crmPrimaryButtonStyle,
  crmSubtleCardStyle,
} from "@/components/crm/styles";

const estimateSummary = [
  { label: "Draft Estimates", value: "0" },
  { label: "Ready for Review", value: "0" },
  { label: "Sent This Week", value: "0" },
  { label: "Linked Properties", value: "0" },
];

export default function EstimatesPage() {
  return (
    <EstimateShell
      title="Estimates"
      description="Prepare client and property estimate drafts before jobs, scheduling, and billing."
      actions={
        <Link href="/estimates/new" style={crmPrimaryButtonStyle}>
          + New Estimate
        </Link>
      }
    >
      <div style={{ display: "grid", gap: 16 }}>
        <section
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          }}
        >
          {estimateSummary.map((item) => (
            <article key={item.label} style={crmCardStyle}>
              <div style={{ ...crmMutedTextStyle, fontSize: 13 }}>{item.label}</div>
              <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900 }}>{item.value}</div>
            </article>
          ))}
        </section>

        <section style={crmCardStyle}>
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <h2 style={{ margin: "0 0 6px" }}>Estimate Queue</h2>
              <div style={crmMutedTextStyle}>
                Estimate drafts will live here once client, property, and scope selection are wired into the shell.
              </div>
            </div>

            <div
              style={{
                ...crmSubtleCardStyle,
                padding: "28px 20px",
                display: "grid",
                gap: 10,
                placeItems: "center",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 800 }}>No estimates yet</div>
              <div style={{ ...crmMutedTextStyle, maxWidth: 520 }}>
                Start a new estimate to connect a client, choose a service property, and begin outlining scope.
              </div>
              <Link href="/estimates/new" style={crmPrimaryButtonStyle}>
                Start Estimate
              </Link>
            </div>
          </div>
        </section>
      </div>
    </EstimateShell>
  );
}
