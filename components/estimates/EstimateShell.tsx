import Link from "next/link";
import {
  crmCardStyle,
  crmMutedTextStyle,
  crmSecondaryButtonStyle,
} from "@/components/crm/styles";

type EstimateShellProps = {
  title: string;
  description: string;
  backHref?: string;
  backLabel?: string;
  breadcrumb?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
};

export default function EstimateShell({
  title,
  description,
  backHref = "/",
  backLabel = "Back Home",
  breadcrumb,
  actions,
  children,
}: EstimateShellProps) {
  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", paddingBottom: 32 }}>
      <section
        style={{
          ...crmCardStyle,
          padding: 20,
          background: "linear-gradient(180deg, rgba(14,20,31,0.95), rgba(9,13,22,0.92))",
        }}
      >
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
              <Link href={backHref} style={crmSecondaryButtonStyle}>
                {backLabel}
              </Link>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4, opacity: 0.68 }}>
                Estimating
              </div>
            </div>

            {actions ? <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{actions}</div> : null}
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.35, opacity: 0.68 }}>
              {breadcrumb ?? "Estimate Workspace"}
            </div>
            <h1 style={{ margin: "6px 0 8px", fontSize: "clamp(28px, 4vw, 38px)" }}>{title}</h1>
            <div style={{ ...crmMutedTextStyle, maxWidth: 860 }}>{description}</div>
          </div>
        </div>
      </section>

      <div style={{ marginTop: 16 }}>{children}</div>
    </main>
  );
}
