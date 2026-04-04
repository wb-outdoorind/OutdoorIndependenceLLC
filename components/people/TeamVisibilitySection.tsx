import Link from "next/link";
import PeopleHubRow from "@/components/people/PeopleHubRow";
import {
  peopleHubMediumCardStyle,
  peopleHubMutedTextStyle,
  peopleHubRowListStyle,
  peopleHubSectionActionStyle,
} from "@/components/people/styles";
import type { TeamVisibilityItem } from "@/components/people/types";

export default function TeamVisibilitySection({
  items,
}: {
  items: TeamVisibilityItem[];
}) {
  return (
    <section style={peopleHubMediumCardStyle}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Team Visibility</h2>
          <div style={{ ...peopleHubMutedTextStyle, marginTop: 6 }}>
            Keep a light read on recent teammate activity without turning this hub into a noisy feed.
          </div>
        </div>

        <Link href="/employees" style={peopleHubSectionActionStyle}>
          Open Teammates
        </Link>
      </div>

      {items.length ? (
        <div style={peopleHubRowListStyle}>
          {items.slice(0, 5).map((item) => (
            <PeopleHubRow key={item.id} title={item.title} subtitle={item.subtitle} href={item.href} />
          ))}
        </div>
      ) : (
        <div style={{ ...peopleHubMutedTextStyle, paddingTop: 6 }}>
          Recent team activity is quiet right now.
        </div>
      )}
    </section>
  );
}
