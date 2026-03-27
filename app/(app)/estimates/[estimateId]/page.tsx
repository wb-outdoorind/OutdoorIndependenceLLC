import Link from "next/link";
import { notFound } from "next/navigation";
import EstimateShell from "@/components/estimates/EstimateShell";
import {
  crmCardStyle,
  crmMutedTextStyle,
  crmPrimaryButtonStyle,
  crmSecondaryButtonStyle,
  crmSubtleCardStyle,
} from "@/components/crm/styles";
import {
  CRM_CLIENT_TYPE_LABELS,
  CRM_PROPERTY_TYPE_LABELS,
  crmPropertyAddress,
} from "@/lib/crm";
import {
  CRM_CLIENT_SELECT,
  CRM_PROPERTY_SELECT,
  type CrmClientRow,
  type CrmPropertyRow,
  mapCrmClientRow,
  mapCrmPropertyRow,
} from "@/lib/crmPersistence";
import {
  ESTIMATE_DRAFT_STAGE_LABELS,
  ESTIMATE_SERVICE_LINE_LABELS,
  type EstimateSupabaseReader,
  loadEstimateDraftById,
  logEstimatePersistenceError,
} from "@/lib/estimatePersistence";
import { createServerSupabase } from "@/lib/supabase/server";

type EstimateDraftPageProps = {
  params: Promise<{ estimateId: string }>;
};

export default async function EstimateDraftPage({ params }: EstimateDraftPageProps) {
  const { estimateId } = await params;
  const supabase = await createServerSupabase();

  const draftLoad = await loadEstimateDraftById(supabase as unknown as EstimateSupabaseReader, estimateId);
  if (draftLoad.error) {
    logEstimatePersistenceError("Failed to load estimate draft.", draftLoad.error, {
      surface: "estimate_detail",
      estimateId,
    });
  }

  if (!draftLoad.draft) {
    notFound();
  }

  const draft = draftLoad.draft;

  const [{ data: clientRow, error: clientError }, { data: propertyRow, error: propertyError }] =
    await Promise.all([
      supabase
        .from("crm_clients")
        .select(CRM_CLIENT_SELECT)
        .eq("id", draft.clientId)
        .maybeSingle(),
      supabase
        .from("crm_properties")
        .select(CRM_PROPERTY_SELECT)
        .eq("id", draft.propertyId)
        .maybeSingle(),
    ]);

  if (clientError) {
    logEstimatePersistenceError("Failed to load estimate draft client.", clientError, {
      surface: "estimate_detail",
      estimateId,
      clientId: draft.clientId,
    });
  }

  if (propertyError) {
    logEstimatePersistenceError("Failed to load estimate draft property.", propertyError, {
      surface: "estimate_detail",
      estimateId,
      propertyId: draft.propertyId,
    });
  }

  const client = clientRow ? mapCrmClientRow(clientRow as unknown as CrmClientRow) : null;
  const property = propertyRow ? mapCrmPropertyRow(propertyRow as unknown as CrmPropertyRow) : null;
  const accessFlags = property
    ? [
        property.gatePresent ? "Gate" : null,
        property.lockedGate ? "Locked Gate" : null,
        property.petsPresent ? "Pets" : null,
      ]
        .filter(Boolean)
        .join(", ") || "None"
    : "Not set";

  return (
    <EstimateShell
      title={draft.title}
      description="The estimate foundation is saved. Scope and pricing now build from this client and property header."
      backHref="/estimates"
      backLabel="Back to Estimates"
      breadcrumb="Estimate Workspace > Scope & Pricing"
      actions={
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <span style={{ ...crmSecondaryButtonStyle, cursor: "default" }}>
            {ESTIMATE_DRAFT_STAGE_LABELS[draft.stage]}
          </span>
        </div>
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
          <WorkflowCard step="1" title="Client" state="Complete" tone="complete" />
          <WorkflowCard step="2" title="Property" state="Complete" tone="complete" />
          <WorkflowCard step="3" title="Basics" state="Saved" tone="complete" />
          <WorkflowCard step="4" title="Scope" state="Current" tone="current" />
        </section>

        <section
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "minmax(0, 1.1fr) minmax(300px, 0.9fr)",
            alignItems: "start",
          }}
        >
          <section style={crmCardStyle}>
            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <h2 style={{ margin: "0 0 6px" }}>Estimate Foundation Saved</h2>
                <div style={crmMutedTextStyle}>
                  Scope and pricing will build from this account, property, and estimate header.
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                }}
              >
                <DetailCard
                  label="Client"
                  title={client?.displayName ?? "Client unavailable"}
                  body={client ? CRM_CLIENT_TYPE_LABELS[client.clientType] : "CRM client could not be loaded."}
                />
                <DetailCard
                  label="Property"
                  title={property?.propertyName ?? "Property unavailable"}
                  body={property ? crmPropertyAddress(property) : "CRM property could not be loaded."}
                />
                <DetailCard
                  label="Service Line"
                  title={ESTIMATE_SERVICE_LINE_LABELS[draft.serviceLine]}
                  body="Estimate workflow track"
                />
                <DetailCard
                  label="Target Start"
                  title={draft.targetStart ?? "Not set"}
                  body="Requested service start"
                />
              </div>

              <article style={crmSubtleCardStyle}>
                <div style={{ display: "grid", gap: 12 }}>
                  <div>
                    <div style={{ ...crmMutedTextStyle, fontSize: 13 }}>Internal Notes</div>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                      {draft.internalNotes || "No internal notes captured yet."}
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <div style={{ display: "grid", gap: 16 }}>
            <section style={crmCardStyle}>
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <h2 style={{ margin: "0 0 6px" }}>Scope & Pricing Workspace</h2>
                  <div style={crmMutedTextStyle}>
                    This estimate is anchored to the right account and property. The next pass will define the service package, pricing structure, and approval-ready summary here.
                  </div>
                </div>

                <article style={crmSubtleCardStyle}>
                  <div style={{ display: "grid", gap: 10 }}>
                    <ProgressLine label="Client Linked" value="Complete" />
                    <ProgressLine label="Property Linked" value="Complete" />
                    <ProgressLine label="Estimate Header" value="Saved" />
                    <ProgressLine label="Scope Builder" value="Up next" />
                  </div>
                </article>
              </div>
            </section>

            <section style={crmCardStyle}>
              <div style={{ display: "grid", gap: 12 }}>
                <h2 style={{ margin: 0 }}>Property Context</h2>
                {property ? (
                  <article style={crmSubtleCardStyle}>
                    <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
                      <div><strong>Type:</strong> {CRM_PROPERTY_TYPE_LABELS[property.propertyType]}</div>
                      <div><strong>Route Group:</strong> {property.routeGroup || "Not set"}</div>
                      <div><strong>Acreage:</strong> {property.acreage ?? "Not set"}</div>
                      <div><strong>Flags:</strong> {accessFlags}</div>
                    </div>
                  </article>
                ) : (
                  <article style={crmSubtleCardStyle}>
                    <div style={crmMutedTextStyle}>
                      Property metadata could not be loaded for this draft.
                    </div>
                  </article>
                )}
              </div>
            </section>

            <Link href="/estimates" style={crmPrimaryButtonStyle}>
              Return to Estimate Queue
            </Link>
          </div>
        </section>
      </div>
    </EstimateShell>
  );
}

function WorkflowCard({
  step,
  title,
  state,
  tone,
}: {
  step: string;
  title: string;
  state: string;
  tone: "complete" | "current";
}) {
  const palette =
    tone === "complete"
      ? {
          border: "1px solid rgba(94, 186, 140, 0.24)",
          background: "rgba(36, 76, 54, 0.22)",
          badgeBorder: "1px solid rgba(94, 186, 140, 0.32)",
          badgeBackground: "rgba(36, 76, 54, 0.35)",
          badgeText: "#d7f4e1",
        }
      : {
          border: "1px solid rgba(116, 168, 255, 0.22)",
          background: "rgba(20, 43, 80, 0.22)",
          badgeBorder: "1px solid rgba(116, 168, 255, 0.3)",
          badgeBackground: "rgba(20, 43, 80, 0.36)",
          badgeText: "#d7e7ff",
        };

  return (
    <article
      style={{
        ...crmSubtleCardStyle,
        display: "grid",
        gap: 8,
        padding: 14,
        border: palette.border,
        background: palette.background,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
            fontSize: 13,
            fontWeight: 900,
            border: palette.badgeBorder,
            color: palette.badgeText,
            background: palette.badgeBackground,
          }}
        >
          {step}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>
          <div style={{ ...crmMutedTextStyle, fontSize: 12 }}>{state}</div>
        </div>
      </div>
    </article>
  );
}

function DetailCard({
  label,
  title,
  body,
}: {
  label: string;
  title: string;
  body: string;
}) {
  return (
    <article style={crmSubtleCardStyle}>
      <div style={{ ...crmMutedTextStyle, fontSize: 13 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800 }}>{title}</div>
      <div style={{ marginTop: 8, ...crmMutedTextStyle }}>{body}</div>
    </article>
  );
}

function ProgressLine({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "center",
      }}
    >
      <div style={crmMutedTextStyle}>{label}</div>
      <div style={{ fontWeight: 800 }}>{value}</div>
    </div>
  );
}
