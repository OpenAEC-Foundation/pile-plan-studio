import { beforeEach, expect, test, vi } from "vitest";
import { createProjectMcpSession, type ProjectMcpSessionDependencies } from "./projectSession.ts";
import { projectFixture } from "../../test/projectFixture.ts";
import type { createSessionMcpDispatcher } from "./sessionDispatcher.ts";
import type { createSourceImportOperations } from "./sourceImportOperations.ts";
import type { createMcpProjectFileOperations } from "./projectFileOperations.ts";
import type { createPilePlanImportOperations } from "./pilePlanImportOperations.ts";

const factories = vi.hoisted(() => ({ source: vi.fn(), files: vi.fn(), pile: vi.fn(), dispatcher: vi.fn(),
  sourceSession: { call: vi.fn(), dispose: vi.fn() }, fileSession: { start: vi.fn(), status: vi.fn(), invalidate: vi.fn() },
  pileSession: { call: vi.fn(), dispose: vi.fn() }, dispatch: vi.fn() }));
vi.mock("./sourceImportOperations.ts", () => ({ createSourceImportOperations: factories.source }));
vi.mock("./projectFileOperations.ts", () => ({ createMcpProjectFileOperations: factories.files }));
vi.mock("./pilePlanImportOperations.ts", () => ({ createPilePlanImportOperations: factories.pile }));
vi.mock("./sourceImportSession.ts", () => ({ createSourceImportSession: () => factories.sourceSession }));
vi.mock("./fileOperationSession.ts", () => ({ createMcpFileOperationSession: () => factories.fileSession }));
vi.mock("./pilePlanImportSession.ts", () => ({ createPilePlanImportSession: () => factories.pileSession }));
vi.mock("./sessionDispatcher.ts", () => ({ createSessionMcpDispatcher: factories.dispatcher }));
beforeEach(() => { vi.clearAllMocks(); factories.dispatcher.mockReturnValue(factories.dispatch); });

function fixture() {
  let state = projectFixture(), marker = { project_instance_id: "project", project_revision: 1 };
  let active = true, writable = false, limit = 60;
  let derived: ReturnType<ProjectMcpSessionDependencies["derivedState"]> = {
    analysisReady: true, groups: { groups: [], topology: { load_point_ids: [], edges: [], faces: [] }, pending: false, error: null },
  };
  const d: ProjectMcpSessionDependencies = {
    currentState: () => state, currentMarker: () => marker, currentPath: () => "project.ifcpp", canWrite: () => writable,
    derivedState: () => derived, language: () => "nl", defaultTimeLimit: () => limit,
    optimization: () => ({ running: false, startWithOptions: vi.fn(), getCurrentRunId: () => null, stopRun: vi.fn(), cancelRun: vi.fn() }),
    sourceImportRequirements: vi.fn(), pilePlanImportRequirements: vi.fn(), isDirty: () => true,
    personalCostDefault: () => null, builtInCostDefault: state.pileCostSettings,
    installRefresh: vi.fn(), installNewProject: vi.fn(), installOpened: vi.fn(), didSave: vi.fn(),
    confirmReplacement: vi.fn(), navigate: vi.fn(), commit: vi.fn(),
  };
  const session = createProjectMcpSession(d, () => active);
  return { d, session, state: () => state, replace: () => { state = { ...state, name: "New" }; },
    setMarker: (value: typeof marker) => { marker = value; }, setActive: (value: boolean) => { active = value; },
    setWritable: (value: boolean) => { writable = value; }, setLimit: (value: number) => { limit = value; },
    setDerived: (value: typeof derived) => { derived = value; },
    dispatcher: factories.dispatcher.mock.calls[0][0] as Parameters<typeof createSessionMcpDispatcher>[0],
    source: factories.source.mock.calls[0][0] as Parameters<typeof createSourceImportOperations>[0],
    files: factories.files.mock.calls[0][0] as Parameters<typeof createMcpProjectFileOperations>[0],
    pile: factories.pile.mock.calls[0][0] as Parameters<typeof createPilePlanImportOperations>[0] };
}

test("snapshots read live project, derived state and settings; captured freshness checks revision and instance", () => {
  const f = fixture(), initial = f.dispatcher.snapshot();
  expect(initial.state).toBe(f.state()); expect(initial.isCurrent!()).toBe(true);
  f.setMarker({ project_instance_id: "project", project_revision: 2 }); expect(initial.isCurrent!()).toBe(false);
  const next = f.dispatcher.snapshot(); f.setMarker({ project_instance_id: "replacement", project_revision: 2 });
  expect(next.isCurrent!()).toBe(false); f.replace(); f.setLimit(120);
  const derived = { analysisReady: false, groups: { ...initial.groups, pending: true } }; f.setDerived(derived);
  const newest = f.dispatcher.snapshot(); expect(newest.state).toBe(f.state());
  expect(newest.groups).toBe(derived.groups); expect(newest.analysisReady).toBe(false);
  expect(newest.defaultOptimizationTimeLimitSeconds).toBe(120);
  expect(newest.calculateCost).toBeTypeOf("function"); expect(newest.assessGroupAssignments).toBeTypeOf("function");
});

test("all write adapters require an active session and read current editing permission", () => {
  const f = fixture();
  for (const adapter of [f.source, f.files, f.pile]) expect(adapter.canEdit()).toBe(false);
  f.setWritable(true); for (const adapter of [f.source, f.files, f.pile]) expect(adapter.canEdit()).toBe(true);
  f.setActive(false); for (const adapter of [f.source, f.files, f.pile]) expect(adapter.canEdit()).toBe(false);
  expect(f.dispatcher.isActive()).toBe(false); expect(f.dispatcher.canWrite()).toBe(true);
});

test("imports and files retain the existing installation, requirements and save callbacks", () => {
  const f = fixture();
  expect(f.source.requirements).toBe(f.d.sourceImportRequirements); expect(f.pile.requirements).toBe(f.d.pilePlanImportRequirements);
  expect(f.source.installRefresh).toBe(f.d.installRefresh); expect(f.source.installNewProject).toBe(f.d.installNewProject);
  expect(f.files.installOpened).toBe(f.d.installOpened); expect(f.files.didSave).toBe(f.d.didSave);
  expect(f.files.confirmReplacement).toBe(f.d.confirmReplacement); expect(f.source.defaultPlanName()).toBe("Basisplan");
  f.d.language = () => "en"; expect(f.source.defaultPlanName()).toBe("Base plan");
  expect(f.pile.commit).toBe(f.d.commit);
});

test("pile imports reject pending groups and use the latest completed group snapshot", () => {
  const f = fixture(); expect(f.pile.currentGroups()).toEqual([]);
  const groups = { ...f.dispatcher.snapshot().groups, pending: true }; f.setDerived({ groups });
  expect(() => f.pile.currentGroups()).toThrow("groups_pending");
  f.setDerived({ groups: { ...groups, pending: false, error: new Error("failed") } }); expect(() => f.pile.currentGroups()).toThrow("groups_failed");
});

test("navigation is transient and grouping writes keep their explicit history action", () => {
  const f = fixture(), update = (state: ReturnType<typeof projectFixture>) => state;
  f.dispatcher.install(update, "navigation", "pile_activate_plan");
  expect(f.d.navigate).toHaveBeenCalledExactlyOnceWith(update); expect(f.d.commit).not.toHaveBeenCalled();
  f.dispatcher.install(update, "history", "pile_group_load_points"); expect(f.d.commit).toHaveBeenLastCalledWith(update, { kind: "group-created" });
  f.dispatcher.install(update, "history", "pile_ungroup_load_points"); expect(f.d.commit).toHaveBeenLastCalledWith(update, { kind: "group-removed" });
  f.dispatcher.install(update, undefined, "pile_rename_plan"); expect(f.d.commit).toHaveBeenLastCalledWith(update, undefined);
});

test("one connection session owns all transaction sessions and invalidates each on disposal", () => {
  const f = fixture(); expect(f.session.dispatch).toBe(factories.dispatch);
  expect(f.dispatcher.sourceImport).toBe(factories.sourceSession); expect(f.dispatcher.files).toBe(factories.fileSession);
  expect(f.dispatcher.pilePlanImport).toBe(factories.pileSession);
  f.session.dispose(); expect(factories.sourceSession.dispose).toHaveBeenCalledOnce();
  expect(factories.fileSession.invalidate).toHaveBeenCalledOnce(); expect(factories.pileSession.dispose).toHaveBeenCalledOnce();
});
