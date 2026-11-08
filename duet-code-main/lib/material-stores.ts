export type MaterialStoreKind = 'retailer' | 'catalog' | 'manufacturer';

export type MaterialStore = {
  name: string;
  domain: string;
  categories: string[];
  kind: MaterialStoreKind;
  /** Deep link to the store's own search, when the public search URL is known. */
  searchUrl?: string;
};

export const MATERIAL_STORE_KIND_LABELS: Record<MaterialStoreKind, string> = {
  retailer: 'Магазини',
  catalog: 'Каталози',
  manufacturer: 'Производители',
};

/**
 * Curated public retailer/catalog allow-list. The live crawler may only fetch these hosts;
 * this is intentionally not an unrestricted web crawler. Store pages and prices can change.
 *
 * The list was cleaned of duplicate/dead domains: gsstroimarket.bg redirects to gstroy.bg,
 * masterplast.bg does not resolve, maxxmart.bg redirects to www.maxxmart.eu, and
 * stroitelite.eu / alistal.com are not building-material shops.
 */
export const MATERIAL_STORES: MaterialStore[] = [
  { name: 'Praktiker', domain: 'praktiker.bg', categories: ['строителство', 'инструменти', 'боя', 'настилки'], kind: 'retailer' },
  { name: 'Mr. Bricolage', domain: 'mr-bricolage.bg', categories: ['строителство', 'интериор', 'баня', 'градина'], kind: 'retailer' },
  { name: 'BAUHAUS', domain: 'bauhaus.bg', categories: ['строителство', 'изолация', 'инструменти', 'покрив'], kind: 'retailer', searchUrl: 'https://www.bauhaus.bg/search?q={query}' },
  { name: 'HomeMax', domain: 'home-max.bg', categories: ['строителство', 'интериор', 'осветление', 'градина'], kind: 'retailer' },
  { name: 'Praktis', domain: 'praktis.bg', categories: ['сухо строителство', 'подови настилки', 'бои', 'покрив'], kind: 'retailer' },
  { name: 'TeMax', domain: 'temax.bg', categories: ['строителство', 'дървен материал', 'интериор', 'баня'], kind: 'retailer' },
  { name: 'MASTERHAUS', domain: 'masterhaus.bg', categories: ['строителство', 'интериор', 'баня', 'осветление'], kind: 'retailer', searchUrl: 'https://www.masterhaus.bg/bg/search?q={query}' },
  { name: 'DS Home', domain: 'dshome.bg', categories: ['строителство', 'изолация', 'сухо строителство', 'интериор'], kind: 'retailer' },
  { name: 'Строителни Материали', domain: 'stroitelnimateriali.bg', categories: ['строителство', 'изолация', 'фасади', 'сухо строителство'], kind: 'retailer', searchUrl: 'https://stroitelnimateriali.bg/bg-bg/search/?q={query}' },
  { name: 'Деплан', domain: 'deplan.bg', categories: ['строителни материали', 'ВиК', 'изолации', 'сухо строителство'], kind: 'retailer' },
  { name: 'BAUZENTRUM', domain: 'bauzentrum.bg', categories: ['строителство', 'изолация', 'покрив', 'фасади'], kind: 'retailer', searchUrl: 'https://bauzentrum.bg/?s={query}&post_type=product' },
  { name: 'АТЕК', domain: 'atek.bg', categories: ['сухо строителство', 'изолация', 'сухи смеси', 'крепежи'], kind: 'retailer', searchUrl: 'https://www.atek.bg/index.php?route=product/search&search={query}' },
  { name: 'GStroy', domain: 'gstroy.bg', categories: ['строителство', 'интериор', 'инструменти'], kind: 'retailer' },
  { name: 'Фактор Трейд', domain: 'factortrade.bg', categories: ['цимент', 'бетон', 'сухи смеси', 'зидария'], kind: 'retailer', searchUrl: 'https://factortrade.bg/?s={query}&post_type=product' },
  { name: 'Бул Билд БГ', domain: 'bulbild.com', categories: ['хидроизолация', 'покрив', 'поликарбонат', 'дренаж'], kind: 'retailer' },
  { name: 'Baustoff + Metall', domain: 'baustoff-metall.bg', categories: ['сухо строителство', 'инструменти', 'профили', 'крепежи'], kind: 'retailer', searchUrl: 'https://www.baustoff-metall.bg/?s={query}' },
  { name: 'Деником', domain: 'denicom.bg', categories: ['лепила', 'силикони', 'бои', 'спрейове'], kind: 'retailer' },
  { name: 'Bagira', domain: 'bagira.bg', categories: ['строителство', 'инструменти', 'интериор', 'градина'], kind: 'retailer' },
  { name: 'Siko', domain: 'siko.bg', categories: ['плочки', 'баня', 'интериор'], kind: 'retailer' },
  { name: 'Rumik', domain: 'rumik.bg', categories: ['строителство', 'интериор', 'ВиК'], kind: 'retailer' },
  { name: 'Itt Shop', domain: 'itt-shop.bg', categories: ['строителство', 'електроматериали', 'инструменти'], kind: 'retailer' },
  { name: 'Tashev-Galving', domain: 'tashev-galving.com', categories: ['инструменти', 'крепежи', 'строителство'], kind: 'retailer', searchUrl: 'https://tashev-galving.com/search?q={query}' },
  { name: 'Terramax', domain: 'terramax-bg.com', categories: ['строителство', 'интериор', 'подови настилки', 'баня'], kind: 'retailer' },
  { name: 'Domko', domain: 'domko.com', categories: ['подови настилки', 'килими', 'осветление'], kind: 'retailer' },
  { name: 'Toplivo', domain: 'toplivo.bg', categories: ['строителство', 'цимент', 'дървен материал', 'изолация'], kind: 'retailer' },
  { name: 'Marmag', domain: 'marmag.bg', categories: ['плочки', 'баня', 'интериор'], kind: 'retailer' },
  { name: 'MaxxMart', domain: 'maxxmart.eu', categories: ['строителство', 'интериор', 'осветление'], kind: 'retailer' },
  { name: 'Ceresit', domain: 'ceresit.bg', categories: ['лепила', 'фуги', 'мазилки', 'хидроизолация'], kind: 'manufacturer', searchUrl: 'https://www.ceresit.bg/?searchTerm={query}' },
];

export function materialStoreSearchLink(store: MaterialStore, query: string, location = ''): string {
  const term = `${query}${location.trim() ? ` ${location.trim()}` : ''}`.trim();
  if (store.searchUrl) return store.searchUrl.replace('{query}', encodeURIComponent(term));
  return `https://www.google.com/search?q=${encodeURIComponent(`site:${store.domain} ${term}`)}`;
}
