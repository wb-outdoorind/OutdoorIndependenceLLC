import Link from "next/link";
import {
  peopleHubRowContentStyle,
  peopleHubRowLinkStyle,
  peopleHubRowSubtitleStyle,
  peopleHubRowTitleStyle,
} from "@/components/people/styles";

export default function PeopleHubRow({
  title,
  subtitle,
  href,
}: {
  title: string;
  subtitle: string;
  href: string;
}) {
  return (
    <Link href={href} style={peopleHubRowLinkStyle}>
      <div style={peopleHubRowContentStyle}>
        <div style={peopleHubRowTitleStyle}>{title}</div>
        <div style={peopleHubRowSubtitleStyle}>{subtitle}</div>
      </div>
      <div aria-hidden="true" style={{ fontSize: 12, fontWeight: 800, opacity: 0.72 }}>
        Open
      </div>
    </Link>
  );
}
