"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  crmCardStyle,
  crmInputStyle,
  crmMutedTextStyle,
  crmPrimaryButtonStyle,
  crmSecondaryButtonStyle,
  crmSubtleCardStyle,
  crmTextareaStyle,
} from "@/components/crm/styles";
import { crmPropertyAddress, type CrmClient, type CrmProperty } from "@/lib/crm";
import { ESTIMATE_SERVICE_LINE_OPTIONS, type EstimateServiceLine } from "@/lib/estimatePersistence";
import {
  type LocalEstimateDraft,
  type LocalEstimateLineItem,
  localEstimateDraftStorageKey,
} from "@/lib/estimateLocalDraft";
import { ESTIMATE_SERVICE_TEMPLATES } from "@/lib/estimateTemplates";

type EstimateEntryWorkspaceProps = {
  clients: CrmClient[];
  properties: CrmProperty[];
  crmLoadError?: string | null;
  initialDraft?: LocalEstimateDraft | null;
  localDraftId?: string;
};

type BillingMode = "one_time" | "recurring";

function createLineItem(): LocalEstimateLineItem {
  return {
    id: crypto.randomUUID(),
    description: "",
    quantity: "1",
    unit: "",
    price: "",
  };
}

function asNumber(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function lineItemTotal(item: LocalEstimateLineItem) {
  return asNumber(item.quantity) * asNumber(item.price);
}

function isBlankLineItem(item: LocalEstimateLineItem) {
  return !item.description.trim() && !item.unit.trim() && !item.price.trim() && (!item.quantity.trim() || item.quantity === "1");
}

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export default function EstimateEntryWorkspace({
  clients,
  properties,
  crmLoadError = null,
  initialDraft = null,
  localDraftId,
}: EstimateEntryWorkspaceProps) {
  const router = useRouter();
  const [activeDraftId, setActiveDraftId] = useState<string | null>(
    localDraftId ?? initialDraft?.id ?? null
  );
  const [selectedClientId, setSelectedClientId] = useState(initialDraft?.clientId ?? "");
  const [selectedPropertyId, setSelectedPropertyId] = useState(initialDraft?.propertyId ?? "");
  const [isEditingContext, setIsEditingContext] = useState(
    !(initialDraft?.clientId && initialDraft?.propertyId)
  );
  const [serviceType, setServiceType] = useState<EstimateServiceLine>(initialDraft?.serviceType ?? "maintenance");
  const [hasEditedServiceType, setHasEditedServiceType] = useState(Boolean(initialDraft?.serviceType));
  const [description, setDescription] = useState(initialDraft?.description ?? "");
  const [notes, setNotes] = useState(initialDraft?.notes ?? "");
  const [billingMode, setBillingMode] = useState<BillingMode>(initialDraft?.billingMode ?? "one_time");
  const [lineItems, setLineItems] = useState<LocalEstimateLineItem[]>(
    initialDraft?.lineItems?.length ? initialDraft.lineItems : [createLineItem()]
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [hoveredTemplateId, setHoveredTemplateId] = useState<string | null>(null);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) ?? null,
    [clients, selectedClientId]
  );

  const propertiesForClient = useMemo(
    () =>
      properties
        .filter((property) => property.clientId === selectedClientId)
        .sort((left, right) => left.propertyName.localeCompare(right.propertyName)),
    [properties, selectedClientId]
  );

  const selectedProperty = useMemo(
    () => propertiesForClient.find((property) => property.id === selectedPropertyId) ?? null,
    [propertiesForClient, selectedPropertyId]
  );

  const totalCost = useMemo(
    () => lineItems.reduce((sum, item) => sum + lineItemTotal(item), 0),
    [lineItems]
  );

  const canSave = Boolean(selectedClient && selectedProperty);
  const showContextDisplay = canSave && !isEditingContext;

  useEffect(() => {
    if (!saveNotice) return;

    const timeoutId = window.setTimeout(() => {
      setSaveNotice(null);
    }, 2600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [saveNotice]);

  function updateLineItem(
    itemId: string,
    field: keyof Omit<LocalEstimateLineItem, "id">,
    value: string
  ) {
    setLineItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, [field]: value } : item))
    );
  }

  function removeLineItem(itemId: string) {
    setLineItems((current) => {
      const next = current.filter((item) => item.id !== itemId);
      return next.length ? next : [createLineItem()];
    });
  }

  function handleInsertTemplate(templateId: string) {
    const template = ESTIMATE_SERVICE_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;

    const insertedItems = template.lineItems.map((item) => ({
      id: crypto.randomUUID(),
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      price: item.price,
    }));

    setLineItems((current) => {
      if (current.length === 1 && isBlankLineItem(current[0])) {
        return insertedItems;
      }

      return [...current, ...insertedItems];
    });

    if (!hasEditedServiceType) {
      setServiceType(template.serviceType);
    }
    setShowTemplateMenu(false);
  }

  async function handleSaveEstimate() {
    if (isSaving) return;

    if (!selectedClient || !selectedProperty) {
      setSaveError("Select a client and property before saving this estimate.");
      return;
    }

    setIsSaving(true);

    const draftId = activeDraftId ?? `local_estimate_${crypto.randomUUID()}`;
    const draft: LocalEstimateDraft = {
      id: draftId,
      clientId: selectedClient.id,
      clientName: selectedClient.displayName,
      propertyId: selectedProperty.id,
      propertyName: selectedProperty.propertyName,
      serviceAddress: crmPropertyAddress(selectedProperty),
      serviceType,
      description: description.trim(),
      notes: notes.trim(),
      billingMode,
      lineItems,
      totalCost,
      savedAt: new Date().toISOString(),
    };

    try {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 120);
      });
      window.localStorage.setItem(localEstimateDraftStorageKey(draftId), JSON.stringify(draft));
      setActiveDraftId(draftId);
      setSaveError(null);
      setSaveNotice("Draft saved");
      setIsEditingContext(false);
    } catch (error) {
      setSaveNotice(null);
      setSaveError(error instanceof Error ? error.message : "Unable to save this estimate in the browser.");
    } finally {
      setIsSaving(false);
    }
  }

  if (crmLoadError) {
    return (
      <section style={crmCardStyle}>
        <div style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0 }}>CRM Data Unavailable</h2>
          <div style={crmMutedTextStyle}>
            The estimate entry shell could not load client and property records. Fix CRM loading before continuing.
          </div>
          <div
            style={{
              ...crmSubtleCardStyle,
              border: "1px solid rgba(255, 126, 126, 0.22)",
              color: "#ffd7d7",
              fontFamily: "monospace",
              fontSize: 13,
            }}
          >
            {crmLoadError}
          </div>
        </div>
      </section>
    );
  }

  if (!clients.length) {
    return (
      <section style={crmCardStyle}>
        <div style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0 }}>No CRM Accounts Available</h2>
          <div style={crmMutedTextStyle}>
            Add at least one client and property before starting a new estimate.
          </div>
        </div>
      </section>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <section
        style={{
          ...crmCardStyle,
          padding: 0,
          overflow: "hidden",
          background: "linear-gradient(180deg, rgba(16, 21, 31, 0.96), rgba(11, 16, 24, 0.96))",
        }}
      >
        <div style={{ display: "grid", gap: 0 }}>
          {showContextDisplay ? (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 14,
                flexWrap: "wrap",
                alignItems: "start",
                padding: "14px 16px 12px",
              }}
            >
              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.35, opacity: 0.62 }}>
                  Estimate Context
                </div>
                <div style={{ fontSize: 21, fontWeight: 900 }}>{selectedClient?.displayName}</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedProperty?.propertyName}</div>
                <div style={crmMutedTextStyle}>{selectedProperty ? crmPropertyAddress(selectedProperty) : null}</div>
              </div>

              <button
                type="button"
                style={{
                  ...crmSecondaryButtonStyle,
                  minHeight: 34,
                  padding: "7px 11px",
                  background: "rgba(255,255,255,0.04)",
                }}
                onClick={() => setIsEditingContext(true)}
              >
                Change Context
              </button>
            </div>
          ) : (
            <div style={{ padding: "14px 16px 12px", display: "grid", gap: 12 }}>
              <div>
                <h2 style={{ margin: "0 0 6px" }}>Estimate Context</h2>
                <div style={crmMutedTextStyle}>
                  Choose the client first, then attach the property before defining the work.
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                }}
              >
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, opacity: 0.78 }}>Client</span>
                  <select
                    value={selectedClientId}
                    onChange={(event) => {
                      setSelectedClientId(event.target.value);
                      setSelectedPropertyId("");
                      setSaveError(null);
                      setIsEditingContext(true);
                    }}
                    style={crmInputStyle}
                  >
                    <option value="">Select a client</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.displayName}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, opacity: 0.78 }}>Property</span>
                  <select
                    value={selectedPropertyId}
                    onChange={(event) => {
                      const nextPropertyId = event.target.value;
                      setSelectedPropertyId(nextPropertyId);
                      setSaveError(null);
                      setIsEditingContext(!nextPropertyId);
                    }}
                    style={crmInputStyle}
                    disabled={!selectedClient}
                  >
                    <option value="">{selectedClient ? "Select a property" : "Choose a client first"}</option>
                    {propertiesForClient.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.propertyName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "16px 18px 14px", display: "grid", gap: 12 }}>
            <div>
              <h2 style={{ margin: "0 0 6px" }}>Work Definition</h2>
              <div style={crmMutedTextStyle}>
                Capture the service type, the work description, and any supporting notes.
              </div>
            </div>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, opacity: 0.78 }}>Service Type</span>
              <select
                value={serviceType}
                onChange={(event) => {
                  setServiceType(event.target.value as EstimateServiceLine);
                  setHasEditedServiceType(true);
                }}
                style={crmInputStyle}
              >
                {ESTIMATE_SERVICE_LINE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, opacity: 0.78 }}>Description</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe the work being priced for this property."
                style={{ ...crmTextareaStyle, minHeight: 120 }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, opacity: 0.78 }}>Notes (Optional)</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Capture supporting notes, exclusions, or follow-up context."
                style={{ ...crmTextareaStyle, minHeight: 112 }}
              />
            </label>
          </div>

          <div
            style={{
              borderTop: "1px solid rgba(255,255,255,0.08)",
              padding: "14px 18px 12px",
              display: "grid",
              gap: 12,
            }}
          >
            <div>
              <h2 style={{ margin: "0 0 6px" }}>Scope Builder</h2>
              <div style={crmMutedTextStyle}>
                Add simple line items with manual quantity and pricing. No advanced calculations yet.
              </div>
            </div>

            <div style={{ position: "relative", display: "inline-grid", justifyItems: "start" }}>
              <button
                type="button"
                style={{
                  ...crmSecondaryButtonStyle,
                  minHeight: 34,
                  padding: "7px 11px",
                  background: "rgba(255,255,255,0.04)",
                  fontSize: 13,
                }}
                onClick={() => setShowTemplateMenu((current) => !current)}
              >
                + Insert Template
              </button>

              {showTemplateMenu ? (
                <div
                  style={{
                    marginTop: 10,
                    width: "min(360px, 100%)",
                    paddingTop: 10,
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                    display: "grid",
                    gap: 4,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.58, letterSpacing: 0.2 }}>
                    Start from a template
                  </div>

                  <div style={{ display: "grid" }}>
                    {ESTIMATE_SERVICE_TEMPLATES.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => handleInsertTemplate(template.id)}
                        onMouseEnter={() => setHoveredTemplateId(template.id)}
                        onMouseLeave={() => setHoveredTemplateId((current) => (current === template.id ? null : current))}
                        style={{
                          appearance: "none",
                          border: "none",
                          background:
                            hoveredTemplateId === template.id ? "rgba(255,255,255,0.05)" : "transparent",
                          color: "inherit",
                          textAlign: "left",
                          width: "100%",
                          padding: "8px 2px",
                          fontSize: 14,
                          fontWeight: 700,
                          cursor: "pointer",
                          borderRadius: 8,
                        }}
                      >
                        {template.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {lineItems.map((item, index) => (
                <div
                  key={item.id}
                  style={{
                    display: "grid",
                    gap: 8,
                    padding: index === 0 ? "0" : "2px 0 0",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.56 }}>Line Item {index + 1}</div>
                    {lineItems.length > 1 ? (
                      <button
                        type="button"
                        style={{
                          ...crmSecondaryButtonStyle,
                          minHeight: 32,
                          padding: "5px 9px",
                          fontSize: 12,
                          background: "rgba(255,255,255,0.04)",
                        }}
                        onClick={() => removeLineItem(item.id)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: 8,
                      gridTemplateColumns: "minmax(0, 2.5fr) repeat(3, minmax(96px, 1fr))",
                    }}
                  >
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 11, opacity: 0.62 }}>Description</span>
                      <input
                        value={item.description}
                        onChange={(event) => updateLineItem(item.id, "description", event.target.value)}
                        placeholder="Line item description"
                        style={crmInputStyle}
                      />
                    </label>

                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 11, opacity: 0.62 }}>Quantity</span>
                      <input
                        value={item.quantity}
                        onChange={(event) => updateLineItem(item.id, "quantity", event.target.value)}
                        inputMode="decimal"
                        placeholder="1"
                        style={crmInputStyle}
                      />
                    </label>

                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 11, opacity: 0.62 }}>Unit</span>
                      <input
                        value={item.unit}
                        onChange={(event) => updateLineItem(item.id, "unit", event.target.value)}
                        placeholder="Optional"
                        style={crmInputStyle}
                      />
                    </label>

                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 11, opacity: 0.62 }}>Price</span>
                      <input
                        value={item.price}
                        onChange={(event) => updateLineItem(item.id, "price", event.target.value)}
                        inputMode="decimal"
                        placeholder="0.00"
                        style={crmInputStyle}
                      />
                    </label>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      fontSize: 12,
                      fontWeight: 700,
                      opacity: 0.82,
                    }}
                  >
                    {currency(lineItemTotal(item))}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <button
                type="button"
                style={{
                  ...crmSecondaryButtonStyle,
                  minHeight: 34,
                  padding: "7px 11px",
                  background: "rgba(255,255,255,0.04)",
                }}
                onClick={() => setLineItems((current) => [...current, createLineItem()])}
              >
                + Add Line Item
              </button>
            </div>

            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.08)",
                paddingTop: 12,
                display: "grid",
                gap: 12,
              }}
            >
              <div>
                <h2 style={{ margin: "0 0 6px" }}>Summary</h2>
                <div style={crmMutedTextStyle}>
                  Review the draft total and choose whether this estimate is one-time or recurring.
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  flexWrap: "wrap",
                  alignItems: "end",
                }}
              >
                <label style={{ display: "grid", gap: 6, minWidth: 220 }}>
                  <span style={{ fontSize: 13, opacity: 0.78 }}>Estimate Type</span>
                  <select
                    value={billingMode}
                    onChange={(event) => setBillingMode(event.target.value as BillingMode)}
                    style={crmInputStyle}
                  >
                    <option value="one_time">One-Time</option>
                    <option value="recurring">Recurring</option>
                  </select>
                </label>

                <div style={{ display: "grid", gap: 4, justifyItems: "end" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.62, letterSpacing: 0.35 }}>
                    Total Cost
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 900 }}>{currency(totalCost)}</div>
                </div>
              </div>

              {saveError ? (
                <div
                  style={{
                    border: "1px solid rgba(255, 126, 126, 0.22)",
                    borderRadius: 12,
                    background: "rgba(126, 29, 29, 0.12)",
                    padding: "10px 12px",
                    color: "#ffd7d7",
                    fontSize: 13,
                  }}
                >
                  {saveError}
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  style={{ ...crmPrimaryButtonStyle, minHeight: 38, padding: "9px 13px" }}
                  onClick={handleSaveEstimate}
                  disabled={!canSave || isSaving}
                >
                  {isSaving ? "Saving…" : "Save Estimate"}
                </button>
                <button
                  type="button"
                  style={{ ...crmSecondaryButtonStyle, minHeight: 38, padding: "9px 13px", background: "rgba(255,255,255,0.04)" }}
                  onClick={() => router.push("/estimates")}
                >
                  Cancel
                </button>
                {saveNotice ? (
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#cfe8c7",
                      opacity: 0.92,
                    }}
                  >
                    {saveNotice}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
