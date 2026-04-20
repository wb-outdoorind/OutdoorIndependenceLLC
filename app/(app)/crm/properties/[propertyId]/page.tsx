"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import CrmShell from "@/components/crm/CrmShell";
import { useCrm } from "@/components/crm/CrmMockDataProvider";
import PropertyEditorDialog from "@/components/crm/PropertyEditorDialog";
import {
  crmCardStyle,
  crmDangerButtonStyle,
  crmMutedTextStyle,
  crmSecondaryButtonStyle,
  crmSubtleCardStyle,
} from "@/components/crm/styles";
import { CRM_PROPERTY_TYPE_LABELS, crmPropertyAddress } from "@/lib/crm";

export default function CrmPropertyDetailPage() {
  const params = useParams<{ propertyId: string }>();
  const router = useRouter();
  const propertyId = decodeURIComponent(params.propertyId);
  const { getProperty, getClient, saveProperty, deleteProperty } = useCrm();
  const property = getProperty(propertyId);
  const client = property ? getClient(property.clientId) : null;
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);

  if (!property || !client) {
    return (
      <CrmShell title="Property Not Found" description="This property record is no longer available.">
        <section style={crmCardStyle}>
          <div style={crmMutedTextStyle}>
            The property may have been removed from the parent client. Return to the clients hub to continue.
          </div>
        </section>
      </CrmShell>
    );
  }

  const currentProperty = property;
  const parentClient = client;

  function handleDelete() {
    deleteProperty(currentProperty.id);
    router.push(`/crm/clients/${encodeURIComponent(parentClient.id)}`);
  }

  return (
    <CrmShell
      title={currentProperty.propertyName}
      description="Service location, access conditions, and site context for work at this property."
      backHref={`/crm/clients/${encodeURIComponent(parentClient.id)}`}
      backLabel={`Back to ${parentClient.displayName}`}
      breadcrumb={
        <>
          <Link href="/crm/clients" style={{ color: "inherit", textDecoration: "none" }}>
            Clients & Properties
          </Link>{" "}
          &gt;{" "}
          <Link
            href={`/crm/clients/${encodeURIComponent(parentClient.id)}`}
            style={{ color: "inherit", textDecoration: "none" }}
          >
            {parentClient.displayName}
          </Link>{" "}
          &gt; {currentProperty.propertyName}
        </>
      }
      actions={
        <>
          <button type="button" style={crmSecondaryButtonStyle} onClick={() => setEditorOpen(true)}>
            Edit Property
          </button>
          {deleteArmed ? (
            <>
              <button type="button" style={crmDangerButtonStyle} onClick={handleDelete}>
                Confirm Delete
              </button>
              <button type="button" style={crmSecondaryButtonStyle} onClick={() => setDeleteArmed(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" style={crmDangerButtonStyle} onClick={() => setDeleteArmed(true)}>
              Delete Property
            </button>
          )}
        </>
      }
    >
      <div style={{ display: "grid", gap: 16 }}>
        <section style={crmCardStyle}>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.35, opacity: 0.54 }}>Parent Client</div>
              <div style={{ fontSize: 17, fontWeight: 900 }}>
                <Link href={`/crm/clients/${encodeURIComponent(parentClient.id)}`} style={{ color: "#cfe3ff" }}>
                  {parentClient.displayName}
                </Link>
              </div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <h2 style={{ margin: 0 }}>Service Location</h2>
              <div style={{ fontSize: 19, fontWeight: 900, lineHeight: 1.38 }}>{crmPropertyAddress(currentProperty)}</div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <HeaderFact label={CRM_PROPERTY_TYPE_LABELS[currentProperty.propertyType]} />
              <HeaderFact label={currentProperty.isActive ? "Active" : "Inactive"} subtle={!currentProperty.isActive} />
            </div>
          </div>
        </section>

        <section
          style={{
            ...crmCardStyle,
            border: "1px solid rgba(255,255,255,0.045)",
            background: "rgba(255,255,255,0.022)",
          }}
        >
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <h2 style={{ margin: "0 0 6px" }}>Access + Site-Critical Context</h2>
              <div style={crmMutedTextStyle}>What the team needs to know before work happens at this property.</div>
            </div>

            <div
              style={{
                display: "grid",
                gap: 18,
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  alignContent: "start",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.35, opacity: 0.66 }}>
                  Access Conditions
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {currentProperty.gatePresent ? <AccessPill label="Gate" /> : null}
                  {currentProperty.lockedGate ? <AccessPill label="Locked Gate" /> : null}
                  {currentProperty.petsPresent ? <AccessPill label="Pets" /> : null}
                  {!currentProperty.gatePresent && !currentProperty.lockedGate && !currentProperty.petsPresent ? (
                    <div style={crmMutedTextStyle}>No access flags recorded.</div>
                  ) : null}
                </div>
                <DetailBlock
                  label="Entry Notes"
                  value={currentProperty.entryNotes || "No entry notes recorded."}
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 12,
                  alignContent: "start",
                }}
              >
                <DetailBlock
                  label="Site Notes"
                  value={currentProperty.siteNotes || "No site notes recorded."}
                />
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            ...crmSubtleCardStyle,
            border: "1px solid rgba(255,255,255,0.04)",
            background: "rgba(255,255,255,0.014)",
          }}
        >
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <h2 style={{ margin: "0 0 6px" }}>Property Metadata</h2>
              <div style={crmMutedTextStyle}>
                Reference details that support the record after service location and access context.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              }}
            >
              <DetailBlock label="Type" value={CRM_PROPERTY_TYPE_LABELS[currentProperty.propertyType]} labelOpacity={0.5} />
              <DetailBlock label="Active" value={currentProperty.isActive ? "Yes" : "No"} labelOpacity={0.5} />
              <DetailBlock
                label="Lawn Size"
                value={currentProperty.lawnSizeSqft != null ? `${currentProperty.lawnSizeSqft.toLocaleString()} sqft` : "Not set"}
                labelOpacity={0.5}
              />
              <DetailBlock
                label="Acreage"
                value={currentProperty.acreage != null ? `${currentProperty.acreage}` : "Not set"}
                labelOpacity={0.5}
              />
              <DetailBlock
                label="Billing Same As Service"
                value={currentProperty.billingSameAsServiceAddress ? "Yes" : "No"}
                labelOpacity={0.5}
              />
            </div>
          </div>
        </section>
      </div>

      {editorOpen ? (
        <PropertyEditorDialog
          property={currentProperty}
          onClose={() => setEditorOpen(false)}
          onSave={(values) => {
            saveProperty(parentClient.id, values, currentProperty.id);
            setEditorOpen(false);
          }}
        />
      ) : null}
    </CrmShell>
  );
}

function HeaderFact({ label, subtle = false }: { label: string; subtle?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 28,
        padding: "5px 10px",
        borderRadius: 999,
        border: subtle ? "1px solid rgba(255, 126, 126, 0.2)" : "1px solid var(--surface-border)",
        background: subtle ? "rgba(126, 29, 29, 0.12)" : "rgba(255,255,255,0.05)",
        color: subtle ? "#ffd0d0" : "inherit",
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {label}
    </span>
  );
}

function AccessPill({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 28,
        padding: "5px 9px",
        borderRadius: 999,
        border: "1px solid rgba(116, 168, 255, 0.18)",
        background: "rgba(33, 74, 141, 0.14)",
        color: "#cfe3ff",
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {label}
    </span>
  );
}

function DetailBlock({
  label,
  value,
  labelOpacity = 0.56,
}: {
  label: string;
  value: React.ReactNode;
  labelOpacity?: number;
}) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3, opacity: labelOpacity }}>{label}</div>
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}
