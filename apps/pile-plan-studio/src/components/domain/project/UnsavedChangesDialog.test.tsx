import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import i18n from "../../../i18n/config.ts";
import UnsavedChangesDialog from "./UnsavedChangesDialog.tsx";
const t = (key: string) => i18n.t(key, { ns: "common" });
function props() {
  return { open: true, isDesktop: false, onSave: vi.fn(), onDiscard: vi.fn(), onCancel: vi.fn() };
}

test.each([ ["en", false], ["nl", false], ["en", true], ["nl", true] ] as const)(
  "unsaved dialog in %s (desktop=%s) keeps save, discard and cancel separate", async (language, isDesktop) => {
    await i18n.changeLanguage(language);
    const p = { ...props(), isDesktop };
    render(<UnsavedChangesDialog {...p} />);
    expect(screen.getByRole("dialog", { name: t("unsaved.title") }).tagName).toBe("DIALOG");
    expect(screen.getByText(t(isDesktop ? "unsaved.desktopMessage" : "unsaved.browserMessage"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: isDesktop ? t("unsaved.saveAndContinue") : language === "nl" ? "Lokaal opslaan en doorgaan" : "Save locally and continue" }));
    expect(p.onSave).toHaveBeenCalledOnce(); expect(p.onDiscard).not.toHaveBeenCalled(); expect(p.onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: t("unsaved.discard") }));
    expect(p.onDiscard).toHaveBeenCalledOnce(); expect(p.onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: t("cancel") }));
    expect(p.onCancel).toHaveBeenCalledOnce(); expect(p.onSave).toHaveBeenCalledOnce();
  },
);

test("local saving prevents a second save or dismissal until persistence completes", async () => {
  const p = { ...props(), saving: true };
  render(<UnsavedChangesDialog {...p} />);
  expect(screen.getByRole("button", { name: "Save locally and continue" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: t("unsaved.discard") }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: t("cancel") }).hasAttribute("disabled")).toBe(true);
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  expect(p.onCancel).not.toHaveBeenCalled();
});

test("a failed local save explains the failure inside the still-open warning", () => {
  render(<UnsavedChangesDialog {...props()} saveError="Local storage is full" />);
  expect(screen.getByRole("alert").textContent).toContain("Local storage is full");
  expect(screen.getByRole("dialog").hasAttribute("open")).toBe(true);
});

test("native cancellation and the close icon cancel without saving or discarding", () => {
  const p = props(); render(<UnsavedChangesDialog {...p} />);
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  expect(p.onCancel).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: t("close") }));
  expect(p.onCancel).toHaveBeenCalledTimes(2);
  expect(p.onSave).not.toHaveBeenCalled(); expect(p.onDiscard).not.toHaveBeenCalled();
});

test("modal activation and Escape stay out of viewer shortcuts, with native defaults intact", () => {
  const p = props(), background = vi.fn();
  render(<div onKeyDown={background}><UnsavedChangesDialog {...p} /></div>);
  const cancel = screen.getByRole("button", { name: t("cancel") });
  expect(fireEvent.keyDown(cancel, { key: "Escape" })).toBe(true);
  expect(fireEvent.keyDown(cancel, { key: " ", code: "Space" })).toBe(true);
  expect(background).not.toHaveBeenCalled();
});
