import {useEffect,useState} from "react";

export function useCorePreview<T>(key:string|null,run:()=>Promise<T>){
  const [state,setState]=useState<{key:string|null;result:T|null;error:unknown;pending:boolean}>({key:null,result:null,error:null,pending:false});
  useEffect(()=>{
    if(key===null)return;
    let cancelled=false;
    setState({key,result:null,error:null,pending:true});
    void Promise.resolve().then(run).then(result=>{if(!cancelled)setState({key,result,error:null,pending:false});},error=>{if(!cancelled)setState({key,result:null,error,pending:false});});
    return()=>{cancelled=true;};
  },[key]);
  return state.key===key&&key!==null?state:{key,result:null,error:null,pending:key!==null};
}
