import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import i18n from "../../../../i18n/config.ts";
import { projectFixture } from "../../../../test/projectFixture.ts";
import LegendEditor from "./LegendEditor.tsx";
import LegendColorSchemeSelect from "../LegendColorSchemeSelect.tsx";
import { LEGEND_COLOR_SCHEMES } from "../../../../viewer/legendColors.ts";
import { formatPileTipLevelMillimetres } from "../../../../domain/formatting.ts";

const t = (key: string, options = {}) => i18n.t(key, { ns: "common", ...options });
function fixture() {
  const base = projectFixture(), first = base.pilePlans[0];
  return { ...base, pileLegend: { ...base.pileLegend, encodingMode: "size-symbol" as const },
    pilePlans: [first, { ...first, id: "other", name: "Other plan", activePileSizes: [290], activePileTipLevelMms: [-17500] }] };
}
function openScope(container: HTMLElement) { fireEvent.click(container.querySelector(".legend-editor-scope > summary")!); }

test.each(["en", "nl"])("legend uses the native modal, contains keys, and keeps current plan selected in %s", async language => {
  await i18n.changeLanguage(language); const state = fixture(), outer = vi.fn(), close = vi.fn();
  const view = render(<div onKeyDown={outer}><LegendEditor open state={state} onApply={vi.fn()} onClose={close} /></div>);
  const dialog = screen.getByRole("dialog", { name: t("legend.editorTitle") }); expect(dialog.tagName).toBe("DIALOG");
  openScope(view.container);
  const current = screen.getByRole("checkbox", { name: state.pilePlans[0].name }) as HTMLInputElement;
  expect(current.checked).toBe(true); expect(current.disabled).toBe(true);
  const other = screen.getByRole("checkbox", { name: "Other plan" });
  fireEvent.keyDown(other, { key: " ", code: "Space" });
  fireEvent.keyDown(other, { key: "z", ctrlKey: true }); expect(outer).not.toHaveBeenCalled();
  fireEvent(dialog, new Event("cancel", { cancelable: true })); expect(close).toHaveBeenCalledOnce();
});

test("reopening discards local drafts/popovers and a rejected apply retains the edited legend", async () => {
  const state = fixture(), before = structuredClone(state), close = vi.fn(), apply = vi.fn().mockResolvedValue(false);
  const props = { state, onApply: apply, onClose: close };
  const view = render(<LegendEditor {...props} open />);
  const disable = screen.getByRole("button", { name: t("legend.disableItem", { item: "290 mm" }) }); fireEvent.click(disable);
  fireEvent.click(screen.getByRole("button", { name: t("apply") }));
  await waitFor(() => expect(apply).toHaveBeenCalledOnce());
  expect(apply.mock.calls[0][0].active.pileSizes).not.toContain(290);
  expect(screen.getByRole("button", { name: t("legend.enableItem", { item: "290 mm" }) })).toBeTruthy();
  const symbol = screen.getByRole("button", { name: t("legend.changeSymbol", { item: "290 mm" }) }); fireEvent.click(symbol);
  expect(screen.getByRole("dialog", { name: t("legend.changeSymbol", { item: "290 mm" }) })).toBeTruthy();
  view.rerender(<LegendEditor {...props} open={false} />); view.rerender(<LegendEditor {...props} open />);
  expect(screen.queryByRole("dialog", { name: t("legend.changeSymbol", { item: "290 mm" }) })).toBeNull();
  expect(screen.getByRole("button", { name: t("legend.disableItem", { item: "290 mm" }) })).toBeTruthy();
  expect(state).toEqual(before); expect(close).not.toHaveBeenCalled();
});

test("encoding radios retain scope and region requests without editing source project content", async () => {
  const state = fixture(), apply = vi.fn().mockResolvedValue(false), view = render(<LegendEditor open state={state} onApply={apply} onClose={vi.fn()} />);
  openScope(view.container); fireEvent.click(screen.getByRole("checkbox", { name: "Other plan" }));
  fireEvent.click(view.container.querySelector(".legend-editor-encoding > summary")!);
  fireEvent.click(screen.getByRole("radio", { name: t("legend.encodingModes.sizeColorTipRegion") }));
  expect((view.container.querySelector(".legend-editor-encoding") as HTMLDetailsElement).open).toBe(false);
  expect((screen.getByRole("checkbox", { name: "Other plan" }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: t("apply") }));
  await waitFor(() => expect(apply).toHaveBeenCalledOnce());
  expect(apply.mock.calls[0][0].legend.encodingMode).toBe("size-color-tip-region"); expect(apply.mock.calls[0][1]).toBe(true);
  expect(state.pileLegend.encodingMode).toBe("size-symbol");
});

test("usage Escape closes the focused popover and restores its trigger before editor cancellation", () => {
  const state = fixture(), close = vi.fn(); render(<LegendEditor open state={state} onApply={vi.fn()} onClose={close} />);
  const trigger = screen.getByRole("button", { name: /^290 mm/ }); fireEvent.click(trigger);
  expect(screen.getByRole("dialog", { name: t("legend.planUsageTitle", { item: "290 mm" }) })).toBeTruthy();
  expect(fireEvent.keyDown(trigger, { key: "Escape" })).toBe(false);
  expect(screen.queryByRole("dialog", { name: t("legend.planUsageTitle", { item: "290 mm" }) })).toBeNull();
  expect(document.activeElement).toBe(trigger); expect(close).not.toHaveBeenCalled();
});

test("pending Apply cannot submit a second legend while existing callbacks retain ownership of closing", async () => {
  let finish!: (value: boolean) => void; const apply = vi.fn().mockReturnValue(new Promise<boolean>(resolve => { finish = resolve; })), close = vi.fn();
  render(<LegendEditor open state={fixture()} onApply={apply} onClose={close} />);
  const button = screen.getByRole("button", { name: t("apply") }) as HTMLButtonElement; fireEvent.click(button);
  expect(button.disabled).toBe(true); button.click(); expect(apply).toHaveBeenCalledOnce();
  await act(async () => finish(false)); expect(button.disabled).toBe(false); expect(close).not.toHaveBeenCalled();
});

test("symbol shape/fill edits keep the chooser open and Escape returns focus within the editor", async () => {
  const state = fixture(), close = vi.fn(), apply = vi.fn().mockResolvedValue(false);
  render(<LegendEditor open state={state} onApply={apply} onClose={close} />);
  const label = t("legend.changeSymbol", { item: "290 mm" }), trigger = screen.getByRole("button", { name: label });
  fireEvent.click(trigger); fireEvent.click(screen.getByRole("button", { name: t("legend.baseShapes.circle") }));
  const fill = screen.getByRole("radio", { name: t("legend.fillPatterns.topHalf") }); fireEvent.click(fill);
  expect(screen.getByRole("dialog", { name: label })).toBeTruthy();
  fill.focus(); expect(fireEvent.keyDown(fill, { key: "Escape" })).toBe(false);
  expect(screen.queryByRole("dialog", { name: label })).toBeNull(); expect(document.activeElement).toBe(trigger);
  fireEvent.click(screen.getByRole("button", { name: t("apply") }));
  await waitFor(() => expect(apply).toHaveBeenCalledOnce());
  expect(apply.mock.calls[0][0].legend.pileSizes.find((item: { value: number }) => item.value === 290).symbol)
    .toEqual({ baseShape: "circle", fillPattern: "top-half" });
  expect(close).not.toHaveBeenCalled();
});

test("free colors stay draft-owned and Escape returns to the color trigger without closing the editor", async () => {
  const state = fixture(), apply = vi.fn().mockResolvedValue(false), close = vi.fn();
  const view = render(<LegendEditor open state={state} onApply={apply} onClose={close} />);
  const level = state.pileLegend.pileTipLevels[0], label = t("legend.changeColor", { item: formatPileTipLevelMillimetres(level.value, i18n.language) });
  const trigger = screen.getByRole("button", { name: label }); fireEvent.click(trigger);
  const input = view.container.querySelector<HTMLInputElement>('input[type="color"]')!;
  input.focus(); fireEvent.change(input, { target: { value: "#abcdef" } });
  expect(screen.getByRole("dialog", { name: label })).toBeTruthy();
  expect(fireEvent.keyDown(input, { key: "Escape" })).toBe(false); expect(document.activeElement).toBe(trigger);
  fireEvent.click(screen.getByRole("button", { name: t("apply") }));
  await waitFor(() => expect(apply).toHaveBeenCalledOnce());
  expect(apply.mock.calls[0][0].legend.pileTipLevels.find((item: { value: number }) => item.value === level.value).color).toBe("#ABCDEF");
  expect(level.color).not.toBe("#ABCDEF"); expect(close).not.toHaveBeenCalled();
});

test("palette Escape restores its trigger without changing the selected scheme", () => {
  const change = vi.fn(); render(<LegendColorSchemeSelect value={LEGEND_COLOR_SCHEMES[0]} label="Palette" getSchemeLabel={value => value} onChange={change} />);
  const trigger = screen.getByRole("button", { name: LEGEND_COLOR_SCHEMES[0] }); fireEvent.click(trigger);
  const list = screen.getByRole("listbox", { name: "Palette" }); list.focus(); fireEvent.keyDown(list, { key: "Escape" });
  expect(screen.queryByRole("listbox")).toBeNull(); expect(document.activeElement).toBe(trigger); expect(change).not.toHaveBeenCalled();
});

test("co-active conflicts keep their details and close locally on Escape", () => {
  const base = fixture(), first = base.pileLegend.pileSizes[0];
  const state = { ...base, pileLegend: { ...base.pileLegend,
    pileSizes: base.pileLegend.pileSizes.map(item => ({ ...item, symbol: { ...first.symbol } })),
  } };
  const close = vi.fn(), view = render(<LegendEditor open state={state} onApply={vi.fn()} onClose={close} />);
  const trigger = view.container.querySelector<HTMLButtonElement>(".legend-editor-conflict-trigger")!; expect(trigger).toBeTruthy();
  fireEvent.click(trigger); const popup = screen.getByRole("dialog", { name: t("legend.duplicateEncodingDetails") });
  expect(popup.textContent).toContain(state.pilePlans[0].name);
  fireEvent.keyDown(popup, { key: "Escape" }); expect(screen.queryByRole("dialog", { name: t("legend.duplicateEncodingDetails") })).toBeNull();
  expect(document.activeElement).toBe(trigger); expect(close).not.toHaveBeenCalled();
});
