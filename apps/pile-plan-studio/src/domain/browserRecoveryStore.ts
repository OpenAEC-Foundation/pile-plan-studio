import type { BrowserRecoveryRecord } from "./browserRecovery.ts";

const DATABASE_NAME = "pile-plan-studio-recovery";
const DATABASE_VERSION = 1;
const STORE_NAME = "recovery";
const CURRENT_PROJECT_KEY = "current-project";

export interface BrowserRecoveryStore {
  read(): Promise<unknown | null>;
  write(record: BrowserRecoveryRecord): Promise<void>;
  clear(): Promise<void>;
}

export function createIndexedDbRecoveryStore(indexedDb: IDBFactory): BrowserRecoveryStore {
  let databasePromise: Promise<IDBDatabase> | null = null;
  const database = () => {
    databasePromise ??= openDatabase(indexedDb);
    return databasePromise;
  };

  return {
    async read() {
      const db = await database();
      return requestResult(db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(CURRENT_PROJECT_KEY));
    },
    async write(record) {
      const db = await database();
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(record, CURRENT_PROJECT_KEY);
      await transactionComplete(transaction);
    },
    async clear() {
      const db = await database();
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(CURRENT_PROJECT_KEY);
      await transactionComplete(transaction);
    },
  };
}

type TimerHandle = ReturnType<typeof globalThis.setTimeout>;

type BrowserRecoveryWriterOptions = {
  store: BrowserRecoveryStore;
  delayMs?: number;
  onError?: (error: unknown) => void;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
};

export type BrowserRecoveryWriter = {
  markReady(): void;
  schedule(recordFactory: () => Promise<BrowserRecoveryRecord>): void;
  flush(): Promise<void>;
  flushPendingWrites(): Promise<void>;
  dispose(): void;
};

export function createBrowserRecoveryWriter({
  store,
  delayMs = 500,
  onError = () => undefined,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
}: BrowserRecoveryWriterOptions): BrowserRecoveryWriter {
  let ready = false;
  let disposed = false;
  let timer: TimerHandle | null = null;
  let pendingFactory: (() => Promise<BrowserRecoveryRecord>) | null = null;
  let writeChain = Promise.resolve();

  const enqueuePendingWrite = () => {
    if (disposed || !ready || !pendingFactory) return;
    const factory = pendingFactory;
    pendingFactory = null;
    writeChain = writeChain.then(async () => {
      try {
        await store.write(await factory());
      } catch (error) {
        onError(error);
      }
    });
  };

  return {
    markReady() {
      ready = true;
    },
    schedule(recordFactory) {
      if (!ready || disposed) return;
      pendingFactory = recordFactory;
      if (timer !== null) clearTimer(timer);
      timer = setTimer(() => {
        timer = null;
        enqueuePendingWrite();
      }, delayMs);
    },
    async flush() {
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      enqueuePendingWrite();
      await writeChain;
    },
    async flushPendingWrites() {
      await writeChain;
    },
    dispose() {
      disposed = true;
      pendingFactory = null;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}

function openDatabase(indexedDb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB could not be opened."));
    request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted."));
  });
}
