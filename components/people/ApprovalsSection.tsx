import Link from "next/link";
import PeopleHubRow from "@/components/people/PeopleHubRow";
import {
  peopleHubCountPillStyle,
  peopleHubMediumCardStyle,
  peopleHubMutedTextStyle,
  peopleHubRowListStyle,
  peopleHubSectionActionStyle,
  peopleHubSectionMetaStyle,
} from "@/components/people/styles";
import type { ApprovalDecisionItem } from "@/components/people/types";

export default function ApprovalsSection({
  items,
  pendingCount,
}: {
  items: ApprovalDecisionItem[];
  pendingCount?: number;
}) {
  return (
    <section style={peopleHubMediumCardStyle}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>Approvals / Decisions</h2>
            <div style={{ ...peopleHubMutedTextStyle, marginTop: 6 }}>
              Review the management decisions that are currently waiting and move into the approval queue fast.
            </div>
          </div>

          <div style={peopleHubSectionMetaStyle}>
            {typeof pendingCount === "number" ? (
              <div style={peopleHubCountPillStyle}>{pendingCount} pending</div>
            ) : null}
            <Link href="/approvals" style={peopleHubSectionActionStyle}>
              Open Approvals
            </Link>
          </div>
        </div>
      </div>

      {items.length ? (
        <div style={peopleHubRowListStyle}>
          {items.slice(0, 5).map((item) => (
            <PeopleHubRow key={item.id} title={item.title} subtitle={item.subtitle} href={item.href} />
          ))}
        </div>
      ) : (
        <div style={{ ...peopleHubMutedTextStyle, paddingTop: 6 }}>No approvals are waiting right now.</div>
      )}
    </section>
  );
}
