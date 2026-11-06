import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import i18n from "../../i18n/config.ts";
import TitleBar from "./TitleBar.tsx";
import FeedbackDialog from "./feedback/FeedbackDialog.tsx";
import StatusBar from "./StatusBar.tsx";
import ApplicationTooltip from "./ApplicationTooltip.tsx";

const external = vi.hoisted(() => ({ open: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "test-version" }));
vi.mock("@tauri-apps/plugin-os", () => ({ type: () => "windows", version: () => "test", arch: () => "x64" }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: external.open }));
vi.mock("html2canvas", () => ({ default: vi.fn() }));

test("title bar routes save/download actions and rejects disabled undo/redo", () => {
  const props = { projectActionKind: "save" as const, projectAction: vi.fn(), canUndo: false, canRedo: true,
    undoLabel: "Undo edit", redoLabel: "Redo edit", onUndo: vi.fn(), onRedo: vi.fn() };
  const view = render(<TitleBar {...props} />);
  expect(screen.getByRole("button", { name: i18n.t("save") }).querySelector("use")?.getAttribute("href"))
    .toMatch(/#i16-file\.save$/);
  fireEvent.click(screen.getByRole("button", { name: i18n.t("save") }));
  fireEvent.click(screen.getByRole("button", { name: "Undo edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Redo edit" }));
  expect(props.projectAction).toHaveBeenCalledOnce(); expect(props.onUndo).not.toHaveBeenCalled();
  expect(props.onRedo).toHaveBeenCalledOnce();
  view.rerender(<TitleBar {...props} projectActionKind="download" canUndo canRedo={false} />);
  const browserSave = screen.getByRole("button", { name: i18n.t("saveProjectDownload") });
  expect(browserSave.querySelector("use")?.getAttribute("href")).toMatch(/#i16-file\.save$/);
  expect(browserSave.getAttribute("data-tooltip")).toBe(`${i18n.t("saveProjectDownload")} (Ctrl+S)`);
  fireEvent.click(browserSave);
  fireEvent.click(screen.getByRole("button", { name: "Undo edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Redo edit" }));
  expect(props.projectAction).toHaveBeenCalledTimes(2); expect(props.onUndo).toHaveBeenCalledOnce();
  expect(props.onRedo).toHaveBeenCalledOnce();
});

test("shared titlebar actions expose shortcuts and use the application tooltip layer", () => {
  const view = render(<><ApplicationTooltip/><TitleBar projectActionKind="save" projectAction={vi.fn()}
    canUndo canRedo={false} undoLabel="Undo change" redoLabel="Redo change" onUndo={vi.fn()} onRedo={vi.fn()} /></>);
  const save = screen.getByRole("button", { name: i18n.t("save") });
  expect(save.classList.contains("oa-icon-button")).toBe(true);
  expect(save.getAttribute("aria-keyshortcuts")).toBe("Control+S");
  expect(save.getAttribute("data-oa-tip")).toBeNull();
  fireEvent.focus(save);
  expect(screen.getByRole("tooltip").textContent).toContain("Ctrl+S");
  expect(view.container.querySelector(".titlebar-alpha-badge .oa-status")).toBeTruthy();
  const redo = screen.getByRole("button", { name: "Redo change" });
  expect(redo.getAttribute("data-tooltip")).toBeNull();
});

test("shared statusbar announces messages and tracks rounded plan zoom without stale values", () => {
  const view = render(<StatusBar message="Project opened" zoomPercent={123.6} />);
  const status = screen.getByRole("status");
  expect(status.classList.contains("oa-statusbar")).toBe(true);
  expect(status.textContent).toContain("Project opened"); expect(status.textContent).toContain("124%");
  expect(status.textContent).toContain(i18n.t("version"));
  view.rerender(<StatusBar zoomPercent={75.1} />);
  expect(status.textContent).toContain("75%"); expect(status.textContent).not.toContain("124%");
  expect(status.textContent).not.toContain("Project opened");
});

test("titlebar activation keys stay with the control while application shortcuts still bubble", () => {
  const background = vi.fn(); window.addEventListener("keydown", background);
  try {
    render(<TitleBar projectActionKind="save" canUndo canRedo undoLabel="Undo" redoLabel="Redo" onUndo={vi.fn()} onRedo={vi.fn()} />);
    const save = screen.getByRole("button", { name: i18n.t("save") });
    fireEvent.keyDown(save, { key: " ", code: "Space" }); fireEvent.keyDown(save, { key: "Enter" });
    expect(background).not.toHaveBeenCalled();
    fireEvent.keyDown(save, { key: "z", ctrlKey: true }); expect(background).toHaveBeenCalledOnce();
  } finally { window.removeEventListener("keydown", background); }
});

test("title bar settings and feedback are keyboard reachable and retain their accessible actions", () => {
  const settings = vi.fn(), feedback = vi.fn();
  const props = { projectActionKind: "save" as const, projectAction: vi.fn(), canUndo: true, canRedo: false,
    undoLabel: "Undo edit", redoLabel: "Redo edit", onUndo: vi.fn(), onRedo: vi.fn(),
    onSettingsClick: settings, onFeedbackClick: feedback };
  render(<TitleBar {...props} />);
  for (const name of [i18n.t("save"), "Undo edit", i18n.t("preferences"), i18n.t("sendFeedback")]) {
    expect(screen.getByRole("button", { name }).tabIndex).toBe(0);
  }
  const preferences = screen.getByRole("button", { name: i18n.t("preferences") });
  const feedbackButton = screen.getByRole("button", { name: i18n.t("sendFeedback") });
  expect(preferences.querySelector("svg.application-settings-icon")).not.toBeNull();
  expect(feedbackButton.querySelector("use")?.getAttribute("href")).toMatch(/#i16-ui\.feedback$/);
  fireEvent.click(preferences); fireEvent.click(feedbackButton);
  expect(settings).toHaveBeenCalledOnce(); expect(feedback).toHaveBeenCalledOnce();
  expect((screen.getByRole("button", { name: "Redo edit" }) as HTMLButtonElement).disabled).toBe(true);
});

test("feedback requires the service minimum and sends without opening a GitHub editor", async () => {
  external.open.mockClear();
  const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, githubIssueUrl: null }) });
  vi.stubGlobal("fetch", request);
  render(<FeedbackDialog open onClose={vi.fn()} />);
  const submit = screen.getByRole("button", { name: i18n.t("submit", { ns: "feedback" }) });
  fireEvent.change(document.querySelector("textarea")!, { target: { value: " " } });
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(submit); expect(external.open).not.toHaveBeenCalled();
  fireEvent.change(document.querySelector("textarea")!, { target: { value: "x" } });
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(document.querySelector("textarea")!, { target: { value: "Feedback through the public API" } });
  fireEvent.click(submit); await waitFor(() => expect(request).toHaveBeenCalledOnce());
  expect(external.open).not.toHaveBeenCalled();
  expect(request.mock.calls[0][0]).toBe("https://open-feedback-studio.pages.dev/api/feedback");
});
