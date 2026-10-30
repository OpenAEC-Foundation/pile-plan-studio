import {useEffect,useRef,useState,type ComponentProps} from "react";
import ThemedNumberInput from "./ThemedNumberInput.tsx";

type Props=Omit<ComponentProps<typeof ThemedNumberInput>,"value"|"onValueChange">&{
  value:number|"";
  integer?:boolean;
  onNumberChange:(value:number)=>void;
};

/** Keeps incomplete typing out of numeric application state. */
export default function NumericValueInput({value,integer=false,onNumberChange,...props}:Props){
  const [draft,setDraft]=useState(String(value));
  const emitted=useRef<number|undefined>(undefined);
  useEffect(()=>{
    if(value!==emitted.current)setDraft(String(value));
    emitted.current=undefined;
  },[value]);
  const parse=(text:string)=>{
    if(!text.trim())return null;
    const number=Number(text.replace(",","."));
    return Number.isFinite(number)&&(!integer||Number.isSafeInteger(number))
      &&(props.min===undefined||number>=Number(props.min))
      &&(props.max===undefined||number<=Number(props.max))?number:null;
  };
  return <ThemedNumberInput {...props} value={draft}
    aria-invalid={props["aria-invalid"]??(draft!==""&&parse(draft)===null)}
    onValueChange={text=>{
      setDraft(text);
      const number=parse(text);
      if(number!==null&&number!==value){emitted.current=number;onNumberChange(number);}
    }}
    onBlur={event=>{setDraft(String(value));props.onBlur?.(event);}}
    onKeyDown={event=>{
      props.onKeyDown?.(event);
      if(!event.defaultPrevented&&event.key==="Enter"){event.preventDefault();event.currentTarget.blur();}
    }}/>
}
