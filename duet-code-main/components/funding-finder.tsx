'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { strToU8, zipSync } from 'fflate';
import {
  ArrowUpRight, CalendarClock, CheckCircle2, Download, ExternalLink, FileCheck2,
  FileSearch, Globe2, Landmark, LoaderCircle, Search, ShieldAlert, Sparkles,
} from 'lucide-react';

type Applicant = 'municipality' | 'company' | 'ngo' | 'university' | 'individual' | 'cooperative';

export type EligibilityAssessment = { fit: 'potential' | 'uncertain' | 'weak'; fitReason: string; applicantFit: string; activityFit: string; geographyFit: string; budgetAndCofunding: string; deadlineFit: string; requiredDocuments: string[]; matches: string[]; gaps: string[]; nextSteps: string[]; evidence: string[] };

export type FundingOpportunity = {
  id: string;
  title: string;
  identifier: string;
  programme: string;
  status: string;
  deadline: string;
  description: string;
  url: string;
  source: string;
  assessment?: EligibilityAssessment;
};

export type FundingSnapshot = { description: string; applicant: Applicant; region: string; budget: string; advice: string; opportunities: FundingOpportunity[]; selectedCallId: string; searchedAt: string; searchTerms: string; searchWarning: string; adviceWarning: string };

type FundingProjectContext = { projectId?: string; projectNumber?: string; name?: string; address?: string; description?: string; region?: string; budget?: string; assetType?: string; estimate?: { workType?: string; areaM2?: number; totals?: { materialEur?: number; labor?: number; transport?: number; contingency?: number; vat?: number; grand?: number; pricedLines?: number; unpricedLines?: number }; lines?: { name?: string; quantity?: number; unit?: string; unitPrice?: number | null; currency?: string; merchant?: string; sourceUrl?: string }[] } };

type FundingReply = {
  advice?: string;
  error?: string;
  results?: FundingOpportunity[];
  total?: number;
  searchedAt?: string;
  searchTerms?: string;
  searchWarning?: string;
  adviceWarning?: string;
};

const applicantLabels: Record<Applicant, string> = {
  municipality: 'Община / публична институция',
  company: 'Фирма / малко или средно предприятие',
  ngo: 'НПО / сдружение / фондация',
  university: 'Университет / научна организация / консорциум',
  individual: 'Физическо лице / етажна собственост',
  cooperative: 'Партньорство от няколко организации',
};

const officialPortalUrl = 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/calls-for-proposals';

type DraftCall = Pick<FundingOpportunity, 'title' | 'identifier' | 'status' | 'deadline' | 'url'>;

type DocxLine = { text: string; style?: 'Title' | 'Subtitle' | 'Heading1' | 'Heading2' | 'Meta' | 'Normal' };

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function fallbackDraft(description: string, applicant: string, region: string, budget: string): string {
  return `1. Резюме на проекта\nПроектът предвижда планиране и изпълнение на дейности по следната нужда: ${description}. Конкретният обхват, собствеността, техническите параметри и количествата трябва да бъдат потвърдени от кандидата и компетентните специалисти.\n\n2. Проблем и обосновка\n[За попълване: описание на текущото състояние, доказателства за проблема, снимки, обследвания, енергийни характеристики или данни за ползвателите.]\n\n3. Цели\nОбща цел: да се подобри състоянието, ефективността, достъпността и/или качеството на средата в съответствие с реалната нужда и условията на избраната процедура.\nСпецифични цели: (1) да се изготви обоснован технически обхват; (2) да се извършат допустимите дейности; (3) да се измерят резултатите след приключване. Точните цели и показатели се потвърждават след техническо обследване.\n\n4. Предложени дейности и работни пакети\nЕтап 1 — подготовка: обследване, събиране на данни, проверка на собственост/право на управление и определяне на разрешителните.\nЕтап 2 — проектиране и бюджетиране: технически задания, количествено-стойностна сметка, оферти и планиране на обществени поръчки при приложимост.\nЕтап 3 — изпълнение: строително-монтажни или други дейности само след одобрение на проекта, разрешителните и финансирането.\nЕтап 4 — приемане и отчет: протоколи, документи за разходите, измерване на индикаторите и план за поддръжка.\n\n5. Целеви групи и бенефициенти\nКандидат: ${applicant}. Регион/местоположение: ${region}. Крайни ползватели и брой бенефициенти: [за попълване въз основа на проверими данни].\n\n6. Очаквани резултати и измерими показатели\n• Техническо обследване/проектна документация: [брой/статус за попълване].\n• Обект/площ, върху които се работи: [m² или друга подходяща единица].\n• Ползватели, които ще получат полза: [брой за попълване].\n• Енергийни, достъпни или екологични резултати: [базова стойност и целева стойност за попълване след обследване].\n\n7. Ориентировъчен график\nПодготовка и обследване — месеци 1–2; проектиране и процедури — месеци 2–4; изпълнение — месеци 4–9; приемане и отчет — месеци 9–10. Това е работна рамка, която трябва да се замени с график според реалния обхват, разрешителните и условията на поканата.\n\n8. Индикативна бюджетна структура\nВъведен ориентировъчен бюджет: ${budget}. Потенциални категории за проверка: обследване и проектиране; строително-монтажни дейности; оборудване/материали; управление и техническа помощ, ако са допустими; комуникация и одит, ако се изискват. Не са зададени официални суми или процент на финансиране. Изготви бюджет на база проект, количествено-стойностна сметка и правилата на конкретната процедура.\n\n9. Устойчивост\nОпредели кой ще стопанисва обекта, годишните разходи за поддръжка, отговорните лица и начините за проследяване на резултатите след приключване.\n\n10. Рискове и мерки\nНедостатъчни данни — възлагане на обследване; промени в цените — актуални оферти и резерв по правилата на процедурата; забавяне на разрешителни — предварителна проверка; несъответствие с критериите — проверка на насоките преди подаване; проблеми при изпълнението — квалифициран надзор и приемателни протоколи.\n\n11. Кандидат, партньори и екип\nКандидат: ${applicant}. Ръководител на проекта, технически експерт, финансов експерт, обществена поръчка/юрист и партньори: [за попълване след потвърждение].\n\n12. Документи и приложения за подготовка\n• Документи за правния статут и представителството на кандидата.\n• Документ за собственост или право на управление/ползване, когато е необходимо.\n• Техническо обследване, енергиен одит, проект и разрешителни според вида на обекта.\n• Количествено-стойностна сметка, бюджет и обосновка на разходите.\n• Оферти или пазарно проучване според правилата на процедурата.\n• Декларации и удостоверения, изисквани от конкретната покана.\n• План за изпълнение, индикатори, устойчивост и приложими партньорски документи.\n\n13. Контролен списък преди подаване\nПровери дали кандидатът е допустим; проектът и регионът попадат в обхвата; дейностите и разходите са допустими; има необходимото съфинансиране; спазени са срокът, форматът и подписването; налични са всички приложения.\n\nВажна бележка\nТекстът е работна чернова, не официално заявление и не представлява потвърждение за финансиране. Официалният номер на заявление се присвоява от съответната система едва при действително подаване. Всички правила, срокове, допустимост и бюджетни категории трябва да се сверят с официалните насоки на избраната процедура.`;
}

function createDocx(lines: DocxLine[]): Uint8Array {
  const paragraphXml = (line: DocxLine) => {
    const style = line.style || 'Normal';
    const text = escapeXml(line.text);
    if (!text) return '<w:p><w:pPr><w:spacing w:after="80"/></w:pPr></w:p>';
    return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  };
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${lines.map(paragraphXml).join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1200" w:right="1150" w:bottom="1200" w:left="1150" w:header="600" w:footer="600" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="21"/><w:color w:val="203A4B"/></w:rPr><w:pPr><w:spacing w:after="110" w:line="285" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:before="300" w:after="250"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display"/><w:b/><w:sz w:val="38"/><w:color w:val="087F83"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="250"/></w:pPr><w:rPr><w:sz w:val="24"/><w:i/><w:color w:val="526C7B"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="087F83"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="70"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="24677B"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Meta"><w:name w:val="Metadata"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="70"/></w:pPr><w:rPr><w:sz w:val="19"/><w:color w:val="4F6573"/></w:rPr></w:style>
</w:styles>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
  const packageRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(packageRels),
    'word/document.xml': strToU8(documentXml),
    'word/styles.xml': strToU8(stylesXml),
    'word/_rels/document.xml.rels': strToU8(documentRels),
  }, { level: 6 });
}

function draftToLines(draft: string): DocxLine[] {
  const cleaned = draft.replace(/```(?:text|markdown)?/gi, '').replace(/\*\*/g, '').trim();
  return cleaned.split(/\r?\n/).map(raw => {
    const text = raw.trim().replace(/^[-*•]\s*/, '• ');
    if (!text) return { text: '' };
    if (/^#{1,2}\s/.test(text)) return { text: text.replace(/^#{1,2}\s*/, ''), style: /^#\s/.test(text) ? 'Heading1' as const : 'Heading2' as const };
    if (/^\d{1,2}[.)]\s+.{3,100}$/.test(text) && !/[.!?]$/.test(text)) return { text, style: 'Heading1' as const };
    if (/^(\d+[.)]\s*)?([А-ЯA-Z][^:]{2,90})\s*:$/.test(text)) return { text, style: 'Heading2' as const };
    return { text, style: 'Normal' as const };
  });
}

function formatDeadline(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /не е върнат|за проверка|потвърди/i.test(trimmed)) return trimmed;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return trimmed;
  try {
    const date = new Date(parsed);
    return date.toLocaleString('bg-BG', { dateStyle: 'medium', timeStyle: /T\d{2}:\d{2}/.test(trimmed) ? 'short' : undefined, timeZone: 'Europe/Sofia' });
  } catch { return trimmed; }
}

function downloadDocx(lines: DocxLine[], filename: string) {
  const bytes = createDocx(lines);
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export default function FundingFinder({ projectContext, initialSnapshot, onSnapshotChange }: { projectContext?: FundingProjectContext; initialSnapshot?: Partial<FundingSnapshot> | null; onSnapshotChange?: (snapshot: FundingSnapshot) => void }) {
  const initialApplicant = initialSnapshot?.applicant && initialSnapshot.applicant in applicantLabels ? initialSnapshot.applicant : (projectContext?.assetType === 'public_space' || /общин|обществен|публичн/i.test(projectContext?.description || '') ? 'municipality' : 'individual');
  const [description, setDescription] = useState(initialSnapshot?.description || projectContext?.description || 'Обновяване на фасада, повишаване на енергийната ефективност и подобряване на достъпността на обществена сграда.');
  const [applicant, setApplicant] = useState<Applicant>(initialApplicant as Applicant);
  const [region, setRegion] = useState(initialSnapshot?.region || projectContext?.region || 'България');
  const [budget, setBudget] = useState(initialSnapshot?.budget || projectContext?.budget || 'Не е определен');
  const [advice, setAdvice] = useState(initialSnapshot?.advice || '');
  const [opportunities, setOpportunities] = useState<FundingOpportunity[]>(Array.isArray(initialSnapshot?.opportunities) ? initialSnapshot.opportunities : []);
  const [selectedCall, setSelectedCall] = useState<FundingOpportunity | null>(() => Array.isArray(initialSnapshot?.opportunities) ? initialSnapshot.opportunities.find(call => call.id === initialSnapshot.selectedCallId) || initialSnapshot.opportunities[0] || null : null);
  const [searchTerms, setSearchTerms] = useState(initialSnapshot?.searchTerms || '');
  const [searchedAt, setSearchedAt] = useState(initialSnapshot?.searchedAt || '');
  const [searchWarning, setSearchWarning] = useState(initialSnapshot?.searchWarning || '');
  const [adviceWarning, setAdviceWarning] = useState(initialSnapshot?.adviceWarning || '');
  const [loading, setLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [error, setError] = useState('');
  const [draftNotice, setDraftNotice] = useState('');
  const [searched, setSearched] = useState(Boolean(initialSnapshot?.searchedAt));

  const portalUrl = useMemo(() => {
    const url = new URL(officialPortalUrl);
    const terms = [description, 'building renovation energy efficiency'].filter(Boolean).join(' ');
    url.searchParams.set('keywords', terms.slice(0, 300));
    url.searchParams.set('programmePeriod', '2021 - 2027');
    url.searchParams.set('order', 'DESC');
    url.searchParams.set('pageNumber', '1');
    url.searchParams.set('pageSize', '50');
    url.searchParams.set('status', '31094501,31094502');
    return url.toString();
  }, [description]);

  const nationalSearchUrl = useMemo(() => 'https://www.eufunds.bg/bg', []);
  const interregUrl = useMemo(() => 'https://interreg.eu/', []);
  const lifeUrl = useMemo(() => 'https://cinea.ec.europa.eu/programmes/life_en', []);

  async function searchFunding(event: FormEvent) {
    event.preventDefault();
    if (description.trim().length < 15) {
      setError('Опиши проекта с поне едно изречение, за да можем да подберем подходящите програми.');
      return;
    }
    setLoading(true);
    setError('');
    setAdvice('');
    setOpportunities([]);
    setSelectedCall(null);
    setSearchWarning('');
    setAdviceWarning('');
    setSearched(true);
    setDraftNotice('');
    try {
      const response = await fetch('/api/funding-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim(), applicant: applicantLabels[applicant], region: region.trim(), budget: budget.trim() }),
      });
      const raw = await response.text();
      let payload: FundingReply = {};
      try { payload = JSON.parse(raw) as FundingReply; } catch { throw new Error(`Сървърът върна неочакван отговор (HTTP ${response.status}). Провери логовете в Kuso.`); }
      if (!response.ok) throw new Error(payload.error || `Търсенето не успя (HTTP ${response.status}).`);
      const found = Array.isArray(payload.results) ? payload.results : [];
      setOpportunities(found);
      setSelectedCall(found[0] || null);
      setAdvice(payload.advice || (found.length ? 'Показани са реални записи от търсачката на Европейската комисия. Отвори покана, за да провериш всички условия.' : 'Не са намерени резултати с тези теми. Разшири описанието или провери националните процедури.'));
      setSearchTerms(payload.searchTerms || '');
      setSearchedAt(payload.searchedAt || '');
      setSearchWarning(payload.searchWarning || '');
      setAdviceWarning(payload.adviceWarning || '');
      onSnapshotChange?.({ description:description.trim(), applicant, region:region.trim(), budget:budget.trim(), advice:payload.advice || '', opportunities:found, selectedCallId:found[0]?.id || '', searchedAt:payload.searchedAt || new Date().toISOString(), searchTerms:payload.searchTerms || '', searchWarning:payload.searchWarning || '', adviceWarning:payload.adviceWarning || '' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Неуспешно търсене на финансиране.');
    } finally {
      setLoading(false);
    }
  }

  async function generateProjectFile() {
    if (description.trim().length < 15) {
      setError('Добави по-подробно описание на проекта.');
      return;
    }
    setDraftLoading(true);
    setDraftNotice('');
    setError('');
    const now = new Date();
    const dateCode = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const randomCode = Math.random().toString(36).slice(2, 6).toUpperCase();
    const draftId = `BAI-DRAFT-${dateCode}-${randomCode}`;
    let aiDraft = '';
    let generatedByAI = false;
    try {
      const response = await fetch('/api/funding-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(), applicant: applicantLabels[applicant], region: region.trim(), budget: budget.trim(),
          project: projectContext ? { projectNumber:projectContext.projectNumber, name:projectContext.name, address:projectContext.address, assetType:projectContext.assetType, estimate:projectContext.estimate } : null,
          call: selectedCall ? { title: selectedCall.title, identifier: selectedCall.identifier, status: selectedCall.status, deadline: selectedCall.deadline, url: selectedCall.url, assessment:selectedCall.assessment } : null,
        }),
      });
      const raw = await response.text();
      let payload: { draft?: string; generatedByAI?: boolean; error?: string } = {};
      try { payload = JSON.parse(raw) as typeof payload; } catch { /* use complete offline draft template below */ }
      if (response.ok && typeof payload.draft === 'string' && payload.draft.trim()) {
        aiDraft = payload.draft;
        generatedByAI = payload.generatedByAI === true;
      } else {
        setDraftNotice('DeepSeek не успя да допише целия текст. Създадох DOCX с подробна проектна рамка и полета за попълване.');
      }
    } catch {
      setDraftNotice('Нямаше връзка с DeepSeek. Създадох DOCX с подробна проектна рамка и полета за попълване.');
    }

    const chosen = selectedCall || opportunities[0] || null;
    const lines: DocxLine[] = [
      { text: 'BuildAI', style: 'Subtitle' },
      { text: 'ПРОЕКТНО ДОСИЕ И ИСКАНЕ ЗА ФИНАНСИРАНЕ', style: 'Title' },
      { text: 'Работна чернова за подготовка на кандидатстване по програма на ЕС', style: 'Subtitle' },
      { text: `Вътрешен номер на досието: ${draftId}`, style: 'Meta' },
      { text: 'Официален номер на заявление: НЕ Е ПРИСВОЕН — получава се само от съответния портал при реално подаване.', style: 'Meta' },
      { text: `Дата на изготвяне: ${now.toLocaleDateString('bg-BG')}`, style: 'Meta' },
      { text: `Кандидат: ${applicantLabels[applicant]}`, style: 'Meta' },
      { text: `Регион/местоположение: ${region.trim() || 'За попълване'}`, style: 'Meta' },
      { text: `Ориентировъчен бюджет: ${budget.trim() || 'Не е определен'}`, style: 'Meta' },
      { text: `Описание на проекта: ${description.trim()}`, style: 'Meta' },
      ...(projectContext?.projectNumber || projectContext?.name || projectContext?.address ? [
        { text: `Свързан BuildAI проект: ${projectContext.projectNumber || 'номерът не е наличен'} · ${projectContext.name || 'без име'}`, style: 'Meta' as const },
        { text: `Адрес на обекта: ${projectContext.address || region.trim() || 'не е посочен'}`, style: 'Meta' as const },
      ] : []),
      ...(projectContext?.estimate ? [
        { text: 'Количествено-стойностна сметка от BuildAI', style: 'Heading1' as const },
        { text: `Вид работа: ${projectContext.estimate.workType || 'за проверка'} · измерена площ: ${Number(projectContext.estimate.areaM2 || 0).toLocaleString('bg-BG')} m²` },
        { text: `Материали с цена: ${Number(projectContext.estimate.totals?.materialEur || 0).toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} EUR · труд: ${Number(projectContext.estimate.totals?.labor || 0).toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} EUR · транспорт: ${Number(projectContext.estimate.totals?.transport || 0).toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} EUR` },
        { text: `Резерв: ${Number(projectContext.estimate.totals?.contingency || 0).toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} EUR · ДДС: ${Number(projectContext.estimate.totals?.vat || 0).toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} EUR · общ ориентир: ${Number(projectContext.estimate.totals?.grand || 0).toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} EUR` },
        { text: `Позиции с цена: ${projectContext.estimate.totals?.pricedLines ?? 0} · позиции без цена: ${projectContext.estimate.totals?.unpricedLines ?? 0}. Непотвърдените позиции не са включени в материалната сума.` },
        ...(projectContext.estimate.lines || []).slice(0,12).map(line => ({ text: `• ${line.name || 'Материал'}: ${Number(line.quantity || 0).toLocaleString('bg-BG',{maximumFractionDigits:2})} ${line.unit || ''} · ${line.unitPrice == null ? 'няма потвърдена цена' : `${Number(line.unitPrice).toLocaleString('bg-BG',{maximumFractionDigits:2})} ${line.currency || ''}`} · ${line.merchant || 'не е избран търговец'}${line.sourceUrl ? ` · ${line.sourceUrl}` : ''}` })),
      ] : []),
      { text: 'Избрана възможност от официалната търсачка', style: 'Heading1' },
      { text: chosen ? `Наименование: ${chosen.title}` : 'Не е избрана конкретна покана; потърси и потвърди процедурата преди кандидатстване.' },
      { text: chosen ? `Идентификатор/номер на поканата: ${chosen.identifier}` : 'Номер на поканата: за попълване след проверка в официалния портал' },
      { text: chosen ? `Статус от търсачката: ${chosen.status}` : 'Статус и краен срок: задължително да се проверят в официалния портал' },
      { text: chosen ? `Краен срок/информация: ${chosen.deadline}` : 'Краен срок: за проверка' },
      { text: `Официална страница: ${chosen?.url || officialPortalUrl}` },
      ...(chosen?.assessment ? [
        { text: 'Предварителна проверка на съответствието', style: 'Heading1' as const },
        { text: `Оценка: ${chosen.assessment.fit === 'potential' ? 'Потенциално съвпадение — задължителна проверка' : chosen.assessment.fit === 'weak' ? 'Слабо тематично съвпадение' : 'Необходима е допълнителна проверка'}` },
        { text: `Обосновка: ${chosen.assessment.fitReason}` },
        { text: `Съответствие на кандидата: ${chosen.assessment.applicantFit}` },
        { text: `Съответствие на дейностите: ${chosen.assessment.activityFit}` },
        { text: `Географски обхват: ${chosen.assessment.geographyFit}` },
        { text: `Бюджет и съфинансиране: ${chosen.assessment.budgetAndCofunding}` },
        { text: `Краен срок: ${chosen.assessment.deadlineFit}` },
        { text: 'Потенциално необходими документи', style: 'Heading2' as const },
        ...chosen.assessment.requiredDocuments.map(item => ({ text: `• ${item}` })),
        { text: 'Несъответствия и неясноти', style: 'Heading2' as const },
        ...chosen.assessment.gaps.map(item => ({ text: `• ${item}` })),
      ] : []),
      { text: 'Проектен текст и план за кандидатстване', style: 'Heading1' },
      ...(aiDraft ? draftToLines(aiDraft) : draftToLines(fallbackDraft(description.trim(), applicantLabels[applicant], region.trim() || 'България', budget.trim() || 'Не е определен'))),
      { text: 'Проверки преди реално подаване', style: 'Heading1' },
      { text: 'Потвърди допустимостта на кандидата, вида дейности, географския обхват, допустимите разходи, процента на съфинансиране, периода, крайния срок и списъка на приложенията в официалните насоки на избраната процедура. Провери всички факти и числа от специалисти и документи.' },
      { text: 'Правна и административна бележка', style: 'Heading1' },
      { text: `Този файл е ${generatedByAI ? 'AI подпомогната ' : ''}работна чернова, не е официално заявление, не доказва допустимост и не е подаден към институция. Номерът ${draftId} е само вътрешен идентификатор на BuildAI. Не го използвай като официален регистрационен номер.`, style: 'Normal' },
    ];
    downloadDocx(lines, `BuildAI_Project_Dossier_${dateCode}.docx`);
    setDraftLoading(false);
  }

  const searchedTime = searchedAt ? new Date(searchedAt).toLocaleString('bg-BG', { dateStyle: 'short', timeStyle: 'short' }) : '';

  return (
    <section className="funding-page">
      <div className="funding-hero">
        <div className="eyebrow"><Landmark size={14} /> ЕВРОПЕЙСКО ФИНАНСИРАНЕ</div>
        <h1>Намери реална <span>покана за проекта.</span></h1>
        <p>{projectContext?.name ? `Свързано с проекта „${projectContext.name}“. ` : ''}BuildAI търси текущи записи в официалния портал, сравнява описанието с типа кандидат, региона, бюджета и дейностите и показва кои условия още трябва да се потвърдят.</p>
      </div>

      <div className="funding-layout">
        <form className="panel funding-form" onSubmit={searchFunding}>
          <div className="panel-heading"><span className="step-number">EU</span><div><h3>Параметри на проекта</h3><p>Подбери подходящите програми според целта и кандидата.</p></div></div>
          <label className="field-label" htmlFor="funding-description">Какво ще се подобрява?</label>
          <textarea id="funding-description" rows={5} maxLength={1800} value={description} onChange={event => setDescription(event.target.value)} placeholder="Напр. ремонт на обществена сграда, изолация, достъпна среда, парк, осветление…" />
          <label className="field-label" htmlFor="funding-applicant">Кой ще кандидатства?</label>
          <select id="funding-applicant" value={applicant} onChange={event => setApplicant(event.target.value as Applicant)}>
            {Object.entries(applicantLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <div className="funding-form-row">
            <div><label className="field-label" htmlFor="funding-region">Област / държава</label><input id="funding-region" value={region} onChange={event => setRegion(event.target.value)} maxLength={100} placeholder="България, Пазарджик…" /></div>
            <div><label className="field-label" htmlFor="funding-budget">Ориентировъчен бюджет</label><input id="funding-budget" value={budget} onChange={event => setBudget(event.target.value)} maxLength={100} placeholder="напр. 200 000 EUR" /></div>
          </div>
          {error && <div className="error-message"><ShieldAlert size={16} /> {error}</div>}
          <button className="analyze-button" type="submit" disabled={loading}>{loading ? <><LoaderCircle size={17} className="spin" /> Търся реални покани…</> : <><Search size={17} /> Търси в официалния каталог <ArrowUpRight size={17} /></>}</button>
          <button className="funding-dossier-button" type="button" onClick={() => void generateProjectFile()} disabled={draftLoading}>{draftLoading ? <><LoaderCircle size={17} className="spin" /> Генерирам DOCX…</> : <><FileCheck2 size={17} /> Генерирай пълен проектен файл (.docx) <Download size={16} /></>}</button>
          <p className="privacy-note"><ShieldAlert size={14} /> Файлът е работна чернова. Номерът в BuildAI е вътрешен, не официален номер на заявление. Провери допустимостта и документите преди подаване.</p>
          {draftNotice && <div className="funding-inline-notice"><CheckCircle2 size={15} />{draftNotice}</div>}
        </form>

        <div className="funding-results-column">
          {advice && <article className="panel funding-advice"><div className="funding-result-label"><Sparkles size={16} /> АНАЛИЗ НА НАМЕРЕНИТЕ ПОКАНИ</div><div className="funding-advice-text">{advice}</div>{adviceWarning && <div className="funding-inline-warning"><ShieldAlert size={14} />{adviceWarning}</div>}</article>}
          {searched && <article className="panel funding-official-search"><div className="funding-result-label"><FileSearch size={16} /> ДИРЕКТНО ТЪРСЕНЕ В ЕВРОПЕЙСКАТА КОМИСИЯ</div><p>{searchWarning || `Търсени теми: ${searchTerms || 'обществена инфраструктура и обновяване'}.`}{searchedTime ? ` Последно търсене: ${searchedTime}.` : ''}</p><div className="funding-link-list">
            <a href={portalUrl} target="_blank" rel="noreferrer"><span><strong>EU Funding & Tenders Portal</strong><small>Отвори всички официални резултати и документи на поканите</small></span><ExternalLink size={16} /></a>
            <a href={nationalSearchUrl} target="_blank" rel="noreferrer"><span><strong>Европейски средства в България</strong><small>Национални програми и процедури</small></span><ExternalLink size={16} /></a>
            <a href={interregUrl} target="_blank" rel="noreferrer"><span><strong>Interreg</strong><small>Трансгранични и регионални програми</small></span><ExternalLink size={16} /></a>
            <a href={lifeUrl} target="_blank" rel="noreferrer"><span><strong>Програма LIFE</strong><small>Околна среда и климат</small></span><ExternalLink size={16} /></a>
          </div></article>}
        </div>
      </div>

      <div className="funding-calls-heading"><div><div className="eyebrow"><Globe2 size={14} /> РЕАЛНИ РЕЗУЛТАТИ ОТ ОФИЦИАЛНИЯ API</div><h2>{searched ? `Намерени покани: ${opportunities.length}` : 'Покани, подходящи за твоя проект'}</h2><p>Идентификаторът, статусът и срокът идват от публичната търсачка. Винаги потвърди последната версия на условията в официалната страница.</p></div><a className="secondary-button" href={portalUrl} target="_blank" rel="noreferrer"><Globe2 size={15} /> Отвори портала <ExternalLink size={14} /></a></div>

      {searched && opportunities.length > 0 ? <div className="funding-calls-grid">{opportunities.map(call => <article className={`funding-call-card ${selectedCall?.id === call.id ? 'selected' : ''}`} key={`${call.id}-${call.url}`}>
        <div className="funding-call-top"><span className="funding-status"><CheckCircle2 size={13} /> {call.status}</span><span className="funding-code">{call.identifier}</span></div>
        <div className="funding-program">{call.programme}</div><h3>{call.title}</h3><p>{call.description}</p>
        <div className="funding-deadline"><CalendarClock size={15} /><span><small>Краен срок / информация от API</small><strong>{formatDeadline(call.deadline)}</strong></span></div>
        {call.assessment && <div className={`eligibility-card ${call.assessment.fit}`}><div className="eligibility-card-heading"><strong>{call.assessment.fit === 'potential' ? 'Потенциално тематично съвпадение' : call.assessment.fit === 'weak' ? 'Слабо тематично съвпадение' : 'Допустимостта не е потвърдена'}</strong><span>Предварителен филтър</span></div><p>{call.assessment.fitReason}</p><div className="eligibility-check-grid"><div><strong>Кандидат</strong><span>{call.assessment.applicantFit}</span></div><div><strong>Дейности</strong><span>{call.assessment.activityFit}</span></div><div><strong>Регион</strong><span>{call.assessment.geographyFit}</span></div><div><strong>Бюджет / съфинансиране</strong><span>{call.assessment.budgetAndCofunding}</span></div></div>{call.assessment.matches.length>0&&<div className="eligibility-points"><strong>Съвпадения</strong><ul>{call.assessment.matches.slice(0,3).map((item,index)=><li key={`match-${call.id}-${index}`}>{item}</li>)}</ul></div>}{call.assessment.gaps.length>0&&<div className="eligibility-points gaps"><strong>Какво остава за проверка</strong><ul>{call.assessment.gaps.slice(0,4).map((item,index)=><li key={`gap-${call.id}-${index}`}>{item}</li>)}</ul></div>}<details className="eligibility-docs"><summary>Документи и следващи действия</summary><ul>{call.assessment.requiredDocuments.map((item,index)=><li key={`doc-${call.id}-${index}`}>{item}</li>)}</ul><ol>{call.assessment.nextSteps.map((item,index)=><li key={`next-${call.id}-${index}`}>{item}</li>)}</ol><p>Основание: метаданните от официалната покана. Потвърди всички условия в пълния текст.</p></details></div>}
        <div className="funding-card-actions"><a className="funding-primary-link" href={call.url} target="_blank" rel="noreferrer">Отвори реалната покана <ArrowUpRight size={15} /></a><button type="button" className="funding-select-call" onClick={() => { setSelectedCall(call); setDraftNotice(`Избра покана ${call.identifier} за включване в проектния файл.`); onSnapshotChange?.({ description:description.trim(), applicant, region:region.trim(), budget:budget.trim(), advice, opportunities, selectedCallId:call.id, searchedAt, searchTerms, searchWarning, adviceWarning }); }}>{selectedCall?.id === call.id ? <CheckCircle2 size={14} /> : <FileCheck2 size={14} />}{selectedCall?.id === call.id ? 'Избрана за досието' : 'Използвай в проектния файл'}</button></div>
      </article>)}</div> : <div className="funding-empty-results"><div className="funding-empty-icon"><FileSearch size={25} /></div><div><strong>{searched ? 'Няма върнати записи за тези критерии' : 'Реалните резултати ще се появят тук'}</strong><p>{searched ? (searchWarning || 'Опитай с по-широко описание или провери националните български процедури. Няма да показваме статични покани като че ли са актуални.') : 'Натисни „Търси в официалния каталог“. BuildAI ще извика публичния API на Европейската комисия и ще покаже намерените процедури.'}</p></div></div>}

      <div className="funding-bottom-note"><ShieldAlert size={18} /><p>Намереният запис не е равен на право за финансиране. Провери допустимия вид кандидат, страната/региона, целите, разходите, съфинансирането, крайната дата и всички приложения. За обикновен ремонт на една сграда провери и националните програми в България; някои програми на ЕС са само за научноизследователски консорциуми или иновационни проекти.</p></div>
    </section>
  );
}
