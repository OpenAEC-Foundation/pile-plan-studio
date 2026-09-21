import type { IlpOptimizationClient, IlpRunHandle } from "../../core/ilpOptimizationClient.ts";
import type { IlpOptimizationOutcome, IlpProgress, IlpRunRequest, IlpSolution } from "../../core/ilpOptimizationTypes.ts";
export type IlpRunContext = {optimizeCoherence:boolean;budgetBasisPoints:number;wholePlanLimits:boolean;boundaryTransitions:boolean;localOnly?:boolean};
export type IlpRunState={running:boolean;stopping:boolean;cancelling?:boolean;progress:IlpProgress|null;outcome:IlpOptimizationOutcome|null;context?:IlpRunContext;previewSolution?:IlpSolution};
export class IlpOptimizationController {
  state:IlpRunState={running:false,stopping:false,progress:null,outcome:null};
  private client:IlpOptimizationClient;
  private changed:(state:IlpRunState)=>void;
  private handle:IlpRunHandle|null=null;
  private generation=0;
  private discard=false;
  private previewTimer:ReturnType<typeof setTimeout>|null=null;
  private pendingPreview:IlpSolution|undefined;
  private previewUpdatedAt=Number.NEGATIVE_INFINITY;
  private clearPreviewQueue() {
    if(this.previewTimer!==null)clearTimeout(this.previewTimer);
    this.previewTimer=null;this.pendingPreview=undefined;
  }
  private queuePreview(solution:IlpSolution,generation:number,isCurrent:()=>boolean) {
    const previous=this.pendingPreview??this.state.previewSolution;
    if(previous && solution.score_milli>=previous.score_milli)return;
    this.pendingPreview=solution;
    const flush=()=>{
      this.previewTimer=null;
      if(generation!==this.generation || this.discard || !this.state.running)return;
      if(!isCurrent()){this.clearPreviewQueue();this.publish({...this.state,previewSolution:undefined});return;}
      const previewSolution=this.pendingPreview;this.pendingPreview=undefined;
      this.previewUpdatedAt=Date.now();this.publish({...this.state,previewSolution});
    };
    const delay=Math.max(0,1000-(Date.now()-this.previewUpdatedAt));
    if(delay===0)flush();
    else if(this.previewTimer===null)this.previewTimer=setTimeout(flush,delay);
  }
  constructor(client:IlpOptimizationClient,changed:(state:IlpRunState)=>void) {this.client=client;this.changed=changed;}
  private publish(state:IlpRunState) {this.state=state;this.changed(state);}
  async start(request:IlpRunRequest,isCurrent:()=>boolean,apply:(outcome:IlpOptimizationOutcome)=>void) {
    if(this.state.running)return;
    const generation=++this.generation;
    this.discard=false;this.clearPreviewQueue();this.previewUpdatedAt=Number.NEGATIVE_INFINITY;
    this.publish({running:true,stopping:false,progress:null,outcome:null,context:{
      optimizeCoherence:request.input.settings.optimize_coherence,
      budgetBasisPoints:request.input.settings.budget_basis_points,
      wholePlanLimits:request.input.limitScope==="whole-plan",
      boundaryTransitions:request.input.includeBoundaryTransitions,
      localOnly:request.localOnly??false,
    }});
    try {
      this.handle=this.client.start(request,progress=>{
        if(generation===this.generation && isCurrent() && !this.discard) {
          this.publish({...this.state,progress});
          if(progress.phase==="spatial" && progress.best_solution) this.queuePreview(progress.best_solution,generation,isCurrent);
        }
      });
      const outcome=await this.handle.finished;
      if(generation!==this.generation)return;
      const accepted=!this.discard && isCurrent();
      this.handle=null;this.clearPreviewQueue();
      this.publish({...this.state,running:false,stopping:false,cancelling:false,previewSolution:undefined,outcome:accepted?outcome:{status:"cancelled"}});
      if(accepted)apply(outcome);
    } catch {
      if(generation===this.generation){this.handle=null;this.clearPreviewQueue();this.publish({...this.state,running:false,stopping:false,cancelling:false,previewSolution:undefined,outcome:{status:"failed",code:"solver_worker_error"}});}
    }
  }
  stop() {if(!this.state.running || this.discard)return;this.publish({...this.state,stopping:true});this.handle?.stop();}
  cancel() {if(!this.state.running || this.discard)return;this.discard=true;this.clearPreviewQueue();this.publish({...this.state,stopping:true,cancelling:true,previewSolution:undefined});this.handle?.cancel();}
  dispose() {this.generation++;this.clearPreviewQueue();this.handle?.cancel();this.handle=null;this.client.dispose();this.state={running:false,stopping:false,progress:null,outcome:null};}
}
