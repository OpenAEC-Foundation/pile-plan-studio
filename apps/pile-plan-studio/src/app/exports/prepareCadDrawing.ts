import {
  buildLoadPointTopologyCore,
  buildTipLevelRegionTopologyCore,
} from "../../core/analysisCoreClient.ts";
import type { ProjectState } from "../../domain/project/projectState.ts";
import type { PilePlanData } from "../../core/projectFile.ts";
import { cadPileTypes } from "../../domain/exports/cadQuadrants.ts";
import { createRectangularRegionLayout } from "../../viewer/rectangularTipLevelRegions.ts";
import { FILLED_OUTLINE_MARGIN_MM, projectTipLevelRegionOutline } from "../../viewer/tipLevelRegionGeometry.ts";
import type { CadDrawing, CadExportOptions } from "../../core/cadExportCoreClient.ts";
import type { PileSymbol } from "../../core/projectTypes.ts";
import { PILE_SYMBOL_CATALOG } from "../../viewer/legendSymbols.ts";
import { pileSymbolGeometry } from "../../viewer/pileSymbols.ts";

import { createCadRegionClipper } from "./cadRegionClipping.ts";

type Point = [number, number];
type CadLabels = Pick<CadDrawing, "piles_label" | "regions_label" | "unassigned_label" | "legend">;

export async function prepareCadDrawing(state: ProjectState, plan: PilePlanData, labels: CadLabels, locale: string, numbering: CadDrawing["numbering"], options: CadExportOptions): Promise<CadDrawing> {
  const { loadPoints, cpts, pileOptionsByLoadPointId } = state;
  const { selectedPileConfigurationsByLoadPoint: assignments, revitMarksByLoadPoint: marks } = plan;
  const shapes = new Map(cadPileTypes(assignments, state.pileCostSettings.items).map(type => [type.size_mm, type.shape]));
  const point = ({ x_mm, y_mm }: { x_mm: number; y_mm: number }): Point => [x_mm, y_mm];
  const sites = new Map(loadPoints.map(load => [load.id, point(load)]));
  const drawing: CadDrawing = {
    project: state.name,
    plan: plan.name,
    ...labels,
    numbering,
    options,
    viewer_symbols: options.symbols === "viewer" ? prepareViewerSymbols([...shapes.keys()], state.pileLegend.pileSizes) : [],
    piles: loadPoints.map(load => {
      const size = assignments.get(load.id)?.pile_size_mm;
      return {
        id: load.id,
        mark: marks?.get(load.id) ?? null,
        position: point(load),
        size_mm: size ?? null,
        shape: size === undefined ? "unassigned" : (shapes.get(size) ?? "square"),
      };
    }),
    cpts: cpts.map(cpt => ({ name: cpt.name, position: point(cpt) })),
    regions: [],
  };
  if (options.region_display === "hidden" || assignments.size === 0) return drawing;

  const loadPointTopology = await buildLoadPointTopologyCore(loadPoints);
  const topology = await buildTipLevelRegionTopologyCore({
    loadPointTopology,
    selectedAssignments: assignments,
    optionsByLoadPoint: pileOptionsByLoadPointId,
  });
  if (topology.groups.length === 0) return drawing;

  const layout = createRectangularRegionLayout(sites, loadPointTopology, FILLED_OUTLINE_MARGIN_MM)(topology);
  const outline = projectTipLevelRegionOutline(loadPointTopology,
    new Map(loadPoints.map(({ id, x_mm, y_mm }) => [id, { x: x_mm, y: y_mm }])),
    1,
  );
  if (!layout || !outline) throw new Error("cad_regions_unavailable");

  const clip = createCadRegionClipper(outline);

  const colors = new Map(state.pileLegend.pileTipLevels.map(({ value, color }) => [value, color]));
  const level = new Intl.NumberFormat(locale, { maximumFractionDigits: 3, useGrouping: false });
  drawing.regions = topology.groups.flatMap((group, index) => {
    const areas = clip(layout[index].fillRings);
    if (areas.length === 0) return [];
    return [{
      label: level.format(group.pile_tip_level_mm / 1000) + " m",
      color: paleColor(colors.get(group.pile_tip_level_mm) ?? "#8C989F"),
      areas: areas.map(area => area.map(ring => ring.slice(0, -1))),
    }];
  });
  return drawing;
}

function prepareViewerSymbols(sizes: number[], legend: ProjectState["pileLegend"]["pileSizes"]): CadDrawing["viewer_symbols"] {
  sizes.sort((a, b) => a - b);
  const configured = new Map(legend.map(({ value, symbol }) => [value, symbol]));
  const chosen = new Map<number, PileSymbol>();
  const used = new Set<string>();
  const token = ({ baseShape, fillPattern }: PileSymbol) => `${baseShape}|${fillPattern}`;
  for (const size of sizes) {
    const symbol = configured.get(size);
    if (symbol && !used.has(token(symbol))) {
      chosen.set(size, symbol);
      used.add(token(symbol));
    }
  }
  const available = PILE_SYMBOL_CATALOG.filter(symbol => !used.has(token(symbol)));
  let next = 0;
  return sizes.map((size_mm, index) => {
    const symbol = chosen.get(size_mm) ?? available[next++] ?? PILE_SYMBOL_CATALOG[index % PILE_SYMBOL_CATALOG.length];
    return { size_mm, ...pileSymbolGeometry(symbol) };
  });
}

function paleColor(hex: string): [number, number, number] {
  const rgb = /^#([0-9a-f]{6})$/i.exec(hex)?.[1] ?? "8C989F";
  const lighten = (start: number) => Math.round(255 * 0.75 + parseInt(rgb.slice(start, start + 2), 16) * 0.25);
  return [lighten(0), lighten(2), lighten(4)];
}
