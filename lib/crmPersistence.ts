import {
  crmClientIdentity,
  crmNullable,
  crmNumberOrNull,
  type CrmClient,
  type CrmClientFormValues,
  type CrmClientStatus,
  type CrmClientType,
  type CrmPreferredContactMethod,
  type CrmProperty,
  type CrmPropertyFormValues,
  type CrmPropertyType,
} from "@/lib/crm";

type QueryError = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
} | null;

type TableOps<Row> = {
  select: (columns: string) => {
    order: (
      column: string,
      options: { ascending: boolean }
    ) => PromiseLike<{ data: Row[] | null; error: QueryError }>;
  };
  upsert: (values: Row, options?: { onConflict?: string }) => {
    select: (columns: string) => {
      single: () => PromiseLike<{ data: Row | null; error: QueryError }>;
    };
  };
  delete: () => {
    eq: (column: string, value: string) => PromiseLike<{ error: QueryError }>;
  };
};

type SupabaseLike = {
  from(table: "crm_clients"): TableOps<CrmClientRow>;
  from(table: "crm_properties"): TableOps<CrmPropertyRow>;
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

export type CrmPropertyRow = {
  id: string;
  client_id: string;
  property_name: string;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  property_type: CrmPropertyType;
  lawn_size_sqft: number | string | null;
  acreage: number | string | null;
  gate_present: boolean;
  locked_gate: boolean;
  pets_present: boolean;
  entry_notes: string | null;
  site_notes: string | null;
  billing_same_as_service_address: boolean;
  billing_address_line_1: string | null;
  billing_address_line_2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_postal_code: string | null;
  billing_country: string | null;
  is_active: boolean;
  route_group: string | null;
  snow_priority: string | null;
  fertilizing_preferences: string | null;
  maintenance_contract_link: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  service_templates: string[] | null;
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

export const CRM_PROPERTY_SELECT = [
  "id",
  "client_id",
  "property_name",
  "address_line_1",
  "address_line_2",
  "city",
  "state",
  "postal_code",
  "country",
  "property_type",
  "lawn_size_sqft",
  "acreage",
  "gate_present",
  "locked_gate",
  "pets_present",
  "entry_notes",
  "site_notes",
  "billing_same_as_service_address",
  "billing_address_line_1",
  "billing_address_line_2",
  "billing_city",
  "billing_state",
  "billing_postal_code",
  "billing_country",
  "is_active",
  "route_group",
  "snow_priority",
  "fertilizing_preferences",
  "maintenance_contract_link",
  "latitude",
  "longitude",
  "service_templates",
  "created_at",
  "updated_at",
].join(", ");

export function crmPersistenceErrorDetails(error: QueryError) {
  if (!error) return null;
  return {
    code: error.code ?? "unknown",
    message: error.message ?? "Unknown Supabase error",
    details: error.details ?? null,
    hint: error.hint ?? null,
  };
}

export function logCrmPersistenceError(context: string, error: QueryError, extra?: Record<string, unknown>) {
  console.error(`[CRM] ${context}`, {
    ...crmPersistenceErrorDetails(error),
    ...(extra ?? {}),
  });
}

function asNumberOrNull(value: number | string | null | undefined) {
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

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

export function mapCrmPropertyRow(row: CrmPropertyRow): CrmProperty {
  return {
    id: row.id,
    clientId: row.client_id,
    propertyName: row.property_name,
    addressLine1: row.address_line_1,
    addressLine2: row.address_line_2,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    country: row.country,
    propertyType: row.property_type,
    lawnSizeSqft: asNumberOrNull(row.lawn_size_sqft),
    acreage: asNumberOrNull(row.acreage),
    gatePresent: row.gate_present,
    lockedGate: row.locked_gate,
    petsPresent: row.pets_present,
    entryNotes: row.entry_notes,
    siteNotes: row.site_notes,
    billingSameAsServiceAddress: row.billing_same_as_service_address,
    billingAddressLine1: row.billing_address_line_1,
    billingAddressLine2: row.billing_address_line_2,
    billingCity: row.billing_city,
    billingState: row.billing_state,
    billingPostalCode: row.billing_postal_code,
    billingCountry: row.billing_country,
    isActive: row.is_active,
    routeGroup: row.route_group,
    snowPriority: row.snow_priority,
    fertilizingPreferences: row.fertilizing_preferences,
    maintenanceContractLink: row.maintenance_contract_link,
    latitude: asNumberOrNull(row.latitude),
    longitude: asNumberOrNull(row.longitude),
    serviceTemplates: Array.isArray(row.service_templates) ? [...row.service_templates] : [],
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

export function crmPropertyToRow(property: CrmProperty): CrmPropertyRow {
  return {
    id: property.id,
    client_id: property.clientId,
    property_name: property.propertyName,
    address_line_1: property.addressLine1,
    address_line_2: property.addressLine2,
    city: property.city,
    state: property.state,
    postal_code: property.postalCode,
    country: property.country,
    property_type: property.propertyType,
    lawn_size_sqft: property.lawnSizeSqft,
    acreage: property.acreage,
    gate_present: property.gatePresent,
    locked_gate: property.lockedGate,
    pets_present: property.petsPresent,
    entry_notes: property.entryNotes,
    site_notes: property.siteNotes,
    billing_same_as_service_address: property.billingSameAsServiceAddress,
    billing_address_line_1: property.billingAddressLine1,
    billing_address_line_2: property.billingAddressLine2,
    billing_city: property.billingCity,
    billing_state: property.billingState,
    billing_postal_code: property.billingPostalCode,
    billing_country: property.billingCountry,
    is_active: property.isActive,
    route_group: property.routeGroup,
    snow_priority: property.snowPriority,
    fertilizing_preferences: property.fertilizingPreferences,
    maintenance_contract_link: property.maintenanceContractLink,
    latitude: property.latitude,
    longitude: property.longitude,
    service_templates: [...property.serviceTemplates],
    created_at: property.createdAt,
    updated_at: property.updatedAt,
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

export function buildCrmPropertyRecord(params: {
  values: CrmPropertyFormValues;
  clientId: string;
  propertyId: string;
  existingProperty?: CrmProperty | null;
  now?: string;
}) {
  const { values, clientId, propertyId, existingProperty = null, now = new Date().toISOString() } = params;

  const property: CrmProperty = {
    id: propertyId,
    clientId,
    propertyName: values.propertyName.trim() || "Untitled Property",
    addressLine1: values.addressLine1.trim(),
    addressLine2: crmNullable(values.addressLine2),
    city: values.city.trim(),
    state: values.state.trim(),
    postalCode: values.postalCode.trim(),
    country: values.country.trim() || "US",
    propertyType: values.propertyType,
    lawnSizeSqft: crmNumberOrNull(values.lawnSizeSqft),
    acreage: crmNumberOrNull(values.acreage),
    gatePresent: values.gatePresent,
    lockedGate: values.lockedGate,
    petsPresent: values.petsPresent,
    entryNotes: crmNullable(values.entryNotes),
    siteNotes: crmNullable(values.siteNotes),
    billingSameAsServiceAddress: values.billingSameAsServiceAddress,
    billingAddressLine1: values.billingSameAsServiceAddress ? null : crmNullable(values.billingAddressLine1),
    billingAddressLine2: values.billingSameAsServiceAddress ? null : crmNullable(values.billingAddressLine2),
    billingCity: values.billingSameAsServiceAddress ? null : crmNullable(values.billingCity),
    billingState: values.billingSameAsServiceAddress ? null : crmNullable(values.billingState),
    billingPostalCode: values.billingSameAsServiceAddress ? null : crmNullable(values.billingPostalCode),
    billingCountry: values.billingSameAsServiceAddress ? null : crmNullable(values.billingCountry),
    isActive: values.isActive,
    routeGroup: existingProperty?.routeGroup ?? null,
    snowPriority: existingProperty?.snowPriority ?? null,
    fertilizingPreferences: existingProperty?.fertilizingPreferences ?? null,
    maintenanceContractLink: existingProperty?.maintenanceContractLink ?? null,
    latitude: existingProperty?.latitude ?? null,
    longitude: existingProperty?.longitude ?? null,
    serviceTemplates: existingProperty?.serviceTemplates ?? [],
    createdAt: existingProperty?.createdAt ?? now,
    updatedAt: now,
  };

  return {
    property,
    row: crmPropertyToRow(property),
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

export async function loadCrmProperties(supabase: SupabaseLike) {
  const { data, error } = await supabase
    .from("crm_properties")
    .select(CRM_PROPERTY_SELECT)
    .order("property_name", { ascending: true });

  if (error) {
    return {
      properties: [] as CrmProperty[],
      error,
      persistenceAvailable: false,
    };
  }

  return {
    properties: ((data as CrmPropertyRow[] | null) ?? []).map(mapCrmPropertyRow),
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

export async function upsertCrmProperty(supabase: SupabaseLike, property: CrmProperty) {
  const { data, error } = await supabase
    .from("crm_properties")
    .upsert(crmPropertyToRow(property), { onConflict: "id" })
    .select(CRM_PROPERTY_SELECT)
    .single();

  if (error) throw error;
  return mapCrmPropertyRow(data as CrmPropertyRow);
}

export async function removeCrmClient(supabase: SupabaseLike, clientId: string) {
  const { error } = await supabase.from("crm_clients").delete().eq("id", clientId);
  if (error) throw error;
}

export async function removeCrmProperty(supabase: SupabaseLike, propertyId: string) {
  const { error } = await supabase.from("crm_properties").delete().eq("id", propertyId);
  if (error) throw error;
}
