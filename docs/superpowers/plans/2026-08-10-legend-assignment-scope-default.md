# Legend Assignment Scope Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every legend-editor session start with automatic assignment scoped to all known items, without persisting that temporary scope or changing mappings merely by opening the editor.

**Architecture:** Keep `assignmentScope` exclusively in `LegendEditorDraft`. Change its draft default to `all`, keep explicit scope changes operating on the open draft, and make reset restore both built-in mappings and the temporary `all` scope. Project state, IFCPP serialization, Undo, and browser recovery remain unchanged because they continue to store only resolved mappings and active values.

**Tech Stack:** React, TypeScript, Node test runner, Vite, Rust/WASM build pipeline.

## Global Constraints

- Every legend-editor opening starts with `assignmentScope: "all"`.
- Opening the editor must not recalculate existing color or symbol mappings.
- Assignment scope must not be added to project state or IFCPP.
- Resetting built-in appearance also resets the open draft scope to `all`.
- Existing explicit mappings remain unchanged until an automatic input or reassignment action is used.

---

### Task 1: Default And Reset Assignment Scope

**Files:**
- Modify: `apps/pile-plan-studio/src/domain/legendEditorModel.ts`
- Test: `apps/pile-plan-studio/src/domain/legendEditorModel.test.ts`
- Test: `apps/pile-plan-studio/src/components/domain/LegendEditor.test.ts`

**Interfaces:**
- Consumes: `createLegendEditorDraft(active, legend): LegendEditorDraft` and `resetLegendEditorAppearance(draft, bearingCapacities): LegendEditorDraft`.
- Produces: drafts whose temporary `assignmentScope` is `all` on creation and after reset, while preserving existing legend mappings during creation.

- [ ] **Step 1: Write failing model tests**

Add assertions that a newly created draft uses `all`, retains the exact supplied mappings, and that reset returns a draft from `enabled` to `all`.

```ts
const created = draft();
assert.equal(created.assignmentScope, "all");

const enabled = { ...created, assignmentScope: "enabled" as const };
assert.equal(resetLegendEditorAppearance(enabled, capacities).assignmentScope, "all");
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test src/domain/legendEditorModel.test.ts src/components/domain/LegendEditor.test.ts`

Expected: failure because `createLegendEditorDraft` and reset currently retain `enabled`.

- [ ] **Step 3: Implement the draft defaults**

Set `createLegendEditorDraft` to return `assignmentScope: "all"`. Return `assignmentScope: "all"` from `resetLegendEditorAppearance` alongside the reset legend. Do not invoke automatic assignment during draft creation.

- [ ] **Step 4: Run focused tests and verify success**

Run: `node --test src/domain/legendEditorModel.test.ts src/components/domain/LegendEditor.test.ts`

Expected: all focused tests pass.

- [ ] **Step 5: Run full verification**

Run: `npm test`

Expected: all tests pass with zero failures.

Run: `npm run build`

Expected: TypeScript, WASM, and Vite production build complete successfully; existing bundle-size and Cargo metadata warnings may remain.

- [ ] **Step 6: Commit**

```text
git add apps/pile-plan-studio/src/domain/legendEditorModel.ts apps/pile-plan-studio/src/domain/legendEditorModel.test.ts apps/pile-plan-studio/src/components/domain/LegendEditor.test.ts docs/superpowers/plans/2026-08-10-legend-assignment-scope-default.md
git commit -m "fix: default legend assignment to all items"
```
