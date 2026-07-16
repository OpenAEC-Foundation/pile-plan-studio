export function binaryResultToUint8Array(result: Uint8Array | number[]): Uint8Array {
  return result instanceof Uint8Array ? result : new Uint8Array(result);
}
