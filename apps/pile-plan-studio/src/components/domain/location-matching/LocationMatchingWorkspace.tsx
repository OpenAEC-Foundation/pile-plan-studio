import {useEffect,useMemo,useRef,useState,type PointerEvent} from "react";
import {useTranslation} from "react-i18next";
import {LocationMatchingSurface} from "../../../app/exports/locationMatchingSurface.tsx";
import {useLocationMatching} from "../../../app/exports/useLocationMatching.ts";
import type {MatchingResult,LocationDecisions,LocationBulkAction} from "../../../core/exportRevisionContract.ts";
import {nextPendingSelection,withLocationChoice} from "../../../domain/exports/locationMatchingReview.ts";
import {elementLayoutScale} from "../../../domain/settings/uiBaseline.ts";
import {VIEWER_LAYOUT_CHANGE_EVENT} from "../../../viewer/viewerGeometry.ts";
import LocationMatchingCanvas from "./LocationMatchingCanvas.tsx";
import LocationMatchingPanel from "./LocationMatchingPanel.tsx";
import type {MatchingLines,MatchingLocation,MatchingSelection,MatchingTool} from "./locationMatchingTypes.ts";
import "./locationMatching.css";

export type MatchingWorkspaceProps={
  oldLocations:MatchingLocation[];newLocations:MatchingLocation[];initial:MatchingResult;toleranceMm:number;
  onConfirm:(decisions:LocationDecisions)=>void;onCancel:()=>void;initialAutomatic?:boolean;
};

export default function LocationMatchingWorkspace(props:MatchingWorkspaceProps){
  return <LocationMatchingSurface><MatchingWorkspace {...props}/></LocationMatchingSurface>;
}

function MatchingWorkspace({oldLocations,newLocations,initial,toleranceMm,onConfirm,onCancel,initialAutomatic=true}:MatchingWorkspaceProps){
  const {t}=useTranslation("common");
  const {result,busy,error,evaluate,decisions}=useLocationMatching(oldLocations,newLocations,initial,toleranceMm);
  const first=nextPendingSelection(initial);
  const [selection,setSelection]=useState<MatchingSelection|null>(first);
  const [tool,setTool]=useState<MatchingTool>(first?.side==="new"?"link":first?.side==="old"?"old":"new");
  const [pendingOnly,setPendingOnly]=useState(!!first),[lines,setLines]=useState<MatchingLines>("all");
  const [showGrid,setShowGrid]=useState(true);
  const [showOld,setShowOld]=useState(true),[showNew,setShowNew]=useState(true),[showLabels,setShowLabels]=useState(false);
  const [focusSerial,setFocusSerial]=useState(0),[notice,setNotice]=useState("");
  const workspaceRef=useRef<HTMLElement|null>(null),interactionRevision=useRef(0);
  const linksByOld=useMemo(()=>new Map(result.links.map(link=>[link.old_id,link])),[result.links]);
  const pendingCount=result.unmatched_new.length+result.unmatched_old.length;

  function clearSelection(){
    interactionRevision.current++;setSelection(null);setTool("new");
    const active=document.activeElement;
    if(active instanceof HTMLElement&&active.closest(".matching-hit-target"))active.blur();
  }
  useEffect(()=>{
    const escape=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();event.stopPropagation();clearSelection();}
    };
    window.addEventListener("keydown",escape);
    return()=>window.removeEventListener("keydown",escape);
  },[]);

  function select(side:"old"|"new",id:number,startLink=false){
    interactionRevision.current++;setSelection({side,id});
    setTool(side==="new"&&startLink?"link":side==="old"?"old":"new");
    if(!(side==="new"?result.unmatched_new:result.unmatched_old).includes(id))setPendingOnly(false);
    if(side==="new")setShowNew(true);else setShowOld(true);
  }
  function continueReview(next:MatchingResult,after?:MatchingSelection|null){
    const pending=nextPendingSelection(next,after);
    setSelection(pending);setTool(pending?.side==="new"?"link":pending?.side==="old"?"old":"new");
    setPendingOnly(true);setShowOld(true);setShowNew(true);
  }
  async function choose(newId:number,oldId:number|"added"|null){
    if(busy)return;
    const revision=interactionRevision.current;
    const owner=typeof oldId==="number"?linksByOld.get(oldId)?.new_id:null;
    const accepted=await evaluate(withLocationChoice(decisions,newId,oldId));
    if(!accepted)return;
    setNotice(owner!=null&&owner!==newId?t("exportTools.linkReassigned",{id:owner}):"");
    if(revision===interactionRevision.current&&oldId!==null)continueReview(accepted,{side:"new",id:newId});
  }
  function pick(side:"old"|"new",id:number){
    if(busy)return;
    if(side==="new"){select("new",id,true);setShowOld(true);return;}
    if(tool==="link"&&selection?.side==="new")void choose(selection.id,id);
    else select("old",id);
  }
  async function markRemoved(id:number){
    if(busy)return;
    const revision=interactionRevision.current,reconsider=result.removed.includes(id);
    const accepted=await evaluate({...decisions,removed:reconsider?decisions.removed.filter(item=>item!==id):[...decisions.removed,id]});
    if(accepted&&!reconsider&&revision===interactionRevision.current)continueReview(accepted,{side:"old",id});
  }
  async function bulk(action:LocationBulkAction){
    if(busy)return;
    const revision=interactionRevision.current;
    const accepted=await evaluate(decisions,action);
    if(accepted&&revision===interactionRevision.current){setNotice("");continueReview(accepted);}
  }
  function reviewSide(side:"new"|"old"){
    const id=(side==="new"?result.unmatched_new:result.unmatched_old)[0];
    if(id!=null){select(side,id,side==="new");setPendingOnly(true);}
  }
  function resize(event:PointerEvent<HTMLDivElement>){
    event.preventDefault();const root=workspaceRef.current;if(!root)return;
    const scale=elementLayoutScale(document.documentElement),initialWidth=root.querySelector("aside")!.getBoundingClientRect().width/scale,start=event.clientX;
    const move=(next:globalThis.PointerEvent)=>{
      const width=Math.max(280,Math.min(root.getBoundingClientRect().width/scale*.6,initialWidth+(start-next.clientX)/scale));
      root.style.setProperty("--matching-panel-width",`${width}px`);window.dispatchEvent(new Event(VIEWER_LAYOUT_CHANGE_EVENT));
    };
    const finish=()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",finish);};
    window.addEventListener("pointermove",move);window.addEventListener("pointerup",finish,{once:true});
  }

  return <section ref={workspaceRef} className="location-matching-workspace" aria-label={t("exportTools.matchingTitle")}>
    <header className="matching-workspace-header"><div><h1>{t("exportTools.matchingTitle")}</h1>
      <span aria-live="polite">{t(pendingCount?"exportTools.pendingSummary":"exportTools.reviewComplete",{newCount:result.unmatched_new.length,oldCount:result.unmatched_old.length})}</span></div>
      <button type="button" onClick={onCancel}>{t("exportTools.cancel")}</button>
      <button type="button" className="matching-primary" disabled={busy||!result.complete} onClick={()=>onConfirm(decisions)}>{t("exportTools.confirm")}</button>
    </header>
    <div className="matching-review-actions">
      <div className="matching-progress" role="group" aria-label={t("exportTools.reviewProgress")}>
        <button type="button" className="matching-pending-count" disabled={busy||!result.unmatched_new.length} onClick={()=>reviewSide("new")}><strong>{result.unmatched_new.length}</strong>{t("exportTools.newPending")}</button>
        <button type="button" className="matching-pending-count" disabled={busy||!result.unmatched_old.length} onClick={()=>reviewSide("old")}><strong>{result.unmatched_old.length}</strong>{t("exportTools.oldPending")}</button>
        <button type="button" onClick={()=>{setPendingOnly(false);if(result.links[0])select("new",result.links[0].new_id);}}><strong>{result.links.length}</strong>{t("exportTools.linked")}</button>
      </div>
      <div className="matching-bulk" role="group" aria-label={t("exportTools.bulkActions")}>
        <span>{t("exportTools.bulkActions")}</span>
        <button type="button" disabled={busy||!pendingCount} onClick={()=>void bulk("nearest")}>{t("exportTools.bulkNearestShort")}</button>
        <button type="button" disabled={busy||!pendingCount} onClick={()=>void bulk("separate")}>{t("exportTools.bulkSeparateShort")}</button>
      </div>
    </div>
    <div className="matching-workspace-toolbar">
      <div role="group" aria-label={t("exportTools.pickTool")}>
        <button type="button" aria-pressed={tool==="new"} onClick={()=>{setTool("new");setShowNew(true);}}>{t("exportTools.selectNewTool")}</button>
        <button type="button" aria-pressed={tool==="link"} disabled={selection?.side!=="new"} onClick={()=>{setTool("link");setShowOld(true);}}>{t("exportTools.linkOldTool")}</button>
        <button type="button" aria-pressed={tool==="old"} onClick={()=>{setTool("old");setShowOld(true);}}>{t("exportTools.inspectOldTool")}</button>
      </div>
      <label><input type="checkbox" checked={showOld} onChange={e=>setShowOld(e.target.checked)}/><svg className="matching-layer-key matching-old-key" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>{t("exportTools.oldLayer")}</label>
      <label><input type="checkbox" checked={showNew} onChange={e=>setShowNew(e.target.checked)}/><svg className="matching-layer-key matching-new-key" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5" fill="currentColor" stroke="currentColor" strokeWidth="1.5"/></svg>{t("exportTools.newLayer")}</label>
      <label><input type="checkbox" checked={showGrid} onChange={e=>setShowGrid(e.target.checked)}/>{t("exportTools.matchingGrid")}</label>
      <label><input type="checkbox" checked={showLabels} onChange={e=>setShowLabels(e.target.checked)}/>{t("exportTools.showNumbers")}</label>
      <label>{t("exportTools.connectionLines")}<select aria-label={t("exportTools.connectionLines")} value={lines} onChange={e=>setLines(e.target.value as MatchingLines)}>
        <option value="none">{t("exportTools.linesNone")}</option><option value="selected">{t("exportTools.linesSelected")}</option><option value="all">{t("exportTools.linesAll")}</option>
      </select></label>
    </div>
    <p className="matching-instruction" role="status">{t(tool==="link"?"exportTools.pickOldInstruction":tool==="old"?"exportTools.inspectOldInstruction":"exportTools.pickNewInstruction")}
      <span>{notice||t("exportTools.pendingMarkerHelp")}</span></p>
    <div className="matching-workspace-body">
      <LocationMatchingCanvas oldLocations={oldLocations} newLocations={newLocations} result={result} selection={selection} tool={tool} lines={lines}
        showOld={showOld} showNew={showNew} showLabels={showLabels} showGrid={showGrid} focusSerial={focusSerial} onPick={pick} onClearSelection={clearSelection}/>
      <div className="matching-panel-splitter" role="separator" aria-label={t("exportTools.matchingPanelWidth")} onPointerDown={resize}/>
      <LocationMatchingPanel oldLocations={oldLocations} newLocations={newLocations} initial={initial} initialAutomatic={initialAutomatic}
        result={result} selection={selection} busy={busy} error={error} pendingOnly={pendingOnly} onPendingOnlyChange={setPendingOnly}
        onSelect={select} onChoose={choose} onFocus={()=>setFocusSerial(n=>n+1)} onChooseOnPlan={()=>{setTool("link");setShowOld(true);}}
        onRemoved={id=>void markRemoved(id)} onContinue={()=>continueReview(result)} />
    </div>
  </section>;
}
