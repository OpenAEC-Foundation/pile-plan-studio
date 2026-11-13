import { afterEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import SettingsDialog from "./SettingsDialog.tsx";
import type { ComponentProps } from "react";
import { within } from "@testing-library/react";
import i18n from "../../../i18n/config.ts";

afterEach(() => { document.documentElement.removeAttribute("data-oa-theme"); document.documentElement.removeAttribute("data-oa-workspace"); });

function openSettings(overrides: Partial<ComponentProps<typeof SettingsDialog>> = {}) {
  const commit = vi.fn();
  render(<SettingsDialog open onClose={vi.fn()} theme="light" workspaceAppearance="theme" language="en"
    defaultCurrencyCode="EUR" onPreferencesChange={commit} isDesktop={false}
    interfaceScalePercent={100} onInterfaceScalePreview={vi.fn()}
    mcpStatus="off" mcpConnection={null} mcpError={null} onMcpToggle={vi.fn()}
    mcpWriteEnabled={false} onMcpWriteToggle={vi.fn()} {...overrides} />);
  return commit;
}

function openAppearance(overrides: Partial<ComponentProps<typeof SettingsDialog>> = {}) {
  const commit = openSettings(overrides);
  fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));
  return commit;
}

test.each([false, true])("the startup preference saves for desktop=%s", isDesktop => {
  const commit = openSettings({ isDesktop, openLastProjectOnStartup: false });
  const option = screen.getByRole<HTMLInputElement>("checkbox", { name: "Open last project on startup" });
  expect(option.checked).toBe(false);
  fireEvent.click(option);
  expect(commit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(commit).toHaveBeenCalledWith(expect.objectContaining({ openLastProjectOnStartup: true }));
});

test("cancelling a live dark theme preview restores the original appearance without committing", () => {
  const commit = openAppearance();
  fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), { target: { value: "dark" } });
  expect(document.documentElement.getAttribute("data-oa-theme")).toBe("dark");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(document.documentElement.getAttribute("data-oa-theme")).toBe("light");
  expect(commit).not.toHaveBeenCalled();
});

test("native dialog cancellation restores the desktop scale preview", () => {
  const preview = vi.fn();
  const close = vi.fn();
  const commit = openAppearance({ isDesktop: true, interfaceScalePercent: 80, onInterfaceScalePreview: preview, onClose: close });
  fireEvent.change(screen.getByRole("slider", { name: "Interface scale" }), { target: { value: "120" } });
  expect(preview).toHaveBeenLastCalledWith(120);
  const dialog = screen.getByRole("dialog", { name: "Settings" });
  expect(dialog.tagName).toBe("DIALOG");
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(preview).toHaveBeenLastCalledWith(80);
  expect(close).toHaveBeenCalledOnce();
  expect(commit).not.toHaveBeenCalled();
});

test("dialog keyboard events stay inside both modal layers without cancelling native Escape", () => {
  openAppearance();
  const backgroundKey = vi.fn();
  window.addEventListener("keydown", backgroundKey);
  try {
    expect(fireEvent.keyDown(screen.getByRole("button", { name: "Cancel" }), { key: "Escape" })).toBe(true);
    expect(backgroundKey).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reset to Defaults" }));
    const confirmation = screen.getByRole("dialog", { name: "Reset to Defaults" });
    expect(fireEvent.keyDown(within(confirmation).getByRole("button", { name: "Cancel" }), { key: "Escape" })).toBe(true);
    expect(backgroundKey).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener("keydown", backgroundKey);
  }
});

test("cancelling reset closes only the confirmation and keeps the draft", () => {
  const close = vi.fn();
  const commit = openAppearance({ onClose: close });
  fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), { target: { value: "dark" } });
  fireEvent.click(screen.getByRole("button", { name: "Reset to Defaults" }));
  const confirmation = screen.getByRole("dialog", { name: "Reset to Defaults" });
  fireEvent(confirmation, new Event("cancel", { cancelable: true }));
  expect(screen.queryByRole("dialog", { name: "Reset to Defaults" })).toBeNull();
  expect((screen.getByRole("combobox", { name: "Theme" }) as HTMLSelectElement).value).toBe("dark");
  expect(close).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
});

test("reset previews defaults without committing and Cancel restores original preferences", () => {
  const preview = vi.fn();
  const commit = openAppearance({ isDesktop: true, theme: "dark", interfaceScalePercent: 80, onInterfaceScalePreview: preview });
  fireEvent.click(screen.getByRole("button", { name: "Reset to Defaults" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Reset to Defaults" })).getByRole("button", { name: "Reset to Defaults" }));
  expect(document.documentElement.getAttribute("data-oa-theme")).toBe("light");
  expect(preview).toHaveBeenLastCalledWith(100);
  expect(commit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Cancel|Annuleren/ }));
  expect(document.documentElement.getAttribute("data-oa-theme")).toBe("dark");
  expect(preview).toHaveBeenLastCalledWith(80);
});

test("language preview changes labels and the translated close action restores English", async () => {
  const commit = openAppearance();
  fireEvent.click(screen.getByRole("tab", { name: "General" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Language" }), { target: { value: "nl" } });
  await screen.findByRole("combobox", { name: "Taal" });
  fireEvent.click(screen.getByRole("button", { name: "Sluiten" }));
  await vi.waitFor(() => expect(i18n.language).toBe("en"));
  expect(commit).not.toHaveBeenCalled();
});

test("currency changes are saved and browser settings omit desktop controls", () => {
  const commit = openAppearance();
  expect(screen.queryByRole("slider")).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "General" }));
  expect(screen.queryByRole("checkbox")).toBeNull();
  fireEvent.change(screen.getByRole("combobox", { name: "Default currency" }), { target: { value: "USD" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(commit.mock.calls[0][0].defaultCurrencyCode).toBe("USD");
});

test("desktop connection transitions keep editing disabled", () => {
  const toggle = vi.fn();
  openAppearance({ isDesktop: true, mcpStatus: "starting", onMcpToggle: toggle });
  fireEvent.click(screen.getByRole("tab", { name: "General" }));
  expect((screen.getByRole("checkbox", { name: "Enable MCP access for this session" }) as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole("checkbox", { name: "Allow editing through MCP" }) as HTMLInputElement).disabled).toBe(true);
  expect(screen.getByRole("status").textContent).toBe("Starting connection…");
  expect(toggle).not.toHaveBeenCalled();
});

test("saving a new high contrast theme keeps the other application preferences", () => {
  const commit = openAppearance();
  fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), { target: { value: "high-contrast-light" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(commit).toHaveBeenCalledExactlyOnceWith({
    theme: "high-contrast-light", workspaceAppearance: "theme", language: "en", interfaceScalePercent: 100, defaultCurrencyCode: "EUR",
  });
  expect(document.documentElement.getAttribute("data-oa-theme")).toBe("high-contrast-light");
});

test("the plan background previews independently and Cancel restores it with the original theme", () => {
  const commit = openAppearance();
  fireEvent.change(screen.getByRole("combobox", { name: "Plan background" }), { target: { value: "dark" } });
  expect(document.documentElement.getAttribute("data-oa-workspace")).toBe("dark");
  expect(document.documentElement.getAttribute("data-oa-theme")).toBe("light");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(document.documentElement.getAttribute("data-oa-workspace")).toBe("theme");
  expect(commit).not.toHaveBeenCalled();
});

test("saving an explicit light plan background retains the dark application theme", () => {
  const commit = openAppearance();
  fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), { target: { value: "dark" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Plan background" }), { target: { value: "light" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(commit).toHaveBeenCalledExactlyOnceWith({
    theme: "dark", workspaceAppearance: "light", language: "en", interfaceScalePercent: 100, defaultCurrencyCode: "EUR",
  });
});
