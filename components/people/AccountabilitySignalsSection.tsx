import Link from "next/link";
import PeopleHubRow from "@/components/people/PeopleHubRow";
import {
  peopleHubCountPillStyle,
  peopleHubMutedTextStyle,
  peopleHubRowListStyle,
  peopleHubSectionActionStyle,
  peopleHubSectionMetaStyle,
  peopleHubStrongCardStyle,
} from "@/components/people/styles";
import type { AccountabilitySignalItem } from "@/components/people/types";

const PRIORITY_LABELS: Record<AccountabilitySignalItem["priority"], string> = {
  overdue: "Overdue",
  flagged: "Flagged",
  recent: "Recent",
};

export default function AccountabilitySignalsSection({
  items,
  attentionCount,
}: {
  items: AccountabilitySignalItem[];
  attentionCount?: number;
}) {
  return (
    <section style={peopleHubStrongCardStyle}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>Accountability Signals</h2>
            <div style={{ ...peopleHubMutedTextStyle, marginTop: 6 }}>
              Focus on the teammate issues and follow-up items that need management attention first.
            </div>
          </div>

          <div style={peopleHubSectionMetaStyle}>
            {typeof attentionCount === "number" ? (
              <div style={peopleHubCountPillStyle}>{attentionCount} issues</div>
            ) : null}
            <Link href="/form-reports" style={peopleHubSectionActionStyle}>
              Open Accountability Center
            </Link>
          </div>
        </div>
      </div>

      {items.length ? (
        <div style={peopleHubRowListStyle}>
          {items.slice(0, 5).map((item) => (
            <div key={item.id} style={{ display: "grid", gap: 0 }}>
              <div
                style={{
                  minHeight: 0,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingTop: 10,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 0.3,
                  opacity: 0.72,
                }}
              >
                <span>{PRIORITY_LABELS[item.priority]}</span>
              </div>
              <PeopleHubRow title={item.title} subtitle={item.subtitle} href={item.href} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ ...peopleHubMutedTextStyle, paddingTop: 6 }}>
          No accountability issues need attention right now.
        </div>
      )}
    </section>
  );
}
