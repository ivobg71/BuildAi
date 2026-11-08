import { NextResponse } from 'next/server';
import { parseLooseJson, readAssistantText, isRecord } from '@/lib/ai-json';

export const runtime = 'nodejs';
export const maxDuration = 25;

type OpportunityAssessment = {
  fit: 'potential' | 'uncertain' | 'weak';
  fitReason: string;
  applicantFit: string;
  activityFit: string;
  geographyFit: string;
  budgetAndCofunding: string;
  deadlineFit: string;
  requiredDocuments: string[];
  matches: string[];
  gaps: string[];
  nextSteps: string[];
  evidence: string[];
};

type Opportunity = {
  id: string;
  assessment?: OpportunityAssessment;
  title: string;
  identifier: string;
  programme: string;
  status: string;
  deadline: string;
  description: string;
  url: string;
  source: string;
};

function asText(value: unknown, max = 1800): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanText(value: unknown, max = 900): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function metaText(metadata: Record<string, unknown>, record: Record<string, unknown>, keys: string[], max = 900): string {
  for (const key of keys) {
    const value = metadata[key] ?? record[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        const text = typeof item === 'string' || typeof item === 'number' ? String(item) : '';
        if (text.trim()) return cleanText(text, max);
      }
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const text = cleanText(String(value), max);
      if (text) return text;
    }
  }
  return '';
}

function safeOfficialUrl(value: string, identifier: string): string {
  if (value) {
    try {
      const url = new URL(value, 'https://ec.europa.eu');
      if (url.protocol === 'https:' && (url.hostname === 'ec.europa.eu' || url.hostname.endsWith('.ec.europa.eu'))) return url.toString();
    } catch { /* use the official topic-details fallback below */ }
  }
  if (identifier && /^[A-Za-z0-9._-]{4,160}$/.test(identifier)) {
    return `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${encodeURIComponent(identifier)}`;
  }
  return 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/calls-for-proposals';
}

function displayStatus(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized.includes('31094502') || normalized.includes('open for submission') || normalized === 'open') return 'Отворена за кандидатстване';
  if (normalized.includes('31094501') || normalized.includes('forthcoming') || normalized.includes('upcoming')) return 'Предстояща покана';
  if (normalized.includes('31094503') || normalized.includes('closed')) return 'Затворена — не е приоритет за ново кандидатстване';
  return value || 'Статусът трябва да се потвърди в официалната страница';
}

function topicIdentifier(metadata: Record<string, unknown>, record: Record<string, unknown>): string {
  return metaText(metadata, record, ['identifier', 'callIdentifier', 'topicIdentifier', 'topicAbbreviation', 'reference', 'topicCode'], 200);
}

function normalizeOpportunity(recordValue: unknown, index: number): Opportunity | null {
  if (!recordValue || typeof recordValue !== 'object' || Array.isArray(recordValue)) return null;
  const record = recordValue as Record<string, unknown>;
  const metadata = record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
    ? record.metadata as Record<string, unknown>
    : {};
  const identifier = topicIdentifier(metadata, record);
  const rawContent = cleanText(record.content, 1400);
  const title = metaText(metadata, record, ['callTitle', 'topicTitle', 'title', 'name', 'topicName'], 400)
    || (rawContent.split(/\s{2,}|\n/)[0] || rawContent).slice(0, 300)
    || identifier
    || `Покана от официалния портал №${index + 1}`;
  const description = metaText(metadata, record, ['descriptionByte', 'description', 'summary', 'objective', 'topicDescription', 'keywords'], 850) || rawContent.slice(title.length).trim().slice(0, 850);
  const rawStatus = metaText(metadata, record, ['status', 'statusName', 'submissionStatus'], 140);
  const deadline = metaText(metadata, record, ['deadlineDate', 'submissionDeadline', 'deadline', 'deadlineDateString', 'endDate'], 100) || 'Не е върнат от търсачката — виж официалната страница';
  const programme = metaText(metadata, record, ['programmeName', 'frameworkProgrammeName', 'programme', 'frameworkProgramme', 'programmePeriod'], 220) || 'Програма на ЕС';
  const rawUrl = typeof record.url === 'string' ? record.url : metaText(metadata, record, ['url', 'topicUrl'], 500);
  const url = safeOfficialUrl(rawUrl, identifier);
  const id = identifier || metaText(metadata, record, ['reference', 'id'], 180) || `eu-${index}`;
  if (!title.trim()) return null;
  return {
    id,
    title,
    identifier: identifier || 'Номерът не е върнат от API',
    programme,
    status: displayStatus(rawStatus),
    deadline,
    description: description || 'Официалният API не върна кратко описание. Отвори страницата на поканата, за да прочетеш целите, допустимите кандидати и условията.',
    url,
    source: 'Европейска комисия — Funding & Tenders Portal API',
  };
}

function makeSearchTerms(description: string): string {
  const text = description.toLocaleLowerCase('bg-BG');
  const terms: string[] = [];
  if (/сград|фасад|покрив|ремонт|саниран|жилищ|строител/.test(text)) terms.push('building renovation sustainable buildings');
  if (/енергийн|изолац|отопл|охлаждан|ефективност/.test(text)) terms.push('energy efficiency energy renovation');
  if (/парк|площад|тротоар|улиц|междублок|градск|благоустро|зелени/.test(text)) terms.push('urban regeneration public spaces green infrastructure');
  if (/достъп|рампа|асансьор|приобщ|увреждан/.test(text)) terms.push('accessibility inclusive public buildings');
  if (/култур|наслед|паметник|историчес/.test(text)) terms.push('cultural heritage renovation');
  if (/вода|отводн|наводн|наводнения|климат/.test(text)) terms.push('climate adaptation water resilience');
  if (!terms.length) terms.push('building renovation urban development community infrastructure');
  return [...new Set(terms)].join(' ').slice(0, 350);
}

async function searchOfficialCalls(searchTerms: string): Promise<Opportunity[]> {
  const url = new URL('https://api.tech.ec.europa.eu/search-api/prod/rest/search');
  url.searchParams.set('apiKey', 'SEDIA');
  url.searchParams.set('text', searchTerms);
  url.searchParams.set('pageSize', '30');
  url.searchParams.set('pageNumber', '1');

  // The Commission's public API accepts JSON query data as multipart form fields.
  const query = {
    bool: {
      must: [
        { terms: { type: ['1', '2', '8'] } }, // grants and cascade-funding calls
        { terms: { status: ['31094501', '31094502'] } }, // forthcoming and open
      ],
    },
  };
  const form = new FormData();
  form.append('query', new Blob([JSON.stringify(query)], { type: 'application/json' }), 'query.json');
  form.append('languages', new Blob([JSON.stringify(['en'])], { type: 'application/json' }), 'languages.json');
  form.append('sort', new Blob([JSON.stringify({ field: 'sortStatus', order: 'ASC' })], { type: 'application/json' }), 'sort.json');

  const response = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: form,
    cache: 'no-store',
    signal: AbortSignal.timeout(8500),
  });
  if (!response.ok) throw new Error(`Официалната търсачка върна HTTP ${response.status}`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || !('results' in payload)) return [];
  const results = (payload as { results?: unknown[] }).results;
  if (!Array.isArray(results)) return [];
  const normalized = results.map((item, index) => normalizeOpportunity(item, index)).filter((item): item is Opportunity => Boolean(item));
  const seen = new Set<string>();
  return normalized.filter(item => {
    const key = `${item.identifier}|${item.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 25);
}

function providerError(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error?: { message?: string } | string }).error;
    if (typeof error === 'string') return error;
    if (error && typeof error.message === 'string') return error.message;
  }
  return 'Грешка от услугата за AI.';
}

function safeText(value: unknown, max = 600): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function safeStringArray(value: unknown, maxItems = 5, maxLength = 300): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map(item => item.trim().slice(0, maxLength)).filter(Boolean).slice(0, maxItems) : [];
}
function fallbackAssessment(call: Opportunity, applicant: string, region: string): OpportunityAssessment {
  const publicCandidate = /община|публична институц/i.test(applicant);
  const activity = /сград|фасад|ремонт|изолац|обнов|парк|площад|достъп|терен|строител|обществ/i.test(`${call.title} ${call.description}`);
  return {
    fit: 'uncertain',
    fitReason: 'Не може да се потвърди допустимост само от кратките метаданни на търсачката.',
    applicantFit: publicCandidate ? 'Необходимо е да се провери дали процедурата приема общини и публични възложители.' : `Необходимо е да се потвърди допустимостта за кандидат „${applicant || 'неуточнен'}“.`,
    activityFit: activity ? 'Заглавието или краткото описание съдържа сродни теми, но допустимите дейности не са потвърдени.' : 'Не е установено достатъчно ясно съвпадение по дейности от кратките метаданни.',
    geographyFit: `Провери дали географският обхват включва ${region || 'България'}; API откъсът не е достатъчен за потвърждение.`,
    budgetAndCofunding: 'Процентът на съфинансиране, лимитите и допустимите разходи не са потвърдени от кратките метаданни.',
    deadlineFit: `${call.status}; провери точната крайна дата и местния час в официалната страница.`,
    requiredDocuments: ['Насоки за кандидатстване от официалния портал', 'Документи за статута на кандидата', 'Техническо описание и бюджет/КСС', 'Декларации и приложения, изисквани от поканата'],
    matches: activity ? ['Възможно тематично съвпадение по заглавие/описание'] : [],
    gaps: ['Не е потвърден конкретният тип допустим кандидат', 'Не са налични проверени правила за съфинансиране и допустими разходи'],
    nextSteps: ['Отвори официалната покана и провери допустимите кандидати', 'Прочети допустимите дейности и разходи', 'Провери съфинансиране, срок и задължителни приложения'],
    evidence: [call.title, call.identifier, call.status, call.url].filter(Boolean),
  };
}

function normalizeAssessment(value: unknown, fallback: OpportunityAssessment): OpportunityAssessment {
  if (!isRecord(value)) return fallback;
  const rawFit = safeText(value.fit, 40).toLowerCase();
  const fit: OpportunityAssessment['fit'] = ['potential', 'good', 'potential-fit', 'likely'].includes(rawFit) ? 'potential'
    : ['weak', 'poor', 'unlikely', 'low'].includes(rawFit) ? 'weak' : 'uncertain';
  return {
    fit,
    fitReason: safeText(value.fitReason, 700) || fallback.fitReason,
    applicantFit: safeText(value.applicantFit, 500) || fallback.applicantFit,
    activityFit: safeText(value.activityFit, 500) || fallback.activityFit,
    geographyFit: safeText(value.geographyFit, 500) || fallback.geographyFit,
    budgetAndCofunding: safeText(value.budgetAndCofunding, 700) || fallback.budgetAndCofunding,
    deadlineFit: safeText(value.deadlineFit, 450) || fallback.deadlineFit,
    requiredDocuments: safeStringArray(value.requiredDocuments, 8, 220).length ? safeStringArray(value.requiredDocuments, 8, 220) : fallback.requiredDocuments,
    matches: safeStringArray(value.matches, 6, 240),
    gaps: safeStringArray(value.gaps, 6, 260),
    nextSteps: safeStringArray(value.nextSteps, 6, 260).length ? safeStringArray(value.nextSteps, 6, 260) : fallback.nextSteps,
    evidence: safeStringArray(value.evidence, 5, 280).length ? safeStringArray(value.evidence, 5, 280) : fallback.evidence,
  };
}

async function getAiAdvice(apiKey: string, input: Record<string, unknown>, results: Opportunity[], searchTerms: string): Promise<{ advice: string; assessments: Record<string, OpportunityAssessment> }> {
  const description = asText(input.description);
  const applicant = asText(input.applicant, 220) || 'Неуточнен кандидат';
  const region = asText(input.region, 150) || 'България';
  const budget = asText(input.budget, 100) || 'Не е определен';
  const model = process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-flash';
  const resultContext = results.slice(0, 12).map((call, index) => ({
    number: index + 1, title: call.title, identifier: call.identifier, programme: call.programme,
    status: call.status, deadline: call.deadline, description: call.description.slice(0, 650), url: call.url,
  }));
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: `Ти си помощник за предварително ориентиране към европейско финансиране. Върни само валиден JSON с полета advice:string, assessments:array. Данните са от публичната търсачка на Европейската комисия. Не измисляй условия, проценти, лимити, допустимост или точни документи. От кратки метаданни често няма достатъчно информация: в такъв случай използвай fit="uncertain" и кажи изрично, че е нужна проверка в официалните насоки. Никога не твърди, че кандидатът е допустим със сигурност. За всяка покана върни identifier, fit (potential|uncertain|weak), fitReason, applicantFit, activityFit, geographyFit, budgetAndCofunding, deadlineFit, requiredDocuments[], matches[], gaps[], nextSteps[], evidence[]. Полетата за съфинансиране и документи трябва да казват, когато информацията липсва, вместо да гадаят. Използвай само метаданните на поканата за нея и описанието на потребителя. Horizon Europe често финансира изследвания и иновации, не стандартен ремонт на единична сграда.` },
        { role: 'user', content: `Проект: ${description}\nКандидат: ${applicant}\nРегион: ${region}\nБюджет: ${budget}\nТърсени теми: ${searchTerms}\n\nРеални записи от официалната търсачка (не са потвърждение за допустимост):\n${JSON.stringify(resultContext, null, 2)}\n\nОцени всеки запис консервативно. Подготви кратък съвет, който обяснява най-смислените следващи стъпки и ясно отличава тематично съвпадение от доказана допустимост. В assessments върни assessment по identifier за най-много 12 записи.` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 3000,
      thinking: { type: 'disabled' },
      stream: false,
    }),
    signal: AbortSignal.timeout(12500),
  });
  const raw = await response.text();
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { throw new Error('DeepSeek върна невалиден отговор.'); }
  if (!response.ok) {
    const message = providerError(payload);
    const friendly = response.status === 401 ? 'Провери DEEPSEEK_API_KEY в Kuso.' : response.status === 402 ? 'Няма наличен API баланс за AI анализа.' : response.status === 429 ? 'Достигнат е лимитът на DeepSeek.' : message;
    throw new Error(friendly);
  }
  const reply = readAssistantText(payload);
  const parsed = parseLooseJson(reply);
  if (!isRecord(parsed)) return { advice: reply.slice(0, 9000), assessments: {} };
  const byId: Record<string, OpportunityAssessment> = {};
  const rawAssessments = Array.isArray(parsed.assessments) ? parsed.assessments : [];
  for (const value of rawAssessments) {
    if (!isRecord(value)) continue;
    const identifier = safeText(value.identifier, 200);
    const call = results.find(item => item.identifier === identifier);
    if (!identifier || !call) continue;
    byId[identifier] = normalizeAssessment(value, fallbackAssessment(call, applicant, region));
  }
  return { advice: safeText(parsed.advice, 9000) || 'Поканите са предварително филтрирани. Провери критериите в официалните насоки.', assessments: byId };
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Невалидно описание на проекта.' }, { status: 400 });
    const input = body as Record<string, unknown>;
    const description = asText(input.description);
    const applicant = asText(input.applicant, 220) || 'Неуточнен кандидат';
    const region = asText(input.region, 150) || 'България';
    const budget = asText(input.budget, 100) || 'Не е определен';
    if (description.length < 15) return NextResponse.json({ error: 'Опиши проекта с поне едно изречение.' }, { status: 400 });

    const searchTerms = makeSearchTerms(description);
    let results: Opportunity[] = [];
    let searchWarning = '';
    try {
      results = await searchOfficialCalls(searchTerms);
    } catch (error) {
      searchWarning = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
        ? 'Официалната търсачка не отговори навреме. Опитай отново; не показваме измислени покани.'
        : 'Не успяхме да прочетем резултатите от официалната търсачка. Провери връзката и опитай пак.';
      console.error('BuildAI official funding search error:', error);
    }

    let advice = '';
    let adviceWarning = '';
    let assessments: Record<string, OpportunityAssessment> = {};
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (apiKey) {
      try {
        const aiResult = await getAiAdvice(apiKey, { description, applicant, region, budget }, results, searchTerms);
        advice = aiResult.advice;
        assessments = aiResult.assessments;
      } catch (error) {
        adviceWarning = error instanceof Error ? error.message : 'AI анализът не успя да завърши.';
        console.error('BuildAI funding AI advice error:', adviceWarning);
      }
    } else {
      adviceWarning = 'Няма зададен DEEPSEEK_API_KEY. Показваме намерените официални записи без AI оценка.';
    }

    if (!advice && results.length) {
      advice = `Официалната търсачка върна ${results.length} записа, които съвпадат с темите „${searchTerms}“. Прегледай номерата, статуса и сроковете в картите. Това е резултат от търсене по ключови думи, не удостоверение за допустимост. Провери условията, типа кандидат, допустимите разходи и съфинансирането в официалната страница на всяка покана.`;
    }
    if (!advice && !results.length && !searchWarning) {
      advice = 'Търсенето не върна покани с тези теми и избраните статуси. Това не доказва, че няма финансиране — разшири описанието или потърси и в българските програми за средства от ЕС.';
    }

    const assessedResults = results.map(call => ({
      ...call,
      assessment: assessments[call.identifier] || fallbackAssessment(call, applicant, region),
    }));

    return NextResponse.json({
      advice,
      results: assessedResults,
      total: results.length,
      searchedAt: new Date().toISOString(),
      searchTerms,
      sourceUrl: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/calls-for-proposals',
      searchWarning,
      adviceWarning,
      applicant,
      region,
      budget,
    });
  } catch (error) {
    console.error('BuildAI funding-search route error:', error);
    return NextResponse.json({ error: 'Неуспешна заявка за търсене на европейско финансиране.' }, { status: 502 });
  }
}
