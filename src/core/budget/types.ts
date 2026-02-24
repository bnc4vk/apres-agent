import { PriceSource } from "../../adapters/integrations/serpPricing";

export type BudgetComponentKey = "pass" | "travel" | "food" | "gear_rental" | "housing";

export type BudgetComponentEstimate = {
  key: BudgetComponentKey;
  label: string;
  perPerson: number;
  source: PriceSource;
};

export type ItineraryBudgetEstimate = {
  itineraryId: string;
  resortName: string;
  perPersonTotal: number;
  groupTotal: number;
  feasible: boolean;
  shortfallPerPerson: number;
  targetPerPerson: number | null;
  components: BudgetComponentEstimate[];
  assumptions: string[];
  nightlyLodgingCap: number | null;
};

export type BudgetSummary = {
  bestItineraryId: string | null;
  bestResortName: string | null;
  bestPerPersonTotal: number;
  bestGroupTotal: number;
  feasible: boolean;
  targetPerPerson: number | null;
  shortfallPerPerson: number;
  summaryLine: string;
  assumptions: string[];
};

export type BudgetGraphInputItinerary = {
  id: string;
  resortName: string;
  dateRange?: {
    start: string;
    end: string;
  };
};

export type BudgetGraphResult = {
  itineraryBudgets: Record<string, ItineraryBudgetEstimate>;
  summary: BudgetSummary;
};

export type OriginRegion = "east" | "central" | "west";
