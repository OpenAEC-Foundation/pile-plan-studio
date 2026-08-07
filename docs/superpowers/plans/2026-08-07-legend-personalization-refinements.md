# Legend Personalization Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct legend personalization so manual overrides remain item-specific, automatic assignments react predictably, color schemes stay distinguishable, symbol previews are neutral, partial fills remain visible in every theme, and appearance popups close naturally.

**Architecture:** Extend the project-owned legend model with persisted automatic/manual metadata and one selected automatic color scheme. Keep assignment and reconciliation in pure TypeScript functions, mirror the optional wire fields in Rust/Serde, and continue using the shared SVG renderer for every consumer. React remains responsible only for draft interaction and presentation.

**Tech Stack:** Rust/Serde, TypeScript 6, React 19, SVG strings, CSS custom properties, i18next, Node test runner, Cargo tests, Vite/WASM.

## Global Constraints

- Legend settings remain project-scoped and participate in IFCPP persistence, Undo/Redo, and IndexedDB recovery.
- Automatic/manual state is independent for size color, size symbol, tip-level color, and tip-level symbol, down to each individual legend value.
- A manual change protects only the edited property of the edited item.
- Scheme, scope, and encoding changes immediately update still-automatic items and never overwrite manual overrides.
- Explicit automatic assignment clears manual overrides only in its active mapping group and selected scope.
- Older IFCPP files remain loadable; missing scheme and assignment metadata default to Tableau Extended and automatic.
- The exact Tableau 10 prefix remains unchanged.
- Viewer pile symbols retain their current fixed white neutral fill and dark outline unless a consumer explicitly supplies theme-aware renderer options.
- No calculation is added to pointer movement, pan, zoom, or normal symbol rendering.

---

## File Structure

- `apps/pile-plan-studio/src/core/projectTypes.ts`: canonical legend scheme and per-item assignment metadata.
- `apps/pile-plan-studio/src/viewer/legendColors.ts`: six deterministic palette generators, including Tableau Extended and Even Hue Spread.
- `apps/pile-plan-studio/src/viewer/legend.ts`: defaults, reconciliation, and automatic assignment that respects item metadata.
- `apps/pile-plan-studio/src/domain/legendEditorModel.ts`: immutable editor transitions and manual override marking.
- `apps/pile-plan-studio/src/core/projectFile.ts`: tolerant IFCPP read/write conversion.
- `crates/pile-plan-core/src/project.rs`: Rust wire model with backwards-compatible defaults.
- `apps/pile-plan-studio/src/viewer/pileSymbols.ts`: configurable outline and neutral-fill rendering.
- `apps/pile-plan-studio/src/components/domain/LegendSymbolPicker.tsx`: neutral previews and outside-click dismissal.
- `apps/pile-plan-studio/src/components/domain/LegendColorSchemeSelect.tsx`: six schemes and outside-click dismissal.
- `apps/pile-plan-studio/src/components/domain/LegendEditor.tsx`: automatic transition wiring and fixed control layout.
- `apps/pile-plan-studio/src/components/domain/Legend.tsx`: theme-aware partial-fill symbols in the compact legend.
- `apps/pile-plan-studio/src/components/domain/LegendEditor.css` and `viewer.css`: stable grid and theme-safe SVG presentation.

---

### Task 1: Persist Per-Item Assignment State And Color Scheme

**Files:**
- Modify: `apps/pile-plan-studio/src/core/projectTypes.ts`
- Modify: `apps/pile-plan-studio/src/core/projectFile.ts`
- Modify: `apps/pile-plan-studio/src/core/projectFile.test.ts`
- Modify: `crates/pile-plan-core/src/project.rs`

**Interfaces:**
- `LegendColorScheme` becomes a core type with values `tableau-extended`, `even-hue`, `colorblind-friendly`, `rainbow`, `light-dark`, and `cool-warm`.
- `LegendValueStyle` adds `symbolAutomatic: boolean` and `colorAutomatic: boolean`.
- `LegendItems` adds `colorScheme: LegendColorScheme`.
- IFCPP writes `color_scheme`, `symbol_automatic`, and `color_automatic`.

- [ ] **Step 1: Write failing TypeScript round-trip tests**

Add assertions that a custom scheme and mixed automatic/manual flags survive `createIfcppProject` followed by `loadIfcppProjectData`. Add a legacy fixture without the new fields and expect `tableau-extended`, `symbolAutomatic: true`, and `colorAutomatic: true`.

- [ ] **Step 2: Run the focused TypeScript test and verify failure**

Run from `apps/pile-plan-studio`:

```powershell
node --test src/core/projectFile.test.ts
```

Expected: FAIL because the new fields are not present.

- [ ] **Step 3: Add the frontend types and tolerant conversion**

Use these shapes:

```ts
export type LegendValueStyle = {
  value: number;
  symbol: PileSymbol;
  color: string;
  symbolAutomatic: boolean;
  colorAutomatic: boolean;
};

export type LegendItems = {
  encodingMode: LegendEncodingMode;
  colorScheme: LegendColorScheme;
  pileSizes: LegendValueStyle[];
  pileTipLevels: LegendValueStyle[];
};
```

Read missing or non-boolean assignment fields as `true`. Read missing scheme as `tableau-extended`; accept legacy `distinct` as an alias for `tableau-extended`. Write only canonical names.

- [ ] **Step 4: Write failing Rust compatibility tests**

Extend `project_settings_round_trip_pile_legend` with the scheme and flags. Add a JSON test that removes these fields and verifies the documented defaults.

- [ ] **Step 5: Run the focused Rust tests and verify failure**

```powershell
cargo test -p pile-plan-core project_settings_
```

Expected: FAIL until the Rust model accepts and defaults the fields.

- [ ] **Step 6: Extend the Rust wire model**

Add `color_scheme: String` with a `tableau-extended` default and per-style booleans using a `default_true()` Serde function. Keep all fields serializable so Tauri and WASM round trips preserve them.

- [ ] **Step 7: Run focused persistence tests**

```powershell
node --test src/core/projectFile.test.ts
cargo test -p pile-plan-core project_settings_
```

Expected: PASS.

- [ ] **Step 8: Commit the persistence contract**

```powershell
git add apps/pile-plan-studio/src/core/projectTypes.ts apps/pile-plan-studio/src/core/projectFile.ts apps/pile-plan-studio/src/core/projectFile.test.ts crates/pile-plan-core/src/project.rs
git commit -m "feat: persist legend assignment state"
```

---

### Task 2: Replace Distinct Colors With Two Explicit Categorical Schemes

**Files:**
- Modify: `apps/pile-plan-studio/src/viewer/legendColors.ts`
- Modify: `apps/pile-plan-studio/src/viewer/legendColors.test.ts`

**Interfaces:**
- `generateLegendColors(scheme: LegendColorScheme, count: number): string[]` remains deterministic.
- `tableau-extended` preserves Tableau 10 exactly, then maximizes minimum CIELAB distance from all colors already selected.
- `even-hue` generates all requested hues together and reorders them for large successive hue separation.

- [ ] **Step 1: Write failing palette tests**

Assert all six schemes are present, Tableau Extended starts with the exact ten existing hex values, colors 11 through 24 contain no duplicates, and each extension color has a positive minimum Lab distance from the preceding set. Assert Even Hue Spread returns the requested count without a ten-color prefix or duplicate cycle.

- [ ] **Step 2: Run the palette tests and verify failure**

```powershell
node --test src/viewer/legendColors.test.ts
```

Expected: FAIL on missing schemes and the old golden-angle extension.

- [ ] **Step 3: Implement Tableau Extended**

Keep the existing ten constants. Build a deterministic candidate pool from hues in 10-degree increments, saturation values `55, 70, 85`, and lightness values `42, 54, 66`. Convert candidates and selected colors from sRGB through XYZ to CIELAB. Repeatedly select the remaining candidate with the largest minimum Euclidean Lab distance to the selected palette; break ties by candidate order.

- [ ] **Step 4: Implement Even Hue Spread**

Generate `count` hues at `360 / count` intervals with saturation `68` and lightness `52`. Emit indices in bit-reversal-style farthest-gap order so adjacent legend entries are visually separated rather than neighboring around the hue wheel.

- [ ] **Step 5: Run palette tests**

```powershell
node --test src/viewer/legendColors.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the palette catalog**

```powershell
git add apps/pile-plan-studio/src/viewer/legendColors.ts apps/pile-plan-studio/src/viewer/legendColors.test.ts
git commit -m "feat: refine legend color schemes"
```

---

### Task 3: Make Automatic Assignment Item-Specific

**Files:**
- Modify: `apps/pile-plan-studio/src/viewer/legend.ts`
- Modify: `apps/pile-plan-studio/src/viewer/legend.test.ts`
- Modify: `apps/pile-plan-studio/src/domain/legendEditorModel.ts`
- Modify: `apps/pile-plan-studio/src/domain/legendEditorModel.test.ts`

**Interfaces:**
- Manual edits set only the edited item's `symbolAutomatic` or `colorAutomatic` to `false`.
- Passive refresh updates only items whose relevant flag is `true`.
- Explicit assignment updates every scoped item and sets its relevant flag to `true`.
- Encoding mode, scheme, and scope transitions refresh the newly affected automatic mappings.

- [ ] **Step 1: Write failing pure-model tests**

Cover these exact scenarios:

```ts
// One manual tip color survives a scheme change; other tip colors change.
// A manual size color does not block automatic tip colors after encoding reversal.
// Manual symbols do not block automatic colors, and vice versa.
// Explicit color assignment clears only scoped color overrides.
// Explicit symbol assignment clears only scoped symbol overrides.
// Reset restores Tableau Extended and all four groups to automatic.
```

- [ ] **Step 2: Run focused model tests and verify failure**

```powershell
node --test src/viewer/legend.test.ts src/domain/legendEditorModel.test.ts
```

Expected: FAIL because assignments currently overwrite all scoped values and store no origin.

- [ ] **Step 3: Split passive refresh from explicit assignment**

Add pure helpers with these contracts:

```ts
refreshAutomaticLegendColors(legend, kind, values): LegendItems;
refreshAutomaticLegendSymbols(legend, kind, values): LegendAssignmentResult;
assignLegendColors(legend, kind, values, scheme): LegendItems;
assignLegendSymbols(legend, kind, values): LegendAssignmentResult;
```

The refresh helpers skip manual items. Explicit assignment writes every scoped item and marks it automatic.

- [ ] **Step 4: Update immutable editor transitions**

`updateLegendColor` and `updateLegendSymbol` mark only the targeted property manual. `setLegendColorScheme` persists the scheme and refreshes the active color group. `setLegendEncodingMode` and `setLegendAssignmentScope` refresh both newly active automatic groups; preserve mappings if automatic symbol refresh exceeds 54 and return the existing catalog error for the UI. Reset restores automatic metadata.

- [ ] **Step 5: Run focused model tests**

```powershell
node --test src/viewer/legend.test.ts src/domain/legendEditorModel.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit automatic assignment behavior**

```powershell
git add apps/pile-plan-studio/src/viewer/legend.ts apps/pile-plan-studio/src/viewer/legend.test.ts apps/pile-plan-studio/src/domain/legendEditorModel.ts apps/pile-plan-studio/src/domain/legendEditorModel.test.ts
git commit -m "feat: preserve manual legend overrides"
```

---

### Task 4: Make Shared Symbol Rendering Theme-Aware

**Files:**
- Modify: `apps/pile-plan-studio/src/viewer/pileSymbols.ts`
- Modify: `apps/pile-plan-studio/src/viewer/pileSymbols.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/Legend.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/LegendEditor.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/viewer.css`

**Interfaces:**
- `renderPileSymbol(symbol, fillColor, options?)` accepts optional `outlineColor` and `neutralFill` while preserving current defaults.
- Shape-only editor previews use one neutral gray and never use an item's inactive color mapping.
- Compact legend symbols use theme text for the colored portion and outline, and the theme surface for the neutral portion.

- [ ] **Step 1: Write failing renderer and source-contract tests**

Assert default output remains `#172026` outline plus `#F3F5F6` neutral fill. Assert custom options appear in the SVG. Assert `LegendEditor.tsx` passes one neutral preview color rather than `item.color`, and `Legend.tsx` supplies separate theme-aware values.

- [ ] **Step 2: Run focused tests and verify failure**

```powershell
node --test src/viewer/pileSymbols.test.ts src/components/domain/LegendEditor.test.ts
```

Expected: FAIL on missing renderer options and colored shape carriers.

- [ ] **Step 3: Extend the shared renderer**

Implement:

```ts
type PileSymbolRenderOptions = {
  outlineColor?: string;
  neutralFill?: string;
};

renderPileSymbol(symbol, fillColor, options = {}): string;
```

Escape all three values before interpolation. Keep viewer callers unchanged so their appearance remains stable.

- [ ] **Step 4: Update editor and compact legend consumers**

Use `#6F7B82` for shape-only editor previews with the dialog surface as neutral fill. In the compact legend, use `currentColor` for fill and outline and `var(--theme-bg)` for the uncolored half. Remove the CSS rule that force-overrides every SVG shape stroke, because it also affects clip geometry and masks renderer intent.

- [ ] **Step 5: Run focused rendering tests**

```powershell
node --test src/viewer/pileSymbols.test.ts src/components/domain/LegendEditor.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit shared rendering corrections**

```powershell
git add apps/pile-plan-studio/src/viewer/pileSymbols.ts apps/pile-plan-studio/src/viewer/pileSymbols.test.ts apps/pile-plan-studio/src/components/domain/Legend.tsx apps/pile-plan-studio/src/components/domain/LegendEditor.tsx apps/pile-plan-studio/src/components/domain/viewer.css
git commit -m "fix: render legend symbols consistently"
```

---

### Task 5: Refine Editor Interaction And Layout

**Files:**
- Modify: `apps/pile-plan-studio/src/components/domain/LegendSymbolPicker.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/LegendSymbolPicker.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/LegendColorSchemeSelect.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/LegendColorSchemeSelect.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/LegendEditor.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/LegendEditor.test.ts`
- Modify: `apps/pile-plan-studio/src/components/domain/LegendEditor.css`
- Modify: `apps/pile-plan-studio/src/i18n/locales/en/common.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/nl/common.json`
- Modify: `apps/pile-plan-studio/src/components/domain/WorkspaceTranslations.test.ts`

**Interfaces:**
- Both popup controls close on a pointer event outside their root and retain the controlled selection already emitted through `onChange`.
- Automatic controls occupy fixed grid columns.
- Explicit assignment buttons indicate when manual overrides exist in the active mapping group and scope.

- [ ] **Step 1: Write failing interaction and localization tests**

Add component-source contracts for document-level outside-pointer handling and cleanup. Assert six localized scheme keys: Tableau Extended, Even Hue Spread, Colorblind-friendly, Rainbow, Light to dark, and Cool to warm, plus Dutch equivalents. Assert the automatic action container uses a fixed grid rather than wrapping flex layout.

- [ ] **Step 2: Run focused component tests and verify failure**

```powershell
node --test src/components/domain/LegendSymbolPicker.test.ts src/components/domain/LegendColorSchemeSelect.test.ts src/components/domain/LegendEditor.test.ts src/components/domain/WorkspaceTranslations.test.ts
```

Expected: FAIL on outside-click handling, six-scheme copy, and fixed layout.

- [ ] **Step 3: Add outside-pointer dismissal**

Give each picker root a `useRef<HTMLDivElement>`. While open, register one `pointerdown` listener on `document`; close only when `!root.contains(event.target as Node)`. Remove the listener in the effect cleanup. Do not call `onChange` during dismissal because controlled changes have already been emitted.

- [ ] **Step 4: Wire automatic transitions and button emphasis**

Use the Task 3 result-returning transitions in `LegendEditor.tsx`, surface catalog exhaustion without discarding other draft changes, and add `is-pending` only when the relevant active mapping group contains manual overrides in the selected scope.

- [ ] **Step 5: Stabilize the automatic controls**

Replace `.legend-editor-auto-actions` flex wrapping with a grid containing fixed symbol-action, scheme-select, color-action, and reset columns. Give the scheme trigger a fixed inline size with ellipsis for long localized labels; keep the palette preview fixed at 92px.

- [ ] **Step 6: Add Dutch and English scheme labels**

Use `Tableau Extended` / `Tableau uitgebreid` and `Even Hue Spread` / `Gelijkmatige tintspreiding`; retain the established translations for the other four schemes.

- [ ] **Step 7: Run focused component tests**

```powershell
node --test src/components/domain/LegendSymbolPicker.test.ts src/components/domain/LegendColorSchemeSelect.test.ts src/components/domain/LegendEditor.test.ts src/components/domain/WorkspaceTranslations.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the editor refinements**

```powershell
git add apps/pile-plan-studio/src/components/domain/LegendSymbolPicker.tsx apps/pile-plan-studio/src/components/domain/LegendSymbolPicker.test.ts apps/pile-plan-studio/src/components/domain/LegendColorSchemeSelect.tsx apps/pile-plan-studio/src/components/domain/LegendColorSchemeSelect.test.ts apps/pile-plan-studio/src/components/domain/LegendEditor.tsx apps/pile-plan-studio/src/components/domain/LegendEditor.test.ts apps/pile-plan-studio/src/components/domain/LegendEditor.css apps/pile-plan-studio/src/i18n/locales/en/common.json apps/pile-plan-studio/src/i18n/locales/nl/common.json apps/pile-plan-studio/src/components/domain/WorkspaceTranslations.test.ts
git commit -m "fix: refine legend editor interactions"
```

---

### Task 6: Verify The Complete Refinement

**Files:**
- Modify only files required by verified failures.
- Do not change the public version or publish a release in this task.

- [ ] **Step 1: Run the complete frontend suite**

```powershell
npm test
```

Working directory: `apps/pile-plan-studio`. Expected: PASS.

- [ ] **Step 2: Run the complete Rust/WASM suite**

```powershell
cargo test --workspace
```

Working directory: repository root. Expected: PASS.

- [ ] **Step 3: Build the production browser application**

```powershell
npm run build
```

Working directory: `apps/pile-plan-studio`. Expected: PASS and regenerate the checked-in WASM package consistently.

- [ ] **Step 4: Perform browser smoke checks**

Verify light and dark themes, both encoding modes, all six palette previews, manual overrides mixed with automatic values, outside-click popup closing, Apply/Cancel, Undo/Redo, refresh recovery, neutral shape previews, and visible half fills in the compact legend. Confirm viewer symbols, panning, zooming, hover selection, CPTs, and utilization markings are unchanged.

- [ ] **Step 5: Inspect the final diff**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and no unrelated files staged or modified.

---

## Self-Review Record

- **Spec coverage:** Tasks 1 and 3 cover persistent per-item automatic/manual state and all four mapping groups. Task 2 covers Tableau Extended, Even Hue Spread, and the complete six-scheme catalog. Task 4 covers neutral editor previews and theme-safe partial fills. Task 5 covers automatic interaction, fixed layout, popup dismissal, and localization. Task 6 covers integration and regressions.
- **Placeholder scan:** No TBD, TODO, generic test instruction, or undefined follow-up remains.
- **Type consistency:** `LegendColorScheme`, `LegendValueStyle`, `LegendItems`, the wire fields, and assignment helper contracts are defined before their consumers and use one spelling throughout.
- **Scope check:** User-defined schemes, cross-project preferences, monochrome exact-configuration export, and release publication remain outside this refinement.
