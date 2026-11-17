import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { usePileDrivingPreview } from "../../../app/import/usePileDrivingPreview.ts";
import type { PileDrivingCheck, PileDrivingMatchField, PileDrivingRecord, PileDrivingStatus } from "../../../core/pileDrivingCoreClient.ts";
import type { PileDrivingAssessment } from "../../../domain/pile-driving/pileDrivingStatuses.ts";
import { Banner, Button, Checkbox, Heading, IconButton, OpenAECProvider, Panel, Select, Status, Switch } from "../../../openaec/react/src/index";
import spriteUrl from "../../../openaec/studioSprite.ts";
import SourceFileButton from "../shared/SourceFileButton.tsx";
import SourceTableEditor from "../imports/SourceTableEditor.tsx";
import { pileDrivingRows } from "../../../domain/pile-driving/pileDrivingRows.ts";
import { PileDrivingChecks, PileDrivingEnergyBySize, PileDrivingSettings } from "./PileDrivingChecks.tsx";
import "./pileDrivingPanel.css";

type Props = {
  planName?: string;
  pileNumbers?: ReadonlyMap<number, string>;
  driving: ReturnType<typeof usePileDrivingPreview>;
  readOnly?: boolean;
  selectedLoadPointIds: readonly number[];
  selectionDisabled: boolean;
  showStatusColors: boolean;
  onShowStatusColorsChange: (show: boolean) => void;
  locationStatuses: ReadonlyMap<number, PileDrivingAssessment>;
  onStatusChange: (ids: readonly number[], status: PileDrivingStatus | null) => void;
  neighborhoodRecord: PileDrivingRecord | null;
  onNeighborhoodChange: (record: PileDrivingRecord | null) => void;
  onSelect: (ids: number[]) => void;
  onClose: () => void;
};

type ViewerSelection = number | "multiple" | null;
type PickedRecord = { fileId: string; index: number; locationId: number | null; viewerSelection: ViewerSelection };

const MEASUREMENT_FIELDS = ["tochtnummer", "ppn_nap", "slagen", "energie_per_slag_kj"];
const SUMMARY_FIELDS = ["datum", "starttijd", "stelling", "dikte_cm", "lengte_cm", "ppd_gewenst"];
const STATUS_TONES = { good: "success", doubtful: "warning", deviation: "error" } as const;
const DRIVING_STATUSES = ["good", "doubtful", "deviation"] as const;
type WarningFilter = PileDrivingCheck["kind"] | "none";
const WARNING_OPTIONS = [
  "none", "remark", "size", "length", "level", "end-calendar", "trend", "energy-target", "neighborhood",
] as const satisfies readonly WarningFilter[];
const ALL_WARNING_OPTIONS = new Set<WarningFilter>(WARNING_OPTIONS);

function sameLocationSelection(ids: readonly number[], selected: ReadonlySet<number>) {
  return ids.length === selected.size && ids.every(id => selected.has(id));
}

export default function PileDrivingPanel({ planName, pileNumbers, driving, readOnly = false, selectedLoadPointIds, selectionDisabled,
  showStatusColors, onShowStatusColorsChange, locationStatuses, onStatusChange,
  neighborhoodRecord, onNeighborhoodChange, onSelect, onClose }: Props) {
  const { t, i18n } = useTranslation("rightPanel", { keyPrefix: "pileDriving" });
  const [picked, setPicked] = useState<PickedRecord | null>(null);
  const [warningFilter, setWarningFilter] = useState<ReadonlySet<WarningFilter>>(ALL_WARNING_OPTIONS);
  const [filterSelection, setFilterSelection] = useState<readonly number[] | null>(null);
  const overviewRef = useRef<HTMLDivElement>(null);
  const selectionAnchor = useRef<string | null>(null);
  const selectedLocations = new Set(selectedLoadPointIds);
  const followsFilter = filterSelection !== null && sameLocationSelection(filterSelection, selectedLocations);
  // A new selection made in the viewer ends filter-following.
  if (filterSelection !== null && !followsFilter) setFilterSelection(null);
  const viewerSelection: ViewerSelection = selectedLoadPointIds.length > 1 ? "multiple" : selectedLoadPointIds[0] ?? null;
  if (picked && picked.viewerSelection !== viewerSelection) {
    // Keep a specific registration when its own row just selected that location in the viewer.
    setPicked(typeof viewerSelection === "number" && picked.locationId === viewerSelection
      ? { ...picked, viewerSelection } : null);
  }
  const { example, error, files, selectedId } = driving;
  const exampleResult = files.find(file => file.id === example?.id)?.result;
  const exampleError = exampleResult?.status === "failed" ? exampleResult.error : null;
  const exampleRecords = exampleResult?.status === "ready" ? exampleResult.preview.records : undefined;
  const recordsBySourceRow = useMemo(() => {
    const byRow = new Map<number, PileDrivingRecord>();
    for (const record of exampleRecords ?? []) {
      for (const row of record.row_numbers ?? []) byRow.set(row, record);
    }
    return byRow;
  }, [exampleRecords]);
  const previewLink = (row: number) => {
    const record = recordsBySourceRow.get(row);
    if (!record) return undefined;
    if (record.matching.status !== "matched") return t(record.matching.status);
    return record.matched_pile_number === undefined
      ? t("location", { id: record.matching.load_point_id })
      : t("pile", { number: record.matched_pile_number });
  };
  const allFiles = selectedId === null;
  const visibleFiles = allFiles ? files : files.filter(file => file.id === selectedId);
  const allRecords = useMemo(() => pileDrivingRows(files), [files]);
  const records = useMemo(() => selectedId === null ? allRecords
    : allRecords.filter(row => row.file.id === selectedId), [allRecords, selectedId]);
  const warningRecords = records.filter(row => row.warnings.length > 0);
  const visibleRecords = useMemo(() => records.filter(row => row.warnings.length > 0
    ? row.warnings.some(kind => warningFilter.has(kind))
    : warningFilter.has("none")), [records, warningFilter]);
  const visibleLocationIds = useMemo(() => [...new Set(visibleRecords.flatMap(({ record }) =>
    record.matching.status === "matched" ? [record.matching.load_point_id] : []))], [visibleRecords]);
  const selectionNeedsUpdate = followsFilter && !sameLocationSelection(visibleLocationIds, selectedLocations);
  useEffect(() => {
    if (!selectionNeedsUpdate || selectionDisabled) return;
    setPicked(null);
    selectionAnchor.current = null;
    setFilterSelection(visibleLocationIds);
    onSelect(visibleLocationIds);
  }, [selectionNeedsUpdate, selectionDisabled, visibleLocationIds, onSelect]);

  const pickRow = (rowIndex: number, event: MouseEvent<HTMLTableRowElement>) => {
    const row = visibleRecords[rowIndex];
    const matching = row.record.matching;
    const locationId = matching.status === "matched" ? matching.load_point_id : null;
    if (locationId !== null && !selectionDisabled) setFilterSelection(null);
    const additive = event.ctrlKey || event.metaKey;
    if (event.shiftKey || additive) {
      if (locationId === null || selectionDisabled) return;
      if (event.shiftKey) {
        const anchorIndex = visibleRecords.findIndex(row =>
          `${row.file.id}:${row.rowIndex}` === selectionAnchor.current
          && row.record.matching.status === "matched" && selectedLocations.has(row.record.matching.load_point_id));
        const selectedIndex = visibleRecords.findIndex(({ record }) =>
          record.matching.status === "matched" && selectedLocations.has(record.matching.load_point_id));
        const start = anchorIndex >= 0 ? anchorIndex : selectedIndex >= 0 ? selectedIndex : rowIndex;
        const anchor = visibleRecords[start];
        selectionAnchor.current = `${anchor.file.id}:${anchor.rowIndex}`;
        const range = visibleRecords.slice(Math.min(start, rowIndex), Math.max(start, rowIndex) + 1)
          .flatMap(({ record }) => record.matching.status === "matched" ? [record.matching.load_point_id] : []);
        setPicked(null);
        onSelect([...new Set(additive ? [...selectedLoadPointIds, ...range] : range)]);
      } else if (selectedLocations.has(locationId)) {
        setPicked(null);
        onSelect(selectedLoadPointIds.filter(id => id !== locationId));
      } else {
        selectionAnchor.current = `${row.file.id}:${row.rowIndex}`;
        setPicked({ fileId: row.file.id, index: row.rowIndex, locationId, viewerSelection });
        onSelect([...selectedLoadPointIds, locationId]);
      }
    } else {
      setPicked({ fileId: row.file.id, index: row.rowIndex, locationId, viewerSelection });
      if (locationId !== null && !selectionDisabled) {
        selectionAnchor.current = `${row.file.id}:${row.rowIndex}`;
        onSelect([locationId]);
      }
    }
    if (neighborhoodRecord) onNeighborhoodChange(null);
  };
  const filtered = warningFilter.size < ALL_WARNING_OPTIONS.size;
  const matchingFields = new Set(visibleRecords.map(row => row.file.matchBy));
  const matchingColumn = matchingFields.size > 1 ? "overview.link"
    : matchingFields.has("revit-mark") ? "mark" : "overview.location";
  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeZone: "UTC" });
  const pickedRow = records.find(row => row.file.id === picked?.fileId && row.rowIndex === picked.index);
  const activeRow = viewerSelection === "multiple" ? undefined : pickedRow ?? records.find(({ record }) =>
    record.matching.status === "matched" && record.matching.load_point_id === viewerSelection);
  const activeRowVisible = activeRow !== undefined && visibleRecords.includes(activeRow);
  useEffect(() => {
    if (activeRowVisible) {
      overviewRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ block: "nearest" });
    }
  }, [activeRow, activeRowVisible]);
  const active = activeRow?.record;
  const editLocationId = active
    ? active.matching.status === "matched" ? active.matching.load_point_id : null
    : typeof viewerSelection === "number" ? viewerSelection : null;
  const assessment = editLocationId === null ? undefined : locationStatuses.get(editLocationId);
  const bulkSelection = viewerSelection === "multiple";
  const editIds = bulkSelection ? selectedLoadPointIds : editLocationId === null ? [] : [editLocationId];
  const manualChoice = locationStatuses.get(editIds[0])?.manual ?? null;
  const sameChoice = editIds.every(id => (locationStatuses.get(id)?.manual ?? null) === manualChoice);
  const statusEditor = editIds.length > 0 && <div className="pile-driving-status-editor">
    {editLocationId !== null && !active && <Heading>{t("location", { id: editLocationId })}</Heading>}
    <div className="pile-driving-status-heading">
      <span>{t("assessment.label")}</span>
      <span className="oa-secondary" role={bulkSelection ? "status" : undefined}>{bulkSelection
        ? t("assessment.selectedLocations", { count: editIds.length })
        : t("assessment.automatic", {
        status: t(`assessment.${assessment?.automatic ?? "unavailable"}`),
      })}</span>
    </div>
    <div className="pile-driving-status-buttons" role="group" aria-label={t("assessment.label")}>
      {([null, ...DRIVING_STATUSES] as const).map(status => {
        return <Button key={status ?? "automatic"} compact data-tone={status === null ? undefined : STATUS_TONES[status]}
          aria-pressed={sameChoice && status === manualChoice} disabled={readOnly || selectionDisabled}
          onClick={() => onStatusChange(editIds, status)}>
          {t(`assessment.${status ?? "automaticChoice"}`)}
        </Button>;
      })}
    </div>
  </div>;
  const columns = activeRow?.columns.map((label, index) => ({ label, index, key: label.trim().toLowerCase() })) ?? [];
  const measurements = MEASUREMENT_FIELDS.flatMap(key => columns.filter(column => column.key === key));
  const details = SUMMARY_FIELDS.flatMap(key => columns.filter(column => column.key === key && active?.rows[0]?.[column.index]));
  const shownColumns = measurements.length ? measurements : columns;
  const translateColumn = (column: { key: string; label: string }) =>
    t(`columns.${column.key}`, { defaultValue: column.label });
  const linked = records.filter(({ record }) => record.matching.status === "matched").length;
  const fileOptions = files.map(source => ({ value: source.id, label: source.name }));
  return <OpenAECProvider sprite={spriteUrl}>
    <div className="pile-driving-shell" onKeyDown={event => {
      if ((event.key === " " || event.key === "Enter") && event.target instanceof Element
        && event.target.closest("button,select,input,summary")) event.stopPropagation();
    }}>
      <Panel className="oa-app pile-driving-panel" title={t("title")}
        actions={<IconButton small icon="ui.close" label={t("close")} onClick={onClose} />}>
        <div className="pile-driving-content">
          <div className="pile-driving-toolbar">
            <p className="oa-secondary">{t("referencePlan", { name: planName ?? "–" })}</p>
            <div className="pile-driving-file-actions">
              {files.length > 0 && <div className="pile-driving-files">
                <select className="oa-field oa-field--compact" aria-label={t("file")} value={selectedId ?? "all"}
                  title={!allFiles ? visibleFiles[0]?.name : undefined}
                  onChange={event => {
                    onNeighborhoodChange(null);
                    driving.selectFile(event.target.value === "all" ? null : event.target.value);
                  }}>
                  <option value="all">{t("allFiles")}</option>
                  {fileOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                </select>
                {!allFiles && <IconButton small icon="edit.delete" label={t("removeFile")} disabled={readOnly} onClick={driving.removeFile} />}
              </div>}
              <SourceFileButton multiple label={t("addFiles")} disabled={readOnly || driving.pending} onFiles={driving.addFiles} />
            </div>
          </div>
          <div className="pile-driving-color-control">
            <Switch label={t("assessment.showColors")} checked={showStatusColors}
              onChange={event => onShowStatusColorsChange(event.target.checked)} />
            {showStatusColors && <div className="pile-driving-status-key">
              {DRIVING_STATUSES.map(status =>
                <Status key={status} tone={STATUS_TONES[status]}>{t(`assessment.${status}`)}</Status>
              )}
            </div>}
          </div>
          {files.length === 0 && !driving.pending && <p className="pile-driving-empty oa-secondary">{t("empty")}</p>}
          {example && files.length > 0 && <details className="pile-driving-disclosure">
            <summary>{t("importSettings")}</summary>
            <div className="pile-driving-disclosure-body">
              <fieldset className="pile-driving-import" aria-label={t("importSettings")} disabled={readOnly || driving.pending}>
                <SourceTableEditor role="pile-driving" variant="blueprint" csv={example.csv} showSettingsHeading={false}
                  preview={example.table} previewColumn={{ label: t("overview.link"), cell: previewLink }}
                  sourceErrors={exampleError ? [{
                    row: exampleError.code === "missing-pile-number" ? exampleError.row : null,
                    column: null,
                    message: t(`errors.${exampleError.code}`, exampleError.code === "missing-pile-number" ? { row: exampleError.row } : {}),
                  }] : undefined}
                  onChange={table => { setPicked(null); driving.setTable(table); }}>
                  {allFiles && files.length > 1 && <Select label={t("exampleFile")} value={example.id}
                    options={fileOptions} onChange={event => driving.selectExample(event.target.value)} />}
                  <Checkbox label={t("independentSettings")} checked={example.independent}
                    onChange={event => { setPicked(null); driving.setIndependent(event.target.checked); }} />
                  <p className="oa-secondary">{t(example.independent ? "independentHelp" : "sharedHelp")}</p>
                  <Select label={t("matchBy")} value={driving.matchBy}
                    options={[
                      { value: "revit-mark", label: t("mark") },
                      { value: "location-id", label: t("locationId") },
                    ]}
                    onChange={event => { setPicked(null); driving.setMatchBy(event.target.value as PileDrivingMatchField); }} />
                  {example.csv && driving.matchBy === "revit-mark" && <Checkbox label={t("ignoreCsvLeadingZeros")}
                    checked={driving.ignoreCsvLeadingZeros}
                    onChange={event => { setPicked(null); driving.setIgnoreCsvLeadingZeros(event.target.checked); }} />}
                  {example.customTable && <div><Button compact onClick={() => { setPicked(null); driving.resetTable(); }}>
                    {t("resetTable")}
                  </Button></div>}
                </SourceTableEditor>
              </fieldset>
            </div>
          </details>}
          {driving.settings && <PileDrivingSettings settings={driving.settings}
            pileSizes={driving.pileSizes} readOnly={readOnly} onApply={driving.setSettings} />}
          {driving.pending && <Status tone="info">{t("pending")}</Status>}
          {error && <Banner tone="error" word="">
            {t(`errors.${error.code}`, error.code === "missing-pile-number" ? { row: error.row } : {})}
          </Banner>}
          {visibleFiles.map(file => {
            if (file.result?.status !== "failed") return null;
            const { error } = file.result;
            return <Banner key={file.id} tone="error" word="">
              {allFiles && <strong>{file.name} · </strong>}
              {t(`errors.${error.code}`, error.code === "missing-pile-number" ? { row: error.row } : {})}
            </Banner>;
          })}
          {driving.comparison && <PileDrivingEnergyBySize
            groups={driving.comparison.groups} limit={driving.comparison.limit}
            fileCount={driving.files.length} skipped={driving.comparison.skipped} />}
          {records.length > 0 && <section className="pile-driving-results">
            <header className="pile-driving-results-header">
              <Heading>{t("records")}</Heading>
              <details className="pile-driving-disclosure pile-driving-warning-filter">
                <summary>{t("overview.warningFilter")}</summary>
                <div className="pile-driving-disclosure-body">
                  <div className="pile-driving-warning-controls">
                    <Button compact kind="quiet" onClick={() => setWarningFilter(ALL_WARNING_OPTIONS)}>
                      {t("overview.checkAll")}
                    </Button>
                    <Button compact kind="quiet" onClick={() => setWarningFilter(new Set())}>
                      {t("overview.uncheckAll")}
                    </Button>
                  </div>
                  <div className="pile-driving-warning-options">
                    {WARNING_OPTIONS.map(kind => <Checkbox key={kind}
                      label={t(kind === "none" ? "overview.withoutWarnings" : `checks.labels.${kind}`)}
                      checked={warningFilter.has(kind)} onChange={event => {
                        const checked = event.target.checked;
                        setWarningFilter(current => {
                          const next = new Set(current);
                          if (checked) next.add(kind);
                          else next.delete(kind);
                          return next;
                        });
                      }} />)}
                  </div>
                </div>
              </details>
              <div className="pile-driving-results-toolbar">
                <p role="status" className="pile-driving-result-counts oa-secondary">
                  <span>{t("summary", { linked, total: records.length })}</span>
                  <span className={warningRecords.length ? "pile-driving-warning-count" : undefined}>
                    {t("checks.summary", { count: warningRecords.length })}
                  </span>
                  {filtered && <span>{t("overview.filteredCount", { shown: visibleRecords.length, total: records.length })}</span>}
                </p>
                <Button compact kind={followsFilter ? "primary" : "secondary"} aria-pressed={followsFilter}
                  disabled={selectionDisabled || (!followsFilter && visibleLocationIds.length === 0)}
                  onClick={() => setFilterSelection(followsFilter ? null : selectedLoadPointIds)}>
                  {t("overview.followFilter")}
                </Button>
              </div>
            </header>
            {visibleRecords.length === 0 ? <p className="pile-driving-empty oa-secondary" role="status">
              {t("overview.emptyFilter")}
            </p> : <div ref={overviewRef} className={activeRow ? "pile-driving-overview has-details" : "pile-driving-overview"}
              tabIndex={0} role="region" aria-label={t("records")}>
              <table className="oa-table" aria-label={t("records")}>
                <thead><tr>
                  <th scope="col">{t("overview.day")}</th>
                  <th scope="col">{t(matchingColumn)}</th>
                  <th scope="col">{t("assessment.column")}</th>
                  <th scope="col">{t("overview.warnings")}</th>
                </tr></thead>
                <tbody>{visibleRecords.map(({ file, record, rowIndex, day, date, warnings, unavailable }, index) => {
                  const matching = record.matching;
                  const locationId = matching.status === "matched" ? matching.load_point_id : null;
                  const assessment = locationId === null ? undefined : locationStatuses.get(locationId);
                  const status = assessment?.manual ?? assessment?.automatic;
                  const statusLabel = t(`assessment.${status ?? "unavailable"}`);
                  const showPileNumber = file.matchBy === "revit-mark" || locationId === null;
                  const matchingLabel = showPileNumber ? t("pile", { number: record.pile_number })
                    : t("location", { id: locationId });
                  const identifier = showPileNumber ? record.pile_number : locationId;
                  const linkedNumber = record.matched_pile_number;
                  const numberLink = showPileNumber && locationId !== null && linkedNumber !== undefined
                    && linkedNumber !== record.pile_number
                    ? `${record.pile_number} → ${t("pile", { number: linkedNumber })}` : undefined;
                  const selected = bulkSelection
                    ? locationId !== null && selectedLocations.has(locationId)
                    : activeRow?.file.id === file.id && activeRow.rowIndex === rowIndex;
                  return <tr key={`${file.id}:${rowIndex}`} onMouseDown={event => {
                    if (event.shiftKey) event.preventDefault();
                  }} onClick={event => pickRow(index, event)}>
                    <td>{date && day !== null
                      ? <time dateTime={date} title={dateFormat.format(new Date(`${date}T00:00:00Z`))}>{day}</time>
                      : <span title={t("overview.unknownDate")}>–</span>}</td>
                    <td>
                      <Button kind="quiet" compact aria-pressed={selected}
                        aria-label={numberLink ?? matchingLabel}>
                        {numberLink ?? (matchingFields.size > 1 || locationId === null ? matchingLabel : identifier)}
                      </Button>
                      {locationId === null && <small className="pile-driving-match-state oa-secondary">
                        {t(matching.status === "ambiguous" ? "ambiguous" : "unmatched")}
                      </small>}
                    </td>
                    <td title={statusLabel} aria-label={statusLabel}>{status
                      ? <Status tone={STATUS_TONES[status]}>{t(`assessment.short.${status}`)}</Status>
                      : "–"}</td>
                    <td><div className="pile-driving-record-state">
                      {warnings.filter(kind => warningFilter.has(kind)).map(kind =>
                        <Status key={kind} tone="warning">{t(`checks.labels.${kind}`)}</Status>)}
                      {unavailable > 0 && <Status tone="info">{t("checks.unavailable", { count: unavailable })}</Status>}
                      {warnings.length === 0 && unavailable === 0 && <span aria-label={t("overview.noWarnings")}>–</span>}
                    </div></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>}
          </section>}
          {!active && statusEditor}
          {activeRow && active && <section className="pile-driving-detail">
            <header className="pile-driving-detail-header">
              <Heading>{t("pile", { number: active.pile_number })}</Heading>
              <p className="oa-secondary pile-driving-detail-source" title={activeRow.file.name}>
                {activeRow.file.name}
              </p>
            </header>
            {statusEditor}
            <PileDrivingChecks checks={active.checks} remarks={active.remarks} energyRange={active.energy_range}
              neighborhood={active.neighborhood} showPileNumbers={activeRow.file.matchBy === "revit-mark"} pileNumbers={pileNumbers}
              neighborhoodExpanded={neighborhoodRecord === active}
              onToggleNeighborhood={() => onNeighborhoodChange(neighborhoodRecord === active ? null : active)} />
            {details.length > 0 && <dl>{details.map(column =>
              <div key={column.index}><dt>{translateColumn(column)}</dt><dd>{active.rows[0][column.index]}</dd></div>
            )}</dl>}
            <section className="pile-driving-measurements">
              <Heading>{t("measurements")}</Heading>
              <div className="pile-driving-table" tabIndex={0} role="region" aria-label={t("measurements")}>
                <table className="oa-table">
                  <thead><tr>{shownColumns.map(column => <th key={column.index} scope="col">{translateColumn(column)}</th>)}</tr></thead>
                  <tbody>{active.rows.map((row, rowIndex) => <tr key={rowIndex}>
                    {shownColumns.map(column => <td key={column.index}>{row[column.index]}</td>)}
                  </tr>)}</tbody>
                </table>
              </div>
            </section>
          </section>}
        </div>
      </Panel>
    </div>
  </OpenAECProvider>;
}
