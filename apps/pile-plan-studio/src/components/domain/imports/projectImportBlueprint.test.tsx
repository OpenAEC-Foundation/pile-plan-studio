import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import i18n from "../../../i18n/config.ts";
import ProjectImportPanel, { SheetValue } from "./ProjectImportPanel.tsx";
import SourceTableEditor from "./SourceTableEditor.tsx";
import type { SourceTablePreview } from "../../../core/coreImportContract.ts";

const core = vi.hoisted(() => ({ preview: vi.fn(), joint: vi.fn() }));
vi.mock("../../../core/coreClient.ts", () => ({
  previewImportSourceCore: core.preview, previewProjectImportCore: core.joint,
}));
const t = (key: string) => i18n.t(key, { ns: "common" });
beforeEach(() => {
  core.preview.mockReset().mockResolvedValue({ role: "cpts", requestedProfile: "auto",
    detectedProfile: "standard-table", resolvedProfile: "standard-table", resolvedOptions: {},
    availableProfiles: ["standard-table"], itemCount: 1, diagnostics: [], details: null });
  core.joint.mockReset().mockResolvedValue({ canApply: true, uniqueValueCount: 0,
    importedValueCount: 0, exactDuplicateCount: 0, orphanValueCount: 0, conflicts: [], diagnostics: [] });
});

test("guided project properties use labelled shared controls", () => {
  render(<ProjectImportPanel guided defaultCurrencyCode="GBP" onImportProject={vi.fn()} />);
  expect(screen.getByLabelText(t("importProject.projectName")).classList.contains("oa-field")).toBe(true);
  const currency = screen.getByRole("combobox", { name: t("importProject.currency") });
  expect((currency as HTMLSelectElement).value).toBe("GBP");
  expect(currency.classList.contains("oa-field")).toBe(true);
  expect(screen.getByRole("button", { name: t("firstProject.next") }).classList.contains("oa-button--primary")).toBe(true);
});

test("refresh only shows the chosen source tab and retains staged files when switching", async () => {
  const file = new File(["11,0,0"], "cpts.csv");
  Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(0) });
  render(<ProjectImportPanel defaultCurrencyCode="EUR" initialSource={{ role: "cpts", file }} onImportProject={vi.fn()} />);
  const cpts = screen.getByRole("tab", { name: t("importProject.roles.cpts") });
  const advice = screen.getByRole("tab", { name: t("importProject.roles.foundationAdvice") });
  expect(cpts.getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("tabpanel").querySelector('[title="cpts.csv"]')).not.toBeNull();
  fireEvent.click(advice);
  expect(advice.getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("tabpanel").querySelector('[title="cpts.csv"]')).toBeNull();
  fireEvent.click(cpts);
  expect(screen.getByRole("tabpanel").querySelector('[title="cpts.csv"]')).not.toBeNull();
  expect(screen.queryByLabelText(t("importProject.projectName"))).toBeNull();
  await waitFor(() => expect(core.preview).toHaveBeenCalledOnce());
});

test("guided import keeps entered properties when navigating source steps", () => {
  render(<ProjectImportPanel guided defaultCurrencyCode="EUR" onImportProject={vi.fn()} />);
  expect(screen.queryByRole("tablist")).toBeNull();
  const name = screen.getByLabelText(t("importProject.projectName"));
  fireEvent.change(name, { target: { value: "Test project" } });
  fireEvent.click(screen.getByRole("button", { name: t("firstProject.next") }));
  expect(screen.getByRole("heading", { level: 2, name: t("firstProject.loadPoints.title") })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: t("importProject.roles.cpts") })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: t("firstProject.previous") }));
  expect(screen.getByLabelText(t("importProject.projectName"))).toHaveProperty("value", "Test project");
  fireEvent.click(screen.getByRole("button", { name: t("firstProject.review.title") }));
  expect(screen.getAllByText(t("firstProject.missing"))).toHaveLength(4);
  expect(screen.getByRole("button", { name: t("importProject.submit") })).toHaveProperty("disabled", true);
});

test("the shared file action opens its native picker and clears selection after choosing", () => {
  const { container } = render(<ProjectImportPanel defaultCurrencyCode="EUR" onImportProject={vi.fn()} />);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const click = vi.spyOn(input, "click");
  const choose = screen.getByRole("button", { name: t("importProject.chooseFiles") });
  expect(choose.classList.contains("oa-button")).toBe(true);
  fireEvent.click(choose);
  expect(click).toHaveBeenCalledOnce();
  fireEvent.change(input, { target: { files: [] } });
  expect(input.value).toBe("");
});

test("pending submission disables source controls and a failed import shows a shared error banner", async () => {
  let reject!: (error: Error) => void;
  const apply = vi.fn(() => new Promise<null>((_resolve, fail) => { reject = fail; }));
  const file = new File(["1,0,0"], "cpts.csv");
  Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(0) });
  const { container } = render(<ProjectImportPanel initialSource={{ role: "cpts", file }}
    defaultCurrencyCode="EUR" onImportProject={apply} />);
  const submit = () => container.querySelector<HTMLButtonElement>(".project-import-submit")!;
  await waitFor(() => expect(submit().disabled).toBe(false));
  fireEvent.click(submit());
  await waitFor(() => expect(apply).toHaveBeenCalledOnce());
  expect(container.querySelector<HTMLFieldSetElement>(".project-import-controls")!.disabled).toBe(true);
  expect(screen.getByRole("button", { name: t("importProject.chooseFiles") }).matches(":disabled")).toBe(true);
  expect(submit().disabled).toBe(true);
  reject(new Error("Import failed"));
  await waitFor(() => expect(screen.getByRole("alert").classList.contains("oa-banner")).toBe(true));
  expect(screen.getByRole("alert").textContent).toContain("Import failed");
  expect(submit().disabled).toBe(false);
});

test("Blueprint source mapping preserves disabled empty columns and incomplete numeric drafts", () => {
  const preview: SourceTablePreview = { processed: false, sheets: [], row_count: 1,
    settings: { has_headers: false, first_data_row: 1, columns: [] },
    columns: [{ column: 1, header: "Empty", numeric_count: 0, nonempty_count: 0 }],
    rows: [{ number: 1, cells: [""] }] };
  const change = vi.fn();
  const { container } = render(<SourceTableEditor variant="blueprint" preview={preview} role="load-points" onChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: i18n.t("tableImport.selectColumn", { name: "Empty" }), hidden: true }));
  const meaning = screen.getByLabelText(t("tableImport.meaning")) as HTMLSelectElement;
  expect(meaning.classList.contains("oa-field")).toBe(true);
  expect(meaning.querySelector<HTMLOptionElement>('option[value="tension"]')!.disabled).toBe(true);
  const row = screen.getByLabelText(t("tableImport.dataRow")) as HTMLInputElement;
  expect(row.classList.contains("oa-field")).toBe(true);
  fireEvent.change(row, { target: { value: "" } });
  expect(row.value).toBe(""); expect(change).not.toHaveBeenCalled();
  fireEvent.blur(row); expect(row.value).toBe("1");
  expect(container.querySelector(".source-preview-table.oa-table")).not.toBeNull();
});

test("a Blueprint source error link focuses the original source cell and describes its error", () => {
  const preview: SourceTablePreview = { processed: false, sheets: [], row_count: 8,
    settings: { first_data_row: 7, columns: [] },
    columns: [{ column: 1, header: "Number", numeric_count: 0, nonempty_count: 1 }],
    rows: [{ number: 7, cells: ["invalid"] }] };
  const { container } = render(<SourceTableEditor variant="blueprint" preview={preview}
    sourceErrors={[{ row: 7, column: 1, message: "Invalid identifier" }, { row: 8, column: 1, message: "Another invalid identifier" }]} role="load-points" onChange={vi.fn()} />);
  const link = screen.getByRole("button", { name: i18n.t("tableImport.showError", { row: 7, column: 1 }) });
  expect(link.classList.contains("oa-button")).toBe(true);
  fireEvent.click(link);
  const cell = container.querySelector('[data-source-row="7"] td');
  expect(document.activeElement).toBe(cell);
  expect(screen.getByText("Invalid identifier").id).toBe(cell?.getAttribute("aria-describedby"));
  expect(screen.getByText("Another invalid identifier")).toBeTruthy();
  expect(screen.queryByRole("button", { name: i18n.t("tableImport.showError", { row: 8, column: 1 }) })).toBeNull();
});


test("worksheet fields use associated shared labels, disable the empty choice and preserve sheet names", () => {
  const change = vi.fn();
  const candidates = ["Nodes – level 0", "Nodes – level 1"];
  const view = render(<div className="project-import-rfem-grid"><SheetValue label="Coordinate sheet" candidates={candidates} value={null} placeholder="Choose sheet" onChange={change}/></div>);
  const select = screen.getByRole("combobox", {name:"Coordinate sheet"}) as HTMLSelectElement;
  expect(select.closest(".oa-label")).not.toBeNull();
  expect(select.options[0].disabled).toBe(true);
  expect(select.value).toBe("");
  fireEvent.change(select, {target:{value:candidates[1]}});
  expect(change).toHaveBeenCalledExactlyOnceWith(candidates[1]);
  view.rerender(<SheetValue label="Reaction sheet" candidates={["Reactions A", "Reactions B"]} value="Reactions A" placeholder="Choose sheet" onChange={change}/>);
  expect(screen.getByRole("combobox", {name:"Reaction sheet"})).toHaveProperty("value","Reactions A");
  expect(screen.getByRole("option", {name:"Choose sheet"})).toHaveProperty("disabled",true);
  view.rerender(<SheetValue label="Coordinate sheet" candidates={["Only sheet"]} value={null} placeholder="Choose sheet" onChange={change}/>);
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.getByText("Only sheet")).toBeTruthy();
  view.rerender(<SheetValue label="Coordinate sheet" candidates={[]} value={null} placeholder="Choose sheet" onChange={change}/>);
  expect(screen.getByText("-")).toBeTruthy();
});
