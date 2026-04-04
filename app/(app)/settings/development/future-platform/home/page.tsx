import Link from "next/link";
import {
  CRM_CLIENT_TYPE_LABELS,
  type CrmClient,
} from "@/lib/crm";
import { loadCrmClients, loadCrmProperties } from "@/lib/crmPersistence";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { MAINTENANCE_ACTIVE_STATUSES } from "@/lib/maintenanceStatus";
import {
  labButtonStyle,
  labCardStyle,
  labMutedTextStyle,
  labSubtleCardStyle,
} from "@/components/development/styles";

export const dynamic = "force-dynamic";

type InventoryLowStockRow = {
  quantity: number | null;
  minimum_quantity: number | null;
};

type MaintenanceQueueRow = {
  urgency: string | null;
};

type ActivityRow = {
  submitted_by: string | null;
};

function formatDateLabel(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function compareUpdatedDesc(left: CrmClient, right: CrmClient) {
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}

function highUrgencyCount(rows: MaintenanceQueueRow[]) {
  return rows.filter((row) => {
    const urgency = (row.urgency ?? "").trim();
    return urgency === "High" || urgency === "Urgent";
  }).length;
}

export default async function FutureHomePage() {
  const admin = createSupabaseAdmin();

  const [
    crmClientsRes,
    crmPropertiesRes,
    vehicleQueueRes,
    equipmentQueueRes,
    inventoryRes,
    approvalsRes,
    accountabilityRes,
    activityRes,
  ] = await Promise.all([
    loadCrmClients(admin),
    loadCrmProperties(admin),
    admin
      .from("maintenance_requests")
      .select("urgency")
      .in("status", [...MAINTENANCE_ACTIVE_STATUSES]),
    admin
      .from("equipment_maintenance_requests")
      .select("urgency")
      .in("status", [...MAINTENANCE_ACTIVE_STATUSES]),
    admin.from("inventory_items").select("quantity,minimum_quantity"),
    admin
      .from("inspections")
      .select("id", { count: "exact", head: true })
      .eq("lead_approval_status", "pending"),
    admin
      .from("accountability_actions")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    admin
      .from("form_submission_grades")
      .select("submitted_by")
      .order("submitted_at", { ascending: false })
      .limit(50),
  ]);

  const clients = crmClientsRes.clients;
  const properties = crmPropertiesRes.properties;
  const sortedClients = clients.slice().sort(compareUpdatedDesc);
  const mostRecentlyUpdatedClient = sortedClients[0] ?? null;
  const clientPropertyCount = new Map<string, number>();
  for (const property of properties) {
    clientPropertyCount.set(property.clientId, (clientPropertyCount.get(property.clientId) ?? 0) + 1);
  }

  const clientsWithoutProperties = clients.filter((client) => (clientPropertyCount.get(client.id) ?? 0) === 0);
  const activeClients = clients.filter((client) => client.status === "active");
  const routeGroupedProperties = properties.filter((property) => Boolean(property.routeGroup)).length;

  const vehicleQueue = (vehicleQueueRes.data ?? []) as MaintenanceQueueRow[];
  const equipmentQueue = (equipmentQueueRes.data ?? []) as MaintenanceQueueRow[];
  const openQueueCount = vehicleQueue.length + equipmentQueue.length;
  const urgentQueueCount = highUrgencyCount(vehicleQueue) + highUrgencyCount(equipmentQueue);

  const inventoryRows = (inventoryRes.data ?? []) as InventoryLowStockRow[];
  const lowStockCount = inventoryRows.filter((row) => {
    const quantity = Number(row.quantity ?? 0);
    const minimum = Number(row.minimum_quantity ?? 0);
    return Number.isFinite(quantity) && Number.isFinite(minimum) && quantity <= minimum;
  }).length;

  const peopleIssueCount = accountabilityRes.count ?? 0;
  const pendingApprovalsCount = approvalsRes.count ?? 0;
  const recentActivityRows = (activityRes.data ?? []) as ActivityRow[];
  const activeTeammateCount = new Set(
    recentActivityRows.map((row) => (row.submitted_by ?? "").trim()).filter(Boolean)
  ).size;

  const propertyCoverageSummary =
    routeGroupedProperties > 0
      ? `${routeGroupedProperties} properties already carry route grouping.`
      : "Route grouping has not been shaped in the shared property layer yet.";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section style={{ ...labCardStyle, display: "grid", gap: 10, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.35, opacity: 0.68 }}>Future Home</div>
        <div>
          <h1 style={{ margin: 0, fontSize: "clamp(28px, 3.8vw, 38px)" }}>Future Platform Command Center</h1>
          <div style={{ ...labMutedTextStyle, marginTop: 8, maxWidth: 860 }}>
            Choose the domain that needs attention right now, then move into the right hub without
            turning this into a flat launcher or a planning dashboard.
          </div>
        </div>
      </section>

      <section
        style={{
          ...labCardStyle,
          display: "grid",
          gap: 16,
          padding: 18,
          background: "linear-gradient(180deg, rgba(18,26,39,0.95), rgba(11,17,27,0.92))",
          border: "1px solid rgba(116, 168, 255, 0.18)",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.35, opacity: 0.68 }}>CRM Hub</div>
            <h2 style={{ margin: "6px 0 0" }}>Business-Core Backbone</h2>
            <div style={{ ...labMutedTextStyle, marginTop: 8, maxWidth: 760 }}>
              Keep the shared client and property model healthy so future estimates and downstream
              workflow stages grow from a clean account backbone.
            </div>
          </div>

          <Link href="/crm" style={labButtonStyle}>
            Open CRM
          </Link>
        </div>

        <div
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          }}
        >
          <CompactMetric label="Clients" value={`${clients.length}`} />
          <CompactMetric label="Properties" value={`${properties.length}`} />
          <CompactMetric label="Active Clients" value={`${activeClients.length}`} />
          <CompactMetric label="Missing Properties" value={`${clientsWithoutProperties.length}`} />
        </div>

        <div
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: "minmax(0, 1.2fr) minmax(280px, 0.8fr)",
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ fontWeight: 800 }}>Current signal</div>
            {clientsWithoutProperties.length ? (
              <Link
                href="/crm/clients?structure=missing-properties"
                style={{
                  ...labSubtleCardStyle,
                  textDecoration: "none",
                  color: "inherit",
                  display: "grid",
                  gap: 4,
                  padding: 14,
                }}
              >
                <div style={{ fontWeight: 800 }}>
                  {clientsWithoutProperties[0].displayName}
                </div>
                <div style={{ ...labMutedTextStyle, fontSize: 13 }}>
                  {CRM_CLIENT_TYPE_LABELS[clientsWithoutProperties[0].clientType]} account with no
                  linked property yet.
                </div>
              </Link>
            ) : mostRecentlyUpdatedClient ? (
              <Link
                href={`/crm/clients/${encodeURIComponent(mostRecentlyUpdatedClient.id)}`}
                style={{
                  ...labSubtleCardStyle,
                  textDecoration: "none",
                  color: "inherit",
                  display: "grid",
                  gap: 4,
                  padding: 14,
                }}
              >
                <div style={{ fontWeight: 800 }}>{mostRecentlyUpdatedClient.displayName}</div>
                <div style={{ ...labMutedTextStyle, fontSize: 13 }}>
                  Most recently updated on {formatDateLabel(mostRecentlyUpdatedClient.updatedAt)}.
                </div>
              </Link>
            ) : (
              <div style={{ ...labSubtleCardStyle, padding: 14 }}>
                <div style={{ fontWeight: 800 }}>CRM is still quiet</div>
                <div style={{ ...labMutedTextStyle, fontSize: 13, marginTop: 4 }}>
                  Add clients and properties to start shaping the backbone.
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontWeight: 800 }}>Quick actions</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <Link href="/crm" style={labButtonStyle}>
                Open CRM Dashboard
              </Link>
              <Link href="/crm/clients" style={labButtonStyle}>
                Clients & Properties
              </Link>
              <Link href="/crm/clients?structure=missing-properties" style={labButtonStyle}>
                Review Structure Gaps
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          alignItems: "start",
        }}
      >
        <section style={{ ...labSubtleCardStyle, display: "grid", gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.35, opacity: 0.68 }}>
              Operations Hub
            </div>
            <h2 style={{ margin: "6px 0 0" }}>Current Field Operations</h2>
            <div style={{ ...labMutedTextStyle, marginTop: 8 }}>
              Enter the active service-side workflows without turning Future Home into a duplicate of
              the current live dashboard.
            </div>
          </div>

          {urgentQueueCount > 0 || lowStockCount > 0 || openQueueCount > 0 ? (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.03)",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {urgentQueueCount > 0 ? `${urgentQueueCount} high-urgency maintenance items` : `${openQueueCount} open maintenance items`}
              {lowStockCount > 0 ? ` • ${lowStockCount} low-stock inventory items` : ""}
            </div>
          ) : (
            <div style={{ ...labMutedTextStyle, fontSize: 13 }}>
              No high-signal operations issues are elevated right now.
            </div>
          )}

          <div
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            }}
          >
            <HubLink href="/vehicles" label="Vehicles" />
            <HubLink href="/equipment" label="Equipment" />
            <HubLink href="/maintenance" label="Maintenance" />
            <HubLink href="/forms" label="Forms" />
            <HubLink href="/inventory?filter=low" label="Inventory" />
            <HubLink href="/fertilizing" label="Fertilizing Ops" />
          </div>
        </section>

        <section style={{ ...labSubtleCardStyle, display: "grid", gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.35, opacity: 0.68 }}>
              People / HR Hub
            </div>
            <h2 style={{ margin: "6px 0 0" }}>Supervisory Layer</h2>
            <div style={{ ...labMutedTextStyle, marginTop: 8 }}>
              Keep people accountability, approvals, and team visibility in one operating surface
              without inflating it into corporate HR software.
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <CompactMetric label="Issues" value={`${peopleIssueCount}`} compact />
            <CompactMetric label="Approvals" value={`${pendingApprovalsCount}`} compact />
            <CompactMetric label="Active Teammates" value={`${activeTeammateCount}`} compact />
          </div>

          <div style={{ ...labMutedTextStyle, fontSize: 13 }}>
            {peopleIssueCount > 0 || pendingApprovalsCount > 0
              ? `${peopleIssueCount} accountability issues and ${pendingApprovalsCount} pending approvals are visible right now.`
              : "People signals are calm right now, but the supervisory hub is ready for review."}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Link href="/settings/development/future-platform/people-hub" style={labButtonStyle}>
              Open People / HR Hub
            </Link>
          </div>
        </section>
      </section>

      <section
        style={{
          ...labSubtleCardStyle,
          display: "grid",
          gap: 10,
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.35, opacity: 0.68 }}>
            Quiet Footer
          </div>
          <div style={{ ...labMutedTextStyle, marginTop: 6 }}>
            Cross-platform utilities stay available here without competing with the hub structure.
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Link href="/notifications" style={labButtonStyle}>
            Notifications
          </Link>
          <Link href="/settings" style={labButtonStyle}>
            Settings
          </Link>
          <Link href="/audit" style={labButtonStyle}>
            Audit Trail
          </Link>
        </div>

        <div style={{ ...labMutedTextStyle, fontSize: 13 }}>{propertyCoverageSummary}</div>
      </section>
    </div>
  );
}

function CompactMetric({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        minHeight: 0,
        padding: compact ? "9px 11px" : "10px 12px",
        borderRadius: 14,
        border: compact
          ? "1px solid rgba(255,255,255,0.08)"
          : "1px solid rgba(255,255,255,0.06)",
        background: compact ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.02)",
        display: "grid",
        gap: compact ? 4 : 8,
      }}
    >
      <div style={{ fontSize: compact ? 12 : 11, fontWeight: 800, letterSpacing: 0.3, opacity: 0.68 }}>
        {label}
      </div>
      <div style={{ fontSize: compact ? 22 : 24, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function HubLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        ...labButtonStyle,
        justifyContent: "space-between",
        minHeight: 0,
        padding: "10px 12px",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        fontWeight: 600,
        fontSize: 13,
      }}
    >
      <span>{label}</span>
      <span aria-hidden="true">→</span>
    </Link>
  );
}
