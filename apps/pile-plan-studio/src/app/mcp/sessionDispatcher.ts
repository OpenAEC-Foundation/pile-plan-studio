import { applyLoadPointGroupAssignmentCore } from "../../core/coreClient.ts";
import type { ProjectState } from "../../domain/project/projectState.ts";
import type { useIlpOptimization } from "../optimization/useIlpOptimization.ts";
import { projectStateSignature } from "../project/projectLifecycleController.ts";
import { createMcpDispatcher, type McpSnapshot, type PileMcpWriteToolName } from "./protocol.ts";
import { prepareMcpWrite, type PreparedMcpWrite } from "./writeModel.ts";
import { prepareOptimizationStart, requireMatchingRunId } from "./optimizationControls.ts";
import { McpReadError } from "./readModel.ts";
import type { ProjectMarkerValue } from "./projectMarker.ts";
import type { createSourceImportSession } from "./sourceImportSession.ts";
import type { createPilePlanImportSession } from "./pilePlanImportSession.ts";
import type { createMcpFileOperationSession } from "./fileOperationSession.ts";

type Dependencies = {
  snapshot: () => McpSnapshot;
  currentState: () => ProjectState;
  currentMarker: () => ProjectMarkerValue;
  canWrite: () => boolean;
  isActive: () => boolean;
  language: () => "nl" | "en";
  defaultTimeLimit: () => number | null;
  optimization: () => Pick<ReturnType<typeof useIlpOptimization>,
    "running" | "startWithOptions" | "getCurrentRunId" | "stopRun" | "cancelRun">;
  install: (update: (state: ProjectState) => ProjectState, mode: PreparedMcpWrite["mode"], name: PileMcpWriteToolName) => void;
  sourceImport: Pick<ReturnType<typeof createSourceImportSession>, "call">;
  pilePlanImport: Pick<ReturnType<typeof createPilePlanImportSession>, "call">;
  files: Pick<ReturnType<typeof createMcpFileOperationSession>, "start" | "status">;
};

/** Coordinate protocol requests against live session state; installation stays atomic in AppSession. */
export function createSessionMcpDispatcher(dependencies: Dependencies, prepare = prepareMcpWrite) {
  function requireWrite() {
    if (!dependencies.isActive() || !dependencies.canWrite()) throw new McpReadError("write_access_disabled");
  }
  function requireActive() {
    if (!dependencies.isActive()) throw new McpReadError("unavailable");
  }
  return createMcpDispatcher(dependencies.snapshot, async (snapshot, name, args) => {
    const prepared = await prepare(snapshot, name, args, {
      applyAssignment: applyLoadPointGroupAssignmentCore, language: dependencies.language(),
    });
    requireWrite();
    if (snapshot.isCurrent && !snapshot.isCurrent()) throw new McpReadError("project_changed");
    const beforeSignature = projectStateSignature(snapshot.state);
    const afterSignature = prepared.changed ? projectStateSignature(prepared.update(snapshot.state)) : beforeSignature;
    if (prepared.changed) dependencies.install((current) => (
      projectStateSignature(current) === beforeSignature ? prepared.update(current) : current
    ), prepared.mode, name);
    const marker = dependencies.currentMarker();
    if (prepared.changed && projectStateSignature(dependencies.currentState()) !== afterSignature) {
      throw new McpReadError("project_changed");
    }
    return { ...marker, data: prepared.data };
  }, dependencies.canWrite, async (snapshot, name, args) => {
    requireWrite();
    const optimization = dependencies.optimization();
    if (name === "pile_start_optimization") {
      if (snapshot.isCurrent && !snapshot.isCurrent()) throw new McpReadError("project_changed");
      if (optimization.running) throw new McpReadError("optimization_already_running");
      const options = prepareOptimizationStart(snapshot, args, dependencies.defaultTimeLimit());
      try {
        const receipt = optimization.startWithOptions(options);
        return { ...snapshot.marker, data: { run_id: receipt.runId, source_plan_id: receipt.sourcePlanId,
          destination_plan_id: receipt.destinationPlanId, destination_plan_name: receipt.destinationPlanName,
          target_count: receipt.targetCount, time_limit_seconds: receipt.timeLimitSeconds, status: "running" } };
      } catch (error) { throw new McpReadError(error instanceof Error ? error.message : "optimization_not_ready"); }
    }
    const runId = args.run_id as string;
    requireMatchingRunId(runId, optimization.getCurrentRunId());
    const accepted = name === "pile_stop_optimization" ? optimization.stopRun(runId) : optimization.cancelRun(runId);
    if (!accepted) throw new McpReadError("run_not_current");
    return { ...dependencies.currentMarker(), data: { run_id: runId, status: "stopping" } };
  }, async (snapshot, name, args) => {
    requireActive();
    const result = await dependencies.sourceImport.call(name, args, snapshot.marker);
    return name === "pile_apply_source_import" ? { ...dependencies.currentMarker(), data: result.data } : result;
  }, async (snapshot, name, args) => {
    requireActive();
    if (name === "pile_get_file_operation_status") return dependencies.files.status(args.operation_id as string);
    if (name === "pile_export_plan") return dependencies.files.start({ kind: "export",
      planId: args.plan_id as string, format: args.format as "csv" | "xlsx" }, snapshot.marker);
    const kind = name === "pile_open_project" ? "open" : name === "pile_save_project_as" ? "save-as" : "save";
    return dependencies.files.start({ kind }, snapshot.marker);
  }, async (snapshot, name, args) => {
    requireActive();
    const result = await dependencies.pilePlanImport.call(name, args, snapshot.marker);
    return name === "pile_apply_pile_plan_import" ? { ...dependencies.currentMarker(), data: result.data } : result;
  });
}
