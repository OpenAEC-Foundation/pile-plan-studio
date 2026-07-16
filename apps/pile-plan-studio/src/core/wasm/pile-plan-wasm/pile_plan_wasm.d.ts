/* tslint:disable */
/* eslint-disable */

export function calculate_pile_option_cost(request: any): any;

export function calculate_pile_options(request: any): any;

export function calculate_project_analysis(request: any): any;

export function calculate_selected_cpts(request: any): any;

export function choose_default_option(request: any): any;

export function choose_default_options(request: any): any;

export function cpt_frd_rows(request: any): any;

export function export_pile_plan_csv(request: any): Uint8Array;

export function export_pile_plan_xlsx(request: any): Uint8Array;

export function greedy_optimize(request: any): any;

export function import_project_from_files(request: any): any;

export function preview_import_file(request: any): any;

export function write_ifcpp_project(project: any): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly calculate_pile_option_cost: (a: any) => [number, number, number];
    readonly calculate_pile_options: (a: any) => [number, number, number];
    readonly calculate_project_analysis: (a: any) => [number, number, number];
    readonly calculate_selected_cpts: (a: any) => [number, number, number];
    readonly choose_default_option: (a: any) => [number, number, number];
    readonly choose_default_options: (a: any) => [number, number, number];
    readonly cpt_frd_rows: (a: any) => [number, number, number];
    readonly export_pile_plan_csv: (a: any) => [number, number, number, number];
    readonly export_pile_plan_xlsx: (a: any) => [number, number, number, number];
    readonly greedy_optimize: (a: any) => [number, number, number];
    readonly import_project_from_files: (a: any) => [number, number, number];
    readonly preview_import_file: (a: any) => [number, number, number];
    readonly write_ifcpp_project: (a: any) => [number, number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
