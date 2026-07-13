export function toWasmNumberKeyedMap<T>(items: Map<number, T>): Map<number, T> {
  return new Map(
    [...items.entries()].map(([key, value]) => {
      if (!Number.isInteger(key)) {
        throw new Error(`Expected an integer map key, got ${key}`);
      }

      return [key, value];
    }),
  );
}

export function toStringKeyedRecord<T>(items: Map<number, T>): Record<string, T> {
  return Object.fromEntries(items);
}
