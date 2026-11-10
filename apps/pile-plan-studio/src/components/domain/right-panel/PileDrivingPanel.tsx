import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { usePileDrivingPreview } from "../../../app/import/usePileDrivingPreview.ts";
import type { PileDrivingMatchField, PileDrivingRecord } from "../../../core/pileDrivingCoreClient.ts";
import { Banner, Button, Checkbox, Heading, IconButton, OpenAECProvider, Panel, Select, Status } from "../../../openaec/react/src/index";
import spriteUrl from "../../../openaec/studioSprite.ts";
import SourceFileButton from "../shared/SourceFileButton.tsx";
import SourceTableEditor from "../imports/SourceTableEditor.tsx";
import { pileDrivingRows } from "../../../domain/pile-driving/pileDrivingRows.ts";
import { PileDrivingChecks, PileDrivingEnergyBySize, PileDrivingSettings } from "./PileDrivingChecks.tsx";
import "./pileDrivingPanel.css";

type Props = {
  planName?: string;
  driving: ReturnType<typeof usePileDrivingPreview>;
  selectedLoadPointIds: readonly number[];
  selectionDisabled: boolean;
  neighborhoodRecord: PileDrivingRecord | null;
  onNeighborhoodChange: (record: PileDrivingRecord | null) => void;
  onSelect: (ids: number[]) => void;
  onClose: () => void;
};

type ViewerSelection = number | "multiple" | null;
type PickedRecord = { fileId: string; index: number; locationId: number | null; viewerSelection: ViewerSelection };

const MEASUREMENT_FIELDS = ["tochtnummer", "ppn_nap", "slagen", "energie_per_slag_kj"];
const SUMMARY_FIELDS = ["datum", "starttijd", "stelling", "dikte_cm", "lengte_cm", "ppd_gewenst", "opmerkingen"];

export default function PileDrivingPanel({ planName, driving, selectedLoadPointIds, selectionDisabled, neighborhoodRecord, onNeighborhoodChange, onSelect, onClose }: Props) {
  const { t, i18n } = useTranslation("rightPanel", { keyPrefix: "pileDriving" });
  const [picked, setPicked] = useState<PickedRecord | null>(null);
  const [warningsOnly, setWarningsOnly] = useState(false);
  const overviewRef = useRef<HTMLDivElement>(null);
  const viewerSelection: ViewerSelection = selectedLoadPointIds.length > 1 ? "multiple" : selectedLoadPointIds[0] ?? null;
  if (picked && picked.viewerSelection !== viewerSelection) {
    // Keep a specific registration when its own row just selected that location in the viewer.
    setPicked(typeof viewerSelection === "number" && picked.locationId === viewerSelection
      ? { ...picked, viewerSelection } : null);
  }
  const { example, error, files, selectedId } = driving;
  const allFiles = selectedId === null;
  const visibleFiles = allFiles ? files : files.filter(file => file.id === selectedId);
  const allRecords = useMemo(() => pileDrivingRows(files), [files]);
  const records = allFiles ? allRecords : allRecords.filter(row => row.file.id === selectedId);
  const warningRecords = records.filter(row => row.warnings.length > 0);
  const visibleRecords = warningsOnly ? warningRecords : records;
  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeZone: "UTC" });
  const pickedRow = records.find(row => row.file.id === picked?.fileId && row.rowIndex === picked.index);
  const activeRow = viewerSelection === "multiple" ? undefined : pickedRow ?? records.find(({ record }) =>
    record.matching.status === "matched" && record.matching.load_point_id === viewerSelection);
  useEffect(() => {
    if (activeRow && (!warningsOnly || activeRow.warnings.length > 0)) {
      overviewRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ block: "nearest" });
    }
  }, [activeRow, warningsOnly]);
  const active = activeRow?.record;
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
                {!allFiles && <IconButton small icon="edit.delete" label={t("removeFile")} onClick={driving.removeFile} />}
              </div>}
              <SourceFileButton multiple label={t("addFiles")} disabled={driving.pending} onFiles={driving.addFiles} />
            </div>
          </div>
          {files.length === 0 && !driving.pending && <p className="pile-driving-empty oa-secondary">{t("empty")}</p>}
          {((example && files.length > 0) || driving.settings) && <details className="pile-driving-disclosure">
            <summary>{t("settings")}</summary>
            <div className="pile-driving-disclosure-body">
              {example && files.length > 0 && <fieldset className="pile-driving-import" aria-label={t("importSettings")} disabled={driving.pending}>
                <SourceTableEditor role="pile-driving" variant="blueprint" csv={example.csv}
                  preview={example.table} onChange={table => { setPicked(null); driving.setTable(table); }}>
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
                  {example.customTable && <div><Button compact onClick={() => { setPicked(null); driving.resetTable(); }}>
                    {t("resetTable")}
                  </Button></div>}
                </SourceTableEditor>
              </fieldset>}
              {driving.settings && <PileDrivingSettings settings={driving.settings}
                pileSizes={driving.pileSizes} onApply={driving.setSettings} />}
            </div>
          </details>}
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
              <Checkbox className="pile-driving-warning-filter" label={t("overview.warningsOnly")}
                checked={warningsOnly} onChange={event => setWarningsOnly(event.target.checked)} />
              <p role="status" className="pile-driving-result-counts oa-secondary">
                <span>{t("summary", { linked, total: records.length })}</span>
                <span className={warningRecords.length ? "pile-driving-warning-count" : undefined}>
                  {t("checks.summary", { count: warningRecords.length })}
                </span>
              </p>
            </header>
            {visibleRecords.length === 0 ? <p className="pile-driving-empty oa-secondary" role="status">
              {t("overview.noWarnings")}
            </p> : <div ref={overviewRef} className={activeRow ? "pile-driving-overview has-details" : "pile-driving-overview"}
              tabIndex={0} role="region" aria-label={t("records")}>
              <table className="oa-table" aria-label={t("records")}>
                <thead><tr>
                  <th scope="col">{t("overview.day")}</th>
                  <th scope="col">{t("overview.location")}</th>
                  <th scope="col">{t("overview.warnings")}</th>
                </tr></thead>
                <tbody>{visibleRecords.map(({ file, record, rowIndex, day, date, warnings, unavailable }) => {
                  const matching = record.matching;
                  const locationId = matching.status === "matched" ? matching.load_point_id : null;
                  return <tr key={`${file.id}:${rowIndex}`} onClick={() => {
                    setPicked({ fileId: file.id, index: rowIndex, locationId, viewerSelection });
                    if (neighborhoodRecord) onNeighborhoodChange(null);
                    if (locationId !== null && !selectionDisabled) onSelect([locationId]);
                  }}>
                    <td>{date && day !== null
                      ? <time dateTime={date} title={dateFormat.format(new Date(`${date}T00:00:00Z`))}>{day}</time>
                      : <span title={t("overview.unknownDate")}>–</span>}</td>
                    <td>
                      <Button kind="quiet" compact aria-pressed={activeRow?.file.id === file.id && activeRow.rowIndex === rowIndex}
                        aria-label={locationId === null ? t("pile", { number: record.pile_number }) : t("location", { id: locationId })}>
                        {locationId ?? t("pile", { number: record.pile_number })}
                      </Button>
                      {locationId === null && <small className="pile-driving-match-state oa-secondary">
                        {t(matching.status === "ambiguous" ? "ambiguous" : "unmatched")}
                      </small>}
                    </td>
                    <td><div className="pile-driving-record-state">
                      {warnings.map(kind => <Status key={kind} tone="warning">{t(`checks.labels.${kind}`)}</Status>)}
                      {unavailable > 0 && <Status tone="info">{t("checks.unavailable", { count: unavailable })}</Status>}
                      {warnings.length === 0 && unavailable === 0 && <span aria-label={t("overview.noWarnings")}>–</span>}
                    </div></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>}
          </section>}
          {activeRow && active && <section className="pile-driving-detail">
            <header className="pile-driving-detail-header">
              <Heading>{t("pile", { number: active.pile_number })}</Heading>
              <p className="oa-secondary pile-driving-detail-source" title={activeRow.file.name}>
                {activeRow.file.name}
              </p>
            </header>
            <PileDrivingChecks checks={active.checks} energyRange={active.energy_range} neighborhood={active.neighborhood}
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
