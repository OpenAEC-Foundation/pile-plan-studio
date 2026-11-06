import NumericValueInput from "../../template/NumericValueInput.tsx";
import {useId} from "react";
import {useTranslation} from "react-i18next";
import ThemedNumberInput from "../../template/ThemedNumberInput.tsx";
import { Button, Heading, Status } from "../../../openaec/react/src/index";
import "./locationMatchingEntry.css";

type Props={
  summary?:string;help:string;reviewed?:boolean;disabled?:boolean;onOpen:()=>void;
  tolerance:string|number;onToleranceChange:(value:string)=>void;
};

export default function LocationMatchingEntry({summary,help,reviewed=false,disabled=false,onOpen,tolerance,onToleranceChange}:Props){
  const {t}=useTranslation("common");const titleId=useId();
  return <section className="location-matching-entry" aria-labelledby={titleId}>
    <div className="matching-entry-heading"><Heading id={titleId}>{t("locationMatchingEntry.title")}</Heading>
      <Status tone={reviewed ? "success" : "info"}>{t(reviewed?"locationMatchingEntry.confirmed":"locationMatchingEntry.unreviewed")}</Status></div>
    {summary&&<p className="matching-entry-summary">{summary}</p>}
    <p>{help}</p>
    <div className="matching-entry-controls">
      <Button disabled={disabled} onClick={onOpen}>{t("locationMatchingEntry.open")}</Button>
      <label><span>{t("exportTools.matchTolerance")}</span><span className="matching-entry-tolerance">{typeof tolerance==="number"?<NumericValueInput min="0" step="0.1" value={tolerance} disabled={disabled} onNumberChange={value=>onToleranceChange(String(value))}/>:<ThemedNumberInput min="0" step="0.1" value={tolerance} disabled={disabled} onValueChange={onToleranceChange}/>}</span></label>
    </div>
    <small>{t("locationMatchingEntry.toleranceHelp")}</small>
  </section>;
}
