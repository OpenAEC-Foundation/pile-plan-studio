import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  projectDocumentErrorFromCore,
  projectDocumentErrorFromUnknown,
  projectDocumentOutcomeFromCore,
  toBrowserProjectDocumentDraft,
  toDesktopProjectDocumentDraft,
  type CoreProjectDocumentError,
  type ProjectDocumentDraft,
} from "./projectDocumentContract.ts";

describe("project document result mapping", () => {
  it("maps a canonical document, exact millimetre keys, and browser maps", () => {
    const outcome = projectDocumentOutcomeFromCore({
      status: "valid",
      project: canonicalCoreProject(),
      keys: {
        bearing_capacities: [-18_250],
        pile_plans: [{ id: "pile-plan-1", active: [-18_000, -18_250] }],
        legend: [-18_250],
      },
    });

    assert.equal(outcome.status, "valid");
    if (outcome.status !== "valid") return;
    assert.equal(outcome.project.schema_version, 4);
    assert.equal(outcome.project.application?.name, "Pile Plan Studio");
    assert.deepEqual(outcome.project.settings.cpt_selection_by_load_point, {
      "7": {
        algorithm: "quadrants",
        max_distance_m: 25,
        monopoly_distance_m: 1,
        max_angle_degrees: 120,
      },
    });
    assert.deepEqual(outcome.project.user_state.pile_plans?.[0].selected_piles, {
      "7": {
        pile: { pile_size_mm: 320, pile_tip_level_m_key: -18_250 },
        external_references: [],
      },
    });
    assert.deepEqual(outcome.project.user_state.manual_cpt_selections, { "7": [61] });
    assert.deepEqual(outcome.keys, {
      bearingCapacities: [-18_250],
      pilePlans: [{ id: "pile-plan-1", active: [-18_000, -18_250] }],
      legend: [-18_250],
    });
  });

  it("maps every structured error and nested context to frontend names", () => {
    const cases: Array<[CoreProjectDocumentError, unknown]> = [
      [
        { code: "invalid-json", message: "expected value" },
        { code: "invalid-json", message: "expected value" },
      ],
      [
        { code: "invalid-schema", schema: "OTHER" },
        { code: "invalid-schema", schema: "OTHER" },
      ],
      [
        { code: "unsupported-schema-version", schema_version: 9 },
        { code: "unsupported-schema-version", schemaVersion: 9 },
      ],
      [
        { code: "duplicate-pile-plan-id", pile_plan_id: "plan-a" },
        { code: "duplicate-pile-plan-id", pilePlanId: "plan-a" },
      ],
      [
        {
          code: "invalid-pile-costs",
          errors: [{ index: 1, pile_size_mm: 290, reason: "duplicate-pile-size" }],
        },
        {
          code: "invalid-pile-costs",
          errors: [{ index: 1, pileSizeMm: 290, reason: "duplicate-pile-size" }],
        },
      ],
      [
        {
          code: "duplicate-load-point-positions",
          positions: [{
            x_mm: 10,
            y_mm: 20,
            load_points: [{ id: 2, name: "B" }, { id: 8, name: "H" }],
          }],
        },
        {
          code: "duplicate-load-point-positions",
          positions: [{
            xMm: 10,
            yMm: 20,
            loadPoints: [{ id: 2, name: "B" }, { id: 8, name: "H" }],
          }],
        },
      ],
      [
        {
          code: "invalid-pile-tip-levels",
          errors: [
            {
              value: "-18.5004",
              reason: "submillimetre",
              context: {
                kind: "bearing-capacity",
                index: 0,
                cpt_id: 61,
                pile_size_mm: 320,
              },
            },
            {
              value: "NaN",
              reason: "non-finite",
              context: { kind: "pile-plan-active", plan_id: "plan-a", index: 1 },
            },
            {
              value: "9007199254741",
              reason: "out-of-range",
              context: { kind: "legend", index: 2 },
            },
          ],
        },
        {
          code: "invalid-pile-tip-levels",
          errors: [
            {
              value: "-18.5004",
              reason: "submillimetre",
              context: {
                kind: "bearing-capacity",
                index: 0,
                cptId: 61,
                pileSizeMm: 320,
              },
            },
            {
              value: "NaN",
              reason: "non-finite",
              context: { kind: "pile-plan-active", planId: "plan-a", index: 1 },
            },
            {
              value: "9007199254741",
              reason: "out-of-range",
              context: { kind: "legend", index: 2 },
            },
          ],
        },
      ],
    ];

    for (const [input, expected] of cases) {
      assert.deepEqual(projectDocumentErrorFromCore(input), expected);
      assert.deepEqual(
        projectDocumentOutcomeFromCore({ status: "invalid", error: input }),
        { status: "invalid", error: expected },
      );
    }
  });

  it("recognizes structured runtime rejections without hiding unrelated failures", () => {
    assert.deepEqual(
      projectDocumentErrorFromUnknown({
        code: "unsupported-schema-version",
        schema_version: 12,
      }),
      { code: "unsupported-schema-version", schemaVersion: 12 },
    );
    assert.equal(projectDocumentErrorFromUnknown(new Error("network failed")), null);
    assert.equal(projectDocumentErrorFromUnknown({ code: "unknown" }), null);
  });
});

describe("project document draft transport", () => {
  it("uses numeric Map keys for WASM and string records for Tauri", () => {
    const draft = canonicalDraft();
    const browser = toBrowserProjectDocumentDraft(draft);
    const desktop = toDesktopProjectDocumentDraft(draft);

    assert.deepEqual(browser.active_selected_piles.get(7), {
      pile_size_mm: 320,
      pile_tip_level_mm: -18_250,
    });
    assert.deepEqual(browser.settings.cpt_selection_by_load_point.get(7), {
      algorithm: "quadrants",
      max_distance_m: 25,
      monopoly_distance_m: 1,
      max_angle_degrees: 120,
    });
    assert.equal(browser.user_state.pile_plans[0].selected_piles.has(7), true);
    assert.deepEqual(browser.user_state.manual_cpt_selections.get(7), [61]);
    assert.equal(browser.import_log[0].mapped_columns.get("FEd"), "design_load_kn");

    assert.deepEqual(desktop.active_selected_piles["7"], {
      pile_size_mm: 320,
      pile_tip_level_mm: -18_250,
    });
    assert.equal(desktop.user_state.pile_plans[0].selected_piles["7"].pile?.pile_tip_level_m_key, -18_250);
    assert.deepEqual(desktop.user_state.manual_cpt_selections["7"], [61]);
    assert.equal(desktop.import_log[0].mapped_columns.FEd, "design_load_kn");
  });
});

function canonicalCoreProject() {
  return {
    schema: "IFCPP" as const,
    schema_version: 4,
    application: { name: "Pile Plan Studio", version: "0.3.2" },
    metadata: { name: "Contract", external_references: [] },
    units: {
      coordinates: "mm",
      design_loads: "kN",
      pile_tip_levels: "m",
      bearing_capacities: "kN",
      costs: "EUR",
    },
    inputs: {
      load_points: [],
      cpts: [],
      bearing_capacities: [],
    },
    settings: {
      global_cpt_selection: {
        algorithm: "quadrants" as const,
        max_distance_m: 25,
        monopoly_distance_m: 1,
        max_angle_degrees: 120,
      },
      cpt_selection_by_load_point: new Map([[7, {
        algorithm: "quadrants" as const,
        max_distance_m: 25,
        monopoly_distance_m: 1,
        max_angle_degrees: 120,
      }]]),
      load_point_grouping: { automatic: true, max_edge_distance_mm: 1000 },
      pile_costs: { schema_version: 1, items: [] },
      pile_head_level_m: 0,
      optimization: {
        max_pile_sizes: 3,
        max_pile_tip_levels: 3,
        max_pile_configurations: 5,
        max_utilization: 1,
        candidate_source: "all_available" as const,
      },
      viewer_utilization: { minimum: 0, maximum: 1 },
      pile_legend: null,
      viewer: {
        symbol_scale_percent: 100,
        foreground_layer: "load-points" as const,
        show_grid: true,
        show_tip_level_regions: true,
      },
    },
    user_state: {
      pile_plans: [{
        id: "pile-plan-1",
        name: "Pile plan 1",
        active_pile_sizes: [320],
        active_pile_tip_levels: [-18.25],
        selected_piles: new Map([[7, {
          pile: { pile_size_mm: 320, pile_tip_level_m_key: -18_250 },
          external_references: [],
        }]]),
        locked_load_point_ids: [],
        optimization_unassigned: new Map(),
      }],
      active_pile_plan_id: "pile-plan-1",
      manual_cpt_selections: new Map([[7, [61]]]),
    },
    import_log: [{
      source_file: "loads.csv",
      imported_at: null,
      sheet_name: null,
      mapped_columns: new Map([["FEd", "design_load_kn"]]),
      warnings: [],
      source_role: "load_points" as const,
      source_format: "csv" as const,
      schema_version: null,
      source_profile: null,
      profile_details: new Map(),
    }],
  };
}

function canonicalDraft(): ProjectDocumentDraft {
  const project = canonicalCoreProject();
  return {
    metadata: project.metadata,
    units: project.units,
    inputs: project.inputs,
    settings: {
      ...project.settings,
      cpt_selection_by_load_point: { "7": project.settings.cpt_selection_by_load_point.get(7)! },
    },
    user_state: {
      ...project.user_state,
      pile_plans: project.user_state.pile_plans.map((plan) => ({
        ...plan,
        selected_piles: Object.fromEntries(plan.selected_piles),
        optimization_unassigned: Object.fromEntries(plan.optimization_unassigned),
      })),
      manual_cpt_selections: Object.fromEntries(project.user_state.manual_cpt_selections),
    },
    active_selected_piles: {
      "7": { pile_size_mm: 320, pile_tip_level_mm: -18_250 },
    },
    import_log: project.import_log.map((entry) => ({
      ...entry,
      mapped_columns: Object.fromEntries(entry.mapped_columns),
      profile_details: Object.fromEntries(entry.profile_details),
    })),
  };
}
