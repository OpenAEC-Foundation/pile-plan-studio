import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalProjectForTest, projectTipLevelKeysForTest } from "../../core/projectTestSupport.ts";
import { createInitialProjectState } from "../../domain/project/projectState.ts";
import { readPileTool } from "./readModel.ts";

const source = readFileSync("../../sample_project/sample_project.ifcpp", "utf8");
const project = canonicalProjectForTest(source);
const base = createInitialProjectState(project, { initializeDefaultPiles: false }, projectTipLevelKeysForTest(project));
const marker = { project_instance_id: "test", project_revision: 1 };

describe("MCP project read model", () => {
  it("returns bounded load points and active plan assignments from live state", () => {
    const first = base.loadPoints[0];
    const configuration = { pile_size_mm: 300, pile_tip_level_mm: -12000 };
    const state = { ...base, selectedPileConfigurationsByLoadPoint: new Map([[first.id, configuration]]) };
    const page = readPileTool(state, marker, "pile_list_load_points", { limit: 1, offset: 0 });
    assert.equal(page.data.items.length, 1);
    assert.equal(page.data.items[0].id, first.id);
    assert.deepEqual(page.data.items[0].assignment, configuration);
    assert.equal(page.project_revision, 1);
  });

  it("distinguishes unavailable analysis from an empty option list", () => {
    assert.throws(
      () => readPileTool(base, marker, "pile_list_pile_options", { load_point_id: base.loadPoints[0].id }),
      /analysis_pending/,
    );
  });

  it("does not serve retained options during a new analysis request", () => {
    const id = base.loadPoints[0].id;
    const stale = {
      ...base,
      pileOptionsByLoadPointId: new Map([[id, []]]),
      selectedCptsByLoadPointId: new Map([[id, []]]),
    };
    assert.throws(() => readPileTool(stale, marker, "pile_list_pile_options", { load_point_id: id }, false), /analysis_pending/);
  });

  it("omits source paths from the overview", () => {
    const overview = readPileTool(base, marker, "pile_project_overview", {});
    assert.equal(overview.data.load_point_count, base.loadPoints.length);
    assert.equal(JSON.stringify(overview).includes("fileName"), false);
  });

  it("shows effective CPT rules for one load point", () => {
    const id = base.loadPoints[0].id;
    const override = { ...base.globalCptSelectionSettings, maxDistanceM: 18 };
    const state = { ...base,
      cptSelectionSettingsByLoadPoint: new Map([[id, override]]),
      pileOptionsByLoadPointId: new Map([[id, []]]),
      selectedCptsByLoadPointId: new Map([[id, []]]),
    };
    const result = readPileTool(state, marker, "pile_get_load_point", { load_point_id: id });
    assert.deepEqual(result.data.effective_cpt_selection_settings, override);
  });
});
