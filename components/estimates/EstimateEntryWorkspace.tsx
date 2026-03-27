"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import scrollbarStyles from "@/components/crm/modalScrollbar.module.css";
import {
  crmCardStyle,
  crmInputStyle,
  crmMutedTextStyle,
  crmPrimaryButtonStyle,
  crmSubtleCardStyle,
  crmTextareaStyle,
} from "@/components/crm/styles";
import {
  CRM_CLIENT_TYPE_LABELS,
  CRM_PROPERTY_TYPE_LABELS,
  crmPropertyAddress,
  type CrmClient,
  type CrmProperty,
} from "@/lib/crm";
import {
  ESTIMATE_SERVICE_LINE_OPTIONS,
  type EstimateServiceLine,
} from "@/lib/estimatePersistence";

type EstimateEntryWorkspaceProps = {
  clients: CrmClient[];
  properties: CrmProperty[];
  crmLoadError?: string | null;
};

export default function EstimateEntryWorkspace({
  clients,
  properties,
  crmLoadError = null,
}: EstimateEntryWorkspaceProps) {
  const router = useRouter();
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [estimateTitle, setEstimateTitle] = useState("");
  const [serviceLine, setServiceLine] = useState<EstimateServiceLine>("maintenance");
  const [targetStart, setTargetStart] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const normalizedSearch = clientSearch.trim().toLowerCase();
  const hasClientSearch = normalizedSearch.length > 0;

  const filteredClients = useMemo(
    () =>
      clients.filter((client) => {
        if (!normalizedSearch) return false;
        return [
          client.displayName,
          client.primaryEmail,
          client.primaryPhone,
          client.billingEmail,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedSearch));
      }),
    [clients, normalizedSearch]
  );

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

  const accessFlags = selectedProperty
    ? [
        selectedProperty.gatePresent ? "Gate" : null,
        selectedProperty.lockedGate ? "Locked Gate" : null,
        selectedProperty.petsPresent ? "Pets" : null,
      ]
        .filter(Boolean)
        .join(", ") || "None"
    : null;

  const hasClient = Boolean(selectedClient);
  const hasProperty = Boolean(selectedProperty);
  const basicsUnlocked = hasClient && hasProperty;
  const scopeReady = hasClient && hasProperty;
  const filteredClientCount = filteredClients.length;

  const handleSelectClient = (clientId: string) => {
    const client = clients.find((entry) => entry.id === clientId);
    setSelectedClientId(clientId);
    setSelectedPropertyId("");
    setSaveError(null);
    if (client) {
      setClientSearch(client.displayName);
    }
  };

  const handleContinue = async () => {
    if (!selectedClient || !selectedProperty || isSaving) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/estimates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: selectedClient.id,
          propertyId: selectedProperty.id,
          title: estimateTitle,
          serviceLine,
          targetStart,
          internalNotes,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; draft?: { id?: string } }
        | null;

      if (!response.ok) {
        setSaveError(payload?.error ?? "Unable to create the estimate draft.");
        setIsSaving(false);
        return;
      }

      const draftId = payload?.draft?.id;
      if (!draftId) {
        setSaveError("The estimate draft was created, but no draft id was returned.");
        setIsSaving(false);
        return;
      }

      router.push(`/estimates/${draftId}`);
      router.refresh();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to create the estimate draft.");
      setIsSaving(false);
    }
  };

  if (crmLoadError) {
    return (
      <section style={crmCardStyle}>
        <div style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0 }}>CRM Data Unavailable</h2>
          <div style={crmMutedTextStyle}>
            The estimate workflow could not load live CRM records. Resolve CRM persistence before continuing.
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
            Estimates start from the shared CRM backbone. Add at least one client and property record before starting a new estimate.
          </div>
        </div>
      </section>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section
        aria-label="Estimate steps"
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        }}
      >
        <StepChip
          step="1"
          title="Client"
          status={hasClient ? "Complete" : "Current"}
          tone={hasClient ? "complete" : "current"}
        />
        <StepChip
          step="2"
          title="Property"
          status={hasProperty ? "Complete" : hasClient ? "Current" : "Locked"}
          tone={hasProperty ? "complete" : hasClient ? "current" : "locked"}
        />
        <StepChip
          step="3"
          title="Basics"
          status={basicsUnlocked ? "Ready" : "Locked"}
          tone={basicsUnlocked ? "current" : "locked"}
        />
        <StepChip
          step="4"
          title="Scope"
          status={scopeReady ? "Ready Next" : "Locked"}
          tone={scopeReady ? "current" : "locked"}
        />
      </section>

      <section
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "minmax(0, 1.15fr) minmax(320px, 0.85fr)",
          alignItems: "start",
        }}
      >
        <section style={crmCardStyle}>
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <h2 style={{ margin: "0 0 6px" }}>Estimate Foundation</h2>
              <div style={crmMutedTextStyle}>
                Lock the client, property, and estimate basics before scope and pricing open up.
              </div>
            </div>

            <FlowSection
              step="1"
              title="Select Client"
              body="Choose the account that owns this estimate and future billing relationship."
              stateLabel={hasClient ? "Complete" : "Required"}
              tone={hasClient ? "complete" : "current"}
            >
              <div style={{ display: "grid", gap: 12 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, opacity: 0.78 }}>Find Client</span>
                </label>

                <div
                  style={{
                    ...crmSubtleCardStyle,
                    padding: 8,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <input
                    value={clientSearch}
                    onChange={(event) => setClientSearch(event.target.value)}
                    placeholder="Search name, phone, or email"
                    style={{
                      ...crmInputStyle,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(8,12,19,0.65)",
                    }}
                  />

                  <div
                    className={scrollbarStyles.scrollbarDark}
                    style={{
                      display: "grid",
                      gap: 6,
                      maxHeight: 220,
                      overflowY: "auto",
                      paddingRight: 4,
                    }}
                  >
                    {!hasClientSearch ? (
                      <div style={{ ...crmMutedTextStyle, padding: "12px 14px", fontSize: 13 }}>
                        Start typing to search CRM clients.
                      </div>
                    ) : filteredClients.length ? (
                      filteredClients.map((client) => {
                        const isSelected = client.id === selectedClientId;

                        return (
                          <button
                            key={client.id}
                            type="button"
                            onClick={() => handleSelectClient(client.id)}
                            style={{
                              appearance: "none",
                              width: "100%",
                              textAlign: "left",
                              display: "grid",
                              gap: 4,
                              padding: "12px 14px",
                              borderRadius: 12,
                              border: isSelected
                                ? "1px solid rgba(116, 168, 255, 0.3)"
                                : "1px solid rgba(255,255,255,0.08)",
                              background: isSelected
                                ? "rgba(20, 43, 80, 0.3)"
                                : "rgba(255,255,255,0.03)",
                              color: "inherit",
                              cursor: "pointer",
                            }}
                          >
                            <div style={{ fontSize: 15, fontWeight: 800 }}>{client.displayName}</div>
                            <div style={{ ...crmMutedTextStyle, fontSize: 13 }}>
                              {CRM_CLIENT_TYPE_LABELS[client.clientType]}
                              {client.primaryPhone ? ` • ${client.primaryPhone}` : ""}
                              {client.primaryEmail ? ` • ${client.primaryEmail}` : ""}
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div style={{ ...crmMutedTextStyle, padding: "12px 14px", fontSize: 13 }}>
                        No clients match the current search.
                      </div>
                    )}
                  </div>
                </div>

                {selectedClient ? (
                  <article style={{ ...crmSubtleCardStyle, display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{selectedClient.displayName}</div>
                    <div style={{ ...crmMutedTextStyle, fontSize: 13 }}>
                      {CRM_CLIENT_TYPE_LABELS[selectedClient.clientType]}
                      {selectedClient.primaryPhone ? ` • ${selectedClient.primaryPhone}` : ""}
                      {selectedClient.primaryEmail ? ` • ${selectedClient.primaryEmail}` : ""}
                    </div>
                  </article>
                ) : null}
              </div>

              <div style={{ ...crmMutedTextStyle, fontSize: 13 }}>
                {hasClientSearch
                  ? `${filteredClientCount} ${filteredClientCount === 1 ? "client matches" : "clients match"} the current search.`
                  : "Search by client name, phone, or email to choose the account."}
              </div>
            </FlowSection>

            <FlowSection
              step="2"
              title="Select Property"
              body="Attach the exact service location so route context, pricing, and future work stay tied to the right place."
              stateLabel={hasProperty ? "Complete" : hasClient ? "Required" : "Locked"}
              tone={hasProperty ? "complete" : hasClient ? "current" : "locked"}
              locked={!hasClient}
            >
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, opacity: 0.78 }}>Property</span>
                <select
                  value={selectedPropertyId}
                  onChange={(event) => {
                    setSelectedPropertyId(event.target.value);
                    setSaveError(null);
                  }}
                  style={fieldStyle(!hasClient)}
                  disabled={!hasClient}
                >
                  <option value="">{hasClient ? "Select a property" : "Choose a client first"}</option>
                  {propertiesForClient.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.propertyName}
                    </option>
                  ))}
                </select>
              </label>

              {hasClient && !propertiesForClient.length ? (
                <article style={{ ...crmSubtleCardStyle, display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>No properties on this client</div>
                  <div style={crmMutedTextStyle}>
                    This client is available, but there is not yet a service property tied to the record.
                  </div>
                </article>
              ) : null}

              {selectedProperty ? (
                <article style={{ ...crmSubtleCardStyle, display: "grid", gap: 10 }}>
                  <div style={{ display: "grid", gap: 4 }}>
                    <div style={{ fontSize: 17, fontWeight: 800 }}>{selectedProperty.propertyName}</div>
                    <div style={crmMutedTextStyle}>{crmPropertyAddress(selectedProperty)}</div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: 10,
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      fontSize: 14,
                    }}
                  >
                    <MetadataItem label="Type" value={CRM_PROPERTY_TYPE_LABELS[selectedProperty.propertyType]} />
                    <MetadataItem label="Route Group" value={selectedProperty.routeGroup || "Not set"} />
                    <MetadataItem
                      label="Acreage"
                      value={selectedProperty.acreage != null ? `${selectedProperty.acreage}` : "Not set"}
                    />
                    <MetadataItem label="Flags" value={accessFlags ?? "None"} />
                  </div>
                </article>
              ) : null}
            </FlowSection>

            <FlowSection
              step="3"
              title="Estimate Basics"
              body="Capture the estimate identity before moving into scope and pricing."
              stateLabel={basicsUnlocked ? "Ready" : "Locked"}
              tone={basicsUnlocked ? "current" : "locked"}
              locked={!basicsUnlocked}
            >
              {basicsUnlocked ? (
                <div style={{ display: "grid", gap: 14 }}>
                  <div
                    style={{
                      display: "grid",
                      gap: 12,
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    }}
                  >
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 13, opacity: 0.78 }}>Estimate Title</span>
                      <input
                        value={estimateTitle}
                        onChange={(event) => setEstimateTitle(event.target.value)}
                        placeholder="Seasonal maintenance proposal"
                        style={crmInputStyle}
                      />
                    </label>

                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 13, opacity: 0.78 }}>Service Line</span>
                      <select
                        value={serviceLine}
                        onChange={(event) =>
                          setServiceLine(event.target.value as EstimateServiceLine)
                        }
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
                      <span style={{ fontSize: 13, opacity: 0.78 }}>Target Start</span>
                      <input
                        type="date"
                        value={targetStart}
                        onChange={(event) => setTargetStart(event.target.value)}
                        style={crmInputStyle}
                      />
                    </label>
                  </div>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 13, opacity: 0.78 }}>Internal Notes</span>
                    <textarea
                      value={internalNotes}
                      onChange={(event) => setInternalNotes(event.target.value)}
                      placeholder="Capture walk-through notes, assumptions, or follow-up items for review."
                      style={{ ...crmTextareaStyle, minHeight: 120 }}
                    />
                  </label>
                </div>
              ) : (
                <div style={crmMutedTextStyle}>
                  Estimate basics unlock once the estimate is tied to a specific client and property.
                </div>
              )}
            </FlowSection>
          </div>
        </section>

        <section style={{ ...crmCardStyle, position: "sticky", top: 16 }}>
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <h2 style={{ margin: "0 0 6px" }}>Progress Panel</h2>
              <div style={crmMutedTextStyle}>
                Complete the foundation in order, then continue into scope and pricing.
              </div>
            </div>

            <ProgressRow
              step="1"
              title="Select a Client"
              description={
                selectedClient
                  ? `${selectedClient.displayName} • ${CRM_CLIENT_TYPE_LABELS[selectedClient.clientType]}`
                  : "Choose a customer to begin this estimate."
              }
              state={selectedClient ? "Complete" : "Incomplete"}
              tone={selectedClient ? "complete" : "current"}
            />

            <ProgressRow
              step="2"
              title="Select a Property"
              description={
                selectedProperty
                  ? `${selectedProperty.propertyName} • ${crmPropertyAddress(selectedProperty)}`
                  : selectedClient
                    ? "Choose the exact property tied to this estimate."
                    : "Locked until a client is selected."
              }
              state={selectedProperty ? "Complete" : selectedClient ? "Incomplete" : "Locked"}
              tone={selectedProperty ? "complete" : selectedClient ? "current" : "locked"}
            />

            <ProgressRow
              step="3"
              title="Define Estimate Basics"
              description={
                basicsUnlocked
                  ? "Title, service line, start date, and notes are ready to be filled in."
                  : "Locked until both client and property are selected."
              }
              state={basicsUnlocked ? "Ready" : "Locked"}
              tone={basicsUnlocked ? "current" : "locked"}
            />

            <ProgressRow
              step="4"
              title="Scope & Pricing"
              description={
                scopeReady
                  ? "Foundation complete. Continue forward when you are ready to build scope."
                  : "Locked until client and property are both selected."
              }
              state={scopeReady ? "Ready Next" : "Locked"}
              tone={scopeReady ? "current" : "locked"}
            />

            <button
              type="button"
              onClick={handleContinue}
              disabled={!scopeReady || isSaving}
              style={{
                ...crmPrimaryButtonStyle,
                width: "100%",
                border: scopeReady && !isSaving
                  ? crmPrimaryButtonStyle.border
                  : "1px solid rgba(255,255,255,0.08)",
                background:
                  scopeReady && !isSaving
                    ? crmPrimaryButtonStyle.background
                    : "rgba(255,255,255,0.04)",
                color: scopeReady && !isSaving ? crmPrimaryButtonStyle.color : "rgba(255,255,255,0.5)",
                cursor: scopeReady && !isSaving ? "pointer" : "not-allowed",
                transition: "background 120ms ease, border-color 120ms ease, color 120ms ease",
              }}
            >
              {isSaving ? "Saving Draft..." : "Continue to Scope & Pricing"}
            </button>

            <article
              style={{
                ...crmSubtleCardStyle,
                border: saveError
                  ? "1px solid rgba(255, 126, 126, 0.22)"
                  : "1px solid rgba(255,255,255,0.08)",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 800 }}>Next Action</div>
              <div style={crmMutedTextStyle}>
                {scopeReady
                  ? "Create the draft header and continue into scope and pricing from the selected client and property."
                  : "Select a client and property first. Scope and pricing stay locked until the foundation is complete."}
              </div>
              {saveError ? (
                <div style={{ color: "#ffd7d7", fontSize: 13 }}>
                  {saveError}
                </div>
              ) : null}
            </article>
          </div>
        </section>
      </section>
    </div>
  );
}

function StepChip({
  step,
  title,
  status,
  tone,
}: {
  step: string;
  title: string;
  status: string;
  tone: "current" | "complete" | "locked";
}) {
  const palette = stepTone(tone);

  return (
    <article
      style={{
        ...crmSubtleCardStyle,
        display: "grid",
        gap: 8,
        padding: 14,
        border: palette.border,
        background: palette.background,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
            fontSize: 13,
            fontWeight: 900,
            border: palette.badgeBorder,
            color: palette.badgeText,
            background: palette.badgeBackground,
          }}
        >
          {step}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>
          <div style={{ ...crmMutedTextStyle, fontSize: 12 }}>{status}</div>
        </div>
      </div>
    </article>
  );
}

function FlowSection({
  step,
  title,
  body,
  stateLabel,
  tone,
  locked = false,
  children,
}: {
  step: string;
  title: string;
  body: string;
  stateLabel: string;
  tone: "current" | "complete" | "locked";
  locked?: boolean;
  children: React.ReactNode;
}) {
  const palette = stepTone(tone);

  return (
    <section
      style={{
        ...crmSubtleCardStyle,
        display: "grid",
        gap: 14,
        padding: 16,
        border: palette.border,
        background: palette.background,
        opacity: locked ? 0.82 : 1,
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
        <div style={{ display: "grid", gap: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                fontSize: 13,
                fontWeight: 900,
                border: palette.badgeBorder,
                color: palette.badgeText,
                background: palette.badgeBackground,
              }}
            >
              {step}
            </div>
            <h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3>
          </div>
          <div style={crmMutedTextStyle}>{body}</div>
        </div>

        <StatusPill label={stateLabel} tone={tone} />
      </div>

      {children}
    </section>
  );
}

function ProgressRow({
  step,
  title,
  description,
  state,
  tone,
}: {
  step: string;
  title: string;
  description: string;
  state: string;
  tone: "current" | "complete" | "locked";
}) {
  const palette = stepTone(tone);

  return (
    <article
      style={{
        ...crmSubtleCardStyle,
        display: "grid",
        gap: 8,
        padding: 14,
        border: palette.border,
        background: palette.background,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "start",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              display: "grid",
              placeItems: "center",
              fontSize: 13,
              fontWeight: 900,
              border: palette.badgeBorder,
              color: palette.badgeText,
              background: palette.badgeBackground,
            }}
          >
            {step}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
        </div>

        <StatusPill label={state} tone={tone} />
      </div>

      <div style={crmMutedTextStyle}>{description}</div>
    </article>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "current" | "complete" | "locked";
}) {
  const palette = stepTone(tone);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 30,
        padding: "6px 10px",
        borderRadius: 999,
        border: palette.badgeBorder,
        color: palette.badgeText,
        background: palette.badgeBackground,
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: 0.2,
      }}
    >
      {label}
    </div>
  );
}

function MetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: 3 }}>
      <div style={{ ...crmMutedTextStyle, fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function fieldStyle(disabled: boolean): React.CSSProperties {
  return disabled
    ? {
        ...crmInputStyle,
        opacity: 0.6,
        cursor: "not-allowed",
      }
    : crmInputStyle;
}

function stepTone(tone: "current" | "complete" | "locked") {
  if (tone === "complete") {
    return {
      border: "1px solid rgba(94, 186, 140, 0.24)",
      background: "rgba(36, 76, 54, 0.22)",
      badgeBorder: "1px solid rgba(94, 186, 140, 0.32)",
      badgeBackground: "rgba(36, 76, 54, 0.35)",
      badgeText: "#d7f4e1",
    };
  }

  if (tone === "current") {
    return {
      border: "1px solid rgba(116, 168, 255, 0.22)",
      background: "rgba(20, 43, 80, 0.22)",
      badgeBorder: "1px solid rgba(116, 168, 255, 0.3)",
      badgeBackground: "rgba(20, 43, 80, 0.36)",
      badgeText: "#d7e7ff",
    };
  }

  return {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    badgeBorder: "1px solid rgba(255,255,255,0.1)",
    badgeBackground: "rgba(255,255,255,0.04)",
    badgeText: "rgba(255,255,255,0.74)",
  };
}
