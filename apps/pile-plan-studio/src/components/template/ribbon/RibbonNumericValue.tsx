import {useLayoutEffect,useRef,useState} from "react";
import {useTranslation} from "react-i18next";

type Props={label:string;value:number;min:number;max:number;suffix?:string;onCommit:(value:number)=>void};

export default function RibbonNumericValue({label,value,min,max,suffix="%",onCommit}:Props){
  const {t}=useTranslation("ribbon");
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState("");
  const active=useRef(false);
  const input=useRef<HTMLInputElement>(null);
  useLayoutEffect(()=>{
    if(editing){input.current?.focus();input.current?.select();}
  },[editing]);
  const finish=(save:boolean)=>{
    if(!active.current)return;
    active.current=false;setEditing(false);
    const number=draft.trim()?Number(draft):NaN;
    if(save&&Number.isFinite(number)){
      const next=Math.max(min,Math.min(max,Math.round(number)));
      if(next!==value)onCommit(next);
    }
  };
  if(editing)return <span className="ribbon-numeric-editor">
    <input ref={input} type="number" inputMode="numeric" aria-label={label} min={min} max={max} step="1"
      value={draft} onChange={event=>setDraft(event.currentTarget.value)} onBlur={()=>finish(true)}
      onKeyDown={event=>{
        event.stopPropagation();
        if(event.key==="Enter"||event.key==="Escape"){event.preventDefault();finish(event.key==="Enter");}
      }}/>
    {suffix&&<span aria-hidden="true">{suffix}</span>}
  </span>;
  return <button type="button" className="ribbon-numeric-value"
    aria-label={t("view.editValue",{label})} onClick={()=>{setDraft(String(value));active.current=true;setEditing(true);}}>
    {value}{suffix}
  </button>;
}
