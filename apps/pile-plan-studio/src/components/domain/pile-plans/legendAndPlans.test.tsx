import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import LegendSymbolPicker from "./LegendSymbolPicker.tsx";
import LegendColorPicker from "./LegendColorPicker.tsx";
import LegendColorSchemeSelect from "./LegendColorSchemeSelect.tsx";
import LegendEditor from "./legend-editor/LegendEditor.tsx";
import PilePlanExplorer from "./PilePlanExplorer.tsx";
import { projectFixture } from "../../../test/projectFixture.ts";
import { LEGEND_COLOR_SCHEMES } from "../../../viewer/legendColors.ts";
import i18n from "../../../i18n/config.ts";

test("symbol picker changes shape and fill independently, and Escape closes only its own dialog", () => {
  const change = vi.fn(), parent = vi.fn(); const symbol = { baseShape: "square" as const, fillPattern: "full" as const };
  render(<div onKeyDown={parent}><LegendSymbolPicker value={symbol} color="#000000" label="Symbol" fillLabel="Fill"
    getShapeLabel={shape => shape} getFillLabel={fill => fill} onChange={change} /></div>);
  fireEvent.click(screen.getByRole("button", { name: "Symbol" }));
  expect(screen.getAllByRole("radio")).toHaveLength(6);
  fireEvent.click(screen.getByRole("button", { name: "circle" })); expect(change).toHaveBeenLastCalledWith({ ...symbol, baseShape: "circle" });
  fireEvent.click(screen.getByRole("radio", { name: "top-half" })); expect(change).toHaveBeenLastCalledWith({ ...symbol, fillPattern: "top-half" });
  fireEvent.keyDown(screen.getByRole("button", { name: "Symbol" }), { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull(); expect(parent).not.toHaveBeenCalled();
});
test("color picker submits a scheme color and a free color and dismisses on outside pointer", () => {
  const change = vi.fn(); const view = render(<LegendColorPicker value="#123456" colorScheme="colorblind-friendly"
    colorCount={4} label="Color" schemeLabel="Palette" freeColorLabel="Free color" openColorPickerLabel="Choose color" onChange={change} />);
  const open = screen.getByRole("button", { name: "Color" }); fireEvent.click(open);
  const option = screen.getAllByRole("option")[0]; fireEvent.click(option);
  expect(change).toHaveBeenLastCalledWith(option.getAttribute("aria-label")); expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(open); fireEvent.change(view.container.querySelector('input[type="color"]')!, { target: { value: "#abcdef" } });
  expect(change).toHaveBeenLastCalledWith("#ABCDEF");
  fireEvent.pointerDown(document.body); expect(screen.queryByRole("dialog")).toBeNull();
});
test("palette listbox supports keyboard selection and Escape cancellation", () => {
  const change = vi.fn(); const initial = LEGEND_COLOR_SCHEMES[0];
  render(<LegendColorSchemeSelect value={initial} label="Palette" getSchemeLabel={scheme => scheme} onChange={change} />);
  const trigger = screen.getByRole("button", { name: initial });
  fireEvent.keyDown(trigger, { key: "ArrowDown" }); const list = screen.getByRole("listbox");
  expect(screen.getAllByRole("option")).toHaveLength(6);
  fireEvent.keyDown(list, { key: "ArrowDown" }); fireEvent.keyDown(list, { key: "Enter" });
  expect(change).toHaveBeenCalledExactlyOnceWith(LEGEND_COLOR_SCHEMES[1]); expect(screen.queryByRole("listbox")).toBeNull();
  fireEvent.click(trigger); fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
  expect(screen.queryByRole("listbox")).toBeNull(); expect(change).toHaveBeenCalledOnce();
});
test("legend edits stay in the draft until Apply and Cancel never changes project content", async () => {
  const state = projectFixture(), before = structuredClone(state);
  const apply = vi.fn().mockResolvedValue(true), close = vi.fn();
  const view = render(<LegendEditor open state={state} onApply={apply} onClose={close} />);
  fireEvent.click(screen.getByRole("button", { name: i18n.t("legend.enableAll") }));
  expect(state).toEqual(before); expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: i18n.t("cancel") })); expect(close).toHaveBeenCalledOnce();
  view.unmount(); close.mockClear();
  render(<LegendEditor open state={state} onApply={apply} onClose={close} />);
  fireEvent.click(screen.getByRole("button", { name: i18n.t("apply") }));
  await waitFor(() => expect(apply).toHaveBeenCalledOnce()); expect(state).toEqual(before);
  expect(close).not.toHaveBeenCalled();
});
function explorerProps() {
  const state = projectFixture(); const plan = state.pilePlans[0];
  return { projectName: state.name, isDirty: true, pilePlans: [plan, { ...plan, id: "other", name: "Other" }],
    activePilePlanId: plan.id, costSummaries: new Map(), currencyCode: "EUR", inputSources: [], activeSourceKind: null,
    inputSourcesExpanded: true, pilePlansExpanded: true,
    onActivate: vi.fn(), onCreate: vi.fn(), onRename: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn(),
    onSourceActivate: vi.fn(), onExpansionChange: vi.fn() };
}
test("plan explorer activates, duplicates and deletes the selected plan without confirmation", () => {
  const props = explorerProps(); const confirm = vi.spyOn(window, "confirm"); render(<PilePlanExplorer {...props} />);
  fireEvent.click(screen.getByRole("option", { name: /Other/ })); expect(props.onActivate).toHaveBeenCalledWith("other");
  fireEvent.click(screen.getAllByRole("button", { name: i18n.t("projectExplorer.duplicate") })[1]); expect(props.onDuplicate).toHaveBeenCalledWith("other");
  fireEvent.click(screen.getAllByRole("button", { name: i18n.t("projectExplorer.delete") })[1]); expect(props.onDelete).toHaveBeenCalledWith("other");
  expect(confirm).not.toHaveBeenCalled();
});
test("inline plan rename commits on Enter and blur, and Escape cancels", () => {
  const props = explorerProps(); render(<PilePlanExplorer {...props} />);
  const rename = () => fireEvent.click(screen.getAllByRole("button", { name: i18n.t("projectExplorer.rename") })[1]);
  rename(); fireEvent.change(screen.getByRole("textbox"), { target: { value: "Updated" } });
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" }); expect(props.onRename).toHaveBeenLastCalledWith("other", "Updated");
  rename(); fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" }); expect(props.onRename).toHaveBeenCalledTimes(1);
  rename(); fireEvent.blur(screen.getByRole("textbox")); expect(props.onRename).toHaveBeenCalledTimes(2);
});
test("plan creation is disabled until analysis is ready and group expansion is independent", () => {
  const props = explorerProps(); const view = render(<PilePlanExplorer {...props} createDisabled />);
  const create = screen.getByRole("button", { name: i18n.t("projectExplorer.newPilePlan") });
  fireEvent.click(create); expect(props.onCreate).not.toHaveBeenCalled();
  view.rerender(<PilePlanExplorer {...props} createDisabled={false} />);
  fireEvent.click(create); expect(props.onCreate).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: i18n.t("projectExplorer.pilePlans") }));
  expect(props.onExpansionChange).toHaveBeenCalledWith("pilePlans", false);
});

test("source rows open their own inspection view and retain independent expansion state", () => {
  const p = explorerProps(), sources = projectFixture().inputSources;
  const view = render(<PilePlanExplorer {...p} inputSources={sources} />);
  const section = screen.getByRole("region", { name: i18n.t("projectExplorer.inputSources") });
  fireEvent.click(section.querySelector('.project-tree-item')!);
  expect(p.onSourceActivate).toHaveBeenCalledWith(sources[0].kind);
  fireEvent.click(screen.getByRole("button", { name: i18n.t("projectExplorer.inputSources") }));
  expect(p.onExpansionChange).toHaveBeenCalledWith("inputSources", false);
  view.rerender(<PilePlanExplorer {...p} inputSources={sources} inputSourcesExpanded={false} />);
  expect(section.querySelector('.project-tree-item')).toBeNull();
  expect(screen.getAllByRole("option")).toHaveLength(2);
});
