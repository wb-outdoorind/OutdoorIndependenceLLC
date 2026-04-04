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
                  <PropertyCard
                    key={property.id}
                    property={property}
                    pendingDelete={pendingPropertyDeleteId === property.id}
                    onOpen={() => router.push(`/crm/properties/${encodeURIComponent(property.id)}`)}
                    onEdit={() => {
                      setEditingProperty(property);
                      setPropertyDialogOpen(true);
                    }}
                    onDelete={() => handleDeleteProperty(property)}
                    onArmDelete={() => setPendingPropertyDeleteId(property.id)}
                    onCancelDelete={() => setPendingPropertyDeleteId(null)}
                  />
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

function PropertyCard({
  property,
  pendingDelete,
  onOpen,
  onEdit,
  onDelete,
  onArmDelete,
  onCancelDelete,
}: {
  property: CrmProperty;
  pendingDelete: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onArmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const accessLabel = getPropertyAccessLabel(property);
  const notesCount = getPropertyNotesCount(property);
  const propertyTypeLabel = CRM_PROPERTY_TYPE_LABELS[property.propertyType];
  const isMultiSite = property.propertyType === "multi_site";

  return (
    <article
      style={{
        ...crmSubtleCardStyle,
        display: "grid",
        gap: 10,
        padding: 16,
        cursor: "pointer",
      }}
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== "Enter") return;
        onOpen();
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "start",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "grid", gap: 8, minWidth: 0, flex: "1 1 320px" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ fontWeight: 800, fontSize: 17, lineHeight: 1.2 }}>{property.propertyName}</div>
            {isMultiSite ? <QuietBadge label="Multi-Site" /> : null}
            {!property.isActive ? <StatusBadge label="Inactive" /> : null}
          </div>

          <div style={{ fontSize: 14, lineHeight: 1.45 }}>{crmPropertyAddress(property)}</div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            {!isMultiSite ? <PrimaryMeta label={propertyTypeLabel} /> : null}
            {property.routeGroup ? <PrimaryMeta label={`Route: ${property.routeGroup}`} /> : null}
            {accessLabel ? <SecondaryMeta label={`Access: ${accessLabel}`} /> : null}
            {notesCount > 0 ? (
              <SecondaryMeta label={notesCount === 1 ? "Notes" : `${notesCount} notes`} />
            ) : null}
          </div>
        </div>

        <div
          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
          onClick={(event) => event.stopPropagation()}
        >
          <Link href={`/crm/properties/${encodeURIComponent(property.id)}`} style={smallActionButtonStyle}>
            View
          </Link>
          <button type="button" style={smallActionButtonStyle} onClick={onEdit}>
            Edit
          </button>
          {pendingDelete ? (
            <>
              <button type="button" style={smallDangerButtonStyle} onClick={onDelete}>
                Confirm Delete
              </button>
              <button type="button" style={smallActionButtonStyle} onClick={onCancelDelete}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" style={smallDangerButtonStyle} onClick={onArmDelete}>
              Delete
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function PrimaryMeta({ label }: { label: string }) {
  return <span style={{ fontWeight: 700 }}>{label}</span>;
}

function SecondaryMeta({ label }: { label: string }) {
  return <span style={{ opacity: 0.72 }}>{label}</span>;
}

function QuietBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 24,
        padding: "3px 8px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
        fontSize: 11,
        fontWeight: 700,
        opacity: 0.78,
      }}
    >
      {label}
    </span>
  );
}

function StatusBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 24,
        padding: "3px 8px",
        borderRadius: 999,
        border: "1px solid rgba(255, 126, 126, 0.2)",
        background: "rgba(126, 29, 29, 0.16)",
        color: "#ffd0d0",
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  );
}

function getPropertyAccessLabel(property: CrmProperty) {
  const accessBits: string[] = [];

  if (property.gatePresent) accessBits.push("Gate");
  if (property.lockedGate) accessBits.push("Locked Gate");
  if (property.petsPresent) accessBits.push("Pets");

  return accessBits.join(", ");
}

function getPropertyNotesCount(property: CrmProperty) {
  return Number(Boolean(property.entryNotes?.trim())) + Number(Boolean(property.siteNotes?.trim()));
}

const smallActionButtonStyle: React.CSSProperties = {
  ...crmSecondaryButtonStyle,
  minHeight: 34,
  padding: "7px 10px",
  borderRadius: 10,
  fontSize: 12,
};

const smallDangerButtonStyle: React.CSSProperties = {
  ...crmDangerButtonStyle,
  minHeight: 34,
  padding: "7px 10px",
  borderRadius: 10,
  fontSize: 12,
};
