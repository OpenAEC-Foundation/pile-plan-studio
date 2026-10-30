import type {ReactNode} from "react";
import {useTranslation} from "react-i18next";
import "./sourceColumnEditor.css";

type Column={column:number;header:string;meaning:string;empty?:boolean};
type Props={columns:Column[];selected:number;onSelect:(column:number)=>void;children:ReactNode};

/** Shared selection surface; each import workflow owns its mapping semantics. */
export default function SourceColumnEditor({columns,selected,onSelect,children}:Props){
 const {t}=useTranslation("common");
 return <div className="source-column-editor">
  <div className="source-column-list" role="group" aria-label={t("tableImport.columns")}>{columns.map(c=><button key={c.column} type="button" className={selected===c.column?"is-selected":""} aria-pressed={selected===c.column} onClick={()=>onSelect(c.column)}>
   <span className="source-column-number">{c.column}</span><span><strong>{c.header}</strong><small>{c.meaning}</small></span>{c.empty&&<span className="source-column-empty">{t("tableImport.empty")}</span>}
  </button>)}</div>
  {children}
 </div>;
}
