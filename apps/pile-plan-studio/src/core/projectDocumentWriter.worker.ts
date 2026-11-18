import initWasm, { write_project_document } from "./wasm/pile-plan-wasm/pile_plan_wasm.js";
import { toBrowserProjectDocumentDraft } from "./projectDocumentContract.ts";
import type { ProjectDocumentWriteJob, ProjectDocumentWriteReply } from "./projectDocumentWriterClient.ts";

let ready: ReturnType<typeof initWasm> | undefined;

self.onmessage = async ({ data: { id, draft } }: MessageEvent<ProjectDocumentWriteJob>) => {
  let reply: ProjectDocumentWriteReply;
  try {
    ready ??= initWasm().catch(error => {
      ready = undefined;
      throw error;
    });
    await ready;
    const result = write_project_document({ draft: toBrowserProjectDocumentDraft(draft) });
    reply = { id, result };
  } catch (error) {
    reply = { id, error };
  }
  self.postMessage(reply);
};
