import type {Highs,CallbackEvent} from "highs";

/** Numeric Rust model. Every column is integral; all domain policy stays in Rust. */
export type IlpSolverModel={
  col_cost:number[];col_lower:number[];col_upper:number[];
  row_lower:number[];row_upper:number[];
  starts:number[];indices:number[];values:number[];
  initial_solution:number[]|null;
};
export type IlpSolverUpdate={incumbent_objective:number|null;best_bound:number|null;relative_gap:number|null;values?:number[]};
export type IlpSolverOutcome={status:"solved";values:number[];optimal:boolean}|{status:"infeasible"|"no_solution"};
const finite=(v:unknown):number|null=>typeof v==="number"&&Number.isFinite(v)&&Math.abs(v)<1e29?v:null;

export function createHighsBrowserSolver(highs:Highs){
  return (data:IlpSolverModel,timeLimitSeconds:number|null,progress:(p:IlpSolverUpdate)=>void):IlpSolverOutcome=>{
    if(timeLimitSeconds!==null&&timeLimitSeconds<=0)return {status:"no_solution"};
    const started=performance.now();
    const numCols=data.col_cost.length,numRows=data.row_upper.length;
    const model=highs.createModel({numCols,numRows,colCost:data.col_cost,colLower:data.col_lower,colUpper:data.col_upper,
      rowLower:data.row_lower,rowUpper:data.row_upper,integrality:new Int32Array(numCols).fill(highs.constants.variableType.integer),
      matrix:{format:"csr",numCols,numRows,starts:Int32Array.from(data.starts),indices:Int32Array.from(data.indices),values:Float64Array.from(data.values)}});
    try {
      model.options.set({output_flag:false,mip_rel_gap:0,mip_abs_gap:0});
      if(data.initial_solution)model.setSolution({colValue:data.initial_solution});
      if(timeLimitSeconds!==null){
        const remaining=timeLimitSeconds-(performance.now()-started)/1000;
        if(remaining<=0)return {status:"no_solution"};
        model.options.set("time_limit",remaining);
      }
      let last=started;
      const report=(event:CallbackEvent,improved:boolean):undefined=>{
        const now=performance.now();
        if(!improved&&now-last<400)return;
        const p=event.data;
        progress({incumbent_objective:finite(p.mip_primal_bound),best_bound:finite(p.mip_dual_bound),relative_gap:finite(p.mip_gap),
          ...(improved&&p.mip_solution?{values:Array.from(p.mip_solution)}:{})});
        last=now;
      };
      const cb=highs.constants.callbackType;
      model.run({[cb.mipImprovingSolution]:e=>report(e,true),[cb.mipInterrupt]:e=>report(e,false),
        [cb.simplexInterrupt]:e=>report(e,false),[cb.ipmInterrupt]:e=>report(e,false)});
      const status=model.getModelStatus();
      if(status===highs.constants.modelStatus.infeasible)return {status:"infeasible"};
      const optimal=status===highs.constants.modelStatus.optimal;
      const limited=new Set<number>([highs.constants.modelStatus.timeLimit,highs.constants.modelStatus.iterationLimit,
        highs.constants.modelStatus.solutionLimit,highs.constants.modelStatus.interrupted]).has(status);
      if(!optimal&&!limited)throw new Error("solver_error");
      if(model.info.get("primal_solution_status")!==highs.constants.solutionStatus.feasible)return {status:"no_solution"};
      const values=Array.from(model.getSolution().colValue);
      progress({incumbent_objective:finite(model.getObjectiveValue()),best_bound:finite(model.info.get("mip_dual_bound")),relative_gap:finite(model.info.get("mip_gap")),values});
      return {status:"solved",values,optimal};
    } finally {model.dispose();}
  };
}
