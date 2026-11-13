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
import { createEmptyAdviceDraft, addAdviceSource, applyAdviceDiscovery, beginAdviceDiscovery, type AdviceDraft } from "../../../domain/imports/adviceImportModel.ts";
import { useState } from "react";

function AdviceHarness({ initial = createEmptyAdviceDraft<File>(), refresh = false }: { initial?: AdviceDraft<File>; refresh?: boolean }) {
  const [draft, setDraft] = useState(initial);
  return <AdviceImportSources draft={draft} onChange={setDraft} refresh={refresh} />;
}

test("overlapping advice shows one pile-count control per file before the worksheets", () => {
  let initial = addAdviceSource(createEmptyAdviceDraft<File>(), "a", new File([], "advies-a.xlsx"));
  initial = addAdviceSource(initial, "b", new File([], "advies-b.xlsx"));
  initial.previewState = { status: "ready", requestId: 1, preview: {
    canApply: true, uniqueValueCount: 1, importedValueCount: 1, exactDuplicateCount: 1,
    orphanValueCount: 0, diagnostics: [], conflicts: [], overlappingAdviceSourceIds: ["a", "b"],
  } };
  render(<AdviceHarness initial={initial} />);
  expect(screen.getByText(i18n.t("importProject.advice.pileCountOverlap"))).toBeTruthy();
  const choice = screen.getByRole("combobox", { name: `${i18n.t("tableImport.adviceApplicability")} advies-a.xlsx` });
  fireEvent.change(choice, { target: { value: "specific" } });
  const count = screen.getByRole<HTMLInputElement>("spinbutton", { name: `${i18n.t("tableImport.capPileCount")} advies-a.xlsx` });
  fireEvent.change(count, { target: { value: "3" } });
  expect(count.value).toBe("3");
  expect(screen.getByRole<HTMLSelectElement>("combobox", { name: `${i18n.t("tableImport.adviceApplicability")} advies-b.xlsx` }).value).toBe("all");
});

test("advice starts with one matching import card and adds another empty card", () => {
  render(<AdviceHarness />);
  expect(screen.queryByText(i18n.t("importProject.profile.label"))).toBeNull();
  expect(screen.getAllByText(i18n.t("importProject.choose"))).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: i18n.t("importProject.advice.addAdvice") }));
  expect(screen.queryByText(i18n.t("importProject.profile.label"))).toBeNull();
});

test("a single worksheet is automatic; multiple worksheets show the automatic choices with settings closed", () => {
  let initial = addAdviceSource(createEmptyAdviceDraft<File>(), "file", new File([], "advies.xlsx"));
  const sheet = { sheetName: "diep", status: "ready" as const, detectedProfile: "standard-table" as const, resolvedProfile: "standard-table" as const,
    summary: {itemCount: 2, cptCount: 1, pileSizesMm: [290], minTipLevelMm: -15000, maxTipLevelMm: -14000, missingCellCount: 0}, diagnostics: [] };
  initial.sources[0].discovery = {status:"ready",requestId:1,preview:{sourceId:"file",sheets:[sheet],suggestedSelection:[{sheetName:"diep",profile:"standard-table"}],diagnostics:[]}};
  const { unmount } = render(<AdviceHarness initial={initial} />);
  expect(screen.queryByRole("checkbox")).toBeNull();
  unmount();
  initial = applyAdviceDiscovery(beginAdviceDiscovery(initial, "file", 2), "file", 2, {
    sourceId: "file", suggestedSelection: [], diagnostics: [], sheets: [
      sheet, { ...sheet, sheetName: "matrix", resolvedProfile: "capacity-columns" },
      { ...sheet, sheetName: "ondiep" }, { ...sheet, sheetName: "nog instellen", status: "needs-profile" },
    ],
  });
  const { container } = render(<AdviceHarness initial={initial} />);
  const checked = (name: string) => screen.getByRole<HTMLInputElement>("checkbox", { name }).checked;
  const bulk = screen.getByRole<HTMLButtonElement>("button", { name: i18n.t("importProject.advice.selectUsableSheets") });
  expect(checked("diep")).toBe(true);
  expect(checked("ondiep")).toBe(true);
  expect(checked("matrix")).toBe(true);
  expect(checked("nog instellen")).toBe(false);
  expect(bulk.disabled).toBe(true);
  expect(container.querySelectorAll(".advice-sheet-editor")).toHaveLength(3);
  expect(container.querySelector(".advice-sheet-editor[open]")).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: "diep" }));
  expect(bulk.disabled).toBe(false);
  fireEvent.click(bulk);
  expect(checked("diep")).toBe(true);
  expect(checked("matrix")).toBe(true);
  expect(container.querySelector(".advice-sheet-editor[open]")).toBeNull();
});

test('matrix profile settings and actionable errors are visible in the import editor',()=>{
 let initial=addAdviceSource(createEmptyAdviceDraft<File>(),'file',new File([],'advies.xlsx'));
 const d={severity:'error' as const,code:'advice-profile-required',count:1,nodeIds:[],loadPointNames:[],xMm:null,yMm:null,location:null,tipLevelValues:[],fallbackMessage:'Choose capacity profile',
   advice:{field:null,value:null,expectedUnit:null,pileSizesMm:[250,290],columnCount:null,requiredProfile:'capacity-columns' as const}};
 const summary={itemCount:0,cptCount:0,pileSizesMm:[],minTipLevelMm:null,maxTipLevelMm:null,missingCellCount:0};
 initial.sources[0].sheetSelection=[{sheetName:'Blad1',profile:'auto'}];
 initial.sources[0].discovery={status:'ready',requestId:1,preview:{sourceId:'file',suggestedSelection:[],diagnostics:[],sheets:[
   {sheetName:'Blad1',status:'needs-profile',detectedProfile:'capacity-columns',resolvedProfile:null,summary,diagnostics:[d]},
   {sheetName:'other',status:'unsupported',detectedProfile:null,resolvedProfile:null,summary,diagnostics:[d]}]}};
 const {container}=render(<AdviceHarness initial={initial}/>);
 const control=screen.getByRole('combobox',{name:`${i18n.t('importProject.profile.label')} Blad1`,hidden:true});
 expect(control.closest('[role=group]')).toBeTruthy();
 const message=container.querySelector('.source-preview-errors li > span');
 expect(message?.textContent).toContain('250');expect(message?.closest('details')?.open).toBe(true);
 expect(screen.getByRole('checkbox',{name:'Blad1'}).hasAttribute('disabled')).toBe(false);
 expect(screen.getByRole('checkbox',{name:'other'}).hasAttribute('disabled')).toBe(false);
 expect(container.querySelector('details')?.textContent).not.toContain(i18n.t('importProject.advice.sheetSummary',{count:0,cpts:0,sizes:'',min:'—',max:'—',missing:0}));
 expect(container.querySelectorAll('.source-preview-errors')).toHaveLength(1);
 fireEvent.click(screen.getByRole('checkbox',{name:'Blad1'}));
 expect(container.querySelector('.source-preview-errors li > span')).toBeNull();
 expect(screen.getByRole('checkbox',{name:'Blad1'})).toBeTruthy();
 fireEvent.click(screen.getByRole('checkbox',{name:'Blad1'}));
 expect(container.querySelectorAll('.source-preview-errors')).toHaveLength(1);
});
test('uncomputed import counts are not shown as a final zero',()=>{
 const preview:ProjectImportPreview={countsAvailable:false,canApply:false,uniqueValueCount:0,importedValueCount:0,orphanValueCount:0,exactDuplicateCount:0,conflicts:[],diagnostics:[]};
 const {container,rerender}=render(<AdviceImportDiagnostics preview={preview}/>);
 expect(container.textContent).not.toContain(i18n.t('importProject.advice.totals',{count:0,duplicates:0,orphans:0}));
 rerender(<AdviceImportDiagnostics preview={{...preview,countsAvailable:true}}/>);
 expect(container.textContent).toContain(i18n.t('importProject.advice.totals',{count:0,duplicates:0,orphans:0}));
});

test('a worksheet error is not repeated in the joint preview',()=>{
 let initial=addAdviceSource(createEmptyAdviceDraft<File>(),'file',new File([],'advies.xlsx'));
 const d={severity:'error' as const,code:'ambiguous-advice-layout',count:1,nodeIds:[],loadPointNames:[],xMm:null,yMm:null,
   location:{fileName:'advies.xlsx',sheetName:'Blad1',row:1,column:null,columnName:null},tipLevelValues:[],fallbackMessage:'Ambiguous'};
 initial.sources[0].sheetSelection=[{sheetName:'Blad1',profile:'auto'}];
 initial.sources[0].discovery={status:'ready',requestId:1,preview:{sourceId:'file',suggestedSelection:[],diagnostics:[],sheets:[
   {sheetName:'Blad1',status:'invalid',detectedProfile:null,resolvedProfile:null,summary:{itemCount:0,cptCount:0,pileSizesMm:[],minTipLevelMm:null,maxTipLevelMm:null,missingCellCount:0},diagnostics:[d]}]}};
 initial.previewState={status:'ready',requestId:2,preview:{countsAvailable:false,canApply:false,uniqueValueCount:0,importedValueCount:0,orphanValueCount:0,exactDuplicateCount:0,conflicts:[],diagnostics:[{...d}]}};
 const {container}=render(<AdviceHarness initial={initial}/>);
 const primary=container.querySelector('.source-preview-errors li > span')!;
 expect(primary.textContent).toBeTruthy();
 expect(screen.getAllByText(primary.textContent!)).toHaveLength(1);
});

test('a combination conflict explains the cause once and keeps both values visible',()=>{
 const preview:ProjectImportPreview={canApply:false,countsAvailable:false,uniqueValueCount:1,importedValueCount:0,orphanValueCount:0,exactDuplicateCount:0,
 diagnostics:[{severity:'error',code:'conflicting-bearing-capacities',count:1,nodeIds:[],loadPointNames:[],xMm:null,yMm:null,location:null,tipLevelValues:[],fallbackMessage:'Conflict'}],
 conflicts:[{cptId:9,pileSizeMm:320,pileTipLevelMm:-17500,values:[401,466].map((frdKn,i)=>({frdKn,locations:[{sourceId:String(i),fileName:`${i}.xlsx`,sheetName:null,row:null,column:null}]}))}]};
 render(<AdviceImportDiagnostics preview={preview}/>);
 expect(screen.getAllByText(i18n.t('importProject.advice.conflictHelp'))).toHaveLength(1);
 expect(screen.getByText('401 kN')).toBeTruthy();expect(screen.getByText('466 kN')).toBeTruthy();
});
