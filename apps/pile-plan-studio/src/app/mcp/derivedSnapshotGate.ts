export type DerivedSnapshotGate<T> = {
  observe: (signature: string, snapshot: T) => boolean;
};

export function createDerivedSnapshotGate<T>(initialSignature: string, initialSnapshot: T): DerivedSnapshotGate<T> {
  let signature = initialSignature;
  let retainedSnapshot = initialSnapshot;
  let awaiting = false;
  return {
    observe(nextSignature, snapshot) {
      if (nextSignature !== signature) {
        signature = nextSignature;
        retainedSnapshot = snapshot;
        awaiting = true;
      } else if (snapshot !== retainedSnapshot) {
        awaiting = false;
      }
      return awaiting;
    },
  };
}
