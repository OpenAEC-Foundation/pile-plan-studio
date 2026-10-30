import NumericValueInput from "../../template/NumericValueInput.tsx";
import {useTranslation} from "react-i18next";
import type {ExportOptions,PileNumberingRule,NumberingDirection} from "../../../core/exportRevisionContract.ts";
import "./exports.css";

export default function ExportSettings({options,onChange,disabled=false,revision=false,firstNewMark,only,preserveMarks=true}: {
  options:ExportOptions;onChange:(options:ExportOptions)=>void;disabled?:boolean;revision?:boolean;firstNewMark?:number;only?:"mark"|"tip_code";preserveMarks?:boolean;
}){
  const {t}=useTranslation("common");
  const preserving=revision&&preserveMarks&&options.mark.revision_mode!=="renumber";
  const rule=options.mark.rule;
  const setRule=(patch:Partial<PileNumberingRule>)=>onChange({...options,mark:{...options.mark,rule:{...rule,...patch}}});
  const field=(label:string,children:React.ReactNode)=><label className="export-field"><span>{t(`exportTools.${label}`)}</span>{children}</label>;
  const content=<fieldset disabled={disabled}>
      {only!=="tip_code"&&(preserving?<p>{t("exportTools.retainedMarks",{number:firstNewMark??"…"})}</p>:!revision&&!only?<label className="export-check"><input type="checkbox" checked={options.mark.enabled}
        onChange={e=>onChange({...options,mark:{...options.mark,enabled:e.target.checked}})}/>{t("exportTools.markEnabled")}</label>:null)}
      {revision&&only!=="tip_code"&&field("markRevisionMode",<select value={options.mark.revision_mode??"preserve"} onChange={e=>onChange({...options,mark:{...options.mark,revision_mode:e.target.value as "preserve"|"renumber"}})}>
        <option value="preserve">{t("exportTools.preserveNumbering")}</option><option value="renumber">{t("exportTools.renumberPlan")}</option></select>)}
      {revision&&options.mark.revision_mode==="renumber"&&only!=="tip_code"&&<p className="export-help">{t("exportTools.renumberHelp")}</p>}
      {(only==="mark"||(!only&&(revision||options.mark.enabled)))&&<div className="export-controls-grid">
        {!preserving&&field("firstMark",<NumericValueInput integer min={1} max={4294967295} step={1} value={options.mark.start} onNumberChange={start=>onChange({...options,mark:{...options.mark,start}})}/>)}
        {field("axis",<select value={rule.axis} onChange={e=>setRule({axis:e.target.value as "x"|"y"})}><option value="y">{t("exportTools.rows")}</option><option value="x">{t("exportTools.columns")}</option></select>)}
        {field("xDirection",<select value={rule.x_direction} onChange={e=>setRule({x_direction:e.target.value as NumberingDirection})}><option value="ascending">{t("exportTools.leftRight")}</option><option value="descending">{t("exportTools.rightLeft")}</option></select>)}
        {field("yDirection",<select value={rule.y_direction} onChange={e=>setRule({y_direction:e.target.value as NumberingDirection})}><option value="descending">{t("exportTools.topBottom")}</option><option value="ascending">{t("exportTools.bottomTop")}</option></select>)}
        {field(rule.axis==="y"?"rowTolerance":"columnTolerance",<NumericValueInput min={0} step="any" value={rule.tolerance_mm} onNumberChange={tolerance_mm=>setRule({tolerance_mm})}/>)}
      </div>}
      {!only&&!revision&&<label className="export-check"><input type="checkbox" checked={options.tip_code.enabled} onChange={e=>onChange({...options,tip_code:{...options.tip_code,enabled:e.target.checked}})}/>{t("exportTools.codeEnabled")}</label>}
      {(only==="tip_code"||(!only&&(revision||options.tip_code.enabled)))&&<div className="export-controls-grid">
        {field("codeSequence",<select value={options.tip_code.sequence} onChange={e=>onChange({...options,tip_code:{...options.tip_code,enabled:true,sequence:e.target.value as "letters"|"numbers"}})}><option value="letters">A, B, C, …</option><option value="numbers">1, 2, 3, …</option></select>)}
        {field("codeDirection",<select value={options.tip_code.direction} onChange={e=>onChange({...options,tip_code:{...options.tip_code,enabled:true,direction:e.target.value as NumberingDirection}})}><option value="descending">{t("exportTools.highLow")}</option><option value="ascending">{t("exportTools.lowHigh")}</option></select>)}
      </div>}
    </fieldset>;
  return only?<div className="export-numbering-options">{content}</div>:<details className="export-settings"><summary>{t("exportTools.numberingSettings")}</summary>{content}</details>;
}
