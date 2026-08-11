import { load, type Store } from "@tauri-apps/plugin-store";
import { normalizeUserSettings, type UserSettings } from "./userSettings.ts";

const DATABASE_NAME = "pile-plan-studio-settings";
const DATABASE_VERSION = 1;
const STORE_NAME = "settings";
const CURRENT_SETTINGS_KEY = "current";
const DESKTOP_SETTINGS_KEY = "user-settings";
const DESKTOP_STORE_FILE = "preferences.json";

export interface UserSettingsStore {
  read(): Promise<unknown | null>;
  write(settings: UserSettings): Promise<void>;
}

export type LegacySettingReader = (key: string, fallback: unknown) => Promise<unknown>;

export type UserSettingsStoreEnvironment = {
  isTauri: boolean;
  indexedDb?: IDBFactory;
  loadDesktopStore?: () => Promise<UserSettingsStore>;
};

export async function createPlatformUserSettingsStore(
  environment: UserSettingsStoreEnvironment,
): Promise<UserSettingsStore> {
  if (environment.isTauri) {
    return (environment.loadDesktopStore ?? createDesktopUserSettingsStore)();
  }
  if (environment.indexedDb) return createIndexedDbUserSettingsStore(environment.indexedDb);
  let value: UserSettings | null = null;
  return {
    read: async () => value,
    write: async (settings) => { value = settings; },
  };
}

export async function loadUserSettings(
  store: UserSettingsStore,
  readLegacySetting?: LegacySettingReader,
): Promise<UserSettings> {
  const stored = await store.read();
  if (stored !== null || !readLegacySetting) return normalizeUserSettings(stored);

  return normalizeUserSettings({
    preferences: {
      language: await readLegacySetting("language", "auto"),
      theme: await readLegacySetting("theme", "light"),
      interfaceScalePercent: await readLegacySetting("interface-scale-percent", 100),
    },
  });
}

export async function saveUserSettings(
  store: UserSettingsStore,
  settings: UserSettings,
): Promise<void> {
  await store.write(normalizeUserSettings(settings));
}

export function createIndexedDbUserSettingsStore(indexedDb: IDBFactory): UserSettingsStore {
  let databasePromise: Promise<IDBDatabase> | null = null;
  const database = () => {
    databasePromise ??= openDatabase(indexedDb);
    return databasePromise;
  };
  return {
    async read() {
      const db = await database();
      return requestResult(db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(CURRENT_SETTINGS_KEY));
    },
    async write(settings) {
      const db = await database();
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(settings, CURRENT_SETTINGS_KEY);
      await transactionComplete(transaction);
    },
  };
}

export async function createDesktopUserSettingsStore(): Promise<UserSettingsStore> {
  const store: Store = await load(DESKTOP_STORE_FILE, { autoSave: true, defaults: {} });
  return {
    read: () => store.get(DESKTOP_SETTINGS_KEY),
    async write(settings) {
      await store.set(DESKTOP_SETTINGS_KEY, settings);
    },
  };
}

function openDatabase(indexedDb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("User settings database could not be opened."));
    request.onblocked = () => reject(new Error("User settings database upgrade is blocked."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error("User settings could not be read."));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("User settings could not be saved."));
    transaction.onabort = () => reject(transaction.error ?? new Error("User settings write was aborted."));
  });
}
