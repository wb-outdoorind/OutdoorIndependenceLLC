import EstimateShell from "@/components/estimates/EstimateShell";
import EstimateEntryWorkspace from "@/components/estimates/EstimateEntryWorkspace";
import {
  loadCrmClients,
  loadCrmProperties,
  logCrmPersistenceError,
} from "@/lib/crmPersistence";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function NewEstimatePage() {
  const supabase = await createServerSupabase();
  const clientLoad = await loadCrmClients(supabase);
  const propertyLoad = await loadCrmProperties(supabase);

  if (clientLoad.error) {
    logCrmPersistenceError("Failed to load CRM clients for estimate shell.", clientLoad.error, {
      surface: "estimates_new",
      table: "crm_clients",
    });
  }

  if (propertyLoad.error) {
    logCrmPersistenceError("Failed to load CRM properties for estimate shell.", propertyLoad.error, {
      surface: "estimates_new",
      table: "crm_properties",
    });
  }

  const crmLoadError = clientLoad.error || propertyLoad.error
    ? [clientLoad.error?.message, propertyLoad.error?.message].filter(Boolean).join(" | ")
    : null;

  return (
    <EstimateShell
      title="New Estimate"
      description="Start with the client, lock in the property, and build the estimate from the same shared CRM backbone."
      backHref="/estimates"
      backLabel="Back to Estimates"
      breadcrumb="Estimate Workspace > New Estimate"
    >
      <EstimateEntryWorkspace
        clients={clientLoad.clients}
        properties={propertyLoad.properties}
        crmLoadError={crmLoadError}
      />
    </EstimateShell>
  );
}
