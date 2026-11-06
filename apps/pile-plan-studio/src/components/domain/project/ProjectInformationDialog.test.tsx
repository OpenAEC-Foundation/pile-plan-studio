import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import i18n from "../../../i18n/config.ts";
import ProjectInformationDialog from "./ProjectInformationDialog.tsx";
const t = (key: string) => i18n.t(key, { ns: "common" });
function props() {
  return { open: true, projectName: "Alpha", pileHeadLevelM: -1.2, currencyCode: "EUR",
    onSave: vi.fn().mockResolvedValue(true), onClose: vi.fn() };
}

test.each(["en", "nl"])("native project dialog labels its fields and associates reference tooltip help in %s", async language => {
  await i18n.changeLanguage(language);
  render(<ProjectInformationDialog {...props()} />);
  expect(screen.getByRole("dialog", { name: t("projectInformation.title") }).tagName).toBe("DIALOG");
  const level = screen.getByRole("textbox", { name: t("projectInformation.pileHeadLevel") });
  expect(document.getElementById(level.getAttribute("aria-describedby")!)?.textContent).toBe(t("projectInformation.pileHeadLevelHelp"));
  const info = screen.getByRole("button", { name: t("projectInformation.pileHeadLevelInfo") });
  expect(info.getAttribute("data-oa-tip")).toBe(t("projectInformation.pileHeadLevelHelp"));
  expect(document.getElementById(info.getAttribute("aria-describedby")!)?.hidden).toBe(true);
  expect((screen.getByRole("combobox", { name: t("projectInformation.currency") }) as HTMLSelectElement).value).toBe("EUR");
});

test("native cancellation discards drafts and reopening uses current project values", () => {
  const p = props();
  const view = render(<ProjectInformationDialog {...p} />);
  fireEvent.change(screen.getByRole("textbox", { name: t("projectInformation.projectName") }), { target: { value: "Discard this" } });
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  expect(p.onClose).toHaveBeenCalledOnce(); expect(p.onSave).not.toHaveBeenCalled();
  view.rerender(<ProjectInformationDialog {...p} open={false} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  view.rerender(<ProjectInformationDialog {...p} projectName="Restored" pileHeadLevelM={2.5} currencyCode="USD" />);
  expect((screen.getByRole("textbox", { name: t("projectInformation.projectName") }) as HTMLInputElement).value).toBe("Restored");
  expect((screen.getByRole("textbox", { name: t("projectInformation.pileHeadLevel") }) as HTMLInputElement).value).toBe("2.5");
  expect((screen.getByRole("combobox", { name: t("projectInformation.currency") }) as HTMLSelectElement).value).toBe("USD");
});

test("project dialog keeps modal keys away from viewer shortcuts without cancelling native Escape", () => {
  const background = vi.fn();
  render(<div onKeyDown={background}><ProjectInformationDialog {...props()} /></div>);
  expect(fireEvent.keyDown(screen.getByRole("button", { name: t("cancel") }), { key: "Escape" })).toBe(true);
  fireEvent.keyDown(screen.getByRole("button", { name: t("save") }), { key: " ", code: "Space" });
  expect(background).not.toHaveBeenCalled();
});

test("pending saves cannot be submitted twice and rejection retains the draft", async () => {
  const p = props(); let finish!: (saved: boolean) => void;
  p.onSave.mockImplementation(() => new Promise<boolean>(resolve => { finish = resolve; }));
  render(<ProjectInformationDialog {...p} />);
  fireEvent.change(screen.getByRole("textbox", { name: t("projectInformation.projectName") }), { target: { value: "Draft" } });
  const save = screen.getByRole("button", { name: t("save") }) as HTMLButtonElement;
  fireEvent.click(save); expect(save.disabled).toBe(true); fireEvent.click(save);
  expect(p.onSave).toHaveBeenCalledOnce();
  await act(async () => finish(false));
  expect(save.disabled).toBe(false); expect(p.onClose).not.toHaveBeenCalled();
  expect((screen.getByRole("textbox", { name: t("projectInformation.projectName") }) as HTMLInputElement).value).toBe("Draft");
});


test("Escape first dismisses focused reference help and then remains available to the native dialog", () => {
  const p = props(); render(<ProjectInformationDialog {...p} />);
  const info = screen.getByRole("button", { name: t("projectInformation.pileHeadLevelInfo") });
  fireEvent.focus(info);
  expect(fireEvent.keyDown(info, { key: "Escape" })).toBe(false);
  expect(info.hasAttribute("data-oa-tip-hidden")).toBe(true);
  expect(p.onClose).not.toHaveBeenCalled(); expect(p.onSave).not.toHaveBeenCalled();
  expect(fireEvent.keyDown(info, { key: "Escape" })).toBe(true);
  fireEvent.blur(info); fireEvent.focus(info);
  expect(info.hasAttribute("data-oa-tip-hidden")).toBe(false);
});
