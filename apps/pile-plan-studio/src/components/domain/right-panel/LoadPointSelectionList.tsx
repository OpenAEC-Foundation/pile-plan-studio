import {useLoadDirection} from "../../../app/derived-state/LoadDirectionContext.tsx";
import {directionalLoadPoint} from "../../../domain/pile-options/loadDirection.ts";
import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { LoadPointGroup } from "../../../core/loadPointGroupContract.ts";
import type { LoadPoint } from "../../../core/projectTypes.ts";
import { buildLoadPointSelectionBlocks } from "../../../domain/workspace/loadPointSelectionList.ts";
import { localizeLoadPointName } from "./PanelControls.tsx";
import "./LoadPointSelectionList.css";

export default function LoadPointSelectionList({ restrictToContext=false,loadPoints, selectedLoadPointIds, contextLoadPointIds = selectedLoadPointIds, groups, onInspect, onSelectGroup, disabled = false, visibleRows = 4 }: {
  restrictToContext?:boolean;
  loadPoints: LoadPoint[];
  selectedLoadPointIds: number[];
  contextLoadPointIds?: number[];
  disabled?: boolean;
  visibleRows?: number;
  groups: LoadPointGroup[];
  onInspect: (id: number) => void;
  onSelectGroup: (ids: number[]) => void;
}) {
  const { t, i18n } = useTranslation("rightPanel");
  const {mode}=useLoadDirection();
  const blocks = buildLoadPointSelectionBlocks(loadPoints, contextLoadPointIds, groups).map(block=>({...block,loadPoints:block.loadPoints.filter(point=>!restrictToContext||contextLoadPointIds.includes(point.id))})).filter(block=>block.loadPoints.length>0);
  const selected = new Set(selectedLoadPointIds);
  const hasGroups = blocks.some(block => block.groupLoadPointIds !== null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectionKey = selectedLoadPointIds.join(",");
  const contextKey = blocks.flatMap(block => block.loadPoints.map(point => point.id)).join(",");
  useLayoutEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLButtonElement>('.load-point-selection-row[aria-pressed="true"]');
    if (!list || !row) return;
    if (row.offsetTop < list.scrollTop || row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(0, row.offsetTop - (list.clientHeight - row.offsetHeight) / 2);
    }
  }, [selectionKey, contextKey, visibleRows]);
  return (
    <div className={`load-point-selection-list${hasGroups ? " has-groups" : ""}`} ref={listRef} role="region"
      style={{ "--selection-visible-rows": visibleRows } as CSSProperties}
      aria-label={t("loadPoints.selectedCount", { count: selected.size })}>
      {blocks.map(block => {
        const groupIds = block.groupLoadPointIds;
        const selectedCount = block.loadPoints.filter(point => selected.has(point.id)).length;
        const groupLabel = groupIds ? t("loadPoints.selectGroup", { count: groupIds.length }) : undefined;
        return (
          <div className={`load-point-selection-block${groupIds ? " is-grouped" : ""}`} key={block.key}
            role={groupIds ? "group" : undefined} aria-label={groupLabel}>
            {groupIds ? <button type="button" className="load-point-selection-group" aria-label={groupLabel}
              aria-pressed={selectedCount === groupIds.length} disabled={disabled}
              style={{ gridRow: `1 / span ${block.loadPoints.length}` }} onClick={() => onSelectGroup([...groupIds])}>
              <span className="load-point-selection-group-label">
                <span>{t("loadPoints.group")}</span>
                <span>{selectedCount === groupIds.length
                  ? t("loadPoints.groupMembers", { count: groupIds.length })
                  : t("loadPoints.groupSelected", { selected: selectedCount, total: groupIds.length })}</span>
              </span>
            </button> : null}
            {block.loadPoints.map(point => {
              const name = localizeLoadPointName(point.name, t);
              const load=directionalLoadPoint(point,mode).design_load_kn;
              const force = Number.isFinite(load)?load.toLocaleString(i18n.language, { maximumFractionDigits: 1 }):"—";
              return <button type="button" className="load-point-selection-row" key={point.id}
                disabled={disabled}
                aria-pressed={selected.has(point.id)} aria-label={t("loadPoints.inspectMember", { name, force })}
                onClick={() => onInspect(point.id)}>
                <span className="load-point-selection-name">{name}</span>
                <span className="load-point-selection-force-label">F<sub>{mode==="tension"?"t;Ed":"Ed"}</sub></span>
                <strong className="load-point-selection-force">{force} kN</strong>
              </button>;
            })}
          </div>
        );
      })}
    </div>
  );
}
