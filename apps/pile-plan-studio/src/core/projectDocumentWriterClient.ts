import type { ProjectDocumentDraft } from "./projectDocumentContract.ts";

export type ProjectDocumentWriteJob = { id: number; draft: ProjectDocumentDraft };
export type ProjectDocumentWriteReply = { id: number } & ({ result: string } | { error: unknown });

let writer: Worker | undefined;
let nextId = 0;
const pending = new Map<number, { resolve: (contents: string) => void; reject: (error: unknown) => void }>();
const serializedSnapshots = new WeakMap<ProjectDocumentDraft, Promise<string>>();

function startWriter(): Worker {
  const worker = new Worker(new URL("./projectDocumentWriter.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }: MessageEvent<ProjectDocumentWriteReply>) => {
    const job = pending.get(data.id);
    if (!job) return;
    pending.delete(data.id);
    if ("error" in data) job.reject(data.error);
    else job.resolve(data.result);
  };
  const fail = (message: string) => {
    worker.terminate();
    writer = undefined;
    const error = new Error(message);
    for (const job of pending.values()) job.reject(error);
    pending.clear();
  };
  worker.onerror = event => {
    event.preventDefault();
    fail(event.message || "Project document writer failed.");
  };
  worker.onmessageerror = () => fail("Could not receive the project document.");
  return worker;
}

/** Reuse the serialization of an immutable snapshot for download and recovery. */
export function writeProjectDocumentInWorker(draft: ProjectDocumentDraft): Promise<string> {
  let serialized = serializedSnapshots.get(draft);
  if (!serialized) {
    serialized = new Promise<string>((resolve, reject) => {
      const worker = writer ??= startWriter();
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, draft } satisfies ProjectDocumentWriteJob);
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    }).catch(error => {
      serializedSnapshots.delete(draft);
      throw error;
    });
    serializedSnapshots.set(draft, serialized);
  }
  return serialized;
}
