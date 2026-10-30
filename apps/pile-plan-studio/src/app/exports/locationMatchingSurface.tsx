import {createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode} from "react";
import {createPortal} from "react-dom";
import type {LegendItems} from "../../core/projectTypes.ts";

export type MatchingHistoryControls = {canUndo:boolean;canRedo:boolean;undo:()=>void;redo:()=>void};
type Surface = {element: HTMLElement | null; activate: () => () => void; legend: LegendItems | null;registerHistory:(controls:MatchingHistoryControls)=>()=>void};
export const LocationMatchingSurfaceContext = createContext<Surface>({element: null, activate: () => () => {}, legend: null,registerHistory:()=>()=>{}});

export function useLocationMatchingSurface(legend: LegendItems) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [active, setActive] = useState(false);
  const [history,setHistory]=useState<MatchingHistoryControls|null>(null);
  const registerHistory=useCallback((controls:MatchingHistoryControls)=>{
    setHistory(controls);
    return()=>setHistory(current=>current===controls?null:current);
  },[]);
  const activate = useCallback(() => {setActive(true); return () => setActive(false);}, []);
  const value = useMemo(() => ({element, activate, legend,registerHistory}), [element, activate, legend,registerHistory]);
  return {active, history,setElement, value};
}

export function LocationMatchingSurface({children}: {children: ReactNode}) {
  const {element, activate} = useContext(LocationMatchingSurfaceContext);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const deactivate = activate();
    setReady(true);
    return deactivate;
  }, [activate]);
  // The shared viewport captures its fixed projection on mount; never measure a hidden host.
  return element ? ready ? createPortal(children, element) : null : children;
}
