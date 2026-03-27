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
      <CrmShell
        title="Property Not Found"
        description="This property record is no longer available."
      >
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
      description="Property summary, service address, access notes, and site context for outdoor service work."
      backHref={`/crm/clients/${encodeURIComponent(parentClient.id)}`}
      backLabel={`Back to ${parentClient.displayName}`}
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
        <section
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 0.95fr)",
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: 16 }}>
            <div style={crmCardStyle}>
              <h2 style={{ marginTop: 0, marginBottom: 10 }}>Service Address</h2>
              <div style={{ fontWeight: 800 }}>{crmPropertyAddress(currentProperty)}</div>
              <div style={{ marginTop: 10, ...crmMutedTextStyle }}>
                Parent client:{" "}
                <Link href={`/crm/clients/${encodeURIComponent(parentClient.id)}`} style={{ color: "#cfe3ff" }}>
                  {parentClient.displayName}
                </Link>
              </div>
            </div>

            <div style={crmCardStyle}>
              <h2 style={{ marginTop: 0, marginBottom: 10 }}>Access Notes</h2>
              <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
                <div><strong>Gate Present:</strong> {currentProperty.gatePresent ? "Yes" : "No"}</div>
                <div><strong>Locked Gate:</strong> {currentProperty.lockedGate ? "Yes" : "No"}</div>
                <div><strong>Pets Present:</strong> {currentProperty.petsPresent ? "Yes" : "No"}</div>
              </div>
              <div style={{ marginTop: 12, ...crmMutedTextStyle }}>
                {currentProperty.entryNotes || "No entry notes recorded."}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <div style={crmCardStyle}>
              <h2 style={{ marginTop: 0, marginBottom: 10 }}>Property Metadata</h2>
              <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
                <div><strong>Type:</strong> {CRM_PROPERTY_TYPE_LABELS[currentProperty.propertyType]}</div>
                <div><strong>Active:</strong> {currentProperty.isActive ? "Yes" : "No"}</div>
                <div><strong>Lawn Size:</strong> {currentProperty.lawnSizeSqft?.toLocaleString() ?? "Not set"} sqft</div>
                <div><strong>Acreage:</strong> {currentProperty.acreage ?? "Not set"}</div>
                <div><strong>Billing Same As Service:</strong> {currentProperty.billingSameAsServiceAddress ? "Yes" : "No"}</div>
              </div>
            </div>

            <div style={crmCardStyle}>
              <h2 style={{ marginTop: 0, marginBottom: 10 }}>Site Notes</h2>
              <div style={crmMutedTextStyle}>{currentProperty.siteNotes || "No site notes recorded."}</div>
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
