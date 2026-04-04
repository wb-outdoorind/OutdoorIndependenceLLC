"use client";

import Link from "next/link";
import { useState } from "react";
import ClientEditorDialog from "@/components/crm/ClientEditorDialog";
import CrmShell from "@/components/crm/CrmShell";
import { useCrm } from "@/components/crm/CrmMockDataProvider";
import {
  crmCardStyle,
  crmMutedTextStyle,
  crmPrimaryButtonStyle,
  crmSecondaryButtonStyle,
  crmSubtleCardStyle,
} from "@/components/crm/styles";
import {
  CRM_CLIENT_STATUS_LABELS,
  CRM_CLIENT_TYPE_LABELS,
  type CrmClient,
} from "@/lib/crm";

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function clientStatusTone(status: CrmClient["status"]): React.CSSProperties {
  if (status === "active") {
    return {
      border: "1px solid rgba(126,255,167,0.24)",
      background: "rgba(53, 156, 84, 0.18)",
      color: "#c8ffd9",
    };
  }

  if (status === "lead") {
    return {
      border: "1px solid rgba(116, 168, 255, 0.26)",
      background: "rgba(33, 74, 141, 0.24)",
      color: "#cde1ff",
    };
  }

  return {
    border: "1px solid rgba(255, 126, 126, 0.24)",
    background: "rgba(126, 29, 29, 0.22)",
    color: "#ffd0d0",
  };
}

export default function CrmDashboardHome() {
  const { clients, properties, saveClient, propertiesForClient } = useCrm();
  const [editorOpen, setEditorOpen] = useState(false);

  const sortedClients = clients
    .slice()
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

  const clientsWithoutProperties = sortedClients.filter((client) => propertiesForClient(client.id).length === 0);
  const mostRecentlyUpdatedClient = sortedClients[0] ?? null;
  const activeClients = clients.filter((client) => client.status === "active");
  const activeProperties = properties.filter((property) => property.isActive);
  const routeGroupedProperties = properties.filter((property) => Boolean(property.routeGroup));
  const multiSiteProperties = properties.filter((property) => property.propertyType === "multi_site");

  return (
    <CrmShell
      title="CRM"
      description="Use the client and property backbone as the front door for account structure, service locations, and the workflows that grow from them."
      backHref="/"
      backLabel="Back Home"
      breadcrumb="CRM Dashboard"
    >
      <div style={{ display: "grid", gap: 16 }}>
        <section style={crmCardStyle}>
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <h2 style={{ margin: "0 0 6px" }}>Quick Actions</h2>
              <div style={crmMutedTextStyle}>
                Start from the account backbone and move directly into the next cleanup or account action.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              }}
            >
              <button
                type="button"
                style={{
                  ...crmPrimaryButtonStyle,
                  width: "100%",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                }}
                onClick={() => setEditorOpen(true)}
              >
                <span>Add Client</span>
                <span aria-hidden="true">+</span>
              </button>

              <Link
                href="/crm/clients"
                style={{
                  ...crmSecondaryButtonStyle,
                  width: "100%",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                }}
              >
                <span>Open Clients & Properties</span>
                <span aria-hidden="true">→</span>
              </Link>

              <Link
                href="/crm/clients?structure=missing-properties"
                style={{
                  ...crmSecondaryButtonStyle,
                  width: "100%",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                }}
              >
                <span>Review Clients Missing Properties</span>
                <span aria-hidden="true">→</span>
              </Link>

              {mostRecentlyUpdatedClient ? (
                <Link
                  href={`/crm/clients/${encodeURIComponent(mostRecentlyUpdatedClient.id)}`}
                  style={{
                    ...crmSecondaryButtonStyle,
                    width: "100%",
                    justifyContent: "space-between",
                    padding: "14px 16px",
                  }}
                >
                  <span>Open Most Recently Updated Client</span>
                  <span aria-hidden="true">→</span>
                </Link>
              ) : (
                <div
                  style={{
                    ...crmSubtleCardStyle,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    minHeight: 48,
                    padding: "14px 16px",
                    opacity: 0.65,
                  }}
                >
                  <span>Open Most Recently Updated Client</span>
                  <span aria-hidden="true">—</span>
                </div>
              )}
            </div>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          }}
        >
          <SnapshotCard
            label="Total Clients"
            value={`${clients.length}`}
            href="/crm/clients"
            detail="Open the full client and property backbone"
          />
          <SnapshotCard
            label="Total Properties"
            value={`${properties.length}`}
            href="/crm/clients"
            detail="Review service properties from the shared client list"
          />
          <SnapshotCard
            label="Active Clients"
            value={`${activeClients.length}`}
            href="/crm/clients?status=active"
            detail="Jump into the active account list"
          />
          <SnapshotCard
            label="Clients Without Properties"
            value={`${clientsWithoutProperties.length}`}
            href="/crm/clients?structure=missing-properties"
            detail="Open the accounts that still need service locations"
          />
        </section>

        <section
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            alignItems: "start",
          }}
        >
          <section style={crmCardStyle}>
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <h2 style={{ margin: "0 0 6px" }}>Clients Needing Structure</h2>
                <div style={crmMutedTextStyle}>
                  These accounts exist, but they still need at least one service property before the CRM backbone is complete.
                </div>
              </div>

              {clientsWithoutProperties.length ? (
                <div style={{ display: "grid", gap: 12 }}>
                  {clientsWithoutProperties.slice(0, 5).map((client) => (
                    <ClientStructureRow
                      key={`structure-${client.id}`}
                      client={client}
                      propertyCount={0}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ ...crmSubtleCardStyle, padding: "18px 16px" }}>
                  <div style={{ fontWeight: 800 }}>No structure gaps right now</div>
                  <div style={{ ...crmMutedTextStyle, marginTop: 6 }}>
                    Every current client has at least one property linked.
                  </div>
                </div>
              )}
            </div>
          </section>

          <section style={crmCardStyle}>
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <h2 style={{ margin: "0 0 6px" }}>Recently Updated Clients</h2>
                <div style={crmMutedTextStyle}>
                  Reopen the accounts that were touched most recently without digging through the full list.
                </div>
              </div>

              {sortedClients.length ? (
                <div style={{ display: "grid", gap: 12 }}>
                  {sortedClients.slice(0, 6).map((client) => (
                    <ClientStructureRow
                      key={`recent-${client.id}`}
                      client={client}
                      propertyCount={propertiesForClient(client.id).length}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ ...crmSubtleCardStyle, padding: "18px 16px" }}>
                  <div style={{ fontWeight: 800 }}>No client records yet</div>
                  <div style={{ ...crmMutedTextStyle, marginTop: 6 }}>
                    Add a client to start building the shared backbone.
                  </div>
                </div>
              )}
            </div>
          </section>
        </section>

        <section
          style={{
            ...crmSubtleCardStyle,
            display: "grid",
            gap: 12,
            padding: 16,
          }}
        >
          <div>
            <h3 style={{ margin: "0 0 6px" }}>Property Coverage</h3>
            <div style={{ ...crmMutedTextStyle, fontSize: 14 }}>
              A quiet check on how complete the service-property layer is becoming.
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            }}
          >
            <CoverageMetric label="Active Properties" value={`${activeProperties.length}`} />
            <CoverageMetric label="Route-Grouped Properties" value={`${routeGroupedProperties.length}`} />
            <CoverageMetric label="Multi-Site Coverage" value={`${multiSiteProperties.length}`} />
          </div>
        </section>
      </div>

      {editorOpen ? (
        <ClientEditorDialog
          onClose={() => setEditorOpen(false)}
          onSave={(values) => {
            saveClient(values);
            setEditorOpen(false);
          }}
        />
      ) : null}
    </CrmShell>
  );
}

function SnapshotCard({
  label,
  value,
  href,
  detail,
}: {
  label: string;
  value: string;
  href: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      style={{
        ...crmCardStyle,
        display: "grid",
        gap: 8,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.35, opacity: 0.66 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900 }}>{value}</div>
      <div style={{ ...crmMutedTextStyle, fontSize: 13 }}>{detail}</div>
    </Link>
  );
}

function ClientStructureRow({
  client,
  propertyCount,
}: {
  client: CrmClient;
  propertyCount: number;
}) {
  return (
    <article
      style={{
        ...crmSubtleCardStyle,
        display: "grid",
        gap: 12,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{client.displayName}</div>
          <div style={crmMutedTextStyle}>
            {CRM_CLIENT_TYPE_LABELS[client.clientType]} • {CRM_CLIENT_STATUS_LABELS[client.status]}
          </div>
        </div>

        <Link href={`/crm/clients/${encodeURIComponent(client.id)}`} style={crmSecondaryButtonStyle}>
          Open
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gap: 8,
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          fontSize: 14,
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ ...crmMutedTextStyle, fontSize: 12 }}>Status</div>
          <div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 28,
                padding: "5px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 800,
                ...clientStatusTone(client.status),
              }}
            >
              {CRM_CLIENT_STATUS_LABELS[client.status]}
            </span>
          </div>
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ ...crmMutedTextStyle, fontSize: 12 }}>Property Count</div>
          <div style={{ fontWeight: 800 }}>{propertyCount}</div>
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ ...crmMutedTextStyle, fontSize: 12 }}>Updated</div>
          <div style={{ fontWeight: 800 }}>{formatDateTime(client.updatedAt)}</div>
        </div>
      </div>
    </article>
  );
}

function CoverageMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ ...crmMutedTextStyle, fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900 }}>{value}</div>
    </div>
  );
}
