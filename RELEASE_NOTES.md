# Pile Plan Studio Release Notes

## 0.1.6-alpha

This alpha adds multiple pile plans per project and introduces explicit,
project-wide control over the pile-size and tip-level legend.

### Added

- Store multiple named pile plans in one IFCPP project and switch between them
  from the project explorer.
- Duplicate, rename, and remove pile plans while showing the estimated cost of
  each plan.
- Create a fresh pile plan from the cheapest valid assignments.
- Optionally preserve the current plan as a separate variant when running the
  greedy optimizer.
- Edit enabled pile sizes and tip levels in a dedicated legend editor with
  separate active and inactive groups.
- Quickly activate only the sizes and tip levels used by the current pile plan
  from the legend toolbar.

### Improved

- The legend now distinguishes used, unused, and disabled configurations
  without changing project settings after optimization.
- A used but disabled legend item remains visible with a warning, so existing
  pile assignments never disappear silently.
- Clicking a legend item selects all load points with that property;
  Shift+click combines size and tip filters using the existing union and
  intersection rules.
- Legend usage updates immediately after pile assignment, optimization, or
  switching to another pile plan.
- The legend editor supports Apply and Cancel, bulk activation actions,
  keyboard focus containment, and localized English and Dutch labels.

### Notes

- Enabled legend configurations belong to the project. Pile assignments and
  locked locations belong to each individual pile plan.
- This release does not publish a Windows installer. The browser build and
  source code contain the 0.1.6-alpha changes.

## 0.1.5-alpha

This alpha improves control over the pile-plan viewer and makes dense or
overlapping project data easier to inspect.

### Added

- Adjust viewer symbol size continuously from 10% to 200%.
- Set a preferred utilization range and highlight assignments below or above
  that range with progressively stronger green or red feedback.
- Choose whether ordinary load points or CPTs are drawn in the foreground.
- Configure a separate maximum utilization for greedy optimization.
- Show total project cost and the current zoom level in the status bar.

### Improved

- Viewer zoom now supports levels up to 1000% while preserving sharp vector
  symbols and responsive pan and zoom behavior.
- Selection rings, CPT labels, hover hit areas, and overlap detection now track
  the configured symbol size and exact project coordinates.
- The active object beneath the pointer is always raised above the selected
  foreground layer and can be cycled with Space when objects overlap.
- Hover instructions now describe nearby objects directly and show
  `Shift + Click` as an explicit multi-selection shortcut.
- The preferred-range control now colours only the interval between its two
  handles.
- Space no longer activates focused ribbon, legend, or numeric input controls;
  ordinary text fields retain normal text-entry behavior.

### Notes

- The preferred utilization range is a viewer setting. It does not redefine
  the engineering resistance check used for pile-option status.
- This release does not publish a new Windows installer. The browser build and
  source code contain the 0.1.5-alpha changes.

## 0.1.4-alpha

This alpha expands CPT selection workflows and makes project-source refreshes
safer for projects whose loads or source files change during design.

### Added

- Configure CPT-selection settings for all load points when no load point is
  selected, or apply them only to the current selection.
- Define a monopoly distance: when a CPT lies within this distance, it becomes
  the only automatically selected CPT for that load point.
- Edit manual CPT selections for multiple selected load points at once from the
  CPT panel, including removing CPTs, selecting CPTs in the viewer, and choosing
  only the nearest CPT.
- Choose whether bulk CPT-setting changes may overwrite existing manual CPT
  selections.
- Connect common CPT selections with thin plan lines when all selected load
  points use the same CPT set.
- Refresh one or more imported project sources without creating a new project.

### Improved

- Source refreshes preserve pile assignments, manual CPT selections, local CPT
  settings, and project identity wherever load points and CPTs can still be
  matched reliably.
- Refreshed load points are matched by validated ID first and then by a unique
  coordinate fallback.
- CPT-only refreshes show a non-blocking warning that the corresponding
  foundation advice should also be refreshed.
- Refresh requests accept persisted numeric identifiers consistently in both
  the browser and desktop calculation paths.
- Load points that cannot retain an existing assignment receive the cheapest
  valid default pile without replacing assignments that were matched and
  preserved.

### Notes

- Refreshing CPT coordinates without the matching foundation advice can make
  capacities and pile configurations temporarily unavailable. Refresh both
  sources together when the CPT set changes.
- This release does not publish a new Windows installer. The browser build and
  source code contain the 0.1.4-alpha changes.

## 0.1.3-alpha

This alpha adds pile-plan import and broadens compatibility with historical
Pile Plan Studio and RFEM project data.

### Added

- Import pile assignments from the standard Pile Plan Studio Excel or CSV
  table.
- Import pile assignments from legacy `Vergrendeld.xlsx` workbooks.
- Independently choose whether standard-table imports update pile assignments,
  manual CPT selections, or both.
- Preview matching results, coordinate fallbacks, skipped rows, and conflicts
  before applying an imported pile plan.
- Configure the coordinate matching tolerance, with a default of 1 mm.

### Improved

- Load points are matched by a validated ID first and then by one unique
  coordinate match within tolerance.
- Legacy RFEM names such as `Knoop 1603` are recognised as load-point IDs.
- Historical or duplicate Legacy rows are reconciled safely: a current ID match
  takes precedence, identical rows are deduplicated, and genuine conflicts are
  still skipped with warnings.
- RFEM import falls back to the first worksheet for nodes and the second for
  nodal reactions when direct structural detection is unavailable.
- RFEM reaction imports support both primed and unprimed PZ envelope layouts,
  including `Min PZ'`, `Min PZ`, and `Min` rows.
- The pile-plan import panel follows the existing OpenAEC backstage styling and
  uses the shared import icon alignment.

### Still Planned

- Store multiple pile plans in one project and expose them in the project
  explorer.
- Export one selected pile plan or all project plans as a ZIP archive.
- Edit manual CPT selections for multiple selected load points at once.

## 0.1.2-alpha

This alpha improves project-data exchange and adds an RFEM-oriented import
workflow for load points.

### Added

- Automatic detection and manual selection of import profiles.
- An RFEM Excel import profile that combines node coordinates and reactions
  into load points.
- Inline import previews with source diagnostics before project creation.
- Excel and CSV export of the current pile assignments, including the selected
  CPT identifiers for each load point.

### Improved

- Open, import, and export panels now share the OpenAEC backstage styling.
- Import sources are presented as clear role-based blocks for load points,
  CPTs, and foundation advice.
- The RFEM profile can be selected before choosing a file and is automatically
  restricted to compatible Excel sources.
- Import warnings and profile information are localized consistently.
- Browser-only actions are separated more clearly from desktop file actions.

### Planned Next

- Import pile assignments and CPT selections from the standard Pile Plan
  Studio table and the legacy Excel format.
- Store multiple pile plans in one project, expose them in the project
  explorer, and export one plan or all plans as a ZIP archive.
- Edit the manual CPT selection for multiple selected load points at once.

## 0.1.1-alpha

This alpha focuses on making dense pile plans easier to inspect and improving
the visual clarity of selections and engineering information.

### Added

- A compact hover inspector for load points and CPTs.
- Candidate detection for markers that overlap or lie very close together.
- Spacebar cycling between multiple markers beneath the pointer before
  selection.
- Compact marker previews that preserve pile, CPT, missing-option, and
  selection styling.

### Improved

- Viewer coordinates retain their full precision instead of being rounded for
  marker positioning.
- Overlapping marker selection now prioritizes the candidate nearest to the
  pointer.
- Candidate detection is limited to directly relevant visible markers, avoiding
  large transitive overlap groups.
- Selected CPTs remain above ordinary load points while selected load points
  retain the highest interaction layer.
- CPT numbers are positioned and scaled more consistently in both the plan and
  hover inspector.
- CPT names remain available when imported data does not contain a display
  name.
- CPT links in the selection and pile-option tables use consistent localized
  terminology.
- Selected CPT markers now use an opaque, light accent fill and accent contour
  in every theme.
- Pile-size symbols in the legend inherit the active theme text color.
- The selected pile-option row has a subtle accent background in addition to
  its accent bar.
- Pile-option hover rows use a visible neutral background in light and dark
  themes.

### Engineering Model

The pile-option calculation model, foundation-resistance checks, and greedy
optimization behavior are unchanged in this release. The changes primarily
improve inspection, marker selection, terminology, and visual feedback.

## 0.1.0-alpha

Initial public alpha with:

- CSV and XLSX import for load points, CPT coordinates, and foundation advice;
- IFCPP project save and reopen support;
- Rust-based pile-option analysis in desktop and browser environments;
- automatic and manual CPT selection;
- pile cost settings and cheapest-valid default assignments;
- multi-load-point selection and common pile options;
- greedy pile-plan optimization;
- browser demo and Windows desktop packaging.

See [Known Alpha Limitations](docs/known-limitations.md) before using results in
an engineering workflow.
