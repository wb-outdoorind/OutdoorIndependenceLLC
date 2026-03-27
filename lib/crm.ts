export const CRM_CLIENT_TYPES = [
  "residential",
  "commercial",
  "hoa",
  "municipal",
  "other",
] as const;

export const CRM_CLIENT_STATUSES = [
  "lead",
  "active",
  "inactive",
  "archived",
] as const;

export const CRM_CONTACT_METHODS = [
  "phone",
  "email",
  "billing_email",
  "text",
  "other",
] as const;

export const CRM_PROPERTY_TYPES = [
  "residential",
  "commercial",
  "multi_site",
  "other",
] as const;

export type CrmClientType = (typeof CRM_CLIENT_TYPES)[number];
export type CrmClientStatus = (typeof CRM_CLIENT_STATUSES)[number];
export type CrmPreferredContactMethod = (typeof CRM_CONTACT_METHODS)[number];
export type CrmPropertyType = (typeof CRM_PROPERTY_TYPES)[number];

export type CrmClient = {
  id: string;
  clientType: CrmClientType;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  primaryPhone: string | null;
  secondaryPhone: string | null;
  primaryEmail: string | null;
  billingEmail: string | null;
  status: CrmClientStatus;
  preferredContactMethod: CrmPreferredContactMethod | null;
  notes: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type CrmProperty = {
  id: string;
  clientId: string;
  propertyName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  propertyType: CrmPropertyType;
  lawnSizeSqft: number | null;
  acreage: number | null;
  gatePresent: boolean;
  lockedGate: boolean;
  petsPresent: boolean;
  entryNotes: string | null;
  siteNotes: string | null;
  billingSameAsServiceAddress: boolean;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPostalCode: string | null;
  billingCountry: string | null;
  isActive: boolean;
  routeGroup: string | null;
  snowPriority: string | null;
  fertilizingPreferences: string | null;
  maintenanceContractLink: string | null;
  latitude: number | null;
  longitude: number | null;
  serviceTemplates: string[];
  createdAt: string;
  updatedAt: string;
};

export type CrmClientFormValues = {
  clientName: string;
  clientType: CrmClientType;
  primaryPhone: string;
  secondaryPhone: string;
  primaryEmail: string;
  billingEmail: string;
  status: CrmClientStatus;
  notes: string;
};

export type CrmPropertyFormValues = {
  propertyName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  propertyType: CrmPropertyType;
  lawnSizeSqft: string;
  acreage: string;
  gatePresent: boolean;
  lockedGate: boolean;
  petsPresent: boolean;
  entryNotes: string;
  siteNotes: string;
  billingSameAsServiceAddress: boolean;
  billingAddressLine1: string;
  billingAddressLine2: string;
  billingCity: string;
  billingState: string;
  billingPostalCode: string;
  billingCountry: string;
  isActive: boolean;
};

export const CRM_CLIENT_TYPE_LABELS: Record<CrmClientType, string> = {
  residential: "Residential",
  commercial: "Commercial",
  hoa: "HOA",
  municipal: "Municipal",
  other: "Other",
};

export const CRM_CLIENT_STATUS_LABELS: Record<CrmClientStatus, string> = {
  lead: "Lead",
  active: "Active",
  inactive: "Inactive",
  archived: "Archived",
};

export const CRM_CONTACT_METHOD_LABELS: Record<CrmPreferredContactMethod, string> = {
  phone: "Phone",
  email: "Email",
  billing_email: "Billing Email",
  text: "Text",
  other: "Other",
};

export const CRM_PROPERTY_TYPE_LABELS: Record<CrmPropertyType, string> = {
  residential: "Residential",
  commercial: "Commercial",
  multi_site: "Multi-Site",
  other: "Other",
};

export function crmDisplayName(values: {
  clientName?: string | null;
  companyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) {
  const clientName = (values.clientName ?? "").trim();
  const companyName = (values.companyName ?? "").trim();
  const firstName = (values.firstName ?? "").trim();
  const lastName = (values.lastName ?? "").trim();
  const personName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return clientName || companyName || personName || "Unnamed Client";
}

export function crmClientFormDefaults(client?: CrmClient | null): CrmClientFormValues {
  return {
    clientName: client?.displayName ?? "",
    clientType: client?.clientType ?? "residential",
    primaryPhone: client?.primaryPhone ?? "",
    secondaryPhone: client?.secondaryPhone ?? "",
    primaryEmail: client?.primaryEmail ?? "",
    billingEmail: client?.billingEmail ?? "",
    status: client ? (client.status === "active" ? "active" : "inactive") : "active",
    notes: client?.notes ?? "",
  };
}

export function crmClientIdentity(values: Pick<CrmClientFormValues, "clientName" | "clientType">) {
  const clientName = values.clientName.trim();
  if (!clientName) {
    return {
      displayName: "Unnamed Client",
      companyName: null,
      firstName: null,
      lastName: null,
    };
  }

  if (values.clientType === "residential") {
    const parts = clientName.split(/\s+/).filter(Boolean);
    return {
      displayName: clientName,
      companyName: null,
      firstName: parts[0] ?? null,
      lastName: parts.slice(1).join(" ").trim() || null,
    };
  }

  return {
    displayName: clientName,
    companyName: clientName,
    firstName: null,
    lastName: null,
  };
}

export function crmPropertyFormDefaults(property?: CrmProperty | null): CrmPropertyFormValues {
  return {
    propertyName: property?.propertyName ?? "",
    addressLine1: property?.addressLine1 ?? "",
    addressLine2: property?.addressLine2 ?? "",
    city: property?.city ?? "",
    state: property?.state ?? "WI",
    postalCode: property?.postalCode ?? "",
    country: property?.country ?? "US",
    propertyType: property?.propertyType ?? "residential",
    lawnSizeSqft: property?.lawnSizeSqft != null ? String(property.lawnSizeSqft) : "",
    acreage: property?.acreage != null ? String(property.acreage) : "",
    gatePresent: property?.gatePresent ?? false,
    lockedGate: property?.lockedGate ?? false,
    petsPresent: property?.petsPresent ?? false,
    entryNotes: property?.entryNotes ?? "",
    siteNotes: property?.siteNotes ?? "",
    billingSameAsServiceAddress: property?.billingSameAsServiceAddress ?? true,
    billingAddressLine1: property?.billingAddressLine1 ?? "",
    billingAddressLine2: property?.billingAddressLine2 ?? "",
    billingCity: property?.billingCity ?? "",
    billingState: property?.billingState ?? "",
    billingPostalCode: property?.billingPostalCode ?? "",
    billingCountry: property?.billingCountry ?? "US",
    isActive: property?.isActive ?? true,
  };
}

export function crmPropertyAddress(property: Pick<CrmProperty, "addressLine1" | "addressLine2" | "city" | "state" | "postalCode">) {
  const line1 = property.addressLine1.trim();
  const line2 = (property.addressLine2 ?? "").trim();
  const city = property.city.trim();
  const state = property.state.trim();
  const postalCode = property.postalCode.trim();
  return [line1, line2 || null, [city, state, postalCode].filter(Boolean).join(", ") || null]
    .filter(Boolean)
    .join(" • ");
}

export function crmNullable(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function crmNumberOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
