# Legend Personalization Design

## Status

Approved design for project-scoped legend personalization in `0.1.9-alpha`.

This design extends the existing legend editor described in `2026-08-04-legend-editor-design.md`. The existing distinction between enabled and used items remains authoritative. This specification replaces that document's statement that manual color and symbol editing is out of scope.

## Goal

Allow users to control how pile sizes and pile tip levels are represented without coupling appearance to filtering or optimization.

The editor must support:

- manual symbol and color assignment;
- automatic symbol and color assignment;
- multiple deterministic color schemes with previews;
- switching which property controls shape and which controls color;
- preserving inactive mappings and alternate encoding mappings;
- restoring the built-in project defaults;
- project-level persistence, Undo, and browser recovery.

Legend personalization belongs to the project, not an individual pile plan and not the user's global application preferences. New projects always start with the immutable built-in mapping that matches the application's current appearance.

## Scope

This change includes:

- an encoding-mode control;
- project-owned shape and color mappings for every known pile size and pile tip level;
- a 54-symbol catalog assembled from nine base shapes and six fill patterns;
- manual shape and color controls in the existing legend editor;
- automatic assignment to enabled items or all items;
- five built-in color schemes with inline previews;
- a reset-to-built-in-appearance action;
- IFCPP persistence and backwards-compatible loading;
- inclusion in Undo/Redo and browser recovery;
- use of the customized mappings throughout the normal legend, viewer, tables, and hover information.

Cross-project user presets and user-defined color schemes are not part of this version.

## Concepts And Ownership

### Encoding mode

The project stores one active encoding mode:

1. pile size controls shape and pile tip level controls color;
2. pile size controls color and pile tip level controls shape.

Changing the mode changes which stored mappings are rendered. It does not automatically reassign shapes or colors.

### Persisted mappings

Every known pile size and every known pile tip level stores both:

- a symbol definition;
- a color value.

Keeping both mappings means users can customize both encoding modes and switch between them without losing previous choices. Only the mapping selected by the active encoding mode is rendered.

Enabled state remains independent from appearance. Disabling an item retains all its mappings. Re-enabling it restores its previous appearance.

### Derived used state

Used pile sizes and pile tip levels continue to be derived live from the active pile plan. Changing assignments, optimizing, or switching plans updates used and unused presentation, but never rewrites legend activation or appearance settings.

### Built-in defaults

The application owns an immutable built-in default:

- the default encoding mode is size to shape and tip level to color;
- the default symbol order uses the approved nine-shape catalog with full fill first, followed by the remaining fill patterns in automatic-assignment order;
- the default distinct color order starts with the existing Tableau 10-based palette and uses the existing deterministic golden-angle extension;
- newly encountered source values receive deterministic defaults without changing mappings already stored by the project.

Mappings for values that temporarily disappear after refreshing project sources remain stored. They become available again if those values return.

## Legend Editor Layout

The existing in-application modal remains the editing surface.

Each of the size and tip-level sections has two columns:

- **Enabled** uses approximately 65% of the available width;
- **Disabled** uses approximately 35%.

On narrow viewports the columns stack vertically.

The wider enabled column accommodates appearance controls. Disabled items remain compact because their stored appearance is intentionally hidden.

### Enabled items

An enabled item contains:

- a shape or color preview button with a downward chevron;
- the numeric size or tip-level label;
- a separate deactivate icon button.

The preview button edits appearance. The deactivate button moves the item to the disabled column. The text label itself is inert. This separation prevents accidental deactivation while opening an appearance picker.

Used items are fully visible. Enabled but unused items are faded according to the existing legend-editor rules.

### Disabled items

A disabled item contains:

- its numeric label;
- the existing used-but-disabled warning when applicable;
- a separate activate icon button.

Disabled items show neither symbol nor color. Their mappings remain stored internally.

### Tooltips and accessible names

Icon controls receive localized tooltips and accessible names, including:

- `Change symbol` / `Symbool aanpassen`;
- `Change color` / `Kleur aanpassen`;
- `Enable` / `Activeren`;
- `Disable` / `Deactiveren`.

## Encoding Controls

A compact segmented control appears near the top of the editor under the label `Symbol represents` / `Symbool representeert`:

- `Size` / `Afmeting`;
- `Tip level` / `Puntniveau`.

A small dynamic line below the control communicates the complementary channel:

- when size is selected: `Color represents tip level` / `Kleur representeert puntniveau`;
- when tip level is selected: `Color represents size` / `Kleur representeert afmeting`.

This wording avoids two long compound segment labels while keeping both parts of the encoding explicit.

Switching modes updates the draft preview immediately. It does not apply changes to project state until the user chooses Apply.

The normal legend keeps the size group before the tip-level group. Each group renders the channel assigned by the active encoding mode.

## Symbol Model And Manual Editing

The symbol button opens a compact picker containing:

- a large preview of the composed symbol;
- a grid containing the nine base shapes;
- an icon-based fill-pattern radiogroup containing six choices.

The nine base shapes are intentionally limited to silhouettes that remain clearly distinguishable at small viewer sizes:

1. circle;
2. square;
3. diamond;
4. triangle up;
5. triangle down;
6. triangle left;
7. triangle right;
8. horizontal rectangle;
9. vertical rectangle.

The six fill patterns are:

1. full;
2. top half;
3. bottom half;
4. left half;
5. right half;
6. diagonal half.

The fill-pattern radiogroup is labeled `Fill` / `Vulling`. Every option previews the current base shape with that fill pattern. The options use localized tooltips and accessible names: `Full`, `Top`, `Bottom`, `Left`, `Right`, and `Diagonal`, with the corresponding Dutch labels `Volledig`, `Boven`, `Onder`, `Links`, `Rechts`, and `Diagonaal`. The selected option uses the standard accent outline. The six options form one row when space permits and reflow to a three-by-two grid on narrow layouts.

The fill pattern is part of the symbol definition. The colored portion uses the color resolved through the active encoding mode. The uncolored portion uses an opaque light neutral fill suited to the viewer's fixed white background, so overlapping symbols cannot show unrelated objects through their uncolored half. The outer contour remains the normal viewer symbol outline color.

The nine shapes and six fills form a catalog of 54 unique symbols without requiring increasingly decorative or visually similar silhouettes. Stars, crosses, plus signs, and high-sided regular polygons are intentionally excluded: stars do not fit the technical visual language, crosses already communicate unavailable or missing pile assignments, and pentagons, hexagons, and octagons become difficult to distinguish from circles at small scale.

Selecting a base shape or fill pattern updates the editor draft and its previews immediately. The picker does not write directly to project state.

This representation deliberately separates symbol geometry into `base shape + fill pattern`. A future drawing-export mode can therefore assign monochrome symbols directly to the exact combination of pile size and tip level without replacing the symbol renderer or project format. Exact configuration-level monochrome assignment is not implemented in this version.

## Manual Color Editing

The color button opens a compact color editor containing:

- a larger color swatch;
- a native color picker where supported;
- an editable hexadecimal color value;
- validation that retains the last valid draft color until a new valid color is entered.

Custom colors do not have to be unique. The editor does not warn about duplicate colors or duplicate symbols in this version.

## Automatic Assignment

The automatic-assignment area contains one shared scope control and two independent actions.

### Assignment scope

A segmented control offers:

- `Enabled items` / `Actieve items`;
- `All items` / `Alle items`.

The scope applies to both automatic symbol assignment and automatic color assignment.

- Enabled scope reassigns only currently enabled values. Disabled mappings remain unchanged.
- All scope reassigns every known value, including disabled values, so a complete consistent mapping can be restored without activating those values.

### Automatic symbols

`Assign symbols automatically` assigns symbols in deterministic order.

Values are sorted numerically:

- pile sizes from smallest to largest;
- tip levels from shallowest to deepest.

The symbol catalog is traversed in this order:

1. all nine base shapes with full fill;
2. all nine base shapes with top-half fill;
3. all nine base shapes with bottom-half fill;
4. all nine base shapes with left-half fill;
5. all nine base shapes with right-half fill;
6. all nine base shapes with diagonal-half fill.

If the selected scope contains more than 54 values, automatic assignment is not applied. The editor displays a localized validation message explaining that the catalog contains 54 unique symbols. It must not silently repeat symbols.

### Automatic colors

`Assign colors automatically` uses the selected color scheme and reassigns only values inside the selected scope.

The color-scheme control is a custom listbox rather than a plain native select. Its closed state shows the selected name and a small horizontal palette preview. Every option in the open list shows its localized name and the same kind of preview.

The built-in schemes are:

- **Distinct colors**: the current Tableau 10-based categorical palette followed by the deterministic golden-angle HSL extension;
- **Colorblind-friendly**: a discrete palette optimized for common red-green color-vision deficiencies, followed by controlled lightness and saturation variants when the base sequence is exhausted;
- **Rainbow**: evenly distributed hues across the spectrum at controlled saturation and lightness;
- **Light to dark**: an ordered single-hue blue scale with bounds chosen to remain visible on the white viewer;
- **Cool to warm**: an ordered blue-to-cyan-to-yellow-to-orange-to-red scale.

The localized name is `Colorblind-friendly` / `Kleurenblindvriendelijk`. It is presented as an aid rather than a guarantee that color alone distinguishes every value for every form of color-vision deficiency. Shape and fill remain available as independent visual channels.

For ordered schemes, values run from shallow/small at the light or cool start to deep/large at the dark or warm end. Rainbow colors follow the same sorted value order even though the scheme is primarily a hue sequence.

Color generation uses the number of values in the selected scope so the available scheme range is distributed across those values. Values outside enabled scope retain their previous colors.

The listbox and palette previews are keyboard accessible and do not rely on color alone for identification; every scheme has a text label.

## Reset, Apply, And Cancel

### Reset built-in appearance

`Reset default appearance` restores in the editor draft:

- the default size-to-shape and tip-to-color encoding mode;
- built-in symbol mappings for all known values;
- built-in distinct-color mappings for all known values.

It does not change which items are enabled and does not change pile assignments.

### Apply

Apply commits the complete editor draft as one project change:

- enabled sizes and tip levels;
- encoding mode;
- all size and tip-level shape mappings;
- all size and tip-level color mappings.

The project becomes dirty, IFCPP serialization is scheduled, and the operation creates one Undo entry with a concise localized summary.

### Cancel

Cancel, Escape, and the modal close control discard the complete draft. No activation or appearance changes leak into project state.

## Normal Legend And Viewer Behavior

The normal legend retains its existing enabled/used visibility rules and click-selection behavior. Clicking normal legend items never changes activation or appearance.

All visual consumers use the resolved project legend rather than regenerating mappings from foundation-advice order. This includes:

- load-point symbols in the viewer;
- the compact normal legend;
- pile-option table symbols;
- overlap-candidate hover information;
- any other existing pile-configuration preview.

Selection rings, unavailable markers, CPT symbols, and other semantic viewer markings are not affected by pile legend customization.

When encoding mode is reversed, the visual channels reverse consistently everywhere: pile size supplies color and tip level supplies symbol.

## Persistence And Compatibility

Legend appearance is stored in project settings inside IFCPP. The serialized representation contains:

- encoding mode;
- size-to-symbol and size-to-color mappings;
- tip-to-symbol and tip-to-color mappings;
- each symbol's base shape and fill pattern.

The new field is optional for backwards compatibility. Opening an older IFCPP file generates the complete built-in mapping from its current source values. Saving that project writes the explicit mapping.

Unknown future enum values or malformed individual mappings fall back to a deterministic built-in appearance for the affected value and produce a non-blocking project-import warning that identifies the affected size or tip level. One malformed mapping must not prevent the project from opening.

Because browser recovery stores the serialized project, applied legend changes participate in IndexedDB recovery automatically. Undo and Redo restore legend activation and appearance together.

## Component Boundaries

The implementation keeps these responsibilities separate:

- a pure legend model owns built-in defaults, mapping reconciliation, automatic assignment, and resolved style lookup;
- the symbol catalog owns base shapes, fill patterns, and deterministic ordering;
- the color-scheme catalog owns color generation and preview samples;
- the legend editor owns only its temporary draft and validation presentation;
- project state owns the applied project legend and Undo integration;
- IFCPP parsing and serialization preserve the project-owned data without depending on React components;
- viewer and table components consume resolved styles through one shared lookup API.

This prevents the editor, viewer, and serializer from developing separate interpretations of the same mappings.

## Error And Edge Cases

- Empty enabled sets remain valid.
- Automatic assignment with an empty scope is a no-op and shows no error.
- More than 54 values blocks automatic symbol assignment but not manual editing, color assignment, Apply, or Cancel.
- Duplicate manual colors and symbols are allowed.
- A newly imported size or tip level receives deterministic defaults without altering existing mappings.
- A temporarily absent value retains its stored mapping.
- A pile assignment whose source configuration disappeared remains representable using its stored mapping or the normal fallback.
- Switching pile plans changes only used-state styling.
- Refreshing source data must not silently reset customized mappings.
- Changing language while the editor is open updates all labels without changing the draft.

## Accessibility And Localization

- All labels, tooltips, validation messages, scheme names, and Undo descriptions are available in Dutch and English.
- Shape and color controls expose their current values through accessible names.
- The editor modal retains keyboard focus containment and restores focus to its launch button after closing.
- Segmented controls and listboxes support keyboard navigation and visible non-browser-default focus styling.
- Color is never the only indication of enabled, disabled, used, selected, warning, or validation state.

## Test Plan

### Pure legend model

- generate the current built-in mapping deterministically;
- reconcile stored mappings with newly added, removed, and returning source values;
- preserve both encoding-mode mappings while switching modes;
- resolve shape and color correctly in both encoding modes;
- preserve disabled mappings;
- reset appearance without changing activation;
- assign symbols in the documented 54-item order;
- reject automatic symbol assignment above 54 scoped values;
- generate deterministic colors for each built-in scheme;
- apply automatic assignment to enabled scope and all scope independently.

### Editor behavior

- appearance controls and activation arrows perform separate actions;
- disabled items hide their retained appearance;
- the enabled column has the wider layout and stacks responsively;
- base-shape and fill-pattern selection compose the expected symbol;
- color editing validates hexadecimal input;
- scheme options show names and palette previews;
- automatic shape and color actions remain independent;
- Apply commits one complete draft;
- Cancel, Escape, and close discard all draft changes.

### Project integration

- IFCPP round-trip preserves encoding mode, mappings, fill patterns, and activation;
- older IFCPP files receive built-in defaults;
- malformed individual mappings fall back without blocking the project;
- Undo and Redo restore the complete legend change;
- browser recovery restores applied legend personalization;
- refreshing sources preserves existing mappings and initializes only new values;
- switching pile plans updates used-state presentation without changing mappings.

### Visual consumers

- normal legend, viewer, pile-options table, and hover information use the same resolved style;
- reversing encoding mode reverses visual channels everywhere;
- all nine base shapes and six fill patterns remain recognizable at supported symbol-size and zoom limits;
- semantic crosses, selection rings, and CPT styling remain unchanged.

## Out Of Scope

- cross-project user legend preferences;
- saving, naming, importing, or exporting custom palettes as reusable presets;
- user-authored color-gradient stops;
- more than the five built-in automatic color schemes;
- per-pile-plan legend appearance;
- automatic warnings for duplicate manually assigned symbols or colors;
- changing the viewer's semantic colors for selection, missing data, utilization, or CPT state.
- assigning monochrome symbols directly to exact size-and-tip-level configurations;
- drawing, CAD, BIM, or monochrome pile-plan export.
