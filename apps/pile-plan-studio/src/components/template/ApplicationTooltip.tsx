import {useEffect,useId,useLayoutEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {elementLayoutScale} from "../../domain/settings/uiBaseline.ts";
import "./ApplicationTooltip.css";

type VisibleTooltip={element:HTMLElement;text:string};

function repeatsVisibleText(element:HTMLElement,text:string){
 const normalize=(value:string)=>value.replace(/\s+/g," ").trim().toLocaleLowerCase();
 const expected=normalize(text);
 const candidates=[element,...element.querySelectorAll<HTMLElement>("span,strong,small,label,button,a,td,th,p")];
 return candidates.some(candidate=>{
  const style=getComputedStyle(candidate);
  if(style.display==="none"||style.visibility==="hidden")return false;
  if(normalize(candidate.innerText??candidate.textContent??"")!==expected)return false;
  for(let node:HTMLElement|null=candidate;node&&element.contains(node);node=node.parentElement){
   const css=getComputedStyle(node);
   if((css.overflowX!=="visible"||css.overflow==="hidden")&&node.clientWidth>0&&node.scrollWidth>node.clientWidth+1)return false;
   if((css.overflowY!=="visible"||css.overflow==="hidden")&&node.clientHeight>0&&node.scrollHeight>node.clientHeight+1)return false;
  }
  return true;
 });
}

/** Adapts existing title help to one immediate, accessible application layer. */
export default function ApplicationTooltip(){
 const id=useId(),box=useRef<HTMLDivElement>(null);
 const [visible,setVisible]=useState<VisibleTooltip|null>(null),[position,setPosition]=useState({left:0,top:0});
 useEffect(()=>{
  let hovered:HTMLElement|null=null,focused:HTMLElement|null=null,pressed=false,suspended=false;
  let dismissed:HTMLElement|null=null;
  let active:{element:HTMLElement;text:string;nativeTitle:string|null;label:string|null;cursor:string;observer:MutationObserver}|null=null;
  const restore=()=>{
   if(!active)return;
   const {element,nativeTitle,label,cursor,observer}=active;observer.disconnect();
   if(nativeTitle!==null&&!element.hasAttribute("title"))element.setAttribute("title",nativeTitle);
   const descriptions=(element.getAttribute("aria-describedby")??"").split(/\s+/).filter(token=>token&&token!==id);
   if(descriptions.length)element.setAttribute("aria-describedby",descriptions.join(" "));else element.removeAttribute("aria-describedby");
   if(label!==null&&element.getAttribute("aria-label")===label)element.removeAttribute("aria-label");
   element.style.cursor=cursor;active=null;
  };
  const resolve=(target:EventTarget|null)=>{
   let element=target instanceof Element?target:target instanceof Node?target.parentElement:null;
   while(element){
    if(element instanceof HTMLElement&&(element.hasAttribute("data-tooltip")||element.hasAttribute("title")||element===active?.element))return element;
    element=element.parentElement;
   }
   return null;
  };
  const show=()=>{
   const element=hovered??focused;
   if(pressed||suspended||(element&&element===dismissed)){restore();setVisible(null);return;}
   if(element===active?.element)return;
   restore();
   const text=element?.getAttribute("data-tooltip")??element?.getAttribute("title");
   if(!element||!text?.trim()||!element.isConnected){setVisible(null);return;}
   const nativeTitle=element.getAttribute("title");
   // Preserve accessible names that previously relied solely on a native title.
   const label=!element.hasAttribute("aria-label")&&!element.hasAttribute("aria-labelledby")&&!element.textContent?.trim()?text:null;
   if(label!==null)element.setAttribute("aria-label",label);
   const cursor=element.style.cursor;
   if(getComputedStyle(element).cursor==="help")element.style.cursor="default";
   element.removeAttribute("title");
   const present=(value:string)=>{
    const informative=!!value.trim()&&!repeatsVisibleText(element,value);
    const descriptions=(element.getAttribute("aria-describedby")??"").split(/\s+/).filter(token=>token&&token!==id);
    if(informative)descriptions.push(id);
    if(descriptions.length)element.setAttribute("aria-describedby",descriptions.join(" "));else element.removeAttribute("aria-describedby");
    setVisible(informative?{element,text:value}:null);
   };
   const observer=new MutationObserver(()=>{
    if(!active||active.element!==element)return;
    const title=element.getAttribute("title");
    if(title!==null){active.nativeTitle=title;element.removeAttribute("title");}
    const next=element.getAttribute("data-tooltip")??title;
    if(next!==null&&next!==active.text){active.text=next;present(next);}
   });
   active={element,text,nativeTitle,label,cursor,observer};
   observer.observe(element,{attributes:true,attributeFilter:["title","data-tooltip"]});
   const rect=element.getBoundingClientRect(),scale=elementLayoutScale(document.documentElement);
   setPosition({left:rect.left/scale,top:(rect.bottom+6)/scale});present(text);
  };
  const over=(event:Event)=>{if((event as MouseEvent).buttons){dismiss();return;}hovered=resolve(event.target);show();};
  const out=(event:Event)=>{
   const related=(event as MouseEvent).relatedTarget;
   if(hovered&&related instanceof Node&&hovered.contains(related))return;
   if(dismissed&&!(related instanceof Node&&dismissed.contains(related)))dismissed=null;
   hovered=null;show();
  };
  const focus=(event:Event)=>{focused=resolve(event.target);show();};
  const blur=()=>{focused=null;show();};
  const dismiss=()=>{hovered=null;focused=null;restore();setVisible(null);};
  const press=(event:Event)=>{pressed=true;suspended=true;dismissed=resolve(event.target);dismiss();};
  const release=()=>{pressed=false;};
  const move=(event:Event)=>{if((event as PointerEvent).buttons){pressed=true;suspended=true;dismiss();return;}if(!pressed&&suspended){suspended=false;dismissed=null;hovered=resolve(event.target);show();}};
  const click=(event:Event)=>{suspended=true;dismissed=resolve(event.target);dismiss();};
  const lostWindow=()=>{pressed=false;dismiss();};
  const removal=new MutationObserver(()=>{if(active&&!active.element.isConnected)dismiss();});
  removal.observe(document.body,{childList:true,subtree:true});
  document.addEventListener("pointerdown",press,true);document.addEventListener("pointerup",release,true);document.addEventListener("pointercancel",release,true);
  document.addEventListener("pointermove",move,true);document.addEventListener("click",click,true);document.addEventListener("dragstart",press,true);document.addEventListener("dragend",release,true);window.addEventListener("blur",lostWindow);
  const key=(event:KeyboardEvent)=>{if(event.key==="Tab"){suspended=false;dismissed=null;}if(event.key==="Escape")dismiss();};
  document.addEventListener("mouseover",over,true);document.addEventListener("mouseout",out,true);
  document.addEventListener("focus",focus,true);document.addEventListener("blur",blur,true);
  document.addEventListener("keydown",key,true);window.addEventListener("scroll",dismiss,true);window.addEventListener("resize",dismiss);
  return()=>{
   removal.disconnect();document.removeEventListener("pointerdown",press,true);document.removeEventListener("pointerup",release,true);document.removeEventListener("pointercancel",release,true);
   document.removeEventListener("pointermove",move,true);document.removeEventListener("click",click,true);document.removeEventListener("dragstart",press,true);document.removeEventListener("dragend",release,true);window.removeEventListener("blur",lostWindow);
   restore();document.removeEventListener("mouseover",over,true);document.removeEventListener("mouseout",out,true);
   document.removeEventListener("focus",focus,true);document.removeEventListener("blur",blur,true);document.removeEventListener("keydown",key,true);
   window.removeEventListener("scroll",dismiss,true);window.removeEventListener("resize",dismiss);
  };
 },[id]);
 useLayoutEffect(()=>{
  if(!visible||!box.current)return;
  const anchor=visible.element.getBoundingClientRect(),tip=box.current.getBoundingClientRect(),scale=elementLayoutScale(document.documentElement);
  const left=Math.max(8,Math.min(anchor.left+(anchor.width-tip.width)/2,window.innerWidth-tip.width-8));
  const below=anchor.bottom+6,top=below+tip.height>window.innerHeight-8?Math.max(8,anchor.top-tip.height-6):below;
  setPosition({left:left/scale,top:top/scale});
 },[visible]);
 return visible?createPortal(<div id={id} ref={box} role="tooltip" className="application-tooltip" style={position}>{visible.text}</div>,document.body):null;
}
