import initWasm, { export_cad_drawing } from "./wasm/pile-plan-wasm/pile_plan_wasm.js";
import { binaryResultToUint8Array } from "./binaryCoreResult.ts";
import { initializeWasm, invokeDesktop, isTauriRuntime } from "./coreTransport.ts";
import type { PileCostShape } from "./projectTypes.ts";
import type { ExportOptions } from "./exportRevisionContract.ts";

type Point = [number, number];
type Position = { name: string; position: Point };
export type CadFormat = "ifccad" | "dwg" | "dxf" | "pdf";
export type CadPileType = { size_mm: number; shape: PileCostShape };
export type CadQuadrantSymbol = CadPileType & { quadrants: number };
export type CadExportOptions = {
  numbering: "pile_number" | "location_number" | "none";
  include_cpts: boolean;
  symbols: "patterned" | "viewer";
  number_size: "automatic" | "compact";
  region_display: "filled" | "outlines" | "hidden";
  quadrant_symbols?: CadQuadrantSymbol[];
};
export type CadDrawing = {
  project: string;
  plan: string;
  piles_label: string;
  regions_label: string;
  unassigned_label: string;
  legend: {
    title: string;
    mark: string;
    size: string;
    count: string;
    cpts: string;
  };
  numbering: ExportOptions["mark"];
  options: CadExportOptions;
  viewer_symbols: Array<{ size_mm: number; outline: Point[]; fill: Point[] }>;
  piles: Array<{ id: number; mark: string | null; position: Point; size_mm: number | null; shape: PileCostShape | "unassigned" }>;
  cpts: Position[];
  regions: Array<{
    label: string;
    color: [number, number, number];
    areas: Point[][][];
  }>;
};

export async function exportCadDrawingCore(drawing: CadDrawing, format: CadFormat): Promise<Uint8Array> {
  if (isTauriRuntime()) {
    return binaryResultToUint8Array(await invokeDesktop<number[]>("export_cad_drawing", { drawing, format }));
  }

  await initializeWasm(initWasm);
  return export_cad_drawing(drawing, format);
}
