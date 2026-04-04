"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import ClientEditorDialog from "@/components/crm/ClientEditorDialog";
import CrmShell from "@/components/crm/CrmShell";
import PropertyEditorDialog from "@/components/crm/PropertyEditorDialog";
import { useCrm } from "@/components/crm/CrmMockDataProvider";
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
  } = useCrm();

  const client = getClient(clientId);
  const properties = propertiesForClient(clientId);
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [propertyDialogOpen, setPropertyDialogOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<CrmProperty | null>(null);
  const [clientDeleteArmed, setClientDeleteArmed] = useState(false);
  const [pendingPropertyDeleteId, setPendingPropertyDeleteId] = useState<string | null>(null);

  if (!client) {
    return (
      <CrmShell title="Client Not Found" description="This client record is no longer available.">
        <section style={crmCardStyle}>
          <div style={crmMutedTextStyle}>
            The client may have been removed. Return to the clients hub to continue.
          </div>
        </section>
      </CrmShell>
    );
  }

  const currentClient = client;
  const activeProperties = properties.filter((property) => property.isActive);
  const inactiveProperties = properties.length - activeProperties.length;
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
      description="Manage this account, confirm its service locations, and prepare it for the next workflow step."
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
        <section style={crmCardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <TypePill label={CRM_CLIENT_TYPE_LABELS[currentClient.clientType]} />
              <TypePill label={CRM_CLIENT_STATUS_LABELS[currentClient.status]} />
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <HeaderFact label="Properties" value={`${properties.length}`} />
              <HeaderFact label="Active" value={`${activeProperties.length}`} />
            </div>
          </div>
        </section>

        <section style={crmCardStyle}>
          <div style={{ display: "grid", gap: 14 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "end",
              }}
            >
              <div>
                <h2 style={{ margin: "0 0 6px" }}>Properties</h2>
                <div style={crmMutedTextStyle}>
                  {properties.length === 0
                    ? "This account needs at least one property before downstream estimate work can start."
                    : `${activeProperties.length} active of ${properties.length} total service location${properties.length === 1 ? "" : "s"}.`}
                </div>
              </div>

              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.35, opacity: 0.66 }}>
                {properties.length} {properties.length === 1 ? "property" : "properties"}
              </div>
            </div>

            {properties.length === 0 ? (
              <div
                style={{
                  ...crmSubtleCardStyle,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 900 }}>No properties yet</div>
                <div style={{ ...crmMutedTextStyle, maxWidth: 680 }}>
                  Add the first service property for this account so estimates and future downstream work stay tied to
                  the correct location.
                </div>
              </div>
            ) : (
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
                      <div style={{ minWidth: 0 }}>
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
                      {property.routeGroup ? <RoutePill label={property.routeGroup} /> : null}
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
            )}
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            alignItems: "start",
          }}
        >
          <div style={crmCardStyle}>
            <h2 style={{ marginTop: 0, marginBottom: 14 }}>Contact + Billing Basics</h2>
            <div style={{ display: "grid", gap: 12 }}>
              <DetailRow label="Primary Phone" value={currentClient.primaryPhone || "Not set"} />
              <DetailRow label="Secondary Phone" value={currentClient.secondaryPhone || "Not set"} />
              <DetailRow label="Primary Email" value={currentClient.primaryEmail || "Not set"} />
              <DetailRow label="Billing Email" value={currentClient.billingEmail || "Not set"} />
              <DetailRow
                label="Preferred Contact"
                value={
                  currentClient.preferredContactMethod
                    ? CRM_CONTACT_METHOD_LABELS[currentClient.preferredContactMethod]
                    : "Not set"
                }
              />
              {currentClient.companyName ? <DetailRow label="Company" value={currentClient.companyName} /> : null}
            </div>
          </div>

          <div style={crmCardStyle}>
            <h2 style={{ marginTop: 0, marginBottom: 14 }}>Notes / Preferences</h2>
            <div style={{ display: "grid", gap: 16 }}>
              <SectionBlock title="Account Notes">
                <div style={crmMutedTextStyle}>{currentClient.notes || "No service-relevant notes yet."}</div>
              </SectionBlock>

              <SectionBlock title="Primary Contact">
                <DetailRow
                  label="Best Contact"
                  value={currentClient.primaryEmail || currentClient.primaryPhone || "Not set"}
                />
              </SectionBlock>
            </div>
          </div>
        </section>

        <section style={crmCardStyle}>
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <h2 style={{ margin: "0 0 6px" }}>Structural Summary</h2>
              <div style={crmMutedTextStyle}>
                A compact readiness view of this account’s service-location structure.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              }}
            >
              <DetailRow label="Total Properties" value={`${properties.length}`} />
              <DetailRow label="Active / Inactive" value={`${activeProperties.length} / ${inactiveProperties}`} />
              <DetailRow label="Gated Sites" value={`${gatedProperties.length}`} />
              <DetailRow label="Route Groups" value={routeGroups.length ? routeGroups.join(", ") : "Not assigned"} />
              <DetailRow label="Service Mix" value={serviceMix.length ? serviceMix.join(", ") : "Not assigned"} />
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

function HeaderFact({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 4,
        minWidth: 92,
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.35, opacity: 0.62 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900 }}>{value}</div>
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
