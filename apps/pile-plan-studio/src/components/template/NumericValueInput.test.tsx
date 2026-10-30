import {useState} from "react";
import {fireEvent,render,screen} from "@testing-library/react";
import {expect,test,vi} from "vitest";
import NumericValueInput from "./NumericValueInput.tsx";

test("empty typing never changes numeric state and can be replaced",()=>{
 const change=vi.fn();
 function Field(){const [value,set]=useState(2);return <NumericValueInput aria-label="Row" integer min={1} value={value} onNumberChange={n=>{change(n);set(n);}}/>;}
 render(<Field/>);const input=screen.getByLabelText("Row") as HTMLInputElement;
 fireEvent.change(input,{target:{value:""}});expect(input.value).toBe("");expect(change).not.toHaveBeenCalled();
 fireEvent.change(input,{target:{value:"12"}});expect(input.value).toBe("12");expect(change).toHaveBeenCalledExactlyOnceWith(12);
 fireEvent.change(input,{target:{value:""}});fireEvent.blur(input);expect(input.value).toBe("12");expect(change).toHaveBeenCalledTimes(1);
});

test("invalid bounds and fractional integer drafts restore the latest applied value",()=>{
 const change=vi.fn();const view=render(<NumericValueInput aria-label="Row" integer min={1} max={20} value={2} onNumberChange={change}/>);
 const input=screen.getByLabelText("Row") as HTMLInputElement;
 for(const value of ["0","21","2.5"]){fireEvent.change(input,{target:{value}});expect(input.value).toBe(value);expect(input.getAttribute("aria-invalid")).toBe("true");fireEvent.blur(input);expect(input.value).toBe("2");}
 expect(change).not.toHaveBeenCalled();
 fireEvent.change(input,{target:{value:""}});
 view.rerender(<NumericValueInput aria-label="Row" integer min={1} max={20} value={7} onNumberChange={change}/>);
 expect(input.value).toBe("7");
});

test("decimal text drafts preserve a decimal separator while typing and accept zero",()=>{
 const change=vi.fn();
 function Field(){const [value,set]=useState(2);return <NumericValueInput type="text" aria-label="Tolerance" min={0} step="any" value={value} onNumberChange={n=>{change(n);set(n);}}/>;}
 render(<Field/>);const input=screen.getByLabelText("Tolerance") as HTMLInputElement;
 fireEvent.change(input,{target:{value:"0,"}});expect(input.value).toBe("0,");expect(change).toHaveBeenLastCalledWith(0);
 fireEvent.change(input,{target:{value:"0,25"}});expect(input.value).toBe("0,25");expect(change).toHaveBeenLastCalledWith(.25);
 fireEvent.blur(input);expect(input.value).toBe("0.25");
});

test("Enter restores an empty draft and the themed stepper still changes valid values",()=>{
 const change=vi.fn();
 function Field(){const [value,set]=useState(2);return <NumericValueInput aria-label="Row" integer min={1} step={1} value={value} onNumberChange={n=>{change(n);set(n);}}/>;}
 render(<Field/>);const input=screen.getByLabelText("Row") as HTMLInputElement;input.focus();
 fireEvent.change(input,{target:{value:""}});fireEvent.keyDown(input,{key:"Enter"});expect(input.value).toBe("2");expect(change).not.toHaveBeenCalled();
 fireEvent.pointerDown(screen.getByRole("button",{name:/increase/i}),{button:0});
 fireEvent.pointerUp(screen.getByRole("button",{name:/increase/i}));
 expect(input.value).toBe("3");expect(change).toHaveBeenCalledExactlyOnceWith(3);
});

test("an optional unset number stays unset after clearing and blur",()=>{
 const change=vi.fn();render(<NumericValueInput aria-label="Size" integer min={1} value="" onNumberChange={change}/>);
 const input=screen.getByLabelText("Size") as HTMLInputElement;
 fireEvent.blur(input);expect(input.value).toBe("");expect(change).not.toHaveBeenCalled();
});
