import type { EstimateServiceLine } from "@/lib/estimatePersistence";

export type LocalEstimateLineItem = {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  price: string;
};

export type LocalEstimateDraft = {
  id: string;
  clientId: string;
  clientName: string;
  propertyId: string;
  propertyName: string;
  serviceAddress: string;
  serviceType: EstimateServiceLine;
  description: string;
  notes: string;
  billingMode: "one_time" | "recurring";
  lineItems: LocalEstimateLineItem[];
  totalCost: number;
  savedAt: string;
};

export function localEstimateDraftStorageKey(estimateId: string) {
  return `estimate-local:${estimateId}`;
}
