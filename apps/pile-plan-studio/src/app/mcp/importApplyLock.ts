import { McpReadError } from "./readModel.ts";

/** Claim the transaction before any await, including content verification. */
export async function withImportApplyLock<T>(
  transaction: { applying: boolean }, apply: () => Promise<T>,
): Promise<T> {
  if (transaction.applying) throw new McpReadError("import_busy");
  transaction.applying = true;
  try {
    return await apply();
  } finally {
    transaction.applying = false;
  }
}
