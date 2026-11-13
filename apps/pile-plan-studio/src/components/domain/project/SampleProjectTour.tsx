import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, OpenAECProvider } from "../../../openaec/react/src/index";
import type { SelectedCpt } from "../../../core/projectTypes.ts";
import spriteUrl from "../../../openaec/studioSprite.ts";
import "./sampleProjectTour.css";

const STEPS = ["loadPoint", "cpts", "assignment", "optimization"] as const;
type Step = typeof STEPS[number];

const PLAN_TAB = '[data-tour-target="plan-tabs"] [role="tab"]:first-child:not([aria-selected="true"])';
const MARKER = '.viewer-canvas [data-map-marker-key^="load-point:"]:not(.is-locked)';
const targetSelector = (name: string) => `[data-tour-target="${name}"]`;

type Cue = { element: HTMLElement; hint: string; action?: "select" | "assign"; ready?: boolean };
type CueState = Pick<Cue, "hint" | "ready"> & {
  hole: string;
  mapWindow?: string;
  cptWindows: string[];
};

function findCue(workspace: HTMLElement, step: Step, marker: HTMLElement | null,
  clicked: HTMLElement | null, selected: boolean, mapPointId?: number): Cue | null {
  const find = (selector: string) => workspace.querySelector<HTMLElement>(selector);
  const cue = (element: HTMLElement | null, hint: string, options?: Pick<Cue, "action" | "ready">) =>
    element ? { element, hint, ...options } : null;
  const target = (name: string, hint: string, options?: Pick<Cue, "action" | "ready">) =>
    cue(find(targetSelector(name)), hint, options);
  const inactiveTab = (name: string, hint: string) =>
    cue(find(`${targetSelector(name)}[aria-pressed="false"]`), hint);

  switch (step) {
    case "loadPoint":
      return (selected ? cue(find(`[data-tour-load-point-id="${mapPointId}"]`), "inspectLoad", { ready: true })
        ?? target("load-selection", "inspectLoad", { ready: true }) : null)
        ?? cue(marker, "selectPoint", { action: "select" });
    case "cpts":
      return inactiveTab("cpts-tab", "openCpts")
        ?? target("cpt-advice", "inspectAdvice", { ready: true })
        ?? target("cpt-link", "inspectCpts")
        ?? target("cpts-tab", "waitingForCpts");
    case "assignment": {
      const tab = inactiveTab("pile-options-tab", "openOptions");
      if (tab) return tab;
      const row = targetSelector("pile-option");
      if (clicked?.matches(row) && workspace.contains(clicked)) {
        if (clicked.getAttribute("aria-selected") === "true") return cue(clicked, "inspectAssignment", { ready: true });
        if (clicked.getAttribute("aria-disabled") === "true") return cue(clicked, "waitingForAssignment");
      }
      return cue(find(`${row}[aria-selected="false"]:not([aria-disabled="true"])`), "assignOption", { action: "assign" })
        ?? cue(find(`${row}[aria-selected="true"]:not([aria-disabled="true"])`), "inspectAssignment", { ready: true })
        ?? cue(find(`${row}[aria-disabled="true"]`), "waitingForAssignment")
        ?? target("pile-options-tab", "waitingForOptions");
    }
    case "optimization":
      return target("optimization-progress", "watchProgress")
        ?? target("optimization-result", "readResult", { ready: true })
        ?? cue(find(`${targetSelector("run-optimization")}:not(:disabled)`), "runOptimization")
        ?? target("run-optimization", "waitingForAnalysis")
        ?? target("optimization", "openOptimization")
        ?? cue(find(PLAN_TAB), "openPlan");
  }
}

/** Measure in screen coordinates so root zoom, scrollable panels and the map scale agree. */
function spotlight(workspace: HTMLElement, bounds: DOMRect, element: HTMLElement, pad: number): string | null {
  const box = element.getBoundingClientRect();
  if (!bounds.width || !bounds.height || !box.width || !box.height) return null;
  let { left, top, right, bottom } = bounds;
  for (let parent = element.parentElement; parent && parent !== workspace; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    const clip = parent.getBoundingClientRect();
    if (clip.width > 0 && /hidden|auto|scroll|clip/.test(style.overflowX || style.overflow)) {
      left = Math.max(left, clip.left);
      right = Math.min(right, clip.right);
    }
    if (clip.height > 0 && /hidden|auto|scroll|clip/.test(style.overflowY || style.overflow)) {
      top = Math.max(top, clip.top);
      bottom = Math.min(bottom, clip.bottom);
    }
  }
  if (box.right <= left || box.left >= right || box.bottom <= top || box.top >= bottom) return null;
  const x = (Math.max(left, box.left - pad) - bounds.left) / bounds.width * 100;
  const y = (Math.max(top, box.top - pad) - bounds.top) / bounds.height * 100;
  const endX = (Math.min(right, box.right + pad) - bounds.left) / bounds.width * 100;
  const endY = (Math.min(bottom, box.bottom + pad) - bounds.top) / bounds.height * 100;
  const rx = Math.min((endX - x) / 2, 500 / bounds.width);
  const ry = Math.min((endY - y) / 2, 500 / bounds.height);
  return `M${x + rx},${y} H${endX - rx} Q${endX},${y} ${endX},${y + ry} V${endY - ry}
    Q${endX},${endY} ${endX - rx},${endY} H${x + rx} Q${x},${endY} ${x},${endY - ry}
    V${y + ry} Q${x},${y} ${x + rx},${y} Z`;
}

function scrollToCue(element: HTMLElement) {
  if (!element.matches(MARKER)) element.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

type Props = {
  workspace: HTMLElement | null;
  selectedLoadPointIds: readonly number[];
  cptsByLoadPointId: ReadonlyMap<number, readonly SelectedCpt[]>;
  onFocusLoadPoint: (id: number, cptIds?: readonly number[]) => void;
  onClose: () => void;
  paused?: boolean;
};

export default function SampleProjectTour({ workspace, selectedLoadPointIds, cptsByLoadPointId, onFocusLoadPoint, onClose, paused = false }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [cue, setCue] = useState<CueState | null>(null);
  const [marker, setMarker] = useState<HTMLElement | null>(null);
  const [clicked, setClicked] = useState<HTMLElement | null>(null);
  const focused = useRef<HTMLElement | null>(null);
  const target = useRef<Cue | null>(null);
  const headingId = useId();
  const maskId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const framedCpts = useRef<string | null>(null);
  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  const markerId = marker ? Number(marker.dataset.mapMarkerKey?.split(":")[1]) : null;
  const selected = clicked === marker && markerId !== null && selectedLoadPointIds.includes(markerId);
  const mapPointId = markerId !== null && selectedLoadPointIds.includes(markerId) ? markerId : selectedLoadPointIds[0];
  const showMapContext = current === "cpts" || current === "assignment" || (current === "loadPoint" && selected);
  const cpts = current === "cpts" && mapPointId !== undefined ? cptsByLoadPointId.get(mapPointId) : undefined;

  useEffect(() => {
    if (!paused) heading.current?.focus({ preventScroll: true });
  }, [step, paused]);

  useEffect(() => {
    if (paused || mapPointId === undefined || !cpts?.length) return;
    const ids = cpts.map(({ cpt }) => cpt.id);
    const key = [mapPointId, ...ids].join(":");
    if (framedCpts.current === key) return;
    framedCpts.current = key;
    onFocusLoadPoint(mapPointId, ids);
  }, [paused, mapPointId, cpts, onFocusLoadPoint]);

  useEffect(() => {
    if (!workspace || paused || current !== "loadPoint") return;
    const point = marker && workspace.contains(marker) && marker.matches(MARKER)
      ? marker : workspace.querySelector<HTMLElement>(MARKER);
    if (!point || focused.current === point) return;
    focused.current = point;
    setMarker(point);
    onFocusLoadPoint(Number(point.dataset.mapMarkerKey?.split(":")[1]));
  }, [workspace, paused, current, marker, onFocusLoadPoint]);

  useEffect(() => {
    if (!workspace || paused) return;
    let frame = 0;
    const update = () => {
      const match = findCue(workspace, current, marker, clicked, selected, mapPointId);
      if (target.current?.element !== match?.element) {
        if (target.current) {
          target.current.element.removeAttribute("data-tour-highlight");
          resizeObserver.unobserve(target.current.element);
        }
        if (match) {
          scrollToCue(match.element);
          resizeObserver.observe(match.element);
          match.element.setAttribute("data-tour-highlight", "true");
        }
      }
      target.current = match;
      const bounds = workspace.getBoundingClientRect();
      const hole = match && spotlight(workspace, bounds, match.element, match.element.matches(MARKER) ? 10 : 5);
      const mapPoint = showMapContext && mapPointId !== undefined
        ? workspace.querySelector<HTMLElement>(`.viewer-canvas [data-map-marker-key="load-point:${mapPointId}"]`) : null;
      const mapWindow = mapPoint && mapPoint !== match?.element
        ? spotlight(workspace, bounds, mapPoint, 36) ?? undefined : undefined;
      const cptWindows = (cpts ?? []).flatMap(({ cpt }) => {
        const element = workspace.querySelector<HTMLElement>(`.viewer-canvas [data-map-marker-key="cpt:${cpt.id}"]`);
        const window = element && spotlight(workspace, bounds, element, 9);
        return window ? [window] : [];
      });
      if (hole && match && document.activeElement === heading.current
        && (match.element.tabIndex >= 0 || match.element.getAttribute("role") === "tab")
        && !match.element.matches(':disabled,[aria-disabled="true"]')) {
        match.element.focus({ preventScroll: true });
      }
      const next = hole && match ? { hole, mapWindow, cptWindows, hint: match.hint, ready: match.ready } : null;
      setCue(previous => previous?.hole === next?.hole && previous?.hint === next?.hint
        && previous?.mapWindow === next?.mapWindow && previous?.ready === next?.ready
        && previous?.cptWindows.join() === next?.cptWindows.join()
        ? previous : next);
    };
    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const onClick = (event: MouseEvent) => {
      const match = target.current;
      if (match?.action && event.target instanceof Node && match.element.contains(event.target)) {
        setClicked(match.element);
        if (match.action === "select" && markerId !== null) onFocusLoadPoint(markerId);
      }
      scheduleUpdate();
    };
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(workspace);
    const canvas = workspace.querySelector(".viewer-canvas");
    if (canvas) resizeObserver.observe(canvas);
    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(workspace, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ["aria-selected", "aria-pressed", "aria-disabled", "disabled", "data-tour-target", "style"],
    });
    window.addEventListener("resize", scheduleUpdate);
    workspace.addEventListener("click", onClick, true);
    workspace.addEventListener("scroll", scheduleUpdate, true);
    workspace.addEventListener("pointerup", scheduleUpdate);
    workspace.addEventListener("wheel", scheduleUpdate, { passive: true });
    update();
    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleUpdate);
      workspace.removeEventListener("click", onClick, true);
      workspace.removeEventListener("scroll", scheduleUpdate, true);
      workspace.removeEventListener("pointerup", scheduleUpdate);
      workspace.removeEventListener("wheel", scheduleUpdate);
      target.current?.element.removeAttribute("data-tour-highlight");
      target.current = null;
    };
  }, [workspace, paused, current, marker, markerId, clicked, selected, mapPointId, showMapContext, cpts, onFocusLoadPoint]);

  useEffect(() => {
    if (paused) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog[open]")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [onClose, paused]);

  const goToStep = (index: number) => {
    setClicked(null);
    setCue(null);
    focused.current = null;
    framedCpts.current = null;
    setStep(index);
  };
  const next = () => last ? onClose() : goToStep(step + 1);

  if (paused) return null;
  return <OpenAECProvider sprite={spriteUrl}>
    {cue && <svg className="sample-project-tour-spotlight" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
        <rect width="100" height="100" fill="white" />
        {cue.mapWindow && <path className="sample-project-tour-map-window" d={cue.mapWindow} fill="black" />}
        {cue.cptWindows.map((hole, index) => <path key={index} className="sample-project-tour-cpt-window" d={hole} fill="black" />)}
        <path d={cue.hole} fill="black" />
      </mask>
      <rect className="sample-project-tour-shade" width="100" height="100" mask={`url(#${maskId})`} />
      {cue.cptWindows.map((hole, index) => <path key={index} className="sample-project-tour-context-outline"
        d={hole} vectorEffect="non-scaling-stroke" />)}
      <path className="sample-project-tour-outline" d={cue.hole} vectorEffect="non-scaling-stroke" />
    </svg>}
    <section className="oa-app sample-project-tour" aria-labelledby={headingId}
      onKeyDown={event => {
        if (event.code === "Space" && event.target instanceof HTMLButtonElement) event.stopPropagation();
      }}>
      <div className="sample-project-tour-copy">
        <div className="sample-project-tour-header">
          <span>{t("sampleTour.progress", { current: step + 1, total: STEPS.length })}</span>
          <div className="sample-project-tour-progress" aria-hidden="true">
            {STEPS.map((name, index) => <i key={name} data-active={index <= step} />)}
          </div>
        </div>
        <h2 ref={heading} id={headingId} tabIndex={-1}>{t(`sampleTour.${current}.title`)}</h2>
        <p>{cpts?.length ? t("sampleTour.cpts.selection", { count: cpts.length }) : t(`sampleTour.${current}.instruction`)}</p>
        <p className="sample-project-tour-hint" role="status">
          {t(`sampleTour.hints.${cue?.hint ?? (current === "loadPoint" ? "findPoint" : "findTarget")}`)}
        </p>
      </div>
      <div className="sample-project-tour-controls">
        {!cue?.ready && !last && <Button kind="quiet" onClick={next}>{t("sampleTour.skipStep")}</Button>}
        {step > 0 && <Button onClick={() => goToStep(step - 1)}>{t("firstProject.previous")}</Button>}
        <Button kind="primary" onClick={next} disabled={!cue?.ready}>
          {t(last ? "sampleTour.finish" : "firstProject.next")}
        </Button>
        <Button className="sample-project-tour-exit" kind="quiet" onClick={onClose}>{t("sampleTour.skip")}</Button>
      </div>
    </section>
  </OpenAECProvider>;
}
