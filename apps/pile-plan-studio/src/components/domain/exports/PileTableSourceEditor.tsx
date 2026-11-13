import { useTranslation } from "react-i18next";
import { Select, TextField } from "../../../openaec/react/src/index";
import NumericValueInput from "../../template/NumericValueInput.tsx";
import EditableTableHeading from "../shared/EditableTableHeading.tsx";
import type { ExportCell, ExportField, PileTableInspection, PileTableMapping, RevisionSource } from "../../../core/exportRevisionContract.ts";

type Props = {
  source: RevisionSource;
  inspection: PileTableInspection;
  mapping: PileTableMapping;
  onMapping: (mapping: PileTableMapping) => void;
  onSource: (patch: Partial<RevisionSource>) => void;
  disabled?: boolean;
  newPlan?: boolean;
};

const FIELDS: ExportField[] = ["export_id", "load_point_id", "mark", "x", "y", "pile_size", "tip_level",
  "tip_code", "design_load", "selected_cpts", "change_code"];
const LENGTH_UNITS = [{ value: "mm", label: "mm" }, { value: "m", label: "m" }];

export default function PileTableSourceEditor({ source, inspection, mapping, onMapping, onSource, disabled = false, newPlan = false }: Props) {
  const { t } = useTranslation("common");
  const required: ExportField[] = newPlan ? ["load_point_id", "x", "y", "pile_size", "tip_level"] : ["x", "y"];

  function setField(index: number, next: string) {
    const columns = { ...mapping.columns };
    for (const field of Object.keys(columns) as ExportField[]) {
      if (columns[field] === index) delete columns[field];
    }
    if (next) columns[next as ExportField] = index;
    onMapping({ ...mapping, columns });
  }

  const cellText = (value: ExportCell | undefined) =>
    typeof value === "boolean" ? t(value ? "exportTools.yes" : "exportTools.no") : value ?? "";
  return <fieldset className="pile-source-editor" disabled={disabled}>
    <div className="source-import-settings" role="group" aria-label={t("tableImport.settings")}>
      <strong>{t("tableImport.settings")}</strong>
      <div className="source-import-file-settings">
        {inspection.sheet_names.length > 0 && <Select label={t("exportTools.sourceSheet")}
          value={source.sheet_name ?? (inspection.ambiguous_sheet ? "" : inspection.sheet_name ?? "")}
          onChange={e => onSource({ sheet_name: e.target.value, header_row: undefined })}
          options={[...(inspection.ambiguous_sheet ? [{ value: "", label: t("exportTools.chooseSheet") }] : []),
            ...inspection.sheet_names.map(name => ({ value: name, label: name }))]} />}
        <label className="oa-label"><span>{t("exportTools.headerRow")}</span>
          <NumericValueInput integer min={1} step={1} value={source.header_row ?? inspection.header_row}
            onNumberChange={header_row => onSource({ header_row })} />
        </label>
      </div>
    </div>
    <div className="source-import-preview">
      <div className="source-preview-heading">
        <strong>{t("tableImport.preview")}</strong>
        <span>{t("exportTools.rowCount", { count: inspection.table.rows.length })}</span>
      </div>
      <p className="source-import-help">{t("tableImport.editColumnHelp")}</p>
      <p className="source-import-help">{t(newPlan ? "exportTools.sourceMappingNewHelp" : "exportTools.sourceMappingOldHelp")}</p>
      <div className="source-preview-scroll" tabIndex={0} role="region" aria-label={t("tableImport.preview")}>
        <table className="source-preview-table oa-table" aria-label={t("tableImport.preview")}>
          <thead><tr>{inspection.headers.map((header, index) => {
            const caption = header || t("tableImport.column", { number: index + 1 });
            const field = (Object.keys(mapping.columns) as ExportField[]).find(field => mapping.columns[field] === index);
            const coordinate = field === "x" || field === "y";
            const unit = coordinate ? mapping.coordinate_unit : field === "tip_level" ? mapping.tip_unit : null;
            const meaning = field ? t(`exportTools.fields.${field}`) : t("tableImport.fields.ignore");
            return <EditableTableHeading key={index} caption={caption} meaning={unit ? `${meaning} · ${unit}` : meaning}
              label={t("tableImport.selectColumn", { name: caption })} disabled={disabled}>
              <Select label={t("tableImport.meaning")} value={field ?? ""} onChange={e => setField(index, e.target.value)}
                options={[{ value: "", label: t("tableImport.fields.ignore") }, ...FIELDS.map(value => ({
                  value, label: t(`exportTools.fields.${value}`) + (required.includes(value) ? " *" : ""),
                }))]} />
              {coordinate && <Select label={t("exportTools.coordinateUnit")} value={mapping.coordinate_unit}
                onChange={e => onMapping({ ...mapping, coordinate_unit: e.target.value as "mm" | "m" })} options={LENGTH_UNITS} />}
              {field === "tip_level" && <Select label={t("tableImport.unit")} value={mapping.tip_unit}
                onChange={e => onMapping({ ...mapping, tip_unit: e.target.value as "mm" | "m" })} options={LENGTH_UNITS} />}
              {field === "pile_size" && <>
                <Select label={t("exportTools.sourceShape")} value={mapping.size_shape ?? ""}
                  onChange={e => onMapping({ ...mapping, size_shape: (e.target.value || null) as PileTableMapping["size_shape"] })}
                  options={[
                    { value: "", label: t("exportTools.shapeAutomatic") }, { value: "square", label: t("exportTools.shapeSquare") },
                    { value: "round", label: t("exportTools.shapeRound") },
                  ]} />
                <TextField label={t("exportTools.sourceSizeTemplate")} placeholder="{size}x{size}" value={mapping.size_template ?? ""}
                  onChange={e => onMapping({ ...mapping, size_template: e.target.value || null })} help={t("exportTools.sourceSizeTemplateHelp")} />
              </>}
            </EditableTableHeading>;
          })}</tr></thead>
          <tbody>{inspection.table.rows.slice(0, 12).map((row, index) => <tr key={index}>
            {inspection.headers.map((_, column) => <td key={column}>{cellText(row[column])}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  </fieldset>;
}
