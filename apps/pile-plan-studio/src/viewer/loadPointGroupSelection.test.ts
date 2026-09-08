import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getLoadPointGroupNotice,
  getLoadPointGroupSelection,
} from "./loadPointGroupSelection.ts";

describe("load point group selection", () => {
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
      values: { groupCount: 2, count: 6 },
    });
  });
});
