import EstimateShell from "@/components/estimates/EstimateShell";
import {
  crmCardStyle,
  crmMutedTextStyle,
  crmSubtleCardStyle,
} from "@/components/crm/styles";

const shellSections = [
  {
    title: "Client",
    body: "Choose the customer account that owns the estimate and future billing relationship.",
  },
  {
    title: "Property",
    body: "Attach the exact service property so pricing, scope, and route context stay tied to the correct location.",
  },
  {
    title: "Scope",
    body: "Define the service mix, seasonal intent, and work package that the field team will eventually execute.",
  },
  {
    title: "Pricing",
    body: "Capture the estimate totals, assumptions, and approval-ready summary once the pricing layer is connected.",
  },
];

export default function NewEstimatePage() {
  return (
    <EstimateShell
      title="New Estimate"
      description="Start a new client and property estimate workspace."
      backHref="/estimates"
      backLabel="Back to Estimates"
      breadcrumb="Estimate Workspace > New Estimate"
    >
      <div style={{ display: "grid", gap: 16 }}>
        <section style={crmCardStyle}>
          <div style={{ display: "grid", gap: 8 }}>
            <h2 style={{ margin: 0 }}>Estimate Entry</h2>
            <div style={crmMutedTextStyle}>
              Choose the client, attach the service property, and prepare the scope and pricing details for review.
            </div>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          {shellSections.map((section) => (
            <article key={section.title} style={crmSubtleCardStyle}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{section.title}</div>
              <div style={{ marginTop: 8, ...crmMutedTextStyle }}>{section.body}</div>
            </article>
          ))}
        </section>
      </div>
    </EstimateShell>
  );
}
