import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import i18n from "../../../i18n/config.ts";
import { projectFixture } from "../../../test/projectFixture.ts";
import PilePlanExplorer from "./PilePlanExplorer.tsx";
import ApplicationTooltip from "../../template/ApplicationTooltip.tsx";

test.each(["nl","en"])("missing costs have a readable label and do not appear as a zero total (%s)",async language=>{
  await i18n.changeLanguage(language);
  const state=projectFixture(),plan=state.pilePlans[0];
  const props={projectName:"Project",isDirty:false,pilePlans:[plan],activePilePlanId:plan.id,
    currencyCode:"EUR",inputSources:[],activeSourceKind:null,inputSourcesExpanded:false,pilePlansExpanded:true,
    onActivate:vi.fn(),onCreate:vi.fn(),onRename:vi.fn(),onDuplicate:vi.fn(),onDelete:vi.fn(),onSourceActivate:vi.fn(),onExpansionChange:vi.fn()};
  const view=render(<PilePlanExplorer {...props} costSummaries={new Map([[plan.id,{totalCost:0,missingCount:1136}]])}/>);
  expect(screen.getByRole("option").textContent).toContain(language==="nl"?"1136 zonder kosten":"1136 without costs");
  expect(screen.getByRole("option").textContent).not.toMatch(/€\s*0/);
  expect(view.container.querySelector('.pile-plan-warning svg')).toBeNull();
  view.rerender(<PilePlanExplorer {...props} costSummaries={new Map([[plan.id,{totalCost:1234,missingCount:1}]])}/>);
  expect(screen.getByRole("option").textContent).toMatch(/1[.,]234/);
  view.rerender(<PilePlanExplorer {...props} costSummaries={new Map([[plan.id,{totalCost:0,missingCount:0}]])}/>);
  expect(screen.getByRole("option").textContent).toMatch(/€\s*0/);
  expect(view.container.querySelector('.pile-plan-warning')).toBeNull();
});

test.each(["nl", "en"])("explorer counts cap changes rather than hypothetical piles (%s)", async language => {
  await i18n.changeLanguage(language);
  const state = projectFixture();
  const plan = { ...state.pilePlans[0], lockedLoadPointIds: [15, 43], pileCapProposals: [
    { load_point_ids: [15, 43], pile_count: 3, quarter_turns: 0, configuration: null },
    { load_point_ids: [50], pile_count: 5, quarter_turns: 0, configuration: null },
  ] };
  render(<PilePlanExplorer
    projectName="Project" isDirty={false} pilePlans={[plan]} activePilePlanId={plan.id}
    costSummaries={new Map([[plan.id, { includesProposals: true, pileCount: 329, totalCost: 218143, missingCount: 0 }]])}
    currencyCode="EUR" inputSources={[]} activeSourceKind={null} inputSourcesExpanded={false} pilePlansExpanded
    onActivate={vi.fn()} onCreate={vi.fn()} onRename={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()}
    onSourceActivate={vi.fn()} onExpansionChange={vi.fn()}
  />);
  const row = screen.getByRole("option");
  expect(row.textContent).toContain(language === "nl" ? "2 poerwijzigingen" : "2 cap changes");
  expect(row.textContent).toContain(language === "nl" ? "2 vergrendeld" : "2 locked");
  expect(row.textContent).not.toContain("329");
});

test("explorer uses shared controls while retaining source selection and inline rename",()=>{
  const state=projectFixture(),plan=state.pilePlans[0],rename=vi.fn(),source=vi.fn();
  const view=render(<PilePlanExplorer projectName="Project" isDirty pilePlans={[plan]} activePilePlanId={plan.id}
    costSummaries={new Map()} currencyCode="EUR" inputSources={state.inputSources} activeSourceKind={state.inputSources[0].kind}
    inputSourcesExpanded pilePlansExpanded onActivate={vi.fn()} onCreate={vi.fn()} onRename={rename} onDuplicate={vi.fn()}
    onDelete={vi.fn()} onSourceActivate={source} onExpansionChange={vi.fn()}/>);
  expect(view.container.querySelector('.project-explorer .oa-panel')).not.toBeNull();
  const row=view.container.querySelector('.project-tree-item')!;
  expect(row.classList.contains('oa-button')).toBe(true);
  expect(row.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(row);expect(source).toHaveBeenCalledWith(state.inputSources[0].kind);
  const edit=screen.getByRole('button',{name:i18n.t('projectExplorer.rename')});
  expect(edit.classList.contains('oa-icon-button')).toBe(true);
  fireEvent.click(edit);const field=screen.getByRole('textbox');
  expect(field.classList.contains('oa-field')).toBe(true);
  fireEvent.change(field,{target:{value:'Blueprint plan'}});fireEvent.keyDown(field,{key:'Enter'});
  expect(rename).toHaveBeenCalledWith(plan.id,'Blueprint plan');
  expect((screen.getByRole('button',{name:i18n.t('projectExplorer.delete')}) as HTMLButtonElement).disabled).toBe(true);
});

test("explorer action help is portaled outside the scroll area on hover and keyboard focus",()=>{
  const state=projectFixture(),plan=state.pilePlans[0];
  const view=render(<><ApplicationTooltip/><PilePlanExplorer projectName="Project" isDirty={false}
    pilePlans={[plan,{...plan,id:'other',name:'Other'}]} activePilePlanId={plan.id} costSummaries={new Map()} currencyCode="EUR"
    inputSources={[]} activeSourceKind={null} inputSourcesExpanded pilePlansExpanded onActivate={vi.fn()} onCreate={vi.fn()}
    onRename={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onSourceActivate={vi.fn()} onExpansionChange={vi.fn()}/></>);
  const edit=screen.getAllByRole('button',{name:i18n.t('projectExplorer.rename')})[0];
  fireEvent.mouseEnter(edit);
  const tooltip=screen.getByRole('tooltip');
  expect(tooltip.textContent).toBe(i18n.t('projectExplorer.rename'));
  expect(view.container.querySelector('.project-explorer')!.contains(tooltip)).toBe(false);
  expect(edit.getAttribute('data-oa-tip')).toBeNull();
  expect(edit.getAttribute('aria-describedby')).toContain(tooltip.id);
  fireEvent.mouseLeave(edit);
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.focus(screen.getAllByRole('button',{name:i18n.t('projectExplorer.duplicate')})[0]);
  expect(screen.getByRole('tooltip').textContent).toBe(i18n.t('projectExplorer.duplicate'));
  fireEvent.keyDown(document,{key:'Escape'});
  expect(screen.queryByRole('tooltip')).toBeNull();
});
