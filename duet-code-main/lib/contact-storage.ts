import type { PublicContact } from '@/lib/contacts';

const DB_NAME = 'buildai-contact-catalog';
const DB_VERSION = 1;
const STORE_NAME = 'contacts';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB не може да бъде отворена.'));
  });
}

export async function loadSavedContacts(): Promise<PublicContact[]> {
  if (typeof indexedDB !== 'undefined') {
    try {
      const db = await openDatabase();
      const records = await new Promise<PublicContact[]>((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as PublicContact[] : []);
        request.onerror = () => reject(request.error);
      });
      db.close();
      if (records.length) return records;
    } catch { /* Continue with the compatibility fallback below. */ }
  }
  try {
    const value = window.localStorage.getItem('buildai-public-contacts-v1');
    return value ? JSON.parse(value) as PublicContact[] : [];
  } catch { return []; }
}

export async function saveContacts(contacts: PublicContact[]): Promise<'indexeddb' | 'localStorage' | 'failed'> {
  if (typeof indexedDB !== 'undefined') {
    try {
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.clear();
        for (const contact of contacts) store.put(contact);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Записът е прекъснат.'));
      });
      db.close();
      return 'indexeddb';
    } catch { /* Continue with compatibility fallback. */ }
  }
  try {
    window.localStorage.setItem('buildai-public-contacts-v1', JSON.stringify(contacts));
    return 'localStorage';
  } catch { return 'failed'; }
}
