import NumericValueInput from "../../template/NumericValueInput.tsx";
import {useTranslation} from "react-i18next";
import {Checkbox, Select} from "../../../openaec/react/src/index";
import type {ExportOptions,PileNumberingRule,NumberingDirection} from "../../../core/exportRevisionContract.ts";
import "./exports.css";

export default function ExportSettings({options,onChange,disabled=false,revision=false,firstNewMark,only,preserveMarks=true}: {
  options:ExportOptions;onChange:(options:ExportOptions)=>void;disabled?:boolean;revision?:boolean;firstNewMark?:number;only?:"mark"|"tip_code";preserveMarks?:boolean;
}){
  const {t}=useTranslation("common");
  const preserving=revision&&preserveMarks&&options.mark.revision_mode!=="renumber";
  const rule=options.mark.rule;
  const setRule=(patch:Partial<PileNumberingRule>)=>onChange({...options,mark:{...options.mark,rule:{...rule,...patch}}});
  const field=(label:string,children:React.ReactNode)=><label className="oa-label export-field"><span>{t(`exportTools.${label}`)}</span>{children}</label>;
  const content=<fieldset disabled={disabled}>
    {only!=="tip_code"&&(preserving?<p>{t("exportTools.retainedMarks",{number:firstNewMark??"…"})}</p>:!revision&&!only?
      <Checkbox label={t("exportTools.markEnabled")} checked={options.mark.enabled} onChange={e=>onChange({...options,mark:{...options.mark,enabled:e.target.checked}})}/>:null)}
    {revision&&only!=="tip_code"&&<Select label={t("exportTools.markRevisionMode")} value={options.mark.revision_mode??"preserve"}
      options={[{value:"preserve",label:t("exportTools.preserveNumbering")},{value:"renumber",label:t("exportTools.renumberPlan")}]}
      onChange={e=>onChange({...options,mark:{...options.mark,revision_mode:e.target.value as "preserve"|"renumber"}})}/>}
    {revision&&options.mark.revision_mode==="renumber"&&only!=="tip_code"&&<p className="export-help">{t("exportTools.renumberHelp")}</p>}
    {(only==="mark"||(!only&&(revision||options.mark.enabled)))&&<div className="export-controls-grid">
      {!preserving&&field("firstMark",<NumericValueInput integer min={1} max={4294967295} step={1} value={options.mark.start} onNumberChange={start=>onChange({...options,mark:{...options.mark,start}})}/>)}
      <Select label={t("exportTools.axis")} value={rule.axis} options={[{value:"y",label:t("exportTools.rows")},{value:"x",label:t("exportTools.columns")}]}
        onChange={e=>setRule({axis:e.target.value as "x"|"y"})}/>
      <Select label={t("exportTools.xDirection")} value={rule.x_direction} options={[{value:"ascending",label:t("exportTools.leftRight")},{value:"descending",label:t("exportTools.rightLeft")}]}
        onChange={e=>setRule({x_direction:e.target.value as NumberingDirection})}/>
      <Select label={t("exportTools.yDirection")} value={rule.y_direction} options={[{value:"descending",label:t("exportTools.topBottom")},{value:"ascending",label:t("exportTools.bottomTop")}]}
        onChange={e=>setRule({y_direction:e.target.value as NumberingDirection})}/>
      {field(rule.axis==="y"?"rowTolerance":"columnTolerance",<NumericValueInput min={0} step="any" value={rule.tolerance_mm} onNumberChange={tolerance_mm=>setRule({tolerance_mm})}/>)}
    </div>}
    {!only&&!revision&&<Checkbox label={t("exportTools.codeEnabled")} checked={options.tip_code.enabled} onChange={e=>onChange({...options,tip_code:{...options.tip_code,enabled:e.target.checked}})}/>}
    {(only==="tip_code"||(!only&&(revision||options.tip_code.enabled)))&&<div className="export-controls-grid">
      <Select label={t("exportTools.codeSequence")} value={options.tip_code.sequence} options={[{value:"letters",label:"A, B, C, …"},{value:"numbers",label:"1, 2, 3, …"}]}
        onChange={e=>onChange({...options,tip_code:{...options.tip_code,enabled:true,sequence:e.target.value as "letters"|"numbers"}})}/>
      <Select label={t("exportTools.codeDirection")} value={options.tip_code.direction} options={[{value:"descending",label:t("exportTools.highLow")},{value:"ascending",label:t("exportTools.lowHigh")}]}
        onChange={e=>onChange({...options,tip_code:{...options.tip_code,enabled:true,direction:e.target.value as NumberingDirection}})}/>
    </div>}
  </fieldset>;
  return only?<div className="export-numbering-options">{content}</div>:<details className="export-settings"><summary>{t("exportTools.numberingSettings")}</summary>{content}</details>;
}
