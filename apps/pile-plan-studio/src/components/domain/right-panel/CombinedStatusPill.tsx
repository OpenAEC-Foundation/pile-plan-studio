import {useTranslation} from "react-i18next";
import type {CombinedOptionStatus} from "../../../domain/pile-options/combinedStatus.ts";
import type {ResistanceDirection} from "../../../core/projectTypes.ts";
import { Button } from "../../../openaec/react/src/index";
import PileOptionStatus from "./PileOptionStatus.tsx";
export default function CombinedStatusPill({status,onSwitch}:{status:CombinedOptionStatus;onSwitch:(mode:ResistanceDirection)=>void}){
 const {t}=useTranslation("common");const label=t(`loadDirection.combined.${status.key}`);
 return <Button compact kind="quiet" className={`status-pill combined-status-switch ${status.className}`} title={t(`loadDirection.show_${status.switchTo}`)} onKeyDown={event=>event.stopPropagation()} onPointerDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();if(status.switchTo)onSwitch(status.switchTo);}}><PileOptionStatus className={status.className}>{label}</PileOptionStatus></Button>;
}
