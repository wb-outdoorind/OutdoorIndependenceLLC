import Link from "next/link";
import AccountabilitySignalsSection from "@/components/people/AccountabilitySignalsSection";
import ApprovalsSection from "@/components/people/ApprovalsSection";
import ModuleEntrySection from "@/components/people/ModuleEntrySection";
import TeamVisibilitySection from "@/components/people/TeamVisibilitySection";
import {
  peopleHubBreadcrumbStyle,
  peopleHubCountPillStyle,
  peopleHubHeaderCardStyle,
  peopleHubMutedTextStyle,
} from "@/components/people/styles";
import type {
  AccountabilitySignalItem,
  ApprovalDecisionItem,
  PeopleHubCounts,
  TeamVisibilityItem,
} from "@/components/people/types";

export default function PeopleHubContainer({
  accountabilityItems,
  approvalItems,
  teamVisibilityItems = [],
  counts,
}: {
  accountabilityItems: AccountabilitySignalItem[];
  approvalItems: ApprovalDecisionItem[];
  teamVisibilityItems?: TeamVisibilityItem[];
  counts?: PeopleHubCounts;
}) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section style={peopleHubHeaderCardStyle}>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={peopleHubBreadcrumbStyle}>
            <Link
              href="/settings/development/future-platform"
              style={{ color: "inherit", textDecoration: "none" }}
            >
              Future Platform Lab
            </Link>
            <span aria-hidden="true">→</span>
            <Link
              href="/settings/development/future-platform/home"
              style={{ color: "inherit", textDecoration: "none" }}
            >
              Future Home
            </Link>
            <span aria-hidden="true">→</span>
            <span>People / HR</span>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: "clamp(26px, 3.4vw, 36px)" }}>People / HR</h1>
            <div style={{ ...peopleHubMutedTextStyle, marginTop: 6, maxWidth: 820 }}>
              Watch the team signals that matter most right now, move quickly on pending approvals,
              and step into the right people module without turning this into corporate HR software.
            </div>
          </div>

          {(typeof counts?.issues === "number" || typeof counts?.approvals === "number") ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {typeof counts?.issues === "number" ? (
                <div style={peopleHubCountPillStyle}>{counts.issues} issues</div>
              ) : null}
              {typeof counts?.approvals === "number" ? (
                <div style={peopleHubCountPillStyle}>{counts.approvals} approvals</div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <AccountabilitySignalsSection
        items={accountabilityItems}
        attentionCount={counts?.issues}
      />

      <ApprovalsSection items={approvalItems} pendingCount={counts?.approvals} />

      {teamVisibilityItems.length ? <TeamVisibilitySection items={teamVisibilityItems} /> : null}

      <ModuleEntrySection />
    </div>
  );
}
