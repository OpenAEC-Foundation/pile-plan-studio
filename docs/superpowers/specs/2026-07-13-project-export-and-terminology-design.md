# Project Export And Terminology Design

## Scope

Pile Plan Studio provides working IFCPP and image exports, removes the unfinished report export, completes import-panel localization, and adopts the updated foundation-advice terminology.

## Export behavior

- In browsers supporting the File System Access API, IFCPP and PNG export open a native save-location dialog.
- Other browsers fall back to a normal download.
- Tauri uses its native save dialog and writes the selected file through a Rust command.
- PNG export captures only the pile-plan viewer, including grid, CPTs, load points, current pan/zoom, and selection markers. Toolbars, legend, explorer, and side panels are excluded.
- Export errors remain visible to the user instead of failing silently.
- The unfinished report export is removed.

## Terminology and localization

- All visible import-panel copy uses i18n in Dutch and English.
- Dutch `Draagvermogens` becomes `Funderingsadvies`; English becomes `Foundation advice`.
- Visible FRD labels become an italic R with subscript `c;net;d`: `R_c;net;d` in accessible/plain text and HTML formatting where table headers permit it.
- Internal fields such as `frd_kn`, core command names, and the IFCPP schema remain unchanged for backward compatibility.

## Verification

- Unit tests cover platform save behavior, filenames, export-menu contents, localization use, and terminology.
- Browser verification confirms IFCPP and PNG produce download events in fallback mode and that report export is absent.
- TypeScript tests, production build, and Rust checks remain green.
