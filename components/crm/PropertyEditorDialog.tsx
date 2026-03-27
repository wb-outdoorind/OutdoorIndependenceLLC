"use client";

import { useState } from "react";
import {
  CRM_PROPERTY_TYPES,
  CRM_PROPERTY_TYPE_LABELS,
  crmPropertyFormDefaults,
  type CrmProperty,
  type CrmPropertyFormValues,
} from "@/lib/crm";
import {
  crmInputStyle,
  crmModalBackdropStyle,
  crmModalBodyStyle,
  crmModalCardStyle,
  crmModalFooterStyle,
  crmModalHeaderStyle,
  crmMutedTextStyle,
  crmPrimaryButtonStyle,
  crmSecondaryButtonStyle,
  crmTextareaStyle,
} from "@/components/crm/styles";
import scrollbarStyles from "@/components/crm/modalScrollbar.module.css";

type PropertyEditorDialogProps = {
  property?: CrmProperty | null;
  onClose: () => void;
  onSave: (values: CrmPropertyFormValues) => void;
};

export default function PropertyEditorDialog({
  property,
  onClose,
  onSave,
}: PropertyEditorDialogProps) {
  const isEditing = Boolean(property);
  const [values, setValues] = useState<CrmPropertyFormValues>(() => crmPropertyFormDefaults(property));

  function handleClose() {
    onClose();
  }

  return (
    <div style={crmModalBackdropStyle} onClick={handleClose}>
      <div style={propertyModalCardStyle} onClick={(event) => event.stopPropagation()}>
        <div style={crmModalHeaderStyle}>
          <div>
            <h2 style={{ margin: "0 0 8px" }}>{isEditing ? "Edit Property" : "Add Property"}</h2>
            <div style={crmMutedTextStyle}>
              Built for outdoor-service field reality: address, access notes, and operational context.
            </div>
          </div>

          <button type="button" style={crmSecondaryButtonStyle} onClick={handleClose}>
            Close
          </button>
        </div>

        <div style={modalContentLayoutStyle}>
          <div className={scrollbarStyles.scrollbarDark} style={crmModalBodyStyle}>
            <div
              style={{
                marginTop: 18,
                display: "grid",
                gap: 14,
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              }}
            >
              <Field label="Property Name">
                <input
                  type="text"
                  value={values.propertyName}
                  style={crmInputStyle}
                  onChange={(event) => setValues((current) => ({ ...current, propertyName: event.target.value }))}
                />
              </Field>

              <Field label="Property Type">
                <select
                  value={values.propertyType}
                  style={crmInputStyle}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      propertyType: event.target.value as CrmPropertyFormValues["propertyType"],
                    }))
                  }
                >
                  {CRM_PROPERTY_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {CRM_PROPERTY_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Address Line 1">
                <input
                  type="text"
                  value={values.addressLine1}
                  style={crmInputStyle}
                  onChange={(event) => setValues((current) => ({ ...current, addressLine1: event.target.value }))}
                />
              </Field>

              <Field label="Address Line 2">
                <input
                  type="text"
                  value={values.addressLine2}
                  style={crmInputStyle}
                  onChange={(event) => setValues((current) => ({ ...current, addressLine2: event.target.value }))}
                />
              </Field>

              <Field label="City">
                <input
                  type="text"
                  value={values.city}
                  style={crmInputStyle}
                  onChange={(event) => setValues((current) => ({ ...current, city: event.target.value }))}
                />
              </Field>

              <Field label="State">
                <input
                  type="text"
                  value={values.state}
                  style={crmInputStyle}
                  onChange={(event) => setValues((current) => ({ ...current, state: event.target.value }))}
                />
              </Field>

              <Field label="Postal Code">
                <input
                  type="text"
                  value={values.postalCode}
                  style={crmInputStyle}
                  onChange={(event) => setValues((current) => ({ ...current, postalCode: event.target.value }))}
                />
              </Field>

              <Field label="Country">
                <input
                  type="text"
                  value={values.country}
                  style={crmInputStyle}
                  onChange={(event) => setValues((current) => ({ ...current, country: event.target.value }))}
                />
              </Field>

              <Field label="Lawn Size (sqft)">
                <input
                  type="text"
                  value={values.lawnSizeSqft}
                  style={crmInputStyle}
                  onChange={(event) => setValues((current) => ({ ...current, lawnSizeSqft: event.target.value }))}
                />
              </Field>

              <Field label="Acreage">
                <input
                  type="text"
                  value={values.acreage}
                  style={crmInputStyle}
                  onChange={(event) => setValues((current) => ({ ...current, acreage: event.target.value }))}
                />
              </Field>
            </div>

            <div
              style={{
                marginTop: 16,
                display: "grid",
                gap: 14,
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              }}
            >
              <Toggle
                label="Gate Present"
                checked={values.gatePresent}
                onChange={(checked) => setValues((current) => ({ ...current, gatePresent: checked }))}
              />
              <Toggle
                label="Locked Gate"
                checked={values.lockedGate}
                onChange={(checked) => setValues((current) => ({ ...current, lockedGate: checked }))}
              />
              <Toggle
                label="Pets Present"
                checked={values.petsPresent}
                onChange={(checked) => setValues((current) => ({ ...current, petsPresent: checked }))}
              />
              <Toggle
                label="Active Property"
                checked={values.isActive}
                onChange={(checked) => setValues((current) => ({ ...current, isActive: checked }))}
              />
              <Toggle
                label="Billing Same As Service"
                checked={values.billingSameAsServiceAddress}
                onChange={(checked) =>
                  setValues((current) => ({ ...current, billingSameAsServiceAddress: checked }))
                }
              />
            </div>

            <div
              style={{
                marginTop: 16,
                display: "grid",
                gap: 16,
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              }}
            >
              <Field label="Entry Notes">
                <textarea
                  value={values.entryNotes}
                  style={crmTextareaStyle}
                  onChange={(event) => setValues((current) => ({ ...current, entryNotes: event.target.value }))}
                />
              </Field>

              <Field label="Site Notes">
                <textarea
                  value={values.siteNotes}
                  style={crmTextareaStyle}
                  onChange={(event) => setValues((current) => ({ ...current, siteNotes: event.target.value }))}
                />
              </Field>
            </div>

            {!values.billingSameAsServiceAddress ? (
              <div
                style={{
                  marginTop: 14,
                  display: "grid",
                  gap: 14,
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                }}
              >
                <Field label="Billing Address Line 1">
                  <input
                    type="text"
                    value={values.billingAddressLine1}
                    style={crmInputStyle}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, billingAddressLine1: event.target.value }))
                    }
                  />
                </Field>
                <Field label="Billing Address Line 2">
                  <input
                    type="text"
                    value={values.billingAddressLine2}
                    style={crmInputStyle}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, billingAddressLine2: event.target.value }))
                    }
                  />
                </Field>
                <Field label="Billing City">
                  <input
                    type="text"
                    value={values.billingCity}
                    style={crmInputStyle}
                    onChange={(event) => setValues((current) => ({ ...current, billingCity: event.target.value }))}
                  />
                </Field>
                <Field label="Billing State">
                  <input
                    type="text"
                    value={values.billingState}
                    style={crmInputStyle}
                    onChange={(event) => setValues((current) => ({ ...current, billingState: event.target.value }))}
                  />
                </Field>
                <Field label="Billing Postal Code">
                  <input
                    type="text"
                    value={values.billingPostalCode}
                    style={crmInputStyle}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, billingPostalCode: event.target.value }))
                    }
                  />
                </Field>
                <Field label="Billing Country">
                  <input
                    type="text"
                    value={values.billingCountry}
                    style={crmInputStyle}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, billingCountry: event.target.value }))
                    }
                  />
                </Field>
              </div>
            ) : null}
          </div>

          <div style={crmModalFooterStyle}>
            <button type="button" style={crmSecondaryButtonStyle} onClick={handleClose}>
              Cancel
            </button>
            <button type="button" style={propertyPrimaryButtonStyle} onClick={() => onSave(values)}>
              {isEditing ? "Save Changes" : "Save Property"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const propertyModalCardStyle: React.CSSProperties = {
  ...crmModalCardStyle,
  width: "min(960px, 100%)",
};

const modalContentLayoutStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: "1 1 auto",
  minHeight: 0,
};

const propertyPrimaryButtonStyle: React.CSSProperties = {
  ...crmPrimaryButtonStyle,
  padding: "10px 20px 10px 16px",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
      <span style={{ opacity: 0.76 }}>{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        minHeight: 46,
        padding: "10px 14px",
        borderRadius: 12,
        border: "1px solid var(--surface-border)",
        background: "rgba(255,255,255,0.04)",
        lineHeight: 1.4,
      }}
    >
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
