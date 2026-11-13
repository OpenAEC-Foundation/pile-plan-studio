import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import i18n from "../../../i18n/config.ts";
import SampleProjectTour from "./SampleProjectTour.tsx";

const t = (key: string) => i18n.t(key);

test("frames the map marker and guides the user through real workspace actions", async () => {
  const workspace = document.createElement("div");
  const close = vi.fn();
  const focusLoadPoint = vi.fn();
  const position = (element: HTMLElement, x: number, y: number, width: number, height: number) =>
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(x, y, width, height));
  position(workspace, 0, 0, 1000, 760);
  const marker = document.createElement("button");
  marker.textContent = "Load point 15";
  marker.dataset.mapMarkerKey = "load-point:15";
  const canvas = document.createElement("div");
  canvas.className = "viewer-canvas";
  position(canvas, 100, 120, 600, 600);
  const markerRect = position(marker, -300, 240, 20, 20);
  focusLoadPoint.mockImplementation(() => markerRect.mockReturnValue(new DOMRect(390, 400, 20, 20)));
  canvas.append(marker);
  const ribbonCpts = document.createElement("button");
  ribbonCpts.dataset.tourTarget = "cpts";
  position(ribbonCpts, 250, 70, 60, 42);
  const cpts = document.createElement("button");
  cpts.dataset.tourTarget = "cpts-tab";
  cpts.setAttribute("aria-pressed", "false");
  position(cpts, 830, 140, 60, 36);
  const options = document.createElement("button");
  options.dataset.tourTarget = "pile-options-tab";
  options.setAttribute("aria-pressed", "true");
  position(options, 730, 140, 95, 36);
  const selection = document.createElement("section");
  selection.dataset.tourTarget = "load-selection";
  const force = document.createElement("button");
  force.dataset.tourLoadPointId = "15";
  force.textContent = "79 kN";
  position(force, 740, 220, 190, 28);
  selection.append(force);
  const cptIds = [61, 62, 64, 63];
  cptIds.forEach((id, index) => {
    const cpt = document.createElement("button");
    cpt.dataset.mapMarkerKey = `cpt:${id}`;
    position(cpt, 280 + index * 70, 290, 20, 20);
    canvas.append(cpt);
  });
  workspace.append(canvas, ribbonCpts, cpts, options);
  document.body.append(workspace);
  try {
    const view = render(<SampleProjectTour workspace={workspace} selectedLoadPointIds={[15]}
      cptsByLoadPointId={new Map([[15, cptIds.map(id => ({ cpt: { id, name: String(id), x_mm: 0, y_mm: 0 },
        label: String(id), distance_mm: 100 }))]])}
      onFocusLoadPoint={focusLoadPoint} onClose={close} />);
    expect(focusLoadPoint).toHaveBeenCalledExactlyOnceWith(15);
    await waitFor(() => expect(marker.dataset.tourHighlight).toBe("true"));
    expect(view.container.querySelector(".sample-project-tour-spotlight")).toBeTruthy();
    expect(document.activeElement).toBe(marker);
    expect(screen.queryByRole("button", { name: "Go to highlight" })).toBeNull();

    const next = () => screen.getByRole<HTMLButtonElement>("button", { name: t("firstProject.next") });
    expect(next().disabled).toBe(true);
    workspace.append(selection);
    fireEvent.click(marker);
    expect(next().disabled).toBe(false);
    expect(force.dataset.tourHighlight).toBe("true");
    expect(screen.getByText(t("sampleTour.hints.inspectLoad"))).toBeTruthy();
    fireEvent.click(next());
    expect(marker.dataset.tourHighlight).toBeUndefined();
    expect(cpts.dataset.tourHighlight).toBe("true");
    expect(ribbonCpts.dataset.tourHighlight).toBeUndefined();
    const mapWindow = () => view.container.querySelector(".sample-project-tour-map-window")?.getAttribute("d");
    expect(mapWindow()).toBeTruthy();
    expect(view.container.querySelectorAll(".sample-project-tour-cpt-window")).toHaveLength(4);
    expect(focusLoadPoint).toHaveBeenLastCalledWith(15, cptIds);
    expect(screen.getByText(i18n.t("sampleTour.cpts.selection", { count: 4 }))).toBeTruthy();
    const firstMapWindow = mapWindow();
    markerRect.mockReturnValue(new DOMRect(430, 385, 20, 20));
    fireEvent.wheel(canvas);
    await waitFor(() => expect(mapWindow()).not.toBe(firstMapWindow));
    const cptTable = document.createElement("table");
    cptTable.tabIndex = -1;
    cptTable.dataset.tourTarget = "cpt-overview";
    const cptLink = document.createElement("button");
    cptLink.dataset.tourTarget = "cpt-link";
    position(cptLink, 730, 240, 42, 30);
    cptTable.append(cptLink);
    cpts.onclick = () => {
      cpts.setAttribute("aria-pressed", "true");
      options.setAttribute("aria-pressed", "false");
      workspace.append(cptTable);
    };
    fireEvent.click(cpts);
    await waitFor(() => expect(cptLink.dataset.tourHighlight).toBe("true"));
    expect(cpts.dataset.tourHighlight).toBeUndefined();
    expect(next().disabled).toBe(true);
    const advice = document.createElement("table");
    advice.dataset.tourTarget = "cpt-advice";
    position(advice, 730, 220, 240, 280);
    cptLink.onclick = () => cptTable.replaceWith(advice);
    fireEvent.click(cptLink);
    await waitFor(() => expect(advice.dataset.tourHighlight).toBe("true"));
    expect(mapWindow()).toBeTruthy();
    expect(view.container.querySelectorAll(".sample-project-tour-cpt-window")).toHaveLength(4);

    const option = document.createElement("div");
    option.tabIndex = 0;
    option.dataset.tourTarget = "pile-option";
    option.setAttribute("aria-selected", "false");
    position(option, 720, 320, 260, 30);
    fireEvent.click(next());
    expect(options.dataset.tourHighlight).toBe("true");
    expect(mapWindow()).toBeTruthy();
    expect(view.container.querySelectorAll(".sample-project-tour-cpt-window")).toHaveLength(0);
    options.onclick = () => {
      advice.remove();
      options.setAttribute("aria-pressed", "true");
      workspace.append(option);
    };
    fireEvent.click(options);
    await waitFor(() => expect(option.dataset.tourHighlight).toBe("true"));
    expect(next().disabled).toBe(true);
    option.onclick = () => option.setAttribute("aria-selected", "true");
    fireEvent.click(option);
    await screen.findByText(t("sampleTour.hints.inspectAssignment"));

    const run = document.createElement("button");
    run.dataset.tourTarget = "run-optimization";
    position(run, 730, 160, 140, 40);
    const result = document.createElement("section");
    position(result, 715, 215, 265, 400);
    workspace.append(run, result);
    fireEvent.click(next());
    expect(run.dataset.tourHighlight).toBe("true");
    expect(mapWindow()).toBeUndefined();
    const finish = () => screen.getByRole<HTMLButtonElement>("button", { name: t("sampleTour.finish") });
    expect(finish().disabled).toBe(true);
    run.onclick = () => { result.dataset.tourTarget = "optimization-result"; };
    fireEvent.click(run);
    await waitFor(() => expect(result.dataset.tourHighlight).toBe("true"));
    expect(run.dataset.tourHighlight).toBeUndefined();
    expect(finish().disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: t("sampleTour.skip") }));
    expect(close).toHaveBeenCalledOnce();
    view.unmount();
    expect(result.dataset.tourHighlight).toBeUndefined();
  } finally {
    workspace.remove();
  }
});
