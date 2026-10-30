import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from "react";
import type {PileConfigurationOption,ResistanceDirection} from "../../core/projectTypes.ts";
import {directionalOption} from "../../domain/pile-options/loadDirection.ts";
import {getSetting,setSetting} from "../../store.ts";
const Context=createContext<{mode:ResistanceDirection;setMode:(mode:ResistanceDirection)=>void}>({mode:"compression",setMode:()=>{}});
export function LoadDirectionProvider({children}:{children:ReactNode}) {
 const [mode,update]=useState<ResistanceDirection>("compression");
 useEffect(()=>{let active=true;void getSetting<ResistanceDirection>("loadDirection","compression").then(value=>{if(active)update(value==="tension"?"tension":"compression")});return()=>{active=false}},[]);
 return <Context.Provider value={{mode,setMode:value=>{update(value);void setSetting("loadDirection",value)}}}>{children}</Context.Provider>;
}
export function useLoadDirection(){return useContext(Context)}
export function useDisplayOptions(options:Map<number,PileConfigurationOption[]>){
 const {mode}=useLoadDirection();return useMemo(()=>new Map([...options].map(([id,rows])=>[id,rows.map(row=>directionalOption(row,mode))])),[options,mode]);
}
