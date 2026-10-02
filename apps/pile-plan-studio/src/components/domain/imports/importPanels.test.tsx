import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import i18n from "../../../i18n/config.ts";
import ProjectImportPanel from "./ProjectImportPanel.tsx";
import PilePlanImportPanel from "./PilePlanImportPanel.tsx";
import type { ImportSourceInput } from "../../../core/coreImportContract.ts";
import type { PilePlanImportRequest } from "../../../core/pilePlanImportContract.ts";

const core = vi.hoisted(() => ({ project: vi.fn(), plan: vi.fn() }));
vi.mock("../../../core/coreClient.ts", () => ({ previewImportSourceCore: core.project, previewPilePlanImportCore: core.plan }));
const t = (key: string, ns = "common") => i18n.t(key, { ns });
function file(name: string) {
  const file = new File(["source data"], name);
  Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode("source data").buffer });
  return file;
}
function projectPreview(input: ImportSourceInput) {
  return { role: input.role, requestedProfile: input.profile, detectedProfile: "standard-table",
    resolvedProfile: "standard-table", availableProfiles: ["standard-table"],
    resolvedOptions: input.profileOptions, itemCount: 1, diagnostics: [], details: null };
}
const planPreview = { requestedProfile: "automatic", detectedProfile: "standard-table", supportsCptSelections: true,
  canApply: true, summary: { sourceRows: 1, matchedRows: 1, skippedRows: 0, coordinateFallbacks: 0, conflicts: 0 },
  diagnostics: [], patch: { rows: [] } };
beforeEach(() => {
  core.project.mockReset().mockImplementation(async input => projectPreview(input));
  core.plan.mockReset().mockResolvedValue(planPreview);
});

test("a selected initial source enters refresh mode, previews, and submits only that source", async () => {
  const apply = vi.fn().mockResolvedValue(null), source = file("cpts.csv");
  render(<ProjectImportPanel initialSource={{ role: "cpts", file: source }} defaultCurrencyCode="EUR" onImportProject={apply} />);
  const submit = (await screen.findAllByRole("button", { name: t("importProject.refreshSubmit") }))[1];
  await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
  expect(screen.queryByLabelText(t("importProject.projectName"))).toBeNull();
  expect(core.project).toHaveBeenCalledWith(expect.objectContaining({ role: "cpts", fileName: "cpts.csv" }));
  fireEvent.click(submit);
  await waitFor(() => expect(apply).toHaveBeenCalledOnce());
  expect(apply.mock.calls[0][0]).toBe("refresh");
  expect(apply.mock.calls[0][1]).toBeNull();
  expect(apply.mock.calls[0][2].map((s: ImportSourceInput) => s.role)).toEqual(["cpts"]);
  expect(apply.mock.calls[0][3]).toBeNull();
});

test("new-project submission is blocked until the reference level is valid, and sends normalized properties", async () => {
  const apply = vi.fn().mockResolvedValue(null);
  const view = render(<ProjectImportPanel defaultCurrencyCode="GBP" onImportProject={apply} />);
  const inputs = view.container.querySelectorAll('input[type="file"]');
  for (const [index, name] of ["load-points.csv", "cpts.csv", "bearing-capacities.csv"].entries()) {
    fireEvent.change(inputs[index + 1], { target: { files: [file(name)] } });
  }
  const submit = screen.getByRole("button", { name: t("importProject.submit") });
  const level = view.container.querySelector('input[required]')!;
  await waitFor(() => expect(level.getAttribute("aria-invalid")).toBe("true"));
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(submit); expect(apply).not.toHaveBeenCalled();
  fireEvent.change(level, { target: { value: "-1,25" } });
  fireEvent.change(screen.getByLabelText(t("importProject.projectName")), { target: { value: "  P  " } });
  fireEvent.click(submit);
  await waitFor(() => expect(apply).toHaveBeenCalledOnce());
  expect(apply.mock.calls[0][1]).toBe("P");
  expect(apply.mock.calls[0][3]).toEqual({ pileHeadLevelM: -1.25, currencyCode: "GBP" });
});

test("pending previews and a failed final import block submission and surface the actual error", async () => {
  let resolve!: (value: ReturnType<typeof projectPreview>) => void;
  core.project.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const apply = vi.fn().mockRejectedValue(new Error("import rejected"));
  render(<ProjectImportPanel initialSource={{ role: "cpts", file: file("cpts.csv") }} defaultCurrencyCode="EUR" onImportProject={apply} />);
  const submit = (await screen.findAllByRole("button", { name: t("importProject.refreshSubmit") }))[1];
  await waitFor(() => expect(core.project).toHaveBeenCalledOnce());
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  await act(async () => resolve(projectPreview(core.project.mock.calls[0][0])));
  fireEvent.click(submit);
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  expect((await screen.findByRole("alert")).textContent).toBe("import rejected");
  expect((screen.getAllByRole("button", { name: t("importProject.refreshSubmit") })[1] as HTMLButtonElement).disabled).toBe(false);
});

test("pile-plan import delivers the eligible core patch with its filename and rejects an invalid preview", async () => {
  const apply = vi.fn();
  const view = render(<PilePlanImportPanel loadPoints={[]} cpts={[]} availablePileConfigurations={[]} onImportPilePlan={apply} />);
  const submit = screen.getByRole("button", { name: t("pilePlanImport.import", "backstage") });
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [file("plan.csv")] } });
  await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(submit); expect(apply).toHaveBeenCalledExactlyOnceWith(planPreview.patch, "plan.csv");
  core.plan.mockResolvedValueOnce({ ...planPreview, canApply: false, diagnostics: [{
    code: "invalid-row", severity: "error", location: { sheetName: null, row: 3, column: 2 },
  }] });
  fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [file("invalid.csv")] } });
  await waitFor(() => expect(core.plan).toHaveBeenCalledTimes(2));
  await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(true));
  expect(view.container.querySelector(".pile-plan-import-diagnostics")?.textContent).toContain(t("pilePlanImport.diagnostics.invalid-row", "backstage"));
  fireEvent.click(submit); expect(apply).toHaveBeenCalledTimes(1);
});

test("pile and CPT categories independently alter the next preview request; legacy disables CPT import", async () => {
  const view = render(<PilePlanImportPanel loadPoints={[]} cpts={[]} availablePileConfigurations={[]} onImportPilePlan={vi.fn()} />);
  fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [file("plan.csv")] } });
  await waitFor(() => expect(core.plan).toHaveBeenCalledOnce());
  const boxes = screen.getAllByRole("checkbox");
  fireEvent.click(boxes[0]);
  await waitFor(() => expect(core.plan).toHaveBeenCalledTimes(2));
  expect((core.plan.mock.calls[1][0] as PilePlanImportRequest).options).toMatchObject({ importPileAssignments: false, importCptSelections: true });
  core.plan.mockResolvedValueOnce({ ...planPreview, detectedProfile: "legacy", supportsCptSelections: false });
  fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [file("legacy.csv")] } });
  await waitFor(() => expect((boxes[1] as HTMLInputElement).disabled).toBe(true));
});
