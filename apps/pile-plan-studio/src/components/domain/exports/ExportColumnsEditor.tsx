import {useRef,useState} from "react";
import {useTranslation} from "react-i18next";
import {EXPORT_TECHNICAL_STATUSES,type ExportStatusValues,type ChangeCodeOptions,type ExportColumn,type ExportField,type ExportOptions,type NumberingDetection} from "../../../core/exportRevisionContract.ts";
import {EXPORT_FIELDS,moveExportColumnTo,DEFAULT_COLUMN_HEADERS,nextExportColumnCaption} from "../../../domain/exports/exportColumns.ts";
import ExportSettings from "./ExportSettings.tsx";
import ChangeCodesEditor from "./ChangeCodesEditor.tsx";

type Props={numberingDetection?:NumberingDetection;onUseDetectedNumbering?:()=>void;columns:ExportColumn[];onChange:(columns:ExportColumn[])=>void;options:ExportOptions;onOptionsChange:(options:ExportOptions)=>void;
  defaultHeaders?:Partial<Record<ExportField,string>>;disabled?:boolean;revision?:boolean;firstNewMark?:number;sourceHeaders?:string[];changeCodes?:ChangeCodeOptions;onChangeCodes?:(value:ChangeCodeOptions)=>void;onReset?:()=>void;preserveMarks?:boolean};

export default function ExportColumnsEditor({numberingDetection,onUseDetectedNumbering,columns,onChange,options,onOptionsChange,disabled=false,revision=false,firstNewMark,sourceHeaders=[],changeCodes,onChangeCodes,onReset,preserveMarks=true,defaultHeaders=DEFAULT_COLUMN_HEADERS}:Props){
  const {t}=useTranslation("common");
  const [selectedKey,setSelectedKey]=useState(columns[0]?.key);
  const listRef=useRef<HTMLOListElement>(null),dragKey=useRef<string|null>(null);
  const [dragged,setDragged]=useState<string|null>(null),[dropTarget,setDropTarget]=useState<string|null>(null),[announcement,setAnnouncement]=useState("");
  const clearDrag=()=>{dragKey.current=null;setDragged(null);setDropTarget(null);};
  const pointerTarget=(x:number,y:number)=>{
    const rows=listRef.current?.children;if(!rows)return null;
    for(let index=0;index<rows.length;index++){
      const rect=rows[index].getBoundingClientRect();
      if(x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom)return columns[index]?.key??null;
    }return null;
  };
  const move=(key:string,target:string)=>{
    const next=moveExportColumnTo(columns,key,target);onChange(next);
    setAnnouncement(t("exportTools.columnMoved",{name:columns.find(c=>c.key===key)?.header,position:next.findIndex(c=>c.key===key)+1}));
  };
  const selected=columns.find(c=>c.key===selectedKey)??columns[0];
  const fields=[...EXPORT_FIELDS.filter(field=>options.include_proposals||!["export_id","proposal_code"].includes(field)),...revision?["change_code" as const]:[],...sourceHeaders.length?["source" as const]:[]];
  function update(patch:Partial<ExportColumn>){if(selected)onChange(columns.map(c=>c.key===selected.key?{...c,...patch}:c));}
  function add(field:ExportField){
    const base=defaultHeaders[field]??(field==="literal"?t("exportTools.extraColumn"):t(`exportTools.fields.${field}`));
    const column:ExportColumn={key:crypto.randomUUID(),field,...nextExportColumnCaption(base,columns),enabled:true,use_default_header:true};
    if(field==="source")column.source_index=0;
    onChange([...columns,column]);setSelectedKey(column.key);
  }
  return <section className="export-column-editor" aria-label={t("exportTools.outputColumns")}>
    <header className="export-section-heading"><div><h3>{t("exportTools.outputColumns")}</h3><p>{t("exportTools.outputColumnsHelp")}</p></div>
      {onReset&&<button className="export-quiet-button" type="button" disabled={disabled} onClick={onReset}>{t("exportTools.resetColumns")}</button>}</header>
    <div className="export-column-layout">
      <div className="export-column-list-area"><ol className="export-column-list" ref={listRef}>
        {columns.map((column,index)=>{const name=column.header||t(`exportTools.fields.${column.field}`);const dropAfter=dragged!==null&&columns.findIndex(c=>c.key===dragged)<index;
          return <li key={column.key} className={`${selected?.key===column.key?"is-selected":""} ${column.enabled?"":"is-excluded"} ${dragged===column.key?"is-dragging":""} ${dropTarget===column.key&&dragged!==column.key?(dropAfter?"drop-after":"drop-before"):""}`}>
          <button type="button" className="export-column-grip" disabled={disabled} aria-label={t("exportTools.dragColumn",{name})} title={t("exportTools.dragColumn",{name})}
            onPointerDown={event=>{
              if(event.button!==0||!event.isPrimary)return;event.preventDefault();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);
              dragKey.current=column.key;setDragged(column.key);
            }}
            onPointerMove={event=>{if(dragKey.current!==null)setDropTarget(pointerTarget(event.clientX,event.clientY));}}
            onPointerUp={event=>{
              const target=pointerTarget(event.clientX,event.clientY);if(dragKey.current!==null&&target!==null)move(dragKey.current,target);clearDrag();
              if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={clearDrag} onLostPointerCapture={clearDrag}
            onKeyDown={event=>{
              if(event.key==="Escape"&&dragKey.current!==null){event.preventDefault();clearDrag();return;}
              const target=event.key==="ArrowUp"?index-1:event.key==="ArrowDown"?index+1:event.key==="Home"?0:event.key==="End"?columns.length-1:null;
              if(target===null)return;event.preventDefault();if(columns[target])move(column.key,columns[target].key);
            }}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3h1m4 0h1M5 8h1m4 0h1M5 13h1m4 0h1"/></svg></button>
          <button type="button" className="export-column-select" disabled={disabled} aria-label={t("exportTools.selectColumn",{name})} aria-pressed={selected?.key===column.key} onClick={()=>setSelectedKey(column.key)}>
            <strong>{name}</strong><small>{t(`exportTools.fields.${column.field}`)}</small></button>
          <button type="button" className="export-column-delete" disabled={disabled} aria-label={t("exportTools.removeNamedColumn",{name})} title={t("exportTools.removeNamedColumn",{name})} onClick={()=>onChange(columns.filter(c=>c.key!==column.key))}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M6 2h4M4 4l1 10h6l1-10M7 6v6M9 6v6"/></svg></button>
        </li>;})}
      </ol><span className="sr-only" role="status">{announcement}</span><label className="export-field export-add-column"><span>{t("exportTools.addColumn")}</span><select disabled={disabled} value="" onChange={e=>{if(e.target.value)add(e.target.value as ExportField);}}>
        <option value="">{t("exportTools.chooseContent")}</option>{fields.map(field=><option key={field} value={field}>{t(`exportTools.fields.${field}`)}</option>)}
      </select></label></div>
      {selected&&<fieldset className="export-column-details" disabled={disabled}>
        <legend>{t("exportTools.columnSettings")}</legend>
        <label className="export-field"><span>{t("exportTools.columnCaption")}</span><input value={selected.header} onChange={e=>update({header:e.target.value,use_default_header:false,header_number:undefined})}/></label>
        <label className="export-field"><span>{t("exportTools.columnContent")}</span><select value={selected.field} onChange={e=>update({field:e.target.value as ExportField,...selected.use_default_header?{header:defaultHeaders[e.target.value as ExportField]??t(`exportTools.fields.${e.target.value}`)}:{},source_index:e.target.value==="source"?0:undefined,size_format:undefined,unit:undefined,template:undefined,status_values:undefined,coordinate_source:undefined})}>
          {fields.map(field=><option key={field} value={field}>{t(`exportTools.fields.${field}`)}</option>)}</select></label>
        {["technical_status","compression_status","tension_status"].includes(selected.field)&&<>
          <label className="export-field"><span>{t("exportTools.statusDisplay")}</span><select value={selected.status_values?"custom":"standard"} onChange={e=>update({status_values:e.target.value==="custom"?Object.fromEntries(EXPORT_TECHNICAL_STATUSES.map(status=>[status,t(`exportTools.statusLabels.${status}`)])) as ExportStatusValues:undefined})}>
            <option value="standard">{t("exportTools.statusStandard")}</option><option value="custom">{t("exportTools.statusCustom")}</option>
          </select></label>
          {selected.status_values&&<>{EXPORT_TECHNICAL_STATUSES.map(status=><label className="export-field" key={status}><span>{t(`exportTools.statusLabels.${status}`)}</span><input value={selected.status_values?.[status]??""} onChange={e=>update({status_values:{...selected.status_values!,[status]:e.target.value}})}/></label>)}<p className="export-help">{t("exportTools.statusCustomHelp")}</p></>}
        </>}
        {selected.field==="export_id"&&<p className="export-help">{t("exportTools.exportIdHelp")}</p>}
        {selected.field==="source"&&<label className="export-field"><span>{t("exportTools.sourceColumn")}</span><select value={selected.source_index??0} onChange={e=>update({source_index:Number(e.target.value)})}>
          {sourceHeaders.map((header,index)=><option key={index} value={index}>{header||t("exportTools.unnamedColumn",{number:index+1})}</option>)}</select></label>}
        {selected.field==="pile_size"&&<><label className="export-field"><span>{t("exportTools.sizeNotation")}</span><select value={selected.size_format??(selected.source_index!=null?"source":"numeric")} onChange={e=>update({size_format:e.target.value==="source"?undefined:e.target.value as ExportColumn["size_format"],template:selected.template??"{size}x{size}"})}>
          {selected.source_index!=null&&<option value="source">{t("exportTools.sourceNotation")}</option>}
          <option value="numeric">{t("exportTools.sizeNumeric")}</option><option value="dimensions">{t("exportTools.sizeDimensions")}</option><option value="custom">{t("exportTools.customNotation")}</option></select></label>
          {selected.size_format==="custom"&&<label className="export-field"><span>{t("exportTools.sizeTemplate")}</span><input value={selected.template??""} onChange={e=>update({template:e.target.value})}/><small>{t("exportTools.sizeTemplateHelp")}</small></label>}</>}
        {revision&&["x","y"].includes(selected.field)&&<>
          <label className="export-field"><span>{t("exportTools.coordinateSource")}</span><select value={selected.coordinate_source??"old_within_tolerance"} onChange={e=>update({coordinate_source:e.target.value as ExportColumn["coordinate_source"]})}>
            <option value="old_within_tolerance">{t("exportTools.coordinateOldWithinTolerance")}</option><option value="new">{t("exportTools.coordinateNew")}</option>
          </select></label><p className="export-help">{t("exportTools.coordinateSourceHelp")}</p>
        </>}
        {["x","y","tip_level"].includes(selected.field)&&<label className="export-field"><span>{t("exportTools.outputUnit")}</span><select value={selected.unit??(selected.source_index!=null?"source":selected.field==="tip_level"?"m":"mm")} onChange={e=>update({unit:e.target.value==="source"?undefined:e.target.value as "m"|"mm"})}>
          {selected.source_index!=null&&<option value="source">{t("exportTools.sourceNotation")}</option>}<option value="mm">mm</option><option value="m">m</option></select></label>}
        {selected.field==="literal"&&<label className="export-field"><span>{t("exportTools.fixedValue")}</span><input value={selected.value??""} onChange={e=>update({value:e.target.value})}/><small>{t("exportTools.fixedValueHelp")}</small></label>}
        {selected.field==="mark"&&revision&&numberingDetection&&<div className="export-numbering-detection">
          {numberingDetection.total_positions>0?<>
            <p className="export-help">{t("exportTools.detection",{matched:numberingDetection.matching_positions,total:numberingDetection.total_positions})}</p>
            {numberingDetection.equally_matching_rules>1&&<p className="export-help">{t("exportTools.detectionAmbiguous")}</p>}
            {onUseDetectedNumbering&&<button type="button" className="export-quiet-button" onClick={onUseDetectedNumbering} disabled={disabled}>{t("exportTools.useDetected")}</button>}
          </>:<p className="export-help">{t("exportTools.noSourceMarks")}</p>}
        </div>}
        {(selected.field==="mark"||selected.field==="tip_code")&&<ExportSettings only={selected.field} options={options} onChange={onOptionsChange} revision={revision} preserveMarks={preserveMarks} firstNewMark={firstNewMark}/>}
        {selected.field==="change_code"&&changeCodes&&onChangeCodes&&<ChangeCodesEditor value={changeCodes} onChange={onChangeCodes}/>}
        {!["mark","tip_code","pile_size","x","y","tip_level","literal","source","change_code","technical_status","compression_status","tension_status"].includes(selected.field)&&<p className="export-help">{t("exportTools.noContentOptions")}</p>}
      </fieldset>}
    </div>
  </section>;
}
