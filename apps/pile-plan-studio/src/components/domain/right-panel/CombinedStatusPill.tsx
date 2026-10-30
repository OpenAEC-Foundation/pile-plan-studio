import {useTranslation} from "react-i18next";
import type {CombinedOptionStatus} from "../../../domain/pile-options/combinedStatus.ts";
import type {ResistanceDirection} from "../../../core/projectTypes.ts";
export default function CombinedStatusPill({status,onSwitch}:{status:CombinedOptionStatus;onSwitch:(mode:ResistanceDirection)=>void}){
 const {t}=useTranslation("common");const label=t(`loadDirection.combined.${status.key}`);
 return <button type="button" className={`status-pill combined-status-switch ${status.className}`} title={t(`loadDirection.show_${status.switchTo}`)} onKeyDown={event=>event.stopPropagation()} onPointerDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();if(status.switchTo)onSwitch(status.switchTo);}}>{label}</button>;
}
