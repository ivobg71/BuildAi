'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Building2, CheckCircle2, Download, ExternalLink, FileUp, Mail, MapPin, Phone, Search, ShieldCheck, UserRound, X } from 'lucide-react';
import type { ContactKind, ContactRole, PublicContact } from '@/lib/contacts';
import { contactCityLabel, contactHasDirectChannel, contactRole, contactRoleLabel, contactRolePriority, contactSearchText, contactSpecialty } from '@/lib/contacts';
import { loadSavedContacts, saveContacts } from '@/lib/contact-storage';

type Props = { onContactsChange?: (contacts: PublicContact[]) => void };

function normalizeHeader(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase('bg-BG').replace(/[\s_\-./]+/g, '');
}

const headerAliases: Record<string, string[]> = {
  name: ['name', 'име', 'фирма', 'организация', 'лице', 'контакт', 'пълноиме', 'наименование'],
  kind: ['kind', 'type', 'тип', 'вид'],
  category: ['category', 'категория', 'дейност', 'професия', 'роля', 'сектор'],
  city: ['city', 'град', 'населеномясто', 'област', 'локация'],
  phone: ['phone', 'telephone', 'телефон', 'мобилен', 'тел'],
  email: ['email', 'e-mail', 'имейл', 'електроннапоща', 'поща'],
  website: ['website', 'web', 'уебсайт', 'сайт', 'страница'],
  description: ['description', 'описание', 'бележки', 'бележка', 'информация'],
  sourceUrl: ['sourceurl', 'source', 'източник', 'източникurl', 'url', 'линкизточник'],
  verifiedAt: ['verifiedat', 'проверенона', 'датапроверка'],
};

function parseCsv(text: string): string[][] {
  const sample = text.slice(0, 3000);
  const delimiters = [',', ';', '\t'];
  const delimiter = delimiters.sort((a, b) => sample.split(b).length - sample.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' && inQuotes && text[i + 1] === '"') { cell += '"'; i += 1; }
    else if (ch === '"') inQuotes = !inQuotes;
    else if (ch === delimiter && !inQuotes) { row.push(cell.trim()); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = '';
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function toKind(value: unknown): ContactKind {
  const kind = String(value ?? '').toLocaleLowerCase('bg-BG');
  if (kind.includes('person') || kind.includes('човек') || kind.includes('лице') || kind.includes('персон') || kind.includes('публич')) return 'person';
  if (kind.includes('company') || kind.includes('фирм') || kind.includes('компан')) return 'company';
  return 'organization';
}

function recordFromRow(headers: string[], row: unknown[], index: number, fileName: string): PublicContact | null {
  const values: Record<string, string> = {};
  headers.forEach((header, i) => {
    const normalized = normalizeHeader(header);
    for (const [field, aliases] of Object.entries(headerAliases)) {
      if (aliases.some(alias => normalizeHeader(alias) === normalized)) { values[field] = String(row[i] ?? '').trim(); break; }
    }
  });
  const name = values.name || '';
  if (!name) return null;
  const idSeed = `${name}-${values.email || values.phone || fileName}-${index}`.toLocaleLowerCase('bg-BG').replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 80);
  return {
    id: `import-${idSeed}`,
    kind: toKind(values.kind), name: name.slice(0, 180), category: (values.category || 'Неуточнена дейност').slice(0, 220),
    city: (values.city || '').slice(0, 120), phone: (values.phone || '').slice(0, 160), email: (values.email || '').slice(0, 160),
    website: (values.website || '').slice(0, 300), description: (values.description || '').slice(0, 600),
    sourceUrl: (values.sourceUrl || '').slice(0, 500), verifiedAt: values.verifiedAt || new Date().toISOString().slice(0, 10), verified: Boolean(values.sourceUrl),
  };
}

function parseSpreadsheetContext(text: string, fileName: string): PublicContact[] {
  const cleaned = text.replace(/^--- ФАЙЛ:.*?---\s*/m, '').trim();
  const sheets = cleaned.split(/(?=^Лист: )/m).map(block => block.replace(/^Лист:[^\n]*\n?/, '').trim()).filter(Boolean);
  return sheets.flatMap((sheet, index) => {
    try { return parseContacts(sheet, `${fileName}-${index}.csv`); }
    catch { return []; }
  });
}

function parseContacts(text: string, fileName: string): PublicContact[] {
  const extension = fileName.toLowerCase().split('.').pop();
  if (extension === 'json') {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new Error(`${fileName}: JSON файлът не е валиден.`); }
    const rows = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' && 'contacts' in parsed && Array.isArray((parsed as { contacts: unknown }).contacts)) ? (parsed as { contacts: unknown[] }).contacts : (parsed && typeof parsed === 'object' && 'records' in parsed && Array.isArray((parsed as { records: unknown }).records)) ? (parsed as { records: unknown[] }).records : [];
    return rows.flatMap((raw, index) => {
      if (!raw || typeof raw !== 'object') return [];
      const record = raw as Record<string, unknown>;
      const headers = Object.keys(record);
      const values = headers.map(header => record[header]);
      const contact = recordFromRow(headers, values, index, fileName);
      return contact ? [contact] : [];
    });
  }
  const rows = parseCsv(text.replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw new Error(`${fileName}: няма достатъчно редове с заглавия и контакти.`);
  const result = rows.slice(1).flatMap((row, index) => {
    const contact = recordFromRow(rows[0], row, index, fileName);
    return contact ? [contact] : [];
  });
  if (!result.length) throw new Error(`${fileName}: не намерих колона „име“/„фирма“. Използвай шаблона за CSV.`);
  return result;
}

function mergeContacts(existing: PublicContact[], incoming: PublicContact[]): PublicContact[] {
  const map = new Map<string, PublicContact>();
  for (const record of [...existing, ...incoming]) {
    const key = `${record.name.trim().toLocaleLowerCase('bg-BG')}|${(record.email || record.phone || '').trim().toLocaleLowerCase('bg-BG')}`;
    if (!key) continue;
    const prior = map.get(key);
    map.set(key, prior ? { ...prior, ...record, verified: prior.verified || record.verified } : record);
  }
  return [...map.values()];
}

export default function ContactDirectory({ onContactsChange }: Props) {
  const [contacts, setContacts] = useState<PublicContact[]>([]);
  const [seedCount, setSeedCount] = useState(0);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState<'all' | ContactRole>('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [ready, setReady] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [importError, setImportError] = useState('');
  const [showOnlyVerified, setShowOnlyVerified] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/public-contacts-seed.json').then(async response => response.ok ? await response.json() as PublicContact[] : [] as PublicContact[]).catch(() => [] as PublicContact[]),
      loadSavedContacts(),
    ]).then(([seed, saved]) => {
      if (cancelled) return;
      const validSaved = Array.isArray(saved) ? saved.filter(item => item && typeof item.name === 'string' && item.name.trim()) : [];
      setSeedCount(Array.isArray(seed) ? seed.length : 0);
      setContacts(mergeContacts(Array.isArray(seed) ? seed : [], validSaved));
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void saveContacts(contacts).then(result => {
      if (result === 'failed') setNotice('Не успях да запазя базата в браузъра. Експортирай CSV архив и раздели импорта на по-малки набори.');
    });
    onContactsChange?.(contacts);
  }, [contacts, ready, onContactsChange]);

  const cities = useMemo(() => [...new Set(contacts.map(contactCityLabel))].sort((a, b) => a.localeCompare(b, 'bg')), [contacts]);
  const filtered = useMemo(() => contacts.filter(item => {
    if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
    if (roleFilter !== 'all' && contactRole(item) !== roleFilter) return false;
    if (cityFilter === '__none__' && item.city.trim()) return false;
    if (cityFilter !== 'all' && cityFilter !== '__none__' && contactCityLabel(item) !== cityFilter) return false;
    if (showOnlyVerified && !item.verified) return false;
    const search = query.trim().toLocaleLowerCase('bg-BG');
    return !search || contactSearchText(item).includes(search);
  }).sort((a, b) => {
    const roleDifference = contactRolePriority(contactRole(a)) - contactRolePriority(contactRole(b));
    if (roleDifference !== 0) return roleDifference;
    return Number(b.verified) - Number(a.verified) || a.name.localeCompare(b.name, 'bg');
  }), [contacts, kindFilter, roleFilter, cityFilter, showOnlyVerified, query]);

  async function importFiles(files: FileList | File[]) {
    const chosen = Array.from(files);
    if (!chosen.length) return;
    setImporting(true); setNotice(''); setImportError('');
    let collected: PublicContact[] = [];
    const failures: string[] = [];
    for (const file of chosen) {
      if (!/\.(csv|json|xlsx)$/i.test(file.name)) { failures.push(`${file.name}: за импорт на контакти използвай CSV, JSON или XLSX.`); continue; }
      if (file.size > 12 * 1024 * 1024) { failures.push(`${file.name}: файлът е над 12 MB.`); continue; }
      try {
        if (/\.xlsx$/i.test(file.name)) {
          const form = new FormData(); form.append('files', file);
          const response = await fetch('/api/files/ingest', { method: 'POST', body: form });
          const payload = await response.json() as { context?: string; error?: string };
          if (!response.ok) throw new Error(payload.error || 'Excel файлът не може да бъде прочетен.');
          const records = parseSpreadsheetContext(payload.context || '', file.name);
          if (!records.length) throw new Error(`${file.name}: не намерих редове с колоната „име“/„фирма“.`);
          collected = collected.concat(records);
        } else collected = collected.concat(parseContacts(await file.text(), file.name));
      } catch (error) { failures.push(error instanceof Error ? error.message : `${file.name}: грешка при прочитане.`); }
    }
    if (collected.length) {
      setContacts(current => mergeContacts(current, collected));
      setNotice(`Импортирани са ${collected.length} записа от ${chosen.length} избрани файла. Записите се съхраняват в този браузър.`);
    }
    if (failures.length) setImportError(failures.slice(0, 5).join(' '));
    if (!collected.length && !failures.length) setImportError('Не намерих контакти във файловете.');
    setImporting(false);
  }

  function exportCsv() {
    const headers = ['name','kind','role','specialty','category','city','phone','email','website','description','sourceUrl','verifiedAt'];
    const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.join(','), ...contacts.map(contact => {
      const record = contact as unknown as Record<string, unknown>;
      return headers.map(header => quote(header === 'role' ? contactRoleLabel(contactRole(contact)) : header === 'specialty' ? contactSpecialty(contact) : record[header])).join(',');
    })].join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'buildai-contacts.csv'; anchor.click(); URL.revokeObjectURL(url);
    setNotice('Базата е експортирана като CSV архив с роля и специалност.');
  }

  function downloadTemplate() {
    const csv = 'name,kind,category,city,phone,email,website,description,sourceUrl,verifiedAt\r\n"Примерна фирма",company,"Фасадни ремонти",Пловдив,"+359 00 000 000",office@example.bg,https://example.bg,"Примерен запис — замени с реални данни",https://example.bg/contacts,2026-10-24\r\n';
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'buildai-contacts-template.csv'; a.click(); URL.revokeObjectURL(url);
  }

  function deleteContact(id: string) {
    const contact = contacts.find(item => item.id === id);
    if (contact?.id.startsWith('seed-') || contact?.id.startsWith('verified-')) { setNotice('Вградените официални записи не се изтриват. Можеш да ги скриеш от резултатите с филтрите.'); return; }
    setContacts(current => current.filter(item => item.id !== id));
  }

  return (
    <section className="directory-section" id="contacts">
      <div className="directory-title-row">
        <div><div className="eyebrow"><BookOpen size={14} /> КАТАЛОГ С КОНТАКТИ</div><h2>Фирми, специалисти и публични организации</h2><p>{seedCount.toLocaleString('bg-BG')} вградени публични записа плюс твой импортируем каталог. Записите са групирани по роля — изпълнители, проектанти, надзор, доставчици и институции; провери актуалността преди контакт. BuildAI използва подходящите записи като контекст в чата.</p></div>
        <div className="directory-count"><strong>{contacts.length.toLocaleString('bg-BG')}</strong><span>записа в каталога</span></div>
      </div>
      <div className="directory-panel">
        <div className="directory-toolbar">
          <label className="directory-search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Търси фирма, специалист, град, телефон…" /></label>
          <select value={kindFilter} onChange={event => setKindFilter(event.target.value)} aria-label="Филтър по тип">
            <option value="all">Всички типове</option><option value="company">Фирми</option><option value="organization">Организации</option><option value="person">Хора / публични длъжности</option>
          </select>
          <select value={roleFilter} onChange={event => setRoleFilter(event.target.value as 'all' | ContactRole)} aria-label="Филтър по роля в строителството">
            <option value="all">Всички роли</option>
            <option value="executor">Изпълнители</option>
            <option value="designer">Проектанти / консултанти</option>
            <option value="supervision">Надзор / контрол</option>
            <option value="supplier">Доставчици</option>
            <option value="institution">Институции</option>
            <option value="other">Други</option>
          </select>
          <select value={cityFilter} onChange={event => setCityFilter(event.target.value)} aria-label="Филтър по град"><option value="all">Всички градове</option>{cities.filter(city => city !== 'Без посочен град').map(city => <option key={city} value={city}>{city}</option>)}<option value="__none__">Без посочен град</option></select>
        </div>
        <div className="directory-controls">
          <label className="verified-toggle"><input type="checkbox" checked={showOnlyVerified} onChange={event => setShowOnlyVerified(event.target.checked)} /> <ShieldCheck size={14} /> Само със посочен източник</label>
          <div className="directory-actions">
            <button type="button" className="directory-button" onClick={downloadTemplate}><Download size={14} /> Шаблон</button>
            <label className={`directory-button import-button ${importing ? 'disabled' : ''}`}><FileUp size={14} /> {importing ? 'Импорт…' : 'Импортирай CSV/JSON/XLSX'}<input type="file" accept=".csv,.json,.xlsx,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple disabled={importing} onChange={event => { void importFiles(event.target.files || []); event.currentTarget.value = ''; }} /></label>
            <button type="button" className="directory-button" onClick={exportCsv}><Download size={14} /> Експорт</button>
          </div>
        </div>
        {notice && <div className="directory-notice"><CheckCircle2 size={15} /> <span>{notice}</span><button onClick={() => setNotice('')} aria-label="Затвори съобщението"><X size={13} /></button></div>}
        {importError && <div className="directory-error">{importError}</div>}
        <div className="directory-results-line"><strong>{filtered.length.toLocaleString('bg-BG')} резултата</strong><span>{ready ? `${cities.filter(city => city !== 'Без посочен град').length} населени места · роля и специалност от публичния профил` : 'Зареждане на каталога…'}</span></div>
        <div className="directory-results">
          {filtered.slice(0, 100).map(contact => <article className="contact-card" key={contact.id}>
            <div className="contact-card-icon">{contact.kind === 'person' ? <UserRound size={18} /> : <Building2 size={18} />}</div>
            <div className="contact-card-main">
              <div className="contact-name-row"><h3>{contact.name}</h3><span className={`contact-role contact-role-${contactRole(contact)}`}>{contactRoleLabel(contactRole(contact))}</span>{contact.verified && <span className="contact-verified" title="Има посочен публичен източник"><ShieldCheck size={13} /> Източник</span>}</div>
              <div className="contact-meta">{contactSpecialty(contact)}{contact.city ? <span><MapPin size={12} /> {contact.city}</span> : <span><MapPin size={12} /> {contactCityLabel(contact)}</span>}</div>
              <small className="contact-category">{contact.category || 'Неуточнена дейност'}</small>
              {contact.description && <p>{contact.description}</p>}
              <div className="contact-links">
                {contact.phone && contact.phone.split(/[;|]/).map(phone => phone.trim()).filter(Boolean).map((phone, phoneIndex) => <a href={`tel:${phone.replace(/[^+\d]/g, '')}`} key={`${phone}-${phoneIndex}`}><Phone size={13} /> {phone}</a>)}
                {contact.email && contact.email.split(/[;|]/).map(email => email.trim()).filter(Boolean).map((email, emailIndex) => <a href={`mailto:${email}`} key={`${email}-${emailIndex}`}><Mail size={13} /> {email}</a>)}
                {contact.website && <a href={contact.website} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Уебсайт</a>}
                {contact.sourceUrl && <a href={contact.sourceUrl} target="_blank" rel="noreferrer" className="source-link">Източник <ExternalLink size={11} /></a>}
                {!contactHasDirectChannel(contact) && <span className="contact-channel-note">Няма публикуван телефон/имейл — провери сайта или източника.</span>}
              </div>
              {contact.verifiedAt && <small className="contact-date">Дата на проверка/въвеждане: {contact.verifiedAt}</small>}
            </div>
            {!contact.id.startsWith('seed-') && !contact.id.startsWith('verified-') && <button type="button" className="contact-delete" title="Изтрий импортния запис" aria-label={`Изтрий ${contact.name}`} onClick={() => deleteContact(contact.id)}><X size={14} /></button>}
          </article>)}
          {!filtered.length && <div className="directory-empty"><Search size={22} /><strong>Няма съвпадения</strong><span>Промени търсенето или импортирай повече записи.</span></div>}
          {filtered.length > 100 && <div className="directory-limit">Показани са първите 100 резултата от {filtered.length.toLocaleString('bg-BG')}. Използвай търсенето за стесняване.</div>}
        </div>
        <div className="directory-disclaimer"><ShieldCheck size={15} /><p>Източниците и контактите могат да се променят. Проверявай сайта преди да изпращаш официални запитвания. Не добавяй лични контакти, които не са публикувани за професионална или публична употреба.</p></div>
      </div>
    </section>
  );
}
