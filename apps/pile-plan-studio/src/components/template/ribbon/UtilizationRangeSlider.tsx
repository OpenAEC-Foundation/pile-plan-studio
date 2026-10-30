import {useRef,type PointerEvent} from "react";
import {useTranslation} from "react-i18next";

type Thumb="minimum"|"maximum";
type Props={minimum:number;maximum:number;onChange:(minimum:number,maximum:number)=>void;onCommit:()=>void};

/** One pointer surface keeps either end reachable when the native thumbs overlap. */
export default function UtilizationRangeSlider({minimum,maximum,onChange,onCommit}:Props){
  const {t}=useTranslation("ribbon");
  const drag=useRef<{pointerId:number;thumb:Thumb|null;startX:number}|null>(null);
  const minimumInput=useRef<HTMLInputElement>(null),maximumInput=useRef<HTMLInputElement>(null);
  const pointerValue=(event:PointerEvent<HTMLDivElement>)=>{
    const element=event.currentTarget,rect=element.getBoundingClientRect();
    const radius=7.5*rect.width/(element.clientWidth||rect.width||1);
    return Math.max(0,Math.min(100,Math.round((event.clientX-rect.left-radius)/Math.max(1,rect.width-2*radius)*100)))/100;
  };
  const move=(event:PointerEvent<HTMLDivElement>)=>{
    const current=drag.current;
    if(!current||current.pointerId!==event.pointerId)return;
    if(current.thumb===null){
      if(event.clientX===current.startX)return;
      current.thumb=event.clientX<current.startX?"minimum":"maximum";
    }
    const value=pointerValue(event);
    if(current.thumb==="minimum")onChange(Math.min(value,maximum),maximum);
    else onChange(minimum,Math.max(value,minimum));
  };
  const finish=(event:PointerEvent<HTMLDivElement>)=>{
    const current=drag.current;
    drag.current=null;
    onCommit();
    if(current?.thumb)(current.thumb==="minimum"?minimumInput:maximumInput).current?.focus({preventScroll:true});
    if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div className="ribbon-dual-range" onPointerDown={event=>{
    if(event.button!==0)return;
    event.preventDefault();
    const value=pointerValue(event);
    drag.current={pointerId:event.pointerId,startX:event.clientX,thumb:minimum===maximum?null:
      Math.abs(value-minimum)<=Math.abs(value-maximum)?"minimum":"maximum"};
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if(minimum!==maximum)move(event);
  }} onPointerMove={move} onPointerUp={event=>{move(event);finish(event);}}
    onPointerCancel={finish} onLostPointerCapture={event=>{if(drag.current)finish(event);}}>
    <span aria-hidden="true" className="ribbon-dual-range-selection"
      style={{left:`${minimum*100}%`,width:`${(maximum-minimum)*100}%`}}/>
    <input ref={minimumInput} aria-label={t("view.minimumUtilization")} min="0" max="100" step="1" type="range"
      value={Math.round(minimum*100)} onChange={event=>onChange(Math.min(Number(event.currentTarget.value)/100,maximum),maximum)}
      onKeyUp={onCommit} onBlur={onCommit}/>
    <input ref={maximumInput} aria-label={t("view.maximumUtilization")} min="0" max="100" step="1" type="range"
      value={Math.round(maximum*100)} onChange={event=>onChange(minimum,Math.max(Number(event.currentTarget.value)/100,minimum))}
      onKeyUp={onCommit} onBlur={onCommit}/>
  </div>;
}
