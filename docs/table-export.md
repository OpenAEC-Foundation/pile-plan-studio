# Table export

Use **File > Export** to write an Excel (`.xlsx`) or CSV table. Choose the pile
plan to export. The initial choice is the plan shown in the viewer. You can
choose another plan without switching the viewer or changing the project.

## Set up columns and numbering

- **Column settings** controls the columns, their order, captions, and content.
  Drag the grips or focus one and use the arrow keys, Home, or End. Default
  captions follow the interface language. Custom captions and imported captions
  are kept. When an added column's caption already exists, the app adds a free
  numeric suffix.
- **Table preview** shows the first 12 rows. The export includes every row.
  Both sections start collapsed and keep their settings when closed.
- The standard export starts with seven columns. You can add pile numbers
  (`Mark`), tip-level codes, fixed text, and other project fields. Choose the
  units for coordinates and levels and the size notation. Templates accept
  `{size}`, `{width}`, `{height}`, and `{diameter}`. Dimension notation displays
  square piles as `290x290` and round piles as `Ø290`.

Mark numbering can run by rows or columns with independent X/Y directions, a
starting number, and a grouping tolerance (default 1 mm). Each row or column
spans at most the tolerance. Tip-level codes can be letters (`A` through `Z`,
then `AA`) or numbers, ordered by tip level from high to low or low to high.
Column choices and numbering rules are application preferences.

To export schematic pile positions instead of the original positions for a
proposed cap, select **Include pile-cap proposals**. Add **Export ID** and
**Original locations** to identify the exported piles and their source locations.
See [Pile-cap proposals](known-limitations.md#pile-cap-proposals) for how these
positions and loads are calculated.

## Create a change table

Choose **Create change table** to compare a previous Excel or CSV pile list with
the selected, fully assigned plan or with a new pile-plan file. The previous
table can come from Pile Plan Studio, Revit, or another program.

1. Check the detected worksheet, header row, and column mapping. The previous
   table requires X and Y. Missing optional size, shape, and level values are
   reported and only available values are compared. A new file requires unique
   location IDs, X/Y coordinates, pile sizes and shapes, and tip levels. You can
   set source units, custom size templates, and a shape hint for numeric old
   sizes. Numeric new sizes can use the current project's known shapes.
2. Review and confirm links on the location-matching drawing. The automatic
   matching tolerance is 99 mm by default and can be changed. When including
   pile-cap proposals, the change table treats the replaced original piles as
   removed and the proposal piles as added.
3. Choose a numbering rule. By default, linked locations keep their old Marks
   and use their new location IDs. New Marks start above the highest old Mark,
   including removed piles. If an output Mark column is included, missing old
   Marks are generated using the selected rule. You can adjust the rule suggested
   from existing Marks. **Renumber the entire new pile plan** numbers every
   active location from the chosen start. In both modes, removed locations keep
   their old Marks, which may also occur among the newly numbered locations.

### Read and customize change codes

The default output keeps the previous column order and additional cell values,
and includes a `Wijzigingscode` column with these codes.

| Code | Change |
| --- | --- |
| `M` | XY movement greater than 99 mm by default |
| `S` | Changed pile size or a change between known shapes |
| `L` | Changed numeric tip level |
| `A` | Added location |
| `R` | Removed location |

Customize the codes, their separator, and the movement threshold in the
change-code column settings. You can rename, move, or remove the column. Active
tip-level codes are regenerated from the new plan. The change codes use the
location, size, shape, and numeric tip level.

Removed rows stay in the table with their old IDs, Marks, and values, even when
the change-code column is hidden. Their IDs can also occur as active IDs in the
new plan. Added rows leave unavailable previous metadata blank. The export
carries over cell values only. Source mappings, link edits, and output changes
for the comparison are temporary.
