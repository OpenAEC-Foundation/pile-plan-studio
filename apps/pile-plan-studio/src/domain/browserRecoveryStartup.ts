import { parseBrowserRecoveryRecord, type BrowserRecoveryRecord } from "./browserRecovery.ts";
import type { BrowserRecoveryStore } from "./browserRecoveryStore.ts";

export type BrowserRecoveryStartupResult =
  | { kind: "disabled" }
  | { kind: "empty" }
  | { kind: "restored"; record: BrowserRecoveryRecord }
  | { kind: "invalid" }
  | { kind: "unavailable"; error: unknown };

export async function loadBrowserRecovery({
  isDesktop,
  store,
  validateProject = () => undefined,
}: {
  isDesktop: boolean;
  store: BrowserRecoveryStore;
  validateProject?: (ifcppText: string) => void;
}): Promise<BrowserRecoveryStartupResult> {
  if (isDesktop) return { kind: "disabled" };

  try {
    const stored = await store.read();
    if (stored === null) return { kind: "empty" };
    const record = parseBrowserRecoveryRecord(stored);
    if (record) {
      try {
        validateProject(record.ifcppText);
        return { kind: "restored", record };
      } catch {
        // Invalid project contents use the same safe fallback and cleanup path.
      }
    }
    try {
      await store.clear();
    } catch {
      // A failed cleanup must not prevent the bundled sample from opening.
    }
    return { kind: "invalid" };
  } catch (error) {
    return { kind: "unavailable", error };
  }
}
