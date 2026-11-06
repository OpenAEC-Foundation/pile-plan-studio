import {useLayoutEffect,useRef} from "react";
import {Select,type Option,type SelectProps} from "../../../openaec/react/src/index";

type Props=Omit<SelectProps,"options">&{options:Array<Option&{disabled?:boolean}>};

/** Keep the pinned shared field, adding its missing native option.disabled metadata. */
export default function SourceMeaningSelect({options,...props}:Props){
  const frame=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const unavailable=new Set(options.filter(option=>option.disabled).map(option=>option.value));
    for(const option of frame.current?.querySelectorAll("option")??[])option.disabled=unavailable.has(option.value);
  },[options]);
  return <div ref={frame} style={{display:"contents"}}><Select {...props} options={options}/></div>;
}
