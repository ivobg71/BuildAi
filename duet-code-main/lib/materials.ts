import type { MaterialStoreKind } from '@/lib/material-stores';

export type MaterialPriceSource = 'product-page' | 'shopping-api' | 'search-snippet' | 'not-found';

export type MaterialOffer = {
  id: string;
  title: string;
  merchant: string;
  domain: string;
  url: string;
  price: number | null;
  currency: string | null;
  priceSource: MaterialPriceSource;
  priceCheckedAt: string | null;
  availability: string;
  unitLabel: string;
  comparisonPrice?: number | null;
  comparisonCurrency?: string | null;
  comparisonUnit?: string | null;
  description: string;
  matchedQuery: string;
};

export type MaterialSearchResult = {
  query: string;
  queries: string[];
  checkedAt: string;
  results: MaterialOffer[];
  storeSearchLinks: { name: string; domain: string; url: string; categories: string[]; kind?: MaterialStoreKind }[];
  notes: string[];
  location?: string;
  searchProvider?: string;
  providerWarnings?: string[];
};
