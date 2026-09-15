/* tslint:disable */
/* eslint-disable */

export function aggregate_pile_options(request: any): any;

export function apply_load_point_group_assignment(request: any): any;

export function assess_technical_assignment(request: any): any;

export function build_load_point_topology(request: any): any;

export function build_tip_level_region_topology(request: any): any;

export function calculate_pile_option_analysis(request: any): any;

export function calculate_pile_option_cost(request: any): any;

export function choose_default_options(request: any): any;

export function derive_load_point_groups(request: any): any;

export function export_pile_plan_csv(request: any): Uint8Array;

export function export_pile_plan_xlsx(request: any): Uint8Array;

export function greedy_optimize(request: any): any;

export function import_project_from_files(request: any): any;

export function preview_import_file(request: any): any;

export function preview_pile_plan_import_file(request: any): any;

export function read_project_document(request: any): any;

export function refresh_project_from_files(request: any): any;

export function write_project_document(request: any): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly aggregate_pile_options: (a: any) => [number, number, number];
    readonly apply_load_point_group_assignment: (a: any) => [number, number, number];
    readonly assess_technical_assignment: (a: any) => [number, number, number];
    readonly build_load_point_topology: (a: any) => [number, number, number];
    readonly build_tip_level_region_topology: (a: any) => [number, number, number];
    readonly calculate_pile_option_analysis: (a: any) => [number, number, number];
    readonly calculate_pile_option_cost: (a: any) => [number, number, number];
    readonly choose_default_options: (a: any) => [number, number, number];
    readonly derive_load_point_groups: (a: any) => [number, number, number];
    readonly export_pile_plan_csv: (a: any) => [number, number, number, number];
    readonly export_pile_plan_xlsx: (a: any) => [number, number, number, number];
    readonly greedy_optimize: (a: any) => [number, number, number];
    readonly import_project_from_files: (a: any) => [number, number, number];
    readonly preview_import_file: (a: any) => [number, number, number];
    readonly preview_pile_plan_import_file: (a: any) => [number, number, number];
    readonly read_project_document: (a: any) => [number, number, number];
    readonly refresh_project_from_files: (a: any) => [number, number, number];
    readonly write_project_document: (a: any) => [number, number, number, number];
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
