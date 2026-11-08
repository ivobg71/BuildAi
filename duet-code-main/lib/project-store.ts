import type { BuildAIAnalysis, AssetType } from '@/lib/types';
import type { MaterialOffer } from '@/lib/materials';

export type ProjectTaskStatus = 'pending' | 'in_progress' | 'done';
export type ProjectChatMessage = { role: 'user' | 'assistant'; content: string };
export type ProjectAttachment = {
  name: string;
  type: string;
  size: number;
  lastModified: number;
  blob: Blob;
};

export type EstimateLine = {
  id: string;
  key: string;
  name: string;
  searchQuery: string;
  unit: string;
  quantity: number;
  unitPrice: number | null;
  currency: 'EUR' | 'BGN' | 'USD' | 'GBP' | string;
  merchant: string;
  sourceUrl: string;
  priceSource: 'product-page' | 'shopping-api' | 'search-snippet' | 'manual' | 'not-found';
  priceCheckedAt: string;
  priceNotes: string;
};

export type QuantityEstimate = {
  workType: 'facade-insulation' | 'interior-paint' | 'flooring' | 'roof' | 'public-paving';
  areaM2: number;
  wastePercent: number;
  laborRatePerM2: number;
  transportCost: number;
  contingencyPercent: number;
  vatPercent: number;
  pricesIncludeVat: boolean;
  perimeterM: number;
  currency: 'EUR';
  lines: EstimateLine[];
  updatedAt: string;
};

export type SavedProject = {
  id: string;
  number: string;
  name: string;
  address: string;
  region: string;
  assetType: AssetType;
  goal: string;
  budgetLimit: string;
  stage: 'draft' | 'planned';
  createdAt: string;
  updatedAt: string;
  analysis: BuildAIAnalysis | null;
  reportNumber: string;
  chatMessages: ProjectChatMessage[];
  knowledgeContext: string;
  attachments: ProjectAttachment[];
  materialsQuery: string;
  materialResults: MaterialOffer[];
  materialsCheckedAt: string;
  materialsSearchNotes: string[];
  taskStatuses: Record<string, ProjectTaskStatus>;
  estimate: QuantityEstimate | null;
  fundingSnapshot: Record<string, unknown> | null;
  modelReports: Record<string, unknown>[];
};

const DB_NAME = 'buildai-projects-v1';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
const LAST_PROJECT_KEY = 'buildai-last-active-project-v1';
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Този браузър не поддържа локалното съхранение на проекти.'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Не успях да отворя локалната база с проекти.'));
    request.onblocked = () => reject(new Error('Базата с проекти е блокирана от друг отворен раздел. Презареди страницата.'));
  });
  return dbPromise;
}

export async function saveProject(project: SavedProject): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(project);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Проектът не беше запазен.'));
    transaction.onabort = () => reject(transaction.error || new Error('Запазването на проекта беше прекъснато.'));
  });
  try { localStorage.setItem(LAST_PROJECT_KEY, project.id); } catch { /* storage may be restricted */ }
}

export async function listProjects(): Promise<SavedProject[]> {
  const db = await openDb();
  const projects = await new Promise<SavedProject[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as SavedProject[] : []);
    request.onerror = () => reject(request.error || new Error('Не успях да заредя проектите.'));
  });
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(id: string): Promise<SavedProject | null> {
  const db = await openDb();
  return new Promise<SavedProject | null>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result ? request.result as SavedProject : null);
    request.onerror = () => reject(request.error || new Error('Не успях да заредя проекта.'));
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Не успях да изтрия проекта.'));
  });
  try { if (localStorage.getItem(LAST_PROJECT_KEY) === id) localStorage.removeItem(LAST_PROJECT_KEY); } catch { /* ignore */ }
}

export function getLastProjectId(): string | null {
  try { return localStorage.getItem(LAST_PROJECT_KEY); } catch { return null; }
}

export function makeProjectId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `bai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeProjectNumber(date = new Date()): string {
  const dateCode = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BAI-PRJ-${dateCode}-${suffix}`;
}

export function fileToProjectAttachment(file: File): ProjectAttachment {
  return { name: file.name, type: file.type || 'application/octet-stream', size: file.size, lastModified: file.lastModified, blob: file.slice(0, file.size, file.type || 'application/octet-stream') };
}

export function projectAttachmentToFile(attachment: ProjectAttachment): File {
  return new File([attachment.blob], attachment.name, { type: attachment.type, lastModified: attachment.lastModified });
}

export type QuantityEstimateTotals = {
  materialEur: number;
  labor: number;
  transport: number;
  contingency: number;
  vat: number;
  grand: number;
  pricedLines: number;
  unpricedLines: number;
};

/** Shared total calculation used by the estimator, project cards, and reports. */
export function calculateEstimateTotals(estimate: QuantityEstimate | null | undefined): QuantityEstimateTotals {
  if (!estimate) return { materialEur: 0, labor: 0, transport: 0, contingency: 0, vat: 0, grand: 0, pricedLines: 0, unpricedLines: 0 };
  const safe = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  let materialEur = 0;
  let pricedLines = 0;
  let unpricedLines = 0;
  for (const line of Array.isArray(estimate.lines) ? estimate.lines : []) {
    const unitPrice = safe(line.unitPrice, -1);
    if (unitPrice < 0) { unpricedLines += 1; continue; }
    let unitPriceEUR: number | null = null;
    if (line.currency === 'EUR') unitPriceEUR = unitPrice;
    else if (line.currency === 'BGN') unitPriceEUR = unitPrice / 1.95583;
    if (unitPriceEUR == null) { unpricedLines += 1; continue; }
    materialEur += Math.max(0, safe(line.quantity)) * unitPriceEUR;
    pricedLines += 1;
  }
  const labor = Math.max(0, safe(estimate.areaM2)) * Math.max(0, safe(estimate.laborRatePerM2));
  const transport = Math.max(0, safe(estimate.transportCost));
  const direct = materialEur + labor + transport;
  const contingency = direct * Math.max(0, safe(estimate.contingencyPercent)) / 100;
  const taxable = direct + contingency;
  const vat = estimate.pricesIncludeVat ? 0 : taxable * Math.max(0, safe(estimate.vatPercent)) / 100;
  return { materialEur, labor, transport, contingency, vat, grand: taxable + vat, pricedLines, unpricedLines };
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Portable JSON backup. Unlike the older export, file attachments are embedded as base64. */
export async function exportProjectBackup(project: SavedProject): Promise<string> {
  const attachments = await Promise.all((project.attachments || []).map(async attachment => ({
    name: attachment.name, type: attachment.type, size: attachment.size, lastModified: attachment.lastModified,
    dataBase64: await blobToBase64(attachment.blob),
  })));
  const backupProject = { ...project, attachments };
  return JSON.stringify({ format: 'BuildAIProjectBackup', version: 2, exportedAt: new Date().toISOString(), project: backupProject }, null, 2);
}

export async function importProjectBackup(rawText: string): Promise<{ project: SavedProject; missingAttachments: number }> {
  if (rawText.length > 100_000_000) throw new Error('Резервното копие е над 100 MB. Използвай по-малък файл.');
  let parsed: unknown;
  try { parsed = JSON.parse(rawText); } catch { throw new Error('Файлът не съдържа валиден JSON.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Невалиден формат на резервното копие.');
  const root = parsed as Record<string, unknown>;
  if (root.format !== 'BuildAIProjectBackup' || !root.project || typeof root.project !== 'object' || Array.isArray(root.project)) throw new Error('Това не е резервно копие на BuildAI проект.');
  const rawProject = root.project as Record<string, unknown>;
  if (typeof rawProject.id !== 'string' || typeof rawProject.name !== 'string' || typeof rawProject.createdAt !== 'string') throw new Error('Липсват основни данни за проекта.');
  const rawAttachments = Array.isArray(rawProject.attachments) ? rawProject.attachments : [];
  let missingAttachments = 0;
  const attachments: ProjectAttachment[] = [];
  for (const rawAttachment of rawAttachments.slice(0, 10)) {
    if (!rawAttachment || typeof rawAttachment !== 'object' || Array.isArray(rawAttachment)) continue;
    const item = rawAttachment as Record<string, unknown>;
    const name = typeof item.name === 'string' ? item.name.slice(0, 240) : '';
    const type = typeof item.type === 'string' ? item.type.slice(0, 160) : 'application/octet-stream';
    const lastModified = typeof item.lastModified === 'number' ? item.lastModified : Date.now();
    if (!name) continue;
    if (typeof item.dataBase64 !== 'string') { missingAttachments += 1; continue; }
    if (item.dataBase64.length > 60_000_000) throw new Error(`Прикаченият файл „${name}“ е твърде голям за импортиране.`);
    let blob: Blob;
    try {
      const bytes = base64ToBytes(item.dataBase64);
      const exactBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      blob = new Blob([exactBuffer], { type });
    }
    catch { missingAttachments += 1; continue; }
    attachments.push({ name, type, size: blob.size, lastModified, blob });
  }
  const validAsset = ['building', 'interior', 'public_space'].includes(String(rawProject.assetType)) ? rawProject.assetType as AssetType : 'building';
  const project: SavedProject = {
    id: rawProject.id,
    number: typeof rawProject.number === 'string' ? rawProject.number : makeProjectNumber(new Date()),
    name: rawProject.name.slice(0, 140),
    address: typeof rawProject.address === 'string' ? rawProject.address.slice(0, 220) : '',
    region: typeof rawProject.region === 'string' ? rawProject.region.slice(0, 150) : '',
    assetType: validAsset,
    goal: typeof rawProject.goal === 'string' ? rawProject.goal.slice(0, 1800) : '',
    budgetLimit: typeof rawProject.budgetLimit === 'string' ? rawProject.budgetLimit.slice(0, 120) : '',
    stage: rawProject.stage === 'planned' ? 'planned' : 'draft',
    createdAt: typeof rawProject.createdAt === 'string' ? rawProject.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    analysis: rawProject.analysis && typeof rawProject.analysis === 'object' ? rawProject.analysis as BuildAIAnalysis : null,
    reportNumber: typeof rawProject.reportNumber === 'string' ? rawProject.reportNumber : '',
    chatMessages: Array.isArray(rawProject.chatMessages) ? rawProject.chatMessages.filter((m): m is {role:'user'|'assistant';content:string} => Boolean(m && typeof m === 'object' && ((m as Record<string, unknown>).role === 'user' || (m as Record<string, unknown>).role === 'assistant') && typeof (m as Record<string, unknown>).content === 'string')).slice(-100) : [],
    knowledgeContext: typeof rawProject.knowledgeContext === 'string' ? rawProject.knowledgeContext.slice(0, 100_000) : '',
    attachments,
    materialsQuery: typeof rawProject.materialsQuery === 'string' ? rawProject.materialsQuery.slice(0, 600) : '',
    materialResults: Array.isArray(rawProject.materialResults) ? rawProject.materialResults as unknown as MaterialOffer[] : [],
    materialsCheckedAt: typeof rawProject.materialsCheckedAt === 'string' ? rawProject.materialsCheckedAt : '',
    materialsSearchNotes: Array.isArray(rawProject.materialsSearchNotes) ? rawProject.materialsSearchNotes.filter((note): note is string => typeof note === 'string').slice(0, 30) : [],
    taskStatuses: rawProject.taskStatuses && typeof rawProject.taskStatuses === 'object' && !Array.isArray(rawProject.taskStatuses) ? rawProject.taskStatuses as Record<string, ProjectTaskStatus> : {},
    estimate: rawProject.estimate && typeof rawProject.estimate === 'object' ? rawProject.estimate as QuantityEstimate : null,
    fundingSnapshot: rawProject.fundingSnapshot && typeof rawProject.fundingSnapshot === 'object' ? rawProject.fundingSnapshot as Record<string, unknown> : null,
    modelReports: Array.isArray(rawProject.modelReports) ? rawProject.modelReports.filter((report): report is Record<string, unknown> => Boolean(report && typeof report === 'object' && !Array.isArray(report))).slice(0, 12) : [],
  };
  return { project, missingAttachments };
}
