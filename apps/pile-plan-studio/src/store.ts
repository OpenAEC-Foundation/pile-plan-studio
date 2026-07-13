import { load, type Store } from "@tauri-apps/plugin-store";

let _store: Store | null = null;
const BROWSER_STORE_PREFIX = "pile-plan-studio:";

async function getStore(): Promise<Store> {
  if (!_store) {
    _store = await load("preferences.json", { autoSave: true, defaults: {} });
  }
  return _store;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const store = await getStore();
    const value = await store.get<T>(key);
    return value ?? fallback;
  } catch {
    try {
      const value = globalThis.localStorage?.getItem(`${BROWSER_STORE_PREFIX}${key}`);
      return value === null || value === undefined ? fallback : JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  try {
    const store = await getStore();
    await store.set(key, value);
  } catch {
    try {
      globalThis.localStorage?.setItem(`${BROWSER_STORE_PREFIX}${key}`, JSON.stringify(value));
    } catch {
      // Preferences are optional when no persistent store is available.
    }
  }
}
