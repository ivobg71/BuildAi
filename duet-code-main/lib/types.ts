export type AssetType = 'building' | 'interior' | 'public_space';

export type Observation = {
  issue: string;
  evidence: string;
  confidence: 'low' | 'medium' | 'high';
};

export type ActionStep = {
  title: string;
  description: string;
  professional: string;
  materials: string[];
  needsInspection: boolean;
};

export type BuildAIAnalysis = {
  summary: string;
  assetType: string;
  observations: Observation[];
  actionPlan: ActionStep[];
  limitations: string[];
  requiresHumanReview: boolean;
  redesignPrompt: string;
  budgetNote: string;
};

export type ConceptColor = {
  name: string;
  hex: string;
};

export type BuildAIConcept = {
  title: string;
  style: string;
  description: string;
  palette: ConceptColor[];
  improvements: string[];
  materials: string[];
  designNotes: string[];
};
