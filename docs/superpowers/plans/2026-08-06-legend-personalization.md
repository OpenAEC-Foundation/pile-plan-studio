# Legend Personalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-scoped legend personalization with reversible size/tip encoding, composed symbols, manual and automatic styling, five color schemes, IFCPP persistence, Undo, and consistent rendering throughout Pile Plan Studio.

**Architecture:** A pure legend domain model owns defaults, reconciliation, assignment, and style resolution. IFCPP stores tolerant wire values while the frontend normalizes individual entries and reports non-blocking warnings. One SVG symbol renderer and one resolved-style function feed the viewer, normal legend, pile-options table, hover information, and editor previews.

**Tech Stack:** Rust/Serde project model, TypeScript 6, React 19, SVG strings, i18next, Node test runner, Cargo tests, Vite/WASM build.

## Global Constraints

- Legend settings belong to the project, never to a pile plan or global user preferences.
- New and older projects use the immutable built-in mapping matching the current appearance.
- Every size and tip level retains both a color and a symbol, independent of the active encoding mode.
- The symbol catalog is exactly nine base shapes by six fill patterns, ordered full, top, bottom, left, right, diagonal.
- The uncolored symbol portion is opaque light neutral; it must not reveal objects underneath.
- Automatic symbol assignment must refuse scopes above 54 values and must never repeat symbols silently.
- Automatic color assignment offers Distinct, Colorblind-friendly, Rainbow, Light to dark, and Cool to warm.
- Colorblind-friendly is presented as an aid, not a guarantee; shape and fill remain independent channels.
- Applied activation and appearance changes form one Undo entry; Cancel, Escape, and close leak no draft state.
- One malformed stored mapping falls back only for the affected value and never blocks project loading.
- Viewer, normal legend, table symbols, hover information, and editor previews use one shared style interpretation.
- Exact monochrome size-plus-tip configuration symbols and CAD/BIM export remain out of scope.

---

## File Structure

### New focused files

- `apps/pile-plan-studio/src/viewer/legendSymbols.ts`: symbol enums, catalog order, validation, and defaults.
- `apps/pile-plan-studio/src/viewer/legendColors.ts`: the five deterministic color generators and previews.
- `apps/pile-plan-studio/src/components/domain/LegendSymbolPicker.tsx`: base-shape and fill-pattern picker.
- `apps/pile-plan-studio/src/components/domain/LegendColorPicker.tsx`: native color input plus validated hex input.
- `apps/pile-plan-studio/src/components/domain/LegendColorSchemeSelect.tsx`: keyboard-accessible scheme listbox and previews.

### Existing files with changed responsibilities

- `apps/pile-plan-studio/src/viewer/legend.ts`: project legend defaults, reconciliation, auto assignment, and resolved configuration style.
- `apps/pile-plan-studio/src/viewer/pileSymbols.ts`: render a composed `PileSymbol`, not a legacy shape string.
- `apps/pile-plan-studio/src/domain/legendEditorModel.ts`: complete temporary draft operations.
- `apps/pile-plan-studio/src/components/domain/LegendEditor.tsx`: modal composition only; no direct project writes.
- `apps/pile-plan-studio/src/core/projectFile.ts`: tolerant IFCPP wire conversion and warning collection.
- `crates/pile-plan-core/src/project.rs`: optional Rust wire model preserved by import/export.

---

### Task 1: Add The Optional IFCPP Legend Wire Model

**Files:**
- Modify: `crates/pile-plan-core/src/project.rs`
- Modify: `crates/pile-plan-core/src/ifcpp.rs`
- Modify: `crates/pile-plan-core/src/import.rs`
- Test: `crates/pile-plan-core/src/project.rs`
- Test: `crates/pile-plan-core/src/ifcpp.rs`

**Interfaces:**
- Produces: `ProjectSettings.pile_legend: Option<ProjectLegendSettings>`.
- Produces: tolerant string-valued `ProjectPileSymbol`, `ProjectLegendValueStyle`, and `ProjectLegendSettings` Serde structs.
- Preserves: older IFCPP files without `pile_legend` deserialize as `None`.

- [ ] **Step 1: Write failing Rust compatibility and round-trip tests**

Add tests that deserialize settings without the field and round-trip explicit settings:

```rust
#[test]
fn project_settings_accept_missing_pile_legend() {
    let settings: ProjectSettings = serde_json::from_value(base_settings_json()).unwrap();
    assert!(settings.pile_legend.is_none());
}

#[test]
fn project_settings_round_trip_pile_legend() {
    let legend = ProjectLegendSettings {
        encoding_mode: "tip-symbol".into(),
        pile_sizes: vec![ProjectLegendValueStyle {
            value: 320.0,
            symbol: ProjectPileSymbol {
                base_shape: "square".into(),
                fill_pattern: "top-half".into(),
            },
            color: "#0072B2".into(),
        }],
        pile_tip_levels: vec![],
    };
    let value = serde_json::to_value(&legend).unwrap();
    let restored: ProjectLegendSettings = serde_json::from_value(value).unwrap();
    assert_eq!(restored, legend);
}
```

- [ ] **Step 2: Run the focused Rust tests and verify the missing types fail compilation**

Run: `cargo test -p pile-plan-core project_settings`

Expected: FAIL because `pile_legend` and the new structs do not exist.

- [ ] **Step 3: Add tolerant Rust wire structs**

Implement serializable string-valued structs so unknown future values survive Rust parsing and can be normalized per item in TypeScript:

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProjectPileSymbol {
    pub base_shape: String,
    pub fill_pattern: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProjectLegendValueStyle {
    pub value: f64,
    pub symbol: ProjectPileSymbol,
    pub color: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProjectLegendSettings {
    pub encoding_mode: String,
    #[serde(default)]
    pub pile_sizes: Vec<ProjectLegendValueStyle>,
    #[serde(default)]
    pub pile_tip_levels: Vec<ProjectLegendValueStyle>,
}
```

Add `#[serde(default)] pub pile_legend: Option<ProjectLegendSettings>` to `ProjectSettings` and initialize it as `None` in all project/import constructors.

- [ ] **Step 4: Run the focused and complete Rust tests**

Run: `cargo test -p pile-plan-core project_settings`

Expected: PASS.

Run: `cargo test --workspace`

Expected: PASS with no changed import behavior.

- [ ] **Step 5: Commit the wire model**

```powershell
git add crates/pile-plan-core/src/project.rs crates/pile-plan-core/src/ifcpp.rs crates/pile-plan-core/src/import.rs
git commit -m "feat: add project legend wire model"
```

---

### Task 2: Define The Symbol Catalog And Color Schemes

**Files:**
- Create: `apps/pile-plan-studio/src/viewer/legendSymbols.ts`
- Create: `apps/pile-plan-studio/src/viewer/legendSymbols.test.ts`
- Create: `apps/pile-plan-studio/src/viewer/legendColors.ts`
- Create: `apps/pile-plan-studio/src/viewer/legendColors.test.ts`
- Modify: `apps/pile-plan-studio/src/core/projectTypes.ts`

**Interfaces:**
- Produces: `PileBaseShape`, `PileFillPattern`, `PileSymbol`, `LegendEncodingMode`, `LegendValueStyle`, and revised `LegendItems`.
- Produces: `PILE_SYMBOL_CATALOG: readonly PileSymbol[]` in documented 54-item order.
- Produces: `generateLegendColors(scheme: LegendColorScheme, count: number): string[]` and `getLegendColorSchemePreview`.

- [ ] **Step 1: Write failing catalog and color determinism tests**

Cover the exact nine shapes, six fill blocks, unique 54 combinations, stable previews, edge counts 0/1, and deterministic output for every scheme:

```ts
test("orders 54 symbols by fill pattern and then base shape", () => {
  assert.equal(PILE_SYMBOL_CATALOG.length, 54);
  assert.deepEqual(PILE_SYMBOL_CATALOG.slice(0, 9),
    PILE_BASE_SHAPES.map((baseShape) => ({ baseShape, fillPattern: "full" })));
  assert.equal(new Set(PILE_SYMBOL_CATALOG.map(symbolKey)).size, 54);
});

for (const scheme of LEGEND_COLOR_SCHEMES) {
  test(`${scheme} is deterministic`, () => {
    assert.deepEqual(generateLegendColors(scheme, 12), generateLegendColors(scheme, 12));
    assert.equal(generateLegendColors(scheme, 12).length, 12);
  });
}
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `node --test src/viewer/legendSymbols.test.ts src/viewer/legendColors.test.ts`

Working directory: `apps/pile-plan-studio`

Expected: FAIL because the modules and types do not exist.

- [ ] **Step 3: Replace legacy shape types and implement the catalog**

Use these exact types:

```ts
export type PileBaseShape =
  | "circle" | "square" | "diamond"
  | "triangle-up" | "triangle-down" | "triangle-left" | "triangle-right"
  | "rectangle-horizontal" | "rectangle-vertical";

export type PileFillPattern =
  | "full" | "top-half" | "bottom-half"
  | "left-half" | "right-half" | "diagonal-half";

export type PileSymbol = { baseShape: PileBaseShape; fillPattern: PileFillPattern };
export type LegendEncodingMode = "size-symbol" | "tip-symbol";
export type LegendValueStyle = { value: number; symbol: PileSymbol; color: string };
export type LegendItems = {
  encodingMode: LegendEncodingMode;
  pileSizes: LegendValueStyle[];
  pileTipLevels: LegendValueStyle[];
};
export type PileConfigurationStyle = { symbol: PileSymbol; color: string };
```

- [ ] **Step 4: Implement the five color generators**

Keep the existing Tableau-10 plus golden-angle algorithm for `distinct`. Start `colorblind-friendly` with this discrete sequence:

```ts
const COLORBLIND_BASE = [
  "#0072B2", "#E69F00", "#009E73", "#CC79A7",
  "#56B4E9", "#D55E00", "#B79F00", "#6A3D9A",
] as const;
```

After the base sequence, generate controlled lightness variants in alternating 42%, 62%, 34%, and 70% bands while preserving the base hue. Generate rainbow evenly over hue, light-to-dark over a bounded blue HSL scale, and cool-to-warm by piecewise interpolation through blue, cyan, yellow, orange, and red. Clamp RGB channels and return uppercase six-digit hex colors.

- [ ] **Step 5: Run focused tests**

Run: `node --test src/viewer/legendSymbols.test.ts src/viewer/legendColors.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the catalogs**

```powershell
git add apps/pile-plan-studio/src/core/projectTypes.ts apps/pile-plan-studio/src/viewer/legendSymbols.ts apps/pile-plan-studio/src/viewer/legendSymbols.test.ts apps/pile-plan-studio/src/viewer/legendColors.ts apps/pile-plan-studio/src/viewer/legendColors.test.ts
git commit -m "feat: add legend symbol and color catalogs"
```

---

### Task 3: Build The Pure Project Legend Model

**Files:**
- Modify: `apps/pile-plan-studio/src/viewer/legend.ts`
- Modify: `apps/pile-plan-studio/src/viewer/legend.test.ts`
- Modify: `apps/pile-plan-studio/src/domain/legendState.ts`
- Modify: `apps/pile-plan-studio/src/domain/legendState.test.ts`

**Interfaces:**
- Produces: `createBuiltInLegend(capacities: BearingCapacity[]): LegendItems`.
- Produces: `reconcileProjectLegend(stored, capacities): { legend; warnings }`.
- Produces: `getConfigurationStyle(configuration, legend): PileConfigurationStyle`.
- Produces: automatic symbol/color assignment functions with scoped value sets.
- Preserves: stored styles for temporarily absent values.

- [ ] **Step 1: Replace legacy tests with failing project-owned model tests**

Test deterministic defaults, reversed encoding, stored/new/returning reconciliation, per-item malformed fallback, and scope behavior:

```ts
test("reverses both visual channels without losing mappings", () => {
  const legend = fixtureLegend();
  assert.deepEqual(getConfigurationStyle({ size: 320, tip_level: -18 }, legend), {
    symbol: legend.pileSizes[0].symbol,
    color: legend.pileTipLevels[0].color,
  });
  const reversed = { ...legend, encodingMode: "tip-symbol" as const };
  assert.deepEqual(getConfigurationStyle({ size: 320, tip_level: -18 }, reversed), {
    symbol: legend.pileTipLevels[0].symbol,
    color: legend.pileSizes[0].color,
  });
});

test("retains absent mappings and adds only new deterministic defaults", () => {
  const result = reconcileProjectLegend(storedLegendWithAbsentValue(), currentCapacities());
  assert.ok(result.legend.pileSizes.some(({ value }) => value === 290));
  assert.equal(styleForValue(result.legend.pileSizes, 320).color, "#123456");
});
```

- [ ] **Step 2: Run focused tests and verify failures**

Run: `node --test src/viewer/legend.test.ts src/domain/legendState.test.ts`

Expected: FAIL on the new project-owned interfaces.

- [ ] **Step 3: Implement defaults, normalization, reconciliation, and style resolution**

Use numeric sorting and stable value keys. `reconcileProjectLegend` must retain all valid stored entries, replace only malformed channels for their value, append new observed values, and return structured warnings:

```ts
export type LegendImportWarning = {
  itemType: "size" | "tipLevel" | "encodingMode";
  value?: number;
  field: "encodingMode" | "symbol" | "color";
};
```

Do not filter mappings merely because their values are absent from current foundation advice.

- [ ] **Step 4: Implement scoped automatic assignment**

Expose:

```ts
assignLegendSymbols(legend, kind, includedValues):
  | { ok: true; legend: LegendItems }
  | { ok: false; reason: "catalog-exhausted"; limit: 54 };

assignLegendColors(legend, kind, includedValues, scheme): LegendItems;
resetLegendAppearance(legend, capacities): LegendItems;
```

The reset function restores mappings and `size-symbol`, but the caller remains responsible for retaining activation.

- [ ] **Step 5: Update used/enabled derivation to preserve full style items**

`legendState.ts` must join active and used values onto project `LegendValueStyle` entries rather than reconstructing shapes/colors from capacities.

- [ ] **Step 6: Run focused tests**

Run: `node --test src/viewer/legend.test.ts src/domain/legendState.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the pure model**

```powershell
git add apps/pile-plan-studio/src/viewer/legend.ts apps/pile-plan-studio/src/viewer/legend.test.ts apps/pile-plan-studio/src/domain/legendState.ts apps/pile-plan-studio/src/domain/legendState.test.ts
git commit -m "feat: add project legend model"
```

---

### Task 4: Render Composed Vector Symbols Once

**Files:**
- Modify: `apps/pile-plan-studio/src/viewer/pileSymbols.ts`
- Modify: `apps/pile-plan-studio/src/viewer/pileSymbols.test.ts`

**Interfaces:**
- Produces: `renderPileSymbol(symbol: PileSymbol, fillColor: string): string`.
- Consumes: `PileSymbol` from `legendSymbols.ts`.
- Guarantees: one opaque neutral base, one clipped colored layer, and one final contour.

- [ ] **Step 1: Write failing SVG structure tests for all 54 symbols**

For every catalog item, assert valid SVG markup, the requested color, neutral fill, contour, and no legacy switch fallback. Add focused clip geometry assertions for each fill pattern.

```ts
test("half-filled symbols keep an opaque neutral remainder", () => {
  const svg = renderPileSymbol({ baseShape: "circle", fillPattern: "top-half" }, "#0072B2");
  assert.match(svg, /fill="#F3F5F6"/);
  assert.match(svg, /fill="#0072B2"/);
  assert.match(svg, /clipPath/);
  assert.doesNotMatch(svg, /fill="transparent"/);
});
```

- [ ] **Step 2: Run the focused renderer test and verify failure**

Run: `node --test src/viewer/pileSymbols.test.ts`

Expected: FAIL because the renderer still accepts `PileShape`.

- [ ] **Step 3: Implement geometry plus fill clips**

Render each base silhouette from a shared path/primitive definition, clip the colored copy to the selected region, and draw the outline last using the existing viewer outline color and proportional stroke. Use a unique deterministic clip id derived from symbol and color-safe call-local suffix; do not use DOM measurement or raster output.

- [ ] **Step 4: Run the renderer test**

Run: `node --test src/viewer/pileSymbols.test.ts`

Expected: PASS for all 54 combinations.

- [ ] **Step 5: Commit the renderer**

```powershell
git add apps/pile-plan-studio/src/viewer/pileSymbols.ts apps/pile-plan-studio/src/viewer/pileSymbols.test.ts
git commit -m "feat: render composed pile symbols"
```

---

### Task 5: Persist, Recover, And Undo Legend Settings

**Files:**
- Modify: `apps/pile-plan-studio/src/core/projectFile.ts`
- Modify: `apps/pile-plan-studio/src/core/projectFile.test.ts`
- Modify: `apps/pile-plan-studio/src/domain/projectContent.ts`
- Modify: `apps/pile-plan-studio/src/domain/projectContent.test.ts`
- Modify: `apps/pile-plan-studio/src/domain/historyAction.ts`
- Modify: `apps/pile-plan-studio/src/domain/historyAction.test.ts`
- Modify: `apps/pile-plan-studio/src/domain/projectState.ts`
- Modify: `apps/pile-plan-studio/src/domain/projectState.test.ts`
- Modify: `apps/pile-plan-studio/src/App.tsx`

**Interfaces:**
- Adds: `pileLegend: LegendItems` and `legendImportWarnings: LegendImportWarning[]` to loaded/project state.
- Serializes: `settings.pile_legend` with snake_case symbol keys.
- Adds: `pileLegend` to `ProjectContent` and `PROJECT_CONTENT_KEYS`.
- Emits: history action kind `legend-settings` whenever activation or appearance changes.

- [ ] **Step 1: Write failing old-file, round-trip, malformed-entry, refresh, Undo, and recovery tests**

Include:

```ts
test("falls back only the malformed legend value", () => {
  const project = projectFixtureWithLegend();
  project.settings.pile_legend!.pile_sizes[0].symbol.base_shape = "future-star";
  const loaded = loadIfcppProjectData(project);
  assert.equal(loaded.legendImportWarnings.length, 1);
  assert.equal(loaded.legendImportWarnings[0].value, 290);
  assert.equal(loaded.pileLegend.pileSizes[1].color, project.settings.pile_legend!.pile_sizes[1].color);
});

test("captures legend by reference in project content until it changes", () => {
  const content = captureProjectContent(state);
  assert.strictEqual(content.pileLegend, state.pileLegend);
});
```

Also verify older IFCPP input receives defaults, explicit mappings round-trip, refreshed projects retain custom mappings, and Undo/Redo restores all activation and appearance together.

- [ ] **Step 2: Run focused persistence/history tests and verify failures**

Run: `node --test src/core/projectFile.test.ts src/domain/projectContent.test.ts src/domain/historyAction.test.ts src/domain/projectState.test.ts`

Expected: FAIL because legend state is not persisted or captured.

- [ ] **Step 3: Add tolerant TypeScript wire conversion**

Define snake-case wire types in `projectFile.ts`; call `reconcileProjectLegend` during load. Serialize normalized values during `createIfcppProject`. Keep structured warnings runtime-only and omit them from IFCPP output.

When an opened project has warnings, `App.tsx` calls `showStatusMessage` with the localized first affected value plus a count for remaining warnings. Imported source previews append localized legend warnings to their existing non-blocking warning list.

- [ ] **Step 4: Add legend to project content and history classification**

Add `pileLegend` to the content key list and classify a change as `legend-settings` when either active arrays or the `pileLegend` reference differs. Preserve structural sharing: runtime viewport changes must not copy legend arrays.

- [ ] **Step 5: Preserve mappings across source refresh**

In refresh/import state creation, reconcile the current project's legend with new capacities. New-project import uses built-in defaults. Opening explicit IFCPP uses stored settings. Browser recovery requires no separate format because `projectFromState` now serializes the legend.

- [ ] **Step 6: Run focused tests**

Run: `node --test src/core/projectFile.test.ts src/domain/projectContent.test.ts src/domain/historyAction.test.ts src/domain/projectState.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit persistence and history**

```powershell
git add apps/pile-plan-studio/src/core/projectFile.ts apps/pile-plan-studio/src/core/projectFile.test.ts apps/pile-plan-studio/src/domain/projectContent.ts apps/pile-plan-studio/src/domain/projectContent.test.ts apps/pile-plan-studio/src/domain/historyAction.ts apps/pile-plan-studio/src/domain/historyAction.test.ts apps/pile-plan-studio/src/domain/projectState.ts apps/pile-plan-studio/src/domain/projectState.test.ts apps/pile-plan-studio/src/App.tsx
git commit -m "feat: persist and undo legend settings"
```

---

### Task 6: Route Every Visual Consumer Through The Project Legend

**Files:**
- Modify: `apps/pile-plan-studio/src/components/domain/Legend.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/Legend.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/PilePlanViewer.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/PilePlanViewer.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/RightPanel.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/RightPanel.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/rightPanelModel.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/rightPanelModel.test.ts`

**Interfaces:**
- Consumes: `state.pileLegend` and `getConfigurationStyle`.
- Removes: component-level `getLegendItems(bearingCapacities)` regeneration.
- Preserves: selection rings, CPT symbols, missing crosses, utilization overlays, and normal legend click behavior.

- [ ] **Step 1: Write failing consistency tests**

Use a reversed fixture whose size color and tip symbol are unmistakable. Assert the normal legend, viewer and its built-in hover-candidate information, and pile-options rows from `rightPanelModel.ts` reference the same resolved symbol/color. Add assertions that semantic overlays remain separate.

- [ ] **Step 2: Run affected component tests and verify failures**

Run: `node --test src/components/domain/Legend.test.ts src/components/domain/PilePlanViewer.test.ts src/components/domain/RightPanel.test.ts src/components/domain/rightPanelModel.test.ts`

Expected: FAIL because consumers still regenerate legacy styles.

- [ ] **Step 3: Replace every legacy lookup**

Pass `state.pileLegend` or already-resolved `PileConfigurationStyle` through component props. Do not duplicate encoding-mode conditionals in components. Use `renderPileSymbol(style.symbol, style.color)` everywhere.

- [ ] **Step 4: Verify no legacy path remains**

Run: `rg -n "getLegendItems\(|PileShape|\.shape\b" apps/pile-plan-studio/src`

Expected: no legacy shape API or component-level legend generation; unrelated CSS `shape` words may remain only where semantically different.

- [ ] **Step 5: Run affected component tests**

Run: `node --test src/components/domain/Legend.test.ts src/components/domain/PilePlanViewer.test.ts src/components/domain/RightPanel.test.ts src/components/domain/rightPanelModel.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit visual integration**

```powershell
git add apps/pile-plan-studio/src/components/domain/Legend.tsx apps/pile-plan-studio/src/components/domain/Legend.test.ts apps/pile-plan-studio/src/components/domain/PilePlanViewer.tsx apps/pile-plan-studio/src/components/domain/PilePlanViewer.test.ts apps/pile-plan-studio/src/components/domain/RightPanel.tsx apps/pile-plan-studio/src/components/domain/RightPanel.test.ts apps/pile-plan-studio/src/components/domain/rightPanelModel.ts apps/pile-plan-studio/src/components/domain/rightPanelModel.test.ts
git commit -m "refactor: unify project legend rendering"
```

---

### Task 7: Expand The Legend Editor Draft Model

**Files:**
- Modify: `apps/pile-plan-studio/src/domain/legendEditorModel.ts`
- Modify: `apps/pile-plan-studio/src/domain/legendEditorModel.test.ts`

**Interfaces:**
- Produces: `LegendEditorDraft` containing `active`, `legend`, `assignmentScope`, and `colorScheme`.
- Produces: immutable operations for enabling, appearance editing, mode switching, bulk assignment, and reset.
- Does not write: project state or React state directly.

- [ ] **Step 1: Write failing reducer-style draft tests**

Cover separate activation and appearance actions, disabled mapping retention, mode switching, independent auto actions, 54-limit validation, reset retaining activation, and draft isolation:

```ts
test("reset restores appearance but retains activation", () => {
  const draft = customizedDraft({ activePileSizes: [320], activePileTipLevels: [] });
  const reset = resetLegendEditorAppearance(draft, capacities);
  assert.deepEqual(reset.active, draft.active);
  assert.equal(reset.legend.encodingMode, "size-symbol");
  assert.notStrictEqual(reset.legend, draft.legend);
});
```

- [ ] **Step 2: Run the focused draft tests and verify failure**

Run: `node --test src/domain/legendEditorModel.test.ts`

Expected: FAIL because the current draft contains activation only.

- [ ] **Step 3: Implement exact immutable operations**

Implement:

```ts
createLegendEditorDraft(active, legend): LegendEditorDraft;
setLegendEditorItemEnabled(draft, kind, value, enabled): LegendEditorDraft;
updateLegendSymbol(draft, kind, value, symbol): LegendEditorDraft;
updateLegendColor(draft, kind, value, color): LegendEditorDraft;
setLegendEncodingMode(draft, mode): LegendEditorDraft;
setLegendAssignmentScope(draft, scope): LegendEditorDraft;
setLegendColorScheme(draft, scheme): LegendEditorDraft;
applyAutomaticSymbols(draft, kind): LegendEditorActionResult;
applyAutomaticColors(draft, kind): LegendEditorDraft;
resetLegendEditorAppearance(draft, capacities): LegendEditorDraft;
```

`assignmentScope` and `colorScheme` are editor-session preferences only; Apply extracts only activation and `legend`.

- [ ] **Step 4: Run the focused draft tests**

Run: `node --test src/domain/legendEditorModel.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the editor model**

```powershell
git add apps/pile-plan-studio/src/domain/legendEditorModel.ts apps/pile-plan-studio/src/domain/legendEditorModel.test.ts
git commit -m "feat: expand legend editor draft model"
```

---

### Task 8: Build Accessible Symbol, Color, And Scheme Controls

**Files:**
- Create: `apps/pile-plan-studio/src/components/domain/LegendSymbolPicker.tsx`
- Create: `apps/pile-plan-studio/src/components/domain/LegendSymbolPicker.test.ts`
- Create: `apps/pile-plan-studio/src/components/domain/LegendColorPicker.tsx`
- Create: `apps/pile-plan-studio/src/components/domain/LegendColorPicker.test.ts`
- Create: `apps/pile-plan-studio/src/components/domain/LegendColorSchemeSelect.tsx`
- Create: `apps/pile-plan-studio/src/components/domain/LegendColorSchemeSelect.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/LegendEditor.css`

**Interfaces:**
- Symbol picker: controlled `value: PileSymbol`, `onChange(symbol)`.
- Color picker: controlled valid `value: string`, `onChange(hex)`; retains invalid text locally until corrected or blurred.
- Scheme select: controlled `value: LegendColorScheme`, `onChange(scheme)` with keyboard navigation.

- [ ] **Step 1: Write failing component contract tests**

Assert nine shape choices, six fill radio choices with current-shape previews, localized accessible names, invalid hex retention, blur restoration, five scheme names/previews, arrow-key movement, Enter selection, and Escape close.

- [ ] **Step 2: Run focused component tests and verify failure**

Run: `node --test src/components/domain/LegendSymbolPicker.test.ts src/components/domain/LegendColorPicker.test.ts src/components/domain/LegendColorSchemeSelect.test.ts`

Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement the controlled symbol picker**

Use icon buttons in a 3-column base-shape grid and a six-option radiogroup. Render all previews through `renderPileSymbol`; never recreate symbol SVG in React.

- [ ] **Step 4: Implement the validated color picker**

Accept only `/^#[0-9A-Fa-f]{6}$/`, normalize accepted values to uppercase, keep the last valid project draft untouched while text is invalid, and restore the last valid value on blur.

- [ ] **Step 5: Implement the scheme listbox**

Use `role="listbox"`/`role="option"`, roving keyboard focus, text labels, and 7-swatch previews from `getLegendColorSchemePreview`. The closed trigger shows selected label and preview.

- [ ] **Step 6: Add compact responsive styling**

Ensure fill choices are one row when space permits and 3-by-2 on narrow pickers. Add explicit theme focus styles and keep cards at or below 8px radius.

- [ ] **Step 7: Run focused component tests**

Run: `node --test src/components/domain/LegendSymbolPicker.test.ts src/components/domain/LegendColorPicker.test.ts src/components/domain/LegendColorSchemeSelect.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the picker controls**

```powershell
git add apps/pile-plan-studio/src/components/domain/LegendSymbolPicker.tsx apps/pile-plan-studio/src/components/domain/LegendSymbolPicker.test.ts apps/pile-plan-studio/src/components/domain/LegendColorPicker.tsx apps/pile-plan-studio/src/components/domain/LegendColorPicker.test.ts apps/pile-plan-studio/src/components/domain/LegendColorSchemeSelect.tsx apps/pile-plan-studio/src/components/domain/LegendColorSchemeSelect.test.ts apps/pile-plan-studio/src/components/domain/LegendEditor.css
git commit -m "feat: add legend appearance controls"
```

---

### Task 9: Assemble The Complete Legend Editor And Localize It

**Files:**
- Modify: `apps/pile-plan-studio/src/components/domain/LegendEditor.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/LegendEditor.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/LegendEditor.css`
- Modify: `apps/pile-plan-studio/src/components/domain/PilePlanWorkspace.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/PilePlanWorkspace.test.ts`
- Modify: `apps/pile-plan-studio/src/i18n/locales/en/common.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/nl/common.json`
- Modify: `apps/pile-plan-studio/src/components/domain/WorkspaceTranslations.test.ts`

**Interfaces:**
- Editor receives applied `active` plus `legend`, then returns one complete applied draft.
- Workspace commits one `commitProjectState` update for activation and legend appearance.
- Cancel, close, and Escape return no draft.

- [ ] **Step 1: Write failing editor integration and localization tests**

Assert the exact encoding copy, dynamic complementary line, 65/35 columns, stacked responsive rule, separate appearance and activation controls, shared assignment scope, two independent assignment buttons, symbol limit message, reset behavior, Apply/Cancel isolation, and complete Dutch/English keys.

- [ ] **Step 2: Run focused editor tests and verify failure**

Run: `node --test src/components/domain/LegendEditor.test.ts src/components/domain/PilePlanWorkspace.test.ts src/components/domain/WorkspaceTranslations.test.ts`

Expected: FAIL on missing controls and translations.

- [ ] **Step 3: Assemble the editor layout**

Place the encoding segmented control first, then assignment scope and automatic controls, followed by size and tip sections. Use approximately `grid-template-columns: minmax(0, 1.85fr) minmax(12rem, 1fr)` and stack below 760px.

Enabled rows contain appearance trigger, inert value text, and deactivate icon. Disabled rows contain value text, conditional used warning, and activate icon; do not render retained appearance in disabled rows.

- [ ] **Step 4: Add exact localized copy**

Include:

```json
{
  "symbolRepresents": "Symbol represents",
  "colorRepresentsTip": "Color represents tip level",
  "colorRepresentsSize": "Color represents size",
  "colorblindFriendly": "Colorblind-friendly",
  "colorblindAid": "Designed to improve distinction for common red-green color-vision deficiencies; shape and fill remain available as additional cues."
}
```

Dutch equivalents use `Symbool representeert`, `Kleur representeert puntniveau`, `Kleur representeert afmeting`, `Kleurenblindvriendelijk`, and a concise equivalent aid statement.

- [ ] **Step 5: Commit the draft once from the workspace**

Apply one update containing:

```ts
{
  ...current,
  activePileSizes: draft.active.pileSizes,
  activePileTipLevels: draft.active.pileTipLevels,
  pileLegend: draft.legend,
}
```

Do not persist editor scope, selected color scheme, open picker, or invalid hex text.

- [ ] **Step 6: Run focused editor tests**

Run: `node --test src/components/domain/LegendEditor.test.ts src/components/domain/PilePlanWorkspace.test.ts src/components/domain/WorkspaceTranslations.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the complete editor**

```powershell
git add apps/pile-plan-studio/src/components/domain/LegendEditor.tsx apps/pile-plan-studio/src/components/domain/LegendEditor.test.ts apps/pile-plan-studio/src/components/domain/LegendEditor.css apps/pile-plan-studio/src/components/domain/PilePlanWorkspace.tsx apps/pile-plan-studio/src/components/domain/PilePlanWorkspace.test.ts apps/pile-plan-studio/src/i18n/locales/en/common.json apps/pile-plan-studio/src/i18n/locales/nl/common.json apps/pile-plan-studio/src/components/domain/WorkspaceTranslations.test.ts
git commit -m "feat: add legend personalization editor"
```

---

### Task 10: Verify Compatibility, Performance, And The Release Candidate

**Files:**
- Modify only files required by failures discovered in the commands below.
- Do not update the public version or release notes in this branch until the feature is manually accepted.

**Interfaces:**
- Verifies all prior task contracts together.
- Produces no new feature surface.

- [ ] **Step 1: Run the complete frontend test suite**

Run: `npm test`

Working directory: `apps/pile-plan-studio`

Expected: PASS.

- [ ] **Step 2: Run the complete Rust test suite**

Run: `cargo test --workspace`

Working directory: repository root.

Expected: PASS.

- [ ] **Step 3: Build the browser/WASM application**

Run: `npm run build`

Working directory: `apps/pile-plan-studio`

Expected: PASS with no TypeScript, WASM, or Vite errors.

- [ ] **Step 4: Inspect performance-sensitive searches**

Run: `rg -n "getLegendItems\(|renderPileSymbol\([^,]+\.shape|PileShape" apps/pile-plan-studio/src`

Expected: no legacy per-render legend generation and no legacy shape API.

Confirm by code inspection that automatic color generation occurs only in editor actions/default reconciliation, not during pointer move, pan, zoom, or every React symbol render.

- [ ] **Step 5: Run a browser smoke test**

Start the existing development server and verify:

1. Existing sample project appearance is unchanged before editing.
2. Switching encoding reverses channels in viewer, legend, table, and hover information.
3. Manual full/half symbol and color changes preview immediately, Cancel discards, Apply persists.
4. Undo/Redo restores one complete editor Apply.
5. Refresh preserves custom mappings and initializes only new values.
6. Reload restores applied settings from IndexedDB.
7. Dutch and English labels switch while the editor stays open.
8. Keyboard navigation works for segmented controls, listbox, picker, Apply, Cancel, and Escape.
9. A colorblind-friendly preview is visible with a text label and explanatory aid text.
10. Semantic crosses, CPTs, selection rings, utilization markings, pan, zoom, and selection remain unchanged.

- [ ] **Step 6: Commit verification-only fixes if needed**

```powershell
git add apps/pile-plan-studio crates/pile-plan-core
git commit -m "fix: complete legend personalization integration"
```

Skip this commit when verification required no changes.

---

## Self-Review Record

- **Spec coverage:** Tasks 1 and 5 cover optional tolerant IFCPP persistence, warning fallback, Undo, refresh, and recovery. Tasks 2 through 4 cover the exact 54-symbol and five-scheme catalogs. Task 6 covers every required visual consumer. Tasks 7 through 9 cover temporary draft isolation, exact UI wording, 65/35 layout, manual and automatic controls, accessibility, localization, Apply, Cancel, and reset. Task 10 covers compatibility and performance.
- **Placeholder scan:** The plan contains no TBD, TODO, “similar to”, generic error-handling instruction, or unspecified test step.
- **Type consistency:** `PileSymbol`, `LegendItems`, `LegendImportWarning`, `LegendColorScheme`, `LegendEditorDraft`, and the automatic-assignment signatures are defined before their consumers and use the same names throughout.
- **Scope check:** Cross-project preferences, user palettes, monochrome exact-configuration export, and release publication remain explicitly outside this implementation.
