import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { LoadPoint } from "../../../core/projectTypes.ts";
import type { LoadPointGroup } from "../../../core/loadPointGroupContract.ts";
import { elementLayoutScale } from "../../../domain/settings/uiBaseline.ts";
import { clampSelectionOverviewRows, DEFAULT_SELECTION_OVERVIEW_ROWS, MAX_SELECTION_OVERVIEW_ROWS, selectionRowsAtPointer } from "../../../domain/workspace/selectionOverviewLayout.ts";
import LoadPointSelectionList from "./LoadPointSelectionList.tsx";
import LoadPointSelectionNavigation from "./LoadPointSelectionNavigation.tsx";
import "./SelectionOverview.css";

export type SelectionOverviewLayout = { rows: number; collapsed: boolean };

export default function SelectionOverview({ onSelectOnly,restrictToContext=false,loadPoints, selectedIds, contextIds, groups, onSelect, rows, collapsed, onLayoutChange, disabled, groupControl, extraContent }: {
  onSelectOnly?:(id:number)=>void;restrictToContext?:boolean;
  loadPoints: LoadPoint[]; selectedIds: number[]; contextIds: number[]; groups: LoadPointGroup[];
  onSelect: (ids: number[]) => void; rows: number; collapsed: boolean;
  onLayoutChange: (patch: Partial<SelectionOverviewLayout>) => void; disabled: boolean; groupControl: ReactNode; extraContent?: ReactNode;
}) {
  const { t } = useTranslation("rightPanel");
  const contentId = useId();
  const drag = useRef<{ startY: number; rows: number; scale: number } | null>(null);
  const [heightRows, setHeightRows] = useState(rows);
  const latestRows = useRef(heightRows);
  latestRows.current = heightRows;
  useEffect(() => { if (!drag.current) setHeightRows(rows); }, [rows]);
  const maxRows = Math.max(1, Math.min(MAX_SELECTION_OVERVIEW_ROWS, contextIds.length));
  const shownRows = Math.min(heightRows, maxRows);
  const commitRows = (value: number) => {
    const next = Math.min(maxRows, clampSelectionOverviewRows(value));
    setHeightRows(next); onLayoutChange({ rows: next });
  };
  return <section className="selection-overview" aria-label={t("selectionOverview.title")}>
    <header className="selection-overview-header">
      <h2><button type="button" aria-label={t(collapsed ? "selectionOverview.expand" : "selectionOverview.collapse")}
        aria-expanded={!collapsed} aria-controls={contentId} onClick={() => onLayoutChange({ collapsed: !collapsed })}>
        <svg viewBox="0 0 16 16" aria-hidden="true" className={collapsed ? "is-collapsed" : ""}><path d="m4 6 4 4 4-4" /></svg>
        <span>{t("selectionOverview.title")}</span>
        <span className="selection-overview-count">{contextIds.length > selectedIds.length
          ? t("selectionOverview.inspectionCount", { selected: selectedIds.length, total: contextIds.length })
          : t("loadPoints.selectedCount", { count: selectedIds.length })}</span>
      </button></h2>
      {groupControl}
    </header>
    {extraContent}
    {!collapsed ? <div id={contentId} className="selection-overview-content">
      {contextIds.length > 0 ? <>
        <LoadPointSelectionList loadPoints={loadPoints} selectedLoadPointIds={selectedIds} contextLoadPointIds={contextIds}
          groups={groups} restrictToContext={restrictToContext} disabled={disabled} visibleRows={heightRows} onInspect={id => onSelect([id])} onSelectGroup={onSelect} />
        <div className="selection-overview-navigation"><LoadPointSelectionNavigation ids={contextIds} selectedIds={selectedIds} onSelect={onSelect} onSelectOnly={onSelectOnly} disabled={disabled} /></div>
        {contextIds.length > 1 ? <div className="selection-overview-resizer" role="separator" tabIndex={0} aria-orientation="horizontal"
          aria-label={t("selectionOverview.resize")} title={t("selectionOverview.resizeHelp")}
          aria-valuemin={1} aria-valuemax={maxRows} aria-valuenow={shownRows}
          aria-valuetext={t("selectionOverview.visibleRows", { count: shownRows })}
          onPointerDown={event => {
            if (event.button !== 0) return;
            event.preventDefault(); event.currentTarget.focus();
            drag.current = { startY: event.clientY, rows: shownRows, scale: elementLayoutScale(document.documentElement) };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => {
            if (!drag.current) return;
            const next = Math.min(maxRows, selectionRowsAtPointer(drag.current.rows, event.clientY - drag.current.startY, drag.current.scale));
            latestRows.current = next; setHeightRows(next);
          }}
          onPointerUp={event => {
            if (!drag.current) return;
            drag.current = null; commitRows(latestRows.current); event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => { drag.current = null; setHeightRows(rows); }}
          onDoubleClick={() => {
            setHeightRows(DEFAULT_SELECTION_OVERVIEW_ROWS);
            onLayoutChange({ rows: DEFAULT_SELECTION_OVERVIEW_ROWS });
          }}
          onKeyDown={event => {
            const next = event.key === "ArrowUp" ? shownRows - 1 : event.key === "ArrowDown" ? shownRows + 1
              : event.key === "Home" ? 1 : event.key === "End" ? maxRows : null;
            if (next === null) return;
            event.preventDefault(); commitRows(next);
          }} /> : null}
      </> : <p className="selection-overview-empty">{t("empty.selectLoadPoints")}</p>}
    </div> : null}
  </section>;
}
