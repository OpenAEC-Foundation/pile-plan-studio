import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import i18n from "../../../i18n/config.ts";
import ProjectImportPanel from "./ProjectImportPanel.tsx";
import PilePlanImportPanel from "./PilePlanImportPanel.tsx";
import type { ImportSourceInput } from "../../../core/coreImportContract.ts";
import type { PilePlanImportRequest } from "../../../core/pilePlanImportContract.ts";

const core = vi.hoisted(() => ({ project: vi.fn(), plan: vi.fn(), joint: vi.fn() }));
vi.mock("../../../core/coreClient.ts", () => ({ previewImportSourceCore: core.project, previewPilePlanImportCore: core.plan, previewProjectImportCore: core.joint }));
const t = (key: string, ns = "common") => i18n.t(key, { ns });
function file(name: string) {
  const file = new File(["source data"], name);
  Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode("source data").buffer });
  return file;
}
function projectPreview(input: ImportSourceInput) {
  if (input.role === "bearing-capacities") return { role: input.role, requestedProfile: input.profile, detectedProfile: "standard-table", resolvedProfile: "standard-table", availableProfiles: ["standard-table"], resolvedOptions: input.profileOptions, itemCount: 1, diagnostics: [], details: { kind: "foundation-advice", advice: { sourceId: input.sourceId, suggestedSelection: [], diagnostics: [], sheets: [{ sheetName: "", status: "ready", detectedProfile: "standard-table", resolvedProfile: "standard-table", diagnostics: [], summary: { itemCount: 1, cptCount: 1, pileSizesMm: [290], minTipLevelMm: -18000, maxTipLevelMm: -18000, missingCellCount: 0 } }] } } };
  return { role: input.role, requestedProfile: input.profile, detectedProfile: "standard-table",
    resolvedProfile: "standard-table", availableProfiles: ["standard-table"],
    resolvedOptions: input.profileOptions, itemCount: 1, diagnostics: [], details: null };
}
const planPreview = { requestedProfile: "automatic", detectedProfile: "standard-table", supportsCptSelections: true,
  canApply: true, summary: { sourceRows: 1, matchedRows: 1, skippedRows: 0, coordinateFallbacks: 0, conflicts: 0 },
  diagnostics: [], patch: { rows: [] } };
beforeEach(() => {
  core.joint.mockReset().mockResolvedValue({ canApply: true, uniqueValueCount: 1, importedValueCount: 1, exactDuplicateCount: 0, orphanValueCount: 0, conflicts: [], diagnostics: [] });
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

test("load-point refresh requires a reviewed mapping and passes the confirmed project context", async () => {
  const apply = vi.fn().mockResolvedValue(null);
  const prepare = vi.fn().mockResolvedValue({
    old_locations: [{id: 10, x_mm: 0, y_mm: 0}],
    new_locations: [{id: 20, x_mm: 0, y_mm: 0}],
    matching: {links: [{old_id: 10, new_id: 20, distance_mm: 0}], added: [], removed: [], unmatched_old: [], unmatched_new: [], proposals: [], complete: true},
  });
  render(<ProjectImportPanel initialSource={{role: "load-points", file: file("load-points.csv")}} defaultCurrencyCode="EUR" onImportProject={apply} onPrepareLoadPointRefresh={prepare} importPreviewContextKey="revision-1" />);
  const review = await screen.findByRole("button", {name: t("exportTools.refreshReview")});
  await waitFor(() => expect((review as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(review);
  await screen.findByRole("region", {name: t("exportTools.matchingTitle")});
  expect(apply).not.toHaveBeenCalled();
  expect(prepare).toHaveBeenCalledWith(expect.any(Array), 1);
  fireEvent.click(screen.getByRole("button", {name: t("exportTools.confirm")}));
  fireEvent.click(screen.getAllByRole("button", {name: t("importProject.refreshSubmit")})[1]);
  await waitFor(() => expect(apply).toHaveBeenCalledOnce());
  expect(apply.mock.calls[0][4]).toEqual({contextKey: "revision-1", decisions: {links: [{old_id: 10, new_id: 20}], added: [], removed: []}});
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
  await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
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

test("successful refresh clears staged replacements so they cannot target a removed advice", async () => {
  const apply=vi.fn().mockResolvedValue({loadPointCount:1,cptCount:1,bearingCapacityCount:1,warnings:[]});
  core.joint.mockImplementation(async ({ sources }) => ({canApply:sources.length>0,existingSources:[],uniqueValueCount:1,importedValueCount:1,exactDuplicateCount:0,orphanValueCount:0,conflicts:[],diagnostics:[]}));
  render(<ProjectImportPanel initialSource={{role:"bearing-capacities",file:file("extra.csv")}} defaultCurrencyCode="EUR" onImportProject={apply} />);
  const submit=(await screen.findAllByRole("button",{name:t("importProject.refreshSubmit")}))[1];
  await waitFor(()=>expect((submit as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(submit);
  await waitFor(()=>expect(apply).toHaveBeenCalledOnce());
  await waitFor(()=>expect(screen.queryByText("extra.csv")).toBeNull());
  expect((submit as HTMLButtonElement).disabled).toBe(true);
});

test("advice-only new-project selection explains missing files without reporting zero imported values", async()=>{
  const view=render(<ProjectImportPanel defaultCurrencyCode="EUR" onImportProject={vi.fn()} />);
  fireEvent.change(view.container.querySelectorAll('input[type="file"]')[3],{target:{files:[file("advice.csv")]}});
  await screen.findByText(i18n.t("importProject.status.validCount",{count:1}));
  expect(screen.getByText(t("importProject.advice.requiresLoadPointsAndCpts"))).toBeTruthy();
  expect(view.container.querySelector(".advice-import-diagnostics")).toBeNull();
  expect((screen.getByRole("button",{name:t("importProject.submit")}) as HTMLButtonElement).disabled).toBe(true);
});
