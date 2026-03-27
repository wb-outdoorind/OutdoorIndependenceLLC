import {
  crmClientIdentity,
  crmNullable,
  type CrmClient,
  type CrmClientFormValues,
  type CrmClientStatus,
  type CrmClientType,
  type CrmPreferredContactMethod,
} from "@/lib/crm";

type SupabaseLike = {
  from: (table: "crm_clients") => {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean }
      ) => PromiseLike<{ data: CrmClientRow[] | null; error: { code?: string; message?: string } | null }>;
    };
    upsert: (values: CrmClientRow, options?: { onConflict?: string }) => {
      select: (columns: string) => {
        single: () => PromiseLike<{ data: CrmClientRow | null; error: { code?: string; message?: string } | null }>;
      };
    };
    delete: () => {
      eq: (
        column: string,
        value: string
      ) => PromiseLike<{ error: { code?: string; message?: string } | null }>;
    };
  };
};

export type CrmClientRow = {
  id: string;
  client_type: CrmClientType;
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  primary_phone: string | null;
  secondary_phone: string | null;
  primary_email: string | null;
  billing_email: string | null;
  status: CrmClientStatus;
  preferred_contact_method: CrmPreferredContactMethod | null;
  notes: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

export const CRM_CLIENT_SELECT = [
  "id",
  "client_type",
  "company_name",
  "first_name",
  "last_name",
  "display_name",
  "primary_phone",
  "secondary_phone",
  "primary_email",
  "billing_email",
  "status",
  "preferred_contact_method",
  "notes",
  "tags",
  "created_at",
  "updated_at",
].join(", ");

export function mapCrmClientRow(row: CrmClientRow): CrmClient {
  return {
    id: row.id,
    clientType: row.client_type,
    companyName: row.company_name,
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: row.display_name,
    primaryPhone: row.primary_phone,
    secondaryPhone: row.secondary_phone,
    primaryEmail: row.primary_email,
    billingEmail: row.billing_email,
    status: row.status,
    preferredContactMethod: row.preferred_contact_method,
    notes: row.notes,
    tags: Array.isArray(row.tags) ? [...row.tags] : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function crmClientToRow(client: CrmClient): CrmClientRow {
  return {
    id: client.id,
    client_type: client.clientType,
    company_name: client.companyName,
    first_name: client.firstName,
    last_name: client.lastName,
    display_name: client.displayName,
    primary_phone: client.primaryPhone,
    secondary_phone: client.secondaryPhone,
    primary_email: client.primaryEmail,
    billing_email: client.billingEmail,
    status: client.status,
    preferred_contact_method: client.preferredContactMethod,
    notes: client.notes,
    tags: [...client.tags],
    created_at: client.createdAt,
    updated_at: client.updatedAt,
  };
}

export function buildCrmClientRecord(params: {
  values: CrmClientFormValues;
  clientId: string;
  existingClient?: CrmClient | null;
  now?: string;
}) {
  const { values, clientId, existingClient = null, now = new Date().toISOString() } = params;
  const identity = crmClientIdentity(values);

  const client: CrmClient = {
    id: clientId,
    clientType: values.clientType,
    companyName: identity.companyName,
    firstName: identity.firstName,
    lastName: identity.lastName,
    displayName: identity.displayName,
    primaryPhone: crmNullable(values.primaryPhone),
    secondaryPhone: crmNullable(values.secondaryPhone),
    primaryEmail: crmNullable(values.primaryEmail),
    billingEmail: crmNullable(values.billingEmail),
    status: values.status,
    preferredContactMethod:
      existingClient?.preferredContactMethod ??
      (values.primaryEmail.trim() ? "email" : values.primaryPhone.trim() ? "phone" : "phone"),
    notes: crmNullable(values.notes),
    tags: existingClient?.tags ?? [],
    createdAt: existingClient?.createdAt ?? now,
    updatedAt: now,
  };

  return {
    client,
    row: crmClientToRow(client),
  };
}

export async function loadCrmClients(supabase: SupabaseLike) {
  const { data, error } = await supabase
    .from("crm_clients")
    .select(CRM_CLIENT_SELECT)
    .order("display_name", { ascending: true });

  if (error) {
    return {
      clients: [] as CrmClient[],
      error,
      persistenceAvailable: false,
    };
  }

  return {
    clients: ((data as CrmClientRow[] | null) ?? []).map(mapCrmClientRow),
    error: null,
    persistenceAvailable: true,
  };
}

export async function upsertCrmClient(supabase: SupabaseLike, client: CrmClient) {
  const { data, error } = await supabase
    .from("crm_clients")
    .upsert(crmClientToRow(client), { onConflict: "id" })
    .select(CRM_CLIENT_SELECT)
    .single();

  if (error) throw error;
  return mapCrmClientRow(data as CrmClientRow);
}

export async function removeCrmClient(supabase: SupabaseLike, clientId: string) {
  const { error } = await supabase.from("crm_clients").delete().eq("id", clientId);
  if (error) throw error;
}
