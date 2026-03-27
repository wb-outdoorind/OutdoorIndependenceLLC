"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  crmCardStyle,
  crmInputStyle,
  crmMutedTextStyle,
  crmPrimaryButtonStyle,
  crmSecondaryButtonStyle,
  crmSubtleCardStyle,
  crmTextareaStyle,
} from "@/components/crm/styles";
import {
  CRM_CLIENT_STATUS_LABELS,
  CRM_CLIENT_TYPE_LABELS,
  CRM_PROPERTY_TYPE_LABELS,
  crmPropertyAddress,
  type CrmClient,
  type CrmProperty,
} from "@/lib/crm";

const SERVICE_LINE_OPTIONS = [
  { value: "maintenance", label: "Maintenance" },
  { value: "fertilizing", label: "Fertilizing" },
  { value: "snow", label: "Snow" },
  { value: "landscape", label: "Landscape" },
] as const;

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
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [estimateTitle, setEstimateTitle] = useState("");
  const [serviceLine, setServiceLine] =
    useState<(typeof SERVICE_LINE_OPTIONS)[number]["value"]>("maintenance");
  const [targetStart, setTargetStart] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  const normalizedSearch = clientSearch.trim().toLowerCase();
  const filteredClients = useMemo(
    () =>
      clients.filter((client) => {
        if (!normalizedSearch) return true;
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

  const resolvedPropertyId = propertiesForClient.some((property) => property.id === selectedPropertyId)
    ? selectedPropertyId
    : "";

  const selectedProperty = useMemo(
    () => properties.find((property) => property.id === resolvedPropertyId) ?? null,
    [properties, resolvedPropertyId]
  );

  const activePropertyCount = properties.filter((property) => property.isActive).length;

  if (crmLoadError) {
    return (
      <section style={crmCardStyle}>
        <div style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0 }}>CRM Data Unavailable</h2>
          <div style={crmMutedTextStyle}>
            The estimate shell could not load live CRM records. Resolve CRM persistence before continuing.
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Link href="/crm/clients" style={crmSecondaryButtonStyle}>
              Open CRM
            </Link>
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
            Add at least one client and property record in CRM before preparing estimates.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Link href="/crm/clients" style={crmPrimaryButtonStyle}>
              Open CRM
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        }}
      >
        <SummaryCard label="Available Clients" value={`${clients.length}`} />
        <SummaryCard label="Available Properties" value={`${properties.length}`} />
        <SummaryCard label="Active Properties" value={`${activePropertyCount}`} />
        <SummaryCard label="Filtered Clients" value={`${filteredClients.length}`} />
      </section>

      <section
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "minmax(0, 1.15fr) minmax(320px, 0.85fr)",
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: 16 }}>
          <section style={crmCardStyle}>
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <h2 style={{ margin: "0 0 6px" }}>Estimate Setup</h2>
                <div style={crmMutedTextStyle}>
                  Start the estimate by choosing the client, tying it to the correct property, and outlining the work package.
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
                      setServiceLine(event.target.value as (typeof SERVICE_LINE_OPTIONS)[number]["value"])
                    }
                    style={crmInputStyle}
                  >
                    {SERVICE_LINE_OPTIONS.map((option) => (
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
            </div>
          </section>

          <section style={crmCardStyle}>
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <h2 style={{ margin: "0 0 6px" }}>Client & Property</h2>
                <div style={crmMutedTextStyle}>
                  This shell now reads live CRM records so the estimate starts from the same shared client and property backbone.
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
                  <span style={{ fontSize: 13, opacity: 0.78 }}>Find Client</span>
                  <input
                    value={clientSearch}
                    onChange={(event) => setClientSearch(event.target.value)}
                    placeholder="Search name, phone, or email"
                    style={crmInputStyle}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, opacity: 0.78 }}>Client</span>
                  <select
                    value={selectedClientId}
                    onChange={(event) => setSelectedClientId(event.target.value)}
                    style={crmInputStyle}
                  >
                    <option value="">Select a client</option>
                    {filteredClients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.displayName}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, opacity: 0.78 }}>Property</span>
                  <select
                    value={resolvedPropertyId}
                    onChange={(event) => setSelectedPropertyId(event.target.value)}
                    style={crmInputStyle}
                    disabled={!selectedClientId}
                  >
                    <option value="">{selectedClientId ? "Select a property" : "Choose a client first"}</option>
                    {propertiesForClient.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.propertyName}
                      </option>
                    ))}
                  </select>
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
          </section>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <section style={crmCardStyle}>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <h2 style={{ margin: "0 0 6px" }}>Selected Account</h2>
                <div style={crmMutedTextStyle}>
                  Confirm the client and property before pricing and scope are built out.
                </div>
              </div>

              {selectedClient ? (
                <article style={crmSubtleCardStyle}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{selectedClient.displayName}</div>
                  <div style={{ marginTop: 8, ...crmMutedTextStyle }}>
                    {CRM_CLIENT_TYPE_LABELS[selectedClient.clientType]} •{" "}
                    {CRM_CLIENT_STATUS_LABELS[selectedClient.status]}
                  </div>
                  <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 14 }}>
                    <div><strong>Primary Phone:</strong> {selectedClient.primaryPhone || "Not set"}</div>
                    <div><strong>Primary Email:</strong> {selectedClient.primaryEmail || "Not set"}</div>
                    <div><strong>Properties:</strong> {propertiesForClient.length}</div>
                  </div>
                </article>
              ) : (
                <EmptyPanel title="No client selected" body="Choose a CRM client to start the estimate." />
              )}

              {selectedProperty ? (
                <article style={crmSubtleCardStyle}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{selectedProperty.propertyName}</div>
                  <div style={{ marginTop: 8, ...crmMutedTextStyle }}>
                    {crmPropertyAddress(selectedProperty)}
                  </div>
                  <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 14 }}>
                    <div><strong>Type:</strong> {CRM_PROPERTY_TYPE_LABELS[selectedProperty.propertyType]}</div>
                    <div><strong>Route Group:</strong> {selectedProperty.routeGroup || "Not set"}</div>
                    <div><strong>Lawn Size:</strong> {selectedProperty.lawnSizeSqft?.toLocaleString() ?? "Not set"} sqft</div>
                    <div><strong>Acreage:</strong> {selectedProperty.acreage ?? "Not set"}</div>
                    <div>
                      <strong>Access Flags:</strong>{" "}
                      {[
                        selectedProperty.gatePresent ? "Gate" : null,
                        selectedProperty.lockedGate ? "Locked Gate" : null,
                        selectedProperty.petsPresent ? "Pets" : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "None"}
                    </div>
                    <div>
                      <strong>Service Templates:</strong>{" "}
                      {selectedProperty.serviceTemplates.length
                        ? selectedProperty.serviceTemplates.join(", ")
                        : "Not set"}
                    </div>
                  </div>
                </article>
              ) : (
                <EmptyPanel
                  title="No property selected"
                  body="Choose the exact service property so the estimate is tied to the right location."
                />
              )}
            </div>
          </section>

          <section style={crmCardStyle}>
            <div style={{ display: "grid", gap: 10 }}>
              <h2 style={{ margin: 0 }}>Next Slice</h2>
              <div style={crmMutedTextStyle}>
                The next step after review is wiring these selections into a real draft header so the estimate shell can begin carrying structured estimate data.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <Link href="/crm/clients" style={crmSecondaryButtonStyle}>
                  Open CRM
                </Link>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article style={crmCardStyle}>
      <div style={{ ...crmMutedTextStyle, fontSize: 13 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900 }}>{value}</div>
    </article>
  );
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <article style={{ ...crmSubtleCardStyle, display: "grid", gap: 8 }}>
      <div style={{ fontSize: 17, fontWeight: 800 }}>{title}</div>
      <div style={crmMutedTextStyle}>{body}</div>
    </article>
  );
}
