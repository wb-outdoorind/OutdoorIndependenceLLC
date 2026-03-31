"use client";

import { useMemo, useState } from "react";
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
import {
  CRM_CLIENT_TYPE_LABELS,
  CRM_PROPERTY_TYPE_LABELS,
  crmPropertyAddress,
  type CrmClient,
  type CrmProperty,
} from "@/lib/crm";
import {
  ESTIMATE_DRAFT_STAGE_LABELS,
  ESTIMATE_SERVICE_LINE_LABELS,
  type EstimateDraft,
  type EstimateServiceLine,
  type EstimateVisitIntent,
} from "@/lib/estimatePersistence";

type EstimateScopeWorkspaceProps = {
  draft: EstimateDraft;
  client: CrmClient | null;
  property: CrmProperty | null;
};

const VISIT_INTENT_OPTIONS = [
  { value: "recurring", label: "Recurring Visits" },
  { value: "seasonal", label: "Seasonal Package" },
  { value: "event_based", label: "Event-Based" },
  { value: "one_time", label: "One-Time Scope" },
] as const;

const SERVICE_SCOPE_FIELDS: Record<
  EstimateServiceLine,
  {
    title: string;
    body: string;
    fields: Array<{ id: string; label: string; placeholder: string }>;
  }
> = {
  maintenance: {
    title: "Maintenance Scope",
    body: "Outline the recurring work package, service cadence, and field expectations for this property.",
    fields: [
      {
        id: "turf_program",
        label: "Turf & Grounds Tasks",
        placeholder: "Mowing cadence, trimming, blowing, edging, and any turf care expectations.",
      },
      {
        id: "bed_detail",
        label: "Beds & Detail Work",
        placeholder: "Mulch touch-up, bed maintenance, pruning notes, and seasonal detail expectations.",
      },
    ],
  },
  fertilizing: {
    title: "Fertilizing Scope",
    body: "Define the program structure, treatment expectations, and service sequencing for the site.",
    fields: [
      {
        id: "application_plan",
        label: "Application Plan",
        placeholder: "Treatment count, seasonal timing, and product-program expectations.",
      },
      {
        id: "site_restrictions",
        label: "Restrictions & Sensitive Areas",
        placeholder: "Raised beds, pet areas, irrigation concerns, or customer restrictions.",
      },
    ],
  },
  snow: {
    title: "Snow Scope",
    body: "Capture event triggers, snow priorities, and service expectations before pricing is added.",
    fields: [
      {
        id: "trigger_depth",
        label: "Trigger & Event Rules",
        placeholder: "Trigger depth, salt/de-ice expectations, and response window requirements.",
      },
      {
        id: "priority_areas",
        label: "Priority Areas",
        placeholder: "High-visibility entrances, accessible routes, loading zones, or emergency access needs.",
      },
    ],
  },
  landscape: {
    title: "Landscape Scope",
    body: "Define the install or enhancement package, phases, and onsite production expectations.",
    fields: [
      {
        id: "install_scope",
        label: "Install Scope",
        placeholder: "Planting, grading, hardscape, drainage, or enhancement items to include.",
      },
      {
        id: "phasing",
        label: "Phasing & Dependencies",
        placeholder: "Material timing, subcontractor dependencies, or sequencing constraints.",
      },
    ],
  },
};

function defaultVisitIntent(serviceLine: EstimateServiceLine) {
  if (serviceLine === "snow") return "event_based";
  if (serviceLine === "landscape") return "one_time";
  return "recurring";
}

function defaultPackageName(draft: EstimateDraft) {
  return `${ESTIMATE_SERVICE_LINE_LABELS[draft.serviceLine]} Package`;
}

function normalizedScopeDetails(value: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [key, entry.trim()])
      .filter(([, entry]) => entry.length > 0)
  );
}

export default function EstimateScopeWorkspace({
  draft,
  client,
  property,
}: EstimateScopeWorkspaceProps) {
  const router = useRouter();
  const [packageName, setPackageName] = useState(draft.packageName ?? defaultPackageName(draft));
  const [visitIntent, setVisitIntent] = useState<EstimateVisitIntent>(
    draft.visitIntent ?? defaultVisitIntent(draft.serviceLine)
  );
  const [scopeSummary, setScopeSummary] = useState(draft.scopeSummary ?? "");
  const [operationsNotes, setOperationsNotes] = useState(draft.operationsNotes ?? "");
  const [serviceDetails, setServiceDetails] = useState<Record<string, string>>(draft.scopeDetails ?? {});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState(draft.updatedAt);
  const [laborAllowance, setLaborAllowance] = useState("");
  const [materialAllowance, setMaterialAllowance] = useState("");
  const [visitCount, setVisitCount] = useState("");
  const [contractSpan, setContractSpan] = useState("");
  const [pricingAssumptions, setPricingAssumptions] = useState("");

  const scopeConfig = SERVICE_SCOPE_FIELDS[draft.serviceLine];
  const accessFlags = property
    ? [
        property.gatePresent ? "Gate" : null,
        property.lockedGate ? "Locked Gate" : null,
        property.petsPresent ? "Pets" : null,
      ]
        .filter(Boolean)
        .join(", ") || "None"
    : "Not set";

  const packageReady = packageName.trim().length > 0;
  const summaryReady = scopeSummary.trim().length > 0;
  const scopeReady = packageReady && summaryReady;
  const normalizedDetails = normalizedScopeDetails(serviceDetails);
  const laborAllowanceValue = Number.parseFloat(laborAllowance);
  const materialAllowanceValue = Number.parseFloat(materialAllowance);
  const hasLaborAllowance = Number.isFinite(laborAllowanceValue) && laborAllowanceValue >= 0;
  const hasMaterialAllowance = Number.isFinite(materialAllowanceValue) && materialAllowanceValue >= 0;
  const hasVisitCount = Number.parseInt(visitCount, 10) > 0;
  const hasContractSpan = contractSpan.trim().length > 0;
  const hasPricingAssumptions = pricingAssumptions.trim().length > 0;
  const pricingStarted =
    laborAllowance.trim().length > 0 ||
    materialAllowance.trim().length > 0 ||
    visitCount.trim().length > 0 ||
    contractSpan.trim().length > 0 ||
    pricingAssumptions.trim().length > 0;
  const pricingReady =
    scopeReady && hasLaborAllowance && hasMaterialAllowance && hasVisitCount && hasContractSpan;
  const pricingSubtotal =
    (hasLaborAllowance ? laborAllowanceValue : 0) + (hasMaterialAllowance ? materialAllowanceValue : 0);

  const savedSnapshot = useMemo(
    () => ({
      packageName: draft.packageName ?? defaultPackageName(draft),
      visitIntent: draft.visitIntent ?? defaultVisitIntent(draft.serviceLine),
      scopeSummary: draft.scopeSummary ?? "",
      operationsNotes: draft.operationsNotes ?? "",
      scopeDetails: normalizedScopeDetails(draft.scopeDetails ?? {}),
    }),
    [draft]
  );

  const isDirty =
    packageName.trim() !== savedSnapshot.packageName.trim() ||
    visitIntent !== savedSnapshot.visitIntent ||
    scopeSummary.trim() !== savedSnapshot.scopeSummary.trim() ||
    operationsNotes.trim() !== savedSnapshot.operationsNotes.trim() ||
    JSON.stringify(normalizedDetails) !== JSON.stringify(savedSnapshot.scopeDetails);

  async function handleSaveScopeDraft() {
    if (saveState === "saving") return;

    setSaveState("saving");
    setSaveMessage(null);

    try {
      const response = await fetch(`/api/estimates/${draft.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          packageName,
          visitIntent,
          scopeSummary,
          scopeDetails: normalizedDetails,
          operationsNotes,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; draft?: { updatedAt?: string } }
        | null;

      if (!response.ok) {
        setSaveState("error");
        setSaveMessage(payload?.error ?? "Unable to save the scope draft.");
        return;
      }

      setSaveState("saved");
      setSaveMessage("Scope draft saved.");
      setLastSavedAt(payload?.draft?.updatedAt ?? new Date().toISOString());
      router.refresh();
    } catch (error) {
      setSaveState("error");
      setSaveMessage(error instanceof Error ? error.message : "Unable to save the scope draft.");
    }
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
        <WorkflowCard step="1" title="Client" state="Complete" tone="complete" />
        <WorkflowCard step="2" title="Property" state="Complete" tone="complete" />
        <WorkflowCard step="3" title="Basics" state="Saved" tone="complete" />
        <WorkflowCard step="4" title="Scope & Pricing" state="Current" tone="current" />
      </section>

      <section
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "minmax(0, 1.08fr) minmax(320px, 0.92fr)",
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: 16 }}>
          <section style={crmCardStyle}>
            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <h2 style={{ margin: "0 0 6px" }}>Estimate Foundation</h2>
                <div style={crmMutedTextStyle}>
                  This draft is anchored to the right client, property, and estimate header before scope is outlined.
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                }}
              >
                <DetailCard
                  label="Client"
                  title={client?.displayName ?? "Client unavailable"}
                  body={client ? CRM_CLIENT_TYPE_LABELS[client.clientType] : "CRM client could not be loaded."}
                />
                <DetailCard
                  label="Property"
                  title={property?.propertyName ?? "Property unavailable"}
                  body={property ? crmPropertyAddress(property) : "CRM property could not be loaded."}
                />
                <DetailCard
                  label="Service Line"
                  title={ESTIMATE_SERVICE_LINE_LABELS[draft.serviceLine]}
                  body="Estimate workflow track"
                />
                <DetailCard
                  label="Target Start"
                  title={draft.targetStart ?? "Not set"}
                  body="Requested service start"
                />
              </div>

              <article style={crmSubtleCardStyle}>
                <div style={{ ...crmMutedTextStyle, fontSize: 13 }}>Foundation Notes</div>
                <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                  {draft.internalNotes || "No foundation notes captured yet."}
                </div>
              </article>
            </div>
          </section>

          <section style={crmCardStyle}>
            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <h2 style={{ margin: "0 0 6px" }}>Scope Builder</h2>
                <div style={crmMutedTextStyle}>
                  Build the service package, visit intent, and field expectations before pricing is layered in.
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
                  <span style={{ fontSize: 13, opacity: 0.78 }}>Service Package Name</span>
                  <input
                    value={packageName}
                    onChange={(event) => {
                      setPackageName(event.target.value);
                      if (saveState !== "idle") {
                        setSaveState("idle");
                        setSaveMessage(null);
                      }
                    }}
                    placeholder="Seasonal grounds package"
                    style={crmInputStyle}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, opacity: 0.78 }}>Visit Intent</span>
                  <select
                    value={visitIntent}
                    onChange={(event) => {
                      setVisitIntent(event.target.value as EstimateVisitIntent);
                      if (saveState !== "idle") {
                        setSaveState("idle");
                        setSaveMessage(null);
                      }
                    }}
                    style={crmInputStyle}
                  >
                    {VISIT_INTENT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, opacity: 0.78 }}>Scope Summary</span>
                <textarea
                  value={scopeSummary}
                  onChange={(event) => {
                    setScopeSummary(event.target.value);
                    if (saveState !== "idle") {
                      setSaveState("idle");
                      setSaveMessage(null);
                    }
                  }}
                  placeholder="Summarize the service package, deliverables, and what the field team is committing to perform."
                  style={{ ...crmTextareaStyle, minHeight: 148 }}
                />
              </label>

              <article style={crmSubtleCardStyle}>
                <div style={{ display: "grid", gap: 12 }}>
                  <div>
                    <h3 style={{ margin: "0 0 6px" }}>{scopeConfig.title}</h3>
                    <div style={crmMutedTextStyle}>{scopeConfig.body}</div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: 12,
                      gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    }}
                  >
                    {scopeConfig.fields.map((field) => (
                      <label key={field.id} style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 13, opacity: 0.78 }}>{field.label}</span>
                        <textarea
                          value={serviceDetails[field.id] ?? ""}
                          onChange={(event) =>
                            setServiceDetails((current) => {
                              if (saveState !== "idle") {
                                setSaveState("idle");
                                setSaveMessage(null);
                              }

                              return {
                                ...current,
                                [field.id]: event.target.value,
                              };
                            })
                          }
                          placeholder={field.placeholder}
                          style={{ ...crmTextareaStyle, minHeight: 132 }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </article>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, opacity: 0.78 }}>Operational Handoff Notes</span>
                <textarea
                  value={operationsNotes}
                  onChange={(event) => {
                    setOperationsNotes(event.target.value);
                    if (saveState !== "idle") {
                      setSaveState("idle");
                      setSaveMessage(null);
                    }
                  }}
                  placeholder="Crew notes, sequencing concerns, production assumptions, or approval follow-up items."
                  style={{ ...crmTextareaStyle, minHeight: 132 }}
                />
              </label>
            </div>
          </section>

          <section style={crmCardStyle}>
            <div style={{ display: "grid", gap: 16, opacity: scopeReady ? 1 : 0.72 }}>
              <div>
                <h2 style={{ margin: "0 0 6px" }}>Pricing Builder</h2>
                <div style={crmMutedTextStyle}>
                  Shape the allowance layer and review assumptions before the full pricing engine is added.
                  {!scopeReady ? " Complete the scope package and summary first to unlock pricing." : ""}
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
                  <span style={{ fontSize: 13, opacity: 0.78 }}>Labor Allowance</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={laborAllowance}
                    onChange={(event) => setLaborAllowance(event.target.value)}
                    placeholder="0.00"
                    disabled={!scopeReady}
                    style={crmInputStyle}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, opacity: 0.78 }}>Material Allowance</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={materialAllowance}
                    onChange={(event) => setMaterialAllowance(event.target.value)}
                    placeholder="0.00"
                    disabled={!scopeReady}
                    style={crmInputStyle}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, opacity: 0.78 }}>Visit Count</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={visitCount}
                    onChange={(event) => setVisitCount(event.target.value)}
                    placeholder="12"
                    disabled={!scopeReady}
                    style={crmInputStyle}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, opacity: 0.78 }}>Contract Term / Span</span>
                  <select
                    value={contractSpan}
                    onChange={(event) => setContractSpan(event.target.value)}
                    disabled={!scopeReady}
                    style={crmInputStyle}
                  >
                    <option value="">Select a term</option>
                    <option value="one_time">One-Time</option>
                    <option value="monthly">Monthly</option>
                    <option value="seasonal">Seasonal</option>
                    <option value="annual">Annual</option>
                    <option value="per_event">Per Event</option>
                  </select>
                </label>
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, opacity: 0.78 }}>Pricing Assumptions & Exclusions</span>
                <textarea
                  value={pricingAssumptions}
                  onChange={(event) => setPricingAssumptions(event.target.value)}
                  placeholder="Capture assumptions, exclusions, weather triggers, material carry allowances, or approval dependencies."
                  disabled={!scopeReady}
                  style={{ ...crmTextareaStyle, minHeight: 132 }}
                />
              </label>
            </div>
          </section>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <section style={crmCardStyle}>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <h2 style={{ margin: "0 0 6px" }}>Scope Progress</h2>
                <div style={crmMutedTextStyle}>
                  The scope layer is now the working stage for this estimate.
                </div>
              </div>

              <article style={crmSubtleCardStyle}>
                <div style={{ display: "grid", gap: 10 }}>
                  <ProgressLine label="Client Linked" value="Complete" />
                  <ProgressLine label="Property Linked" value="Complete" />
                  <ProgressLine label="Estimate Header Saved" value="Complete" />
                  <ProgressLine label="Package Defined" value={packageReady ? "Yes" : "Not yet"} />
                  <ProgressLine label="Scope Summary Added" value={summaryReady ? "Yes" : "Not yet"} />
                  <ProgressLine label="Draft Saved" value={isDirty ? "Not yet" : "Current"} />
                  <ProgressLine label="Pricing Layer" value={pricingStarted ? "In progress" : scopeReady ? "Ready next" : "Locked"} />
                  <ProgressLine label="Review Gate" value={pricingReady ? "Ready next" : "Locked"} />
                </div>
              </article>

              <button
                type="button"
                onClick={handleSaveScopeDraft}
                disabled={saveState === "saving" || !isDirty}
                style={{
                  ...crmPrimaryButtonStyle,
                  width: "100%",
                  border:
                    saveState === "saving" || !isDirty
                      ? "1px solid rgba(255,255,255,0.08)"
                      : crmPrimaryButtonStyle.border,
                  background:
                    saveState === "saving" || !isDirty
                      ? "rgba(255,255,255,0.04)"
                      : crmPrimaryButtonStyle.background,
                  color:
                    saveState === "saving" || !isDirty
                      ? "rgba(255,255,255,0.5)"
                      : crmPrimaryButtonStyle.color,
                  cursor: saveState === "saving" || !isDirty ? "not-allowed" : "pointer",
                }}
              >
                {saveState === "saving" ? "Saving Scope Draft..." : "Save Scope Draft"}
              </button>

              <article style={crmSubtleCardStyle}>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>Save Status</div>
                  <div style={crmMutedTextStyle}>
                    {saveState === "saved"
                      ? `Saved. Last updated ${new Date(lastSavedAt).toLocaleString()}.`
                      : saveState === "saving"
                        ? "Saving scope draft..."
                        : isDirty
                          ? "Unsaved changes ready to save."
                          : "No new changes to save."}
                  </div>
                  {saveMessage ? (
                    <div style={{ color: saveState === "error" ? "#ffd7d7" : "#d7f4e1", fontSize: 13 }}>
                      {saveMessage}
                    </div>
                  ) : null}
                </div>
              </article>
            </div>
          </section>

          <section style={crmCardStyle}>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <h2 style={{ margin: "0 0 6px" }}>Pricing Snapshot</h2>
                <div style={crmMutedTextStyle}>
                  Use the shell inputs to rough in the estimate economics before a full pricing engine exists.
                </div>
              </div>

              <article style={crmSubtleCardStyle}>
                <div style={{ display: "grid", gap: 10 }}>
                  <ProgressLine label="Labor" value={hasLaborAllowance ? formatCurrency(laborAllowanceValue) : "Pending"} />
                  <ProgressLine
                    label="Materials"
                    value={hasMaterialAllowance ? formatCurrency(materialAllowanceValue) : "Pending"}
                  />
                  <ProgressLine label="Visits" value={hasVisitCount ? visitCount : "Pending"} />
                  <ProgressLine label="Term" value={hasContractSpan ? formatContractSpan(contractSpan) : "Pending"} />
                  <ProgressLine
                    label="Draft Total"
                    value={hasLaborAllowance || hasMaterialAllowance ? formatCurrency(pricingSubtotal) : "Pending"}
                  />
                </div>
              </article>

              <article style={crmSubtleCardStyle}>
                <div style={{ ...crmMutedTextStyle, fontSize: 13 }}>Pricing Assumptions</div>
                <div style={{ marginTop: 6 }}>
                  {hasPricingAssumptions
                    ? pricingAssumptions
                    : "Scope comes first. Capture assumptions here now, then layer in a fuller pricing engine next."}
                </div>
              </article>

              <article style={crmSubtleCardStyle}>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>Ready for Review</div>
                  <div style={crmMutedTextStyle}>
                    Review unlocks after the scope is defined and the core pricing allowances are shaped.
                  </div>
                  <div style={{ marginTop: 2, fontWeight: 800 }}>
                    {pricingReady ? "Ready for the next slice" : "Still gathering pricing inputs"}
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section style={crmCardStyle}>
            <div style={{ display: "grid", gap: 12 }}>
              <h2 style={{ margin: 0 }}>Property Context</h2>
              {property ? (
                <article style={crmSubtleCardStyle}>
                  <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
                    <div><strong>Type:</strong> {CRM_PROPERTY_TYPE_LABELS[property.propertyType]}</div>
                    <div><strong>Route Group:</strong> {property.routeGroup || "Not set"}</div>
                    <div><strong>Acreage:</strong> {property.acreage ?? "Not set"}</div>
                    <div><strong>Flags:</strong> {accessFlags}</div>
                  </div>
                </article>
              ) : (
                <article style={crmSubtleCardStyle}>
                  <div style={crmMutedTextStyle}>
                    Property metadata could not be loaded for this draft.
                  </div>
                </article>
              )}
            </div>
          </section>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span style={{ ...crmSecondaryButtonStyle, cursor: "default" }}>
              {ESTIMATE_DRAFT_STAGE_LABELS[draft.stage]}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

function WorkflowCard({
  step,
  title,
  state,
  tone,
}: {
  step: string;
  title: string;
  state: string;
  tone: "complete" | "current";
}) {
  const palette =
    tone === "complete"
      ? {
          border: "1px solid rgba(94, 186, 140, 0.24)",
          background: "rgba(36, 76, 54, 0.22)",
          badgeBorder: "1px solid rgba(94, 186, 140, 0.32)",
          badgeBackground: "rgba(36, 76, 54, 0.35)",
          badgeText: "#d7f4e1",
        }
      : {
          border: "1px solid rgba(116, 168, 255, 0.22)",
          background: "rgba(20, 43, 80, 0.22)",
          badgeBorder: "1px solid rgba(116, 168, 255, 0.3)",
          badgeBackground: "rgba(20, 43, 80, 0.36)",
          badgeText: "#d7e7ff",
        };

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
          <div style={{ ...crmMutedTextStyle, fontSize: 12 }}>{state}</div>
        </div>
      </div>
    </article>
  );
}

function DetailCard({
  label,
  title,
  body,
}: {
  label: string;
  title: string;
  body: string;
}) {
  return (
    <article style={crmSubtleCardStyle}>
      <div style={{ ...crmMutedTextStyle, fontSize: 13 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800 }}>{title}</div>
      <div style={{ marginTop: 8, ...crmMutedTextStyle }}>{body}</div>
    </article>
  );
}

function ProgressLine({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "center",
      }}
    >
      <div style={crmMutedTextStyle}>{label}</div>
      <div style={{ fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatContractSpan(value: string) {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
