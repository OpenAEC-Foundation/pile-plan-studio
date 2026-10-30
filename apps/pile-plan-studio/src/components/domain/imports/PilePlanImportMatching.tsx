import {useEffect,useRef} from "react";
import {useTranslation} from "react-i18next";
import LocationMatchingWorkspace from "../location-matching/LocationMatchingWorkspace.tsx";
import {previewPilePlanImportCore} from "../../../core/pilePlanCoreClient.ts";
import {getImportFileFormat} from "../../../core/importFiles.ts";
import type {PilePlanImportDraft} from "../../../domain/imports/pilePlanImportModel.ts";
import type {PilePlanImportPreview,PilePlanImportRequest} from "../../../core/pilePlanImportContract.ts";
import type {LocationDecisions,LocationBulkAction} from "../../../core/exportRevisionContract.ts";
type Props=Pick<PilePlanImportRequest,"loadPoints"|"cpts"|"availablePileConfigurations">&{draft:PilePlanImportDraft<File>;result:PilePlanImportPreview;onConfirm:(decisions:LocationDecisions,toleranceMm:number)=>void;onCancel:()=>void};
export default function PilePlanImportMatching({draft,result,loadPoints,cpts,availablePileConfigurations,onConfirm,onCancel}:Props){
 const {t}=useTranslation("common");const active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 async function evaluate(locationDecisions:LocationDecisions,bulkAction?:LocationBulkAction,toleranceMm=Number(draft.coordinateToleranceMm)){
  const file=draft.file!;const bytes=new Uint8Array(await file.arrayBuffer());
  if(!active.current)throw new Error("invalid_location_mapping");
  const preview=await previewPilePlanImportCore({fileName:file.name,format:getImportFileFormat(file.name)!,bytes,profile:draft.requestedProfile,
   options:{importPileAssignments:draft.importPileAssignments,importCptSelections:draft.importCptSelections,coordinateToleranceMm:toleranceMm,table:draft.table,locationDecisions,bulkAction},
   loadPoints,cpts,availablePileConfigurations});
  if(!active.current||!preview.matching)throw new Error("invalid_location_mapping");
  return preview.matching;
 }
 return <LocationMatchingWorkspace mode="import" initial={result.matching!} toleranceMm={Number(draft.coordinateToleranceMm)}
  oldLocations={loadPoints.map(p=>({...p,source_id:p.id}))} newLocations={(result.sourceLocations??[]).map(p=>({...p,label:t(p.source_id==null?"pilePlanMatching.rowOnly":"pilePlanMatching.rowId",{row:p.row,id:p.source_id})}))}
  evaluate={evaluate} onConfirm={onConfirm} onCancel={onCancel}/>;
}
