import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import i18n from "../../../i18n/config.ts";
import PilePlanImportPanel from "./PilePlanImportPanel.tsx";
import PilePlanExportPanel from "../exports/PilePlanExportPanel.tsx";

const core = vi.hoisted(() => ({ plan: vi.fn(), exported: vi.fn(), revision: vi.fn() }));
vi.mock("../../../core/coreClient.ts", () => ({ previewPilePlanImportCore: core.plan }));
vi.mock("../../../core/exportRevisionCoreClient.ts", () => ({
  previewPilePlanExportCore: core.exported, previewRevitRevisionCore: core.revision,
  reconcileLocationsCore: vi.fn(), inspectPileTableCore: vi.fn(),
}));
const t = (key: string, ns = "common") => i18n.t(key, { ns });
const input = { loadPoints: [], selectedPiles: new Map(), selectedCpts: new Map(), pileShapes: new Map(), pileSizeFormat: "numeric" as const };
const file = () => { const f = new File(["data"], "plan.csv"); Object.defineProperty(f, "arrayBuffer", { value: async () => new ArrayBuffer(0) }); return f; };
beforeEach(() => {
  core.plan.mockReset().mockResolvedValue({ requestedProfile: "automatic", detectedProfile: "standard-table",
    supportsCptSelections: true, canApply: true, diagnostics: [], patch: { rows: [] },
    summary: { sourceRows: 1, matchedRows: 1, skippedRows: 0, coordinateFallbacks: 0, conflicts: 0 } });
  core.exported.mockReset().mockResolvedValue({ table: { headers: ["ID"], rows: [[7]] }, tip_codes: [], annotations: [] });
});
test("pile-plan import uses shared file/category/profile controls and imports the accepted preview", async () => {
  const apply = vi.fn(); const { container } = render(<PilePlanImportPanel loadPoints={[]} cpts={[]} availablePileConfigurations={[]} onImportPilePlan={apply} />);
  expect(screen.getByRole("button", { name: t("pilePlanImport.choose", "backstage") }).classList.contains("oa-button")).toBe(true);
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file()] } });
  await waitFor(() => expect(core.plan).toHaveBeenCalledOnce());
  const profile = screen.getByRole("combobox", { name: t("pilePlanImport.profile", "backstage"), hidden: true });
  expect(profile.classList.contains("oa-field")).toBe(true);
  expect(screen.getByRole("checkbox", { name: t("pilePlanImport.cptSelections", "backstage"), hidden: true }).closest(".oa-check")).not.toBeNull();
  const submit = screen.getByRole("button", { name: t("pilePlanImport.import", "backstage") });
  await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
  expect(submit.classList.contains("oa-button--primary")).toBe(true);
  fireEvent.click(submit); expect(apply).toHaveBeenCalledWith(expect.anything(), "plan.csv");
});
test("an import failure keeps submission blocked and shows the actual shared error banner", async () => {
  core.plan.mockRejectedValue(new Error("Bad source"));
  const { container } = render(<PilePlanImportPanel loadPoints={[]} cpts={[]} availablePileConfigurations={[]} onImportPilePlan={vi.fn()} />);
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file()] } });
  const error = await screen.findByRole("alert"); expect(error.classList.contains("oa-banner")).toBe(true);
  expect(error.textContent).toContain("Bad source");
  expect((screen.getByRole("button", { name: t("pilePlanImport.import", "backstage") }) as HTMLButtonElement).disabled).toBe(true);
});
test("shared export mode/plan controls preserve the existing export callback and primary action", async () => {
  const exported = vi.fn().mockResolvedValue(undefined), choosePlan = vi.fn();
  render(<PilePlanExportPanel activePilePlanName="Plan" pileSizeFormat="numeric" exportPlan={input} exportContextKey="blueprint-io"
    exportPlans={[{ id: "a", name: "Plan A" }, { id: "b", name: "Plan B" }]} exportPlanId="a" onExportPlanChange={choosePlan}
    running={false} runExport={run => void run()} onExportPilePlanXlsx={exported} onExportPilePlanCsv={async () => {}} />);
  const choice = screen.getByRole("combobox", { name: t("exportTools.exportPilePlan") }); expect(choice.classList.contains("oa-field")).toBe(true);
  fireEvent.change(choice, { target: { value: "b" } }); expect(choosePlan).toHaveBeenCalledWith("b");
  const action = screen.getByRole("button", { name: t("exportPanel.exportExcel", "backstage") });
  await waitFor(() => expect((action as HTMLButtonElement).disabled).toBe(false));
  expect(action.classList.contains("oa-button--primary")).toBe(true);
  fireEvent.click(action); await waitFor(() => expect(exported).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: t("exportTools.revisionMode") }));
  expect(screen.getByLabelText(t("exportTools.oldSource")).getAttribute("type")).toBe("file");
  expect(screen.getByRole("button", { name: t("exportTools.revisionMode") }).classList.contains("oa-button")).toBe(true);
});

test("missing mappings explain what to connect instead of referring to nonexistent errors", async () => {
  core.plan.mockResolvedValue({ requestedProfile: "automatic", detectedProfile: "standard-table", supportsPileAssignments: false,
    supportsCptSelections: false, canApply: false, diagnostics: [], patch: { changes: [] },
    summary: { sourceRows: 1, matchedRows: 1, skippedRows: 0, coordinateFallbacks: 0, conflicts: 0 } });
  const { container } = render(<PilePlanImportPanel loadPoints={[]} cpts={[]} availablePileConfigurations={[]} onImportPilePlan={vi.fn()} />);
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file()] } });
  await screen.findByText(t("pilePlanImport.mapImportColumns", "backstage"));
  expect(screen.queryByText(t("pilePlanImport.invalid", "backstage"))).toBeNull();
});

test("deselecting every available import category names the unchecked choices", async () => {
  core.plan.mockImplementation(async request => ({ requestedProfile: "automatic", detectedProfile: "standard-table", supportsPileAssignments: true,
    supportsCptSelections: false, canApply: request.options.importPileAssignments, diagnostics: [], patch: { changes: [] },
    summary: { sourceRows: 1, matchedRows: 1, skippedRows: 0, coordinateFallbacks: 0, conflicts: 0 } }));
  const { container } = render(<PilePlanImportPanel loadPoints={[]} cpts={[]} availablePileConfigurations={[]} onImportPilePlan={vi.fn()} />);
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file()] } });
  const checkbox = screen.getByLabelText(t("pilePlanImport.pileAssignments", "backstage"));
  await waitFor(() => expect((checkbox as HTMLInputElement).checked).toBe(true));
  await screen.findByText(t("pilePlanImport.ready", "backstage"));
  fireEvent.click(checkbox);
  await screen.findByText(t("pilePlanImport.chooseCategory", "backstage"));
  expect(screen.queryByText(t("pilePlanImport.invalid", "backstage"))).toBeNull();
});
