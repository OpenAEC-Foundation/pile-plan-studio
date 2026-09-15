# Architecture

Pile Plan Studio follows the OpenAEC application model:

- Rust contains the domain core: CPT selection, bearing-capacity checks, pile
  option calculation, cost calculation, and project data operations.
- Tauri exposes the Rust core to the desktop application through native
  commands.
- TypeScript is kept as the viewer layer: UI state, map interaction, rendering,
  formatting, symbols, and browser-specific presentation behavior.
- The frontend calls the Rust core through `@tauri-apps/api/core` commands when
  it runs inside Tauri.
- The browser build uses `crates/pile-plan-wasm`, a thin WebAssembly wrapper
  around the same Rust core. This keeps the Vite preview aligned with the
  desktop calculation model.

The guiding rule is that engineering decisions must be implemented and tested in
`crates/pile-plan-core` first. Frontend code may present results, but should not
be the source of truth for calculations.

The pile-option calculation is grouped under `pile_options/`:

- `source_data.rs` owns load points, CPTs, and flat foundation-advice rows;
- `cpt_selection.rs` owns automatic and manual CPT selection;
- `pile_options/foundation_advice.rs` builds the runtime advice index;
- `pile_options/costs.rs` owns cost settings, validation, and physical cost calculation;
- `pile_options/mod.rs` evaluates and ranks pile configurations; and
- `pile_options/analysis.rs` coordinates one batched calculation for the requested load points.

Optimization is grouped under `optimization/`, while `tip_level_regions/`
owns the load-point topology, Gabriel graph, bounded faces, and grouping used
to render pile-tip-level regions. The generic `spatial` name is deliberately
avoided because this geometry exists for that specific domain purpose.

Foundation advice remains stored as flat rows keyed by CPT ID. The batch
orchestrator builds one internal index and reuses it for all requested load
points, so CPTs without advice remain representable without repeated full-row
searches during option calculation.

The detailed ownership audit, including explicit reasons for behavior that
remains in TypeScript, is maintained in
[`docs/domain-ownership.md`](domain-ownership.md).

Canonical project persistence follows one boundary in both runtimes:

```text
Open: IFCPP text -> Rust migration and validation -> canonical project
                 -> TypeScript hydration -> React state

Save: React project content -> TypeScript project draft -> Rust validation and
                              serialization -> IFCPP text
```

IndexedDB, undo/redo, and dirty-state tracking remain TypeScript application
infrastructure. IndexedDB stores Rust-serialized IFCPP text, restored text uses
the same Rust read path as an opened file, and undo/redo restores project-owned
content before Rust-derived analysis is recalculated.

Pile tip levels remain metre values in IFCPP exchange data and physical
calculations. The Rust core validates those values and produces exact integer
millimetre keys for identity, equality, ordering, and deduplication. WASM and
Tauri pass those keys through unchanged; TypeScript consumes them for discrete
state and applies locale-aware metre formatting only for presentation.

## Runtime Matrix

| Runtime | Core route | Best use |
| --- | --- | --- |
| Browser / Vite | Rust core compiled to WASM | Fast UI checks and web behavior |
| Desktop / Tauri | Native Rust commands | Final desktop behavior, file access, native integration |

Use the browser preview for most visual and interaction work. Use the desktop app
when testing anything that depends on Tauri, local file access, window behavior,
or native integrations.

## Viewer

The plan viewer uses a fixed, uniform project transform and keeps application
scale, layout compensation, and interactive plan zoom as separate layers. This
prevents markers and pointer interactions from drifting when panels resize or
when browser and desktop presentation scales differ.

The implementation invariants, coordinate pipeline, regression symptoms, and
manual test procedure live beside the viewer code in
[`apps/pile-plan-studio/src/viewer/README.md`](../apps/pile-plan-studio/src/viewer/README.md).
