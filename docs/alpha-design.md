# Alpha Design

This document describes the intended alpha direction for Pile Plan Studio. The
goal is to move from a promising prototype toward a usable OpenAEC-style desktop
application with a real project file format, repeatable imports, and persistent
engineering decisions.

## Alpha Goal

The alpha version should let a user create, open, inspect, edit, save, and
reopen a pile planning project without relying on hardcoded sample JSON files.

The alpha is not expected to solve every optimization problem. Its main value is
that the project state is explicit and reproducible:

- input data is traceable;
- pile options are calculated from selected CPTs and bearing capacities;
- user-selected piles and CPT selections are stored;
- project settings survive closing and reopening the application;
- Excel input can be converted into a project file.

## Product Scope

The alpha should support the following workflow:

1. Start the application.
2. Open an existing `.ifcpp` project, or create a new project by importing Excel
   files.
3. Inspect load points, CPTs, bearing capacities, pile options, costs, and
   selected pile configurations.
4. Edit project-level settings such as CPT selection, costs, and optimization
   limits.
5. Manually adjust selected piles and selected CPTs.
6. Save the complete project state back to `.ifcpp`.

The alpha should still include the current sample project, but it should be
loaded through the same project-file route as user projects.

## OpenAEC Styling Direction

Pile Plan Studio should visually align with the OpenAEC Foundation style book:

- use OpenAEC design tokens for color, typography, spacing, and component
  styling where practical;
- use OpenAEC amber as an accent color, not as a dominant background;
- move toward the OpenAEC desktop application pattern: clear title area, document
  context, compact tool areas, side panels, status feedback, and restrained
  engineering-focused visual density;
- keep the pile plan viewer as the primary screen, not a marketing or landing
  page;
- avoid decorative redesign work that does not improve engineering usability.

References:

- OpenAEC style book:
  <https://github.com/OpenAEC-Foundation/OpenAEC-style-book>
- OpenAEC design system and tokens:
  <https://github.com/OpenAEC-Foundation/OpenAEC-style-book/tree/main/brandbook>

For alpha, styling should be done after the project file and import workflow
exist. This prevents visual polish from hiding unstable project-state behavior.

## IFCPP Project Format

`.ifcpp` is the proposed project file format for Pile Plan Studio.

For alpha, IFCPP should be treated as a versioned Pile Plan Studio project
profile inspired by IFCX and IFC 5, not as a finalized external standard. IFC 5
and IFCX are still evolving, so the alpha file format must be explicit,
versioned, and migration-friendly.

References:

- buildingSMART IFC 5 development:
  <https://github.com/buildingSMART/IFC5-development>

### Format Principles

- The file extension is `.ifcpp`.
- The alpha file content should be JSON-compatible, matching the IFCX direction
  and keeping browser, WASM, and Tauri workflows straightforward.
- The file must include a schema/version marker.
- All units must be explicit.
- Unknown future fields should be tolerated when loading.
- Missing required alpha fields should produce clear validation errors.

### Suggested Top-Level Structure

```json
{
  "schema": "IFCPP",
  "schema_version": 1,
  "application": {
    "name": "Pile Plan Studio",
    "version": "0.1.0-alpha"
  },
  "metadata": {},
  "units": {},
  "inputs": {},
  "settings": {},
  "user_state": {},
  "import_log": []
}
```

### Required Alpha Content

`metadata` should contain:

- project name;
- author or organization when available;
- created and modified timestamps;
- optional source description.

`units` should contain:

- coordinates in millimetres;
- design loads in kilonewtons;
- pile tip levels in metres;
- bearing capacities in kilonewtons;
- costs in euros.

`inputs` should contain:

- load points: id, name, x, y, FED/design load;
- CPTs: id, name, x, y;
- bearing capacities: CPT reference, pile size, pile tip level, FRD.

`settings` should contain:

- global CPT selection settings;
- per-load-point CPT selection overrides;
- pile cost settings;
- optimizer settings;
- active pile size and tip-level settings where useful.

`user_state` should contain:

- selected pile configuration per load point;
- explicit no-pile choices when applicable;
- manual CPT selections per load point;
- optional view state such as active panel and viewport if useful.

`import_log` should contain:

- source file names;
- import date;
- sheet names;
- mapped columns;
- warnings and assumptions made during import.

## Excel Import Workflow

Excel files should be treated as import sources, not as the internal project
format.

The alpha import flow should be:

1. User selects import from Excel.
2. User selects the relevant workbook files for:
   - bearing capacities;
   - load points;
   - CPT coordinates.
3. The app detects sheets and column headers.
4. The app proposes mappings.
5. The user confirms or edits the mappings.
6. The app validates the imported data.
7. The app creates a `.ifcpp` project.
8. The app opens that project through the same load route as normal project
   files.

### Import Validation

The importer should check:

- required columns are present;
- numeric fields can be parsed;
- coordinate and load units are known;
- every bearing capacity references a known CPT;
- pile size and tip-level values are consistent;
- duplicate ids or names are either resolved or reported;
- empty rows and irrelevant header/footer rows are ignored where possible.

Validation errors should block project creation. Warnings may allow project
creation if the user confirms them.

## Technical Architecture

The project format and import pipeline should live in Rust, not in the
TypeScript viewer.

Recommended Rust modules:

- `project`: canonical `PilePlanProject` data model;
- `ifcpp`: read/write `.ifcpp`, schema validation, migration;
- `excel_import`: parse Excel workbooks into an import candidate;
- `import_mapping`: sheet and column mapping models;
- `project_validation`: required-field and consistency checks.

Tauri commands should expose:

- open IFCPP project;
- save IFCPP project;
- import Excel files into an IFCPP project;
- validate IFCPP project;
- export current project state.

The browser preview can keep using the embedded sample project through WASM, but
desktop file dialogs and actual file access should be tested in Tauri.

## Migration From Current State

Current state:

- sample project data is loaded from hardcoded JSON imports in the frontend;
- project settings and user selections live mostly in frontend state;
- Rust already owns core calculations;
- Tauri and WASM routes already call the Rust core.

Alpha migration path:

1. Define `PilePlanProject` in Rust.
2. Convert the current sample JSON data into a sample `.ifcpp`.
3. Replace hardcoded frontend JSON imports with loading a project object.
4. Move project settings and saved user choices into the project object.
5. Add save/load commands in Tauri.
6. Add Excel import into project object.
7. Add OpenAEC styling pass.

## Testing Strategy

Rust tests should cover:

- IFCPP parse and serialize roundtrip;
- schema version validation;
- required-field validation;
- sample project load;
- Excel import from small fixture workbooks;
- import validation errors and warnings;
- preservation of selected piles and manual CPT selections.

Frontend tests should cover:

- rendering project data from a loaded project object;
- empty and invalid project states;
- import wizard state transitions;
- user-facing validation messages.

Manual alpha verification should cover:

- create project from Excel;
- save as `.ifcpp`;
- close and reopen project;
- confirm selected piles and CPT overrides are preserved;
- run pile option calculation after reopen;
- verify the sample project uses the same project loading path.

## Alpha Milestones

### Milestone 1: Project Model

- Add Rust `PilePlanProject`.
- Include inputs, settings, and user state.
- Add conversion from existing sample JSON.

### Milestone 2: IFCPP Read/Write

- Implement `.ifcpp` serialization.
- Add sample `.ifcpp`.
- Load the app from project data instead of hardcoded JSON imports.

### Milestone 3: Save/Open Desktop Flow

- Add Tauri file open/save commands.
- Keep browser preview using embedded sample project data.
- Add clear project loading errors.

### Milestone 4: Excel Import

- Parse source workbooks.
- Add mapping and validation models.
- Create `.ifcpp` from imported Excel data.

### Milestone 5: OpenAEC Template Migration

- Completed: the OpenAEC `Tauri+React` frontend is the official browser and
  Tauri interface. The temporary parallel Vanilla frontend has been removed.
- Use the OpenAEC shell structure: title bar, ribbon, backstage, side panels,
  status bar, themes, and i18n.
- Include the left project explorer from the start, even if it is initially
  empty.
- Keep Rust/WASM as the calculation core and avoid duplicate TypeScript
  calculations.
- Keep the map/data workspace as the first screen.

### Milestone 6: Alpha Hardening

- Add migration hooks.
- Add import warnings.
- Verify reopen/save behavior.
- Produce an alpha desktop build.

## Open Questions

- Should `.ifcpp` be a plain JSON file with a custom extension, or a zipped
  package that can later contain attachments and source workbooks?
- Should Excel import initially support fixed known workbook templates only, or
  a flexible mapping wizard from the start?
- How closely should IFCPP mirror IFCX naming in alpha, given that IFCX is still
  evolving?
- Should user view state be saved in `.ifcpp`, or should the project file only
  store engineering and decision state?

## Recommended First Implementation Step

Start with Milestone 1 and 2 together:

- define the Rust `PilePlanProject`;
- define the alpha IFCPP JSON shape;
- create `sample_project.ifcpp`;
- load the existing app from that project object.

This creates the foundation for import, save/open, and alpha packaging without
requiring the Excel workflow or OpenAEC restyling to be solved first.
