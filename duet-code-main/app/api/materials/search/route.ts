import { NextResponse } from 'next/server';
import type { MaterialOffer, MaterialPriceSource, MaterialSearchResult } from '@/lib/materials';
import { MATERIAL_STORES, materialStoreSearchLink } from '@/lib/material-stores';

export const runtime = 'nodejs';
export const maxDuration = 30;


const ALLOWED_DOMAINS = new Set(MATERIAL_STORES.map(item => item.domain));
const USER_AGENT = 'Mozilla/5.0 (compatible; BuildAI-MaterialPriceFinder/1.0)';

function decodeEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCharCode(parseInt(n, 16)))
    .trim();
}

function stripHtml(input: string, max = 1000): string {
  return decodeEntities(input.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).slice(0, max);
}

/** Validate an externally displayed URL. Never allows credential-bearing or local/private hosts. */
function safeExternalUrl(value: string, base?: string): URL | null {
  try {
    const url = new URL(value, base);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;
    // Links displayed from search results may be from any public merchant, but never local/IP targets.
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.startsWith('[')) return null;
    url.hash = '';
    return url;
  } catch { return null; }
}

/** Only these domains may be fetched by our server; other valid search results are displayed but never crawled. */
function safeMerchantUrl(value: string, base?: string): URL | null {
  const url = safeExternalUrl(value, base);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const allowed = [...ALLOWED_DOMAINS].some(domain => host === domain || host.endsWith(`.${domain}`));
  return allowed ? url : null;
}

async function readTextLimited(response: Response, maxBytes = 1_500_000): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const slice = value.subarray(0, Math.min(value.length, maxBytes - total));
      chunks.push(slice); total += slice.length;
      if (slice.length < value.length) break;
    }
  } finally { try { await reader.cancel(); } catch { /* ignore */ } }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder('utf-8', { fatal: false }).decode(output);
}

function getTag(xml: string, name: string): string {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i').exec(xml);
  return match ? stripHtml(decodeEntities(match[1]), 1600) : '';
}

type SearchCandidate = {
  title: string;
  url: string;
  description: string;
  matchedQuery: string;
  price?: number | null;
  currency?: string | null;
  priceSource?: MaterialPriceSource;
  merchant?: string;
  availability?: string;
};

type SearchDiagnostics = { candidates: SearchCandidate[]; provider: string; warnings: string[] };

function dedupeCandidates(candidates: SearchCandidate[], limit = 18): SearchCandidate[] {
  const unique = new Map<string, SearchCandidate>();
  for (const candidate of candidates) {
    const url = safeExternalUrl(candidate.url);
    if (!url || !candidate.title.trim()) continue;
    const key = `${url.hostname}${url.pathname}`.toLowerCase();
    const prior = unique.get(key);
    if (!prior || (prior.price == null && candidate.price != null)) {
      unique.set(key, { ...candidate, url: url.toString() });
    }
  }
  return [...unique.values()].slice(0, limit);
}

async function searchBing(query: string, signalTimeout = 5000): Promise<SearchCandidate[]> {
  const url = new URL('https://www.bing.com/search');
  url.searchParams.set('format', 'rss');
  url.searchParams.set('q', `${query} цена строителни материали България`.slice(0, 500));
  url.searchParams.set('setlang', 'bg-BG');
  url.searchParams.set('cc', 'BG');
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8' },
    cache: 'no-store', signal: AbortSignal.timeout(signalTimeout),
  });
  if (!response.ok) throw new Error(`Bing върна HTTP ${response.status}`);
  const xml = await readTextLimited(response, 1_000_000);
  const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)];
  const candidates: SearchCandidate[] = [];
  for (const item of items) {
    const block = item[1];
    const title = getTag(block, 'title');
    const linkRaw = getTag(block, 'link') || decodeEntities(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i.exec(block)?.[1] || '');
    const link = safeExternalUrl(linkRaw);
    if (!title || !link) continue;
    candidates.push({ title, url: link.toString(), description: getTag(block, 'description'), matchedQuery: query });
  }
  return candidates;
}

function unescapeSearchRedirect(value: string): string {
  const raw = decodeEntities(value);
  try {
    const url = new URL(raw, 'https://html.duckduckgo.com');
    const target = url.searchParams.get('uddg') || url.searchParams.get('url') || '';
    return target || raw;
  } catch { return raw; }
}

async function searchDuckDuckGo(query: string): Promise<SearchCandidate[]> {
  const url = new URL('https://html.duckduckgo.com/html/');
  url.searchParams.set('q', `${query} цена строителни материали България`.slice(0, 500));
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
    cache: 'no-store', signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`DuckDuckGo върна HTTP ${response.status}`);
  const html = await readTextLimited(response, 1_000_000);
  const anchors = [...html.matchAll(/<a\b([^>]*\bclass=["'][^"']*result__a[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi)];
  const results: SearchCandidate[] = [];
  for (const match of anchors) {
    const href = /\bhref=["']([^"']+)["']/i.exec(match[1])?.[1] || '';
    const destination = unescapeSearchRedirect(href);
    const link = safeExternalUrl(destination);
    if (!link) continue;
    const title = stripHtml(match[2], 260);
    const offset = match.index || 0;
    const after = html.slice(offset, offset + 3000);
    const snippetMatch = /class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div|span|td)>/i.exec(after);
    const description = snippetMatch ? stripHtml(snippetMatch[1], 700) : '';
    if (title) results.push({ title, url: link.toString(), description, matchedQuery: query });
  }
  return results;
}

function parseProviderPrice(value: unknown): { price: number; currency: string } | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).replace(/\u00a0/g, ' ').trim();
  // Match an amount directly next to its currency; this avoids merging dual-price strings like "19,99 € / 39,09 лв.".
  const amount = String.raw`(\d[\d.,\s\u00a0]{0,18})`;
  const currency = String.raw`(€|EUR|лв\.?|BGN|USD|\$|GBP|£)`;
  const patterns = [new RegExp(`${currency}\\s*${amount}`, 'i'), new RegExp(`${amount}\\s*${currency}`, 'i')];
  for (let index = 0; index < patterns.length; index += 1) {
    const match = patterns[index].exec(text);
    if (!match) continue;
    const amountText = index === 0 ? match[2] : match[1];
    const currencyText = (index === 0 ? match[1] : match[2]).toUpperCase();
    const price = parseMoneyText(amountText);
    if (price === null) continue;
    const code = currencyText.startsWith('€') || currencyText === 'EUR' ? 'EUR'
      : /ЛВ|BGN/i.test(currencyText) ? 'BGN'
      : currencyText === '$' || currencyText === 'USD' ? 'USD' : 'GBP';
    return { price, currency: code };
  }
  return null;
}

async function searchSerperShopping(query: string, location = ''): Promise<SearchCandidate[]> {
  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (!apiKey) return [];
  const response = await fetch('https://google.serper.dev/shopping', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: `${query}${location ? ` ${location}` : ''}`, gl: 'bg', hl: 'bg', num: 10 }),
    cache: 'no-store', signal: AbortSignal.timeout(6500),
  });
  if (!response.ok) throw new Error(`Google Shopping източникът върна HTTP ${response.status}`);
  const payload = await response.json() as { shopping?: unknown[]; products?: unknown[] };
  const items = Array.isArray(payload.shopping) ? payload.shopping : Array.isArray(payload.products) ? payload.products : [];
  const candidates: SearchCandidate[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const title = typeof item.title === 'string' ? item.title : '';
    const link = typeof item.link === 'string' ? safeExternalUrl(item.link) : null;
    if (!title || !link) continue;
    const parsed = parseProviderPrice(item.price);
    const merchant = typeof item.source === 'string' ? item.source : link.hostname.replace(/^www\./, '');
    const descriptionParts = [typeof item.snippet === 'string' ? item.snippet : '', typeof item.delivery === 'string' ? `Доставка: ${item.delivery}` : ''].filter(Boolean);
    candidates.push({
      title, url: link.toString(), description: descriptionParts.join(' · '), matchedQuery: query,
      price: parsed?.price ?? null, currency: parsed?.currency ?? null,
      priceSource: parsed ? 'shopping-api' : 'not-found', merchant,
      availability: 'Резултат от търговската търсачка; потвърди наличност и цена на сайта на търговеца.',
    });
  }
  return candidates;
}

async function searchBrave(query: string, location = ''): Promise<SearchCandidate[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!apiKey) return [];
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', `${query} цена строителни материали ${location}`.trim());
  url.searchParams.set('count', '10');
  url.searchParams.set('country', 'bg');
  url.searchParams.set('search_lang', 'bg');
  const response = await fetch(url, {
    headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' },
    cache: 'no-store', signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error(`Brave Search върна HTTP ${response.status}`);
  const payload = await response.json() as { web?: { results?: unknown[] } };
  const items = Array.isArray(payload.web?.results) ? payload.web.results : [];
  const candidates: SearchCandidate[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const link = typeof item.url === 'string' ? safeExternalUrl(item.url) : null;
    const title = typeof item.title === 'string' ? item.title : '';
    if (!link || !title) continue;
    candidates.push({ title, url: link.toString(), description: typeof item.description === 'string' ? item.description : '', matchedQuery: query });
  }
  return candidates;
}

async function searchWeb(query: string, location = ''): Promise<SearchDiagnostics> {
  const warnings: string[] = [];
  const usedProviders: string[] = [];
  const candidates: SearchCandidate[] = [];
  const initialTasks: Promise<{ provider: string; candidates: SearchCandidate[] }>[] = [];
  if (process.env.SERPER_API_KEY?.trim()) {
    initialTasks.push(searchSerperShopping(query, location).then(items => ({ provider: 'Google Shopping', candidates: items })).catch(error => {
      warnings.push(error instanceof Error ? error.message : 'Google Shopping търсенето е неуспешно.');
      return { provider: 'Google Shopping', candidates: [] };
    }));
  }
  if (process.env.BRAVE_SEARCH_API_KEY?.trim()) {
    initialTasks.push(searchBrave(query, location).then(items => ({ provider: 'Brave Search', candidates: items })).catch(error => {
      warnings.push(error instanceof Error ? error.message : 'Brave Search търсенето е неуспешно.');
      return { provider: 'Brave Search', candidates: [] };
    }));
  }
  const initial = await Promise.all(initialTasks);
  usedProviders.push(...initial.map(item => item.provider));
  candidates.push(...initial.flatMap(item => item.candidates));

  // Fall back to public indexers if no API provider is configured, or results contain no currency-tagged prices.
  if (!initial.length || candidates.length === 0 || !candidates.some(item => item.price != null && item.currency)) {
    const fallback = await Promise.all([
      searchBing(query).then(items => ({ provider: 'Bing RSS', items })).catch(error => {
        warnings.push(error instanceof Error ? error.message : 'Bing RSS не е достъпен.');
        return { provider: 'Bing RSS', items: [] as SearchCandidate[] };
      }),
      searchDuckDuckGo(query).then(items => ({ provider: 'DuckDuckGo HTML', items })).catch(error => {
        warnings.push(error instanceof Error ? error.message : 'DuckDuckGo не е достъпен.');
        return { provider: 'DuckDuckGo HTML', items: [] as SearchCandidate[] };
      }),
    ]);
    usedProviders.push(...fallback.map(item => item.provider));
    candidates.push(...fallback.flatMap(item => item.items));
  }

  const deduped = dedupeCandidates(candidates, 24);
  if (!deduped.length && warnings.length === 0) warnings.push('Източниците отговориха, но не върнаха продуктови страници за тази заявка. Пробвай с конкретна марка, размер или разфасовка.');
  return { candidates: deduped, provider: [...new Set(usedProviders)].join(' + ') || 'няма достъпен доставчик', warnings: [...new Set(warnings)] };
}

function broadenSearchQuery(query: string): string {
  const normalized = query.toLowerCase();
  const dimension = /(\d+(?:[.,]\d+)?\s*(?:см|сантиметра?|mm|мм|cm))/i.exec(query)?.[1] || '';
  const variants = [query];
  if (/каменна\s*вата|минерална\s*вата|rockwool|fibran|\bвата\b/i.test(normalized)) {
    if (!/минерална\s*вата/i.test(normalized)) variants.push(`минерална вата ${dimension}`.trim());
    if (!/rockwool/i.test(normalized)) variants.push(`Rockwool каменна вата ${dimension}`.trim());
    if (!/fibran/i.test(normalized)) variants.push(`Fibran минерална вата ${dimension}`.trim());
  } else if (/гипсокартон|gypsum|rigips|knauf|siniat/i.test(normalized)) {
    variants.push(`Knauf гипсокартон ${dimension}`.trim(), `Rigips гипсокартон ${dimension}`.trim(), `Siniat гипсокартон ${dimension}`.trim());
  } else if (/фасадна\s*топлоизолация|eps|xps|стиропор|топлоизолац/i.test(normalized)) {
    variants.push(`EPS фасадна топлоизолация ${dimension}`.trim(), `XPS топлоизолационни плочи ${dimension}`.trim());
  } else if (/гранитогрес|плочк|фаянс/i.test(normalized)) {
    variants.push(`гранитогрес плочки ${dimension}`.trim(), `фаянс плочки ${dimension}`.trim());
  } else if (/ламинат|паркет|подова\s*настилка/i.test(normalized)) {
    variants.push(`ламинат подова настилка цена м2`, `паркет подова настилка ${dimension}`.trim());
  } else if (/мазилк|латекс|боя|грунд/i.test(normalized)) {
    variants.push(`фасадна мазилка ${dimension}`.trim(), `латекс интериорна боя`);
  }
  return [...new Set(variants)].slice(0, 4).map(term => `"${term.replace(/["\\]/g, ' ').trim()}"`).join(' OR ').slice(0, 480);
}


function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 && value < 1_000_000_000 ? value : null;
  if (typeof value !== 'string') return null;
  let normalized = value.replace(/[\s\u00a0]/g, '').replace(/[^0-9.,]/g, '');
  if (!normalized) return null;
  const comma = normalized.lastIndexOf(',');
  const dot = normalized.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    // Bulgarian/EU decimal notation is 1.234,56; US decimal notation is 1,234.56.
    normalized = comma > dot ? normalized.replace(/\./g, '').replace(',', '.') : normalized.replace(/,/g, '');
  } else if (comma >= 0) {
    normalized = /,\d{1,2}$/.test(normalized) ? normalized.replace(',', '.') : normalized.replace(/,/g, '');
  } else if (dot >= 0 && /\.\d{3}$/.test(normalized)) {
    normalized = normalized.replace(/\./g, '');
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 && amount < 1_000_000_000 ? amount : null;
}

function parseMoneyText(value: string): number | null {
  let normalized = value.replace(/[\s\u00a0]/g, '').replace(/[^0-9.,]/g, '');
  if (!normalized) return null;
  const comma = normalized.lastIndexOf(',');
  const dot = normalized.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    // Bulgarian/EU notation: 1.234,56; otherwise accept 1,234.56 as a thousands format.
    normalized = comma > dot ? normalized.replace(/\./g, '').replace(',', '.') : normalized.replace(/,/g, '');
  } else if (comma >= 0) {
    normalized = /,\d{1,2}$/.test(normalized) ? normalized.replace(',', '.') : normalized.replace(/,/g, '');
  } else if (dot >= 0 && /\.\d{3}$/.test(normalized)) {
    normalized = normalized.replace(/\./g, '');
  }
  return parseNumber(normalized);
}

function currencyFromText(value: string): string | null {
  const upper = value.toUpperCase();
  if (upper.includes('€') || upper.includes('EUR')) return 'EUR';
  if (/ЛВ\.?|\bBGN\b/i.test(value)) return 'BGN';
  if (upper.includes('USD') || upper.includes('$')) return 'USD';
  return null;
}

/** Extract an explicitly labelled comparison price (e.g. price per m²) from the product page. */
function extractPageComparisonPrice(html: string): { price: number; currency: string; unit: string } | null {
  const visible = stripHtml(html, 1_350_000).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
  const units = [
    { pattern: /(?:цена\s*(?:за\s*)?(?:м²|м2|кв\.?\s*м|m²|m2)|price\s*(?:per\s*)?(?:m²|m2))\s*[:\-]?\s*([0-9][0-9 .,]{0,18}?)\s*(€|EUR|лв\.?|BGN)/i, unit: 'за м²' },
    { pattern: /([0-9][0-9 .,]{0,18}?)\s*(€|EUR|лв\.?|BGN)\s*(?:\/|за)\s*(?:м²|м2|кв\.?\s*м|m²|m2)(?![a-zа-я])/i, unit: 'за м²' },
    { pattern: /(?:цена\s*(?:за\s*)?(?:кг|kg)|price\s*(?:per\s*)?(?:kg))\s*[:\-]?\s*([0-9][0-9 .,]{0,18}?)\s*(€|EUR|лв\.?|BGN)/i, unit: 'за кг' },
    { pattern: /([0-9][0-9 .,]{0,18}?)\s*(€|EUR|лв\.?|BGN)\s*(?:\/|за)\s*(?:кг|kg)\b/i, unit: 'за кг' },
    { pattern: /(?:цена\s*(?:за\s*)?(?:литър|л|l)|price\s*(?:per\s*)?l)\s*[:\-]?\s*([0-9][0-9 .,]{0,18}?)\s*(€|EUR|лв\.?|BGN)/i, unit: 'за литър' },
    { pattern: /([0-9][0-9 .,]{0,18}?)\s*(€|EUR|лв\.?|BGN)\s*(?:\/|за)\s*(?:литър|л|l)\b/i, unit: 'за литър' },
  ];
  for (const entry of units) {
    const match = entry.pattern.exec(visible);
    if (!match) continue;
    const price = parseMoneyText(match[1]);
    const currency = currencyFromText(match[2]);
    if (price !== null && currency) return { price, currency, unit: entry.unit };
  }
  return null;
}

function metaContent(html: string, keys: string[]): string {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]*>`, 'i'),
      new RegExp(`<meta[^>]+itemprop=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    ];
    for (const pattern of patterns) { const match = pattern.exec(html); if (match?.[1]) return decodeEntities(match[1]); }
  }
  return '';
}

function allStructuredObjects(value: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();
  const walk = (node: unknown, depth = 0) => {
    if (depth > 12 || !node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { for (const item of node) walk(item, depth + 1); return; }
    const record = node as Record<string, unknown>;
    out.push(record);
    for (const [key, child] of Object.entries(record)) if (key === '@graph' || key === 'itemListElement' || key === 'item' || key === 'mainEntity' || key === 'offers' || key === 'hasVariant') walk(child, depth + 1);
  };
  walk(value);
  return out;
}

function typeIncludesProduct(value: unknown): boolean {
  const types = Array.isArray(value) ? value : [value];
  return types.some(type => typeof type === 'string' && (/product$/i.test(type) || /productgroup$/i.test(type)));
}

function offerRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item));
  return value && typeof value === 'object' && !Array.isArray(value) ? [value as Record<string, unknown>] : [];
}

function merchantName(urlValue: string): string {
  const url = safeExternalUrl(urlValue);
  if (!url) return 'Онлайн магазин';
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  return MATERIAL_STORES.find(item => host === item.domain || host.endsWith(`.${item.domain}`))?.name || host;
}

function inferCurrency(html: string, structuredCurrency?: unknown): string | null {
  if (typeof structuredCurrency === 'string' && /^[A-Z]{3}$/i.test(structuredCurrency)) return structuredCurrency.toUpperCase();
  const meta = metaContent(html, ['product:price:currency', 'priceCurrency', 'currency']);
  if (/^(EUR|BGN|USD|GBP)$/i.test(meta)) return meta.toUpperCase();
  const hasBgn = /лв\.?|\bBGN\b/i.test(html);
  const hasEur = /€|\bEUR\b/i.test(html);
  if (hasBgn && !hasEur) return 'BGN';
  if (hasEur && !hasBgn) return 'EUR';
  return null;
}

function inferUnit(name: string): string {
  const normalizedName = name.toLowerCase();
  if (/\b\d+(?:[.,]\d+)?\s*(?:кг|kg)\b/i.test(normalizedName)) return 'Цена за офертата/опаковката; теглото е в името — провери цената за кг.';
  if (/\b\d+(?:[.,]\d+)?\s*(?:л|литра|литър|l)\b/i.test(normalizedName)) return 'Цена за офертата/опаковката; обемът е в името — провери цената за литър.';
  if (/\b(?:м²|м2|m²|m2)\b/i.test(normalizedName) && !/\d+\s*бр/i.test(normalizedName)) return 'Провери дали цената е за м² или за цял пакет; сравни точната разфасовка.';
  return 'За офертата/продукта; провери дали сумата е за брой, пакет, метър или м².';
}

function makeOffer(input: {
  title: string; url: string; description: string; matchedQuery: string;
  price?: number | null; currency?: string | null; availability?: string;
  priceSource?: MaterialOffer['priceSource']; checkedAt?: string | null; unitLabel?: string;
  comparisonPrice?: number | null; comparisonCurrency?: string | null; comparisonUnit?: string | null;
  merchant?: string;
}): MaterialOffer | null {
  const url = safeExternalUrl(input.url);
  if (!url) return null;
  const title = stripHtml(input.title, 260) || merchantName(url.toString());
  const domain = url.hostname.toLowerCase().replace(/^www\./, '');
  const rawPrice = input.price ?? null;
  const currency = input.currency || null;
  // Do not call a bare numeric value a confirmed price when its currency is ambiguous.
  const price = rawPrice !== null && currency ? rawPrice : null;
  const source: MaterialPriceSource = price !== null ? (input.priceSource || 'product-page') : 'not-found';
  const id = `${domain}:${url.pathname}:${title}`.toLowerCase().slice(0, 500);
  const description = stripHtml(input.description, 650);
  const currencyNote = rawPrice !== null && !currency ? ' На страницата има числова стойност, но валутата не е потвърдена; провери оригиналната оферта.' : '';
  return {
    id,
    title,
    merchant: input.merchant?.trim().slice(0, 120) || merchantName(url.toString()),
    domain,
    url: url.toString(),
    price,
    currency,
    priceSource: source,
    priceCheckedAt: price !== null && source !== 'not-found' ? (input.checkedAt || new Date().toISOString()) : null,
    availability: input.availability || 'Наличността не е потвърдена от автоматичното търсене',
    unitLabel: input.unitLabel || inferUnit(title),
    comparisonPrice: input.comparisonPrice ?? null,
    comparisonCurrency: input.comparisonCurrency || null,
    comparisonUnit: input.comparisonUnit || null,
    description: `${description}${currencyNote}`.trim(),
    matchedQuery: input.matchedQuery,
  };
}

function parseSearchSnippetPrice(text: string): { price: number; currency: string } | null {
  const normalized = stripHtml(text, 1200).replace(/\u00a0/g, ' ');
  const amount = String.raw`(\d[\d.,\s]{0,18})`;
  const currency = String.raw`(€|EUR|лв\.?|BGN)`;
  const patterns = [
    new RegExp(`(?:цена|price|специална цена|онлайн цена)?\\s*${amount}\\s*${currency}`, 'i'),
    new RegExp(`${currency}\\s*${amount}`, 'i'),
  ];
  for (let index = 0; index < patterns.length; index += 1) {
    const match = patterns[index].exec(normalized);
    if (!match) continue;
    const numberText = index === 0 ? match[1] : match[2];
    const currencyText = (index === 0 ? match[2] : match[1]).toUpperCase();
    const price = parseMoneyText(numberText);
    if (price === null) continue;
    const code = currencyText.startsWith('€') || currencyText === 'EUR' ? 'EUR' : 'BGN';
    return { price, currency: code };
  }
  return null;
}

function offerWithoutPagePrice(candidate: SearchCandidate): MaterialOffer[] {
  const fallbackPrice = parseSearchSnippetPrice(candidate.description);
  if (candidate.price != null && candidate.currency) {
    const source = candidate.priceSource || 'shopping-api';
    const item = makeOffer({
      title: candidate.title, url: candidate.url,
      description: `${candidate.description || ''} ${source === 'shopping-api' ? 'Цената е върната от търговски индекс и не е потвърдена на продуктовата страница.' : ''}`.trim(),
      matchedQuery: candidate.matchedQuery, price: candidate.price, currency: candidate.currency,
      priceSource: source, merchant: candidate.merchant,
      availability: candidate.availability || 'Потвърди цена и наличност на оригиналната страница.',
    });
    return item ? [item] : [];
  }
  if (fallbackPrice) {
    const item = makeOffer({
      title: candidate.title, url: candidate.url, description: `${candidate.description} Цена от индексирания резултат; не е потвърдена на продуктовата страница.`,
      matchedQuery: candidate.matchedQuery, price: fallbackPrice.price, currency: fallbackPrice.currency,
      priceSource: 'search-snippet', merchant: candidate.merchant,
      availability: 'Цената идва от извадка на търсачката; провери страницата и наличността.',
    });
    return item ? [item] : [];
  }
  const item = makeOffer({ ...candidate, price: null, priceSource: 'not-found', merchant: candidate.merchant });
  return item ? [item] : [];
}

function productsFromJsonLd(html: string, candidate: SearchCandidate): MaterialOffer[] {
  const now = new Date().toISOString();
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const offers: MaterialOffer[] = [];
  let productRecordCount = 0;
  const parsedScripts: unknown[] = [];
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(decodeEntities(script[1].trim())) as unknown;
      parsedScripts.push(parsed);
      productRecordCount += allStructuredObjects(parsed).filter(record => typeIncludesProduct(record['@type'])).length;
    } catch { /* Ignore malformed JSON-LD script. */ }
  }
  const pageComparison = productRecordCount === 1 ? extractPageComparisonPrice(html) : null;
  for (const parsed of parsedScripts) {
    for (const record of allStructuredObjects(parsed)) {
      if (!typeIncludesProduct(record['@type'])) continue;
      const name = typeof record.name === 'string' ? record.name : candidate.title;
      const productUrl = typeof record.url === 'string' ? safeMerchantUrl(record.url, candidate.url)?.toString() || candidate.url : candidate.url;
      const images = typeof record.image === 'string' ? record.image : '';
      void images;
      const offerData = offerRecords(record.offers);
      const source = offerData.length ? offerData : [record];
      for (const priceRecord of source) {
        const priceSpecification = priceRecord.priceSpecification && typeof priceRecord.priceSpecification === 'object' ? priceRecord.priceSpecification as Record<string, unknown> : {};
        const price = parseNumber(priceRecord.price ?? priceRecord.lowPrice ?? priceSpecification.price ?? record.price);
        if (price === null) continue;
        const currency = inferCurrency(html, priceRecord.priceCurrency ?? priceSpecification.priceCurrency ?? record.priceCurrency);
        const rawAvailability = typeof priceRecord.availability === 'string' ? priceRecord.availability : '';
        const availability = /instock/i.test(rawAvailability) ? 'Обявена наличност (провери при поръчка)' : /outofstock|soldout/i.test(rawAvailability) ? 'Страницата обозначава продукта като неналичен' : 'Наличността трябва да се провери при търговеца';
        const comparison = pageComparison;
        const item = makeOffer({ title: name, url: productUrl, description: candidate.description, matchedQuery: candidate.matchedQuery, price, currency, availability, priceSource: 'product-page', checkedAt: now, unitLabel: inferUnit(name), comparisonPrice: comparison?.price ?? null, comparisonCurrency: comparison?.currency ?? null, comparisonUnit: comparison?.unit ?? null });
        if (item) offers.push(item);
      }
    }
  }
  if (offers.length) return offers;

  const metaPrice = parseNumber(metaContent(html, ['product:price:amount', 'og:price:amount', 'price', 'priceAmount']));
  if (metaPrice !== null) {
    const metaTitle = metaContent(html, ['og:title', 'twitter:title']) || /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || candidate.title;
    const currency = inferCurrency(html);
    const availabilityText = /outofstock|няма наличност|изчерпан/i.test(stripHtml(html, 70000)) ? 'Страницата указва липса на наличност' : 'Наличността трябва да се провери при търговеца';
    const comparison = extractPageComparisonPrice(html);
    const item = makeOffer({ title: stripHtml(metaTitle, 260), url: candidate.url, description: candidate.description, matchedQuery: candidate.matchedQuery, price: metaPrice, currency, availability: availabilityText, priceSource: 'product-page', checkedAt: now, unitLabel: inferUnit(metaTitle), comparisonPrice: comparison?.price ?? null, comparisonCurrency: comparison?.currency ?? null, comparisonUnit: comparison?.unit ?? null });
    if (item) return [item];
  }
  return [];
}

/** Extract a price only from an explicitly marked price element, not arbitrary numbers in page text. */
function extractMarkedPagePrice(html: string): { price: number; currency: string } | null {
  const tagPattern = /<(span|div|p|strong|ins|b)[^>]*(?:class|id|itemprop|data-testid)=["'][^"']*(?:price|amount|cost)[^"']*["'][^>]*>([\s\S]{1,500}?)<\/\1>/gi;
  const candidates: { priority: number; parsed: { price: number; currency: string } }[] = [];
  for (const match of html.matchAll(tagPattern)) {
    const opening = match[0].slice(0, match[0].indexOf('>') + 1).toLowerCase();
    if (/old-price|was-price|regular-price|previous-price|price-old|compare-at/i.test(opening)) continue;
    const text = stripHtml(match[2], 500);
    const parsed = parseProviderPrice(text);
    if (!parsed) continue;
    const priority = /current-price|sale-price|product-price|price-current|price-now/i.test(opening) ? 0 : 1;
    candidates.push({ priority, parsed });
  }
  candidates.sort((a, b) => a.priority - b.priority);
  return candidates[0]?.parsed || null;
}

async function fetchAllowlistedProductPage(startUrl: URL): Promise<Response> {
  let current = startUrl;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const response = await fetch(current, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
      cache: 'no-store', signal: AbortSignal.timeout(5500), redirect: 'manual',
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location) return response;
    const next = safeMerchantUrl(location, current.toString());
    try { await response.body?.cancel(); } catch { /* Ignore cancellation errors. */ }
    if (!next) throw new Error('Пренасочване към непозволен домейн е блокирано.');
    current = next;
  }
  throw new Error('Прекалено много пренасочвания към продуктовата страница.');
}

async function enrichCandidate(candidate: SearchCandidate): Promise<MaterialOffer[]> {
  const safe = safeMerchantUrl(candidate.url);
  // Non-allowlisted public product URLs from shopping/search providers can be displayed, but never fetched by this server.
  if (!safe) return offerWithoutPagePrice(candidate);
  try {
    const response = await fetchAllowlistedProductPage(safe);
    const finalUrl = safeMerchantUrl(response.url || safe.toString());
    if (!response.ok || !finalUrl) return offerWithoutPagePrice({ ...candidate, url: safe.toString() });
    const html = await readTextLimited(response, 1_400_000);
    const finalCandidate = { ...candidate, url: finalUrl.toString() };
    const structured = productsFromJsonLd(html, finalCandidate);
    if (structured.length) return structured.slice(0, 4);
    // If the store omits JSON-LD, try only explicit product-price elements; never infer from unrelated body numbers.
    const markedPrice = extractMarkedPagePrice(html);
    if (markedPrice) {
      const title = metaContent(html, ['og:title', 'twitter:title']) || /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || candidate.title;
      const item = makeOffer({
        title: stripHtml(title, 260), url: finalUrl.toString(), description: candidate.description,
        matchedQuery: candidate.matchedQuery, price: markedPrice.price, currency: markedPrice.currency,
        priceSource: 'product-page', checkedAt: new Date().toISOString(), merchant: candidate.merchant,
        availability: 'Цената е извлечена от маркиран ценови елемент; провери вариант, ДДС и наличност.',
      });
      if (item) return [item];
    }
    const title = metaContent(html, ['og:title', 'twitter:title']) || /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || candidate.title;
    return offerWithoutPagePrice({ ...candidate, title: stripHtml(title, 260), url: finalUrl.toString() });
  } catch {
    return offerWithoutPagePrice(candidate);
  }
}

function splitQueries(body: Record<string, unknown>): string[] {
  const incoming = Array.isArray(body.queries) ? body.queries : [body.query];
  const queries = incoming.flatMap(value => typeof value === 'string' ? value.split(/[\n;|]+/) : [])
    .map(value => value.replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120))
    .filter(value => value.length >= 2);
  return [...new Set(queries)].slice(0, 3);
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Невалидна заявка за търсене.' }, { status: 400 });
    }
    const record = body as Record<string, unknown>;
    const queries = splitQueries(record);
    const location = typeof record.location === 'string'
      ? record.location.replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)
      : '';
    if (!queries.length) {
      return NextResponse.json({ error: 'Въведи поне една дума за материал, продукт или строителна дейност.' }, { status: 400 });
    }

    const diagnostics: SearchDiagnostics[] = await Promise.all(queries.map(async query => {
      try {
        const direct = await searchWeb(query, location);
        if (direct.candidates.length > 0) return direct;
        // A second, broader query is only attempted when the original search found nothing.
        const broadened = broadenSearchQuery(query);
        if (!broadened || broadened === query) return direct;
        const second = await searchWeb(broadened, location);
        return {
          candidates: dedupeCandidates([...direct.candidates, ...second.candidates], 24),
          provider: [...new Set([direct.provider, second.provider].filter(Boolean))].join(' + '),
          warnings: [...direct.warnings, ...second.warnings],
        };
      } catch (error) {
        return {
          candidates: [], provider: 'няма достъпен доставчик',
          warnings: [error instanceof Error ? error.message : 'Търсенето на материали не е успешно.'],
        } satisfies SearchDiagnostics;
      }
    }));

    const provider = [...new Set(diagnostics.map(item => item.provider).filter(Boolean))].join(' · ');
    const providerWarnings = [...new Set(diagnostics.flatMap(item => item.warnings))].slice(0, 6);
    const allCandidates = dedupeCandidates(diagnostics.flatMap(item => item.candidates), 40);
    // Prioritize candidates that already have a real currency-tagged price, then pages we are allowed to verify.
    allCandidates.sort((a, b) => {
      const pricePriority = Number(b.price != null && b.currency != null) - Number(a.price != null && a.currency != null);
      if (pricePriority) return pricePriority;
      const pagePriority = Number(Boolean(safeMerchantUrl(b.url))) - Number(Boolean(safeMerchantUrl(a.url)));
      if (pagePriority) return pagePriority;
      return a.title.localeCompare(b.title, 'bg');
    });

    // Limit direct page fetches; search APIs already return live product results for many merchants.
    const candidates = allCandidates.slice(0, 12);
    const enriched = await Promise.all(candidates.map(candidate => enrichCandidate(candidate).catch(() => offerWithoutPagePrice(candidate))));
    const resultsMap = new Map<string, MaterialOffer>();
    for (const item of enriched.flat()) {
      if (!item) continue;
      const key = `${item.domain}|${item.url}|${item.title}`.toLowerCase();
      const prior = resultsMap.get(key);
      const sourceRank = (value: MaterialOffer | undefined) => value?.priceSource === 'product-page' ? 3 : value?.priceSource === 'shopping-api' ? 2 : value?.priceSource === 'search-snippet' ? 1 : 0;
      if (!prior || sourceRank(item) > sourceRank(prior) || (prior.price === null && item.price !== null)) resultsMap.set(key, item);
    }
    const results = [...resultsMap.values()]
      .sort((a, b) => {
        const rank = (item: MaterialOffer) => item.priceSource === 'product-page' ? 3 : item.priceSource === 'shopping-api' ? 2 : item.priceSource === 'search-snippet' ? 1 : 0;
        return rank(b) - rank(a) || (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY);
      })
      .slice(0, 30);

    const storeSearchLinks = MATERIAL_STORES.map(store => ({
      name: store.name,
      domain: store.domain,
      categories: store.categories,
      kind: store.kind,
      url: materialStoreSearchLink(store, queries[0], location),
    }));
    const notes = [
      provider ? `Източници за търсене: ${provider}.` : 'Не беше наличен доставчик за онлайн търсене.',
      '„Цена от страницата“ е извлечена от продуктовата страница. „Google Shopping“/„индексиран резултат“ е цена от външен индекс и трябва да се потвърди при търговеца.',
      'За надеждно търсене на ценови оферти може да се конфигурира SERPER_API_KEY (Google Shopping). BRAVE_SEARCH_API_KEY е алтернативен доставчик на уеб резултати. Без тези ключове приложението пробва публичните RSS/HTML търсения, които могат да бъдат ограничени от доставчика или хостинга.',
      'Ако не е установена валута, цената не се показва като потвърдена. Цени за пакет, брой, м², кг и литър не са взаимозаменяеми.',
      'Градът за доставка участва в заявката, но цена за адрес, транспорт, ДДС, наличност и крайна оферта се потвърждават от магазина.',
      ...(results.length === 0 ? ['Не са получени проверими продуктови резултати. Отвори директните търсения по магазини или конфигурирай SERPER_API_KEY в Kuso за Google Shopping резултати.'] : []),
      ...providerWarnings.map(item => `Предупреждение от източник: ${item}`),
    ];

    const response: MaterialSearchResult = {
      query: queries.join(' · '),
      queries,
      location: location || undefined,
      checkedAt: new Date().toISOString(),
      results,
      storeSearchLinks,
      searchProvider: provider || 'не е установен',
      providerWarnings,
      notes,
    };
    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('BuildAI material search error:', error);
    return NextResponse.json({
      error: 'Онлайн търсенето на материали временно не е достъпно. Провери настройките на търсачката в Kuso. Директните търсения по магазини остават достъпни.',
    }, { status: 502 });
  }
}
