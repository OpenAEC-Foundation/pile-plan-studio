import {useEffect, useMemo, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import type {MatchingResult} from "../../../core/exportRevisionContract.ts";
import {exportErrorText} from "../exports/exportErrorText.ts";
import {locationLabel, type MatchingLocation, type MatchingSelection} from "./locationMatchingTypes.ts";

type Props = {
  oldLocations: MatchingLocation[]; newLocations: MatchingLocation[]; initial: MatchingResult; initialAutomatic: boolean;
  result: MatchingResult; selection: MatchingSelection | null; busy: boolean; error: unknown; pendingOnly: boolean; onPendingOnlyChange: (value:boolean)=>void;
  onSelect: (side: "old" | "new", id: number, startLink?: boolean) => void;
  onChoose: (newId: number, oldId: number | "added" | null) => Promise<void>;
  onRemoved: (oldId: number) => void; onFocus: () => void; onChooseOnPlan: () => void; onContinue:()=>void;
};

export default function LocationMatchingPanel(props: Props) {
  const {oldLocations, newLocations, result, initial, initialAutomatic, selection, busy, error, pendingOnly, onPendingOnlyChange, onSelect, onChoose, onRemoved, onFocus, onChooseOnPlan, onContinue} = props;
  const {t} = useTranslation("common");
  const [side, setSide] = useState<"new" | "old">(selection?.side ?? "new");
  const [query, setQuery] = useState("");
  const listRef=useRef<HTMLDivElement>(null);
  useEffect(() => {if (selection){setSide(selection.side);setQuery("");}}, [selection?.side,selection?.id]);
  const oldById = useMemo(() => new Map(oldLocations.map(p => [p.id, p])), [oldLocations]);
  const newById = useMemo(() => new Map(newLocations.map(p => [p.id, p])), [newLocations]);
  const linksByNew = useMemo(() => new Map(result.links.map(link => [link.new_id, link])), [result.links]);
  const linksByOld = useMemo(() => new Map(result.links.map(link => [link.old_id, link])), [result.links]);
  const unmatchedNew = new Set(result.unmatched_new), unmatchedOld = new Set(result.unmatched_old);
  const added = new Set(result.added), removed = new Set(result.removed);
  const selected = selection ? (selection.side === "new" ? newById : oldById).get(selection.id) : null;
  const link = selection ? (selection.side === "new" ? linksByNew : linksByOld).get(selection.id) : null;
  const partner = link ? selection?.side === "new" ? oldById.get(link.old_id) : newById.get(link.new_id) : null;
  const proposal = selection?.side === "new" ? result.proposals.find(p => p.new_id === selection.id) : null;
  const candidates = useMemo(() => new Map(proposal?.candidates.map(c => [c.old_id, c]) ?? []), [proposal]);
  const candidateIds = new Set(candidates.keys());
  const editorOldIds = [...candidateIds, ...oldLocations.map(p => p.id).filter(id => !candidateIds.has(id))];
  const source = side === "new" ? newLocations : oldLocations;
  const list = source.filter(point => (!pendingOnly || (side === "new" ? unmatchedNew : unmatchedOld).has(point.id))
    && `${locationLabel(point)} ${point.name ?? ""}`.toLowerCase().includes(query.toLowerCase().trim()));
  useEffect(()=>{
    const list=listRef.current,row=list?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if(!list||!row)return;
    if(row.offsetTop<list.scrollTop)list.scrollTop=row.offsetTop;
    else if(row.offsetTop+row.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=row.offsetTop+row.offsetHeight-list.clientHeight;
  },[selection?.id,selection?.side,side,pendingOnly,query,list.length]);
  function status(pointSide: "old" | "new", id: number) {
    if ((pointSide === "new" ? linksByNew : linksByOld).has(id)) return t("exportTools.linked");
    return t(pointSide === "new" && added.has(id) ? "exportTools.added" : pointSide === "old" && removed.has(id) ? "exportTools.removed" : "exportTools.unresolved");
  }
  const selectedIndex = list.findIndex(point => selection?.side === side && point.id === selection.id);
  function navigate(delta: number) {
    const point = list[Math.max(0, Math.min(list.length - 1, selectedIndex + delta))];
    if (point) onSelect(side, point.id, side === "new");
  }

  return <aside className="matching-side-panel" aria-label={t("exportTools.locationDetails")}>
    <section className="matching-selected-location">
      {selected && selection ? <>
        <div className="matching-selection-heading"><div><small>{t(selection.side === "new" ? "exportTools.newLocation" : "exportTools.oldLocation")}</small><h2>{locationLabel(selected)}</h2></div>
          <button type="button" onClick={onFocus}>{t("exportTools.focusSelection")}</button></div>
        <p>{status(selection.side, selection.id)}{link ? ` · ${link.distance_mm.toLocaleString(undefined, {maximumFractionDigits: 1})} mm` : ""}
          {link && initialAutomatic && initial.links.some(l => l.new_id === link.new_id && l.old_id === link.old_id) ? ` · ${t("exportTools.automatic")}` : ""}</p>
        <dl className="matching-location-facts"><div><dt>X / Y [mm]</dt><dd>{selected.x_mm.toLocaleString()} / {selected.y_mm.toLocaleString()}</dd></div>
          {selected.pile_size_mm != null && <div><dt>{t("exportTools.pileSize")}</dt><dd>{selected.pile_size_mm} mm</dd></div>}
          {selected.tip_level_mm != null && <div><dt>{t("exportTools.tipLevel")}</dt><dd>{(selected.tip_level_mm / 1000).toLocaleString()} m</dd></div>}
        </dl>
        {selection.side === "new" ? <>
          <label className="matching-old-choice"><span>{t("exportTools.oldLocation")}</span><select disabled={busy} aria-label={t("exportTools.oldChoice", {id: selected.source_id ?? selected.id})}
            value={link ? String(link.old_id) : added.has(selection.id) ? "added" : ""} onChange={e => void onChoose(selection.id, e.target.value === "added" ? "added" : e.target.value === "" ? null : Number(e.target.value))}>
            <option value="">{t("exportTools.unresolved")}</option><option value="added">{t("exportTools.newPile")}</option>
            {editorOldIds.map(id => {const owner = linksByOld.get(id), candidate = candidates.get(id); return <option key={id} value={id} >
              {locationLabel(oldById.get(id)!)}{owner&&owner.new_id!==selection.id?` · ${t("exportTools.occupiedBy",{id:owner.new_id})}`:""}{candidate ? ` — ${candidate.distance_mm.toLocaleString(undefined, {maximumFractionDigits: 1})} mm` : ""}</option>;})}
          </select></label>
          <div className="matching-selection-actions"><button type="button" disabled={busy} onClick={onChooseOnPlan}>{t("exportTools.chooseOnPlan")}</button>
            <button type="button" disabled={busy} onClick={()=>void onChoose(selection.id,"added")}>{t("exportTools.newPile")}</button>
            <button type="button" disabled={busy || (!link && !added.has(selection.id))} onClick={() => void onChoose(selection.id, null)}>{t("exportTools.releaseLink")}</button></div>
          {partner && <p className="matching-partner">{t("exportTools.oldLocation")}: {locationLabel(partner)}</p>}
        </> : link ? <div className="matching-selection-actions"><button type="button" onClick={() => onSelect("new", link.new_id,true)}>{t("exportTools.inspectPartner", {id: link.new_id})}</button>
          <button type="button" disabled={busy} onClick={() => void onChoose(link.new_id, null)}>{t("exportTools.releaseLink")}</button></div>
          : <button type="button" disabled={busy} onClick={() => onRemoved(selection.id)}>{t(removed.has(selection.id) ? "exportTools.reconsider" : "exportTools.markRemoved")}</button>}
      </> : <div className="matching-selection-empty"><strong>{t(result.complete?"exportTools.reviewComplete":"exportTools.noReviewSelection")}</strong>
        <p>{t(result.complete?"exportTools.reviewCompleteHelp":"exportTools.pickNewInstruction")}</p>
        {result.complete?<button type="button" onClick={()=>{onPendingOnlyChange(false);setQuery("");}}>{t("exportTools.showAllLocations")}</button>:
          <button type="button" disabled={busy} onClick={onContinue}>{t("exportTools.continueReview")}</button>}</div>}
      {error != null && <p className="export-error" role="alert">{exportErrorText(error, t)}</p>}
      {busy && <p role="status">{t("exportTools.preparing")}</p>}
    </section>
    <section className="matching-location-browser">
      <div className="matching-list-tabs" role="group" aria-label={t("exportTools.locationList")}>
        <button type="button" aria-pressed={side === "new"} onClick={() => setSide("new")}>{t("exportTools.new")} ({newLocations.length})</button>
        <button type="button" aria-pressed={side === "old"} onClick={() => setSide("old")}>{t("exportTools.old")} ({oldLocations.length})</button>
      </div>
      <input className="matching-search" type="search" aria-label={t("exportTools.searchLocations")} placeholder={t("exportTools.searchLocations")} value={query} onChange={e => setQuery(e.target.value)}/>
      <label className="matching-pending-filter"><input type="checkbox" checked={pendingOnly} onChange={e => onPendingOnlyChange(e.target.checked)}/>{t("exportTools.pendingFilter")}</label>
      <div className="matching-location-list" ref={listRef} aria-label={t("exportTools.locationList")}>{list.map(point => <button type="button" key={`${side}:${point.id}`}
        data-pending={(side==="new"?unmatchedNew:unmatchedOld).has(point.id)} aria-pressed={selection?.side === side && selection.id === point.id} onClick={() => onSelect(side, point.id, side === "new")}>
        <strong>{(side==="new"?unmatchedNew:unmatchedOld).has(point.id)&&<i aria-hidden="true">?</i>}{locationLabel(point)}</strong><span>{status(side, point.id)}</span>
      </button>)}</div>
      {!list.length&&<p className="export-help">{t("exportTools.noLocationsInFilter")}</p>}
      <div className="matching-list-navigation"><button type="button" disabled={selectedIndex <= 0} onClick={() => navigate(-1)}>{t("exportTools.previousLocation")}</button>
        <span>{list.length} / {source.length}</span><button type="button" disabled={list.length === 0 || selectedIndex >= list.length - 1} onClick={() => navigate(1)}>{t("exportTools.nextLocation")}</button></div>
    </section>
  </aside>;
}
