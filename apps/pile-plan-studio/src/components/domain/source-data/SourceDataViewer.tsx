import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type UIEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { formatPileTipLevelMetres } from "../../../domain/formatting.ts";
import type { BearingCapacity, Cpt, LoadPoint } from "../../../core/projectTypes.ts";
import type { InputSource } from "../../../domain/project/projectState.ts";
import {
  buildSourceTable,
  filterAndSortSourceRows,
  getSourceLoadPointSelection,
  getSourceSelectionRevealScrollTop,
  type SourceLoadPointSelection,
  type SourceTableFilter,
  type SourceTableSort,
} from "../../../domain/source-data/sourceTableModel.ts";
import { getAdditiveSelectionModifier } from "../../../viewer/lassoSelection.ts";
import {Button, Heading, IconButton, OpenAECProvider, Status, TextField} from "../../../openaec/react/src/index";
import spriteUrl from "../../../openaec/studioSprite.ts";
import "../../../openaec/openaec-components.css";
import SourceFileButton from "../shared/SourceFileButton.tsx";
import "./SourceDataViewer.css";

const ROW_HEIGHT = 30;
const OVERSCAN_ROWS = 8;

type Props = {
  onClose: () => void;
  source: InputSource;
  loadPoints: LoadPoint[];
  cpts: Cpt[];
  bearingCapacities: BearingCapacity[];
  selectedLoadPointId: number | null;
  selectedLoadPointIds: number[];
  selectedCptId: number | null;
  lockedLoadPointIds: Set<number>;
  selectionDisabled: boolean;
  onSelectLoadPoints: (selection: SourceLoadPointSelection) => void;
  onSelectCpt: (cptId: number) => void;
  onClearSelection: () => void;
  onReplaceSource?: (file: File) => void;
};

export default function SourceDataViewer(props: Props) {
  return <SourceDataView key={props.source.kind} {...props}/>;
}

function SourceDataView({
  onClose,
  source,
  loadPoints,
  cpts,
  bearingCapacities,
  selectedLoadPointId,
  selectedLoadPointIds,
  selectedCptId,
  lockedLoadPointIds,
  selectionDisabled,
  onSelectLoadPoints,
  onSelectCpt,
  onClearSelection,
  onReplaceSource,
}: Props) {
  const { t, i18n } = useTranslation();
  const [filters, setFilters] = useState<Record<string, SourceTableFilter>>({});
  const [sort, setSort] = useState<SourceTableSort>(null);
  const [activeFilterKey, setActiveFilterKey] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const selectedLoadPointIdSet = useMemo(() => new Set(selectedLoadPointIds), [selectedLoadPointIds]);
  const activeFilterMenuRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const selectionAnchorIdRef = useRef<number | null>(
    source.kind === "load_points" ? selectedLoadPointId : selectedCptId,
  );
  const tableSelectionInitiatedRef = useRef(false);
  const table = useMemo(() => buildSourceTable(source.kind, {
    loadPoints,
    cpts,
    bearingCapacities,
  }), [bearingCapacities, cpts, loadPoints, source.kind]);
  const rows = useMemo(
    () => filterAndSortSourceRows(table.rows, filters, sort),
    [filters, sort, table.rows],
  );
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
  const endIndex = Math.min(
    rows.length,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN_ROWS,
  );
  const visibleRows = rows.slice(startIndex, endIndex);
  const paddingTop = startIndex * ROW_HEIGHT;
  const paddingBottom = Math.max(0, (rows.length - endIndex) * ROW_HEIGHT);
  const gridStyle = { "--source-column-count": table.columns.length } as CSSProperties;
  const primarySelectedRowId = source.kind === "load_points"
    ? selectedLoadPointId
    : source.kind === "cpts"
      ? selectedCptId
      : null;

  useLayoutEffect(() => {
    const scrollElement = tableScrollRef.current;
    if (scrollElement === null) return undefined;

    const measureViewport = () => setViewportHeight(scrollElement.clientHeight);
    measureViewport();
    const resizeObserver = new ResizeObserver(measureViewport);
    resizeObserver.observe(scrollElement);
    return () => resizeObserver.disconnect();
  }, []);

  useLayoutEffect(() => {
    const scrollElement = tableScrollRef.current;
    if (scrollElement === null || primarySelectedRowId === null || viewportHeight <= 0) return;
    const initiatedInTable = tableSelectionInitiatedRef.current;
    tableSelectionInitiatedRef.current = false;
    const selectedRowIndex = rows.findIndex((row) => row.id === primarySelectedRowId);
    const nextScrollTop = getSourceSelectionRevealScrollTop({
      currentScrollTop: scrollElement.scrollTop,
      selectedRowIndex,
      rowHeight: ROW_HEIGHT,
      viewportHeight,
      initiatedInTable,
    });
    if (nextScrollTop === scrollElement.scrollTop) return;
    scrollElement.scrollTop = nextScrollTop;
    setScrollTop(nextScrollTop);
  }, [primarySelectedRowId, rows, source.kind, viewportHeight]);

  useLayoutEffect(() => {
    tableSelectionInitiatedRef.current = false;
  });

  useEffect(() => {
    selectionAnchorIdRef.current = source.kind === "load_points" ? selectedLoadPointId : selectedCptId;
  }, [source.kind]);

  useEffect(() => {
    if (activeFilterKey === null) return undefined;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".source-filter-trigger")) {
        return;
      }
      if (!activeFilterMenuRef.current?.contains(event.target as Node)) {
        setActiveFilterKey(null);
      }
    };
    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [activeFilterKey]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClearSelection();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClearSelection]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  };

  const cycleSort = (key: string) => {
    setSort((current) => current?.key !== key
      ? { key, direction: "asc" }
      : current.direction === "asc"
        ? { key, direction: "desc" }
        : null);
  };

  const formatValue = (value: string | number, columnKey: string) => {
    if(columnKey==="pile_count"&&value==="all")return t("tableImport.allPileCounts");
    if(value==="")return "—";
    if (typeof value !== "number") return value;
    if (source.kind === "bearing_capacities" && columnKey === "tip") {
      return formatPileTipLevelMetres(value, i18n.language).replace(/ m$/, "");
    }
    return new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 }).format(value);
  };

  const handleHeaderPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest("button, input")) return;
    onClearSelection();
  };

  const activateRow = (
    rowId: number,
    modifiers: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  ) => {
    tableSelectionInitiatedRef.current = true;
    if (source.kind === "load_points") {
      const selection = getSourceLoadPointSelection({
        rowIds: rows.flatMap((row) => typeof row.id === "number" ? [row.id] : []),
        clickedId: rowId,
        anchorId: selectionAnchorIdRef.current,
        unavailableIds: lockedLoadPointIds,
        shiftKey: modifiers.shiftKey,
        additiveKey: getAdditiveSelectionModifier(modifiers),
      });
      selectionAnchorIdRef.current = selection.anchorId;
      onSelectLoadPoints(selection);
    } else if (source.kind === "cpts") {
      onSelectCpt(rowId);
    }
  };

  return (
    <OpenAECProvider sprite={spriteUrl}><section className="oa-app source-data-viewer source-viewer-blueprint" aria-label={t(`projectExplorer.sources.${source.kind}`)}>
      <header className="source-data-header" onPointerDown={handleHeaderPointerDown}>
        <div>
          <Heading level="page">{t(`projectExplorer.sources.${source.kind}`)}</Heading>
          <p>
            {source.fileName ?? t("sourceViewer.snapshot")}
            {source.profile ? ` · ${source.profile}` : ""}
            {` · ${t("projectExplorer.rows", { count: table.rows.length })}`}
          </p>
          {source.warnings.length > 0 && (
            <p className="source-data-warning"><Status tone="warning">{t("sourceViewer.warnings", { count: source.warnings.length })}</Status></p>
          )}
        </div>
        {onReplaceSource && (
          <SourceFileButton label={t("sourceViewer.replace")} onFiles={files=>onReplaceSource(files[0])}/>
        )}
        <IconButton className="source-close-button" icon="ui.close" onClick={onClose} label={t("sourceViewer.backToPlan")}
          data-oa-tip={undefined} data-tooltip={t("sourceViewer.backToPlan")}/>
      </header>

      <div className="source-table-scroll" onScroll={handleScroll} ref={tableScrollRef} role="table"
        aria-label={t(`projectExplorer.sources.${source.kind}`)} aria-rowcount={rows.length+1} aria-colcount={table.columns.length}>
        <div className="source-table-heading" style={gridStyle} role="row">
        {table.columns.map((column, columnIndex) => (
          <div className={`source-table-column${columnIndex === 0 ? " is-first" : ""}`} key={column.key} role="columnheader"
            aria-sort={sort?.key===column.key?(sort.direction==="asc"?"ascending":"descending"):undefined}>
            <Button kind="quiet" className="source-sort-button" onClick={() => cycleSort(column.key)}>
              <span>{t(`sourceViewer.columns.${column.labelKey}`)}{column.unit ? ` (${column.unit})` : ""}</span>
              <span aria-hidden="true">{sort?.key === column.key ? (sort.direction === "asc" ? "▲" : "▼") : ""}</span>
            </Button>
            <div
              className={`source-filter-menu${filters[column.key]?.value ? " is-active" : ""}${activeFilterKey === column.key ? " is-open" : ""}`}
              ref={activeFilterKey === column.key ? activeFilterMenuRef : undefined}
            >
              <IconButton small icon="table.column-filter"
                aria-expanded={activeFilterKey === column.key}
                label={t("sourceViewer.filter", { column: t(`sourceViewer.columns.${column.labelKey}`) })}
                className="source-filter-trigger"
                pressed={Boolean(filters[column.key]?.value)} data-oa-tip={undefined}
                data-tooltip={t("sourceViewer.filter", { column: t(`sourceViewer.columns.${column.labelKey}`) })}
                onClick={() => setActiveFilterKey((current) => current === column.key ? null : column.key)}
                type="button"
              />
              {activeFilterKey === column.key && <div className="source-filter-popover">
                  <TextField label={t("sourceViewer.searchValue")}
                    autoFocus
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setFilters((current) => ({
                        ...current,
                        [column.key]: { value, mode: current[column.key]?.mode ?? "exact" },
                      }));
                    }}
                    value={filters[column.key]?.value ?? ""}
                  />
                <div className="source-filter-modes" role="group" aria-label={t("sourceViewer.matchMode")}>
                  {(["exact", "contains"] as const).map((mode) => (
                    <Button
                      className={(filters[column.key]?.mode ?? "exact") === mode ? "is-active" : ""}
                      key={mode}
                      aria-pressed={(filters[column.key]?.mode ?? "exact") === mode}
                      type="button"
                      onClick={() => setFilters((current) => ({
                        ...current,
                        [column.key]: { value: current[column.key]?.value ?? "", mode },
                      }))}
                    >
                      {t(`sourceViewer.${mode}`)}
                    </Button>
                  ))}
                </div>
                <Button
                  className="source-filter-clear"
                  disabled={!filters[column.key]?.value}
                  type="button"
                  onClick={() => setFilters((current) => ({
                    ...current,
                    [column.key]: { value: "", mode: current[column.key]?.mode ?? "exact" },
                  }))}
                >
                  {t("sourceViewer.clear")}
                </Button>
              </div>}
            </div>
          </div>
        ))}
        </div>
        <div className="source-table-body" role="rowgroup">
          <div aria-hidden="true" style={{ height: paddingTop }} />
          {visibleRows.map((row, visibleIndex) => {
            const rowId = typeof row.id === "number" ? row.id : null;
            const isSelectable = source.kind !== "bearing_capacities" && rowId !== null;
            const isLocked = source.kind === "load_points" && rowId !== null && lockedLoadPointIds.has(rowId);
            const isDisabled = selectionDisabled || isLocked;
            const isSelected = rowId !== null && (source.kind === "load_points"
              ? selectedLoadPointIdSet.has(rowId)
              : source.kind === "cpts" && selectedCptId === rowId);
            return (
              <div
                aria-disabled={isSelectable && isDisabled ? true : undefined}
                aria-selected={isSelectable ? isSelected : undefined}
                className={`source-table-row${isSelectable ? " is-selectable" : ""}${isSelected ? " is-selected" : ""}${isSelectable && isDisabled ? " is-disabled" : ""}`}
                key={`${startIndex + visibleIndex}-${String(row[table.columns[0].key])}`}
                onClick={!isSelectable ? undefined : (event) => {
                  if (!isDisabled && rowId !== null) activateRow(rowId, event);
                }}
                onKeyDown={!isSelectable ? undefined : (event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  if (!isDisabled && rowId !== null) activateRow(rowId, event);
                }}
                role="row"
                aria-rowindex={startIndex+visibleIndex+2}
                style={gridStyle}
                tabIndex={isSelectable && !isDisabled ? 0 : undefined}
              >
                {table.columns.map((column) => (
                  <span role="cell" key={column.key} title={column.key==="tension"&&row.tension===""?t(`common:loadDirection.importStates.${row.tension_state}`):undefined}>{formatValue(row[column.key], column.key)}</span>
                ))}
              </div>
            );
          })}
          <div aria-hidden="true" style={{ height: paddingBottom }} />
        </div>
      </div>
    </section></OpenAECProvider>
  );
}
