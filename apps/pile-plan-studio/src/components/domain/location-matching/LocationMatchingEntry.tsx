import NumericValueInput from "../../template/NumericValueInput.tsx";
import {useId} from "react";
import {useTranslation} from "react-i18next";
import ThemedNumberInput from "../../template/ThemedNumberInput.tsx";
import "./locationMatchingEntry.css";

type Props={
  summary?:string;help:string;reviewed?:boolean;disabled?:boolean;onOpen:()=>void;
  tolerance:string|number;onToleranceChange:(value:string)=>void;
};

export default function LocationMatchingEntry({summary,help,reviewed=false,disabled=false,onOpen,tolerance,onToleranceChange}:Props){
  const {t}=useTranslation("common");const titleId=useId();
  return <section className="location-matching-entry" aria-labelledby={titleId}>
    <div className="matching-entry-heading"><h3 id={titleId}>{t("locationMatchingEntry.title")}</h3>
      <span className={reviewed?"matching-entry-confirmed":""}>{t(reviewed?"locationMatchingEntry.confirmed":"locationMatchingEntry.unreviewed")}</span></div>
    {summary&&<p className="matching-entry-summary">{summary}</p>}
    <p>{help}</p>
    <div className="matching-entry-controls">
      <button type="button" disabled={disabled} onClick={onOpen}>{t("locationMatchingEntry.open")}</button>
      <label><span>{t("exportTools.matchTolerance")}</span><span className="matching-entry-tolerance">{typeof tolerance==="number"?<NumericValueInput min="0" step="0.1" value={tolerance} disabled={disabled} onNumberChange={value=>onToleranceChange(String(value))}/>:<ThemedNumberInput min="0" step="0.1" value={tolerance} disabled={disabled} onValueChange={onToleranceChange}/>}</span></label>
    </div>
    <small>{t("locationMatchingEntry.toleranceHelp")}</small>
  </section>;
}
