import Link from "next/link";
import EstimateShell from "@/components/estimates/EstimateShell";
import {
  crmCardStyle,
  crmMutedTextStyle,
  crmPrimaryButtonStyle,
  crmSecondaryButtonStyle,
  crmSubtleCardStyle,
} from "@/components/crm/styles";
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
  loadEstimateDrafts,
  logEstimatePersistenceError,
} from "@/lib/estimatePersistence";
import { createServerSupabase } from "@/lib/supabase/server";

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
}

function formatDate(value: string | null) {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

export default async function EstimatesPage() {
  const supabase = await createServerSupabase();

  const draftLoad = await loadEstimateDrafts(supabase as unknown as EstimateSupabaseReader);
  if (draftLoad.error) {
    logEstimatePersistenceError("Failed to load estimate drafts.", draftLoad.error, {
      surface: "estimates_index",
    });
  }

  const [clientRes, propertyRes] = await Promise.all([
    supabase.from("crm_clients").select(CRM_CLIENT_SELECT).order("display_name", { ascending: true }),
    supabase.from("crm_properties").select(CRM_PROPERTY_SELECT).order("property_name", { ascending: true }),
  ]);

  if (clientRes.error) {
    logEstimatePersistenceError("Failed to load CRM clients for estimate queue.", clientRes.error, {
      surface: "estimates_index",
      table: "crm_clients",
    });
  }

  if (propertyRes.error) {
    logEstimatePersistenceError("Failed to load CRM properties for estimate queue.", propertyRes.error, {
      surface: "estimates_index",
      table: "crm_properties",
    });
  }

  const clients = ((clientRes.data ?? []) as unknown as CrmClientRow[]).map(mapCrmClientRow);
  const properties = ((propertyRes.data ?? []) as unknown as CrmPropertyRow[]).map(mapCrmPropertyRow);
  const clientMap = new Map(clients.map((client) => [client.id, client]));
  const propertyMap = new Map(properties.map((property) => [property.id, property]));

  const drafts = draftLoad.drafts;
  const weekStart = startOfWeek(new Date());
  const summary = [
    { label: "Draft Estimates", value: `${drafts.length}` },
    {
      label: "Ready for Review",
      value: `${drafts.filter((draft) => draft.stage === "review_ready").length}`,
    },
    {
      label: "Sent This Week",
      value: `${
        drafts.filter((draft) => {
          if (draft.stage !== "sent") return false;
          const updatedAt = new Date(draft.updatedAt);
          return !Number.isNaN(updatedAt.getTime()) && updatedAt >= weekStart;
        }).length
      }`,
    },
    {
      label: "Linked Properties",
      value: `${new Set(drafts.map((draft) => draft.propertyId)).size}`,
    },
  ];

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
          {summary.map((item) => (
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
                Estimate drafts stay anchored to the shared CRM client and property backbone.
              </div>
            </div>

            {draftLoad.error ? (
              <article
                style={{
                  ...crmSubtleCardStyle,
                  border: "1px solid rgba(255, 126, 126, 0.22)",
                  color: "#ffd7d7",
                  fontFamily: "monospace",
                  fontSize: 13,
                }}
              >
                {draftLoad.error.message}
              </article>
            ) : drafts.length ? (
              <div style={{ display: "grid", gap: 12 }}>
                {drafts.map((draft) => {
                  const client = clientMap.get(draft.clientId);
                  const property = propertyMap.get(draft.propertyId);

                  return (
                    <article
                      key={draft.id}
                      style={{
                        ...crmSubtleCardStyle,
                        display: "grid",
                        gap: 12,
                        padding: 16,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          flexWrap: "wrap",
                          alignItems: "start",
                        }}
                      >
                        <div style={{ display: "grid", gap: 6 }}>
                          <div style={{ fontSize: 18, fontWeight: 800 }}>{draft.title}</div>
                          <div style={crmMutedTextStyle}>
                            {client?.displayName ?? "Client unavailable"} •{" "}
                            {property?.propertyName ?? "Property unavailable"}
                          </div>
                        </div>

                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            minHeight: 30,
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: "1px solid rgba(116, 168, 255, 0.22)",
                            background: "rgba(20, 43, 80, 0.22)",
                            color: "#d7e7ff",
                            fontSize: 12,
                            fontWeight: 800,
                          }}
                        >
                          {ESTIMATE_DRAFT_STAGE_LABELS[draft.stage]}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gap: 10,
                          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                          fontSize: 14,
                        }}
                      >
                        <QueueDetail label="Service Line" value={ESTIMATE_SERVICE_LINE_LABELS[draft.serviceLine]} />
                        <QueueDetail label="Target Start" value={formatDate(draft.targetStart)} />
                        <QueueDetail label="Updated" value={formatDate(draft.updatedAt)} />
                        <QueueDetail label="Property" value={property?.propertyName ?? "Unavailable"} />
                      </div>

                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <Link href={`/estimates/${draft.id}`} style={crmSecondaryButtonStyle}>
                          Open Draft
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
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
            )}
          </div>
        </section>
      </div>
    </EstimateShell>
  );
}

function QueueDetail({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ ...crmMutedTextStyle, fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{value}</div>
    </div>
  );
}
