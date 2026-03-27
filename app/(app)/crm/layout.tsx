import { redirect } from "next/navigation";
import { CrmMockDataProvider } from "@/components/crm/CrmMockDataProvider";
import { CRM_MOCK_CLIENTS } from "@/components/crm/mockData";
import { loadCrmClients, loadCrmProperties, logCrmPersistenceError } from "@/lib/crmPersistence";
import { canAccessRoute } from "@/lib/routeAccess";
import { createServerSupabase, getCurrentUserProfile } from "@/lib/supabase/server";

export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentUserProfile();

  if (!session?.user) {
    redirect("/login?next=%2Fcrm%2Fclients");
  }

  const role = session.effectiveRole ?? "employee";
  if (!canAccessRoute(role, "crm")) {
    redirect("/not-authorized?reason=crm_requires_management_access&next=/");
  }

  const supabase = await createServerSupabase();
  const {
    clients,
    persistenceAvailable: clientsPersistenceAvailable,
    error: clientsError,
  } = await loadCrmClients(supabase);
  const {
    properties,
    persistenceAvailable: propertiesPersistenceAvailable,
    error: propertiesError,
  } = await loadCrmProperties(supabase);

  if (clientsError) {
    logCrmPersistenceError("Failed to load CRM clients from Supabase; falling back to seeded mock clients.", clientsError, {
      table: "crm_clients",
      fallback: "seeded_mock_clients",
    });
  }

  if (propertiesError) {
    logCrmPersistenceError(
      "Failed to load CRM properties from Supabase; falling back to seeded mock properties.",
      propertiesError,
      {
        table: "crm_properties",
        fallback: "seeded_mock_properties",
      }
    );
  }

  const crmPropertiesPersistenceMode =
    clientsPersistenceAvailable && propertiesPersistenceAvailable ? "supabase" : "mock";

  return (
    <CrmMockDataProvider
      initialClients={clientsPersistenceAvailable ? clients : CRM_MOCK_CLIENTS}
      initialProperties={crmPropertiesPersistenceMode === "supabase" ? properties : undefined}
      clientsPersistenceMode={clientsPersistenceAvailable ? "supabase" : "mock"}
      propertiesPersistenceMode={crmPropertiesPersistenceMode}
    >
      {children}
    </CrmMockDataProvider>
  );
}
