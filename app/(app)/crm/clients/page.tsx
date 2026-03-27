"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ClientEditorDialog from "@/components/crm/ClientEditorDialog";
import CrmShell from "@/components/crm/CrmShell";
import { useCrmMockData } from "@/components/crm/CrmMockDataProvider";
import {
  crmCardStyle,
  crmDangerButtonStyle,
  crmInputStyle,
  crmMutedTextStyle,
  crmPrimaryButtonStyle,
  crmSecondaryButtonStyle,
  crmSubtleCardStyle,
} from "@/components/crm/styles";
import {
  CRM_CLIENT_STATUS_LABELS,
  CRM_CLIENT_TYPE_LABELS,
  crmPropertyAddress,
  type CrmClient,
  type CrmProperty,
} from "@/lib/crm";

const activeFilterInputStyle: React.CSSProperties = {
  ...crmInputStyle,
  border: "1px solid rgba(116, 168, 255, 0.38)",
  background: "rgba(33, 74, 141, 0.2)",
  boxShadow: "inset 0 0 0 1px rgba(116, 168, 255, 0.1)",
};

const searchInputStyle: React.CSSProperties = {
  ...crmInputStyle,
  border: "1px solid rgba(116, 168, 255, 0.18)",
  background: "rgba(12, 18, 30, 0.92)",
};

const activeSearchInputStyle: React.CSSProperties = {
  ...activeFilterInputStyle,
  border: "1px solid rgba(116, 168, 255, 0.42)",
  background: "rgba(33, 74, 141, 0.22)",
  boxShadow: "0 0 0 1px rgba(116, 168, 255, 0.08), inset 0 0 0 1px rgba(116, 168, 255, 0.08)",
};

export default function CrmClientsPage() {
  const router = useRouter();
  const { clients, propertiesForClient, saveClient, deleteClient } = useCrmMockData();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<CrmClient | null>(null);
  const [expandedClientIds, setExpandedClientIds] = useState<Record<string, boolean>>({});
  const [pendingDeleteClientId, setPendingDeleteClientId] = useState<string | null>(null);
  const [hoveredClientId, setHoveredClientId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "municipal" | "hoa" | "commercial">("all");

  const sortedClients = clients.slice().sort((left, right) => left.displayName.localeCompare(right.displayName));
  const normalizedSearchQuery = debouncedSearchQuery.trim().toLowerCase();
  const filteredClients = sortedClients.filter((client) => {
    const matchesSearch =
      normalizedSearchQuery.length === 0 ||
      [
        client.displayName,
        client.primaryPhone,
        client.secondaryPhone,
        client.primaryEmail,
        client.billingEmail,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedSearchQuery));

    const matchesStatus =
      statusFilter === "all"
        ? true
        : statusFilter === "active"
          ? client.status === "active"
          : client.status === "inactive" || client.status === "archived";

    const matchesType = typeFilter === "all" ? true : client.clientType === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });
  const hasActiveFilters =
    searchQuery.trim().length > 0 || statusFilter !== "all" || typeFilter !== "all";
  const filteredSummary = {
    totalClients: filteredClients.length,
    totalProperties: filteredClients.reduce((total, client) => total + propertiesForClient(client.id).length, 0),
    activeClients: filteredClients.filter((client) => client.status === "active").length,
    inactiveClients: filteredClients.filter((client) => client.status === "inactive" || client.status === "archived").length,
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  function handleDelete(client: CrmClient) {
    deleteClient(client.id);
    setPendingDeleteClientId((current) => (current === client.id ? null : current));
  }

  function toggleExpanded(clientId: string) {
    setExpandedClientIds((current) => ({ ...current, [clientId]: !current[clientId] }));
  }

  function openClientDetail(clientId: string) {
    router.push(`/crm/clients/${encodeURIComponent(clientId)}`);
  }

  function clearFilters() {
    setSearchQuery("");
    setDebouncedSearchQuery("");
    setStatusFilter("all");
    setTypeFilter("all");
  }

  return (
    <CrmShell
      title="Clients & Properties"
      description="Shared client records and service properties for daily operations."
      backHref="/"
      backLabel="Back Home"
      actions={
        <button
          type="button"
          style={crmPrimaryButtonStyle}
          onClick={() => {
            setEditingClient(null);
            setEditorOpen(true);
          }}
        >
          + Add Client
        </button>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        <section
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          }}
        >
          <SummaryCard label="Total Clients" value={`${filteredSummary.totalClients}`} />
          <SummaryCard label="Total Properties" value={`${filteredSummary.totalProperties}`} />
          <SummaryCard label="Active Clients" value={`${filteredSummary.activeClients}`} />
          <SummaryCard label="Inactive / Archived" value={`${filteredSummary.inactiveClients}`} />
        </section>

        <section style={crmCardStyle}>
          <div>
            <div>
              <h2 style={{ margin: "0 0 6px" }}>Client Records</h2>
              <div style={crmMutedTextStyle}>
                Each client record keeps the account, contact details, and service properties together.
              </div>
              <div style={{ marginTop: 8, ...crmMutedTextStyle, fontSize: 13, fontWeight: 700 }}>
                Showing {filteredClients.length} of {sortedClients.length} clients
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "end",
            }}
          >
            {hasActiveFilters ? (
              <div
                style={{
                  flexBasis: "100%",
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: 0.35,
                  color: "#cfe3ff",
                  opacity: 0.78,
                }}
              >
                Filters active
              </div>
            ) : null}

            <label style={{ display: "grid", gap: 6, fontSize: 13, flex: "1.8 1 360px" }}>
              <span style={{ opacity: 0.76 }}>Search</span>
              <input
                type="search"
                value={searchQuery}
                placeholder="Search name, phone, or email"
                style={searchQuery.trim() ? activeSearchInputStyle : searchInputStyle}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>

            <label style={{ display: "grid", gap: 6, fontSize: 13, flex: "0.8 1 160px" }}>
              <span style={{ opacity: 0.76 }}>Status</span>
              <select
                value={statusFilter}
                style={statusFilter !== "all" ? activeFilterInputStyle : crmInputStyle}
                onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 6, fontSize: 13, flex: "0.8 1 160px" }}>
              <span style={{ opacity: 0.76 }}>Client Type</span>
              <select
                value={typeFilter}
                style={typeFilter !== "all" ? activeFilterInputStyle : crmInputStyle}
                onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}
              >
                <option value="all">All</option>
                <option value="municipal">Municipal</option>
                <option value="hoa">HOA</option>
                <option value="commercial">Commercial</option>
              </select>
            </label>

            {hasActiveFilters ? (
              <div style={{ display: "flex", justifyContent: "flex-end", flex: "0 0 auto" }}>
                <button type="button" style={crmSecondaryButtonStyle} onClick={clearFilters}>
                  Clear Filters
                </button>
              </div>
            ) : null}
          </div>

          <div
            style={{
              marginTop: 16,
              paddingTop: 16,
              borderTop: "1px solid rgba(255,255,255,0.06)",
              display: "grid",
              gap: 12,
            }}
          >
            {filteredClients.length === 0 ? (
              <div
                style={{
                  ...crmSubtleCardStyle,
                  display: "grid",
                  gap: 10,
                  placeItems: "center",
                  textAlign: "center",
                  padding: "34px 20px",
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 800 }}>No clients match your search or filters.</div>
                <div style={{ ...crmMutedTextStyle, maxWidth: 420 }}>
                  Adjust the search or filters to widen the list.
                </div>
                {hasActiveFilters ? (
                  <button type="button" style={crmSecondaryButtonStyle} onClick={clearFilters}>
                    Clear Filters
                  </button>
                ) : null}
              </div>
            ) : (
              filteredClients.map((client) => {
              const clientProperties = propertiesForClient(client.id);
              const propertyCount = clientProperties.length;
              const isExpanded = expandedClientIds[client.id] ?? false;
              const isDeletePending = pendingDeleteClientId === client.id;
              const isHovered = hoveredClientId === client.id;
              return (
                <article
                  key={client.id}
                  style={{
                    ...crmSubtleCardStyle,
                    display: "grid",
                    gap: 12,
                    cursor: "pointer",
                    border: isDeletePending
                      ? "1px solid rgba(255, 126, 126, 0.22)"
                      : isHovered
                        ? "1px solid rgba(116, 168, 255, 0.24)"
                        : crmSubtleCardStyle.border,
                    background: isDeletePending
                      ? "rgba(126, 29, 29, 0.12)"
                      : isHovered
                        ? "rgba(255,255,255,0.05)"
                        : crmSubtleCardStyle.background,
                    boxShadow: isHovered ? "0 10px 20px rgba(0,0,0,0.16)" : "none",
                    transform: isHovered ? "translateY(-1px)" : "translateY(0)",
                    transition: "background 120ms ease, border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease",
                  }}
                  role="link"
                  tabIndex={0}
                  onMouseEnter={() => setHoveredClientId(client.id)}
                  onMouseLeave={() => setHoveredClientId((current) => (current === client.id ? null : current))}
                  onFocus={() => setHoveredClientId(client.id)}
                  onBlur={() => setHoveredClientId((current) => (current === client.id ? null : current))}
                  onClick={() => openClientDetail(client.id)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key !== "Enter") return;
                    openClientDetail(client.id);
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 520px", minWidth: 0 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                        <div style={{ fontWeight: 900, fontSize: 18 }}>{client.displayName}</div>
                      </div>

                      <div style={{ marginTop: 6, ...crmMutedTextStyle, fontSize: 14 }}>
                        {[client.primaryPhone, client.primaryEmail].filter(Boolean).join(" • ") || "No primary contact yet"}
                      </div>

                      <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 12 }}>
                        <MetaBadge
                          label="Status"
                          value={<StatusBadge label={CRM_CLIENT_STATUS_LABELS[client.status]} status={client.status} />}
                        />
                        <MetaBadge label="Type" value={<TypeBadge label={CRM_CLIENT_TYPE_LABELS[client.clientType]} />} />
                        <MetaBadge
                          label="Properties"
                          value={
                            <span style={{ fontSize: 13, fontWeight: 800, color: "#f5f7fb" }}>
                              {propertyCount} {propertyCount === 1 ? "property" : "properties"}
                            </span>
                          }
                        />
                      </div>

                      <div
                        style={{
                          marginTop: 14,
                          padding: "10px 12px",
                          borderRadius: 14,
                          border: "1px solid rgba(255,255,255,0.05)",
                          background: "rgba(6,10,18,0.28)",
                          display: "grid",
                          gap: 8,
                        }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {propertyCount > 0 ? (
                          <>
                            <PropertyPreviewItem property={clientProperties[0]} />
                            {isExpanded ? (
                              clientProperties.slice(1).map((property) => (
                                <PropertyPreviewItem key={property.id} property={property} />
                              ))
                            ) : propertyCount > 1 ? (
                              <div style={{ ...crmMutedTextStyle, fontSize: 13 }}>
                                +{propertyCount - 1} more {propertyCount - 1 === 1 ? "property" : "properties"}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <div style={{ ...crmMutedTextStyle, fontSize: 13 }}>No properties added yet.</div>
                        )}

                        {propertyCount > 1 ? (
                          <div>
                            <button
                              type="button"
                              style={crmSecondaryButtonStyle}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleExpanded(client.id);
                              }}
                            >
                              {isExpanded ? "Hide Properties" : "Preview Properties"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        alignItems: "flex-start",
                        justifyContent: "flex-end",
                        alignContent: "flex-start",
                        minWidth: 196,
                      }}
                    >
                      {isDeletePending ? (
                        <div
                          style={{
                            flexBasis: "100%",
                            fontSize: 12,
                            lineHeight: 1.45,
                            color: "#ffd0d0",
                          }}
                        >
                          Are you sure you want to delete this client?
                        </div>
                      ) : null}

                      <Link
                        href={`/crm/clients/${encodeURIComponent(client.id)}`}
                        style={crmPrimaryButtonStyle}
                        onClick={(event) => event.stopPropagation()}
                      >
                        Open
                      </Link>

                      <button
                        type="button"
                        style={crmSecondaryButtonStyle}
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingClient(client);
                          setEditorOpen(true);
                        }}
                      >
                        Edit
                      </button>

                      {isDeletePending ? (
                        <>
                          <button
                            type="button"
                            style={crmDangerButtonStyle}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDelete(client);
                            }}
                          >
                            Confirm Delete
                          </button>
                          <button
                            type="button"
                            style={crmSecondaryButtonStyle}
                            onClick={(event) => {
                              event.stopPropagation();
                              setPendingDeleteClientId(null);
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          style={crmDangerButtonStyle}
                          onClick={(event) => {
                            event.stopPropagation();
                            setPendingDeleteClientId(client.id);
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
              })
            )}
          </div>
        </section>
      </div>

      {editorOpen ? (
        <ClientEditorDialog
          client={editingClient}
          onClose={() => {
            setEditorOpen(false);
            setEditingClient(null);
          }}
          onSave={(values) => {
            saveClient(values, editingClient?.id);
            setEditorOpen(false);
            setEditingClient(null);
          }}
        />
      ) : null}
    </CrmShell>
  );
}

function MetaBadge({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.35, opacity: 0.62 }}>{label}</span>
      {value}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={crmCardStyle}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.35, opacity: 0.66 }}>{label}</div>
      <div style={{ marginTop: 10, fontSize: 28, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function PropertyPreviewItem({ property }: { property: CrmProperty }) {
  return (
    <Link
      href={`/crm/properties/${encodeURIComponent(property.id)}`}
      style={{
        display: "grid",
        gap: 2,
        color: "inherit",
        textDecoration: "none",
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <span style={{ fontSize: 13, fontWeight: 700 }}>{property.propertyName}</span>
      <span style={{ ...crmMutedTextStyle, fontSize: 12 }}>{crmPropertyAddress(property)}</span>
    </Link>
  );
}

function StatusBadge({ label, status }: { label: string; status: CrmClient["status"] }) {
  const styleMap: Record<CrmClient["status"], React.CSSProperties> = {
    lead: {
      background: "rgba(33, 74, 141, 0.24)",
      border: "1px solid rgba(116, 168, 255, 0.26)",
      color: "#cde1ff",
    },
    active: {
      background: "rgba(53, 156, 84, 0.18)",
      border: "1px solid rgba(126,255,167,0.24)",
      color: "#c8ffd9",
    },
    inactive: {
      background: "rgba(114, 65, 16, 0.24)",
      border: "1px solid rgba(255, 171, 94, 0.22)",
      color: "#ffd6a7",
    },
    archived: {
      background: "rgba(126, 29, 29, 0.24)",
      border: "1px solid rgba(255, 126, 126, 0.24)",
      color: "#ffd0d0",
    },
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 28,
        padding: "5px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        ...styleMap[status],
      }}
    >
      {label}
    </span>
  );
}

function TypeBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 28,
        padding: "5px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        border: "1px solid var(--surface-border)",
        background: "rgba(255,255,255,0.05)",
      }}
    >
      {label}
    </span>
  );
}
