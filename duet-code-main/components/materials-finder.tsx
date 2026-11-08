'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowUpRight, CheckCircle2, CircleAlert, Clock3, ExternalLink, LoaderCircle, PackageSearch, Search, Store, Tags } from 'lucide-react';
import type { MaterialOffer, MaterialSearchResult, MaterialPriceSource } from '@/lib/materials';
import { MATERIAL_STORES, MATERIAL_STORE_KIND_LABELS, materialStoreSearchLink } from '@/lib/material-stores';

type MaterialsFinderProps = {
  initialQuery?: string;
  initialResults?: MaterialOffer[];
  initialCheckedAt?: string;
  initialStoreSearchLinks?: MaterialSearchResult['storeSearchLinks'];
  initialNotes?: string[];
  initialStatus?: 'idle' | 'loading' | 'ready' | 'error';
  initialError?: string;
  onResults?: (result: MaterialSearchResult) => void;
};

type MaterialsResultsProps = {
  results: MaterialOffer[];
  checkedAt?: string;
  status?: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
  storeSearchLinks?: MaterialSearchResult['storeSearchLinks'];
  query?: string;
  notes?: string[];
  compact?: boolean;
};

function formatDate(value?: string | null) {
  if (!value) return 'Не е проверена цена';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Неизвестна дата' : date.toLocaleString('bg-BG', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatPrice(price: number | null, currency?: string | null): string {
  if (price === null) return 'Цена не е извлечена';
  const amount = price.toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!currency) return `${amount} · валутата не е разпозната`;
  const symbol: Record<string, string> = { EUR: '€', BGN: 'лв.', USD: '$', GBP: '£' };
  return `${amount} ${symbol[currency.toUpperCase()] || currency.toUpperCase()}`;
}

function normalizeMaterialOffer(raw: unknown, index: number): MaterialOffer | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.title !== 'string' || typeof value.url !== 'string') return null;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value.url);
    if ((parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') || parsedUrl.username || parsedUrl.password) return null;
  } catch { return null; }
  const price = typeof value.price === 'number' && Number.isFinite(value.price) && value.price > 0 ? value.price : null;
  const currency = typeof value.currency === 'string' && value.currency.trim() ? value.currency.trim().toUpperCase() : null;
  const knownSources: MaterialPriceSource[] = ['product-page', 'shopping-api', 'search-snippet', 'not-found'];
  const source = typeof value.priceSource === 'string' && knownSources.includes(value.priceSource as MaterialPriceSource)
    ? value.priceSource as MaterialPriceSource : price === null ? 'not-found' : 'search-snippet';
  const textOr = (key: string, fallback: string) => typeof value[key] === 'string' ? (value[key] as string).slice(0, 1200) : fallback;
  return {
    id: textOr('id', `${parsedUrl.hostname}:${index}:${value.title}`).slice(0, 500),
    title: value.title.slice(0, 260),
    merchant: textOr('merchant', parsedUrl.hostname),
    domain: textOr('domain', parsedUrl.hostname.replace(/^www\./, '')),
    url: parsedUrl.toString(),
    price: price !== null && currency ? price : null,
    currency,
    priceSource: price !== null && currency ? source : 'not-found',
    priceCheckedAt: typeof value.priceCheckedAt === 'string' ? value.priceCheckedAt : null,
    availability: textOr('availability', 'Наличността трябва да се потвърди при търговеца.'),
    unitLabel: textOr('unitLabel', 'Провери разфасовката и мерната единица на продуктовата страница.'),
    comparisonPrice: typeof value.comparisonPrice === 'number' && Number.isFinite(value.comparisonPrice) ? value.comparisonPrice : null,
    comparisonCurrency: typeof value.comparisonCurrency === 'string' ? value.comparisonCurrency : null,
    comparisonUnit: typeof value.comparisonUnit === 'string' ? value.comparisonUnit : null,
    description: textOr('description', ''),
    matchedQuery: textOr('matchedQuery', ''),
  };
}

function makeStoreLinks(query: string, location = ''): MaterialSearchResult['storeSearchLinks'] {
  return MATERIAL_STORES.map(store => ({
    name: store.name,
    domain: store.domain,
    categories: store.categories,
    kind: store.kind,
    url: materialStoreSearchLink(store, query, location),
  }));
}

export function MaterialsResults({ results, checkedAt, status = 'ready', error = '', storeSearchLinks, query = '', notes = [], compact = false }: MaterialsResultsProps) {
  const priceCount = results.filter(item => item.price !== null && item.priceSource === 'product-page').length;
  const shoppingCount = results.filter(item => item.price !== null && item.priceSource === 'shopping-api').length;
  const snippetCount = results.filter(item => item.price !== null && item.priceSource === 'search-snippet').length;
  const storeLinks = storeSearchLinks?.length ? storeSearchLinks : makeStoreLinks(query || results[0]?.matchedQuery || 'строителни материали');
  const storeGroups = (['retailer', 'catalog', 'manufacturer'] as const)
    .map(kind => ({ kind, label: MATERIAL_STORE_KIND_LABELS[kind], stores: storeLinks.filter(store => (store.kind || 'retailer') === kind) }))
    .filter(group => group.stores.length > 0);
  return <div className={`materials-results ${compact ? 'compact' : ''}`}>
    <div className="materials-results-heading">
      <div><span className="materials-section-kicker"><PackageSearch size={14} /> ОНЛАЙН ОФЕРТИ</span><h3>Намерени материали и цени</h3><p>Търсене в ценови индекси и публични продуктови страници; всяка цена е означена според източника си.</p></div>
      <div className="materials-result-count"><strong>{results.length}</strong><span>резултата</span></div>
    </div>
    {checkedAt && <div className="materials-checked-line"><Clock3 size={13} /> Проверено: {formatDate(checkedAt)} · {priceCount} от продуктови страници · {shoppingCount} от Shopping индекс · {snippetCount} от откъс на търсачка</div>}
    {status === 'loading' && <div className="materials-state"><LoaderCircle className="spin" size={19} /><div><strong>Проверявам онлайн оферти…</strong><span>Сравнявам публични страници и извличам цени само когато са налични в данните на страницата.</span></div></div>}
    {status === 'error' && <div className="materials-error"><CircleAlert size={17} /><span>{error || 'Търсенето временно не е достъпно.'}</span></div>}
    {status !== 'loading' && results.length === 0 && status !== 'error' && <div className="materials-state"><Search size={19} /><div><strong>Все още няма намерени оферти</strong><span>Пробвай с конкретен продукт, марка и разфасовка. Ако търсенето не върне резултати, отвори „Директни търсения в още магазини“ по-долу или конфигурирай SERPER_API_KEY в Kuso за по-надеждни ценови резултати.</span></div></div>}
    <div className="materials-offer-grid">
      {results.map((offer, index) => <article className="material-offer-card" key={offer.id || `${offer.url}-${index}`}>
        <div className="material-offer-meta"><span><Store size={12} /> {offer.merchant}</span><span className={offer.priceSource === 'product-page' ? 'price-confirmed' : 'price-unconfirmed'}>{offer.priceSource === 'product-page' ? <><CheckCircle2 size={12} /> Цена от страницата</> : offer.priceSource === 'shopping-api' ? <><CircleAlert size={12} /> Shopping индекс · потвърди</> : offer.priceSource === 'search-snippet' ? <><CircleAlert size={12} /> Откъс от търсачка · потвърди</> : <><CircleAlert size={12} /> Цена не е извлечена</>}</span></div>
        <h4>{offer.title}</h4>
        <div className={`material-offer-price ${offer.price === null ? 'no-price' : ''}`}>{formatPrice(offer.price, offer.currency)}</div>{(offer.priceSource === 'search-snippet' || offer.priceSource === 'shopping-api') && <p className="material-price-warning">Тази цена е от външен индекс и не е потвърдена на самата продуктова страница. Провери цена, валута, разфасовка и наличност преди покупка.</p>}
        {typeof offer.comparisonPrice === 'number' && <p className="material-comparison-price">Още от страницата: <strong>{formatPrice(offer.comparisonPrice, offer.comparisonCurrency)}</strong> {offer.comparisonUnit || ''}</p>}
        <p className="material-unit-label"><Tags size={12} /> {offer.unitLabel || 'Мерната единица не е надеждно установена; провери разфасовката на страницата.'}</p>
        {offer.description && <p className="material-offer-description">{offer.description}</p>}
        <div className="material-offer-foot"><span title={offer.availability}>{offer.availability}</span>{offer.priceCheckedAt && <small>Цената е прочетена: {formatDate(offer.priceCheckedAt)}</small>}</div>
        <a className="material-offer-link" href={offer.url} target="_blank" rel="noopener noreferrer">Отвори офертата <ExternalLink size={13} /></a>
      </article>)}
    </div>
    {storeLinks.length > 0 && <details className="materials-direct-searches"><summary><ArrowUpRight size={14} /> Директни търсения в магазини и каталози ({storeLinks.length})</summary>{storeGroups.map(group => <div className="materials-store-group" key={group.kind}><h4>{group.label}</h4><div className="materials-store-links">{group.stores.map(store => <a key={store.domain} href={store.url} target="_blank" rel="noopener noreferrer"><strong>{store.name}</strong><span>{store.categories.join(' · ')}</span><ExternalLink size={12} /></a>)}</div></div>)}</details>}
    {notes.length > 0 && <ul className="materials-source-notes">{notes.slice(0, 6).map((note, index) => <li key={`${index}-${note.slice(0, 32)}`}>{note}</li>)}</ul>}
    <p className="materials-disclaimer">BuildAI не е търговец и не гарантира наличност, доставка или крайна цена. Цената от продуктова страница е автоматично извлечената стойност при проверката, а не гаранция за покупка. Провери спецификацията, мерната единица, ДДС, доставка и наличност на самата страница. Цени на различни разфасовки не са директно сравними.</p>
  </div>;
}

export default function MaterialsFinder({ initialQuery = '', initialResults = [], initialCheckedAt = '', initialStoreSearchLinks, initialNotes = [], initialStatus, initialError = '', onResults }: MaterialsFinderProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<MaterialOffer[]>(initialResults);
  const [checkedAt, setCheckedAt] = useState(initialCheckedAt);
  const [storeSearchLinks, setStoreSearchLinks] = useState<MaterialSearchResult['storeSearchLinks']>(initialStoreSearchLinks || []);
  const [notes, setNotes] = useState<string[]>(initialNotes);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(initialStatus || (initialResults.length || initialCheckedAt ? 'ready' : 'idle'));
  const [error, setError] = useState(initialError);
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('relevance');

  useEffect(() => { if (initialQuery) setQuery(initialQuery); }, [initialQuery]);
  useEffect(() => { setResults(initialResults); if (initialCheckedAt) setCheckedAt(initialCheckedAt); if (initialStoreSearchLinks?.length) setStoreSearchLinks(initialStoreSearchLinks); setNotes(initialNotes); }, [initialResults, initialCheckedAt, initialStoreSearchLinks, initialNotes]);

  const visibleResults = useMemo(() => {
    let items = [...results];
    if (category === 'priced') items = items.filter(item => item.price !== null && item.priceSource !== 'not-found');
    if (category === 'no-price') items = items.filter(item => item.price === null);
    if (sort === 'low') return items.sort((a, b) => (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY));
    if (sort === 'merchant') return items.sort((a, b) => a.merchant.localeCompare(b.merchant, 'bg'));
    return items;
  }, [results, category, sort]);

  async function searchMaterials(event?: FormEvent) {
    event?.preventDefault();
    const terms = query.split(/[\n;,]+/).map(item => item.trim()).filter(Boolean).slice(0, 3);
    if (!terms.length) { setError('Въведи материал или продукт за търсене.'); setStatus('error'); return; }
    setStatus('loading'); setError(''); setResults([]); setNotes([]);
    try {
      const response = await fetch('/api/materials/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queries: terms, location: location.trim() }) });
      const raw = await response.text();
      let payload: unknown;
      try { payload = JSON.parse(raw); } catch { throw new Error(`Сървърът върна неочакван отговор (HTTP ${response.status}).`); }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Невалиден отговор от търсачката.');
      const data = payload as Partial<MaterialSearchResult> & { error?: string };
      if (!response.ok) throw new Error(data.error || `Търсенето не успя (HTTP ${response.status}).`);
      const normalized: MaterialSearchResult = {
        query: typeof data.query === 'string' ? data.query : terms.join(' · '),
        queries: Array.isArray(data.queries) ? data.queries.filter((item): item is string => typeof item === 'string') : terms,
        checkedAt: typeof data.checkedAt === 'string' ? data.checkedAt : new Date().toISOString(),
        results: Array.isArray(data.results) ? data.results.map((item, index) => normalizeMaterialOffer(item, index)).filter((item): item is MaterialOffer => item !== null) : [],
        storeSearchLinks: Array.isArray(data.storeSearchLinks) ? data.storeSearchLinks as MaterialSearchResult['storeSearchLinks'] : makeStoreLinks(terms[0], location),
        notes: Array.isArray(data.notes) ? data.notes.filter((item): item is string => typeof item === 'string') : [],
        location: typeof data.location === 'string' ? data.location : location,
        searchProvider: typeof data.searchProvider === 'string' ? data.searchProvider : undefined,
        providerWarnings: Array.isArray(data.providerWarnings) ? data.providerWarnings.filter((item): item is string => typeof item === 'string') : [],
      };
      setResults(normalized.results); setCheckedAt(normalized.checkedAt); setStoreSearchLinks(normalized.storeSearchLinks); setNotes(normalized.notes); setStatus('ready');
      onResults?.(normalized);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Неуспешно търсене.'); setStoreSearchLinks(makeStoreLinks(terms[0], location)); setStatus('error');
    }
  }

  const categoryOptions = [
    ['all', 'Всички резултати'], ['priced', 'Само с извлечена цена'], ['no-price', 'Без извлечена цена'],
  ];

  return <section className="materials-page" aria-label="Каталог строителни и интериорни материали">
    <header className="materials-page-hero"><div className="materials-page-icon"><PackageSearch size={23} /></div><div><span className="materials-section-kicker">BUILDAI · РЕСУРСИ И ЦЕНИ</span><h1>Материали и реални онлайн оферти</h1><p>Търси строителни, фасадни, интериорни, санитарни и градински материали в публични продуктови страници и ценови индекси. Резултатите са live при работещ източник; цената винаги е означена според произхода си.</p></div></header>
    <form className="materials-search-form" onSubmit={searchMaterials}>
      <label className="materials-query-field"><span>Какъв материал търсиш?</span><textarea value={query} onChange={event => setQuery(event.target.value)} rows={2} maxLength={300} placeholder={'Напр. фасадна каменна вата 10 см; лепило за топлоизолация 25 кг; латекс 10 л'} /></label>
      <div className="materials-search-row"><label><span>Град за доставка (по избор)</span><input value={location} onChange={event => setLocation(event.target.value)} maxLength={100} placeholder="Напр. Пазарджик" /></label><button className="primary-button" type="submit" disabled={status === 'loading'}>{status === 'loading' ? <LoaderCircle size={17} className="spin" /> : <Search size={17} />} Търси цени</button></div>
      <div className="materials-quick-searches"><span>Бързо търсене:</span>{['гипсокартон 12,5 мм', 'каменна вата 10 см', 'фасадна мазилка', 'ламинат клас 32', 'гранитогрес 60×60', 'лепило за плочки 25 кг'].map(item => <button type="button" key={item} onClick={() => setQuery(item)}>{item}</button>)}</div>
    </form>
    <div className="materials-toolbar"><div><strong>Намерени предложения</strong><span>{results.length} резултата · {results.filter(item => item.price !== null && item.priceSource === 'product-page').length} от страница · {results.filter(item => item.price !== null && item.priceSource === 'shopping-api').length} от Shopping индекс · сортировка по цена на офертата</span></div><div><select aria-label="Филтър на резултатите" value={category} onChange={event => setCategory(event.target.value)}>{categoryOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><select aria-label="Сортиране на резултатите" value={sort} onChange={event => setSort(event.target.value)}><option value="relevance">По релевантност</option><option value="low">Цена на офертата ↑</option><option value="merchant">По търговец</option></select></div></div>
    <MaterialsResults results={visibleResults} checkedAt={checkedAt} status={status} error={error} storeSearchLinks={storeSearchLinks} query={query} notes={notes} />
    <section className="materials-source-catalog"><div><span className="materials-section-kicker"><Store size={14} /> ИЗТОЧНИЦИ</span><h2>Проверявани сайтове</h2><p>Търсенето използва публично индексирани страници и извлича цена от Product/Offer JSON-LD или ценови метаданни, когато са достъпни. Проверяват се магазини, каталози и производители; пълният списък с домейни е в lib/material-stores.ts. Някои сайтове блокират автоматичното прочитане или публикуват цената само след избор на магазин/вариант; тогава виждаш линк без предполагаема цена.</p></div>{(['retailer', 'catalog', 'manufacturer'] as const).map(kind => { const stores = MATERIAL_STORES.filter(store => store.kind === kind); return stores.length ? <div className="materials-source-group" key={kind}><h3>{MATERIAL_STORE_KIND_LABELS[kind]}</h3><div className="materials-source-pills">{stores.map(store => <span key={store.domain}>{store.name}</span>)}</div></div> : null; })}</section>
  </section>;
}
