import {normalizeRecentFiles,recentFileIdentity,recentFileType,withRecentFile,type RecentFile} from "../../domain/project/recentProjects.ts";
import type {BrowserRecentProjectCache} from "../../domain/project/browserRecentProjects.ts";
type Options={readMetadata:()=>Promise<unknown>;writeMetadata:(files:RecentFile[])=>Promise<void>;cache:BrowserRecentProjectCache;now?:()=>number};
export function createRecentProjectController({readMetadata,writeMetadata,cache,now=Date.now}:Options){
  let files:RecentFile[]=[],loaded=false,loading:Promise<void>|null=null,chain=Promise.resolve();
  const listeners=new Set<()=>void>();
  const publish=()=>listeners.forEach(listener=>listener());
  const ready=()=>loading??=readMetadata().then(value=>{files=normalizeRecentFiles(value);loaded=true;publish();});
  const enqueue=(operation:()=>Promise<void>)=>{const result=chain.then(async()=>{await ready();await operation();});chain=result.catch(()=>{});return result;};
  const remember=async(file:RecentFile)=>{
    const previous=files,next=withRecentFile(files,file);
    await writeMetadata(next);files=next;publish();
    for(const old of previous)if(old.storage==="browser"&&!next.some(item=>recentFileIdentity(item)===recentFileIdentity(old)))await cache.remove(old.path).catch(()=>{});
  };
  return {
    ready,getSnapshot:()=>files,isLoaded:()=>loaded,
    subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
    rememberDesktop(path:string){return enqueue(()=>remember({path,name:path.split(/[/\\]/).pop()??path,type:recentFileType(path),timestamp:now()}));},
    rememberBrowser(key:string,name:string,contents:string){return enqueue(async()=>{await cache.write(key,contents);await remember({path:key,name,type:"project",timestamp:now(),storage:"browser"});});},
    async readBrowser(key:string){await ready();await chain;return files.some(file=>file.path===key&&file.storage==="browser")?cache.read(key):null;},
    remove(path:string){return enqueue(async()=>{const entry=files.find(file=>file.path===path);if(entry?.storage==="browser")await cache.remove(path);const next=files.filter(file=>file.path!==path);await writeMetadata(next);files=next;publish();});},
    clear(){return enqueue(async()=>{for(const entry of files)if(entry.storage==="browser")await cache.remove(entry.path);await writeMetadata([]);files=[];publish();});},
  };
}
