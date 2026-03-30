import { notFound } from "next/navigation";
import EstimateShell from "@/components/estimates/EstimateShell";
import EstimateScopeWorkspace from "@/components/estimates/EstimateScopeWorkspace";
import {
  CRM_CLIENT_SELECT,
  CRM_PROPERTY_SELECT,
  type CrmClientRow,
  type CrmPropertyRow,
  mapCrmClientRow,
  mapCrmPropertyRow,
} from "@/lib/crmPersistence";
import {
  type EstimateSupabaseReader,
  loadEstimateDraftById,
  logEstimatePersistenceError,
} from "@/lib/estimatePersistence";
import { createServerSupabase } from "@/lib/supabase/server";

type EstimateDraftPageProps = {
  params: Promise<{ estimateId: string }>;
};

export default async function EstimateDraftPage({ params }: EstimateDraftPageProps) {
  const { estimateId } = await params;
  const supabase = await createServerSupabase();

  const draftLoad = await loadEstimateDraftById(supabase as unknown as EstimateSupabaseReader, estimateId);
  if (draftLoad.error) {
    logEstimatePersistenceError("Failed to load estimate draft.", draftLoad.error, {
      surface: "estimate_detail",
      estimateId,
    });
  }

  if (!draftLoad.draft) {
    notFound();
  }

  const draft = draftLoad.draft;

  const [{ data: clientRow, error: clientError }, { data: propertyRow, error: propertyError }] =
    await Promise.all([
      supabase
        .from("crm_clients")
        .select(CRM_CLIENT_SELECT)
        .eq("id", draft.clientId)
        .maybeSingle(),
      supabase
        .from("crm_properties")
        .select(CRM_PROPERTY_SELECT)
        .eq("id", draft.propertyId)
        .maybeSingle(),
    ]);

  if (clientError) {
    logEstimatePersistenceError("Failed to load estimate draft client.", clientError, {
      surface: "estimate_detail",
      estimateId,
      clientId: draft.clientId,
    });
  }

  if (propertyError) {
    logEstimatePersistenceError("Failed to load estimate draft property.", propertyError, {
      surface: "estimate_detail",
      estimateId,
      propertyId: draft.propertyId,
    });
  }

  const client = clientRow ? mapCrmClientRow(clientRow as unknown as CrmClientRow) : null;
  const property = propertyRow ? mapCrmPropertyRow(propertyRow as unknown as CrmPropertyRow) : null;

  return (
    <EstimateShell
      title={draft.title}
      description="Build the scope layer from the saved estimate foundation before pricing is added."
      backHref="/estimates"
      backLabel="Back to Estimates"
      breadcrumb="Estimate Workspace > Scope Builder"
    >
      <EstimateScopeWorkspace draft={draft} client={client} property={property} />
    </EstimateShell>
  );
}
