import { formatNumber } from "./formatting.ts";
import { getCptDisplayName } from "./cptDisplayName.ts";
import type { Cpt, LoadPoint, SelectedCpt } from "../core/projectTypes.ts";

type CptSelectionTableInput = {
  loadPoint: LoadPoint;
  selectedCpts: SelectedCpt[];
  isManualSelection?: boolean;
};

export type CptSelectionTableModel = {
  columns: string[];
  rows: Array<{
    cpt: Cpt;
    values: string[];
  }>;
};

export function getSelectedCptTableModel(entries: CptSelectionTableInput[]): CptSelectionTableModel {
  if (entries.length <= 1 && !entries[0]?.isManualSelection) {
    const selectedCpts = entries[0]?.selectedCpts ?? [];

    return {
      columns: ["Selection", "CPT", "Distance"],
      rows: selectedCpts.map((selection) => ({
        cpt: selection.cpt,
        values: [
          selection.label,
          getCptDisplayName(selection.cpt),
          `${formatNumber(selection.distance_mm / 1000)} m`,
        ],
      })),
    };
  }

  const cptUsageById = new Map<number, { cpt: Cpt; loadPointIds: number[] }>();

  entries.forEach(({ loadPoint, selectedCpts }) => {
    selectedCpts.forEach((selection) => {
      const usage = cptUsageById.get(selection.cpt.id) ?? {
        cpt: selection.cpt,
        loadPointIds: [],
      };

      if (!usage.loadPointIds.includes(loadPoint.id)) {
        usage.loadPointIds.push(loadPoint.id);
      }

      cptUsageById.set(selection.cpt.id, usage);
    });
  });

  return {
    columns: ["CPT", "Used by", "Load points"],
    rows: [...cptUsageById.values()].map((usage) => ({
      cpt: usage.cpt,
      values: [
        getCptDisplayName(usage.cpt),
        `${usage.loadPointIds.length} / ${entries.length} load points`,
        usage.loadPointIds.join(", "),
      ],
    })),
  };
}
