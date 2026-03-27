"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import ClientEditorDialog from "@/components/crm/ClientEditorDialog";
import CrmShell from "@/components/crm/CrmShell";
import PropertyEditorDialog from "@/components/crm/PropertyEditorDialog";
import { useCrmMockData } from "@/components/crm/CrmMockDataProvider";
import {
  crmCardStyle,
  crmDangerButtonStyle,
  crmMutedTextStyle,
  crmPrimaryButtonStyle,
  crmSecondaryButtonStyle,
  crmSubtleCardStyle,
} from "@/components/crm/styles";
import {
  CRM_CLIENT_STATUS_LABELS,
  CRM_CONTACT_METHOD_LABELS,
  CRM_CLIENT_TYPE_LABELS,
  CRM_PROPERTY_TYPE_LABELS,
  crmPropertyAddress,
  type CrmProperty,
} from "@/lib/crm";

const CLIENT_ACTIVITY_BY_ID: Record<
  string,
  {
    openJobs: number;
    upcomingServices: number;
    lastServiceDate: string;
    outstandingBalance: string;
  }
> = {
  client_maple_ridge_hoa: {
    openJobs: 3,
    upcomingServices: 4,
    lastServiceDate: "2026-03-22",
    outstandingBalance: "$4,860.00",
  },
  client_keller_residence: {
    openJobs: 1,
    upcomingServices: 2,
    lastServiceDate: "2026-03-24",
    outstandingBalance: "$185.00",
  },
  client_brookfield_parks: {
    openJobs: 5,
    upcomingServices: 6,
    lastServiceDate: "2026-03-20",
    outstandingBalance: "$12,440.00",
  },
  client_northside_commerce: {
    openJobs: 0,
    upcomingServices: 0,
    lastServiceDate: "2025-11-18",
    outstandingBalance: "$0.00",
  },
};

const PROPERTY_LAST_SERVICE_BY_ID: Record<string, string> = {
  property_maple_ridge_clubhouse: "2026-03-22",
  property_maple_ridge_north: "2026-03-18",
  property_keller_home: "2026-03-24",
  property_brookfield_admin: "2026-03-20",
  property_northside_lot_a: "2025-11-18",
};

export default function CrmClientDetailPage() {
  const params = useParams<{ clientId: string }>();
  const router = useRouter();
  const clientId = decodeURIComponent(params.clientId);
  const {
    getClient,
    propertiesForClient,
    saveClient,
    deleteClient,
    saveProperty,
    deleteProperty,
  } = useCrmMockData();

  const client = getClient(clientId);
  const properties = propertiesForClient(clientId);
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [propertyDialogOpen, setPropertyDialogOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<CrmProperty | null>(null);
  const [clientDeleteArmed, setClientDeleteArmed] = useState(false);
  const [pendingPropertyDeleteId, setPendingPropertyDeleteId] = useState<string | null>(null);

  if (!client) {
    return (
      <CrmShell
        title="Client Not Found"
        description="This client record is no longer available."
      >
        <section style={crmCardStyle}>
          <div style={crmMutedTextStyle}>
            The client may have been removed. Return to the clients hub to continue.
          </div>
        </section>
      </CrmShell>
    );
  }

  const currentClient = client;
  const activity = CLIENT_ACTIVITY_BY_ID[currentClient.id] ?? {
    openJobs: 0,
    upcomingServices: 0,
    lastServiceDate: currentClient.updatedAt,
    outstandingBalance: "$0.00",
  };
  const activeProperties = properties.filter((property) => property.isActive);
  const gatedProperties = properties.filter((property) => property.gatePresent || property.lockedGate);
  const routeGroups = Array.from(new Set(properties.map((property) => property.routeGroup).filter(Boolean)));
  const serviceMix = Array.from(new Set(properties.flatMap((property) => getPropertyServiceTypes(property))));

  function handleDeleteClient() {
    deleteClient(currentClient.id);
    router.push("/crm/clients");
  }

  function handleDeleteProperty(property: CrmProperty) {
    deleteProperty(property.id);
    setPendingPropertyDeleteId(null);
  }

  return (
    <CrmShell
      title={currentClient.displayName}
      description="Contacts, properties, and operational context for this account."
      breadcrumb={
        <>
          <Link href="/crm/clients" style={{ color: "inherit", textDecoration: "none" }}>
            Clients & Properties
          </Link>{" "}
          &gt; {currentClient.displayName}
        </>
      }
      actions={
        <>
          <button
            type="button"
            style={crmPrimaryButtonStyle}
            onClick={() => {
              setEditingProperty(null);
              setPropertyDialogOpen(true);
            }}
          >
            + Add Property
          </button>
          <button type="button" style={crmSecondaryButtonStyle} onClick={() => setClientDialogOpen(true)}>
            Edit Client
          </button>
          {clientDeleteArmed ? (
            <>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "0 4px",
                  fontSize: 12,
                  lineHeight: 1.45,
                  color: "#ffd0d0",
                }}
              >
                Are you sure you want to delete this client?
              </div>
              <button type="button" style={crmDangerButtonStyle} onClick={handleDeleteClient}>
                Confirm Delete
              </button>
              <button type="button" style={crmSecondaryButtonStyle} onClick={() => setClientDeleteArmed(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" style={crmDangerButtonStyle} onClick={() => setClientDeleteArmed(true)}>
              Delete Client
            </button>
          )}
        </>
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
          <SummaryCard label="Status" value={CRM_CLIENT_STATUS_LABELS[currentClient.status]} />
          <SummaryCard label="Client Type" value={CRM_CLIENT_TYPE_LABELS[currentClient.clientType]} />
          <SummaryCard label="Properties" value={`${properties.length}`} />
        </section>

        <section style={crmCardStyle}>
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <h2 style={{ margin: "0 0 6px" }}>Operational Snapshot</h2>
              <div style={crmMutedTextStyle}>A quick view of current workload, service timing, and account balance.</div>
            </div>

            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              }}
            >
              <MetricTile label="Open Jobs" value={`${activity.openJobs}`} />
              <MetricTile label="Upcoming Services" value={`${activity.upcomingServices}`} />
              <MetricTile label="Last Service" value={formatDateLabel(activity.lastServiceDate)} />
              <MetricTile label="Outstanding Balance" value={activity.outstandingBalance} />
            </div>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 0.9fr)",
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: 16 }}>
            <div style={crmCardStyle}>
              <h2 style={{ marginTop: 0, marginBottom: 10 }}>Contact</h2>
              <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
                <div><strong>Primary Phone:</strong> {currentClient.primaryPhone || "Not set"}</div>
                <div><strong>Secondary Phone:</strong> {currentClient.secondaryPhone || "Not set"}</div>
                <div><strong>Primary Email:</strong> {currentClient.primaryEmail || "Not set"}</div>
                <div><strong>Billing Email:</strong> {currentClient.billingEmail || "Not set"}</div>
              </div>
            </div>

            <div style={crmCardStyle}>
              <h2 style={{ marginTop: 0, marginBottom: 10 }}>Properties</h2>
              <div style={{ display: "grid", gap: 12 }}>
                {properties.map((property) => (
                  <article
                    key={property.id}
                    style={{ ...crmSubtleCardStyle, display: "grid", gap: 12, cursor: "pointer" }}
                    role="link"
                    tabIndex={0}
                    onClick={() => router.push(`/crm/properties/${encodeURIComponent(property.id)}`)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key !== "Enter") return;
                      router.push(`/crm/properties/${encodeURIComponent(property.id)}`);
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 17 }}>{property.propertyName}</div>
                        <div style={{ marginTop: 4, ...crmMutedTextStyle, fontSize: 14 }}>
                          {crmPropertyAddress(property)}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <TypePill label={CRM_PROPERTY_TYPE_LABELS[property.propertyType]} />
                        {!property.isActive ? <TypePill label="Inactive" /> : null}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {getPropertyServiceTypes(property).map((serviceType) => (
                        <ServicePill key={`${property.id}-${serviceType}`} label={serviceType} />
                      ))}
                      {property.routeGroup ? <RoutePill label={property.routeGroup} /> : null}
                      <IndicatorPill label={`Last Serviced ${formatDateLabel(getPropertyLastService(property))}`} />
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {property.gatePresent ? <IndicatorPill label="Gate" /> : null}
                      {property.lockedGate ? <IndicatorPill label="Locked Gate" /> : null}
                      {property.petsPresent ? <IndicatorPill label="Pets" /> : null}
                      {property.entryNotes ? <IndicatorPill label="Entry Notes" /> : null}
                      {property.siteNotes ? <IndicatorPill label="Site Notes" /> : null}
                    </div>

                    <div
                      style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Link href={`/crm/properties/${encodeURIComponent(property.id)}`} style={crmSecondaryButtonStyle}>
                        View
                      </Link>
                      <button
                        type="button"
                        style={crmSecondaryButtonStyle}
                        onClick={() => {
                          setEditingProperty(property);
                          setPropertyDialogOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      {pendingPropertyDeleteId === property.id ? (
                        <>
                          <button
                            type="button"
                            style={crmDangerButtonStyle}
                            onClick={() => handleDeleteProperty(property)}
                          >
                            Confirm Delete
                          </button>
                          <button
                            type="button"
                            style={crmSecondaryButtonStyle}
                            onClick={() => setPendingPropertyDeleteId(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          style={crmDangerButtonStyle}
                          onClick={() => setPendingPropertyDeleteId(property.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <div style={crmCardStyle}>
              <h2 style={{ marginTop: 0, marginBottom: 14 }}>Billing & Notes</h2>
              <div style={{ display: "grid", gap: 16 }}>
                <SectionBlock title="Billing Info">
                  <DetailRow label="Billing Email" value={currentClient.billingEmail || "Not set"} />
                  <DetailRow label="Company" value={currentClient.companyName || "N/A"} />
                  <DetailRow label="Outstanding Balance" value={activity.outstandingBalance} />
                </SectionBlock>

                <SectionBlock title="Contact Preferences">
                  <DetailRow
                    label="Preferred Method"
                    value={
                      currentClient.preferredContactMethod
                        ? CRM_CONTACT_METHOD_LABELS[currentClient.preferredContactMethod]
                        : "Not set"
                    }
                  />
                  <DetailRow label="Primary Contact" value={currentClient.primaryEmail || currentClient.primaryPhone || "Not set"} />
                  <DetailRow label="Status" value={CRM_CLIENT_STATUS_LABELS[currentClient.status]} />
                </SectionBlock>

                <SectionBlock title="Notes">
                  <div style={crmMutedTextStyle}>{currentClient.notes || "No client notes yet."}</div>
                </SectionBlock>
              </div>
            </div>

            <div style={crmCardStyle}>
              <h2 style={{ marginTop: 0, marginBottom: 14 }}>Service Coverage</h2>
              <div style={{ display: "grid", gap: 12 }}>
                <DetailRow label="Active Properties" value={`${activeProperties.length} of ${properties.length}`} />
                <DetailRow label="Gated Sites" value={`${gatedProperties.length}`} />
                <DetailRow label="Route Groups" value={routeGroups.length ? routeGroups.join(", ") : "Not assigned"} />
                <DetailRow label="Service Mix" value={serviceMix.length ? serviceMix.join(", ") : "Not assigned"} />
              </div>
            </div>
          </div>
        </section>
      </div>

      {clientDialogOpen ? (
        <ClientEditorDialog
          client={currentClient}
          onClose={() => setClientDialogOpen(false)}
          onSave={(values) => {
            saveClient(values, currentClient.id);
            setClientDialogOpen(false);
          }}
        />
      ) : null}

      {propertyDialogOpen ? (
        <PropertyEditorDialog
          property={editingProperty}
          onClose={() => {
            setPropertyDialogOpen(false);
            setEditingProperty(null);
          }}
          onSave={(values) => {
            saveProperty(currentClient.id, values, editingProperty?.id);
            setPropertyDialogOpen(false);
            setEditingProperty(null);
          }}
        />
      ) : null}
    </CrmShell>
  );
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function getPropertyLastService(property: CrmProperty) {
  return PROPERTY_LAST_SERVICE_BY_ID[property.id] ?? property.updatedAt;
}

function getPropertyServiceTypes(property: CrmProperty) {
  const serviceTypes = new Set<string>();

  if (property.serviceTemplates.some((template) => template.includes("maintenance") || template.includes("grounds"))) {
    serviceTypes.add("Maintenance");
  }

  if (property.serviceTemplates.some((template) => template.includes("fert"))) {
    serviceTypes.add("Fertilizing");
  }

  if (property.serviceTemplates.some((template) => template.includes("snow"))) {
    serviceTypes.add("Snow");
  }

  if (serviceTypes.size === 0) {
    serviceTypes.add("General Service");
  }

  return Array.from(serviceTypes);
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.035)",
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.35, opacity: 0.66 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 22, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={crmCardStyle}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.35, opacity: 0.66 }}>{label}</div>
      <div style={{ marginTop: 10, fontSize: 24, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.35, opacity: 0.66 }}>{title}</div>
      <div
        style={{
          display: "grid",
          gap: 10,
          paddingTop: 12,
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {children}
      </div>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3, opacity: 0.62 }}>{label}</div>
      <div style={{ fontSize: 14 }}>{value}</div>
    </div>
  );
}

function TypePill({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 28,
        padding: "5px 10px",
        borderRadius: 999,
        border: "1px solid var(--surface-border)",
        background: "rgba(255,255,255,0.05)",
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {label}
    </span>
  );
}

function ServicePill({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 28,
        padding: "5px 10px",
        borderRadius: 999,
        border: "1px solid rgba(126,255,167,0.24)",
        background: "rgba(53, 156, 84, 0.16)",
        color: "#d3ffe0",
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {label}
    </span>
  );
}

function RoutePill({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 28,
        padding: "5px 10px",
        borderRadius: 999,
        border: "1px solid rgba(255, 214, 130, 0.22)",
        background: "rgba(118, 82, 18, 0.2)",
        color: "#ffe0ab",
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      Route {label}
    </span>
  );
}

function IndicatorPill({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 28,
        padding: "5px 10px",
        borderRadius: 999,
        border: "1px solid rgba(116, 168, 255, 0.24)",
        background: "rgba(33, 74, 141, 0.2)",
        color: "#cfe3ff",
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {label}
    </span>
  );
}
