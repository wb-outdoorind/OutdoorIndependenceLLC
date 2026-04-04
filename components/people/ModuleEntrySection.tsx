import Link from "next/link";
import {
  peopleHubModuleLinkStyle,
  peopleHubMutedTextStyle,
  peopleHubQuietCardStyle,
} from "@/components/people/styles";

const MODULE_LINKS = [
  {
    href: "/employees",
    title: "Teammates",
    description: "Open team records, roles, and management views.",
  },
  {
    href: "/form-reports",
    title: "Accountability Center",
    description: "Review flagged forms, grades, and follow-up actions.",
  },
  {
    href: "/approvals",
    title: "Approvals",
    description: "Handle pending lead sign-offs and management decisions.",
  },
  {
    href: "/academy",
    title: "OI Academy",
    description: "Open training programs, SOPs, and learning content.",
  },
];

export default function ModuleEntrySection() {
  return (
    <section style={peopleHubQuietCardStyle}>
      <div>
        <h2 style={{ margin: 0 }}>Module Entry</h2>
        <div style={{ ...peopleHubMutedTextStyle, marginTop: 6 }}>
          Use the signals above first, then move into the full module that needs attention.
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        {MODULE_LINKS.map((link) => (
          <Link key={link.href} href={link.href} style={peopleHubModuleLinkStyle}>
            <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
              <div style={{ fontWeight: 800 }}>{link.title}</div>
              <div style={{ ...peopleHubMutedTextStyle, fontSize: 13 }}>{link.description}</div>
            </div>
            <span aria-hidden="true">→</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
