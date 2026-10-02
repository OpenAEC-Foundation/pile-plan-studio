import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import i18n from "../../i18n/config.ts";
import TitleBar from "./TitleBar.tsx";
import FeedbackDialog from "./feedback/FeedbackDialog.tsx";

const external = vi.hoisted(() => ({ open: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "test-version" }));
vi.mock("@tauri-apps/plugin-os", () => ({ type: () => "windows", version: () => "test", arch: () => "x64" }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: external.open }));
vi.mock("html2canvas", () => ({ default: vi.fn() }));

test("title bar routes save/download actions and rejects disabled undo/redo", () => {
  const props = { projectActionKind: "save" as const, projectAction: vi.fn(), canUndo: false, canRedo: true,
    undoLabel: "Undo edit", redoLabel: "Redo edit", onUndo: vi.fn(), onRedo: vi.fn() };
  const view = render(<TitleBar {...props} />);
  fireEvent.click(screen.getByRole("button", { name: i18n.t("save") }));
  fireEvent.click(screen.getByRole("button", { name: "Undo edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Redo edit" }));
  expect(props.projectAction).toHaveBeenCalledOnce(); expect(props.onUndo).not.toHaveBeenCalled();
  expect(props.onRedo).toHaveBeenCalledOnce();
  view.rerender(<TitleBar {...props} projectActionKind="download" canUndo canRedo={false} />);
  fireEvent.click(screen.getByRole("button", { name: i18n.t("downloadIfcpp") }));
  fireEvent.click(screen.getByRole("button", { name: "Undo edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Redo edit" }));
  expect(props.projectAction).toHaveBeenCalledTimes(2); expect(props.onUndo).toHaveBeenCalledOnce();
  expect(props.onRedo).toHaveBeenCalledOnce();
});

test("feedback rejects whitespace and prepares a one-character issue for the product repository", async () => {
  external.open.mockClear();
  render(<FeedbackDialog open onClose={vi.fn()} />);
  const submit = screen.getByRole("button", { name: i18n.t("submitToGithub", { ns: "feedback", defaultValue: "Open GitHub issue" }) });
  fireEvent.change(document.querySelector("textarea")!, { target: { value: " " } });
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(submit); expect(external.open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(document.querySelector("textarea")!, { target: { value: "x" } });
  fireEvent.click(submit); await waitFor(() => expect(external.open).toHaveBeenCalledOnce());
  const url = new URL(external.open.mock.calls[0][0]);
  expect(url.origin).toBe("https://github.com");
  expect(url.pathname).toBe("/OpenAEC-Foundation/pile-plan-studio/issues/new");
  expect(url.searchParams.get("body")).toContain("x");
});
