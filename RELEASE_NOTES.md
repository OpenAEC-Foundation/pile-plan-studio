# Pile Plan Studio Release Notes

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
