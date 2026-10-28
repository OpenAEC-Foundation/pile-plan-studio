import {useTranslation} from "react-i18next";
import type {ExportTable,TipLevelCode} from "../../../core/exportRevisionContract.ts";
import "./exports.css";

export default function ExportTablePreview({table,tipCodes=[]}:{table:ExportTable;tipCodes?:TipLevelCode[]}){
  const {t}=useTranslation("common");
  return <section className="export-table-preview" aria-label={t("exportTools.tablePreview")}>
    <div className="export-preview-heading"><strong>{t("exportTools.tablePreview")}</strong><span>{t("exportTools.rowCount",{count:table.rows.length})}</span></div>
    <div className="export-table-overflow"><table><thead><tr>{table.headers.map((header,i)=><th key={i}>{header}</th>)}</tr></thead>
      <tbody>{table.rows.slice(0,12).map((row,i)=><tr key={i}>{row.map((value,j)=><td key={j}>{value==null?"":typeof value==="boolean"?t(value?"exportTools.yes":"exportTools.no"):String(value)}</td>)}</tr>)}</tbody>
    </table></div>
    {table.rows.length>12&&<p className="export-help">{t("exportTools.previewLimit",{count:12})}</p>}
    {tipCodes.length>0&&<p className="export-help">{t("exportTools.codeTable")}: {tipCodes.map(item=>`${(item.level_mm/1000).toLocaleString(undefined,{maximumFractionDigits:3})} m = ${item.code}`).join("; ")}</p>}
  </section>;
}
