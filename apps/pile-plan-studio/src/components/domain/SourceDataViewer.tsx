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
import type { BearingCapacity, Cpt, LoadPoint } from "../../core/projectTypes.ts";
import type { InputSource } from "../../domain/projectState.ts";
import {
  buildSourceTable,
  filterAndSortSourceRows,
  getSourceLoadPointSelection,
  getSourceSelectionRevealScrollTop,
  type SourceLoadPointSelection,
  type SourceTableFilter,
  type SourceTableSort,
} from "../../domain/sourceTableModel.ts";
import { getAdditiveSelectionModifier } from "../../viewer/lassoSelection.ts";
import { searchIcon } from "../template/ribbon/icons.ts";

const ROW_HEIGHT = 30;
const OVERSCAN_ROWS = 8;

type Props = {
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

export default function SourceDataViewer({
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
  const replacementInputRef = useRef<HTMLInputElement>(null);
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

  const formatValue = (value: string | number) => typeof value === "number"
    ? new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 }).format(value)
    : value;

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
    <section className="source-data-viewer" aria-label={t(`projectExplorer.sources.${source.kind}`)}>
      <header className="source-data-header" onPointerDown={handleHeaderPointerDown}>
        <div>
          <h2>{t(`projectExplorer.sources.${source.kind}`)}</h2>
          <p>
            {source.fileName ?? t("sourceViewer.snapshot")}
            {source.profile ? ` · ${source.profile}` : ""}
            {` · ${t("projectExplorer.rows", { count: source.itemCount })}`}
          </p>
          {source.warnings.length > 0 && (
            <p className="source-data-warning">{t("sourceViewer.warnings", { count: source.warnings.length })}</p>
          )}
        </div>
        {onReplaceSource && (
          <>
            <button
              className="source-replace-button"
              onClick={() => replacementInputRef.current?.click()}
              type="button"
            >
              {t("sourceViewer.replace")}
            </button>
            <input
              accept=".csv,.xlsx"
              hidden
              ref={replacementInputRef}
              type="file"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) onReplaceSource(file);
                event.currentTarget.value = "";
              }}
            />
          </>
        )}
      </header>

      <div className="source-table-scroll" onScroll={handleScroll} ref={tableScrollRef}>
        <div className="source-table-heading" style={gridStyle}>
        {table.columns.map((column, columnIndex) => (
          <div className={`source-table-column${columnIndex === 0 ? " is-first" : ""}`} key={column.key}>
            <button className="source-sort-button" onClick={() => cycleSort(column.key)} type="button">
              <span>{t(`sourceViewer.columns.${column.labelKey}`)}{column.unit ? ` (${column.unit})` : ""}</span>
              <span aria-hidden="true">{sort?.key === column.key ? (sort.direction === "asc" ? "▲" : "▼") : ""}</span>
            </button>
            <div
              className={`source-filter-menu${filters[column.key]?.value ? " is-active" : ""}${activeFilterKey === column.key ? " is-open" : ""}`}
              ref={activeFilterKey === column.key ? activeFilterMenuRef : undefined}
            >
              <button
                aria-expanded={activeFilterKey === column.key}
                aria-label={t("sourceViewer.filter", { column: t(`sourceViewer.columns.${column.labelKey}`) })}
                className="source-filter-trigger"
                dangerouslySetInnerHTML={{ __html: searchIcon }}
                onClick={() => setActiveFilterKey((current) => current === column.key ? null : column.key)}
                type="button"
              />
              {activeFilterKey === column.key && <div className="source-filter-popover">
                <label>
                  <span>{t("sourceViewer.searchValue")}</span>
                  <input
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
                </label>
                <div className="source-filter-modes" role="group" aria-label={t("sourceViewer.matchMode")}>
                  {(["exact", "contains"] as const).map((mode) => (
                    <button
                      className={(filters[column.key]?.mode ?? "exact") === mode ? "is-active" : ""}
                      key={mode}
                      type="button"
                      onClick={() => setFilters((current) => ({
                        ...current,
                        [column.key]: { value: current[column.key]?.value ?? "", mode },
                      }))}
                    >
                      {t(`sourceViewer.${mode}`)}
                    </button>
                  ))}
                </div>
                <button
                  className="source-filter-clear"
                  disabled={!filters[column.key]?.value}
                  type="button"
                  onClick={() => setFilters((current) => ({
                    ...current,
                    [column.key]: { value: "", mode: current[column.key]?.mode ?? "exact" },
                  }))}
                >
                  {t("sourceViewer.clear")}
                </button>
              </div>}
            </div>
          </div>
        ))}
        </div>
        <div className="source-table-body">
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
                style={gridStyle}
                tabIndex={isSelectable && !isDisabled ? 0 : undefined}
              >
                {table.columns.map((column) => (
                  <span key={column.key}>{formatValue(row[column.key])}</span>
                ))}
              </div>
            );
          })}
          <div aria-hidden="true" style={{ height: paddingBottom }} />
        </div>
      </div>
    </section>
  );
}
