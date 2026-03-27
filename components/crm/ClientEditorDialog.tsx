"use client";

import { useState } from "react";
import {
  CRM_CLIENT_TYPES,
  CRM_CLIENT_TYPE_LABELS,
  crmClientFormDefaults,
  type CrmClient,
  type CrmClientFormValues,
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

const CLIENT_FORM_TYPES = CRM_CLIENT_TYPES.filter((type) => type !== "other");
const CLIENT_FORM_STATUSES = ["active", "inactive"] as const;

type ClientEditorDialogProps = {
  client?: CrmClient | null;
  onClose: () => void;
  onSave: (values: CrmClientFormValues) => void;
};

export default function ClientEditorDialog({
  client,
  onClose,
  onSave,
}: ClientEditorDialogProps) {
  const isEditing = Boolean(client);
  const [values, setValues] = useState<CrmClientFormValues>(() => crmClientFormDefaults(client));
  const [nameError, setNameError] = useState<string | null>(null);
  const [isNameFocused, setIsNameFocused] = useState(false);
  const canSave = values.clientName.length > 0;

  function handleClose() {
    onClose();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!values.clientName.trim()) {
      setNameError("Client name is required");
      return;
    }

    onSave({
      ...values,
      clientName: values.clientName.trim(),
    });
  }

  return (
    <div style={crmModalBackdropStyle} onClick={handleClose}>
      <form onSubmit={handleSubmit} style={clientModalCardStyle} onClick={(event) => event.stopPropagation()}>
        <div style={crmModalHeaderStyle}>
          <div>
            <h2 style={{ margin: "0 0 8px" }}>{isEditing ? "Edit Client" : "Add Client"}</h2>
            <div style={crmMutedTextStyle}>Keep the record clear, fast to update, and ready for service work.</div>
          </div>

          <button type="button" style={crmSecondaryButtonStyle} onClick={handleClose}>
            Close
          </button>
        </div>

        <div className={scrollbarStyles.scrollbarDark} style={crmModalBodyStyle}>
          <Section title="Basic Info">
            <div
              style={{
                display: "grid",
                gap: 16,
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              }}
            >
              <Field
                label="Client Name"
                required
                error={nameError}
                helper="This name will be used across jobs, invoices, and properties."
              >
                <input
                  type="text"
                  autoFocus
                  value={values.clientName}
                  aria-invalid={Boolean(nameError)}
                  style={nameError ? invalidInputStyle : isNameFocused ? focusedInputStyle : transitionedInputStyle}
                  onFocus={() => setIsNameFocused(true)}
                  onBlur={() => setIsNameFocused(false)}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setValues((current) => ({ ...current, clientName: nextValue }));
                    setNameError(null);
                  }}
                />
              </Field>

              <Field label="Client Type">
                <select
                  value={values.clientType}
                  style={crmInputStyle}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      clientType: event.target.value as CrmClientFormValues["clientType"],
                    }))
                  }
                >
                  {CLIENT_FORM_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {CRM_CLIENT_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Status">
                <select
                  value={values.status}
                  style={crmInputStyle}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      status: event.target.value as CrmClientFormValues["status"],
                    }))
                  }
                >
                  {CLIENT_FORM_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status === "active" ? "Active" : "Inactive"}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Section>

          <Section title="Contact Info">
            <div
              style={{
                display: "grid",
                gap: 16,
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              }}
            >
              <Field label="Primary Phone">
                <input
                  type="text"
                  value={values.primaryPhone}
                  style={crmInputStyle}
                  onChange={(event) => setValues((current) => ({ ...current, primaryPhone: event.target.value }))}
                />
              </Field>

              <Field label="Secondary Phone">
                <input
                  type="text"
                  value={values.secondaryPhone}
                  style={crmInputStyle}
                  onChange={(event) => setValues((current) => ({ ...current, secondaryPhone: event.target.value }))}
                />
              </Field>

              <Field label="Primary Email">
                <input
                  type="email"
                  value={values.primaryEmail}
                  style={crmInputStyle}
                  onChange={(event) => setValues((current) => ({ ...current, primaryEmail: event.target.value }))}
                />
              </Field>
            </div>
          </Section>

          <Section title="Billing">
            <div
              style={{
                display: "grid",
                gap: 16,
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              }}
            >
              <Field label="Billing Email">
                <input
                  type="email"
                  value={values.billingEmail}
                  style={crmInputStyle}
                  onChange={(event) => setValues((current) => ({ ...current, billingEmail: event.target.value }))}
                />
              </Field>
            </div>
          </Section>

          <Section title="Notes">
            <Field label="Notes">
              <textarea
                value={values.notes}
                style={crmTextareaStyle}
                onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))}
              />
            </Field>
          </Section>
        </div>

        <div style={crmModalFooterStyle}>
          <button type="button" style={crmSecondaryButtonStyle} onClick={handleClose}>
            Cancel
          </button>
          <button type="submit" style={canSave ? activePrimaryButtonStyle : disabledPrimaryButtonStyle} disabled={!canSave}>
            {isEditing ? "Save Changes" : "Save Client"}
          </button>
        </div>
      </form>
    </div>
  );
}

const clientModalCardStyle: React.CSSProperties = {
  ...crmModalCardStyle,
  width: "min(920px, 100%)",
};

const transitionedInputStyle: React.CSSProperties = {
  ...crmInputStyle,
  transition: "border-color 120ms ease, box-shadow 120ms ease, background 120ms ease",
};

const focusedInputStyle: React.CSSProperties = {
  ...transitionedInputStyle,
  border: "1px solid rgba(116, 168, 255, 0.32)",
  boxShadow: "0 0 0 1px rgba(116, 168, 255, 0.08), inset 0 0 0 1px rgba(116, 168, 255, 0.06)",
};

const invalidInputStyle: React.CSSProperties = {
  ...transitionedInputStyle,
  border: "1px solid rgba(255, 126, 126, 0.34)",
  boxShadow: "inset 0 0 0 1px rgba(255, 126, 126, 0.1)",
};

const activePrimaryButtonStyle: React.CSSProperties = {
  ...crmPrimaryButtonStyle,
  padding: "10px 20px 10px 16px",
  transition: "background 120ms ease, border-color 120ms ease, color 120ms ease, box-shadow 120ms ease, opacity 120ms ease",
};

const disabledPrimaryButtonStyle: React.CSSProperties = {
  ...activePrimaryButtonStyle,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.42)",
  cursor: "not-allowed",
  boxShadow: "none",
  opacity: 0.82,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 24, display: "grid", gap: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.35, opacity: 0.7 }}>{title}</div>
      <div
        style={{
          paddingTop: 16,
          borderTop: "1px solid rgba(255,255,255,0.08)",
          display: "grid",
          gap: 16,
        }}
      >
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  children,
  required = false,
  error,
  helper,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  error?: string | null;
  helper?: string;
}) {
  return (
    <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
      <span style={{ opacity: 0.76 }}>
        {label}
        {required ? <span style={{ color: "#ffb9b9" }}> *</span> : null}
      </span>
      {children}
      {helper ? <span style={{ ...crmMutedTextStyle, fontSize: 12 }}>{helper}</span> : null}
      {error ? <span style={{ color: "#ffb9b9", fontSize: 12 }}>{error}</span> : null}
    </label>
  );
}
