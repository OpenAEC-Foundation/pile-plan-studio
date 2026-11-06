export interface RecentFile {
  path: string;
  name: string;
  type: "report" | "ifc" | "project" | "unknown";
  timestamp: number;
  storage?: "browser";
  tenant?: string;
}
export const MAX_RECENT_PROJECTS = 10;
export function recentFileType(path:string):RecentFile["type"] {
  const ext=path.split(".").pop()?.toLowerCase();
  return ext==="ifcpp"||ext==="oaecproj"?"project":ext==="ifc"||ext==="ifcx"?"ifc":ext==="oaec"||ext==="json"?"report":"unknown";
}
export function recentFileIdentity(file:Pick<RecentFile,"path"|"storage">):string {
  if(file.storage==="browser")return file.path;
  const path=file.path.replace(/\\/g,"/");
  return /^[a-z]:\//i.test(path)||path.startsWith("//")?path.toLowerCase():path;
}
export function normalizeRecentFiles(value:unknown):RecentFile[] {
  if(!Array.isArray(value))return [];
  const result:RecentFile[]=[],seen=new Set<string>();
  for(const item of value){
    if(!item||typeof item!=="object"||typeof item.path!=="string"||!item.path||!Number.isFinite(item.timestamp))continue;
    const file:RecentFile={path:item.path,name:typeof item.name==="string"&&item.name?item.name:item.path.split(/[/\\]/).pop()!,timestamp:item.timestamp,type:recentFileType(item.path),...(item.storage==="browser"?{storage:"browser" as const,type:"project" as const}:{})};
    const key=recentFileIdentity(file);if(seen.has(key))continue;seen.add(key);result.push(file);
    if(result.length===MAX_RECENT_PROJECTS)break;
  }
  return result;
}
export function withRecentFile(files:RecentFile[],file:RecentFile):RecentFile[]{
  const key=recentFileIdentity(file);
  return [file,...files.filter(old=>recentFileIdentity(old)!==key)].slice(0,MAX_RECENT_PROJECTS);
}
