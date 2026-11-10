import {useEffect,useState,useSyncExternalStore} from "react";
import {getSetting,setSetting} from "../store";
import {createRecentProjectController} from "../app/project/recentProjectController.ts";
import {createBrowserRecentProjectCache} from "../domain/project/browserRecentProjects.ts";
export type {RecentFile} from "../domain/project/recentProjects.ts";

/** AppSession owns one instance; menu views receive its current list and actions. */
export function useRecentFiles(enabled = true){
  const [controller]=useState(()=>createRecentProjectController({readMetadata:()=>getSetting<unknown>("recentFiles",[]),writeMetadata:files=>setSetting("recentFiles",files,{requirePersistence:true}),cache:createBrowserRecentProjectCache()}));
  const recentFiles=useSyncExternalStore(controller.subscribe,controller.getSnapshot);
  useEffect(()=>{if (enabled) void controller.ready().catch(()=>{});},[controller,enabled]);
  return {recentFiles,loaded:controller.isLoaded(),addRecentFile:controller.rememberDesktop,rememberBrowser:controller.rememberBrowser,readBrowser:controller.readBrowser,removeRecentFile:controller.remove,clearRecentFiles:controller.clear};
}
