export interface BrowserRecentProjectCache {
  read(key:string):Promise<string|null>;
  write(key:string,contents:string):Promise<void>;
  remove(key:string):Promise<void>;
}
/** IFCPP copies are separate from preferences and unsaved-session recovery. */
export function createBrowserRecentProjectCache():BrowserRecentProjectCache {
  let pending:Promise<IDBDatabase>|null=null;
  const database=()=>{
    if(!pending)pending=new Promise<IDBDatabase>((resolve,reject)=>{
      if(!globalThis.indexedDB){reject(new Error("IndexedDB unavailable"));return;}
      const request=indexedDB.open("pile-plan-studio-recent-projects",1);
      request.onupgradeneeded=()=>request.result.createObjectStore("projects");
      request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();pending=null;};resolve(request.result);};
      request.onerror=()=>reject(request.error??new Error("Recent project storage unavailable"));
      request.onblocked=()=>reject(new Error("Recent project storage blocked"));
    }).catch(error=>{pending=null;throw error;});
    return pending;
  };
  const mutate=async(key:string,contents?:string)=>{
    const db=await database();await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction("projects","readwrite"),store=tx.objectStore("projects");
      if(contents===undefined)store.delete(key);else store.put(contents,key);
      tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error??new Error("Recent project storage failed"));
    });
  };
  return {async read(key){const db=await database();return new Promise<string|null>((resolve,reject)=>{const request=db.transaction("projects","readonly").objectStore("projects").get(key);request.onsuccess=()=>resolve(typeof request.result==="string"?request.result:null);request.onerror=()=>reject(request.error);});},write:(key,text)=>mutate(key,text),remove:key=>mutate(key)};
}
export async function browserRecentProjectKey(name:string,contents:string):Promise<string>{
  const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`${name}\0${contents}`));
  return `browser:${Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,"0")).join("")}`;
}
