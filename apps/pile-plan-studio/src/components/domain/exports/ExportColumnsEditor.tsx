import {useEffect,useLayoutEffect,useRef,useState} from "react";
import {useTranslation} from "react-i18next";
import {EXPORT_TECHNICAL_STATUSES,type ExportStatusValues,type ChangeCodeOptions,type ExportColumn,type ExportTable,type TipLevelCode,type ExportField,type ExportOptions,type NumberingDetection} from "../../../core/exportRevisionContract.ts";
import {EXPORT_FIELDS,moveExportColumnTo,DEFAULT_COLUMN_HEADERS,nextExportColumnCaption} from "../../../domain/exports/exportColumns.ts";
import { Button, Heading, Select, TextField } from "../../../openaec/react/src/index";
import ExportSettings from "./ExportSettings.tsx";
import ChangeCodesEditor from "./ChangeCodesEditor.tsx";
import EditableTableHeading from "../shared/EditableTableHeading.tsx";

type Props={table?:ExportTable|null;tipCodes?:TipLevelCode[];pending?:boolean;numberingDetection?:NumberingDetection;onUseDetectedNumbering?:()=>void;columns:ExportColumn[];onChange:(columns:ExportColumn[])=>void;options:ExportOptions;onOptionsChange:(options:ExportOptions)=>void;
  defaultHeaders?:Partial<Record<ExportField,string>>;disabled?:boolean;revision?:boolean;firstNewMark?:number;sourceHeaders?:string[];changeCodes?:ChangeCodeOptions;onChangeCodes?:(value:ChangeCodeOptions)=>void;onReset?:()=>void;preserveMarks?:boolean};

export default function ExportColumnsEditor({table,tipCodes=[],pending=false,numberingDetection,onUseDetectedNumbering,columns,onChange,options,onOptionsChange,disabled=false,revision=false,firstNewMark,sourceHeaders=[],changeCodes,onChangeCodes,onReset,preserveMarks=true,defaultHeaders=DEFAULT_COLUMN_HEADERS}:Props){
  const {t}=useTranslation("common");
  const scrollport = useRef<HTMLDivElement>(null);
  const headings = useRef<HTMLTableRowElement>(null);
  const addColumn = useRef<HTMLDivElement>(null);
  const drag = useRef<{ key: string; x: number; y: number; frame: number } | null>(null);
  const movedGrip = useRef<HTMLButtonElement>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const fields=[...EXPORT_FIELDS.filter(field=>options.include_proposals||!["export_id","proposal_code"].includes(field)),...revision?["change_code" as const]:[],...sourceHeaders.length?["source" as const]:[]];

  function clearDrag() {
    if (drag.current) cancelAnimationFrame(drag.current.frame);
    drag.current = null;
    setDragged(null);
    setDropTarget(null);
  }

  useEffect(() => () => {
    if (drag.current) cancelAnimationFrame(drag.current.frame);
  }, []);

  useLayoutEffect(() => {
    const grip = movedGrip.current;
    if (!grip) return;
    movedGrip.current = null;
    grip.focus({ preventScroll: true });
    grip.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [columns]);

  function pointerTarget(x: number, y: number) {
    const bounds = scrollport.current?.getBoundingClientRect();
    if (bounds?.width && (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom)) return null;
    const cells = Array.from(headings.current?.cells ?? []);
    const target = cells.findIndex(cell => {
      const rect = cell.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    });
    return columns[target]?.key ?? null;
  }

  function scrollWhileDragging() {
    const current = drag.current;
    const viewport = scrollport.current;
    if (!current || !viewport) return;
    const bounds = viewport.getBoundingClientRect();
    const edge = 28;
    if (current.y >= bounds.top && current.y <= bounds.bottom) {
      if (current.x >= bounds.left && current.x < bounds.left + edge) viewport.scrollLeft -= 8;
      if (current.x <= bounds.right && current.x > bounds.right - edge) viewport.scrollLeft += 8;
    }
    setDropTarget(pointerTarget(current.x, current.y));
    current.frame = requestAnimationFrame(scrollWhileDragging);
  }

  function move(key: string, target: string) {
    const next = moveExportColumnTo(columns, key, target);
    if (next === columns) return;
    onChange(next);
    setAnnouncement(t("exportTools.columnMoved", {
      name: columns.find(column => column.key === key)?.header,
      position: next.findIndex(column => column.key === key) + 1,
    }));
  }

  function update(selected: ExportColumn, patch: Partial<ExportColumn>) {
    onChange(columns.map(column => column.key === selected.key ? { ...column, ...patch } : column));
  }
  function add(field:ExportField){
    const base=defaultHeaders[field]??(field==="literal"?t("exportTools.extraColumn"):t(`exportTools.fields.${field}`));
    const column:ExportColumn={key:crypto.randomUUID(),field,...nextExportColumnCaption(base,columns),enabled:true,use_default_header:true};
    if(field==="source")column.source_index=0;
    onChange([...columns,column]);
  }
  const cellText = (value: ExportTable["rows"][number][number] | undefined) =>
    typeof value === "boolean" ? t(value ? "exportTools.yes" : "exportTools.no") : value ?? "";
  const shownRows = table?.rows.slice(0, 12) ?? [];

  return <section className="export-column-editor" aria-label={t("exportTools.outputColumns")}>
    <header className="export-section-heading">
      <div><Heading>{t("exportTools.exportPreview")}</Heading><p>{t("exportTools.outputColumnsHelp")}</p></div>
      {onReset && <Button type="button" disabled={disabled} onClick={onReset}>{t("exportTools.resetColumns")}</Button>}
    </header>
    {columns.length > 0 && <div ref={scrollport} className="source-preview-scroll" tabIndex={0} role="region"
      aria-label={t("exportTools.exportPreview")} aria-busy={pending}>
      <table className="source-preview-table oa-table export-output-table" aria-label={t("exportTools.exportPreview")}>
        <thead><tr ref={headings}>{columns.map((selected, index) => {
          const { key } = selected;
          const name = selected.header || t(`exportTools.fields.${selected.field}`);
          const dropAfter = dragged !== null && columns.findIndex(column => column.key === dragged) < index;
          const dropClass = dropTarget === key && dragged !== key ? (dropAfter ? "drop-after" : "drop-before") : "";
          const grip = <Button type="button" className="export-column-grip" disabled={disabled}
            aria-label={t("exportTools.dragColumn", { name })} title={t("exportTools.dragColumn", { name })}
            onPointerDown={event => {
              if (event.button !== 0 || !event.isPrimary) return;
              event.preventDefault();
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { key, x: event.clientX, y: event.clientY, frame: requestAnimationFrame(scrollWhileDragging) };
              setDragged(key);
            }}
            onPointerMove={event => {
              if (!drag.current) return;
              drag.current.x = event.clientX;
              drag.current.y = event.clientY;
              setDropTarget(pointerTarget(event.clientX, event.clientY));
            }}
            onPointerUp={event => {
              const target = pointerTarget(event.clientX, event.clientY);
              if (drag.current && target !== null) move(drag.current.key, target);
              clearDrag();
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={clearDrag} onLostPointerCapture={clearDrag}
            onKeyDown={event => {
              if (event.key === "Escape" && drag.current) {
                event.preventDefault();
                event.stopPropagation();
                clearDrag();
                return;
              }
              const target = event.key === "ArrowLeft" ? index - 1 : event.key === "ArrowRight" ? index + 1
                : event.key === "Home" ? 0 : event.key === "End" ? columns.length - 1 : null;
              if (target === null) return;
              event.preventDefault();
              event.stopPropagation();
              if (target !== index && columns[target]) {
                movedGrip.current = event.currentTarget;
                move(key, columns[target].key);
              }
            }}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3h1m4 0h1M5 8h1m4 0h1M5 13h1m4 0h1"/></svg></Button>;
          return <EditableTableHeading key={key} caption={name} meaning={t(`exportTools.fields.${selected.field}`)}
            label={t("exportTools.selectColumn", { name })} disabled={disabled} grip={grip}
            className={dragged === key ? "is-dragging" : dropClass}>
            <div className="export-column-details">
        <div className="export-field"><TextField label={t("exportTools.columnCaption")} value={selected.header} onChange={e=>update(selected,{header:e.target.value,use_default_header:false,header_number:undefined})}/></div>
        <div className="export-field"><Select label={t("exportTools.columnContent")} value={selected.field} onChange={e=>update(selected,{field:e.target.value as ExportField,...selected.use_default_header?{header:defaultHeaders[e.target.value as ExportField]??t(`exportTools.fields.${e.target.value}`)}:{},source_index:e.target.value==="source"?0:undefined,size_format:undefined,unit:undefined,template:undefined,status_values:undefined,coordinate_source:undefined})} options={fields.map(field=>({value:field,label:t(`exportTools.fields.${field}`)}))}/></div>
        {["technical_status","compression_status","tension_status"].includes(selected.field)&&<>
          <div className="export-field"><Select label={t("exportTools.statusDisplay")} value={selected.status_values?"custom":"standard"} onChange={e=>update(selected,{status_values:e.target.value==="custom"?Object.fromEntries(EXPORT_TECHNICAL_STATUSES.map(status=>[status,t(`exportTools.statusLabels.${status}`)])) as ExportStatusValues:undefined})} options={[{value:"standard",label:t("exportTools.statusStandard")},{value:"custom",label:t("exportTools.statusCustom")}]}/></div>
          {selected.status_values&&<>{EXPORT_TECHNICAL_STATUSES.map(status=><div className="export-field" key={status}><TextField label={t(`exportTools.statusLabels.${status}`)} value={selected.status_values?.[status]??""} onChange={e=>update(selected,{status_values:{...selected.status_values!,[status]:e.target.value}})}/></div>)}<p className="export-help">{t("exportTools.statusCustomHelp")}</p></>}
        </>}
        {selected.field==="export_id"&&<p className="export-help">{t("exportTools.exportIdHelp")}</p>}
        {selected.field==="source"&&<div className="export-field"><Select label={t("exportTools.sourceColumn")} value={selected.source_index??0} onChange={e=>update(selected,{source_index:Number(e.target.value)})} options={sourceHeaders.map((header,index)=>({value:String(index),label:header||t("exportTools.unnamedColumn",{number:index+1})}))}/></div>}
        {selected.field==="pile_size"&&<><div className="export-field"><Select label={t("exportTools.sizeNotation")} value={selected.size_format??(selected.source_index!=null?"source":"numeric")} onChange={e=>update(selected,{size_format:e.target.value==="source"?undefined:e.target.value as ExportColumn["size_format"],template:selected.template??"{size}x{size}"})} options={[...(selected.source_index!=null?[{value:"source",label:t("exportTools.sourceNotation")}]:[]),{value:"numeric",label:t("exportTools.sizeNumeric")},{value:"dimensions",label:t("exportTools.sizeDimensions")},{value:"custom",label:t("exportTools.customNotation")}]}/></div>
          {selected.size_format==="custom"&&<div className="export-field"><TextField label={t("exportTools.sizeTemplate")} value={selected.template??""} onChange={e=>update(selected,{template:e.target.value})} help={t("exportTools.sizeTemplateHelp")}/></div>}</>}
        {revision&&["x","y"].includes(selected.field)&&<>
          <div className="export-field"><Select label={t("exportTools.coordinateSource")} value={selected.coordinate_source??"old_within_tolerance"} onChange={e=>update(selected,{coordinate_source:e.target.value as ExportColumn["coordinate_source"]})} options={[{value:"old_within_tolerance",label:t("exportTools.coordinateOldWithinTolerance")},{value:"new",label:t("exportTools.coordinateNew")}]}/></div><p className="export-help">{t("exportTools.coordinateSourceHelp")}</p>
        </>}
        {["x","y","tip_level"].includes(selected.field)&&<div className="export-field"><Select label={t("exportTools.outputUnit")} value={selected.unit??(selected.source_index!=null?"source":selected.field==="tip_level"?"m":"mm")} onChange={e=>update(selected,{unit:e.target.value==="source"?undefined:e.target.value as "m"|"mm"})} options={[...(selected.source_index!=null?[{value:"source",label:t("exportTools.sourceNotation")}]:[]),...[{value:"mm",label:"mm"},{value:"m",label:"m"}]]}/></div>}
        {selected.field==="literal"&&<div className="export-field"><TextField label={t("exportTools.fixedValue")} value={selected.value??""} onChange={e=>update(selected,{value:e.target.value})} help={t("exportTools.fixedValueHelp")}/></div>}
        {selected.field==="mark"&&revision&&numberingDetection&&<div className="export-numbering-detection">
          {numberingDetection.total_positions>0?<>
            <p className="export-help">{t("exportTools.detection",{matched:numberingDetection.matching_positions,total:numberingDetection.total_positions})}</p>
            {numberingDetection.equally_matching_rules>1&&<p className="export-help">{t("exportTools.detectionAmbiguous")}</p>}
            {onUseDetectedNumbering&&<Button type="button" className="export-quiet-button" onClick={onUseDetectedNumbering} disabled={disabled}>{t("exportTools.useDetected")}</Button>}
          </>:<p className="export-help">{t("exportTools.noSourceMarks")}</p>}
        </div>}
        {(selected.field==="mark"||selected.field==="tip_code")&&<ExportSettings only={selected.field} options={options} onChange={onOptionsChange} revision={revision} preserveMarks={preserveMarks} firstNewMark={firstNewMark}/>}
        {selected.field==="change_code"&&changeCodes&&onChangeCodes&&<ChangeCodesEditor value={changeCodes} onChange={onChangeCodes}/>}
        {!["mark","tip_code","pile_size","x","y","tip_level","literal","source","change_code","technical_status","compression_status","tension_status"].includes(selected.field)&&<p className="export-help">{t("exportTools.noContentOptions")}</p>}
              <Button type="button" kind="danger" aria-label={t("exportTools.removeNamedColumn", { name })} onClick={() => {
                onChange(columns.filter(column => column.key !== key));
                addColumn.current?.querySelector("select")?.focus();
              }}>{t("exportTools.removeNamedColumn", { name })}</Button>
            </div>
          </EditableTableHeading>;
        })}</tr></thead>
        <tbody>{shownRows.map((row, index) => <tr key={index}>
          {columns.map((column, position) => <td key={column.key}>{pending ? " " : cellText(row[position])}</td>)}
        </tr>)}</tbody>
      </table>
    </div>}
    {table && table.rows.length > shownRows.length && <p className="export-help">
      {t("exportTools.previewLimit", { count: shownRows.length })}
    </p>}
    {tipCodes.length > 0 && <p className="export-help">{t("exportTools.codeTable")}: {
      tipCodes.map(item => `${(item.level_mm / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })} m = ${item.code}`).join("; ")
    }</p>}
    <span className="sr-only" role="status">{announcement}</span>
    <div ref={addColumn} className="export-field export-add-column">
      <Select label={t("exportTools.addColumn")} disabled={disabled} value="" onChange={event => {
        if (event.target.value) add(event.target.value as ExportField);
      }} options={[{ value: "", label: t("exportTools.chooseContent") }, ...fields.map(field => ({
        value: field, label: t(`exportTools.fields.${field}`),
      }))]} />
    </div>
  </section>;
}
