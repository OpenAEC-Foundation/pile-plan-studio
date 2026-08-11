import { useMemo, useRef, useState, type CSSProperties, type UIEvent } from "react";
import { useTranslation } from "react-i18next";
import type { BearingCapacity, Cpt, LoadPoint } from "../../core/projectTypes.ts";
import type { InputSource } from "../../domain/projectState.ts";
import {
  buildSourceTable,
  filterAndSortSourceRows,
  type SourceTableFilter,
  type SourceTableSort,
} from "../../domain/sourceTableModel.ts";
import { searchIcon } from "../template/ribbon/icons.ts";

const ROW_HEIGHT = 30;
const OVERSCAN_ROWS = 8;

type Props = {
  source: InputSource;
  loadPoints: LoadPoint[];
  cpts: Cpt[];
  bearingCapacities: BearingCapacity[];
  onReplaceSource?: (file: File) => void;
};

export default function SourceDataViewer({
  source,
  loadPoints,
  cpts,
  bearingCapacities,
  onReplaceSource,
}: Props) {
  const { t, i18n } = useTranslation();
  const [filters, setFilters] = useState<Record<string, SourceTableFilter>>({});
  const [sort, setSort] = useState<SourceTableSort>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(500);
  const replacementInputRef = useRef<HTMLInputElement>(null);
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

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
    setViewportHeight(event.currentTarget.clientHeight);
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

  return (
    <section className="source-data-viewer" aria-label={t(`projectExplorer.sources.${source.kind}`)}>
      <header className="source-data-header">
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

      <div className="source-table-scroll" onScroll={handleScroll}>
        <div className="source-table-heading" style={gridStyle}>
        {table.columns.map((column, columnIndex) => (
          <div className={`source-table-column${columnIndex === 0 ? " is-first" : ""}`} key={column.key}>
            <button className="source-sort-button" onClick={() => cycleSort(column.key)} type="button">
              <span>{t(`sourceViewer.columns.${column.labelKey}`)}{column.unit ? ` (${column.unit})` : ""}</span>
              <span aria-hidden="true">{sort?.key === column.key ? (sort.direction === "asc" ? "▲" : "▼") : ""}</span>
            </button>
            <details className={`source-filter-menu${filters[column.key]?.value ? " is-active" : ""}`}>
              <summary
                aria-label={t("sourceViewer.filter", { column: t(`sourceViewer.columns.${column.labelKey}`) })}
                dangerouslySetInnerHTML={{ __html: searchIcon }}
              />
              <div className="source-filter-popover">
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
              </div>
            </details>
          </div>
        ))}
        </div>
        <div className="source-table-body">
          <div aria-hidden="true" style={{ height: paddingTop }} />
          {visibleRows.map((row, visibleIndex) => (
            <div
              className="source-table-row"
              key={`${startIndex + visibleIndex}-${String(row[table.columns[0].key])}`}
              style={gridStyle}
            >
              {table.columns.map((column) => (
                <span key={column.key}>{formatValue(row[column.key])}</span>
              ))}
            </div>
          ))}
          <div aria-hidden="true" style={{ height: paddingBottom }} />
        </div>
      </div>
    </section>
  );
}
