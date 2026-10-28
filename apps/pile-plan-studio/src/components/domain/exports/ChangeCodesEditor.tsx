import {useTranslation} from "react-i18next";
import type {ChangeCodeOptions} from "../../../core/exportRevisionContract.ts";
type Kind="moved"|"size"|"level"|"added"|"removed";
export default function ChangeCodesEditor({value,onChange,disabled=false}:{value:ChangeCodeOptions;onChange:(value:ChangeCodeOptions)=>void;disabled?:boolean}){
  const {t}=useTranslation("common");
  return <fieldset className="change-code-options" disabled={disabled}>
    <legend>{t("exportTools.changeCodes")}</legend>
    <p className="export-help">{t("exportTools.changeCodesHelp")}</p>
    {(["moved","size","level","added","removed"] as Kind[]).map(kind=><div className="change-code-row" key={kind}>
      <label><input type="checkbox" checked={value[kind].enabled} onChange={e=>onChange({...value,[kind]:{...value[kind],enabled:e.target.checked}})}/>{t(`exportTools.changeKinds.${kind}`)}</label>
      <input type="text" aria-label={t("exportTools.changeCodeFor",{name:t(`exportTools.changeKinds.${kind}`)})} disabled={!value[kind].enabled} value={value[kind].text}
        onChange={e=>onChange({...value,[kind]:{...value[kind],text:e.target.value}})}/>
    </div>)}
    <div className="export-controls-grid"><label className="export-field"><span>{t("exportTools.movementThreshold")}</span><input type="number" min={0} step="any" value={value.movement_threshold_mm} onChange={e=>onChange({...value,movement_threshold_mm:Number(e.target.value)})}/></label>
      <label className="export-field"><span>{t("exportTools.codeSeparator")}</span><input type="text" value={value.separator} onChange={e=>onChange({...value,separator:e.target.value})}/></label></div>
  </fieldset>;
}
