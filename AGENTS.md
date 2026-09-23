# AGENTS.md

## Scope

These instructions apply to the entire repository. A more specific
`AGENTS.md` in a subdirectory may add to or override them.

## Product and domain context

Pile Plan Studio helps users explore, compare, and assign pile configurations
for structural load points and assemble practical pile-plan variants.

The central domain concepts are:

- A **load point** is a structural location with coordinates and a design load
  (`FEd`). In the current model, one pile configuration can be assigned to each
  load point.
- A **CPT** (cone penetration test; Dutch: *sondering*) represents a soil
  investigation at a known position.
- One or more CPTs are selected for each load point, automatically or manually.
  CPT selection is project-wide and shared by all pile plans.
- **Foundation advice** provides the available pile resistance for combinations
  of CPT, pile size, and pile tip level.
- A **pile configuration** is the combination of pile size and pile tip level.
- A **pile option** is a configuration evaluated for a load point using its
  selected CPTs. It may be usable, have insufficient capacity, or lack capacity
  data for one or more selected CPTs.
- The governing resistance is determined by the governing selected CPT. The
  utilization compares the load-point demand with the available resistance.
- A **pile plan** is a named variant containing active pile sizes and tip
  levels, pile assignments, locks, and optimizer outcomes.
- Load-point groups require their members to use the same pile configuration.
- Optimization searches for a practical, lower-cost pile plan with limited
  configuration diversity while respecting technical availability, groups,
  locks, and the selected optimization settings.

Keep these concepts distinct in the domain model and interface. In particular,
do not conflate missing source data, insufficient capacity, inactive legend
configurations, optimizer restrictions, and unresolved optimizer outcomes.

## Architecture

- `crates/pile-plan-core` is the source of truth for engineering rules,
  calculations, imports, project operations, and optimization.
- Keep focused core subsystems in their existing feature modules:
  `pile_options/` for pile-option analysis, `optimization/` for optimizer
  preparation and execution, `tip_level_regions/` for the region topology,
  and `import/` for source-import workflows. Do not recreate a generic
  `analysis` or `spatial` catch-all module.
- `crates/pile-plan-wasm` is a thin browser wrapper around the Rust core.
- `apps/pile-plan-studio` contains the React/TypeScript interface and Tauri
  desktop shell.
- In the frontend, keep runtime orchestration in `app/`, pure immutable logic
  in feature folders below `domain/`, and feature views below
  `components/domain/`. Colocate feature-specific models, styles, and tests;
  reserve `components/domain/shared/` for genuinely reusable view primitives.
- TypeScript may derive presentation state, but must not duplicate engineering
  decisions that belong in the Rust core.
- Keep browser/WASM and desktop/native behavior aligned.
- Do not edit generated files in
  `apps/pile-plan-studio/src/core/wasm/pile-plan-wasm` manually. Regenerate them
  through the existing npm scripts.

See `docs/architecture.md` for more detail.

## Project state and persistence

Keep these categories separate:

- project-owned content stored in the IFCPP project;
- application-wide user preferences;
- transient interface and runtime state.

Project-content changes must participate correctly in undo/redo and dirty
state. When changing the IFCPP schema, preserve supported older schema versions
through normalization or migration and add corresponding tests.

Avoid mutating stored maps, arrays, or pile plans in place when project history
depends on structural comparison.

Optimization previews are transient: save, recovery, and undo history must not
capture intermediate solutions. Commit a validated outcome and its per-plan
summary as one project change. Keep the run's destination independent of the
currently viewed plan, and show stopping until cancellation is acknowledged.
Distinguish cost-reference optimality from the returned plan's optimality.

Panel proportions and pile-option column visibility/order are application
preferences, not project edits. Preserve separate column layouts for single
and multiple load-point selection.

## Interface

- Maintain both Dutch and English translations for every user-facing string.
- Update the relevant translation tests when adding or changing copy.
- Prefer concise Dutch terminology consistent with the existing interface.
- Do not use color alone to communicate state.
- Keep controls usable at the compact application baseline and with longer
  translated labels.
- Treat application chrome and the plan drawing as separate color systems.
  Application chrome may use `--theme-*` variables. Project annotations that
  must look identical on the white drawing canvas across themes must use an
  explicit viewer-owned color; in particular, related load-point group rings
  must not derive their stroke from themed text colors.
- Before changing viewer geometry, scaling, or marker layers, read
  `apps/pile-plan-studio/src/viewer/README.md` and preserve its invariants.
- Inspect visible interface changes in the browser preview. For viewer color
  changes, compare at least the light theme and one dark theme.
- Use Tauri as well when testing native files, windows, or desktop integration.

## Repository workflow

- Preserve unrelated changes already present in the working tree.
- Create Git worktrees inside the repository-local `.worktrees/` directory by
  default. Keep that directory ignored, and use another worktree location only
  when the user explicitly requests it.
- Keep work in one task by default. Do not delegate to subagents unless the
  user explicitly requests parallel work.
- Do not commit, push, merge, publish, or create a release unless the user asks.
- Do not prefix branch names with `codex/`. Use a concise feature or release
  name agreed with the user.
- After a feature branch has been incorporated into `main`, verify that deleting
  it would not lose unmerged work, then remove it locally and from the remote
  unless the user asks to retain it. Never delete the currently checked-out
  branch or a branch still used by a worktree.

## Verification commands

Rust workspace:

```powershell
cargo test --workspace
```

Frontend tests:

```powershell
cd apps\pile-plan-studio
npm test
```

Production browser build:

```powershell
cd apps\pile-plan-studio
npm run build
```

Live browser viewer:

```powershell
cd apps\pile-plan-studio
npm run dev
```

For Tauri-specific or release work, also perform the relevant desktop build or
manual desktop verification described in `docs/deployment.md`.
The root workspace excludes the Tauri crate; test it separately from the
repository root with `cargo test --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml`.
Native HiGHS build prerequisites are documented in that deployment guide.

## Documentation and releases

Update documentation when behavior, architecture, supported data, or known
limitations change. Do not update versions, release notes, screenshots, or
deployment configuration unless they are part of the requested work.

Keep implementation plans local in the ignored `docs/plans/` directory; do not
add them to Git or link to them from public documentation. Current behavior
belongs in the maintained architecture and user documentation. Dated design
records describe historical decisions and may have been superseded.
