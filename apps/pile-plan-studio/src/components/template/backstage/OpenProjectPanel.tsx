import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button, EmptyState, Heading, IconButton, MonoLabel, Tile } from "../../../openaec/react/src/index";
import type { RecentFile } from "../../../hooks/useRecentFiles";
import BlueprintIcon from "../BlueprintIcon";

interface Props {
  recentFiles: RecentFile[];
  onOpenFile: (path: string) => void;
  onRemoveFile: (path: string) => void;
  onClearAll: () => void;
  onOpenProjectFile: (file: File) => Promise<void>;
  isDesktop: boolean;
  onChooseDesktopProject: () => Promise<void>;
  onOpenSampleProject: () => Promise<void>;
}

export default function OpenProjectPanel({recentFiles,onOpenFile,onRemoveFile,onClearAll,onOpenProjectFile,
  isDesktop,onChooseDesktopProject,onOpenSampleProject}: Props) {
  const {t,i18n}=useTranslation("backstage");
  const input=useRef<HTMLInputElement>(null);
  const formatDate=(timestamp:number)=>{
    const minutes=Math.max(0,Math.floor((Date.now()-timestamp)/60000));
    if(minutes<1)return t("openPanel.justNow");
    const relative=new Intl.RelativeTimeFormat(i18n.resolvedLanguage,{numeric:"auto"});
    if(minutes<60)return relative.format(-minutes,"minute");
    if(minutes<1440)return relative.format(-Math.floor(minutes/60),"hour");
    if(minutes<10080)return relative.format(-Math.floor(minutes/1440),"day");
    return new Intl.DateTimeFormat(i18n.resolvedLanguage).format(timestamp);
  };
  return <section className="bs-open-panel" aria-label={t("openPanel.title")}>
    <Heading level="page">{t("openPanel.title")}</Heading>
    <p className="backstage-panel-intro">{t("openPanel.intro")}</p>
    <div className="bs-open-project-options">
      <Tile icon="file.open" title={t("openPanel.chooseProject")} text={t("openPanel.chooseProjectDesc")}
        onClick={()=>{if(isDesktop)void onChooseDesktopProject();else input.current?.click();}}/>
      {!isDesktop&&<input ref={input} hidden type="file" aria-label={t("openPanel.chooseProject")}
        accept=".ifcpp,application/json" onChange={event=>{
          const file=event.currentTarget.files?.[0];
          event.currentTarget.value="";
          if(file)void onOpenProjectFile(file);
        }}/>}
      <Tile icon="file.type-project" title={t("openPanel.sampleProject")} text={t("openPanel.sampleProjectDesc")}
        onClick={()=>void onOpenSampleProject()}/>
    </div>
    {!isDesktop&&<p className="oa-secondary bs-recent-copy-help">{t("openPanel.localCopiesHelp")}</p>}
    <div className="bs-open-recent-heading">
      <MonoLabel>{t("openPanel.recent")}</MonoLabel>
      {recentFiles.length>0&&<Button kind="quiet" compact onClick={onClearAll}>{t("openPanel.clearAll")}</Button>}
    </div>
    {recentFiles.length===0?<EmptyState icon="file.open" title={t("openPanel.noRecent")}/>:<ul className="bs-recent-list">
      {recentFiles.map(file=><li key={file.path} className="bs-recent-item">
        <Button kind="quiet" className="bs-recent-open" aria-label={t("openPanel.openRecent",{name:file.name})}
          data-tooltip={file.storage==="browser"?t("openPanel.localCopy"):file.path} onClick={()=>onOpenFile(file.path)}>
          <BlueprintIcon id={file.type==="ifc"?"file.type-ifc":file.type==="project"?"file.type-project":"file.type-other"}/>
          <span className="bs-recent-info"><span className="bs-recent-name">{file.name}</span>
            <span className="bs-recent-path">{file.storage==="browser"?t("openPanel.localCopy"):file.path}</span></span>
          <span className="bs-recent-date">{formatDate(file.timestamp)}</span>
        </Button>
        <IconButton small icon="ui.close" label={t("openPanel.removeFile",{name:file.name})} data-oa-tip={undefined}
          data-tooltip={t("openPanel.removeFile",{name:file.name})} onClick={()=>onRemoveFile(file.path)}/>
      </li>)}
    </ul>}
  </section>;
}
