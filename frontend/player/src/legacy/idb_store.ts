const DB_NAME = 'lx_music_store';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const LIST_KEY = 'lx_list_data';

let dbPromise: Promise<IDBDatabase> | undefined;

function openDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    return dbPromise;
}

function readValue(key: string): Promise<unknown> {
    return openDB().then(db => new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
    }));
}

function writeValue(key: string, value: unknown): Promise<void> {
    return openDB().then(db => new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(value, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    }));
}

function deleteValue(key: string): Promise<void> {
    return openDB().then(db => new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    }));
}

export const listStore = {
    get: () => readValue(LIST_KEY),
    set: (data: unknown) => writeValue(LIST_KEY, data),
    remove: () => deleteValue(LIST_KEY),
};

(window as any).ListStore = listStore;
void openDB().catch(error => console.warn('[IDBStore] 初始化失败:', error));
