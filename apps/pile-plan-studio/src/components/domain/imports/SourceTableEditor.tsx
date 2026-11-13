import { useId, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Checkbox, Select } from "../../../openaec/react/src/index";
import NumericValueInput from "../../template/NumericValueInput.tsx";
import type { ImportColumnMapping, ImportDiagnostic, SourceTablePreview, TableImportSettings } from "../../../core/coreImportContract.ts";
import { importDiagnosticText } from "../../../core/importDiagnosticText.ts";
import type { ImportFileRole } from "../../../core/importFiles.ts";
import EditableTableHeading from "../shared/EditableTableHeading.tsx";
import SourceMeaningSelect from "./SourceMeaningSelect.tsx";
import "./sourceTableEditor.css";

const DRIVING_FIELDS = [
  "paalnummer", "dikte_cm", "lengte_cm", "referentieniveau", "tochtnummer", "ppn_nap",
  "slagen", "mm_zakking_per_tocht", "energie_per_slag_kj", "paal_id", "datum", "stelling",
  "starttijd", "projectnummer", "bloknummer", "kavelnummer", "ppd_gewenst", "opmerkingen",
];
const PILE_PLAN_ACTION_FIELDS = ["pile-size", "tip-level", "selected-cpts"];

type SourceError = { row: number | null; column: number | null; message: string };
type Role = ImportFileRole | "pile-plan" | "pile-driving";
type Props = {
  variant?: "blueprint";
  preview?: SourceTablePreview | null;
  previewColumn?: { label: string; cell: (row: number) => ReactNode };
  settings?: TableImportSettings | null;
  diagnostics?: ImportDiagnostic[];
  sourceErrors?: SourceError[];
  role: Role;
  matrix?: boolean;
  showAdvicePileCount?: boolean;
  processed?: boolean;
  csv?: boolean;
  children?: ReactNode;
  onChange: (settings: TableImportSettings) => void;
};

function mappingFields(role: Role, matrix: boolean): string[] {
  switch (role) {
    case "pile-driving": return ["ignore", ...DRIVING_FIELDS];
    case "pile-plan": return ["ignore", "id", "revit-mark", "x", "y", ...PILE_PLAN_ACTION_FIELDS, "pile-count"];
    case "cpts": return ["ignore", "id", "x", "y"];
    case "load-points": return ["ignore", "id", "x", "y", "compression", "tension"];
    case "bearing-capacities": return matrix
      ? ["ignore", "id", "tip-level", "resistance"]
      : ["ignore", "id", "tip-level", "pile-size", "resistance", "tension"];
  }
}

function sourceUnit(mapping: ImportColumnMapping | undefined) {
  switch (mapping?.field) {
    case "x":
    case "y": return mapping.unit ?? "mm";
    case "tip-level": return mapping.unit ?? "m";
    default: return null;
  }
}

export default function SourceTableEditor({
  preview, previewColumn, settings, diagnostics = [], sourceErrors = [], role, matrix = false,
  processed = false, csv = false, children, onChange, variant, showAdvicePileCount = true,
}: Props) {
  const { t } = useTranslation(["common", "rightPanel"]);
  const id = useId();
  const previewRef = useRef<HTMLDivElement>(null);
  const Action = variant === "blueprint" ? Button : "button";
  const value = settings ?? preview?.settings ?? {};
  const columns = value.columns ?? [];
  const isProcessed = processed || preview?.processed;
  const rows = preview?.rows.filter(row => isProcessed ||
    ((!value.has_headers || row.number !== value.header_row) && row.number >= (value.first_data_row ?? 1))) ?? [];
  const errors = [
    ...diagnostics.filter(d => d.severity === "error").map(d => ({
      row: d.location?.row ?? null, column: d.location?.column ?? null, message: importDiagnosticText(d, t),
    })),
    ...sourceErrors,
  ];
  const indexedErrors = errors.map((error, index) => ({ ...error, id: `${id}-error-${index}` }));
  const errorsByRow = new Map<number, typeof indexedErrors>();
  for (const error of indexedErrors) {
    if (error.row === null) continue;
    const rowErrors = errorsByRow.get(error.row);
    if (rowErrors) rowErrors.push(error);
    else errorsByRow.set(error.row, [error]);
  }
  const label = (field: string) => {
    if (role === "pile-driving" && field !== "ignore") return t(`pileDriving.columns.${field}`, { ns: "rightPanel" });
    if (role === "bearing-capacities" && field === "id") return t("tableImport.fields.cpt");
    if (role === "bearing-capacities" && field === "tension") return t("tableImport.fields.tensionResistance");
    return t(`tableImport.fields.${field}`);
  };
  const caption = (column: SourceTablePreview["columns"][number]) =>
    column.header || t("tableImport.column", { number: column.column });
  const update = (patch: Partial<TableImportSettings>) => onChange({ ...value, ...patch });

  function updateColumn(column: number, patch: Partial<ImportColumnMapping>) {
    const exclusive = patch.field && patch.field !== "ignore" && !(matrix && patch.field === "resistance");
    const next = columns.map(mapping => {
      if (mapping.column === column) return { ...mapping, ...patch };
      if (exclusive && mapping.field === patch.field) return { ...mapping, field: "ignore", pile_size_mm: null };
      return mapping;
    });
    if (!next.some(mapping => mapping.column === column)) next.push({ column, field: "ignore", ...patch });
    update({ columns: next, ...(patch.field === "pile-size" ? { fixed_pile_size_mm: null } : {}) });
  }

  function showError(row: number | null, column: number | null) {
    const sourceRow = previewRef.current?.querySelector<HTMLElement>(`[data-source-row="${row}"]`);
    const cell = sourceRow?.querySelector<HTMLElement>(`[data-source-column="${column}"]`);
    const target = cell ?? sourceRow;
    target?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    target?.focus({ preventScroll: true });
  }

  const shownRows = new Set(rows.map(row => row.number));
  const errorLabel = (error: SourceError) => error.column == null
    ? t("tableImport.showErrorRow", { row: error.row })
    : t("tableImport.showError", { row: error.row, column: error.column });

  return <div className={`source-table-editor${variant === "blueprint" ? " source-table-blueprint" : ""}`}>
    {(children || (preview && !isProcessed)) && (
      <div className="source-import-settings" role="group" aria-label={t("tableImport.settings")}>
        <strong>{t("tableImport.settings")}</strong>
        <div className="source-import-options">{children}</div>
        {preview && !isProcessed && <>
          {role === "bearing-capacities" && <>
            {showAdvicePileCount && <div className="source-import-file-settings">
              <Select label={t("tableImport.adviceApplicability")} value={value.pile_count == null ? "all" : "specific"}
                onChange={e => update({ pile_count: e.target.value === "all" ? null : 1 })}
                options={[{ value: "all", label: t("tableImport.allPileCounts") }, { value: "specific", label: t("tableImport.specificPileCount") }]} />
              {value.pile_count != null && <label><span>{t("tableImport.capPileCount")}</span>
                <NumericValueInput variant={variant} integer min={1} max={4294967295} value={value.pile_count}
                  onNumberChange={pile_count => update({ pile_count })} />
              </label>}
            </div>}
            {!matrix && <div className="source-import-file-settings">
              <Select label={t("tableImport.sizeSource")} value={value.fixed_pile_size_mm != null ? "fixed" : "column"}
                onChange={e => update(e.target.value === "fixed" ? {
                  fixed_pile_size_mm: 0,
                  columns: columns.map(mapping => mapping.field === "pile-size" ? { ...mapping, field: "ignore" } : mapping),
                } : { fixed_pile_size_mm: null })}
                options={[{ value: "column", label: t("tableImport.sizeFromColumn") }, { value: "fixed", label: t("tableImport.fixedSheetSize") }]} />
              {value.fixed_pile_size_mm != null && <label><span>{t("tableImport.fixedPileSize")}</span>
                <NumericValueInput variant={variant} integer min={1} max={4294967295} value={value.fixed_pile_size_mm || ""}
                  onNumberChange={fixed_pile_size_mm => update({ fixed_pile_size_mm })} />
              </label>}
            </div>}
            <p className="source-import-help">{t("tableImport.applicabilityHelp")}</p>
          </>}
          <div className="source-import-file-settings">
            {preview.sheets.length > 1 && <Select label={t("tableImport.sheet")} value={value.sheet_name ?? ""}
              onChange={e => onChange({ sheet_name: e.target.value, delimiter: value.delimiter })}
              options={preview.sheets.map(sheet => ({ value: sheet, label: sheet }))} />}
            <Checkbox label={t("tableImport.hasHeaders")} checked={value.has_headers ?? false} onChange={e => {
              const has_headers = e.target.checked;
              const header_row = has_headers ? value.header_row ?? 1 : null;
              update({ has_headers, header_row, first_data_row: (header_row ?? 0) + 1 });
            }} />
            {value.has_headers && <label><span>{t("tableImport.headerRow")}</span>
              <NumericValueInput variant={variant} integer min={1} step={1} value={value.header_row ?? 1}
                onNumberChange={n => update({ header_row: n, first_data_row: n + 1, columns: null })} />
            </label>}
            <label><span>{t("tableImport.dataRow")}</span>
              <NumericValueInput variant={variant} integer min={1} step={1} value={value.first_data_row ?? 1}
                onNumberChange={first_data_row => update({ first_data_row })} />
            </label>
            {csv && <Select label={t("tableImport.delimiter")} value={value.delimiter ?? "auto"}
              onChange={e => update({ delimiter: e.target.value === "auto" ? null : e.target.value, columns: null })}
              options={[
                { value: "auto", label: t("tableImport.automatic") }, { value: ",", label: t("tableImport.comma") },
                { value: ";", label: t("tableImport.semicolon") }, { value: "tab", label: "Tab" },
              ]} />}
          </div>
        </>}
      </div>
    )}
    <div className="source-import-preview">
      <div className="source-preview-heading">
        <strong id={`${id}-preview`}>{t("tableImport.preview")}</strong>
        {preview && <span>{t("tableImport.rowCount", { count: preview.row_count })}{isProcessed && ` · ${t("tableImport.processed")}`}</span>}
      </div>
      {preview && !isProcessed && <p className="source-import-help">{t("tableImport.editColumnHelp")}</p>}
      {preview ? (
        <div ref={previewRef} className="source-preview-scroll" tabIndex={0} role="region" aria-labelledby={`${id}-preview`}>
          <table aria-labelledby={`${id}-preview`} className={`source-preview-table${variant === "blueprint" ? " oa-table" : ""}`}>
            <thead><tr>
              <th scope="col" aria-label={t("tableImport.row")}>#</th>
              {previewColumn && <th scope="col">{previewColumn.label}</th>}
              {preview.columns.map(column => {
                const { column: number, nonempty_count, numeric_count } = column;
                const name = caption(column);
                const mapping = columns.find(m => m.column === number);
                const field = mapping?.field ?? "ignore";
                const unit = sourceUnit(mapping);
                const isResistance = matrix && field === "resistance";
                const detail = isResistance && mapping?.pile_size_mm ? `${mapping.pile_size_mm} mm` : unit;
                const editLabel = t("tableImport.selectColumn", { name });
                const meaning = label(field) + (detail ? ` · ${detail}` : "");
                const restrictEmpty = nonempty_count === 0 && role !== "pile-driving";
                if (isProcessed) return <th scope="col" key={number}>{name}</th>;
                return <EditableTableHeading key={number} caption={name} meaning={meaning} label={editLabel}>
                  <SourceMeaningSelect label={t("tableImport.meaning")} value={field}
                    onChange={e => updateColumn(number, { field: e.target.value })}
                    options={mappingFields(role, matrix).map(option => ({
                      value: option, label: label(option),
                      disabled: option !== "ignore" && restrictEmpty &&
                        !(role === "pile-plan" && PILE_PLAN_ACTION_FIELDS.includes(option)),
                    }))} />
                  {restrictEmpty && <p className="source-import-help">
                    {t(role === "pile-plan" ? "pilePlanMatching.emptyColumnHelp" : "tableImport.emptyHelp")}
                  </p>}
                  {role === "pile-plan" && field === "pile-size" &&
                    <p className="source-import-help">{t("tableImport.pilePlanSizeHelp")}</p>}
                  {unit && <Select label={t("tableImport.unit")} value={unit}
                    onChange={e => updateColumn(number, { unit: e.target.value })}
                    options={[{ value: "mm", label: "mm" }, { value: "m", label: "m" }]} />}
                  {isResistance && <label><span>{t("tableImport.fixedPileSize")}</span>
                    <NumericValueInput variant={variant} integer min={1} step={1} value={mapping?.pile_size_mm ?? ""}
                      onNumberChange={pile_size_mm => updateColumn(number, { pile_size_mm })} />
                  </label>}
                  <p className="source-import-help">{role === "pile-plan" && field === "pile-size"
                    ? t("tableImport.filledCount", { count: nonempty_count })
                    : t("tableImport.columnSummary", { filled: nonempty_count, numeric: numeric_count })}</p>
                </EditableTableHeading>;
              })}
            </tr></thead>
            <tbody>{rows.map(row => {
              const rowErrors = errorsByRow.get(row.number) ?? [];
              return <tr key={row.number} data-source-row={row.number} tabIndex={-1}
                aria-describedby={rowErrors.map(error => error.id).join(" ") || undefined}
                className={rowErrors.length ? "is-error" : undefined}>
                <th scope="row">{row.number}</th>
                {previewColumn && <td>{previewColumn.cell(row.number) ?? <span className="source-empty-cell">—</span>}</td>}
                {row.cells.map((cell, index) => {
                  const column = preview.columns[index]?.column ?? index + 1;
                  const description = rowErrors.filter(error => error.column === column).map(error => error.id).join(" ");
                  return <td key={column} data-source-column={column} tabIndex={description ? -1 : undefined}
                    aria-describedby={description || undefined}
                    className={description ? "is-error-cell" : undefined}>
                    {cell || <span className="source-empty-cell">—</span>}
                  </td>;
                })}
              </tr>;
            })}</tbody>
          </table>
        </div>
      ) : <p className="source-import-help">{t("tableImport.notAvailable")}</p>}
      {preview && preview.row_count > preview.rows.length &&
        <p className="source-import-help">{t("tableImport.previewLimit", { count: preview.rows.length })}</p>}
      {indexedErrors.length > 0 && <ul className="source-preview-errors">
        {indexedErrors.map(error => <li key={error.id}>
          <span id={error.id}>{error.message}</span>
          {error.row !== null && shownRows.has(error.row) &&
            <Action className="source-error-link" type="button" onClick={() => showError(error.row, error.column)}>
              {errorLabel(error)}
            </Action>}
        </li>)}
      </ul>}
    </div>
  </div>;
}
