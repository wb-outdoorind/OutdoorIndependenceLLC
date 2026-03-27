"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  type CrmClient,
  type CrmClientFormValues,
  type CrmProperty,
  type CrmPropertyFormValues,
} from "@/lib/crm";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import {
  buildCrmPropertyRecord,
  buildCrmClientRecord,
  logCrmPersistenceError,
  removeCrmProperty,
  removeCrmClient,
  upsertCrmProperty,
  upsertCrmClient,
} from "@/lib/crmPersistence";
import { CRM_MOCK_CLIENTS, CRM_MOCK_PROPERTIES } from "@/components/crm/mockData";

type CrmSummary = {
  totalClients: number;
  totalProperties: number;
  activeClients: number;
  inactiveClients: number;
};

type CrmContextValue = {
  clients: CrmClient[];
  properties: CrmProperty[];
  summary: CrmSummary;
  clientsPersistenceMode: "mock" | "supabase";
  propertiesPersistenceMode: "mock" | "supabase";
  saveClient: (values: CrmClientFormValues, clientId?: string) => CrmClient;
  deleteClient: (clientId: string) => void;
  saveProperty: (clientId: string, values: CrmPropertyFormValues, propertyId?: string) => CrmProperty;
  deleteProperty: (propertyId: string) => void;
  getClient: (clientId: string) => CrmClient | null;
  getProperty: (propertyId: string) => CrmProperty | null;
  propertiesForClient: (clientId: string) => CrmProperty[];
};

const CrmContext = createContext<CrmContextValue | null>(null);

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

type CrmProviderProps = {
  children: React.ReactNode;
  initialClients?: CrmClient[];
  initialProperties?: CrmProperty[];
  clientsPersistenceMode?: "mock" | "supabase";
  propertiesPersistenceMode?: "mock" | "supabase";
};

function cloneClient(client: CrmClient): CrmClient {
  return { ...client, tags: [...client.tags] };
}

function cloneProperty(property: CrmProperty): CrmProperty {
  return { ...property, serviceTemplates: [...property.serviceTemplates] };
}

function sortClients(clients: CrmClient[]) {
  return clients.slice().sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function sortProperties(properties: CrmProperty[]) {
  return properties.slice().sort((left, right) => left.propertyName.localeCompare(right.propertyName));
}

function createInitialProperties(clients: CrmClient[]) {
  const clientIds = new Set(clients.map((client) => client.id));
  return sortProperties(
    CRM_MOCK_PROPERTIES
      .filter((property) => clientIds.has(property.clientId))
      .map(cloneProperty)
  );
}

function normalizeInitialClients(clients: CrmClient[]) {
  return sortClients(clients.map(cloneClient));
}

function normalizeInitialProperties(props: {
  clients: CrmClient[];
  properties?: CrmProperty[];
}) {
  const { clients, properties } = props;
  const nextProperties = properties ?? createInitialProperties(clients);
  return sortProperties(nextProperties.map(cloneProperty));
}

function notifyPersistenceError(message: string) {
  if (typeof window !== "undefined") {
    window.alert(message);
  }
}

export function CrmProvider({
  children,
  initialClients = CRM_MOCK_CLIENTS,
  initialProperties,
  clientsPersistenceMode = "mock",
  propertiesPersistenceMode = "mock",
}: CrmProviderProps) {
  const supabase = useMemo(
    () =>
      clientsPersistenceMode === "supabase" || propertiesPersistenceMode === "supabase"
        ? createSupabaseBrowser()
        : null,
    [clientsPersistenceMode, propertiesPersistenceMode]
  );
  const normalizedInitialClients = useMemo(() => normalizeInitialClients(initialClients), [initialClients]);
  const normalizedInitialProperties = useMemo(
    () =>
      normalizeInitialProperties({
        clients: normalizedInitialClients,
        properties: initialProperties,
      }),
    [initialProperties, normalizedInitialClients]
  );
  const [clients, setClients] = useState<CrmClient[]>(() => normalizedInitialClients);
  const [properties, setProperties] = useState<CrmProperty[]>(() => normalizedInitialProperties);

  useEffect(() => {
    setClients(normalizedInitialClients);
  }, [normalizedInitialClients]);

  useEffect(() => {
    setProperties(normalizedInitialProperties);
  }, [normalizedInitialProperties]);

  function saveClient(values: CrmClientFormValues, clientId?: string) {
    const now = new Date().toISOString();
    const existingClient = clientId ? clients.find((client) => client.id === clientId) ?? null : null;
    const { client: nextClient } = buildCrmClientRecord({
      values,
      clientId: clientId ?? createId("client"),
      existingClient,
      now,
    });
    const previousClients = clients.map(cloneClient);

    setClients((current) => {
      if (!clientId) return [nextClient, ...current];
      return current.map((client) => (client.id === clientId ? nextClient : client));
    });

    if (supabase && clientsPersistenceMode === "supabase") {
      void upsertCrmClient(supabase, nextClient)
        .then((savedClient) => {
          setClients((current) => {
            const exists = current.some((client) => client.id === savedClient.id);
            if (!exists) return [savedClient, ...current];
            return current.map((client) => (client.id === savedClient.id ? savedClient : client));
          });
        })
        .catch((error) => {
          logCrmPersistenceError("Failed to persist CRM client.", error, {
            operation: clientId ? "update" : "insert",
            clientId: nextClient.id,
          });
          setClients(previousClients);
          notifyPersistenceError("Unable to save CRM client. Your local changes were reverted.");
        });
    }

    return nextClient;
  }

  function deleteClient(clientId: string) {
    const previousClients = clients.map(cloneClient);
    const previousProperties = properties.map(cloneProperty);
    setClients((current) => current.filter((client) => client.id !== clientId));
    setProperties((current) => current.filter((property) => property.clientId !== clientId));

    if (supabase && clientsPersistenceMode === "supabase") {
      void removeCrmClient(supabase, clientId).catch((error) => {
        logCrmPersistenceError("Failed to delete CRM client.", error, {
          operation: "delete",
          clientId,
        });
        setClients(previousClients);
        setProperties(previousProperties);
        notifyPersistenceError("Unable to delete CRM client. Your local changes were restored.");
      });
    }
  }

  function saveProperty(clientId: string, values: CrmPropertyFormValues, propertyId?: string) {
    const now = new Date().toISOString();
    const existingProperty = propertyId ? properties.find((property) => property.id === propertyId) ?? null : null;
    const { property: nextProperty } = buildCrmPropertyRecord({
      values,
      clientId,
      propertyId: propertyId ?? createId("property"),
      existingProperty,
      now,
    });
    const previousProperties = properties.map(cloneProperty);

    setProperties((current) => {
      if (!propertyId) return [nextProperty, ...current];
      return current.map((property) => (property.id === propertyId ? nextProperty : property));
    });

    if (supabase && propertiesPersistenceMode === "supabase") {
      void upsertCrmProperty(supabase, nextProperty)
        .then((savedProperty) => {
          setProperties((current) => {
            const exists = current.some((property) => property.id === savedProperty.id);
            if (!exists) return [savedProperty, ...current];
            return current.map((property) => (property.id === savedProperty.id ? savedProperty : property));
          });
        })
        .catch((error) => {
          logCrmPersistenceError("Failed to persist CRM property.", error, {
            operation: propertyId ? "update" : "insert",
            propertyId: nextProperty.id,
            clientId,
          });
          setProperties(previousProperties);
          notifyPersistenceError("Unable to save CRM property. Your local changes were reverted.");
        });
    }

    return nextProperty;
  }

  function deleteProperty(propertyId: string) {
    const previousProperties = properties.map(cloneProperty);
    setProperties((current) => current.filter((property) => property.id !== propertyId));

    if (supabase && propertiesPersistenceMode === "supabase") {
      void removeCrmProperty(supabase, propertyId).catch((error) => {
        logCrmPersistenceError("Failed to delete CRM property.", error, {
          operation: "delete",
          propertyId,
        });
        setProperties(previousProperties);
        notifyPersistenceError("Unable to delete CRM property. Your local changes were restored.");
      });
    }
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

  const summary = useMemo<CrmSummary>(
    () => ({
      totalClients: clients.length,
      totalProperties: properties.length,
      activeClients: clients.filter((client) => client.status === "active").length,
      inactiveClients: clients.filter((client) => client.status === "inactive" || client.status === "archived").length,
    }),
    [clients, properties]
  );

  return (
    <CrmContext.Provider
      value={{
        clients,
        properties,
        summary,
        clientsPersistenceMode,
        propertiesPersistenceMode,
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
    </CrmContext.Provider>
  );
}

export function CrmMockDataProvider(props: CrmProviderProps) {
  return <CrmProvider {...props} />;
}

export function useCrm() {
  const value = useContext(CrmContext);
  if (!value) {
    throw new Error("useCrm must be used within CrmProvider.");
  }
  return value;
}

export function useCrmMockData() {
  return useCrm();
}
