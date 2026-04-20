import type { EstimateServiceLine } from "@/lib/estimatePersistence";

export type EstimateTemplateLineItem = {
  description: string;
  quantity: string;
  unit: string;
  price: string;
};

export type EstimateServiceTemplate = {
  id: string;
  name: string;
  serviceType: EstimateServiceLine;
  lineItems: EstimateTemplateLineItem[];
};

export const ESTIMATE_SERVICE_TEMPLATES: EstimateServiceTemplate[] = [
  {
    id: "lawn-maintenance-visit",
    name: "Lawn Maintenance Visit",
    serviceType: "maintenance",
    lineItems: [
      { description: "Mowing and trimming visit", quantity: "1", unit: "visit", price: "0" },
      { description: "Blow off hard surfaces", quantity: "1", unit: "visit", price: "0" },
    ],
  },
  {
    id: "spring-cleanup",
    name: "Spring Cleanup",
    serviceType: "landscape",
    lineItems: [
      { description: "Spring debris cleanup", quantity: "1", unit: "job", price: "0" },
      { description: "Bed edging and detail cleanup", quantity: "1", unit: "job", price: "0" },
    ],
  },
  {
    id: "mulch-refresh",
    name: "Mulch Refresh",
    serviceType: "landscape",
    lineItems: [
      { description: "Mulch installation", quantity: "1", unit: "yard", price: "0" },
      { description: "Bed prep and detail cleanup", quantity: "1", unit: "job", price: "0" },
    ],
  },
  {
    id: "snow-visit",
    name: "Snow Visit",
    serviceType: "snow",
    lineItems: [
      { description: "Snow plowing visit", quantity: "1", unit: "visit", price: "0" },
      { description: "Walkway clearing", quantity: "1", unit: "visit", price: "0" },
    ],
  },
  {
    id: "shrub-trimming",
    name: "Shrub Trimming",
    serviceType: "landscape",
    lineItems: [
      { description: "Shrub trimming and shaping", quantity: "1", unit: "job", price: "0" },
      { description: "Haul away clippings", quantity: "1", unit: "job", price: "0" },
    ],
  },
];
