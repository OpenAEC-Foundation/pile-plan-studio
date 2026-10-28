import {createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode} from "react";
import {createPortal} from "react-dom";
import type {LegendItems} from "../../core/projectTypes.ts";

type Surface = {element: HTMLElement | null; activate: () => () => void; legend: LegendItems | null};
export const LocationMatchingSurfaceContext = createContext<Surface>({element: null, activate: () => () => {}, legend: null});

export function useLocationMatchingSurface(legend: LegendItems) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [active, setActive] = useState(false);
  const activate = useCallback(() => {setActive(true); return () => setActive(false);}, []);
  const value = useMemo(() => ({element, activate, legend}), [element, activate, legend]);
  return {active, setElement, value};
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
