import { pileConfigurationToken } from "../../../../core/pileConfigurationKey.ts";
import {useEffect,useMemo,useRef} from "react";
import { Button, Checkbox } from "../../../../openaec/react/src/index";
import {useTranslation} from "react-i18next";
import type {PileConfigurationKey} from "../../../../core/projectTypes.ts";
import {toggleIlpCandidate,ilpCandidateGroupState,toggleIlpCandidateGroup} from "../../../../domain/pile-plans/ilp-optimization/ilpCandidates.ts";

export default function IlpCandidateSelector({catalog,selected,onChange}:{catalog:PileConfigurationKey[];selected:PileConfigurationKey[];onChange:(selected:PileConfigurationKey[])=>void}) {
  const {t,i18n}=useTranslation("ribbon");
  const sizes=useMemo(()=>[...new Set([...catalog,...selected].map(c=>c.pile_size_mm))].sort((a,b)=>a-b),[catalog,selected]);
  const tips=useMemo(()=>[...new Set([...catalog,...selected].map(c=>c.pile_tip_level_mm))].sort((a,b)=>b-a),[catalog,selected]);
  const available=new Set(catalog.map(pileConfigurationToken)),checked=new Set(selected.map(pileConfigurationToken));
  const level=(mm:number)=>new Intl.NumberFormat(i18n.language,{maximumFractionDigits:3}).format(mm/1000);
  return <div className="ilp-candidate-selector">
    <p className="ilp-help oa-secondary">{t("ilp.customHelp")}</p>
    <div className="ilp-candidate-actions">
      <Button compact onClick={()=>onChange(catalog.map(c=>({...c})))}>{t("ilp.selectAllCandidates")}</Button>
      <Button compact onClick={()=>onChange([])}>{t("ilp.clearCandidates")}</Button>
      <span>{t("ilp.selectedCandidates",{count:checked.size})}</span>
    </div>
    {checked.size===0 && <p className="ilp-help oa-secondary">{t("ilp.chooseCandidates")}</p>}
    <div className="ilp-candidate-grid"><table className="oa-table" aria-label={t("ilp.allowedConfigurations")}>
      <thead><tr><th scope="col">{t("ilp.tip")}</th>{sizes.map(size=><th scope="col" key={size}><GroupCheckbox label={`${size} mm`}
          accessibleLabel={t("ilp.selectSizeCandidates",{value:size})}
          {...ilpCandidateGroupState(selected,catalog,"pile_size_mm",size)}
          onChange={enabled=>onChange(toggleIlpCandidateGroup(selected,catalog,"pile_size_mm",size,enabled))}/></th>)}</tr></thead>
      <tbody>{tips.map(tip=><tr key={tip}><th scope="row"><GroupCheckbox label={`${level(tip)} m`}
        accessibleLabel={t("ilp.selectTipCandidates",{value:level(tip)})}
        {...ilpCandidateGroupState(selected,catalog,"pile_tip_level_mm",tip)}
        onChange={enabled=>onChange(toggleIlpCandidateGroup(selected,catalog,"pile_tip_level_mm",tip,enabled))}/></th>{sizes.map(size=>{
        const configuration={pile_size_mm:size,pile_tip_level_mm:tip},key=pileConfigurationToken(configuration);
        const label=`${size} mm / ${level(tip)} m`;
        return <td key={size}>{available.has(key)||checked.has(key)
          ? <Checkbox label="" aria-label={label} checked={checked.has(key)}
              title={available.has(key)?label:t("ilp.unavailableCandidate")}
              onChange={e=>onChange(toggleIlpCandidate(selected,configuration,e.target.checked))}/>
          : <span aria-label={t("ilp.unavailableCandidate")}>—</span>}</td>;
      })}</tr>)}</tbody>
    </table></div>
  </div>;
}

function GroupCheckbox({label,accessibleLabel,checked,indeterminate,onChange}:{label:string;accessibleLabel:string;checked:boolean;indeterminate:boolean;onChange:(enabled:boolean)=>void}) {
  const input=useRef<HTMLSpanElement>(null);
  useEffect(()=>{const checkbox=input.current?.querySelector("input");if(checkbox)checkbox.indeterminate=indeterminate;},[indeterminate]);
  return <span ref={input}><Checkbox className="ilp-candidate-group" label={label} aria-label={accessibleLabel}
    aria-checked={indeterminate?"mixed":checked} checked={checked} onChange={e=>onChange(e.target.checked)}/></span>;
}
