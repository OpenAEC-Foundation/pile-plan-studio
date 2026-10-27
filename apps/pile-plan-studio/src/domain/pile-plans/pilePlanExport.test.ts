import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../project/projectState.ts";
import { buildPilePlanExportInputForPlan } from "./pilePlanExport.ts";

const source = readFileSync("../../sample_project/sample_project.ifcpp", "utf8");
const project = canonicalProjectForTest(source);

describe("pile-plan export for explicit plans", () => {
  it("exports an inactive plan without changing the active plan or shared CPTs", () => {
    const base = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
    const id = base.loadPoints[0].id;
    const first = { pile_size_mm: 300, pile_tip_level_mm: -12000 };
    const second = { pile_size_mm: 350, pile_tip_level_mm: -13000 };
    const state = { ...base,
      selectedPileConfigurationsByLoadPoint: new Map([[id, first]]),
      selectedCptsByLoadPointId: new Map([[id, [{ label: "CPT", cpt: base.cpts[0], distance_mm: 0 }]]]),
      pilePlans: [{ ...base.pilePlans[0], selectedPileConfigurationsByLoadPoint: new Map([[id, first]]) },
        { ...base.pilePlans[0], id: "alternative", name: "Alternative",
          selectedPileConfigurationsByLoadPoint: new Map([[id, second]]) }],
    };
    const exported = buildPilePlanExportInputForPlan(state, "alternative");
    assert.deepEqual(exported.selectedPiles.get(id), second);
    assert.equal(state.activePilePlanId, base.activePilePlanId);
    assert.deepEqual(exported.selectedCpts.get(id), [base.cpts[0].id]);
    assert.deepEqual(exported.pileShapes, new Map(state.pileCostSettings.items.map(item => [item.pile_size_mm, item.shape])));
    assert.equal(exported.pileSizeFormat, "numeric");
    assert.equal(buildPilePlanExportInputForPlan(state, "alternative", "dimensions").pileSizeFormat, "dimensions");
    assert.throws(() => buildPilePlanExportInputForPlan(state, "missing"), /unknown_plan/);
  });
});

it("does not export a proposal-bearing plan as if its source piles were the effective layout",()=>{
 const base=createInitialProjectState(project,{initializeDefaultPiles:false},projectTipLevelKeysForTest(project));
 const state={...base,pilePlans:base.pilePlans.map(plan=>({...plan,pileCapProposals:[{load_point_ids:[15,43],pile_count:3,quarter_turns:0,configuration:null}]}))};
 assert.throws(()=>buildPilePlanExportInputForPlan(state,state.activePilePlanId),/pile_cap_proposals_not_exportable/);
});
