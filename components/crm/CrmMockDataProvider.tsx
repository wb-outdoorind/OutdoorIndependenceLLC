"use client";

import { createContext, useContext, useState } from "react";
import {
  crmClientIdentity,
  crmNullable,
  crmNumberOrNull,
  type CrmClient,
  type CrmClientFormValues,
  type CrmProperty,
  type CrmPropertyFormValues,
} from "@/lib/crm";
import { CRM_MOCK_CLIENTS, CRM_MOCK_PROPERTIES } from "@/components/crm/mockData";

type CrmSummary = {
  totalClients: number;
  totalProperties: number;
  activeClients: number;
  inactiveClients: number;
};

type CrmMockDataContextValue = {
  clients: CrmClient[];
  properties: CrmProperty[];
  summary: CrmSummary;
  saveClient: (values: CrmClientFormValues, clientId?: string) => CrmClient;
  deleteClient: (clientId: string) => void;
  saveProperty: (clientId: string, values: CrmPropertyFormValues, propertyId?: string) => CrmProperty;
  deleteProperty: (propertyId: string) => void;
  getClient: (clientId: string) => CrmClient | null;
  getProperty: (propertyId: string) => CrmProperty | null;
  propertiesForClient: (clientId: string) => CrmProperty[];
};

const CrmMockDataContext = createContext<CrmMockDataContextValue | null>(null);

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function CrmMockDataProvider({ children }: { children: React.ReactNode }) {
  const [clients, setClients] = useState<CrmClient[]>(() => CRM_MOCK_CLIENTS.map((client) => ({ ...client })));
  const [properties, setProperties] = useState<CrmProperty[]>(() =>
    CRM_MOCK_PROPERTIES.map((property) => ({ ...property, serviceTemplates: [...property.serviceTemplates] }))
  );

  function saveClient(values: CrmClientFormValues, clientId?: string) {
    const now = new Date().toISOString();
    const existingClient = clientId ? clients.find((client) => client.id === clientId) ?? null : null;
    const identity = crmClientIdentity(values);
    const nextClient: CrmClient = {
      id: clientId ?? createId("client"),
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

    setClients((current) => {
      if (!clientId) return [nextClient, ...current];
      return current.map((client) => (client.id === clientId ? nextClient : client));
    });

    return nextClient;
  }

  function deleteClient(clientId: string) {
    setClients((current) => current.filter((client) => client.id !== clientId));
    setProperties((current) => current.filter((property) => property.clientId !== clientId));
  }

  function saveProperty(clientId: string, values: CrmPropertyFormValues, propertyId?: string) {
    const now = new Date().toISOString();
    const existingProperty = propertyId ? properties.find((property) => property.id === propertyId) ?? null : null;
    const nextProperty: CrmProperty = {
      id: propertyId ?? createId("property"),
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

    setProperties((current) => {
      if (!propertyId) return [nextProperty, ...current];
      return current.map((property) => (property.id === propertyId ? nextProperty : property));
    });

    return nextProperty;
  }

  function deleteProperty(propertyId: string) {
    setProperties((current) => current.filter((property) => property.id !== propertyId));
  }

  function getClient(clientId: string) {
    return clients.find((client) => client.id === clientId) ?? null;
  }

  function getProperty(propertyId: string) {
    return properties.find((property) => property.id === propertyId) ?? null;
  }

  function propertiesForClient(clientId: string) {
    return properties
      .filter((property) => property.clientId === clientId)
      .slice()
      .sort((left, right) => left.propertyName.localeCompare(right.propertyName));
  }

  const summary: CrmSummary = {
    totalClients: clients.length,
    totalProperties: properties.length,
    activeClients: clients.filter((client) => client.status === "active").length,
    inactiveClients: clients.filter((client) => client.status === "inactive" || client.status === "archived").length,
  };

  return (
    <CrmMockDataContext.Provider
      value={{
        clients,
        properties,
        summary,
        saveClient,
        deleteClient,
        saveProperty,
        deleteProperty,
        getClient,
        getProperty,
        propertiesForClient,
      }}
    >
      {children}
    </CrmMockDataContext.Provider>
  );
}

export function useCrmMockData() {
  const value = useContext(CrmMockDataContext);
  if (!value) {
    throw new Error("useCrmMockData must be used within CrmMockDataProvider.");
  }
  return value;
}
