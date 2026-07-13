# Project Export And Terminology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver reliable IFCPP and PNG exports and update visible foundation-advice terminology without changing persisted field names.

**Architecture:** A focused export utility selects native desktop saving, browser file pickers, or download fallback. The viewer exposes its capture element through a stable DOM identifier and `html2canvas` creates the PNG. UI text remains in i18n resources, while semantic resistance notation is rendered by a small reusable component.

**Tech Stack:** React 19, TypeScript, Tauri 2, html2canvas, i18next, Node test runner.

## Global Constraints

- Keep IFCPP and Rust field names such as `frd_kn` unchanged.
- Export only the pile-plan viewer to PNG.
- Use save-location dialogs when supported and download fallback otherwise.
- Remove report export.

---

### Task 1: Reliable file saving

**Files:**
- Modify: `apps/pile-plan-studio/src/domain/projectPersistence.ts`
- Modify: `apps/pile-plan-studio/src/domain/projectPersistence.test.ts`
- Modify: `apps/pile-plan-studio/src-tauri/src/main.rs`

**Interfaces:**
- Produces: `saveBlob(blob: Blob, fileName: string): Promise<boolean>` and reusable Tauri byte writing.

- [ ] Write failing tests for browser picker selection and anchor-download fallback.
- [ ] Run `npm test -- src/domain/projectPersistence.test.ts` and confirm the new cases fail.
- [ ] Implement picker-first browser saving and a Tauri path for binary data.
- [ ] Re-run the focused tests and `cargo check --manifest-path src-tauri/Cargo.toml`.

### Task 2: PNG viewer export and export menu

**Files:**
- Modify: `apps/pile-plan-studio/src/components/domain/PilePlanViewer.tsx`
- Modify: `apps/pile-plan-studio/src/components/template/backstage/Backstage.tsx`
- Modify: `apps/pile-plan-studio/src/App.tsx`
- Modify: `apps/pile-plan-studio/src/components/template/CommandSurface.test.ts`
- Modify: `apps/pile-plan-studio/src/i18n/locales/en/backstage.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/nl/backstage.json`

**Interfaces:**
- Produces: `exportPilePlanImage(): Promise<boolean>` wired to the image-export card.

- [ ] Add failing tests requiring a clickable image export and absence of report export.
- [ ] Run the focused command-surface test and confirm failure.
- [ ] Capture `[data-export-target="pile-plan"]` with `html2canvas`, save as PNG, and connect the menu card.
- [ ] Re-run focused tests and verify the DOM target exists.

### Task 3: Import localization and updated terminology

**Files:**
- Modify: `apps/pile-plan-studio/src/components/domain/ProjectImportPanel.tsx`
- Modify: `apps/pile-plan-studio/src/components/domain/RightPanel.tsx`
- Modify: `apps/pile-plan-studio/src/domain/pileOptionTable.ts`
- Modify: `apps/pile-plan-studio/src/i18n/locales/en/common.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/nl/common.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/en/rightPanel.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/nl/rightPanel.json`
- Test: relevant localization and table tests under `apps/pile-plan-studio/src`

**Interfaces:**
- Produces: localized foundation-advice labels and formatted `R_c;net;d` headers.

- [ ] Add failing tests for translated import copy and absence of visible FRD labels.
- [ ] Run focused tests and confirm failure.
- [ ] Move import copy into i18n and render resistance notation with italic `R` plus subscript.
- [ ] Re-run focused tests.

### Task 4: End-to-end verification

**Files:**
- Verify all files above.

- [ ] Run `npm test`.
- [ ] Run `npx tsc -p tsconfig.json --noEmit`.
- [ ] Run `npm run build`.
- [ ] Run `cargo check --manifest-path src-tauri/Cargo.toml`.
- [ ] Verify IFCPP and PNG exports in the live browser, confirm the report card is absent, and leave the viewer open.
