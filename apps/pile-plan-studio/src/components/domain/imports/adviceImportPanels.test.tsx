import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import i18n from "../../../i18n/config.ts";
import AdviceImportDiagnostics from "./AdviceImportDiagnostics.tsx";
import type { ProjectImportPreview } from "../../../core/adviceImportContract.ts";

test("all conflicts and every physical source remain inspectable", () => {
  const preview: ProjectImportPreview = { canApply: false, uniqueValueCount: 0, importedValueCount: 0,
    orphanValueCount: 0, exactDuplicateCount: 0, diagnostics: [], conflicts: Array.from({ length: 51 }, (_, i) => ({
      cptId: i + 1, pileSizeMm: 290, pileTipLevelMm: -15000, values: [500, 500.00000000000006].map((frdKn, j) => ({
        frdKn, locations: [{ sourceId: `source-${j}`, fileName: "advies.xlsx", sheetName: "diep", row: i + 2, column: 4 }],
      })),
    })) };
  render(<AdviceImportDiagnostics preview={preview} />);
  expect(screen.getAllByText(/500\.00000000000006/).length).toBe(50);
  fireEvent.click(screen.getByRole("button", { name: i18n.t("importProject.advice.next") }));
  expect(screen.getAllByText(/500\.00000000000006/).length).toBe(1);
  expect(screen.getAllByText(/D52/).length).toBe(2);
});
import AdviceImportSources from "./AdviceImportSources.tsx";
import { createEmptyAdviceDraft, addAdviceSource, type AdviceDraft } from "../../../domain/imports/adviceImportModel.ts";
import { useState } from "react";

function AdviceHarness({ initial = createEmptyAdviceDraft<File>(), refresh = false }: { initial?: AdviceDraft<File>; refresh?: boolean }) {
  const [draft, setDraft] = useState(initial);
  return <AdviceImportSources draft={draft} onChange={setDraft} refresh={refresh} />;
}

test("advice starts with one matching import card and adds another empty card", () => {
  render(<AdviceHarness />);
  expect(screen.getAllByText(i18n.t("importProject.profile.label"))).toHaveLength(1);
  expect(screen.getAllByText(i18n.t("importProject.choose"))).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: i18n.t("importProject.advice.addAdvice") }));
  expect(screen.getAllByText(i18n.t("importProject.profile.label"))).toHaveLength(2);
});

test("a single worksheet is automatic; multiple worksheets expose explicit selection", () => {
  let initial = addAdviceSource(createEmptyAdviceDraft<File>(), "file", new File([], "advies.xlsx"));
  const sheet = { sheetName: "diep", status: "ready" as const, detectedProfile: "standard-table" as const, resolvedProfile: "standard-table" as const,
    summary: {itemCount: 2, cptCount: 1, pileSizesMm: [290], minTipLevelMm: -15000, maxTipLevelMm: -14000, missingCellCount: 0}, diagnostics: [] };
  initial.sources[0].discovery = {status:"ready",requestId:1,preview:{sourceId:"file",sheets:[sheet],suggestedSelection:[{sheetName:"diep",profile:"standard-table"}],diagnostics:[]}};
  const { unmount } = render(<AdviceHarness initial={initial} />);
  expect(screen.queryByRole("checkbox")).toBeNull();
  unmount();
  initial = {...initial, sources: [{...initial.sources[0], discovery:{status:"ready",requestId:1,preview:{sourceId:"file",sheets:[sheet,{...sheet,sheetName:"ondiep"}],suggestedSelection:[],diagnostics:[]}}}]};
  render(<AdviceHarness initial={initial} />);
  expect(screen.getAllByRole("checkbox")).toHaveLength(2);
});
