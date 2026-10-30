import {memo, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type MouseEvent} from "react";
import {useMatchingText} from "./matchingText.tsx";
import {LocationMatchingSurfaceContext} from "../../../app/exports/locationMatchingSurface.tsx";
import type {MatchingResult} from "../../../core/exportRevisionContract.ts";
import {useViewerViewport} from "../pile-plan-viewer/useViewerViewport.ts";
import {getLocalCanvasRect, getLocalViewportPointer} from "../pile-plan-viewer/viewerDomCoordinates.ts";
import ViewerDrawingSvg from "../pile-plan-viewer/ViewerDrawingSvg.tsx";
import {createProjectViewTransform, projectPointPixels} from "../../../viewer/viewerGeometry.ts";
import {clampScale, getViewportTransform, panViewport, type Viewport} from "../../../viewer/viewport.ts";
import {getConfigurationStyle} from "../../../viewer/legend.ts";
import {renderPileSymbolSvgChildren} from "../../../viewer/pileSymbols.ts";
import {createHoverMarkerIndex, findHoverCandidates} from "../../../viewer/hoverCandidates.ts";
import type {LegendItems} from "../../../core/projectTypes.ts";
import {hasMatchingCoordinates,locationLabel, type MatchingLines, type MatchingLocation, type MatchingSelection, type MatchingTool} from "./locationMatchingTypes.ts";
import "../pile-plan-viewer/viewer.css";

type Props = {
  oldLocations: MatchingLocation[]; newLocations: MatchingLocation[]; result: MatchingResult;
  selection: MatchingSelection | null; tool: MatchingTool; lines: MatchingLines;
  showOld: boolean; showNew: boolean; showLabels: boolean;showGrid:boolean; focusSerial: number; zoomSerial?:number;
  onPick: (side: "old" | "new", id: number) => void;
  onClearSelection:()=>void;
};

export default function LocationMatchingCanvas(props: Props) {
  const {oldLocations:allOldLocations, newLocations:allNewLocations, result, selection, tool, lines, showOld, showNew, showLabels, showGrid, focusSerial, zoomSerial=0, onPick, onClearSelection} = props;
  const {t} = useMatchingText();
  const oldLocations=useMemo(()=>allOldLocations.filter(hasMatchingCoordinates),[allOldLocations]);
  const newLocations=useMemo(()=>allNewLocations.filter(hasMatchingCoordinates),[allNewLocations]);
  const {legend} = useContext(LocationMatchingSurfaceContext);
  const [viewport, setViewport] = useState<Viewport>({scale: 1, offsetX: 0, offsetY: 0});
  const interactionRef = useRef<{last: {x: number; y: number}} | null>(null);
  const dragStart=useRef<{x:number;y:number}|null>(null),didDrag=useRef(false);
  const allPoints = useMemo(() => [...oldLocations, ...newLocations], [oldLocations, newLocations]);
  const bounds = useMemo(() => {
    const xs = allPoints.map(p => p.x_mm), ys = allPoints.map(p => p.y_mm);
    return allPoints.length ? {minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys)} : {minX: 0, maxX: 1, minY: 0, maxY: 1};
  }, [allPoints]);
  const state = {bounds, viewport, loadPoints: newLocations, activePilePlanId: "location-review", selectedLoadPointIds: []};
  const view = useViewerViewport({state, onStateChange: next => setViewport(next.viewport), interactionRef});
  const oldById = useMemo(() => new Map(oldLocations.map(p => [p.id, p])), [oldLocations]);
  const newById = useMemo(() => new Map(newLocations.map(p => [p.id, p])), [newLocations]);
  const oldPixels = useMemo(() => projectLocations(oldLocations, view.projectTransform), [oldLocations, view.projectTransform]);
  const newPixels = useMemo(() => projectLocations(newLocations, view.projectTransform), [newLocations, view.projectTransform]);
  const targetSide = tool === "new" ? "new" : "old";
  const targetLocations = targetSide === "new" ? showNew ? newLocations : [] : showOld ? oldLocations : [];
  const targetIndex = useMemo(() => {
    const pixels = targetSide === "new" ? newPixels : oldPixels, size = view.projectTransform.canvasSize;
    return createHoverMarkerIndex(targetLocations.map(point => ({key: String(point.id), visualRadius: targetSide === "new" ? 6.5 : 10,
      point: {x: pixels.get(point.id)!.x / size.width * 100, y: pixels.get(point.id)!.y / size.height * 100}})));
  }, [targetSide, showOld, showNew, newLocations, oldLocations, newPixels, oldPixels, view.projectTransform]);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const hoverFrame = useRef<number | null>(null);
  useEffect(() => {setHoveredId(null);}, [tool, showOld, showNew]);
  useEffect(() => () => {if (hoverFrame.current !== null) cancelAnimationFrame(hoverFrame.current);}, []);
  useEffect(()=>{if(!selection)setHoveredId(null);},[selection]);
  const pendingOld=new Set(result.unmatched_old);
  const pending = new Set(result.unmatched_new), added = new Set(result.added), removed = new Set(result.removed);
  const activeLink = result.links.find(link => selection?.side === "new" ? link.new_id === selection.id : link.old_id === selection?.id);
  const visibleLinks = !showOld || !showNew || lines === "none" ? [] : lines === "all" ? result.links : activeLink ? [activeLink] : [];

  function commitViewport(next: Viewport) {
    if (view.zoomCommitTimerRef.current) {clearTimeout(view.zoomCommitTimerRef.current); view.zoomCommitTimerRef.current = null;}
    view.viewportRef.current = next;
    view.applyViewportDisplay(next);
    setViewport(next);
  }

  function focus(input: MatchingLocation[],preserveScale=false) {
    const points=input.filter(hasMatchingCoordinates);
    const canvas = view.canvasRef.current;
    if (!canvas || !points.length) return;
    const screen = canvas.getBoundingClientRect(), rect = getLocalCanvasRect(canvas);
    const center = view.getProjectViewportPointer(screen.left + screen.width / 2, screen.top + screen.height / 2, rect);
    const pixels = points.map(p => projectPointPixels(p, view.projectTransformRef.current));
    const minX = Math.min(...pixels.map(p => p.x)), maxX = Math.max(...pixels.map(p => p.x));
    const minY = Math.min(...pixels.map(p => p.y)), maxY = Math.max(...pixels.map(p => p.y));
    const scale = preserveScale?view.viewportRef.current.scale:clampScale(Math.min(rect.width * .8 / Math.max(maxX - minX, 1), rect.height * .8 / Math.max(maxY - minY, 1), points.length > 2 ? 10 : 5));
    commitViewport({scale, offsetX: center.x - (minX + maxX) / 2 * scale, offsetY: center.y - (minY + maxY) / 2 * scale});
  }

  useEffect(() => {
    if (!focusSerial || !selection) return;
    const point = (selection.side === "new" ? newById : oldById).get(selection.id);
    const partner = activeLink ? (selection.side === "new" ? oldById.get(activeLink.old_id) : newById.get(activeLink.new_id)) : undefined;
    focus([point, partner].filter((p): p is NonNullable<typeof p> => !!p), true);
  }, [focusSerial]);

  useEffect(()=>{
    if(!zoomSerial||!selection)return;
    const point=(selection.side==="new"?newById:oldById).get(selection.id);
    const partner=activeLink?(selection.side==="new"?oldById.get(activeLink.old_id):newById.get(activeLink.new_id)):undefined;
    focus([point,partner].filter((p):p is NonNullable<typeof p>=>!!p));
  },[zoomSerial]);

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 1 && (event.button !== 0 || (event.target as Element).closest("button"))) return;
    event.preventDefault();
    const scale = getLocalCanvasRect(event.currentTarget).scale;
    dragStart.current={x:event.clientX,y:event.clientY};didDrag.current=false;
    interactionRef.current = {last: getLocalViewportPointer(event.clientX, event.clientY, scale)};
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const interaction = interactionRef.current;
    if (!interaction) {
      const clientX = event.clientX, clientY = event.clientY;
      if (hoverFrame.current !== null) cancelAnimationFrame(hoverFrame.current);
      hoverFrame.current = requestAnimationFrame(() => {
        hoverFrame.current = null;
        const candidates = nearby(clientX, clientY);
        setHoveredId(candidates.length ? Number(candidates[0].key) : null);
      });
      return;
    }
    if(dragStart.current&&Math.hypot(event.clientX-dragStart.current.x,event.clientY-dragStart.current.y)>4)didDrag.current=true;
    const point = getLocalViewportPointer(event.clientX, event.clientY, getLocalCanvasRect(event.currentTarget).scale);
    const next = panViewport(view.viewportRef.current, {deltaX: point.x - interaction.last.x, deltaY: point.y - interaction.last.y});
    interaction.last = point; view.viewportRef.current = next; view.applyViewportDisplay(next);
  }
  function pointerUp() {
    if (!interactionRef.current) return;
    interactionRef.current = null; commitViewport(view.viewportRef.current);
  }
  function backgroundClick(event:MouseEvent<HTMLDivElement>){
    if((event.target as Element).closest("button")||didDrag.current)return;
    const candidate=event.detail?nearby(event.clientX,event.clientY)[0]:null;
    if(candidate)onPick(targetSide,Number(candidate.key));else {setHoveredId(null);onClearSelection();}
  }
  function nearby(clientX: number, clientY: number) {
    const canvas = view.canvasRef.current;
    if (!canvas) return [];
    const pointer = view.getProjectViewportPointer(clientX, clientY, getLocalCanvasRect(canvas));
    return findHoverCandidates(targetIndex, {pointer, canvas: view.projectTransformRef.current.canvasSize, viewport: view.viewportRef.current});
  }
  function pick(event: MouseEvent<HTMLButtonElement>, fallbackId: number) {
    // Overlapping transparent targets must resolve by geometry, rather than DOM order.
    const candidates = event.detail ? nearby(event.clientX, event.clientY) : [];
    onPick(targetSide, candidates.length ? Number(candidates[0].key) : fallbackId);
    setHoveredId(null);
  }

  return <section className="matching-plan" aria-label={t("exportTools.matchingCanvas")}>
    <div className="matching-canvas-tools"><button type="button" onClick={() => focus(allPoints)}>{t("exportTools.fitPlan")}</button>
      <span>{t("exportTools.canvasHelp")}</span><output>{Math.round(viewport.scale * 100)}%</output></div>
    <div className="viewer-canvas matching-canvas" ref={view.canvasRef} tabIndex={0}
      onWheel={e => view.handleWheel(e, () => setHoveredId(null))} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}
      onPointerLeave={() => setHoveredId(null)} onClick={backgroundClick}>
      {showGrid&&<canvas aria-hidden="true" className="viewer-coordinate-grid" ref={view.gridRef}/>}
      <div className="viewer-layout-anchor" ref={view.layoutAnchorRef} style={{width: view.projectTransform.canvasSize.width, height: view.projectTransform.canvasSize.height}}>
        <div className="viewer-content" ref={view.stageRef} style={{width: view.projectTransform.canvasSize.width, height: view.projectTransform.canvasSize.height, transform: getViewportTransform(viewport)} as CSSProperties}>
          <ViewerDrawingSvg width={view.projectTransform.canvasSize.width} height={view.projectTransform.canvasSize.height} tipLevelRegionPresentation={[]} loadPointGroupGeometry={[]} cptConnectionSegments={[]}>
            {showOld && oldLocations.map(point => <MatchingSymbol key={`old:${point.id}`} point={point} pixel={oldPixels.get(point.id)!} old legend={legend}
              selected={selection?.side === "old" && selection.id === point.id} partner={activeLink?.old_id === point.id} hovered={targetSide === "old" && hoveredId === point.id} label={showLabels} pending={pendingOld.has(point.id)} removed={removed.has(point.id)}/>)}
            {showNew && newLocations.map(point => <MatchingSymbol key={`new:${point.id}`} point={point} pixel={newPixels.get(point.id)!} legend={legend}
              selected={selection?.side === "new" && selection.id === point.id} partner={activeLink?.new_id === point.id} hovered={targetSide === "new" && hoveredId === point.id} label={showLabels} pending={pending.has(point.id)} added={added.has(point.id)}/>)}
            <g className="matching-connection-layer">{visibleLinks.map(link=>{
              const a=oldPixels.get(link.old_id),b=newPixels.get(link.new_id);
              if(!a||!b||(a.x===b.x&&a.y===b.y))return null;
              return <line key={link.new_id} className="matching-link" x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={link===activeLink?"#d97706":"#657b89"} strokeWidth={1} vectorEffect="non-scaling-stroke"/>;
            })}</g>
          </ViewerDrawingSvg>
          {targetLocations.map(point => {
            const side = tool === "new" ? "new" : "old", p = (side === "new" ? newPixels : oldPixels).get(point.id)!;
            return <button type="button" className="viewer-marker-hit-target matching-hit-target" key={`${side}:${point.id}`} style={{left: p.x, top: p.y, width: 26, height: 26}}
              data-side={side} aria-label={t(side === "new" ? "exportTools.pickNew" : tool === "link" ? "exportTools.pickPartner" : "exportTools.pickOld", {id: locationLabel(point)})}
              onClick={e => pick(e, point.id)}/>;
          })}
        </div>
      </div>
    </div>
  </section>;
}

function projectLocations(points: (MatchingLocation & {x_mm:number;y_mm:number})[], transform: ReturnType<typeof createProjectViewTransform>) {
  return new Map(points.map(point => [point.id, projectPointPixels(point, transform)]));
}

const MatchingSymbol = memo(function MatchingSymbol({point, pixel, old = false, legend, selected, partner, hovered, label, removed = false, pending = false, added = false}: {
  point: MatchingLocation; pixel: {x: number; y: number}; old?: boolean; legend: LegendItems | null;
  selected: boolean; partner: boolean; hovered: boolean; label: boolean; removed?: boolean; pending?: boolean; added?: boolean;
}) {
  const style = point.pile_size_mm != null && point.tip_level_mm != null && legend
    ? getConfigurationStyle({pile_size_mm: point.pile_size_mm, configuration: {pile_size_mm: point.pile_size_mm, pile_tip_level_mm: point.tip_level_mm}}, legend)
    : {symbol: {baseShape: point.shape === "square" ? "square" as const : "circle" as const, fillPattern: "full" as const}, color: "#53758a"};
  if (legend?.encodingMode === "size-color-tip-region") style.symbol = {baseShape: point.shape === "round" ? "circle" : point.shape === "square" ? "square" : "diamond", fillPattern: "full"};
  const diameter = old ? 20 : 13;
  const symbol = renderPileSymbolSvgChildren(style.symbol, old ? "#ffffff" : style.color, `matching-${old ? "old" : "new"}-${point.id}`, {outlineColor: style.color, neutralFill: "#ffffff"});
  return <g data-matching-side={old?"old":"new"} data-location-id={point.id} transform={`translate(${pixel.x} ${pixel.y})`} opacity={removed ? .45 : 1}>
    {(selected||hovered||partner||pending)&&<circle className="matching-selection-ring" r={old?15:12} fill="none"
      stroke={old&&(selected||hovered||partner)?"#31556b":selected||hovered?"#d97706":partner?"#31556b":"#767d82"}
      strokeWidth={selected?2.8:hovered?2:1.5} strokeDasharray={old&&(selected||hovered||partner)?"4 2":selected||hovered?undefined:"2 3"}/>}
    {pending&&<text className="matching-pending-badge" x={old?-19:11} y={old?-13:18} fill="#263e4d" stroke="#fff" strokeWidth={3} paintOrder="stroke" fontSize={13} fontWeight="bold">?</text>}
    <g transform={`translate(${-diameter / 2} ${-diameter / 2}) scale(${diameter / 24})`} dangerouslySetInnerHTML={{__html: symbol}}/>
    {removed && <path d="M-9,-9L9,9M-9,9L9,-9" stroke="#666" strokeWidth={1.5}/>}
    {added && <text x={8} y={-8} fill="#222" fontSize={12}>+</text>}
    {(selected || hovered || label) && <text x={old?18:24} y={old?-18:22} fill="#172026" stroke="#fff" strokeWidth={3} paintOrder="stroke" fontSize={12}>{old && point.mark != null ? `M${point.mark}` : point.source_id ?? point.id}</text>}
  </g>;
});
