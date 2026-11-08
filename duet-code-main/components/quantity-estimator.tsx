'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calculator, Check, Download, ExternalLink, LoaderCircle, PackageSearch, Plus, RotateCcw, Search, ShieldAlert, Truck, Wallet } from 'lucide-react';
import type { MaterialOffer } from '@/lib/materials';
import { calculateEstimateTotals, type EstimateLine, type QuantityEstimate } from '@/lib/project-store';

type WorkType = QuantityEstimate['workType'];
type Spec = { key: string; name: string; query: string; unit: string; factor: number; whole?: boolean; perimeter?: boolean; note: string };

const WORKS: Record<WorkType, { label: string; description: string; laborLabel: string; specs: Spec[] }> = {
  'facade-insulation': { label: 'Фасадна топлоизолация', description: 'Пакет материали за фасадна система; точната система се потвърждава от проектант/изпълнител.', laborLabel: 'Труд на m²', specs: [
    { key:'insulation', name:'Изолационни плочи', query:'фасадна топлоизолационна плоча 100 мм цена m2', unit:'m²', factor:1, note:'5% резерв плюс отпадък' },
    { key:'adhesive', name:'Лепило за изолация · торба 25 kg', query:'лепило за топлоизолация 25 кг цена', unit:'торба 25 kg', factor:0.21, whole:true, note:'Ориентир около 5 kg/m²; проверявай разхода на производителя' },
    { key:'mesh', name:'Армираща мрежа · ролка 50 m²', query:'фасадна армираща мрежа ролка 50 m2 цена', unit:'ролка 50 m²', factor:0.02, whole:true, note:'Резервът за застъпване се добавя към площта' },
    { key:'anchors', name:'Дюбели · пакет 100 бр.', query:'фасадни дюбели топлоизолация 100 броя цена', unit:'пакет 100 бр.', factor:0.06, whole:true, note:'Базов ориентир 6 бр./m² за пакет 100 бр.; проектът може да изисква друго' },
    { key:'basecoat', name:'Шпакловка за фасада · торба 25 kg', query:'фасадна шпакловка 25 кг цена', unit:'торба 25 kg', factor:0.18, whole:true, note:'Приблизително 4–5 kg/m²' },
    { key:'primer', name:'Грунд · туба 10 l', query:'фасаден грунд 10 литра цена', unit:'туба 10 l', factor:0.02, whole:true, note:'Ориентир за 10 l опаковка; покривността зависи от основата' },
    { key:'finish', name:'Декоративна мазилка · кофа 25 kg', query:'декоративна фасадна мазилка 25 кг цена', unit:'кофа 25 kg', factor:0.11, whole:true, note:'Разходът зависи от структурата и зърнометрията' },
  ]},
  'interior-paint': { label:'Боядисване на стени', description:'Ориентир за грундиране и боядисване; въведи реалната боядисвана площ, не подова площ.', laborLabel:'Труд на m²', specs:[
    {key:'primer',name:'Интериорен грунд · туба 5 l',query:'интериорен грунд 5 литра цена',unit:'туба 5 l',factor:0.025,whole:true,note:'Покривност по етикет' },
    {key:'paint',name:'Интериорна боя · кофа 10 l',query:'интериорна боя 10 литра цена',unit:'кофа 10 l',factor:0.025,whole:true,note:'Базов ориентир за два слоя; зависи от покривността' },
    {key:'filler',name:'Фина шпакловка · торба 20 kg',query:'фина шпакловка 20 кг цена',unit:'торба 20 kg',factor:0.055,whole:true,note:'Само ако е нужна подготовка на основата' },
    {key:'tape',name:'Хартиено тиксо · ролка',query:'хартиено тиксо за боядисване цена ролка',unit:'ролка',factor:0.03,whole:true,note:'Опростен резерв; коригирай спрямо отворите' },
  ]},
  'flooring': { label:'Подова настилка / плочки', description:'Материали за полагане на настилка; основата, подложката и нивелацията могат да променят сметката.', laborLabel:'Труд на m²', specs:[
    {key:'floor',name:'Подова настилка / плочки',query:'гранитогрес подови плочки цена m2',unit:'m²',factor:1,note:'Резервът за отпадък се добавя чрез отделното поле' },
    {key:'adhesive',name:'Лепило за плочки · торба 25 kg',query:'лепило за плочки 25 кг цена',unit:'торба 25 kg',factor:0.2,whole:true,note:'Ориентир около 5 kg/m²' },
    {key:'grout',name:'Фугираща смес · пакет 5 kg',query:'фугираща смес 5 кг цена',unit:'пакет 5 kg',factor:0.1,whole:true,note:'Разходът зависи от размера на плочката и фугата' },
    {key:'primer',name:'Грунд за под · туба 5 l',query:'грунд за под 5 литра цена',unit:'туба 5 l',factor:0.04,whole:true,note:'При нужда според основата' },
  ]},
  'roof': { label:'Покривно обновяване', description:'Опростена оценка за покривна площ, не застроена площ. Геометрия, обшивки, скатове и безопасност изискват оглед.', laborLabel:'Труд на m²', specs:[
    {key:'roofing',name:'Покривно покритие',query:'покривни керемиди цена m2',unit:'m²',factor:1,note:'Резервът за отпадък се добавя чрез отделното поле; измери реалните скатове' },
    {key:'membrane',name:'Подпокривна мембрана · ролка 75 m²',query:'подпокривна мембрана ролка цена',unit:'ролка 75 m²',factor:0.0134,whole:true,note:'Ориентир за ролка 75 m²; резервът се добавя отделно' },
    {key:'batten',name:'Летви / контралетви',query:'дървени летви за покрив цена линеен метър',unit:'л.м.',factor:3,note:'Ориентировъчно 3 линейни метра на m² покрив' },
    {key:'fasteners',name:'Крепеж · пакет',query:'крепеж за покрив керемиди пакет цена',unit:'пакет',factor:0.02,whole:true,note:'Според системата и изложението' },
  ]},
  'public-paving': { label:'Настилка за обществен терен', description:'Първоначален ориентир; проектът трябва да уточни земни работи, носимоспособност и отводняване.', laborLabel:'Труд на m²', specs:[
    {key:'paver',name:'Павета / плочи за външно',query:'бетонови павета цена m2',unit:'m²',factor:1,note:'Резервът за отпадък се добавя чрез отделното поле' },
    {key:'sand',name:'Полагъчен пясък · чувал / насипно',query:'пясък за полагане павета цена',unit:'m³',factor:0.05,note:'Ориентир, дебелината трябва да е по проект' },
    {key:'base',name:'Трошен камък за основа',query:'трошен камък фракция цена тон',unit:'тон',factor:0.18,note:'Ориентировъчен обем; уплътняването и земната основа са решаващи' },
    {key:'curb',name:'Бордюри',query:'бетонов бордюр цена линеен метър',unit:'л.м.',factor:1,perimeter:true,note:'Въведи реален периметър; резервът се добавя отделно' },
  ]},
};

const EUR_BGN = 1.95583;
const defaultEstimate = (workType: WorkType = 'facade-insulation'): QuantityEstimate => ({ workType, areaM2:100, wastePercent:5, laborRatePerM2:18, transportCost:100, contingencyPercent:10, vatPercent:20, pricesIncludeVat:true, perimeterM:40, currency:'EUR', lines:[], updatedAt:new Date().toISOString() });
function roundQty(value: number) { return Math.max(0, Math.ceil(value)); }
function buildLines(workType: WorkType, area: number, waste: number, perimeter: number, prior: EstimateLine[] = []): EstimateLine[] {
  const existing = new Map(prior.map(line => [line.key, line]));
  const adjustedArea = Math.max(0, area) * (1 + Math.max(0, waste) / 100);
  return WORKS[workType].specs.map(spec => {
    const quantity = spec.perimeter ? Math.max(0, perimeter) * spec.factor * (1 + Math.max(0, waste) / 100) : adjustedArea * spec.factor;
    const computed = spec.whole ? roundQty(quantity) : Math.round(quantity * 100) / 100;
    const old = existing.get(spec.key);
    return { id: old?.id || `${workType}-${spec.key}`, key: spec.key, name: spec.name, searchQuery: spec.query, unit: spec.unit, quantity: computed, unitPrice: old?.unitPrice ?? null, currency: old?.currency || 'EUR', merchant: old?.merchant || '', sourceUrl: old?.sourceUrl || '', priceSource: old?.priceSource || 'not-found', priceCheckedAt: old?.priceCheckedAt || '', priceNotes: old?.priceNotes || spec.note };
  });
}
function num(value: string, min: number, max: number) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : min; }
function toEuro(amount: number, currency: string): number | null { if (currency === 'EUR') return amount; if (currency === 'BGN') return amount / EUR_BGN; return null; }

function parseBudgetValue(value: string): number | null {
  const cleaned = value.replace(/[\s\u00a0]/g, '').replace(/[^\d.,]/g, '');
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const comma = cleaned.lastIndexOf(',');
  const dot = cleaned.lastIndexOf('.');
  let normalized = cleaned;
  if (comma >= 0 && dot >= 0) normalized = comma > dot ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '');
  else if (comma >= 0) normalized = /,\d{1,2}$/.test(cleaned) ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '');
  else if (dot >= 0 && /\.\d{3}$/.test(cleaned)) normalized = cleaned.replace(/\./g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function packSignature(value: string): { amount: number; unit: string } | null {
  const match = /(\d+(?:[.,]\d+)?)\s*(kg|кг|g|г|l|л|ml|мл|m²|м²|m2|бр)/i.exec(String(value || ''));
  if (!match) return null;
  const amount = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const rawUnit = match[2].toLocaleLowerCase('bg-BG');
  const unit = /kg|кг/.test(rawUnit) ? 'kg' : /^g$|^г$/.test(rawUnit) ? 'g' : /^l$|^л$/.test(rawUnit) ? 'l' : /ml|мл/.test(rawUnit) ? 'ml' : /m²|м²|m2/.test(rawUnit) ? 'm2' : 'br';
  return { amount: unit === 'g' ? amount / 1000 : unit === 'ml' ? amount / 1000 : amount, unit };
}

function offerUnitMismatch(line: EstimateLine, offer: MaterialOffer): string {
  const linePack = packSignature(`${line.unit} ${line.name}`);
  const offerPack = packSignature(`${offer.title} ${offer.unitLabel}`);
  if (!linePack || !offerPack || linePack.unit !== offerPack.unit) return '';
  const difference = Math.abs(linePack.amount - offerPack.amount) / Math.max(linePack.amount, offerPack.amount);
  if (difference < 0.08) return '';
  const unitLabel = linePack.unit === 'm2' ? 'm²' : linePack.unit;
  return `Офертата е с разфасовка ${offerPack.amount} ${unitLabel}, а позицията е ${linePack.amount} ${unitLabel}. Цената не е директно сравнима.`;
}

export default function QuantityEstimator({ initialEstimate, initialWorkType = 'facade-insulation', projectName, budgetLimit, region, onChange }: { initialEstimate: QuantityEstimate | null; initialWorkType?: WorkType; projectName: string; budgetLimit: string; region: string; onChange: (estimate: QuantityEstimate) => void }) {
  const [estimate, setEstimate] = useState<QuantityEstimate>(() => {
    const source = initialEstimate || defaultEstimate(initialWorkType);
    const safeWork = WORKS[source.workType] ? source.workType : 'facade-insulation';
    return { ...source, workType:safeWork, lines:buildLines(safeWork, source.areaM2 || 100, source.wastePercent ?? 5, source.perimeterM || 0, source.lines || []) };
  });
  const [searching, setSearching] = useState<Record<string, boolean>>({});
  const [offers, setOffers] = useState<Record<string, MaterialOffer[]>>({});
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState('');

  useEffect(() => { onChange({ ...estimate, updatedAt:new Date().toISOString() }); }, [estimate]);

  function update(patch: Partial<QuantityEstimate>) {
    setEstimate(current => {
      const next = { ...current, ...patch, updatedAt:new Date().toISOString() };
      if (patch.workType || patch.areaM2 !== undefined || patch.wastePercent !== undefined || patch.perimeterM !== undefined) next.lines = buildLines(next.workType, next.areaM2, next.wastePercent, next.perimeterM, current.lines);
      return next;
    });
  }

  async function findPrice(line: EstimateLine) {
    setSearching(current => ({ ...current, [line.key]:true }));
    setLineErrors(current => ({ ...current, [line.key]:'' }));
    setGeneralError('');
    try {
      const response = await fetch('/api/materials/search', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ queries:[line.searchQuery], location:region.trim() }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : `Търсенето не успя (HTTP ${response.status}).`);
      const candidates = Array.isArray(body.results) ? body.results as MaterialOffer[] : [];
      setOffers(current => ({ ...current, [line.key]:candidates.slice(0,5) }));
      if (!candidates.length) setLineErrors(current => ({ ...current, [line.key]:'Няма оферта за този точен продуктов израз. Опитай с друга разфасовка или въведи ръчна цена.' }));
    } catch (error) {
      setLineErrors(current => ({ ...current, [line.key]:error instanceof Error ? error.message : 'Неуспешно търсене.' }));
    } finally { setSearching(current => ({ ...current, [line.key]:false })); }
  }

  function chooseOffer(line: EstimateLine, offer: MaterialOffer) {
    if (offer.price == null || !offer.currency) { setLineErrors(current => ({ ...current, [line.key]:'Тази страница няма извлечена цена. Отвори я и въведи потвърдената стойност ръчно.' })); return; }
    const mismatch = offerUnitMismatch(line, offer);
    if (mismatch && !window.confirm(`${mismatch}\n\nДа използвам ли цената въпреки разликата?`)) return;
    update({ lines:estimate.lines.map(item => item.key === line.key ? { ...item, unitPrice:offer.price, currency:offer.currency || 'EUR', merchant:offer.merchant, sourceUrl:offer.url, priceSource:offer.priceSource, priceCheckedAt:new Date().toISOString(), priceNotes:mismatch || offer.unitLabel || item.priceNotes } : item) });
    setOffers(current => ({ ...current, [line.key]:[] }));
    setLineErrors(current => ({ ...current, [line.key]:'' }));
  }

  const total = useMemo(() => calculateEstimateTotals(estimate), [estimate]);

  function exportCsv() {
    const rows = [['Материал','Количество','Мерна единица','Единична цена','Валута','Търговец','Източник','Линк'], ...estimate.lines.map(line => [line.name, String(line.quantity), line.unit, line.unitPrice == null ? '' : String(line.unitPrice), line.currency, line.merchant, line.priceSource, line.sourceUrl])];
    rows.push([]); rows.push(['Площ m²',String(estimate.areaM2)]); rows.push(['Отпадък %',String(estimate.wastePercent)]); rows.push(['Материали EUR',total.materialEur.toFixed(2)]); rows.push(['Труд EUR',total.labor.toFixed(2)]); rows.push(['Транспорт EUR',total.transport.toFixed(2)]); rows.push(['Резерв EUR',total.contingency.toFixed(2)]); rows.push(['ДДС EUR',total.vat.toFixed(2)]); rows.push(['Общо ориентир EUR',total.grand.toFixed(2)]);
    const csv = '\uFEFF' + rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g,'""')}"`).join(';')).join('\r\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='BuildAI_KSS.csv'; a.click(); window.setTimeout(() => URL.revokeObjectURL(url),1000);
  }

  const maybeOverBudget = parseBudgetValue(budgetLimit);
  const budgetKnown = maybeOverBudget !== null;
  const estimateCurrencyLabel = '€';

  return <section className="estimate-page">
    <header className="estimate-page-heading"><div><div className="eyebrow"><Calculator size={14} /> BUILDAI · КОЛИЧЕСТВЕНО-СТОЙНОСТНА СМЕТКА</div><h1>Материали, количества и бюджет</h1><p>{projectName ? `Проект: ${projectName}. ` : ''}Въведи измерена площ, избери вида работа и търси реални оферти за отделните позиции.</p></div><button type="button" className="secondary-button" onClick={() => { const reset = defaultEstimate(); reset.workType = estimate.workType; reset.lines = buildLines(reset.workType,reset.areaM2,reset.wastePercent,reset.perimeterM); setEstimate(reset); setOffers({}); }}><RotateCcw size={15} /> Нулирай</button></header>
    <div className="estimate-layout">
      <section className="panel estimate-controls">
        <div className="panel-heading"><span className="step-number">01</span><div><h3>Обхват на работата</h3><p>Това са ориентировъчни коефициенти, не проектни спецификации.</p></div></div>
        <label className="field-label" htmlFor="estimate-work">Вид работа</label><select id="estimate-work" value={estimate.workType} onChange={event => update({workType:event.target.value as WorkType})}>{Object.entries(WORKS).map(([value,work]) => <option key={value} value={value}>{work.label}</option>)}</select>
        <div className="estimate-field-grid estimate-field-grid-primary">
          <label><span>Площ (m²)</span><input type="number" min="0.1" max="1000000" step="0.1" value={estimate.areaM2} onChange={event => update({areaM2:num(event.target.value,0.1,1000000)})} /></label>
          <label><span>Периметър (m) <small>ако е нужен</small></span><input type="number" min="0" max="100000" step="0.1" value={estimate.perimeterM} onChange={event => update({perimeterM:num(event.target.value,0,100000)})} /></label>
          <label><span>Резерв за отпадък (%)</span><input type="number" min="0" max="30" step="1" value={estimate.wastePercent} onChange={event => update({wastePercent:num(event.target.value,0,30)})} /></label>
        </div>
        <details className="estimate-advanced-settings">
          <summary>Разширени разходи <span>Труд · транспорт · резерв · ДДС</span></summary>
          <div className="estimate-field-grid estimate-field-grid-advanced">
            <label><span>Труд (€/m²)</span><input type="number" min="0" max="10000" step="0.5" value={estimate.laborRatePerM2} onChange={event => update({laborRatePerM2:num(event.target.value,0,10000)})} /></label>
            <label><span>Транспорт (€)</span><input type="number" min="0" max="10000000" step="1" value={estimate.transportCost} onChange={event => update({transportCost:num(event.target.value,0,10000000)})} /></label>
            <label><span>Резерв за непредвидени (%)</span><input type="number" min="0" max="50" step="1" value={estimate.contingencyPercent} onChange={event => update({contingencyPercent:num(event.target.value,0,50)})} /></label>
            {!estimate.pricesIncludeVat && <label><span>ДДС (%)</span><input id="estimate-vat" type="number" min="0" max="30" value={estimate.vatPercent} onChange={event => update({vatPercent:num(event.target.value,0,30)})} /></label>}
          </div>
          <label className="estimate-check"><input type="checkbox" checked={estimate.pricesIncludeVat} onChange={event => update({pricesIncludeVat:event.target.checked})} /><span><strong>Цените включват ДДС</strong><small>Изключи, ако трябва да се добави ДДС към цените.</small></span></label>
        </details>
      </section>
      <section className="panel estimate-lines-panel">
        <div className="panel-heading"><span className="step-number">02</span><div><h3>Материали и оферти</h3><p>Търси по продукт, избери цена или въведи проверена цена ръчно.</p></div></div>
        <div className="estimate-lines">{estimate.lines.map(line => {
          const euro = line.unitPrice == null ? null : toEuro(line.unitPrice,line.currency);
          const lineTotal = euro == null ? null : line.quantity * euro;
          return <article className="estimate-line" key={line.key}>
            <div className="estimate-line-heading"><div><strong>{line.name}</strong><small>{line.quantity.toLocaleString('bg-BG',{maximumFractionDigits:2})} {line.unit} · {WORKS[estimate.workType].specs.find(spec=>spec.key===line.key)?.note}</small></div><div className="estimate-line-total">{lineTotal==null?'—':`${lineTotal.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} €`}</div></div>
            <div className="estimate-price-row"><label><span>Цена / единица</span><input type="number" min="0" step="0.01" value={line.unitPrice ?? ''} placeholder="Въведи цена" onChange={event => update({lines:estimate.lines.map(item=>item.key===line.key?{...item,unitPrice:event.target.value.trim()===''?null:num(event.target.value,0,100000000),currency:item.currency||'EUR',merchant:'Ръчно въведена',sourceUrl:'',priceSource:'manual',priceCheckedAt:new Date().toISOString()}:item)})} /></label><label><span>Валута</span><select value={line.currency} onChange={event => update({lines:estimate.lines.map(item=>item.key===line.key?{...item,currency:event.target.value}:item)})}><option value="EUR">EUR (€)</option><option value="BGN">BGN (лв.)</option></select></label><button type="button" className="secondary-button" onClick={() => void findPrice(line)} disabled={searching[line.key]}>{searching[line.key]?<LoaderCircle size={14} className="spin"/>:<Search size={14}/>} {searching[line.key]?'Търся':'Намери оферта'}</button></div>
            {line.sourceUrl && <div className="estimate-source"><a href={line.sourceUrl} target="_blank" rel="noreferrer">{line.merchant || 'Източник на цената'} <ExternalLink size={12}/></a><span>{line.priceSource==='product-page'?'Цена от продуктова страница':line.priceSource==='manual'?'Ръчно въведена — провери източника':'Индексирана цена — потвърди'} · {line.priceCheckedAt?new Date(line.priceCheckedAt).toLocaleDateString('bg-BG'):'без дата'}</span></div>}
            {lineErrors[line.key] && <p className="estimate-error">{lineErrors[line.key]}</p>}
            {offers[line.key]?.length > 0 && <div className="estimate-offers">{offers[line.key].map((offer,index)=>{ const mismatch = offerUnitMismatch(line, offer); return <article key={`${offer.id||offer.url}-${index}`}><div><strong>{offer.title}</strong><small>{offer.merchant} · {offer.unitLabel}</small><small className={offer.priceSource==='product-page'?'confirmed-source':''}>{offer.priceSource==='product-page'?'Продуктова страница':offer.priceSource==='shopping-api'?'Търговски индекс · потвърди':'Индексиран резултат · потвърди'}</small>{mismatch && <small className="estimate-unit-warning">{mismatch}</small>}</div><div><strong>{offer.price==null?'Цена не е разчетена':`${offer.price.toLocaleString('bg-BG',{maximumFractionDigits:2})} ${offer.currency==='EUR'?'€':offer.currency==='BGN'?'лв.':offer.currency||''}`}</strong><button type="button" disabled={offer.price==null} onClick={()=>chooseOffer(line,offer)}><Check size={13}/> Използвай</button>{offer.url&&<a href={offer.url} target="_blank" rel="noreferrer">Отвори ↗</a>}</div></article>; })}</div>}
          </article>;
        })}</div>
      </section>
    </div>
    <section className="estimate-total-panel"><div className="estimate-total-heading"><div><div className="eyebrow"><Wallet size={14}/> ОБОБЩЕНИЕ</div><h2>Ориентировъчна стойност</h2><p>{total.pricedLines} от {estimate.lines.length} позиции имат цена. Непотвърдените позиции не се включват в стойността на материалите.</p></div><button type="button" className="primary-button" onClick={exportCsv}><Download size={15}/> Изтегли сметката (.csv)</button></div>
      <div className="estimate-total-grid"><div><span>Материали с цена</span><strong>{total.materialEur.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} €</strong></div><div><span>Труд (ориентир)</span><strong>{total.labor.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} €</strong></div><div><span>Транспорт</span><strong>{total.transport.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} €</strong></div><div><span>Непредвидени</span><strong>{total.contingency.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} €</strong></div><div><span>ДДС</span><strong>{total.vat.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} €</strong></div><div className="estimate-grand-total"><span>Общо с наличните цени</span><strong>{total.grand.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})} €</strong></div></div>
      {total.unpricedLines>0&&<div className="estimate-warning"><ShieldAlert size={15}/> Общата сума не включва {total.unpricedLines} позици(и) без надеждна цена. Възможно е бюджетът да е занижен.</div>}
      {budgetKnown&&maybeOverBudget!==null&&total.grand>maybeOverBudget&&<div className="estimate-budget-warning"><Wallet size={15}/> Ориентирът превишава въведения бюджет ({budgetLimit}).</div>}
      <p className="estimate-disclaimer"><Truck size={14}/> Цените и разходните коефициенти са предварителни. Проверявай опаковката, покривността, наличността, доставката, ДДС, спецификацията и актуалната оферта преди поръчка. Фасадни, покривни и конструктивни работи изискват реални измервания и компетентно техническо решение.</p>
    </section>
  </section>;
}
