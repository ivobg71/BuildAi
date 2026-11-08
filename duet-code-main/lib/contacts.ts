export type ContactKind = 'organization' | 'company' | 'person';
export type ContactRole = 'executor' | 'designer' | 'supervision' | 'supplier' | 'institution' | 'other';

export type PublicContact = {
  id: string;
  kind: ContactKind;
  name: string;
  category: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  description: string;
  sourceUrl: string;
  verifiedAt: string;
  verified: boolean;
};

const EXECUTOR_PATTERN = /строителств|строителни работи|строително-монтаж|СМР|ремонт|реконструк|саниран|фасад|топлоизолац|хидроизолац|благоустройств|пътн|пътно|изпълнение|сгради|сграда|жилищн|промишлен|инфраструктур|антикорозион|покрив|довършител/i;
const SUPERVISION_PATTERN = /надзор|строителен контрол|контрол|оценка за съответствие|технически контрол/i;
const DESIGNER_PATTERN = /архитект|проектант|проектиране|проектни|инженеринг|консултант|консултиране|риск инженеринг|енергийна ефективност/i;
const SUPPLIER_PATTERN = /материали|доставк|търговия|склад|магазин|борса|снабдяване/i;
const INSTITUTION_PATTERN = /община|общински|съвет|камара|министерство|агенция|университет|институт|държавн|публична|кмет/i;

export function contactRole(contact: PublicContact): ContactRole {
  if (contact.kind === 'organization' || contact.kind === 'person') return 'institution';
  const text = `${contact.name} ${contact.category} ${contact.description}`;
  if (INSTITUTION_PATTERN.test(text) && !EXECUTOR_PATTERN.test(text)) return 'institution';
  if (SUPERVISION_PATTERN.test(text)) return 'supervision';
  if (EXECUTOR_PATTERN.test(text)) return 'executor';
  if (DESIGNER_PATTERN.test(text)) return 'designer';
  if (SUPPLIER_PATTERN.test(text)) return 'supplier';
  return 'other';
}

export function contactRoleLabel(role: ContactRole): string {
  switch (role) {
    case 'executor': return 'Изпълнител';
    case 'designer': return 'Проектант / консултант';
    case 'supervision': return 'Надзор / контрол';
    case 'supplier': return 'Доставчик';
    case 'institution': return 'Институция';
    default: return 'Друго';
  }
}

export function contactRolePriority(role: ContactRole): number {
  switch (role) {
    case 'executor': return 0;
    case 'designer': return 1;
    case 'supervision': return 2;
    case 'supplier': return 3;
    case 'institution': return 4;
    default: return 5;
  }
}

export function contactSpecialty(contact: PublicContact): string {
  const text = `${contact.name} ${contact.category}`;
  if (contactRole(contact) === 'institution') return 'Общини и институции';
  if (contactRole(contact) === 'supervision') return 'Строителен надзор и контрол';
  if (/фасад|топлоизолац|хидроизолац|саниран/i.test(text)) return 'Фасади и изолации';
  if (/път|благоустройств|инфраструктур|тротоар|парк/i.test(text)) return 'Пътища и благоустройство';
  if (/ремонт|довършител|облицов|настилк|боя|мазилк|интериор/i.test(text)) return 'Ремонти и довършителни работи';
  if (/архитект|проектант|проектиране|консултант|инженеринг/i.test(text)) return 'Проектиране и консултиране';
  if (/материал|доставк|търговия|склад|борса/i.test(text)) return 'Доставки и материали';
  if (/строителств|сгради|сграда|СМР|изпълнение/i.test(text)) return 'Цялостно строителство';
  return 'Друго';
}

export function contactCityLabel(contact: PublicContact): string {
  return contact.city.trim() || 'Без посочен град';
}

export function contactHasDirectChannel(contact: PublicContact): boolean {
  return Boolean(contact.phone.trim() || contact.email.trim() || contact.website.trim());
}

export function contactSearchText(contact: PublicContact): string {
  return [contact.name, contact.kind, contact.category, contact.city, contact.phone, contact.email, contact.description, contactSpecialty(contact), contactRoleLabel(contactRole(contact))]
    .join(' ')
    .toLocaleLowerCase('bg-BG');
}

/** Извлича разпознаваем град/населено място от свободен адрес. */
export function contactLocationTokens(value: string): string[] {
  return [...new Set(String(value || '').toLocaleLowerCase('bg-BG').split(/[^\p{L}]+/u).map(token => token.trim()).filter(token => token.length >= 3 && !['град', 'село', 'област', 'община', 'булевард', 'улица', 'квартал'].includes(token)))];
}

export function contactMatchesLocation(contact: PublicContact, location: string): boolean {
  const city = contact.city.toLocaleLowerCase('bg-BG').trim();
  if (!city) return false;
  const tokens = contactLocationTokens(location);
  if (!tokens.length) return false;
  return tokens.some(token => city.includes(token));
}
