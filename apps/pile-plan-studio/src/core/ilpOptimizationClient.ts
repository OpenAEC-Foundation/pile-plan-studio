import { Channel, invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./coreTransport.ts";
import { toBrowserIlpOptimizationRequest, toDesktopIlpOptimizationRequest, ilpOptimizationOutcomeFromCore } from "./ilpOptimizationContract.ts";
import type { IlpEvent, IlpOptimizationOutcome, IlpProgress, IlpRunRequest } from "./ilpOptimizationTypes.ts";
export type IlpRunHandle = { finished: Promise<IlpOptimizationOutcome>; cancel(): void; stop(): void };
export interface IlpOptimizationClient {
  start(request: IlpRunRequest, onProgress: (progress: IlpProgress) => void): IlpRunHandle;
  dispose(): void;
}
export function createIlpOptimizationClient(): IlpOptimizationClient {
  let worker: Worker | null = null;
  let current: IlpRunHandle | null = null;
  return {
    start(request, onProgress) {
      if (current) throw new Error("ilp_already_running");
      let cancelled = false;
      let stopping = false;
      let best: Extract<IlpOptimizationOutcome,{status:"solved"}> | null = null;
      let phase: IlpProgress["phase"] = "preparation";
      let settled = false;
      let resolve!: (outcome: IlpOptimizationOutcome) => void;
      const finished = new Promise<IlpOptimizationOutcome>(r => { resolve = r; });
      const finish = (outcome: unknown) => {
        if (settled) return;
        settled = true;
        current = null;
        const parsed = ilpOptimizationOutcomeFromCore(outcome);
        if(cancelled) {resolve({status:"cancelled"});return;}
        if(stopping) {
          if(parsed.status==="solved" && (!best || parsed.solution.score_milli<=best.solution.score_milli)) {resolve(parsed);return;}
          resolve(best ? {...best,solution:{...best.solution,termination:"stopped"},diagnostics:[...best.diagnostics,{code:"stopped_with_best",load_point_ids:[],blocking:false}]}
            : {status:"no_solution",phase,termination:"stopped"});
          return;
        }
        resolve(parsed);
      };
      const report = (update: IlpProgress) => {
        if(cancelled || settled)return;
        phase=update.phase;
        if(update.best_solution) {
          const candidate=ilpOptimizationOutcomeFromCore({status:"solved",solution:update.best_solution,diagnostics:update.diagnostics ?? best?.diagnostics ?? []});
          if(candidate.status==="solved" && (!best || candidate.solution.score_milli<best.solution.score_milli)) best=candidate;
        }
        onProgress({...update,
          incumbent_objective:phase==="spatial" && best ? best.solution.score_milli : update.incumbent_objective,
          best_solution:best?.solution});
      };
      const native = isTauriRuntime();
      const handle: IlpRunHandle = { finished, cancel() {
        if (settled) return;
        cancelled = true;
        if (native) { void invoke("cancel_ilp_optimization", { runId: request.runId }).catch(() => undefined); }
        else { worker?.terminate(); worker = null; finish({status:"cancelled"}); }
      }, stop() {
        if(settled || cancelled || stopping)return;
        stopping=true;
        if(native) {void invoke("cancel_ilp_optimization",{runId:request.runId}).catch(()=>undefined);}
        else {worker?.terminate();worker=null;finish({status:"cancelled"});}
      } };
      current = handle;
      if (native) {
        const progress = new Channel<IlpProgress>();
        progress.onmessage = report;
        void invoke("ilp_optimize", {request: toDesktopIlpOptimizationRequest(request), progress})
          .then(finish).catch(() => finish({status:"failed",code:"solver_worker_error"}));
      } else {
        try {
          worker ??= new Worker(new URL("./ilpOptimization.worker.ts", import.meta.url), {type:"module"});
          worker.onmessage = (event: MessageEvent<IlpEvent>) => {
            if (settled || event.data.run_id !== request.runId) return;
            if (event.data.kind === "progress") { report(event.data.progress); }
            else finish(event.data.outcome);
          };
          worker.onerror = () => { if (settled) return; worker?.terminate(); worker=null; finish({status:"failed",code:"solver_worker_error"}); };
          worker.postMessage(toBrowserIlpOptimizationRequest(request));
        } catch { worker?.terminate(); worker=null; finish({status:"failed",code:"solver_worker_error"}); }
      }
      return handle;
    },
    dispose() { current?.cancel(); worker?.terminate(); worker = null; },
  };
}
