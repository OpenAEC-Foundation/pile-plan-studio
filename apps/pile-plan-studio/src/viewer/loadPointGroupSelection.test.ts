import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  expandSelectionToGroups,
  getLoadPointGroupNotice,
  getLoadPointGroupSelection,
} from "./loadPointGroupSelection.ts";
import * as loadPointGroupSelection from "./loadPointGroupSelection.ts";

describe("load point group selection", () => {
  it("uses the shared contour instead of member rings only for completely selected groups", () => {
    const getCompleteSelectedGroupLoadPointIds = (
      loadPointGroupSelection as typeof loadPointGroupSelection & {
        getCompleteSelectedGroupLoadPointIds?: (
          selectedIds: number[],
          groups: Array<{ load_point_ids: number[] }>,
        ) => number[];
      }
    ).getCompleteSelectedGroupLoadPointIds;
    const groups = [
      { load_point_ids: [1, 2, 3] },
      { load_point_ids: [4, 5] },
      { load_point_ids: [9] },
    ];

    assert.deepEqual(getCompleteSelectedGroupLoadPointIds?.([1], groups), []);
    assert.deepEqual(getCompleteSelectedGroupLoadPointIds?.([1, 2, 3, 9], groups), [1, 2, 3]);
    assert.deepEqual(getCompleteSelectedGroupLoadPointIds?.([5, 4, 2, 1, 3], groups), [1, 2, 3, 4, 5]);
  });

  it("expands single, additive, and lasso IDs to complete groups with stable deduplication", () => {
    const groups = [
      { load_point_ids: [1, 2, 3] },
      { load_point_ids: [4, 5] },
      { load_point_ids: [9] },
    ];

    assert.deepEqual(expandSelectionToGroups([2], groups), [1, 2, 3]);
    assert.deepEqual(expandSelectionToGroups([5, 2, 3, 9], groups), [1, 2, 3, 4, 5, 9]);
    assert.deepEqual(expandSelectionToGroups([8], groups), [8]);
  });

  it("marks the remaining members of the selected load point group", () => {
    const presentation = getLoadPointGroupSelection({
      selectedLoadPointIds: [2],
      groups: [
        { load_point_ids: [1, 2, 3] },
        { load_point_ids: [4] },
      ],
    });

    assert.deepEqual(presentation, {
      groupCount: 1,
      markedLoadPointIds: [1, 2, 3],
      relatedLoadPointIds: [1, 3],
    });
  });

  it("combines distinct groups for a multiselection without double counting", () => {
    const presentation = getLoadPointGroupSelection({
      selectedLoadPointIds: [2, 3, 4, 9],
      groups: [
        { load_point_ids: [1, 2, 3] },
        { load_point_ids: [4, 5] },
        { load_point_ids: [9] },
      ],
    });

    assert.deepEqual(presentation, {
      groupCount: 2,
      markedLoadPointIds: [1, 2, 3, 4, 5, 9],
      relatedLoadPointIds: [1, 5],
    });
  });

  it("does not present singleton groups as grouped selections", () => {
    const presentation = getLoadPointGroupSelection({
      selectedLoadPointIds: [4],
      groups: [{ load_point_ids: [4] }],
    });

    assert.deepEqual(presentation, {
      groupCount: 0,
      markedLoadPointIds: [4],
      relatedLoadPointIds: [],
    });
  });

  it("describes one selected location by the size of its group", () => {
    assert.deepEqual(getLoadPointGroupNotice({
      selection: {
        groupCount: 1,
        markedLoadPointIds: [1, 2, 3],
        relatedLoadPointIds: [2, 3],
      },
      selectedLoadPointCount: 1,
    }), {
      translationKey: "pileOptions.groupSelection.single",
      values: { count: 3 },
    });
  });

  it("describes a multiselection by its distinct groups and marked locations", () => {
    assert.deepEqual(getLoadPointGroupNotice({
      selection: {
        groupCount: 2,
        markedLoadPointIds: [1, 2, 3, 4, 5, 9],
        relatedLoadPointIds: [1, 5],
      },
      selectedLoadPointCount: 4,
    }), {
      translationKey: "pileOptions.groupSelection.multiple",
      values: { count: 2, markedCount: 6 },
    });
  });
});
