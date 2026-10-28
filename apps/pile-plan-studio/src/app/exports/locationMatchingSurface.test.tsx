import {useLayoutEffect, useState} from "react";
import {fireEvent, render, screen} from "@testing-library/react";
import {expect, test} from "vitest";
import {LocationMatchingSurface, LocationMatchingSurfaceContext, useLocationMatchingSurface} from "./locationMatchingSurface.tsx";
import {createBuiltInLegend} from "../../viewer/legend.ts";

test("the canvas mounts after its workspace is visible and source state survives returning", () => {
  const mountedHidden: boolean[] = [];
  function Canvas() {
    useLayoutEffect(() => {mountedHidden.push(document.querySelector<HTMLElement>("#review-host")!.hidden === true);}, []);
    return <p>canvas</p>;
  }
  function Harness() {
    const surface = useLocationMatchingSurface(createBuiltInLegend([]));
    const [open, setOpen] = useState(false), [draft, setDraft] = useState("source selected");
    return <LocationMatchingSurfaceContext.Provider value={surface.value}>
      <div ref={surface.setElement} id="review-host" hidden={!surface.active}/>
      <div hidden={surface.active}><input aria-label="source" value={draft} onChange={e => setDraft(e.target.value)}/><button onClick={() => setOpen(true)}>review</button></div>
      {open && <LocationMatchingSurface><Canvas/><button onClick={() => setOpen(false)}>return</button></LocationMatchingSurface>}
    </LocationMatchingSurfaceContext.Provider>;
  }
  render(<Harness/>);
  fireEvent.change(screen.getByLabelText("source"), {target: {value: "changed draft"}});
  fireEvent.click(screen.getByRole("button", {name: "review"}));
  expect(mountedHidden).toEqual([false]);
  fireEvent.click(screen.getByRole("button", {name: "return"}));
  expect((screen.getByLabelText("source") as HTMLInputElement).value).toBe("changed draft");
});
