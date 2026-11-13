import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import i18n from "../../../i18n/config.ts";
import ProjectStartScreen from "./ProjectStartScreen.tsx";
import type { RecentFile } from "../../../domain/project/recentProjects.ts";

const actions = () => ({
  busy: false, onShowPage: vi.fn(), onResume: vi.fn(), onSample: vi.fn(),
  onTour: vi.fn(), onOpenProject: vi.fn(), onOpenRecent: vi.fn(), onRemoveRecent: vi.fn(),
});

test("fresh startup leaves the heading unfocused and in-app navigation moves focus", () => {
  const props = actions();
  const view = render(<ProjectStartScreen {...props} page="home" />);
  const title = screen.getByRole("heading", { name: i18n.t("startScreen.title") });
  expect(document.activeElement).not.toBe(title);

  fireEvent.click(screen.getByRole("button", { name: new RegExp(i18n.t("startScreen.newProject")) }));
  expect(props.onShowPage).toHaveBeenCalledWith("new");
  view.rerender(<ProjectStartScreen {...props} page="new" />);
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: i18n.t("startScreen.newProject") }));
});

test("all recent projects appear in one list and open directly", () => {
  const recentFiles: RecentFile[] = [
    { path: "browser:a", name: "First.ifcpp", type: "project", timestamp: 3, storage: "browser" },
    { path: "C:/Projects/Second.ifcpp", name: "Second.ifcpp", type: "project", timestamp: 2 },
    { path: "C:/Projects/Third.ifcpp", name: "Third.ifcpp", type: "project", timestamp: 1 },
  ];
  const props = actions();
  const { rerender } = render(<ProjectStartScreen {...props} page="home" recentFiles={recentFiles} />);

  const cards = screen.getByRole("region", { name: i18n.t("startScreen.recentProjects") });
  const projects = within(cards).getAllByRole("listitem");
  expect(projects.map(card => card.querySelector(".oa-tile-title")?.textContent))
    .toEqual(["First.ifcpp", "Second.ifcpp", "Third.ifcpp"]);
  expect(within(cards).queryByText("browser:a")).toBeNull();
  expect(screen.getAllByRole("list")).toHaveLength(1);

  const open = (name: string) => i18n.t("backstage:openPanel.openRecent", { name });
  const remove = i18n.t("backstage:openPanel.removeFile", { name: "First.ifcpp" });
  fireEvent.click(within(projects[0]).getByRole("button", { name: remove }));
  expect(props.onRemoveRecent).toHaveBeenCalledExactlyOnceWith("browser:a");
  expect(props.onOpenRecent).not.toHaveBeenCalled();
  fireEvent.click(within(cards).getByRole("button", { name: open("First.ifcpp") }));
  fireEvent.click(within(cards).getByRole("button", { name: open("Third.ifcpp") }));
  expect(props.onOpenRecent.mock.calls).toEqual([["browser:a"], ["C:/Projects/Third.ifcpp"]]);

  rerender(<ProjectStartScreen {...props} page="home" busy recentFiles={recentFiles} />);
  expect(within(cards).getByRole("button", { name: open("First.ifcpp") }).matches(":disabled")).toBe(true);
  expect(within(cards).getByRole("button", { name: remove }).matches(":disabled")).toBe(true);
});

test("Open project uses the shared open command directly", () => {
  const props = actions();
  render(<ProjectStartScreen {...props} page="home" />);
  fireEvent.click(screen.getByRole("button", { name: new RegExp(i18n.t("startScreen.openProject")) }));
  expect(props.onOpenProject).toHaveBeenCalledOnce();
  expect(props.onShowPage).not.toHaveBeenCalled();
});
