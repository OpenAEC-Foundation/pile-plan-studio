# Alpha Command And Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every active alpha ribbon command honest and consistent, separate project information from application preferences, and open optimization as a temporary task panel.

**Architecture:** Keep persistent project data in `ProjectState`, but keep temporary task-panel navigation in `App`. The right panel retains its four context tabs while the ribbon can temporarily replace their content with optimization settings and restore the previous context when closed.

**Tech Stack:** React, TypeScript, i18next, Node test runner, Rust/WASM core.

## Global Constraints

- Project information stores only the project name for this alpha step.
- Application preferences remain accessible from the title bar and backstage settings command.
- Optimization is not a permanent right-panel tab.
- Future commands without alpha behavior are not presented as active commands.
- New behavior is implemented test-first.

---

### Task 1: Project Information

**Files:**
- Create: `apps/pile-plan-studio/src/components/domain/ProjectInformationDialog.tsx`
- Create: `apps/pile-plan-studio/src/components/domain/ProjectInformationDialog.test.ts`
- Modify: `apps/pile-plan-studio/src/App.tsx`
- Modify: `apps/pile-plan-studio/src/components/template/ribbon/Ribbon.tsx`
- Modify: `apps/pile-plan-studio/src/i18n/locales/en/ribbon.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/nl/ribbon.json`

**Interfaces:**
- Consumes: `ProjectState.name`.
- Produces: `ProjectInformationDialog({ open, projectName, onSave, onClose })`.

- [ ] Add a failing source-contract test proving Project information does not call application settings.
- [ ] Add the dialog with a required, trimmed project name and Save/Cancel actions.
- [ ] Connect the Project ribbon command to the dialog and persist the name in project state.
- [ ] Run the focused tests and commit.

### Task 2: Optimization Task Panel

**Files:**
- Modify: `apps/pile-plan-studio/src/App.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/RightPanel.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/OptimizationPanel.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/RightPanel.test.ts`

**Interfaces:**
- Produces: `RightPanel` props `taskPanel` and `onCloseTaskPanel`.
- Preserves: `ProjectState.rightPanelMode` while the optimization task panel is open.

- [ ] Change the existing test to require four context tabs and a closable optimization task panel.
- [ ] Verify the test fails because Optimization is still a fixed tab.
- [ ] Move temporary task-panel state to `App` and add a close command.
- [ ] Verify closing reveals the previously selected context tab.
- [ ] Run the focused tests and commit.

### Task 3: Honest Ribbon Commands

**Files:**
- Modify: `apps/pile-plan-studio/src/components/template/ribbon/Ribbon.tsx`
- Modify: `apps/pile-plan-studio/src/components/template/ribbon/Ribbon.test.ts`
- Modify: `apps/pile-plan-studio/src/App.tsx`

**Interfaces:**
- Produces callbacks for the four context panels and optimization commands.
- Removes visible template commands that have no alpha behavior.

- [ ] Add failing tests for the supported Project, Plan, Optimize, and View commands.
- [ ] Connect Load point, CPTs, CPT settings, and Cost settings to the right panel.
- [ ] Keep Run and Settings as the only optimization commands.
- [ ] Remove unsupported future ribbon groups from the active alpha interface.
- [ ] Run all frontend tests and commit.

### Task 4: Integrated Verification

**Files:**
- Modify only if verification exposes a regression.

- [ ] Run `npm test` in `apps/pile-plan-studio`.
- [ ] Run `npm run build` in `apps/pile-plan-studio`.
- [ ] Run `cargo test --workspace`.
- [ ] Verify Project information, context navigation, task-panel close, and optimization in the live browser.
- [ ] Confirm a clean git diff and commit any final correction.
