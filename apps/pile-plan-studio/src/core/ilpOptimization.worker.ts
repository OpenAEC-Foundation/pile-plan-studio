import init, { WasmIlpSession } from "./wasm/pile-plan-wasm/pile_plan_wasm.js";
import loadHighs from "highs";
import highsWasmUrl from "highs/runtime?url";
import {createHighsBrowserSolver} from "./highsBrowserSolver.ts";
import type { IlpProgress } from "./ilpOptimizationTypes.ts";
import type { toBrowserIlpOptimizationRequest } from "./ilpOptimizationContract.ts";

let session: WasmIlpSession | null = null;
let solver: ReturnType<typeof createHighsBrowserSolver> | null = null;
let active = false;
self.onmessage = async (event: MessageEvent<ReturnType<typeof toBrowserIlpOptimizationRequest>>) => {
  const request = event.data;
  if (active) return;
  active = true;
  try {
    if (!session) {
      await init();
      solver ??= createHighsBrowserSolver(await loadHighs({locateFile:()=>highsWasmUrl}));
      session = new WasmIlpSession();
    }
    const outcome = session.run(request, (progress: IlpProgress) => {
      self.postMessage({ kind: "progress", run_id: request.run_id, progress });
    }, solver!);
    self.postMessage({ kind: "finished", run_id: request.run_id, outcome });
  } catch {
    session?.free();
    session = null;
    self.postMessage({ kind: "finished", run_id: request.run_id, outcome: { status: "failed", code: "solver_worker_error" } });
  } finally { active = false; }
};
