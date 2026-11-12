import { useEffect, useMemo, useState } from "react";
import { getImportFileFormat } from "../../core/importFiles.ts";
import type { TableImportSettings } from "../../core/coreImportContract.ts";
import {
  previewPileDrivingFilesCore,
  type PileDrivingBatchPreview,
  type PileDrivingCheckSettings,
  type PileDrivingImportError,
  type PileDrivingMatchField,
  type ProjectPileDriving,
  type ProjectPileDrivingFile,
} from "../../core/pileDrivingCoreClient.ts";
import type { LoadPoint, PileConfigurationKey, SelectedCpt } from "../../core/projectTypes.ts";
import { resolvePileDrivingMatchField } from "../../domain/pile-driving/pileDrivingMatchField.ts";

type SourceSelection = {
  instance: string;
  selectedId: string | null;
  exampleId?: string;
};
type PreviewResult = { preview: PileDrivingBatchPreview } | { error: PileDrivingImportError };

function fileMatchField(
  targets: Parameters<typeof resolvePileDrivingMatchField>[0],
  source: ProjectPileDrivingFile | undefined,
  sharedMatchBy: PileDrivingMatchField | undefined,
) {
  return resolvePileDrivingMatchField(targets, (source?.overrides ? source.overrides.match_by : sharedMatchBy) ?? null);
}

function fileCsvLeadingZeros(source: ProjectPileDrivingFile | undefined, shared: boolean | undefined) {
  if (source?.format !== "csv") return undefined;
  return source.overrides ? source.overrides.ignore_csv_leading_zeros : shared;
}

const EMPTY_FILES: ProjectPileDrivingFile[] = [];
const SOURCE_ERRORS = new Set([
  "missing-pile-number-column", "multiple-pile-number-columns", "multiple-pile-number-tables", "no-records",
  "invalid-check-settings", "invalid-column-mapping", "missing-worksheet",
]);

function importError(error: unknown): PileDrivingImportError {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    if (error.code === "missing-pile-number" && "row" in error && typeof error.row === "number") {
      return { code: error.code, row: error.row };
    }
    if (SOURCE_ERRORS.has(error.code)) return error as PileDrivingImportError;
  }
  return { code: "unreadable" };
}

function encodeFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.onabort = () => reject(new Error("File read aborted"));
    reader.readAsDataURL(file);
  });
}

function decodeFile(data: string): Uint8Array {
  try {
    return Uint8Array.from(atob(data), character => character.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
}

export function usePileDrivingPreview(
  instance: string,
  enabled: boolean,
  project: ProjectPileDriving | undefined,
  updateProject: (update: (current: ProjectPileDriving) => ProjectPileDriving) => boolean,
  loadPoints: readonly LoadPoint[],
  marks: ReadonlyMap<number, string> | undefined,
  configurations: ReadonlyMap<number, PileConfigurationKey> | undefined,
  pileHeadLevelM: number | null,
  selectedCpts: ReadonlyMap<number, SelectedCpt[]>,
) {
  const [selection, setSelection] = useState<SourceSelection | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const scoped = selection?.instance === instance ? selection : null;
  const files = project?.files ?? EMPTY_FILES;
  const selected = scoped ? files.find(source => source.id === scoped.selectedId)
    : files.length === 1 ? files[0] : undefined;
  const example = selected ?? files.find(source => source.id === scoped?.exampleId) ?? files[0];
  const sharedMatchBy = project?.shared_match_by;
  const sharedIgnoreCsvLeadingZeros = project?.shared_ignore_csv_leading_zeros;
  const sharedTable = project?.shared_table;
  const settings = project?.check_settings;
  const targets = useMemo(() => loadPoints.map(point => ({
    load_point_id: point.id,
    revit_mark: marks?.get(point.id),
    configuration: configurations?.get(point.id),
    selected_cpt_ids: selectedCpts.get(point.id)?.map(selection => selection.cpt.id),
  })), [loadPoints, marks, configurations, selectedCpts]);
  const request = useMemo(() => enabled && files.length > 0
    ? { instance, files, targets, pileHeadLevelM, settings, sharedMatchBy, sharedIgnoreCsvLeadingZeros, sharedTable }
    : null, [enabled, instance, files, targets, pileHeadLevelM, settings, sharedMatchBy, sharedIgnoreCsvLeadingZeros, sharedTable]);
  const [completed, setCompleted] = useState<{ request: typeof request; result: PreviewResult } | null>(null);

  useEffect(() => {
    if (!request) return;
    let current = true;
    const read = async () => {
      try {
        const sources = request.files.map(source => ({
          file_name: source.file_name,
          format: source.format,
          bytes: decodeFile(source.data_base64),
          match_by: fileMatchField(request.targets, source, request.sharedMatchBy),
          ignore_csv_leading_zeros: fileCsvLeadingZeros(source, request.sharedIgnoreCsvLeadingZeros),
          independent: source.overrides !== undefined,
          table: source.overrides?.table,
        }));
        const preview = await previewPileDrivingFilesCore({
          files: sources, targets: request.targets,
          pile_head_level_m: request.pileHeadLevelM,
          shared_table: request.sharedTable,
          ...(request.settings ? { settings: request.settings } : {}),
        });
        if (current) setCompleted({ request, result: { preview } });
      } catch (error) {
        if (current) setCompleted({ request, result: { error: importError(error) } });
      }
    };
    void read();
    return () => { current = false; };
  }, [request]);

  const addFiles = async (added: File[]) => {
    const supported = added.flatMap(file => {
      const format = getImportFileFormat(file.name);
      return format ? [{ file, format }] : [];
    });
    if (supported.length === 0) return;
    setReading(instance);
    setReadError(null);
    try {
      const sources = await Promise.all(supported.map(async ({ file, format }) => ({
        id: crypto.randomUUID(), file_name: file.name, format, data_base64: await encodeFile(file),
      })));
      if (updateProject(current => ({ ...current, files: [...current.files, ...sources] }))) {
        setSelection(current => ({
          instance, selectedId: files.length === 0 && sources.length === 1 ? sources[0].id : null,
          exampleId: current?.instance === instance ? current.exampleId : undefined,
        }));
      }
    } catch {
      setReadError(instance);
    } finally {
      setReading(current => current === instance ? null : current);
    }
  };
  const selectFile = (id: string | null) =>
    setSelection({ instance, selectedId: id, exampleId: id ?? example?.id });
  const selectExample = (id: string) =>
    setSelection({ instance, selectedId: selected?.id ?? null, exampleId: id });
  const removeFile = () => {
    if (selected && updateProject(current => ({
      ...current, files: current.files.filter(source => source.id !== selected.id),
    }))) setSelection(null);
  };

  const result = request && completed?.request === request ? completed.result : null;
  const batch = result && "preview" in result ? result.preview : null;
  const fileResults = useMemo(() => files.map((source, index) => ({
    id: source.id, name: source.file_name, result: batch?.files[index],
    matchBy: fileMatchField(targets, source, sharedMatchBy),
  })), [files, batch, targets, sharedMatchBy]);
  const previousRequest = completed?.request;
  const previousResult = completed?.result;
  const exampleIndex = previousRequest?.instance === instance
    ? previousRequest.files.findIndex(source => source.id === example?.id) ?? -1 : -1;
  const exampleTable = previousResult && "preview" in previousResult
    ? previousResult.preview.files[exampleIndex]?.table : null;
  const matchBy = fileMatchField(targets, example, sharedMatchBy);
  const updateSource = (update: (source: ProjectPileDrivingFile) => ProjectPileDrivingFile) =>
    updateProject(current => ({ ...current, files: current.files.map(source =>
      source.id === example?.id ? update(source) : source) }));
  const setMatchBy = (value: PileDrivingMatchField) => {
    if (example?.overrides) {
      updateSource(source => ({ ...source, overrides: { ...source.overrides, match_by: value } }));
    } else {
      updateProject(current => ({ ...current, shared_match_by: value }));
    }
  };
  const setIgnoreCsvLeadingZeros = (value: boolean) => {
    if (example?.overrides) {
      updateSource(source => ({ ...source, overrides: { ...source.overrides, ignore_csv_leading_zeros: value } }));
    } else {
      updateProject(current => ({ ...current, shared_ignore_csv_leading_zeros: value }));
    }
  };
  const setTable = (settings: TableImportSettings) => {
    if (!exampleTable) return;
    if (example?.overrides) {
      updateSource(source => ({ ...source, overrides: { ...source.overrides, table: settings } }));
    } else {
      // A detected worksheet can have a different name in every daily log.
      const sheet_name = settings.sheet_name === exampleTable.settings.sheet_name
        ? sharedTable?.settings.sheet_name : settings.sheet_name;
      const shared = { settings: { ...settings, sheet_name }, headers: exampleTable.columns.map(column => column.header) };
      updateProject(current => ({ ...current, shared_table: shared }));
    }
  };
  const resetTable = () => {
    if (example?.overrides) {
      updateSource(source => ({ ...source, overrides: { ...source.overrides, table: undefined } }));
    } else {
      updateProject(current => ({ ...current, shared_table: undefined }));
    }
  };
  const pileSizes = useMemo(() => {
    const sizes = new Set([...configurations?.values() ?? []].map(configuration => configuration.pile_size_mm));
    for (const file of batch?.files ?? []) {
      if (file.status !== "ready") continue;
      for (const record of file.preview.records) {
        const size = record.checks.find(check => check.kind === "size")?.actual;
        if (size != null && Number.isInteger(size)) sizes.add(size);
      }
    }
    return [...sizes].sort((a, b) => a - b);
  }, [configurations, batch]);
  return {
    files: fileResults,
    selectedId: selected?.id ?? null,
    example: example && {
      id: example.id, csv: example.format === "csv", table: exampleTable, independent: !!example.overrides,
      customTable: !!(example.overrides ? example.overrides.table : sharedTable),
    },
    matchBy, setTable, resetTable, setIgnoreCsvLeadingZeros,
    ignoreCsvLeadingZeros: fileCsvLeadingZeros(example, sharedIgnoreCsvLeadingZeros) ?? true,
    setIndependent: (independent: boolean) => updateSource(source => ({
      ...source,
      overrides: independent ? {
        match_by: sharedMatchBy,
        ignore_csv_leading_zeros: fileCsvLeadingZeros(source, sharedIgnoreCsvLeadingZeros),
        table: sharedTable ? exampleTable?.settings : undefined,
      } : undefined,
    })),
    pileSizes, settings: settings ?? batch?.settings ?? null,
    comparison: batch && {
      groups: batch.energy_by_size,
      limit: batch.settings.peer_energy_spread_kj,
      skipped: files.filter((_, index) => batch.files[index]?.status === "failed").map(source => source.file_name),
    },
    setSettings: (settings: PileDrivingCheckSettings) => updateProject(current =>
      JSON.stringify(current.check_settings) === JSON.stringify(settings) ? current : { ...current, check_settings: settings }),
    addFiles, selectFile, selectExample, removeFile, setMatchBy,
    pending: reading === instance || (request !== null && result === null),
    error: readError === instance ? { code: "unreadable" as const } : result && "error" in result ? result.error : null,
  };
}
