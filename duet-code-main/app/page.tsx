'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Bot, Check, ChevronDown, CircleAlert, ClipboardList, Download, Euro, FileSearch, FileText, Home as HomeIcon, ImagePlus, LoaderCircle, MapPin, Menu, MessageCircle, Palette, Search, Send, ShieldCheck, Sparkles, Upload, User, UsersRound, Wrench, X, Box as BoxIcon, Copy, PackageSearch, Wallet, Calculator } from 'lucide-react';
import type { BuildAIAnalysis, AssetType } from '@/lib/types';
import ContactDirectory from '@/components/contact-directory';
import FundingFinder, { type FundingOpportunity, type FundingSnapshot } from '@/components/funding-finder';
import { loadSavedContacts } from '@/lib/contact-storage';
import type { PublicContact } from '@/lib/contacts';
import { contactMatchesLocation, contactRole, contactSearchText } from '@/lib/contacts';
import MaterialsFinder, { MaterialsResults } from '@/components/materials-finder';
import type { MaterialOffer, MaterialSearchResult } from '@/lib/materials';
import ProjectManager from '@/components/project-manager';
import PhotoGallery from '@/components/photo-gallery';
import QuantityEstimator from '@/components/quantity-estimator';
import { fileToProjectAttachment, getLastProjectId, getProject, makeProjectId, makeProjectNumber, projectAttachmentToFile, saveProject, type QuantityEstimate, type ProjectTaskStatus, type SavedProject, calculateEstimateTotals } from '@/lib/project-store';

type Stage = 'idle' | 'analyzing' | 'ready';
type AppView = 'workspace' | 'create' | 'projects' | 'estimate' | 'contacts' | 'funding' | 'generator' | 'reports' | 'materials';
type GeneratorMode = 'building' | 'interior' | 'public-space' | 'generic';
type GeneratorInquiryPayload = Record<string, unknown>;
type ChatMessage = { role: 'user' | 'assistant'; content: string };

type GeneratedModelPart = {
  name?: string;
  shape: string;
  position?: number[];
  rotation?: number[];
  size?: number[];
  color?: string;
  roughness?: number;
  metalness?: number;
};
type GeneratedModelRecipe = {
  title: string;
  objectType: string;
  description: string;
  imageRecognition: string;
  scaleNote: string;
  parts: GeneratedModelPart[];
  suggestions?: string[];
  sceneMode?: string;
  visualStyle?: string;
  detailLevel?: string;
  scaleMetersPerUnit?: number;
  dimensions?: { width: number; height: number; depth: number; unit: string; calibratedAxis?: string; isCalibrated?: boolean };
};
type GeneratedModelReport = {
  id: string;
  projectId?: string;
  projectNumber?: string;
  projectName?: string;
  designChanges?: { previousReportNumber?: string; items: { category: string; before: number; after: number; delta: number }[] };
  estimateScenario?: {
    workType: string;
    currentAreaM2: number;
    proposedAreaM2: number;
    currentTotalEur: number;
    proposedTotalEur: number;
    deltaEur: number;
    rows: { name: string; before: number; after: number; unit: string; hasPrice: boolean }[];
    caution: string;
  };
  projectSnapshot?: {
    address?: string;
    goal?: string;
    budgetLimit?: string;
    assetType?: string;
    estimate?: {
      workType: string;
      areaM2: number;
      totals: ReturnType<typeof calculateEstimateTotals>;
      lines: { name: string; quantity: number; unit: string; unitPrice: number | null; currency: string; merchant: string; sourceUrl: string; priceSource: string }[];
    } | null;
  };
  reportNumber: string;
  title: string;
  objectType: string;
  sceneMode?: string;
  visualStyle?: string;
  detailLevel?: string;
  prompt: string;
  description: string;
  imageRecognition: string;
  scaleNote: string;
  suggestions: string[];
  createdAt: string;
  sourceImageName: string;
  previewDataUrl: string;
  model: GeneratedModelRecipe;
};

function normalizeGeneratorMode(value?: string): GeneratorMode {
  return value === 'interior' || value === 'public-space' || value === 'generic' || value === 'building' ? value : 'building';
}

function sceneModeLabel(value?: string) {
  switch (value) {
    case 'interior': return 'Интериорен дизайн';
    case 'public-space': return 'Публичен терен';
    case 'generic': return 'Свободен 3D обект';
    case 'building': return 'Сграда / екстериор';
    default: return '3D проект';
  }
}

function modelStyleLabel(value?: string) {
  const labels: Record<string, string> = {
    contemporary: 'Съвременен', modern: 'Модерен', minimalist: 'Минималистичен',
    scandinavian: 'Скандинавски', industrial: 'Индустриален', mediterranean: 'Средиземноморски',
    classical: 'Класически', futuristic: 'Футуристичен', organic: 'Органичен',
    japanese: 'Японски дзен', playful: 'Цветен и игрив', brutalist: 'Бруталистичен',
  };
  return value ? (labels[value] || value) : 'Съвременен';
}

function modelDetailLabel(value?: string) {
  const labels: Record<string, string> = { balanced: 'Балансирана', high: 'Висока', ultra: 'Много висока' };
  return value ? (labels[value] || value) : 'Висока';
}

function inferEstimateWorkType(assetType: AssetType, goal: string): QuantityEstimate['workType'] {
  const value = goal.toLocaleLowerCase('bg-BG');
  if (/покрив|керемид|улуци|хидроизолац.*покрив/.test(value)) return 'roof';
  if (/боядис|латекс|стен.*боя|шпаклов/.test(value)) return 'interior-paint';
  if (/настил|гранитогрес|плочк|ламинат|паркет|подова/.test(value)) return assetType === 'public_space' ? 'public-paving' : 'flooring';
  if (/парк|площад|междублок|тротоар|алея|павет|обществен.*терен/.test(value) || assetType === 'public_space') return 'public-paving';
  if (/изолац|саниран|фасад|топлоизолац/.test(value)) return 'facade-insulation';
  return assetType === 'interior' ? 'interior-paint' : 'facade-insulation';
}

function isGeneratedModelReport(value: unknown): value is GeneratedModelReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const model = record.model;
  return typeof record.id === 'string' && typeof record.title === 'string' &&
    typeof record.reportNumber === 'string' && typeof record.createdAt === 'string' &&
    Boolean(model && typeof model === 'object' && !Array.isArray(model) &&
      Array.isArray((model as Record<string, unknown>).parts));
}

function modelPartCategory(part: GeneratedModelPart): string {
  const text = `${part.name || ''} ${part.shape || ''}`.toLocaleLowerCase('bg-BG');
  if (/покрив|керемид|roof|chimney|комин/.test(text)) return 'Покрив';
  if (/настил|паве|плоч|floor|под|асфалт|curb|бордюр|paving/.test(text)) return 'Настилка / под';
  if (/прозор|window|остъклен/.test(text)) return 'Прозорци';
  if (/врат|door|портал/.test(text)) return 'Врати';
  if (/диван|стол|мебел|маса|шкаф|легло|desk|sofa|chair|table|bed|cabinet/.test(text)) return 'Мебели';
  if (/дърво|храст|растен|трева|цвет|tree|plant|bush|grass|flower/.test(text)) return 'Озеленяване';
  if (/ламп|свет|освет|light|lamp|luminaire/.test(text)) return 'Осветление';
  if (/кола|автомоб|vehicle|car|bike|велосипед/.test(text)) return 'Транспорт';
  return 'Други компоненти';
}

function makeModelDesignChanges(current: GeneratedModelReport, previous?: GeneratedModelReport): NonNullable<GeneratedModelReport['designChanges']> {
  const categories = ['Покрив','Настилка / под','Прозорци','Врати','Мебели','Озеленяване','Осветление','Транспорт','Други компоненти'];
  const count = (report: GeneratedModelReport | undefined, category: string) => (report?.model.parts || []).filter(part => modelPartCategory(part) === category).length;
  return {
    previousReportNumber: previous?.reportNumber,
    items: categories.map(category => ({ category, before:count(previous, category), after:count(current, category), delta:count(current, category)-count(previous, category) }))
      .filter(item => previous ? item.delta !== 0 : item.after > 0),
  };
}

function make3DEstimateScenario(estimate: QuantityEstimate | null, report: GeneratedModelReport): NonNullable<GeneratedModelReport['estimateScenario']> | undefined {
  const dimensions = report.model.dimensions;
  if (!estimate || !dimensions?.isCalibrated || !Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.depth) || dimensions.width <= 0 || dimensions.depth <= 0) return undefined;
  // Only a ground/floor surface estimate is meaningfully comparable with X × Z. Wall and roof areas need different measured geometry.
  const sceneMode = report.sceneMode || report.model.sceneMode;
  if (estimate.workType === 'flooring' && sceneMode !== 'interior') return undefined;
  if (estimate.workType === 'public-paving' && sceneMode !== 'public-space') return undefined;
  if (!['flooring','public-paving'].includes(estimate.workType)) return undefined;
  const proposedAreaM2 = Math.round(dimensions.width * dimensions.depth * 100) / 100;
  if (!(proposedAreaM2 > 0) || !(estimate.areaM2 > 0)) return undefined;
  const ratio = proposedAreaM2 / estimate.areaM2;
  if (!Number.isFinite(ratio) || ratio < .1 || ratio > 10) return undefined;
  const rows = estimate.lines.map(line => {
    const raw = Math.max(0, line.quantity * ratio);
    const wholePackage = /торба|пакет|ролка|кофа|бр\.?|чувал|кутия/i.test(line.unit);
    const after = wholePackage ? Math.ceil(raw) : Math.round(raw * 100) / 100;
    return { name:line.name, before:line.quantity, after, unit:line.unit, hasPrice:line.unitPrice != null && Number.isFinite(line.unitPrice) };
  });
  const currentTotals = calculateEstimateTotals(estimate);
  const proposed = { ...estimate, areaM2:proposedAreaM2, lines:estimate.lines.map(line => {
    const row = rows.find(item => item.name === line.name);
    return { ...line, quantity:row?.after ?? line.quantity };
  }) };
  const proposedTotals = calculateEstimateTotals(proposed);
  return {
    workType:estimate.workType,
    currentAreaM2:estimate.areaM2,
    proposedAreaM2,
    currentTotalEur:currentTotals.grand,
    proposedTotalEur:proposedTotals.grand,
    deltaEur:proposedTotals.grand-currentTotals.grand,
    rows,
    caution:'Сценарий, не автоматично приета КСС: X е калибрирана по въведена реална ширина, но Z е пропорционална оценка от концептуален модел. Потвърди дълбочината и измерванията на място. Сценарият е ограничен до подова/външна настилка; не е приложим към площ на фасада или скатен покрив.',
  };
}

const assetOptions: { id: AssetType; title: string; description: string }[] = [
  { id: 'building', title: 'Сграда / фасада', description: 'Фасади, входове и видими външни повреди' },
  { id: 'interior', title: 'Интериор', description: 'Стаи, коридори и обществени интериори' },
  { id: 'public_space', title: 'Обществено пространство', description: 'Площади, паркове и междублокови зони' },
];

async function prepareImageForAI(source: File): Promise<File> {
  const objectUrl = URL.createObjectURL(source);
  try {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Снимката не може да бъде прочетена. Опитай с JPG или PNG.'));
    });
    image.src = objectUrl;
    await loaded;
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error('Снимката няма валидни размери. Избери друга снимка.');
    }

    const maxEdge = 960;
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return source;
    // Fill transparent PNG areas with white before JPEG encoding.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.76));
    if (!blob) return source;
    return new File([blob], 'buildai-optimized.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function makeChatOpening(analysis: BuildAIAnalysis): string {
  const findings = analysis.observations.slice(0, 3).map((item, index) => `${index + 1}. ${item.issue} — ${item.evidence}`).join('\n');
  const firstSteps = analysis.actionPlan.slice(0, 3).map((step, index) => `${index + 1}. ${step.title} — подходящ специалист: ${step.professional}`).join('\n');
  return `${analysis.summary}\n\n${findings ? `Какво се откроява по снимката:\n${findings}\n\n` : ''}${firstSteps ? `Предложени първи стъпки:\n${firstSteps}\n\n` : ''}Можеш да ме попиташ кое да се направи първо, кой специалист да потърсиш, какви материали да се обсъдят или как да планираш работата. Това е предварителна оценка по снимка, не техническа експертиза.`;
}

async function readApiResponse(response: Response): Promise<Record<string, unknown>> {
  const body = await response.text();
  let payload: unknown;
  try { payload = JSON.parse(body); } catch {
    throw new Error(`Сървърът върна неочакван отговор (HTTP ${response.status}). Провери deployment логовете в Kuso и опитай отново.`);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`Сървърът върна невалиден отговор (HTTP ${response.status}).`);
  }
  const record = payload as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof record.error === 'string' ? record.error : `Заявката не успя (HTTP ${response.status}).`);
  }
  return record;
}

function selectRelevantContacts(contacts: PublicContact[], question: string, analysis: BuildAIAnalysis): PublicContact[] {
  const combined = `${question} ${analysis.summary} ${analysis.observations.map(item => item.issue).join(' ')} ${analysis.actionPlan.map(item => `${item.title} ${item.professional}`).join(' ')}`.toLocaleLowerCase('bg-BG');
  const terms = [...new Set(combined.split(/[^\p{L}\p{N}]+/u).filter(term => term.length >= 4))].slice(0, 100);
  const ranked = contacts.map(contact => {
    const text = contactSearchText(contact);
    const score = terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0) + (contact.verified ? 0.3 : 0);
    return { contact, score };
  }).sort((a, b) => b.score - a.score);
  const matches = ranked.filter(item => item.score > 0).slice(0, 15).map(item => item.contact);
  return matches.length ? matches : ranked.filter(item => item.contact.verified).slice(0, 8).map(item => item.contact);
}


function recommendProviderContacts(contacts: PublicContact[], analysis: BuildAIAnalysis, goal: string, projectLocation: string): PublicContact[] {
  const text = `${goal} ${analysis.summary} ${analysis.observations.map(item => item.issue + ' ' + item.evidence).join(' ')} ${analysis.actionPlan.map(item => item.title + ' ' + item.description + ' ' + item.professional).join(' ')}`.toLocaleLowerCase('bg-BG');
  const location = projectLocation.trim();
  const isPublicSpace = /парк|площад|междублок|тротоар|улиц|обществено пространство|благоустрой/.test(text) || analysis.assetType === 'public_space';
  const isFacade = /фасад|саниран|топлоизолац|хидроизолац|покрив|теч|мазилк|балкон|дограма|енергийн/.test(text);
  const isInterior = /интериор|коридор|стая|настилк|облицов|боя|довършител/.test(text) || analysis.assetType === 'interior';
  const needsEngineering = /конструкц|пукнат|арматур|носещ|инженер|надзор|проектант|укрепван/.test(text);
  const ranked = contacts.filter(contact => contact.kind === 'company').map(contact => {
    const profile = `${contact.category} ${contact.description} ${contact.name}`.toLocaleLowerCase('bg-BG');
    const role = contactRole(contact);
    let score = 0;
    if (role === 'executor') score += 8;
    else if (role === 'designer') score += 2;
    else if (role === 'supervision') score += 1;
    else score -= 4;
    if (isFacade && /фасад|топлоизолац|хидроизолац|саниран|покрив|ремонт|строител|реконструк/.test(profile)) score += 5;
    if (isInterior && /довършител|ремонт|облицов|интериор|строител/.test(profile)) score += 4;
    if (isPublicSpace && /благоустрой|инфраструктур|път|тротоар|строител|реконструк/.test(profile)) score += 5;
    if (needsEngineering && /инженер|надзор|контрол|консулт|проект|строителен контрол/.test(profile)) score += 4;
    if (location && contactMatchesLocation(contact, location)) score += 10;
    if (contact.sourceUrl) score += 1;
    if (!contact.phone && !contact.email && !contact.website) score -= 3;
    return { contact, score };
  }).sort((a, b) => b.score - a.score || a.contact.name.localeCompare(b.contact.name, 'bg'));
  return ranked.filter(item => item.score >= 5).slice(0, 5).map(item => item.contact);
}

function getMaterialQueries(analysis: BuildAIAnalysis, goal: string): string[] {
  const candidates = analysis.actionPlan.flatMap(step => (step.materials || []).map(material => material.trim()).filter(Boolean));
  const cleaned = [...new Set(candidates.map(item => item.replace(/[;|]/g, ' ').replace(/\s+/g, ' ').trim()).filter(item => item.length >= 3))];
  if (cleaned.length) return cleaned.slice(0, 3);
  const context = `${goal} ${analysis.summary} ${analysis.actionPlan.map(step => `${step.title} ${step.description}`).join(' ')}`.toLocaleLowerCase('bg-BG');
  const inferred: string[] = [];
  if (/изолац|фасад|саниран|енергийн/.test(context)) inferred.push('фасадна топлоизолация');
  if (/покрив|керемид|теч/.test(context)) inferred.push('покривни материали хидроизолация');
  if (/настилк|плочк|интериор|баня/.test(context)) inferred.push('подови настилки плочки');
  if (/боя|мазилк|стен/.test(context)) inferred.push('боя мазилка шпакловка');
  return [...new Set(inferred.length ? inferred : ['строителни материали за ремонт'])].slice(0, 3);
}

function downloadModelReport(report: GeneratedModelReport) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${report.reportNumber || 'buildai-3d-report'}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatReportDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Неизвестна дата' : date.toLocaleString('bg-BG', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function Home({ initialView = 'workspace' }: { initialView?: AppView }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const chatHistoryRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [knowledgeContext, setKnowledgeContext] = useState('');
  const [fileNotice, setFileNotice] = useState('');
  const [directoryContacts, setDirectoryContacts] = useState<PublicContact[]>([]);
  const [assetType, setAssetType] = useState<AssetType>('building');
  const [goal, setGoal] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [analysis, setAnalysis] = useState<BuildAIAnalysis | null>(null);
  const [error, setError] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [projectLocation, setProjectLocation] = useState('');
  const [activeView, setActiveView] = useState<AppView>(initialView);
  const [generatorStartMode, setGeneratorStartMode] = useState<GeneratorMode>('building');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportNumber, setReportNumber] = useState('');
  const [materialResults, setMaterialResults] = useState<MaterialOffer[]>([]);
  const [materialsQuery, setMaterialsQuery] = useState('');
  const [quickMaterialQuery, setQuickMaterialQuery] = useState('');
  const [materialsCheckedAt, setMaterialsCheckedAt] = useState('');
  const [materialsSearchStatus, setMaterialsSearchStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [materialsSearchError, setMaterialsSearchError] = useState('');
  const [materialStoreSearchLinks, setMaterialStoreSearchLinks] = useState<MaterialSearchResult['storeSearchLinks']>([]);
  const [materialSearchNotes, setMaterialSearchNotes] = useState<string[]>([]);
  const [generatorInquiry, setGeneratorInquiry] = useState<GeneratorInquiryPayload | null>(null);
  const [generatorContact, setGeneratorContact] = useState({ name: '', email: '', phone: '', note: '' });
  const menuRef = useRef<HTMLDivElement>(null);
  const generatorFrameRef = useRef<HTMLIFrameElement>(null);
  const [modelReports, setModelReports] = useState<GeneratedModelReport[]>([]);
  const [modelReportsLoaded, setModelReportsLoaded] = useState(false);
  const [selectedModelReport, setSelectedModelReport] = useState<GeneratedModelReport | null>(null);
  const [modelReportNotice, setModelReportNotice] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectNumber, setProjectNumber] = useState('');
  const [projectCreatedAt, setProjectCreatedAt] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectAddress, setProjectAddress] = useState('');
  const [projectBudgetLimit, setProjectBudgetLimit] = useState('');
  const [projectsHydrated, setProjectsHydrated] = useState(false);
  const [projectAutoSaveStatus, setProjectAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedProjectsRefresh, setSavedProjectsRefresh] = useState(0);
  const [quantityEstimate, setQuantityEstimate] = useState<QuantityEstimate | null>(null);
  const [taskStatuses, setTaskStatuses] = useState<Record<string, ProjectTaskStatus>>({});
  const [fundingSnapshot, setFundingSnapshot] = useState<Record<string, unknown> | null>(null);
  const [projectStoreError, setProjectStoreError] = useState('');
  const currentProjectId = projectId;

  function ensureCurrentProjectId(): string {
    if (projectId) return projectId;
    const now = new Date();
    const nextId = makeProjectId();
    setProjectId(nextId);
    setProjectNumber(makeProjectNumber(now));
    setProjectCreatedAt(now.toISOString());
    setProjectName(current => current.trim() || 'Нов строителен проект');
    setProjectAutoSaveStatus('saving');
    return nextId;
  }

  function hydrateProjectRecord(project: SavedProject, showEditor = true) {
    if (preview) URL.revokeObjectURL(preview);
    const files = (project.attachments || []).map(attachment => {
      try { return projectAttachmentToFile(attachment); } catch { return null; }
    }).filter((item): item is File => Boolean(item));
    const firstImage = files.find(item => isImageUpload(item));
    setProjectId(project.id);
    setProjectNumber(project.number || makeProjectNumber(new Date(project.createdAt)));
    setProjectCreatedAt(project.createdAt || new Date().toISOString());
    setProjectName(project.name || 'Без име');
    setProjectAddress(project.address || '');
    setProjectBudgetLimit(project.budgetLimit || '');
    setAssetType(project.assetType || 'building');
    setGoal(project.goal || '');
    setProjectLocation(project.region || '');
    setSelectedFiles(files);
    setFile(firstImage || null);
    setPreview(firstImage ? URL.createObjectURL(firstImage) : '');
    setAnalysis(project.analysis || null);
    setStage(project.analysis ? 'ready' : 'idle');
    setReportNumber(project.reportNumber || '');
    setChatMessages(Array.isArray(project.chatMessages) ? project.chatMessages : []);
    setChatInput('');
    setKnowledgeContext(project.knowledgeContext || '');
    setMaterialResults(Array.isArray(project.materialResults) ? project.materialResults : []);
    setMaterialsQuery(project.materialsQuery || '');
    setQuickMaterialQuery((project.materialsQuery || '').split(' · ')[0] || '');
    setMaterialsCheckedAt(project.materialsCheckedAt || '');
    setMaterialSearchNotes(Array.isArray(project.materialsSearchNotes) ? project.materialsSearchNotes : []);
    setMaterialsSearchStatus(project.materialResults?.length ? 'ready' : 'idle');
    setTaskStatuses(project.taskStatuses || {});
    setQuantityEstimate(project.estimate || null);
    setFundingSnapshot(project.fundingSnapshot || null);
    setError('');
    setFileNotice('');
    setShowReport(false);
    if (showEditor) setActiveView('create');
    setModelReports(current => {
      const incoming = (project.modelReports || []).filter(isGeneratedModelReport);
      const byId = new Map<string, GeneratedModelReport>();
      for (const report of [...incoming, ...current]) if (isGeneratedModelReport(report)) byId.set(report.id, report);
      return [...byId.values()].slice(0, 12);
    });
    setProjectAutoSaveStatus('saved');
    setProjectStoreError('');
  }

  function startNewProject() {
    if (activeView !== 'create') {
      if (preview) URL.revokeObjectURL(preview);
      setMenuOpen(false);
      router.push('/new-project');
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setProjectId(null); setProjectNumber(''); setProjectCreatedAt(''); setProjectName(''); setProjectAddress(''); setProjectBudgetLimit('');
    setAssetType('building'); setGoal(''); setSelectedFiles([]); setFile(null); setPreview(''); setProjectLocation('');
    setKnowledgeContext(''); setFileNotice(''); setError(''); setAnalysis(null); setStage('idle'); setChatMessages([]); setChatInput('');
    setReportNumber(''); setMaterialsQuery(''); setQuickMaterialQuery(''); setMaterialResults([]); setMaterialsCheckedAt('');
    setMaterialsSearchStatus('idle'); setMaterialsSearchError(''); setMaterialStoreSearchLinks([]); setMaterialSearchNotes([]);
    setTaskStatuses({}); setQuantityEstimate(null); setFundingSnapshot(null); setShowReport(false); setProjectAutoSaveStatus('idle');
    setActiveView('create'); setMenuOpen(false); window.scrollTo({ top:0, behavior:'smooth' });
  }

  function openSavedProject(project: SavedProject) {
    hydrateProjectRecord(project);
    setMenuOpen(false);
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  function createSavedProjectSnapshot(): SavedProject | null {
    if (!projectId) return null;
    const now = new Date().toISOString();
    return {
      id: projectId, number: projectNumber || makeProjectNumber(new Date(projectCreatedAt || now)),
      name: projectName.trim() || 'Без име', address: projectAddress.trim(), region: projectLocation.trim(), assetType,
      goal: goal.trim(), budgetLimit: projectBudgetLimit.trim(), stage: analysis ? 'planned' : 'draft',
      createdAt: projectCreatedAt || now, updatedAt: now, analysis, reportNumber, chatMessages,
      knowledgeContext, attachments: selectedFiles.map(fileToProjectAttachment), materialsQuery, materialResults,
      materialsCheckedAt: materialsCheckedAt, materialsSearchNotes: materialSearchNotes, taskStatuses,
      estimate: quantityEstimate, fundingSnapshot,
      modelReports: modelReports.filter(report => report.projectId === projectId).map(report => report as unknown as Record<string, unknown>),
    };
  }

  useEffect(() => {
    // A refresh should always start at the top of the page, even after the last project is restored.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    const jumpToStart = () => window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    jumpToStart();
    const frame = window.requestAnimationFrame(jumpToStart);
    const timer = window.setTimeout(jumpToStart, 140);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (initialView !== 'create') return;
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    const timer = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [initialView]);

  useEffect(() => {
    if (initialView === 'create') {
      setProjectsHydrated(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const lastId = getLastProjectId();
        if (lastId) {
          const saved = await getProject(lastId);
          if (saved && !cancelled) hydrateProjectRecord(saved, false);
        }
      } catch (error) {
        console.warn('BuildAI project restore failed:', error);
        if (!cancelled) setProjectStoreError(error instanceof Error ? error.message : 'Не успях да заредя последния проект.');
      } finally {
        if (!cancelled) setProjectsHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, [initialView]);

  useEffect(() => {
    if (!projectsHydrated || !projectId) return;
    const snapshot = createSavedProjectSnapshot();
    if (!snapshot) return;
    setProjectAutoSaveStatus('saving');
    const timer = window.setTimeout(() => {
      void saveProject(snapshot).then(() => {
        setProjectAutoSaveStatus('saved');
        setProjectStoreError('');
        setSavedProjectsRefresh(value => value + 1);
      }).catch(error => {
        console.error('BuildAI project autosave failed:', error);
        setProjectAutoSaveStatus('error');
        setProjectStoreError(error instanceof Error ? error.message : 'Автоматичното запазване не успя. Изтегли резервно копие, ако е възможно.');
      });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [projectsHydrated, projectId, projectNumber, projectCreatedAt, projectName, projectAddress, projectBudgetLimit, assetType, goal, projectLocation, stage, analysis, reportNumber, chatMessages, knowledgeContext, selectedFiles, materialsQuery, materialResults, materialsCheckedAt, materialSearchNotes, taskStatuses, quantityEstimate, fundingSnapshot, modelReports]);

  useEffect(() => {
    if (!projectId) {
      try { localStorage.removeItem('buildai:current-project-context'); } catch { /* ignore */ }
      return;
    }
    const context = { projectId, projectNumber, projectName, address:projectAddress, region:projectLocation, goal, assetType, budget:projectBudgetLimit, estimate:quantityEstimate ? { areaM2:quantityEstimate.areaM2, workType:quantityEstimate.workType, wastePercent:quantityEstimate.wastePercent, lines:quantityEstimate.lines.slice(0, 12).map(line => ({ name:line.name, quantity:line.quantity, unit:line.unit, unitPrice:line.unitPrice, currency:line.currency, merchant:line.merchant, sourceUrl:line.sourceUrl })) } : null };
    try { localStorage.setItem('buildai:current-project-context', JSON.stringify(context)); } catch { /* iframe still receives postMessage below */ }
    const frame = generatorFrameRef.current?.contentWindow;
    if (frame) frame.postMessage({ type:'buildai:project-context', payload:context }, window.location.origin);
  }, [projectId, projectNumber, projectName, projectAddress, projectLocation, goal, assetType, projectBudgetLimit, quantityEstimate]);

  useEffect(() => {
    const history = chatHistoryRef.current;
    if (history) history.scrollTop = history.scrollHeight;
  }, [chatMessages, chatLoading]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/public-contacts-seed.json').then(async response => response.ok ? await response.json() as PublicContact[] : [] as PublicContact[]).catch(() => [] as PublicContact[]),
      loadSavedContacts(),
    ]).then(([seed, saved]) => {
      if (cancelled) return;
      const merged = new Map<string, PublicContact>();
      for (const contact of [...(Array.isArray(seed) ? seed : []), ...(Array.isArray(saved) ? saved : [])]) {
        if (!contact || typeof contact.name !== 'string' || !contact.name.trim()) continue;
        const key = `${contact.name.trim().toLocaleLowerCase('bg-BG')}|${(contact.email || contact.phone || '').trim().toLocaleLowerCase('bg-BG')}`;
        const prior = merged.get(key);
        merged.set(key, prior ? { ...prior, ...contact, verified: prior.verified || contact.verified } : contact);
      }
      setDirectoryContacts([...merged.values()]);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('buildai-3d-model-reports-v1');
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      setModelReports(current => { const merged = new Map<string, GeneratedModelReport>(); for (const report of [...(Array.isArray(parsed) ? parsed.filter(isGeneratedModelReport) : []), ...current]) if (isGeneratedModelReport(report)) merged.set(report.id, report); return [...merged.values()].slice(0, 12); });
    } catch (error) {
      console.warn('BuildAI: saved 3D reports could not be read.', error);
      setModelReports([]);
    } finally {
      setModelReportsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!modelReportsLoaded) return;
    try { localStorage.setItem('buildai-3d-model-reports-v1', JSON.stringify(modelReports.slice(0, 12))); }
    catch (error) { console.warn('BuildAI: saved 3D reports could not be written.', error); }
  }, [modelReports, modelReportsLoaded]);

  useEffect(() => {
    function syncReportsFromAnotherTab(event: StorageEvent) {
      if (event.key !== 'buildai-3d-model-reports-v1') return;
      try {
        const parsed: unknown = event.newValue ? JSON.parse(event.newValue) : [];
        setModelReports(Array.isArray(parsed) ? parsed.filter(isGeneratedModelReport).slice(0, 12) : []);
        setModelReportNotice('Докладите са синхронизирани от друг отворен раздел.');
      } catch (error) {
        console.warn('BuildAI: cross-tab report sync failed.', error);
      }
    }
    window.addEventListener('storage', syncReportsFromAnotherTab);
    return () => window.removeEventListener('storage', syncReportsFromAnotherTab);
  }, []);

  useEffect(() => {
    function closeMenu(event: MouseEvent) {
      if (menuRef.current && event.target instanceof Node && !menuRef.current.contains(event.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, []);

  useEffect(() => {
    function receiveGeneratorMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== generatorFrameRef.current?.contentWindow) return;
      if (!event.data || typeof event.data !== 'object') return;
      const message = event.data as { type?: unknown; payload?: unknown };
      if (message.type === 'buildai:building-generator:inquiry') {
        const payload = message.payload;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
        setGeneratorInquiry(payload as GeneratorInquiryPayload);
        setGeneratorContact({ name: '', email: '', phone: '', note: '' });
        return;
      }
      if (message.type === 'buildai:3d-model:report') {
        if (!isGeneratedModelReport(message.payload)) return;
        const previous = currentProjectId
          ? modelReports.filter(item => item.projectId === currentProjectId && (item.sceneMode || item.model.sceneMode) === (message.payload as GeneratedModelReport).sceneMode && item.id !== (message.payload as GeneratedModelReport).id).sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0]
          : undefined;
        const report: GeneratedModelReport = {
          ...message.payload,
          projectId: currentProjectId || undefined,
          projectNumber: currentProjectId ? projectNumber : undefined,
          projectName: currentProjectId ? (projectName || 'Без име') : undefined,
          designChanges: makeModelDesignChanges(message.payload, previous),
          estimateScenario: make3DEstimateScenario(quantityEstimate, message.payload),
          projectSnapshot: currentProjectId ? {
            address: projectAddress || undefined,
            goal: goal || undefined,
            budgetLimit: projectBudgetLimit || undefined,
            assetType,
            estimate: quantityEstimate ? {
              workType: quantityEstimate.workType,
              areaM2: quantityEstimate.areaM2,
              totals: calculateEstimateTotals(quantityEstimate),
              lines: quantityEstimate.lines.slice(0, 20).map(line => ({ name:line.name, quantity:line.quantity, unit:line.unit, unitPrice:line.unitPrice, currency:line.currency, merchant:line.merchant, sourceUrl:line.sourceUrl, priceSource:line.priceSource })),
            } : null,
          } : undefined,
        };
        setModelReports(current => [report, ...current.filter(item => item.id !== report.id)].slice(0, 12));
        setModelReportNotice(`„${report.title}“ е запазен${currentProjectId ? ` към проекта ${projectNumber}` : ''} в Доклади и 3D модели.`);
        return;
      }
      if (message.type === 'buildai:3d-model:open-reports') {
        const payload = message.payload;
        const id = payload && typeof payload === 'object' && !Array.isArray(payload) && typeof (payload as Record<string, unknown>).id === 'string'
          ? String((payload as Record<string, unknown>).id) : '';
        setActiveView('reports');
        setMenuOpen(false);
        const found = modelReports.find(report => report.id === id);
        if (found) setSelectedModelReport(found);
      }
    }
    window.addEventListener('message', receiveGeneratorMessage);
    return () => window.removeEventListener('message', receiveGeneratorMessage);
  }, [modelReports, currentProjectId, projectNumber, projectName, projectAddress, goal, projectBudgetLimit, assetType, quantityEstimate]);

  useEffect(() => {
    if (!showReport && !generatorInquiry && !selectedModelReport) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function closeReportOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') { setShowReport(false); setGeneratorInquiry(null); setSelectedModelReport(null); }
    }
    document.addEventListener('keydown', closeReportOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeReportOnEscape);
    };
  }, [showReport, generatorInquiry, selectedModelReport]);

  function updateTaskStatus(index: number, status: ProjectTaskStatus) { setTaskStatuses(current => ({ ...current, [String(index)]: status })); }

  function navigateTo(view: AppView, target?: string) {
    setActiveView(view);
    setMenuOpen(false);
    window.setTimeout(() => {
      if (target) document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 80);
  }

  function openCreatePage(target?: string) {
    setMenuOpen(false);
    if (activeView === 'create') {
      window.setTimeout(() => {
        if (target) document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 60);
      return;
    }
    router.push(target ? `/new-project#${target}` : '/new-project');
  }

  function openReportView() {
    if (activeView === 'create') navigateTo('create', analysis ? 'analysis-results' : 'workspace');
    else openCreatePage(analysis ? 'analysis-results' : 'workspace');
  }

  function openGeneratorMode(mode: GeneratorMode) {
    ensureCurrentProjectId();
    try { localStorage.removeItem('buildai:pending-3d-model'); } catch { /* local storage may be unavailable in a restricted browser */ }
    setGeneratorStartMode(mode);
    navigateTo('generator');
  }

  function openPlanInGenerator() {
    try { localStorage.setItem('buildai:open-plan', '1'); } catch { /* local storage may be unavailable in a restricted browser */ }
    const generatorWasAlreadyOpen = activeView === 'generator' && Boolean(generatorFrameRef.current?.contentWindow);
    openGeneratorMode('building');
    if (generatorWasAlreadyOpen) {
      try { localStorage.removeItem('buildai:open-plan'); } catch { /* ignore */ }
      window.setTimeout(() => {
        generatorFrameRef.current?.contentWindow?.postMessage({ type: 'buildai:open-plan' }, window.location.origin);
      }, 160);
    }
  }

  async function openModelReportInGenerator(report: GeneratedModelReport) {
    try {
      if (report.projectId && report.projectId !== projectId) {
        const owningProject = await getProject(report.projectId);
        if (owningProject) hydrateProjectRecord(owningProject);
      }
      localStorage.setItem('buildai:pending-3d-model', JSON.stringify(report));
      setGeneratorStartMode(normalizeGeneratorMode(report.sceneMode || report.model.sceneMode));
      setSelectedModelReport(null);
      navigateTo('generator');
    } catch (error) {
      console.error('Could not pass saved 3D model to generator.', error);
      setModelReportNotice('Не успях да отворя модела. Изтегли JSON файла и опитай отново.');
    }
  }

  function removeModelReport(reportId: string) {
    setModelReports(current => current.filter(report => report.id !== reportId));
    if (selectedModelReport?.id === reportId) setSelectedModelReport(null);
    setModelReportNotice('Докладът е премахнат от локалния списък.');
  }


  function isImageUpload(item: File): boolean {
    return ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'].includes(item.type) || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(item.name);
  }

  function isSupportedUpload(item: File): boolean {
    return isImageUpload(item) || /\.(pdf|docx|xlsx|csv|txt|md|json|pptx|html|htm|rtf|xml|log|yaml|yml|toml|ini|sql|py|js|ts|tsx|jsx|css|java|cs|php|sh)$/i.test(item.name);
  }

  function chooseFiles(list: FileList | File[] | undefined) {
    if (!list) return;
    const incoming = Array.from(list);
    if (!incoming.length) return;
    const merged = [...selectedFiles, ...incoming.filter(candidate => !selectedFiles.some(current => current.name === candidate.name && current.size === candidate.size && current.lastModified === candidate.lastModified))];
    if (merged.length > 10) { setError('Можеш да съхраниш до 10 файла в един анализ.'); return; }
    const rejected = merged.find(item => !isSupportedUpload(item));
    if (rejected) { setError(`Файлът „${rejected.name}“ е с неподдържан формат. Поддържат се JPG/PNG/WebP/GIF/BMP/AVIF, PDF, DOCX, XLSX, PPTX, CSV, текстови и често използвани програмни файлове.`); return; }
    const oversized = merged.find(item => item.size > (isImageUpload(item) ? 8 : 15) * 1024 * 1024);
    if (oversized) { setError(`Файлът „${oversized.name}“ е твърде голям. Максимумът е ${isImageUpload(oversized) ? '8 MB за снимка' : '15 MB за документ'}.`); return; }
    const totalSize = merged.reduce((sum, item) => sum + item.size, 0);
    if (totalSize > 40 * 1024 * 1024) { setError('Общият размер на файловете трябва да е до 40 MB.'); return; }
    const images = merged.filter(isImageUpload);
    if (images.length > 4) { setError('За един анализ можеш да включиш максимум 4 снимки. Избери до 4 снимки и още документи.'); return; }
    ensureCurrentProjectId();
    setError(''); setFileNotice(''); setKnowledgeContext(''); setAnalysis(null); setChatMessages([]); setChatInput(''); setShowReport(false); setReportNumber(''); setMaterialResults([]); setMaterialsCheckedAt(''); setMaterialsSearchStatus('idle'); setMaterialsSearchError(''); setMaterialSearchNotes([]);
    if (preview) URL.revokeObjectURL(preview);
    setSelectedFiles(merged);
    setFile(images[0] || null);
    setPreview(images[0] ? URL.createObjectURL(images[0]) : '');
  }

  function removeSelectedFile(index: number) {
    const next = selectedFiles.filter((_item, itemIndex) => itemIndex !== index);
    if (preview) URL.revokeObjectURL(preview);
    const images = next.filter(isImageUpload);
    setSelectedFiles(next); setFile(images[0] || null); setPreview(images[0] ? URL.createObjectURL(images[0]) : '');
    setKnowledgeContext(''); setFileNotice(''); setAnalysis(null); setChatMessages([]); setShowReport(false); setReportNumber(''); setMaterialResults([]); setMaterialsCheckedAt(''); setMaterialsSearchStatus('idle'); setMaterialsSearchError(''); setMaterialSearchNotes([]);
  }

  function resetProject() { startNewProject(); }

  async function runMaterialsSearch(queries: string[]) {
    const searchQueries = [...new Set(queries.map(item => item.trim()).filter(Boolean))].slice(0, 3);
    if (!searchQueries.length) return;
    setMaterialsQuery(searchQueries.join(' · '));
    setMaterialsSearchStatus('loading');
    setMaterialsSearchError('');
    setMaterialResults([]);
    setMaterialStoreSearchLinks([]);
    setMaterialSearchNotes([]);
    try {
      const response = await fetch('/api/materials/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: searchQueries, location: projectLocation.trim() }),
      });
      const payload = await readApiResponse(response);
      const rawResults = Array.isArray(payload.results) ? payload.results : [];
      const safeResults = rawResults.filter((item): item is MaterialOffer => Boolean(item && typeof item === 'object' && typeof (item as MaterialOffer).title === 'string' && typeof (item as MaterialOffer).url === 'string'));
      const links = Array.isArray(payload.storeSearchLinks) ? payload.storeSearchLinks as MaterialSearchResult['storeSearchLinks'] : [];
      const notes = Array.isArray(payload.notes) ? payload.notes.filter((item: unknown): item is string => typeof item === 'string') : [];
      setMaterialSearchNotes(notes);
      setMaterialResults(safeResults);
      setMaterialsCheckedAt(typeof payload.checkedAt === 'string' ? payload.checkedAt : new Date().toISOString());
      setMaterialStoreSearchLinks(links);
      setMaterialsSearchStatus('ready');
    } catch (reason) {
      setMaterialsSearchStatus('error');
      setMaterialsSearchError(reason instanceof Error ? reason.message : 'Неуспешно търсене на материали.');
      setMaterialStoreSearchLinks([]);
      setMaterialSearchNotes(['Проверените ценови данни не са налични за тази заявка. Използвай директните търсения в магазините и отвори продуктовата страница, за да потвърдиш цената.']);
    }
  }

  function acceptMaterialSearchResult(result: MaterialSearchResult) {
    setMaterialsQuery(result.query || result.queries.join(' · '));
    setMaterialResults(result.results);
    setMaterialsCheckedAt(result.checkedAt);
    setMaterialStoreSearchLinks(result.storeSearchLinks);
    setMaterialSearchNotes(result.notes || []);
    setMaterialsSearchStatus('ready');
    setMaterialsSearchError('');
  }

  async function submitQuickMaterialSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = quickMaterialQuery.trim();
    if (!query) return;
    await runMaterialsSearch([query]);
  }

  async function analyze() {
    ensureCurrentProjectId();
    if (!selectedFiles.length && goal.trim().length < 8) { setError('Качи снимка/документ или опиши задачата с поне няколко думи.'); return; }
    const effectiveGoal = goal.trim() || (assetType === 'interior'
      ? 'Предложи практични подобрения за интериора и подходящи материали.'
      : assetType === 'public_space'
        ? 'Предложи практичен план за подобряване на общественото пространство.'
        : 'Оцени обекта и предложи най-полезните подобрения.');
    setStage('analyzing'); setError(''); setFileNotice(''); setAnalysis(null); setChatMessages([]); setChatInput(''); setShowReport(false); setReportNumber(''); setMaterialResults([]); setMaterialsCheckedAt(''); setMaterialsSearchStatus('idle'); setMaterialsSearchError(''); setMaterialSearchNotes([]);
    try {
      const imageFiles = selectedFiles.filter(isImageUpload);
      const documentFiles = selectedFiles.filter(item => !isImageUpload(item));
      let extractedContext = '';
      if (documentFiles.length) {
        const ingestForm = new FormData();
        documentFiles.forEach(item => ingestForm.append('files', item));
        const ingestResponse = await fetch('/api/files/ingest', { method: 'POST', body: ingestForm });
        const ingestPayload = await readApiResponse(ingestResponse);
        extractedContext = typeof ingestPayload.context === 'string' ? ingestPayload.context : '';
        const ingestedCount = Array.isArray(ingestPayload.documents) ? ingestPayload.documents.length : 0;
        const ingestErrors = Array.isArray(ingestPayload.errors) ? (ingestPayload.errors as { name?: string; error?: string }[]).map(item => `${item.name || 'Файл'}: ${item.error || 'не беше обработен'}`).slice(0, 3).join(' ') : '';
        setFileNotice(`Обработени документи: ${ingestedCount}. Извлеченият текст ще бъде подаден като контекст на AI.${ingestErrors ? ` Част от файловете не са обработени: ${ingestErrors}` : ''}`);
        if (!extractedContext && !imageFiles.length) throw new Error('От документите не беше извлечен текст. Провери дали файловете не са сканирани изображения или защитени PDF документи.');
      }
      setKnowledgeContext(extractedContext);
      const form = new FormData();
      form.set('assetType', assetType); form.set('goal', effectiveGoal); form.set('location', projectLocation); form.set('context', extractedContext);
      for (const sourceImage of imageFiles) form.append('images', await prepareImageForAI(sourceImage));
      const response = await fetch('/api/analyze', { method: 'POST', body: form });
      const payload = await readApiResponse(response);
      if (!payload.analysis || typeof payload.analysis !== 'object') throw new Error('DeepSeek не върна анализ в очакваната структура. Опитай отново.');
      const result = payload.analysis as BuildAIAnalysis;
      setAnalysis(result);
      setTaskStatuses({});
      if (!goal.trim()) setGoal(effectiveGoal);
      const reportId = `BAI-RPT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      setReportNumber(reportId);
      setShowReport(false);
      const suggestedMaterialQueries = getMaterialQueries(result, effectiveGoal);
      setQuickMaterialQuery(suggestedMaterialQueries[0] || '');
      void runMaterialsSearch(suggestedMaterialQueries);
      const providers = recommendProviderContacts(directoryContacts, result, effectiveGoal, projectLocation);
      const providerOpening = providers.length
        ? `\n\nПотенциални фирми за проверка:\n${providers.slice(0, 3).map((item, index) => `${index + 1}. ${item.name} — ${item.category}. ${item.phone ? `Тел.: ${item.phone}. ` : ''}${item.email ? `Имейл: ${item.email}. ` : ''}${item.website ? `Сайт: ${item.website}` : `Източник: ${item.sourceUrl}`}`).join('\n')}\nТова са потенциални контакти от публични източници, не потвърдена оферта или гаранция за свободен капацитет.`
        : '\n\nНе открих точен изпълнител в каталога за този обхват. Отвори „Каталог фирми“ от падащото меню и провери по дейност/локация.';
      setChatMessages([{ role: 'assistant', content: makeChatOpening(result) + providerOpening }]);
      setStage('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Неуспешен анализ.'); setStage('idle');
    }
  }

  async function sendChatMessage() {
    const question = chatInput.trim();
    if (!question || !analysis || chatLoading) return;
    const nextHistory: ChatMessage[] = [...chatMessages, { role: 'user', content: question }];
    setChatMessages(nextHistory);
    setChatInput('');
    setChatLoading(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis,
          history: nextHistory,
          fileContext: knowledgeContext,
          contacts: [...recommendProviderContacts(directoryContacts, analysis, `${goal} ${question}`, projectLocation), ...selectRelevantContacts(directoryContacts, question, analysis)].filter((contact, index, all) => all.findIndex(other => other.id === contact.id) === index).slice(0, 15),
        }),
      });
      const payload = await readApiResponse(response);
      if (typeof payload.reply !== 'string' || !payload.reply.trim()) throw new Error('BuildAI не върна текстов отговор. Опитай с по-кратък въпрос.');
      setChatMessages(current => [...current, { role: 'assistant', content: payload.reply as string }]);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не успях да изпратя въпроса.';
      setChatMessages(current => [...current, { role: 'assistant', content: `Не успях да отговоря: ${message}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  function downloadGeneratorInquiry() {
    if (!generatorInquiry) return;
    if (!generatorContact.email.trim() && !generatorContact.phone.trim()) {
      window.alert('Попълни имейл или телефон за обратна връзка.');
      return;
    }
    const documentPayload = {
      application: 'BuildAI',
      inquiryType: 'Запитване за 3D модел на сграда',
      submittedAt: new Date().toISOString(),
      contact: generatorContact,
      generatorPayload: generatorInquiry,
      note: 'Вътрешно подготвен файл от BuildAI; не е изпратен автоматично до строителна фирма.'
    };
    const blob = new Blob([JSON.stringify(documentPayload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'buildai-building-inquiry.json'; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setGeneratorInquiry(null);
  }

  async function copyGeneratorInquirySummary() {
    if (!generatorInquiry) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify({ parameters: generatorInquiry, contact: generatorContact }, null, 2));
      window.alert('Обобщението е копирано.');
    } catch {
      window.alert('Копирането не е позволено от браузъра. Използвай „Изтегли запитването“.');
    }
  }

  const reportPhotos = useMemo(() => selectedFiles.filter(item => isImageUpload(item)), [selectedFiles]);
  const quickMaterialOffers = [...materialResults]
    .sort((a, b) => {
      const reliability: Record<MaterialOffer['priceSource'], number> = { 'product-page': 0, 'shopping-api': 1, 'search-snippet': 2, 'not-found': 3 };
      const score = reliability[a.priceSource] - reliability[b.priceSource];
      if (score !== 0) return score;
      if (a.price === null && b.price !== null) return 1;
      if (a.price !== null && b.price === null) return -1;
      return 0;
    })
    .slice(0, 3);
  const quickProviders = analysis ? recommendProviderContacts(directoryContacts, analysis, goal, projectLocation).slice(0, 2) : [];

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" onClick={event => { if (activeView !== 'workspace') { event.preventDefault(); navigateTo('workspace', 'top'); } }} aria-label="BuildAI начало">
          <span className="brand-mark brand-logo-mark"><img src="/buildai-logo-transparent.png" alt="" /></span>
          <span><strong>BuildAI</strong><small>BUILT ENVIRONMENT INTELLIGENCE</small></span>
        </a>
        <div className="app-menu-wrap" ref={menuRef}>
          <button type="button" className={`app-menu-trigger ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(value => !value)} aria-haspopup="menu" aria-expanded={menuOpen}>
            <Menu size={18} /><span>Инструменти</span><ChevronDown size={16} className={menuOpen ? 'menu-chevron rotated' : 'menu-chevron'} />
          </button>
          {menuOpen && <div className="app-menu-popover" role="menu" aria-label="Всички функции на BuildAI">
            <div className="app-menu-grid">
              <div className="app-menu-group">
                <div className="app-menu-label">ДОКЛАДИ</div>
                <button role="menuitem" onClick={openReportView}><span className="app-menu-icon"><Palette size={17} /></span><span><strong>AI резултат и доклад</strong><small>Пълен доклад за обекта</small></span></button>
                <button role="menuitem" onClick={() => navigateTo('reports')}><span className="app-menu-icon"><ClipboardList size={17} /></span><span><strong>Доклади и 3D модели</strong><small>{modelReports.length} запазени записа</small></span></button>
                <button role="menuitem" onClick={() => navigateTo('projects')}><span className="app-menu-icon"><ClipboardList size={17} /></span><span><strong>Моите проекти</strong><small>Архив и резервни копия</small></span></button>
              </div>
              <div className="app-menu-group">
                <div className="app-menu-label">3D STUDIO</div>
                <button role="menuitem" onClick={() => openGeneratorMode('building')}><span className="app-menu-icon"><BoxIcon size={17} /></span><span><strong>AI 3D генератор</strong><small>Сгради и обекти</small></span></button>
                <button role="menuitem" onClick={openPlanInGenerator}><span className="app-menu-icon"><FileText size={17} /></span><span><strong>Архитектурен план</strong><small>Чертеж · SVG / PDF / DXF</small></span></button>
                <button role="menuitem" onClick={() => openGeneratorMode('interior')}><span className="app-menu-icon"><HomeIcon size={17} /></span><span><strong>Интериорен 3D дизайн</strong><small>Стаи и обзавеждане</small></span></button>
                <button role="menuitem" onClick={() => openGeneratorMode('public-space')}><span className="app-menu-icon"><MapPin size={17} /></span><span><strong>Публичен терен 3D</strong><small>Парк, площад и алеи</small></span></button>
              </div>
              <div className="app-menu-group">
                <div className="app-menu-label">СПЕЦИАЛНИ</div>
                <button role="menuitem" onClick={() => navigateTo('estimate')}><span className="app-menu-icon"><Wallet size={17} /></span><span><strong>Количества и бюджет</strong><small>КСС и обща стойност</small></span></button>
                <button role="menuitem" onClick={() => navigateTo('contacts')}><span className="app-menu-icon"><UsersRound size={17} /></span><span><strong>Каталог фирми и специалисти</strong><small>{directoryContacts.length} записа</small></span></button>
                <button role="menuitem" onClick={() => navigateTo('funding')}><span className="app-menu-icon"><Euro size={17} /></span><span><strong>Европейско финансиране</strong><small>Провери подходящи програми</small></span></button>
                <button role="menuitem" onClick={() => navigateTo('materials')}><span className="app-menu-icon"><PackageSearch size={17} /></span><span><strong>Материали и цени</strong><small>Оферти и магазини</small></span></button>
              </div>
              <div className="app-menu-group">
                <div className="app-menu-label">РАБОТНА СРЕДА</div>
                <button role="menuitem" onClick={() => openCreatePage()}><span className="app-menu-icon"><HomeIcon size={17} /></span><span><strong>Нов проект и AI анализ</strong><small>Снимка или описание</small></span></button>
                <button role="menuitem" onClick={() => openCreatePage('upload-control')}><span className="app-menu-icon"><FileText size={17} /></span><span><strong>Качване на файлове</strong><small>Снимки и документи</small></span></button>
                <button role="menuitem" onClick={() => navigateTo('workspace', 'how')}><span className="app-menu-icon"><FileSearch size={17} /></span><span><strong>Как работи BuildAI</strong><small>Кратко ръководство</small></span></button>
              </div>
            </div>
          </div>}
        </div>
      </header>

      {activeView === 'workspace' && <section className="hero hero-compact" id="top">
        <div className="hero-copy" id="how">
          <div className="eyebrow"><Sparkles size={14} /> BUILDAI · НОВ ПРОЕКТ</div>
          <h1>От идея до план.<br /><span>Без излишни стъпки.</span></h1>
          <p className="hero-description">Опиши задачата или качи снимка. Ще получиш кратък план, подходящи изпълнители и цени.</p>
          <Link className="primary-link primary-link-large" href="/new-project">Започни проект <ArrowRight size={18} /></Link>
        </div>
      </section>}

      {activeView === 'create' && <section className="create-page-hero" aria-labelledby="create-page-title">
        <div>
          <div className="eyebrow"><Sparkles size={14} /> НОВ ПРОЕКТ</div>
          <h1 id="create-page-title">Създай своя проект.</h1>
          <p>Опиши обекта, качи снимки и документи. BuildAI ще подготви анализ, бюджет, материали, изпълнители и следващи стъпки.</p>
        </div>
        <Link className="secondary-button" href="/">← Обратно към началото</Link>
      </section>}

      {activeView === 'create' && <section className="workspace-section" id="workspace">
        <div className="section-heading section-heading-simple"><div><div className="eyebrow">НОВ ПРОЕКТ</div><h2>Какво искаш да направиш?</h2><p>Качи снимка или опиши задачата.</p></div><div className="workspace-label"><span className="status-dot" /> Стъпка 1 от 2 · {projectAutoSaveStatus === 'saved' ? 'Запазено' : projectAutoSaveStatus === 'error' ? 'Провери запазването' : 'Автозапазване'}</div></div>
        <div className="workspace-grid">
          <section className="panel input-panel input-panel-simple">
            <div className="panel-heading compact-panel-heading"><span className="step-number">01</span><div><h3>Опиши задачата</h3></div><span className={`project-autosave-pill ${projectAutoSaveStatus}`}>{projectAutoSaveStatus === 'saving' ? 'Запазвам…' : projectAutoSaveStatus === 'saved' ? 'Запазено' : projectAutoSaveStatus === 'error' ? 'Грешка при запазване' : 'Автозапазване'}</span></div>
            <div className="project-meta-fields">
              <label className="field-label" htmlFor="project-name">Име на проекта</label><input id="project-name" className="plain-field" value={projectName} onChange={event => { setProjectName(event.target.value); ensureCurrentProjectId(); }} maxLength={140} placeholder="Напр. Саниране на жилищна сграда" />
              {projectNumber && <p className="project-number-inline">{projectNumber} · {projectAutoSaveStatus === 'saved' ? 'Запазено' : 'Автозапазване'}</p>}
              {projectStoreError && <p className="project-store-error">{projectStoreError}</p>}
            </div>
            <label className="field-label" htmlFor="asset-type">Какъв е обектът?</label>
            <div className="asset-options asset-options-simple">{assetOptions.map(opt => <button type="button" className={`asset-option ${assetType === opt.id ? 'selected' : ''}`} onClick={() => { setAssetType(opt.id); ensureCurrentProjectId(); }} key={opt.id}><span className="radio-dot" /><span><strong>{opt.title}</strong></span></button>)}</div>
            <label className="field-label" htmlFor="goal">Какво трябва да се направи?</label>
            <textarea id="goal" value={goal} onChange={e => { setGoal(e.target.value); ensureCurrentProjectId(); }} rows={2} maxLength={500} placeholder="Напр. обнови фасадата, подобри достъпността и намери материали с добри цени…" />
            <label className="field-label" id="upload-control">Снимки и документи <span className="optional-label">по избор</span></label>
            <input ref={inputRef} className="visually-hidden" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif,.pdf,.docx,.xlsx,.pptx,.csv,.txt,.md,.json,.html,.htm,.rtf,.xml,.log,.yaml,.yml,.toml,.ini,.sql,.py,.js,.ts,.tsx,.jsx,.css,.java,.cs,.php,.sh" onChange={e => { chooseFiles(e.target.files || []); e.currentTarget.value = ''; }} />
            <button type="button" className={`upload-area upload-area-simple ${preview ? 'has-image' : ''}`} onClick={() => inputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); chooseFiles(e.dataTransfer.files); }}>
              {preview ? <><img src={preview} alt="Преглед на избраната снимка" /><span className="change-photo"><Upload size={15} /> Добави още</span></> : <><span className="upload-icon"><Upload size={19} /></span><strong>Добави снимки или файлове</strong><small>До 4 снимки и 6 документа · максимум 10 файла</small></>}
            </button>
            {reportPhotos.length > 0 && <div className="input-photo-gallery"><div className="input-photo-gallery-head"><strong>Снимки за анализа</strong><span>{reportPhotos.length} / 4</span></div><PhotoGallery files={reportPhotos} compact label="Снимка от обекта" /></div>}
            {selectedFiles.length > 0 && <div className="selected-files"><div className="selected-files-heading"><strong><FileText size={15} /> Прикачени файлове</strong><span>{selectedFiles.length}/10</span></div>{selectedFiles.map((item, index) => <div className="selected-file-row" key={`${item.name}-${item.size}-${index}`}><span className="selected-file-icon">{isImageUpload(item) ? <ImagePlus size={15} /> : <FileText size={15} />}</span><span className="selected-file-name"><strong>{item.name}</strong><small>{(item.size / 1024 / 1024).toFixed(2)} MB</small></span><button type="button" aria-label={`Премахни ${item.name}`} onClick={() => removeSelectedFile(index)}><X size={14} /></button></div>)}</div>}
            <details className="optional-fields project-extra-fields">
              <summary>Детайли за проекта <span>Адрес · бюджет · град</span></summary>
              <div className="optional-field-body">
                <div className="optional-field-group"><label className="field-label" htmlFor="project-address">Адрес на обекта</label><input id="project-address" className="plain-field" value={projectAddress} onChange={event => { setProjectAddress(event.target.value); if (!projectLocation) setProjectLocation(event.target.value); ensureCurrentProjectId(); }} maxLength={220} placeholder="Град, улица, номер или квартал" /></div>
                <div className="optional-field-group"><label className="field-label" htmlFor="project-budget-limit">Бюджет (по избор)</label><input id="project-budget-limit" className="plain-field" value={projectBudgetLimit} onChange={event => { setProjectBudgetLimit(event.target.value); ensureCurrentProjectId(); }} maxLength={80} placeholder="Напр. 25 000 €" /></div>
                <div className="optional-field-group"><label className="field-label" htmlFor="project-location">Град за фирми и доставка</label><input id="project-location" className="plain-field" value={projectLocation} onChange={e => { setProjectLocation(e.target.value); ensureCurrentProjectId(); }} maxLength={120} placeholder="Напр. Пазарджик" /></div>
                <p>Попълни само информацията, която имаш. Адресът и бюджетът не са задължителни за създаване на план.</p>
              </div>
            </details>
            {fileNotice && <div className="file-notice"><Check size={15} /> {fileNotice}</div>}
            {error && <div className="error-message"><CircleAlert size={16} /> {error}</div>}
            <button className="analyze-button" type="button" onClick={analyze} disabled={stage === 'analyzing'}>{stage === 'analyzing' ? <><LoaderCircle className="spin" size={18} /> Подготвям плана…</> : <><Sparkles size={18} /> Създай план <ArrowRight size={17} /></>}</button>
            <p className="privacy-note"><ShieldCheck size={14} /> Потвърди цените и техническите решения с доставчик или специалист.</p>
          </section>

          <section className="panel result-panel result-panel-simple" id="analysis-results">
            <div className="panel-heading compact-panel-heading"><span className="step-number">02</span><div><h3>Твоят план</h3></div>{analysis && <><span className="result-ready-pill"><Check size={13} /> Готов</span><button type="button" className="text-link-button new-plan-button" onClick={resetProject}>Нов план</button></>}</div>
            {!analysis ? <div className="empty-results empty-results-simple"><div className="empty-illustration"><ClipboardList size={32} /></div><h4>Планът ще се появи тук</h4><p>След анализа ще видиш основните стъпки, подходящи фирми и цени.</p></div> : <div className="analysis-content analysis-content-simple">
              <div className="summary-box summary-box-simple"><div className="summary-title"><Sparkles size={15} /> ПРЕПОРЪКА</div><p>{analysis.summary}</p></div>

              <div className="result-subhead"><h4>Следващи стъпки</h4><span>Първите {Math.min(3, analysis.actionPlan.length)}</span></div>
              <div className="steps-list steps-list-simple">{analysis.actionPlan.length ? analysis.actionPlan.slice(0, 3).map((step, index) => <article className="action-step" key={`${step.title}-${index}`}><div className="action-index">{String(index + 1).padStart(2, '0')}</div><div className="action-copy"><strong>{step.title}</strong><p>{step.description}</p><div className="professional"><Wrench size={14} /><span>{step.professional}</span></div></div></article>) : <p className="quick-provider-empty">Няма достатъчно данни за конкретни стъпки. Отвори доклада за наличната информация.</p>}</div>
              {analysis.actionPlan.length > 3 && <p className="more-in-report">Още {analysis.actionPlan.length - 3} стъпки са в пълния доклад.</p>}

              <section className="quick-prices" aria-label="Бързо търсене на цени">
                <div className="quick-section-title"><div><PackageSearch size={17} /><h4>Цени на материали</h4></div><span>{materialsSearchStatus === 'loading' ? 'Търся…' : materialResults.length ? `${materialResults.length} оферти` : 'Онлайн търсене'}</span></div>
                <form className="quick-price-search" onSubmit={submitQuickMaterialSearch}>
                  <input aria-label="Материал за търсене на цена" value={quickMaterialQuery} onChange={event => setQuickMaterialQuery(event.target.value)} placeholder="Напр. фасадна вата 10 см" maxLength={160} />
                  <button type="submit" disabled={!quickMaterialQuery.trim() || materialsSearchStatus === 'loading'}>{materialsSearchStatus === 'loading' ? <LoaderCircle size={16} className="spin" /> : <Search size={16} />} <span>Намери цена</span></button>
                </form>
                {materialsSearchStatus === 'loading' && <p className="quick-price-state"><LoaderCircle size={14} className="spin" /> Проверявам магазини…</p>}
                {materialsSearchStatus === 'error' && <p className="quick-price-state quick-price-error">Не успях да проверя цените сега. Опитай отново или отвори всички материали.</p>}
                {materialsSearchStatus !== 'loading' && quickMaterialOffers.length > 0 && <div className="quick-offer-list">{quickMaterialOffers.map(offer => <article className="quick-offer" key={offer.id}><div><strong>{offer.title}</strong><small>{offer.merchant} · {offer.unitLabel}</small><small className={`quick-price-source ${offer.priceSource === 'product-page' ? 'verified' : ''}`}>{offer.priceSource === 'product-page' ? 'Цена от продуктова страница' : offer.priceSource === 'shopping-api' ? 'Shopping индекс · потвърди' : offer.priceSource === 'search-snippet' ? 'Откъс от търсачка · потвърди' : 'Не е извлечена цена'}</small></div><div className="quick-offer-price">{offer.price === null ? 'Виж цена' : `${offer.price.toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${offer.currency === 'EUR' ? '€' : offer.currency === 'BGN' ? 'лв.' : offer.currency || ''}`}<a href={offer.url} target="_blank" rel="noopener noreferrer">Отвори ↗</a></div></article>)}</div>}
                {materialsSearchStatus === 'ready' && materialResults.length === 0 && <p className="quick-price-state">Няма точна оферта. Отвори директните търсения в магазините.</p>}
                <button type="button" className="text-link-button" onClick={() => navigateTo('materials')}>Всички оферти и магазини <ArrowRight size={15} /></button>
              </section>

              <section className="quick-providers">
                <div className="quick-section-title"><div><UsersRound size={17} /><h4>Кой може да го изпълни?</h4></div><button type="button" className="text-link-button" onClick={() => navigateTo('contacts')}>Цял каталог <ArrowRight size={14} /></button></div>
                {quickProviders.length ? <div className="quick-provider-list">{quickProviders.map(provider => <article className="quick-provider" key={provider.id}><div><strong>{provider.name}</strong><small>{provider.category}{provider.city ? ` · ${provider.city}` : ''}</small></div><div className="quick-provider-links">{provider.phone && <a href={`tel:${provider.phone.split(/[;,]/)[0].replace(/[^+0-9]/g, '')}`}>{provider.phone}</a>}{provider.website && <a href={provider.website} target="_blank" rel="noreferrer">Сайт ↗</a>}{!provider.website && provider.sourceUrl && <a href={provider.sourceUrl} target="_blank" rel="noreferrer">Източник ↗</a>}</div></article>)}</div> : <p className="quick-provider-empty">Няма подходящ запис в каталога. Провери по дейност и град.</p>}
              </section>

              <details className="quick-chat-details">
                <summary><MessageCircle size={16} /> Имаш въпрос? Попитай BuildAI</summary>
                <section className="chat-panel" aria-label="Разговор с BuildAI">
                  <div className="chat-header"><span className="chat-avatar"><Bot size={18} /></span><div className="chat-header-copy"><strong>Разговор с BuildAI</strong><span><i /> Попитай за плана, фирмите или цените</span></div></div>
                  <div ref={chatHistoryRef} className="chat-history" aria-live="polite" aria-relevant="additions">
                    {chatMessages.map((message, index) => <div className={`chat-row ${message.role}`} key={`${message.role}-${index}`}><span className="chat-message-avatar">{message.role === 'assistant' ? <Bot size={15} /> : <User size={15} />}</span><div className="chat-bubble"><div className="chat-sender">{message.role === 'assistant' ? 'BuildAI' : 'Ти'}</div><p>{message.content}</p></div></div>)}
                    {chatLoading && <div className="chat-row assistant"><span className="chat-message-avatar"><Bot size={15} /></span><div className="chat-bubble chat-thinking"><LoaderCircle size={15} className="spin" /> Подготвям отговор…</div></div>}
                  </div>
                  <div className="chat-suggestions"><button type="button" onClick={() => setChatInput('Кои са трите най-важни следващи стъпки?')}>Най-важните стъпки</button><button type="button" onClick={() => setChatInput('Кои специалисти трябва да потърся?')}>Специалисти</button><button type="button" onClick={() => setChatInput('Как да намеря по-добри цени на материалите?')}>По-добри цени</button></div>
                  <form className="chat-composer" onSubmit={event => { event.preventDefault(); void sendChatMessage(); }}><input aria-label="Съобщение към BuildAI" value={chatInput} onChange={event => setChatInput(event.target.value)} placeholder="Напиши въпрос…" maxLength={1200} disabled={chatLoading} /><button type="submit" aria-label="Изпрати съобщение" disabled={!chatInput.trim() || chatLoading}><Send size={17} /></button></form>
                </section>
              </details>

              <div className="result-actions result-actions-simple"><button className="report-print-button" onClick={() => setShowReport(true)}><FileText size={16} /> Отвори пълния доклад</button></div>
              <p className="professional-warning professional-warning-simple">Това е предварителен AI план. Потвърди размерите, цените и техническите решения на място.</p>
            </div>}
          </section>

        </div>
      </section>}

      {activeView === 'projects' && <ProjectManager refreshToken={savedProjectsRefresh} onSelect={openSavedProject} onNew={startNewProject} />}
      {activeView === 'estimate' && <QuantityEstimator initialEstimate={quantityEstimate} initialWorkType={inferEstimateWorkType(assetType, goal)} projectName={projectName} budgetLimit={projectBudgetLimit} region={projectLocation || projectAddress} onChange={setQuantityEstimate} />}
      {activeView === 'contacts' && <ContactDirectory onContactsChange={setDirectoryContacts} />}
      {activeView === 'funding' && <FundingFinder projectContext={{ projectId:projectId || undefined, projectNumber, name:projectName, address:projectAddress, description:goal, region:projectLocation || projectAddress, budget:projectBudgetLimit, assetType, estimate:quantityEstimate ? { workType:quantityEstimate.workType, areaM2:quantityEstimate.areaM2, totals:calculateEstimateTotals(quantityEstimate), lines:quantityEstimate.lines.slice(0, 12).map(line => ({ name:line.name, quantity:line.quantity, unit:line.unit, unitPrice:line.unitPrice, currency:line.currency, merchant:line.merchant, sourceUrl:line.sourceUrl })) } : undefined }} initialSnapshot={fundingSnapshot as unknown as Partial<FundingSnapshot> | null} onSnapshotChange={(snapshot) => setFundingSnapshot(snapshot as unknown as Record<string, unknown>)} />}
      {activeView === 'materials' && <MaterialsFinder initialQuery={materialsQuery} initialResults={materialResults} initialCheckedAt={materialsCheckedAt} initialStoreSearchLinks={materialStoreSearchLinks} initialNotes={materialSearchNotes} initialStatus={materialsSearchStatus} initialError={materialsSearchError} onResults={acceptMaterialSearchResult} />}
      {activeView === 'reports' && <section className="model-reports-page" aria-label="Доклади и 3D модели">
        <div className="model-reports-heading">
          <div><div className="eyebrow"><ClipboardList size={14} /> ЛИЧЕН АРХИВ</div><h1>Доклади и 3D модели</h1><p>Тук се запазват 3D моделите и техните доклади. Можеш да ги изтеглиш, да отвориш модела в 3D Studio и да изтеглиш архитектурен план.</p></div>
          <button type="button" className="primary-button" onClick={() => navigateTo('generator')}><BoxIcon size={16} /> Създай нов 3D модел</button>
        </div>
        {modelReportNotice && <div className="model-report-notice"><Check size={16} /> <span>{modelReportNotice}</span><button type="button" onClick={() => setModelReportNotice('')} aria-label="Затвори съобщението"><X size={15} /></button></div>}
        {analysis && <article className="current-analysis-report"><div className="current-analysis-icon"><FileText size={20} /></div><div><strong>Доклад за текущия обект</strong><p>{analysis.summary}</p><small>Номер: {reportNumber || 'BAI-RPT-DRAFT'}</small></div><button className="secondary-button" type="button" onClick={() => setShowReport(true)}>Отвори доклада</button></article>}
        {modelReports.length === 0 ? <div className="model-reports-empty"><div className="model-report-empty-icon"><BoxIcon size={28} /></div><h2>Все още няма запазени резултати</h2><p>Създай процедурен 3D модел и изтегли архитектурен план. Успешните резултати се добавят автоматично в този архив.</p><button className="primary-button" type="button" onClick={() => navigateTo('generator')}><Sparkles size={16} /> Отвори AI Studio</button></div> : null}{modelReports.length > 0 && <div className="model-reports-grid">
          {modelReports.map(report => <article className="model-report-card" key={report.id}>
            <button className="model-report-preview" type="button" onClick={() => setSelectedModelReport(report)} aria-label={`Преглед на ${report.title}`}>
              {report.previewDataUrl ? <img src={report.previewDataUrl} alt={`Преглед на модел ${report.title}`} /> : <span><BoxIcon size={34} /></span>}
            </button>
            <div className="model-report-card-content"><div className="model-report-card-top"><span className="model-report-type">{sceneModeLabel(report.sceneMode || report.model.sceneMode)} · {report.objectType || 'AI 3D модел'}</span><small>{formatReportDate(report.createdAt)}</small></div><h2>{report.title}</h2><p>{report.description || report.prompt || 'AI генериран процедурен модел.'}</p><div className="model-report-number">{report.reportNumber} · {report.model?.parts?.length || 0} компонента</div><div className="model-report-number">Стил: {modelStyleLabel(report.visualStyle || report.model.visualStyle)} · Детайлност: {modelDetailLabel(report.detailLevel || report.model.detailLevel)}</div><div className="model-report-card-actions"><button className="primary-button" type="button" onClick={() => openModelReportInGenerator(report)}><BoxIcon size={15} /> Отвори в 3D</button><button className="secondary-button" type="button" onClick={() => setSelectedModelReport(report)}><FileText size={15} /> Доклад</button><button className="icon-button danger-icon" type="button" aria-label="Изтрий доклада" title="Изтрий доклада" onClick={() => removeModelReport(report.id)}><X size={15} /></button></div></div>
          </article>)}
        </div>}
        <p className="model-reports-local-note">Докладите се пазят локално в браузъра на текущото устройство. Изтегляй нужните резултати за резервно копие.</p>
      </section>}
      {activeView === 'generator' && <section className="building-generator-page" aria-label="AI 3D генератор за обекти и сгради">
        <div className="building-generator-page-heading">
          <div><div className="eyebrow">AI · ПРОЦЕДУРЕН 3D МОДЕЛ</div><h1>3D генератор за сгради, интериори и публични терени</h1><p>Избери режим от менюто на генератора, качи снимка или напиши промпт, прегледай сцената в 3D и запази модела като доклад.</p></div>
          <a className="secondary-button" href="/building-generator.html" target="_blank" rel="noreferrer">Отвори самостоятелно ↗</a>
        </div>
        <iframe ref={generatorFrameRef} className="building-generator-frame" src={`/building-generator.html#mode=${generatorStartMode}`} title="BuildAI AI 3D генератор за сгради, интериори и публични терени" allow="clipboard-write" loading="eager" onLoad={() => { if (!generatorFrameRef.current?.contentWindow || !projectId) return; generatorFrameRef.current.contentWindow.postMessage({ type:'buildai:project-context', payload:{ projectId, projectNumber, projectName, address:projectAddress, region:projectLocation, goal, assetType, budget:projectBudgetLimit, estimate:quantityEstimate ? { areaM2:quantityEstimate.areaM2, workType:quantityEstimate.workType, wastePercent:quantityEstimate.wastePercent, lines:quantityEstimate.lines.slice(0, 12).map(line => ({ name:line.name, quantity:line.quantity, unit:line.unit, unitPrice:line.unitPrice, currency:line.currency, merchant:line.merchant, sourceUrl:line.sourceUrl })) } : null } }, window.location.origin); }} />
      </section>}

      {generatorInquiry && <div className="generator-inquiry-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setGeneratorInquiry(null); }}>
        <section className="generator-inquiry-modal" role="dialog" aria-modal="true" aria-labelledby="generator-inquiry-title">
          <header className="generator-inquiry-header"><div><div className="report-kicker"><BoxIcon size={15} /> BUILDAI · 3D ГЕНЕРАТОР</div><h2 id="generator-inquiry-title">Запитване за изработка на сграда</h2><p>Параметрите от 3D генератора са добавени. Попълни контакт за обратна връзка.</p></div><button className="report-close" type="button" aria-label="Затвори формата" onClick={() => setGeneratorInquiry(null)}><X size={19} /></button></header>
          <div className="generator-inquiry-summary">
            <div><span>Размери</span><strong>{String((generatorInquiry.dimensions as Record<string, unknown> | undefined)?.lengthM ?? '—')} × {String((generatorInquiry.dimensions as Record<string, unknown> | undefined)?.widthM ?? '—')} м</strong></div>
            <div><span>Етажи</span><strong>{String((generatorInquiry.dimensions as Record<string, unknown> | undefined)?.floors ?? '—')}</strong></div>
            <div><span>РЗП</span><strong>{Number((generatorInquiry.calculated as Record<string, unknown> | undefined)?.grossFloorAreaM2 ?? 0).toLocaleString('bg-BG')} м²</strong></div>
            <div><span>Ориентир</span><strong>{Number((generatorInquiry.calculated as Record<string, unknown> | undefined)?.indicativePriceEUR ?? 0).toLocaleString('bg-BG')} €</strong></div>
          </div>
          <div className="generator-inquiry-form">
            <label>Име<input value={generatorContact.name} onChange={event => setGeneratorContact(current => ({ ...current, name: event.target.value }))} placeholder="Име за контакт" maxLength={100} /></label>
            <div className="two-col"><label>Имейл<input type="email" value={generatorContact.email} onChange={event => setGeneratorContact(current => ({ ...current, email: event.target.value }))} placeholder="name@example.com" maxLength={200} /></label><label>Телефон<input value={generatorContact.phone} onChange={event => setGeneratorContact(current => ({ ...current, phone: event.target.value }))} placeholder="Телефон за връзка" maxLength={60} /></label></div>
            <label>Допълнителни изисквания<textarea rows={3} value={generatorContact.note} onChange={event => setGeneratorContact(current => ({ ...current, note: event.target.value }))} placeholder="Срок, местоположение, желания към проекта…" maxLength={1500} /></label>
          </div>
          <p className="generator-inquiry-note">Това демо подготвя файл с параметрите и контакта. Автоматично изпращане до фирма не е настроено — за него е нужен реален фирмен имейл или backend endpoint.</p>
          <footer className="generator-inquiry-footer"><button type="button" className="secondary-button" onClick={() => void copyGeneratorInquirySummary()}><Copy size={15} /> Копирай обобщение</button><button type="button" className="primary-button" onClick={downloadGeneratorInquiry}><Download size={15} /> Изтегли запитването (.json)</button></footer>
        </section>
      </div>}

      {selectedModelReport && <div className="report-modal-backdrop model-report-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedModelReport(null); }}>
        <section className="report-modal model-report-modal" role="dialog" aria-modal="true" aria-labelledby="model-report-title">
          <header className="report-modal-header"><div className="report-modal-heading-copy"><div className="report-kicker"><BoxIcon size={15} /> BUILDAI · 3D ДОКЛАД</div><h2 id="model-report-title">{selectedModelReport.title}</h2><p>{selectedModelReport.objectType} · {formatReportDate(selectedModelReport.createdAt)}</p></div><button className="report-close" type="button" aria-label="Затвори доклада" onClick={() => setSelectedModelReport(null)}><X size={19} /></button></header>
          <div className="report-meta-grid"><div><span>Вътрешен номер</span><strong>{selectedModelReport.reportNumber}</strong></div><div><span>Тип проект</span><strong>{sceneModeLabel(selectedModelReport.sceneMode || selectedModelReport.model.sceneMode)}</strong></div><div><span>Геометрични части</span><strong>{selectedModelReport.model.parts.length}</strong></div><div><span>Визуален стил</span><strong>{modelStyleLabel(selectedModelReport.visualStyle || selectedModelReport.model.visualStyle)}</strong></div><div><span>Детайлност</span><strong>{modelDetailLabel(selectedModelReport.detailLevel || selectedModelReport.model.detailLevel)}</strong></div><div><span>Начин на създаване</span><strong>{selectedModelReport.sourceImageName ? 'Снимка + промпт' : 'Текстов промпт'}</strong></div><div><span>Състояние</span><strong>Концептуален модел</strong></div></div>
          {selectedModelReport.projectSnapshot && <section className="linked-design-snapshot"><h3><Wallet size={16} /> Свързан строителен проект</h3><p><strong>Проект:</strong> {selectedModelReport.projectName || 'Без име'}{selectedModelReport.projectNumber ? ` · ${selectedModelReport.projectNumber}` : ''}</p>{selectedModelReport.projectSnapshot.address && <p><strong>Адрес:</strong> {selectedModelReport.projectSnapshot.address}</p>}{selectedModelReport.projectSnapshot.goal && <p><strong>Цел:</strong> {selectedModelReport.projectSnapshot.goal}</p>}{selectedModelReport.projectSnapshot.budgetLimit && <p><strong>Зададен бюджет:</strong> {selectedModelReport.projectSnapshot.budgetLimit}</p>}{selectedModelReport.projectSnapshot.estimate && <><div className="report-meta-grid"><div><span>Площ в КСС</span><strong>{Number(selectedModelReport.projectSnapshot.estimate.areaM2 || 0).toLocaleString('bg-BG')} m²</strong></div><div><span>Материали с цена</span><strong>{selectedModelReport.projectSnapshot.estimate.totals.materialEur.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} €</strong></div><div><span>Ориентир с наличните цени</span><strong>{selectedModelReport.projectSnapshot.estimate.totals.grand.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} €</strong></div><div><span>Позиции без цена</span><strong>{selectedModelReport.projectSnapshot.estimate.totals.unpricedLines}</strong></div></div><div className="estimate-report-lines">{selectedModelReport.projectSnapshot.estimate.lines.slice(0,10).map((line,index) => <div key={`${line.name}-${index}`}><span><strong>{line.name}</strong><small>{line.quantity.toLocaleString('bg-BG',{maximumFractionDigits:2})} {line.unit} · {line.priceSource === 'product-page' ? 'продуктова страница' : line.priceSource === 'manual' ? 'ръчна цена' : line.unitPrice == null ? 'без цена' : 'индексиран резултат'}</small></span><span>{line.unitPrice == null ? '—' : `${line.unitPrice.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} ${line.currency}`}{line.sourceUrl && <a href={line.sourceUrl} target="_blank" rel="noreferrer">Източник ↗</a>}</span></div>)}</div><p className="report-note">Тази сметка е моментна снимка при генерирането на модела. Промяна в концептуалната геометрия не променя автоматично количествата, защото моделът не е мащабиран технически чертеж. Потвърди измерванията и актуализирай КСС, преди да използваш сумите за поръчка.</p></>}</section>}
          <div className="report-modal-body model-report-detail-body">
            {selectedModelReport.previewDataUrl && <img className="model-report-detail-preview" src={selectedModelReport.previewDataUrl} alt={`3D преглед на ${selectedModelReport.title}`} />}
            <section className="report-section"><h3><Sparkles size={16} /> Описание</h3><p>{selectedModelReport.description || 'Няма допълнително описание.'}</p><div className="report-goal"><strong>Промпт</strong><span>{selectedModelReport.prompt || 'Автоматично разпознаване по снимка.'}</span></div>{selectedModelReport.sourceImageName && <p className="report-note">Референтна снимка: {selectedModelReport.sourceImageName}</p>}</section>
            <section className="report-section"><h3><ImagePlus size={16} /> Разпознаване от AI</h3><p>{selectedModelReport.imageRecognition || 'Не е налично.'}</p><p className="report-note">{selectedModelReport.scaleNote || 'Моделът е концептуален и не е в гарантиран метричен мащаб.'}</p></section>
            {selectedModelReport.model.dimensions && <section className="report-section"><h3><BoxIcon size={16} /> Габарити на 3D модела</h3><div className="report-meta-grid"><div><span>Ширина X</span><strong>{selectedModelReport.model.dimensions.width.toLocaleString('bg-BG',{maximumFractionDigits:2})} {selectedModelReport.model.dimensions.unit === 'm' ? 'm' : 'условни ед.'}</strong></div><div><span>Височина Y</span><strong>{selectedModelReport.model.dimensions.height.toLocaleString('bg-BG',{maximumFractionDigits:2})} {selectedModelReport.model.dimensions.unit === 'm' ? 'm' : 'условни ед.'}</strong></div><div><span>Дълбочина Z</span><strong>{selectedModelReport.model.dimensions.depth.toLocaleString('bg-BG',{maximumFractionDigits:2})} {selectedModelReport.model.dimensions.unit === 'm' ? 'm' : 'условни ед.'}</strong></div><div><span>Калибрация</span><strong>{selectedModelReport.model.dimensions.isCalibrated ? 'X е калибрирана' : 'Не е калибриран'}</strong></div></div><p className="report-note">Калибрацията задава само известната ширина X; височината и дълбочината са пропорционални оценки от концептуалната геометрия. DXF експортът е параметричен контур на сграда, не е BIM/IFC проект.</p></section>}
            {selectedModelReport.designChanges && <section className="report-section"><h3><ClipboardList size={16} /> Промени в 3D концепцията</h3>{selectedModelReport.designChanges.previousReportNumber && <p className="report-note">Сравнение с предходната версия: {selectedModelReport.designChanges.previousReportNumber}.</p>}{selectedModelReport.designChanges.items.length ? <div className="estimate-report-lines">{selectedModelReport.designChanges.items.map(item=><div key={item.category}><span><strong>{item.category}</strong><small>{item.before} преди → {item.after} сега</small></span><strong className={item.delta>0?'design-delta-positive':item.delta<0?'design-delta-negative':''}>{item.delta>0?'+':''}{item.delta}</strong></div>)}</div> : <p>Не са открити промени в броя на семантичните части спрямо предходната версия.</p>}<p className="report-note">Броят на компонентите показва промяна в концепцията, но сам по себе си не доказва количество материал.</p></section>}
            {selectedModelReport.estimateScenario && <section className="report-section"><h3><Calculator size={16} /> Сценарий за промяна на площта и бюджета</h3><div className="report-meta-grid"><div><span>Площ в текущата КСС</span><strong>{selectedModelReport.estimateScenario.currentAreaM2.toLocaleString('bg-BG',{maximumFractionDigits:2})} m²</strong></div><div><span>Площ по пропорциите на 3D</span><strong>{selectedModelReport.estimateScenario.proposedAreaM2.toLocaleString('bg-BG',{maximumFractionDigits:2})} m²</strong></div><div><span>Сегашен бюджетен ориентир</span><strong>{selectedModelReport.estimateScenario.currentTotalEur.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} €</strong></div><div><span>Сценарен ориентир</span><strong>{selectedModelReport.estimateScenario.proposedTotalEur.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} €</strong></div><div><span>Разлика в ориентировъчната сума</span><strong className={selectedModelReport.estimateScenario.deltaEur>0?'design-delta-negative':'design-delta-positive'}>{selectedModelReport.estimateScenario.deltaEur>0?'+':''}{selectedModelReport.estimateScenario.deltaEur.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} €</strong></div></div><div className="estimate-report-lines">{selectedModelReport.estimateScenario.rows.map((row,index)=><div key={`${row.name}-${index}`}><span><strong>{row.name}</strong><small>{row.hasPrice?'има цена за единица':'липсва цена'} · {row.unit}</small></span><span>{row.before.toLocaleString('bg-BG',{maximumFractionDigits:2})} → {row.after.toLocaleString('bg-BG',{maximumFractionDigits:2})}</span></div>)}</div><p className="report-note">{selectedModelReport.estimateScenario.caution}</p><button type="button" className="secondary-button" onClick={() => { setSelectedModelReport(null); navigateTo('estimate'); }}>Провери и актуализирай КСС</button></section>}
            {selectedModelReport.model.dimensions && <section className="report-section"><h3><BoxIcon size={16} /> Габарити на 3D модела</h3><div className="report-meta-grid"><div><span>Ширина X</span><strong>{selectedModelReport.model.dimensions.width.toLocaleString('bg-BG',{maximumFractionDigits:2})} {selectedModelReport.model.dimensions.unit === 'm' ? 'm' : 'условни ед.'}</strong></div><div><span>Височина Y</span><strong>{selectedModelReport.model.dimensions.height.toLocaleString('bg-BG',{maximumFractionDigits:2})} {selectedModelReport.model.dimensions.unit === 'm' ? 'm' : 'условни ед.'}</strong></div><div><span>Дълбочина Z</span><strong>{selectedModelReport.model.dimensions.depth.toLocaleString('bg-BG',{maximumFractionDigits:2})} {selectedModelReport.model.dimensions.unit === 'm' ? 'm' : 'условни ед.'}</strong></div><div><span>Калибрация</span><strong>{selectedModelReport.model.dimensions.isCalibrated ? 'X е калибрирана' : 'Не е калибриран'}</strong></div></div><p className="report-note">Калибрацията задава само известната ширина X; височината и дълбочината са пропорционални оценки от концептуалната геометрия. DXF експортът е параметричен контур на сграда, не е BIM/IFC проект.</p></section>}
            {selectedModelReport.designChanges && <section className="report-section"><h3><ClipboardList size={16} /> Промени в 3D концепцията</h3>{selectedModelReport.designChanges.previousReportNumber && <p className="report-note">Сравнение с предходната версия: {selectedModelReport.designChanges.previousReportNumber}.</p>}{selectedModelReport.designChanges.items.length ? <div className="estimate-report-lines">{selectedModelReport.designChanges.items.map(item=><div key={item.category}><span><strong>{item.category}</strong><small>{item.before} преди → {item.after} сега</small></span><strong className={item.delta>0?'design-delta-positive':item.delta<0?'design-delta-negative':''}>{item.delta>0?'+':''}{item.delta}</strong></div>)}</div> : <p>Не са открити промени в броя на семантичните части спрямо предходната версия.</p>}<p className="report-note">Броят на компонентите показва промяна в концепцията, но сам по себе си не доказва количество материал.</p></section>}
            {selectedModelReport.estimateScenario && <section className="report-section"><h3><Calculator size={16} /> Сценарий за промяна на площта и бюджета</h3><div className="report-meta-grid"><div><span>Площ в текущата КСС</span><strong>{selectedModelReport.estimateScenario.currentAreaM2.toLocaleString('bg-BG',{maximumFractionDigits:2})} m²</strong></div><div><span>Площ по пропорциите на 3D</span><strong>{selectedModelReport.estimateScenario.proposedAreaM2.toLocaleString('bg-BG',{maximumFractionDigits:2})} m²</strong></div><div><span>Сегашен бюджетен ориентир</span><strong>{selectedModelReport.estimateScenario.currentTotalEur.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} €</strong></div><div><span>Сценарен ориентир</span><strong>{selectedModelReport.estimateScenario.proposedTotalEur.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} €</strong></div><div><span>Разлика в ориентировъчната сума</span><strong className={selectedModelReport.estimateScenario.deltaEur>0?'design-delta-negative':'design-delta-positive'}>{selectedModelReport.estimateScenario.deltaEur>0?'+':''}{selectedModelReport.estimateScenario.deltaEur.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} €</strong></div></div><div className="estimate-report-lines">{selectedModelReport.estimateScenario.rows.map((row,index)=><div key={`${row.name}-${index}`}><span><strong>{row.name}</strong><small>{row.hasPrice?'има цена за единица':'липсва цена'} · {row.unit}</small></span><span>{row.before.toLocaleString('bg-BG',{maximumFractionDigits:2})} → {row.after.toLocaleString('bg-BG',{maximumFractionDigits:2})}</span></div>)}</div><p className="report-note">{selectedModelReport.estimateScenario.caution}</p><button type="button" className="secondary-button" onClick={() => { setSelectedModelReport(null); navigateTo('estimate'); }}>Провери и актуализирай КСС</button></section>}
            <section className="report-section"><h3><BoxIcon size={16} /> Състав на модела</h3><div className="model-report-parts-list">{selectedModelReport.model.parts.slice(0, 64).map((part, index) => <div key={`${part.name || part.shape}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><strong>{part.name || part.shape}</strong><small>{part.shape} · {part.color || 'цветът не е посочен'}</small></div>)}</div></section>
          </div>
          <footer className="report-modal-footer"><span>Вътрешен номер на доклада; не е технически или сертифициран проект.</span><div className="report-actions"><button type="button" className="secondary-button" onClick={() => downloadModelReport(selectedModelReport)}><Download size={15} /> Изтегли JSON</button><button type="button" className="secondary-button" onClick={() => window.print()}><FileText size={15} /> PDF / Печат</button><button type="button" className="report-print-button" onClick={() => openModelReportInGenerator(selectedModelReport)}><BoxIcon size={15} /> Отвори в 3D</button></div></footer>
        </section>
      </div>}

      {showReport && analysis && <div className="report-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowReport(false); }}>
        <section className="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title">
          <header className="report-modal-header">
            <div className="report-modal-heading-copy">
              <div className="report-kicker"><FileText size={15} /> BUILDAI · ДОКЛАД ЗА ОБЕКТ</div>
              <h2 id="report-title">Докладът е готов</h2>
              <p>Прегледай предварителния анализ, предложените действия и възможните изпълнители.</p>
            </div>
            <button className="report-close" type="button" aria-label="Затвори доклада" onClick={() => setShowReport(false)}><X size={19} /></button>
          </header>
          <div className="report-meta-grid">
            <div><span>Проект</span><strong>{projectName || 'Нов строителен проект'}</strong></div>
            <div><span>Номер на проекта</span><strong>{projectNumber || 'Ще се присвои при запазване'}</strong></div>
            <div><span>Доклад</span><strong>{reportNumber || 'BAI-RPT-DRAFT'}</strong></div>
            <div><span>Тип обект</span><strong>{assetOptions.find(option => option.id === analysis.assetType)?.title || 'Обект'}</strong></div>
            <div><span>Адрес</span><strong>{projectAddress || projectLocation.trim() || 'Не е посочен'}</strong></div>
            <div><span>Бюджет</span><strong>{projectBudgetLimit || 'Не е зададен'}</strong></div>
            <div><span>Дата на анализа</span><strong>{new Date().toLocaleDateString('bg-BG')}</strong></div>
          </div>
          <div className="report-modal-body">
            {reportPhotos.length > 0 && <section className="report-photo-section" aria-label="Снимки от обекта">
              <div className="report-photo-heading"><div><span className="report-kicker"><ImagePlus size={15} /> ФОТОГАЛЕРИЯ</span><h3>Снимки от обекта</h3></div><span>{reportPhotos.length} {reportPhotos.length === 1 ? 'снимка' : 'снимки'} · натисни за голям изглед</span></div>
              <PhotoGallery files={reportPhotos} label="Снимка от обекта" />
            </section>}
            <section className="report-section">
              <h3><Sparkles size={16} /> Обобщение</h3>
              <p>{analysis.summary}</p>
              <div className="report-goal"><strong>Желано подобрение</strong><span>{goal}</span></div>
            </section>
            <section className="report-section">
              <h3><ClipboardList size={16} /> Видими наблюдения</h3>
              <div className="report-finding-list">{analysis.observations.map((item, index) => <article className="report-finding" key={`${item.issue}-report-${index}`}><span className="report-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{item.issue}</strong><p>{item.evidence}</p></div><small>{item.confidence === 'high' ? 'Висока увереност' : item.confidence === 'medium' ? 'Средна увереност' : 'Ниска увереност'}</small></article>)}</div>
            </section>
            <section className="report-section">
              <h3><Wrench size={16} /> План за изпълнение</h3>
              <div className="report-steps">{analysis.actionPlan.map((step, index) => <article className="report-step" key={`${step.title}-report-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{step.title}</strong><p>{step.description}</p><small>Подходящ специалист: {step.professional}</small>{step.materials?.length > 0 && <small>Възможни материали: {step.materials.join(', ')}</small>}<label className="report-task-status">Статус на задачата<select value={taskStatuses[String(index)] || 'pending'} onChange={event => updateTaskStatus(index, event.target.value as ProjectTaskStatus)}><option value="pending">Предстои</option><option value="in_progress">В процес</option><option value="done">Завършена</option></select></label></div></article>)}</div>
            </section>
            <section className="report-section report-materials-section">
              <h3><PackageSearch size={16} /> Материали и онлайн цени</h3>
              <p>Търсени материали: {materialsQuery || 'изведени от плана за действие'}. Цените, прочетени от продуктова страница, са обозначени отделно от индексираните откъси; потвърди цена, разфасовка и наличност в оригиналната оферта.</p>
              <MaterialsResults results={materialResults} checkedAt={materialsCheckedAt} status={materialsSearchStatus} error={materialsSearchError} storeSearchLinks={materialStoreSearchLinks} query={materialsQuery} notes={materialSearchNotes} compact />
            </section>
            {quantityEstimate && <section className="report-section project-estimate-report">
              <h3><Wallet size={16} /> Количествено-стойностна сметка</h3>
              {(() => { const totals = calculateEstimateTotals(quantityEstimate); return <><div className="report-meta-grid"><div><span>Вид работа</span><strong>{({ 'facade-insulation':'Фасадна изолация', 'interior-paint':'Боядисване', flooring:'Подова настилка', roof:'Покрив', 'public-paving':'Публична настилка' } as Record<string,string>)[quantityEstimate.workType] || quantityEstimate.workType}</strong></div><div><span>Площ</span><strong>{quantityEstimate.areaM2.toLocaleString('bg-BG')} m²</strong></div><div><span>Материали с цена</span><strong>{totals.materialEur.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} €</strong></div><div><span>Общ ориентир</span><strong>{totals.grand.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} €</strong></div></div><div className="estimate-report-lines">{quantityEstimate.lines.map(line => { const lineTotal = line.unitPrice == null ? null : line.quantity * line.unitPrice * (line.currency === 'BGN' ? 1/1.95583 : line.currency === 'EUR' ? 1 : 0); return <div key={line.id}><span><strong>{line.name}</strong><small>{line.quantity.toLocaleString('bg-BG',{maximumFractionDigits:2})} {line.unit}{line.priceSource === 'manual' ? ' · ръчна цена' : line.priceSource === 'product-page' ? ' · продуктова страница' : line.unitPrice != null ? ' · индексирана цена' : ' · липсва цена'}</small></span><span>{lineTotal == null ? '—' : `${lineTotal.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} €`}{line.sourceUrl && <a href={line.sourceUrl} target="_blank" rel="noreferrer">Източник ↗</a>}</span></div>})}</div><p className="report-note">Включени са само материалните позиции с цени в EUR/BGN. Непотвърдените позиции се показват без сума. Коефициентите са ориентировъчни; измерванията, спецификациите и офертите трябва да се проверят.</p></> })()}
              <button type="button" className="secondary-button" onClick={() => { setShowReport(false); navigateTo('estimate'); }}><Calculator size={15} /> Отвори и редактирай КСС</button>
            </section>}
            {fundingSnapshot && <section className="report-section project-funding-report">
              <h3><Euro size={16} /> Европейско финансиране</h3>
              <p><strong>Описание:</strong> {typeof fundingSnapshot.description === 'string' ? fundingSnapshot.description : goal}</p>
              <p><strong>Кандидат:</strong> {typeof fundingSnapshot.applicant === 'string' ? fundingSnapshot.applicant : 'Не е уточнен'} · <strong>Регион:</strong> {typeof fundingSnapshot.region === 'string' ? fundingSnapshot.region : projectLocation || 'Не е уточнен'} · <strong>Бюджет:</strong> {typeof fundingSnapshot.budget === 'string' ? fundingSnapshot.budget : projectBudgetLimit || 'Не е посочен'}</p>
              {typeof fundingSnapshot.searchedAt === 'string' && <p className="report-note">Последно търсене: {new Date(fundingSnapshot.searchedAt).toLocaleString('bg-BG')}</p>}
              {typeof fundingSnapshot.advice === 'string' && <p>{fundingSnapshot.advice}</p>}
              {Array.isArray(fundingSnapshot.opportunities) && fundingSnapshot.opportunities.length > 0 ? <div className="funding-report-list">{(fundingSnapshot.opportunities as FundingOpportunity[]).slice(0,8).map(call => <article key={`${call.id}-${call.url}`}><div><strong>{call.title}</strong><small>{call.identifier} · {call.status} · {call.deadline || 'Краен срок за проверка'}</small><p>{call.assessment?.fitReason || 'Допустимостта трябва да се провери в пълните официални насоки.'}</p>{call.assessment?.gaps?.length ? <small>Неясноти: {call.assessment.gaps.slice(0,3).join('; ')}</small> : null}</div><a href={call.url} target="_blank" rel="noreferrer">Официална покана ↗</a></article>)}</div> : <p className="report-note">Все още няма съхранени резултати от официалната търсачка. Отвори менюто „Европейско финансиране“ и направи търсене за този проект.</p>}
            </section>}
            <section className="report-section project-linked-models-report">
              <h3><BoxIcon size={16} /> Свързани 3D модели</h3>
              {modelReports.filter(report => projectId && report.projectId === projectId).length ? <div className="linked-model-reports">{modelReports.filter(report => projectId && report.projectId === projectId).map(model => <article key={model.id}><div><strong>{model.title}</strong><small>{sceneModeLabel(model.sceneMode || model.model.sceneMode)} · {model.reportNumber} · {formatReportDate(model.createdAt)}</small><p>{model.description || model.prompt}</p></div><button className="secondary-button" type="button" onClick={() => { setShowReport(false); void openModelReportInGenerator(model); }}><BoxIcon size={14} /> Отвори в 3D</button></article>)}</div> : <p className="report-note">Няма още 3D модел, свързан с този проект. Създай го от „AI 3D генератор“ — той ще бъде добавен към проекта и доклада.</p>}
            </section>
            <section className="report-section">
              <h3><UsersRound size={16} /> Потенциални изпълнители</h3>
              <div className="report-providers">{recommendProviderContacts(directoryContacts, analysis, goal, projectLocation).slice(0, 5).map((provider, index) => <article className="report-provider" key={`${provider.id}-report`}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{provider.name}</strong><small>{provider.category}{provider.city ? ` · ${provider.city}` : ''}</small><div>{provider.phone && <a href={`tel:${provider.phone.split(/[;,]/)[0].replace(/[^+0-9]/g, '')}`}>{provider.phone}</a>}{provider.email && <a href={`mailto:${provider.email.split(';')[0].trim()}`}>{provider.email.split(';')[0].trim()}</a>}{provider.website && <a href={provider.website} target="_blank" rel="noreferrer">Официален сайт ↗</a>}{!provider.website && provider.sourceUrl && <a href={provider.sourceUrl} target="_blank" rel="noreferrer">Източник ↗</a>}</div></div></article>)}{!directoryContacts.some(contact => contact.kind === 'company') && <p className="report-note">Каталогът няма фирмени записи в момента. Отвори „Каталог фирми“ след затваряне на доклада, за да импортираш контакти.</p>}</div>
              <p className="report-note">Контактите са потенциални кандидати, а не потвърдени оферти. Провери услугите, регистрациите, застраховките, референциите и свободния капацитет преди възлагане.</p>
            </section>
            <section className="report-section report-budget-section">
              <h3><ShieldCheck size={16} /> Ограничения и бюджет</h3>
              <p>{analysis.budgetNote}</p>
              {analysis.limitations?.length > 0 && <ul>{analysis.limitations.map((limitation, index) => <li key={`report-limitation-${index}`}>{limitation}</li>)}</ul>}
              <p className="report-note">Това е предварителен AI доклад по снимка и предоставени документи, а не техническа експертиза или количествено-стойностна сметка. Безопасността, измерванията и проектните решения трябва да се потвърдят от компетентни специалисти на място.</p>
            </section>
          </div>
          <footer className="report-modal-footer"><span>Номерът е вътрешен за BuildAI и не е официален входящ номер на институция.</span><div className="report-actions"><button type="button" className="secondary-button" onClick={() => setShowReport(false)}>Към резултатите</button><button type="button" className="report-print-button" onClick={() => window.print()}><Download size={16} /> Запази като PDF / Печат</button></div></footer>
        </section>
      </div>}

      <footer><a className="footer-brand" href="#top"><img src="/buildai-logo-transparent.png" alt="" /><span>BuildAI</span></a><span>AI за по-добра градска среда</span><span>Концептуален прототип · Hack the Build</span></footer>
    </main>
  );
}
