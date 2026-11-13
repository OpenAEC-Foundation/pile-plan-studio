# Shared Blueprint foundation

The CSS, fonts and React components in this directory are copied byte-for-byte from
`OpenAEC-Foundation/OpenAEC-Blueprint` revision
`436f3d78f02b3097000a6374c0dcdaf6854fc56b` (design 0.4).
`manifest.json` records each source path and SHA-256. Do not edit these copied
files manually. The source licence is included in `LICENSE`; font licences are
included as `fonts/*-OFL.txt`.

Run `node tools/sync-blueprint.mjs` from the repository root to restore this
pinned version. This uses the GitHub CLI (`gh`) and its existing authentication.
Run `node tools/sync-blueprint.mjs --check` to verify all copied assets offline;
the normal frontend test and build commands include this check.

`src/themes.css` is the app-owned compatibility bridge for the existing
`--theme-*` variables. Fonts are loaded once from `src/main.tsx`. Component and
layout migration is incremental; importing the foundation does not imply that
every component already follows the Blueprint component specification.

## Local adaptation register

The entries below are deliberate app-owned adaptations to the pinned package.
Paths are relative to `src/`. Recheck them when updating the Blueprint revision;
remove a workaround only after the shared replacement preserves its behavior.
Issue/PR references identify the proposals behind an adaptation, not their
current upstream status. No pinned CSS, React code, fonts or sprite paths are
patched locally.

| Adaptation and owner | Reason to retain it | Replacement or review condition |
| --- | --- | --- |
| `openaec/number-field-preview/`; `components/template/NumberInput.tsx`, `ThemedNumberInput.tsx`, `NumericValueInput.tsx`; optimization's `IlpNumberField` | Separate stepper proposal plus translated adapters; preserve decimal drafts, repeat/keyboard stepping, bounds and commit/history boundaries. | Adopt the reviewed upstream number field through a pinned sync, then remove the preview while retaining required domain adapters. See [issue 77](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint/issues/77) and [PR 81](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint/pull/81). |
| `components/domain/imports/SourceMeaningSelect.tsx` | Shared Select lacks per-option disabling; the adapter sets native disabled metadata before paint and resets it when columns change. | Replace when shared Select exposes disabled options; retain empty-column restrictions, explicit assignment-clearing choices and disabled worksheet prompts. |
| `App.css` action typography | Ordinary actions use regular 400; primary actions retain 600. Headings and table headers keep emphasis. | Reassess when shared Button supports this hierarchy. See [issue 78](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint/issues/78). |
| `components/template/NumberInput.css`; domain table styles including `right-panel/costSettings.css` and `pileOptions.css` | OPPS prefers left-aligned editing and comparison columns. Alignment of complete result-summary value columns is a separate layout choice. | Retain as application preference; review against future shared alignment options rather than removing it with stepper updates. |
| `components/template/icons/pile-plan-proposals.svg`, `simple-controls.svg`, `PilePlanIcon`, `SimpleIconControls`; title-bar settings gear | Reviewed domain symbols and simpler pencil/funnel/plus drawings remain separate from the pinned assets. The general settings gear is an independent choice. | Compare each drawing with the next reviewed upstream sprite before substituting it. See [issue 73](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint/issues/73), [issue 82](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint/issues/82) and [issue 84](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint/issues/84). |
| `components/template/ApplicationTooltip.tsx` and `.css` | Portal layer escapes clipped scroll containers and provides accessible descriptions without redundant inline tips. | Replace when the shared tooltip offers equivalent positioning, clipping escape, dismissal and disabled-control behavior. See [issue 83](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint/issues/83). |
| `components/template/TitleBar.css`, `StatusBar.css`, `ribbon/Ribbon.css`, `ribbon/PlanRibbon.css` | App-owned composition and layout around shared controls: fixed shell metrics, translated labels, 12px group gutters, 6px button gaps and drawing-keyboard isolation. Base ribbon geometry/captions live in Ribbon.css; shared-control states and responsive overrides live in PlanRibbon.css. | Keep application layout; reassess specific rules when shared shell/ribbon APIs cover them. Preserve compact sizing and long Dutch/English labels. |
| `components/template/ribbon/UtilizationRangeSlider.tsx` | Two overlapping handles and one selected range, with existing pointer capture and draft/commit semantics; shared Slider has one value. | Use a shared range control only when it supports both handles and the existing interaction contract. |
| `components/viewer/ActionNotice.tsx` and `.css` | Shared Banner with app-owned 3500ms lifecycle; shared Toast has different timing/error persistence. Scoped error-icon color repairs a pinned selector conflict. | Keep the lifecycle in AppSession. Remove the icon-color repair once the pinned Banner resolves that conflict; use Toast only if its lifecycle becomes compatible. |
| `components/domain/imports/projectImportBlueprint.css` | RFEM tension-import checkbox aligns left within its flex column; the shared general checkbox alignment would center it. | Review with shared checkbox layout changes; do not apply the exception to the separate header-checkbox row. |
| `themes.css`; drawing, legend and picker styles | Active compatibility aliases and app-specific geometry/color/symbol rendering. Drawing annotations retain their own color system; shared controls/tokens provide interface chrome. | Migrate aliases only after all consumers are accounted for; retain engineering drawing invariants and project colors. |
| `components/template/ribbon/icons.ts` | The exact information glyph is still used by `PanelControls`; other legacy ribbon SVG strings have been removed. | Replace only as an explicit visual change to panel help, then remove this final constant. |

The retired `Modal` and `ThemedSelect` components and their styles have no
production callers and have been removed. Active numeric adapters remain.
Regression tests cover the shared dialogs/fields and the retained adapters;
obsolete tests for the deleted controls are not a second implementation contract.

## Number-input proposal preview

`number-field-preview/` is an explicitly separate local integration of the
Blueprint `number-field-stepper` branch for issue 77. `number.tsx`, `numberStep.ts`
and the numeric CSS block match that candidate; two small imports bridge to the
unchanged pinned controls. They are not part of the pinned asset manifest and do
not represent a new upstream release. Once the proposal is accepted, adopt its
reviewed revision through the normal sync process and remove this preview.

All OPPS numeric editors now compose NumberInput or NumberField through the
translated adapter in `components/template/NumberInput.tsx`: settings, project
reference level, costs, import/export, location matching, optimization and ribbon
percentages. ThemedNumberInput and IlpNumberField retain their callers' contracts
as thin adapters. Existing model parsing, draft/commit boundaries, undo/dirty
state and native input types remain intact. Both arrows are CSS triangles inside
a 2 px inset, with the accepted optimization appearance and hover/focus/touch
visibility. Native spinners and duplicate local stepper styles are removed.
OPPS sets left alignment separately; full result value-column layout is unchanged.

## Action typography

OPPS uses regular (400) text for ordinary action buttons throughout the application,
including secondary, quiet and danger Blueprint buttons. `src/App.css` overrides
the shared Button default without modifying the pinned upstream files. Legacy
import, export, source-data and navigation controls follow the same convention.
Primary actions retain semibold (600), including legacy import/export, matching
and feedback submission. Selected states, headings and technical status emphasis
keep their own hierarchy. This app-wide adjustment follows the proposal in
[Blueprint issue 78](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint/issues/78).

## Shared title and status bars

The pinned package has no full titlebar component. `TitleBar.tsx` composes its
shared IconButton, Button and Status in an app-owned responsive grid, retaining
the application logo, centered name/Alpha/native version and the local settings
gear. Save/download, Undo/Redo, preferences and feedback keep their callbacks;
history availability still controls disabled state. Keyboard shortcuts are
exposed accessibly, and help uses the application tooltip overlay. Enter/Space
stay with titlebar controls rather than reaching drawing shortcuts; application
shortcuts remain available. The fixed 32px titlebar alias is unchanged.

`StatusBar.tsx` uses the shared semantic StatusBar for live messages and theme
roles. Scoped slot layout keeps the message left, product label centered and
rounded plan zoom right; long messages truncate without moving these items.
The shared 22px height and monospace status typography apply. It does not
own costs, history notices, scale settings or project data.

The desktop scale notice retains its zero-width titlebar anchor, transient value,
expiry/focus/pointer behavior and callbacks. Its three actions now use shared
Buttons and its popover uses Blueprint tokens. Native window controls remain
owned by the browser or desktop frame.

## Shared settings components

The application settings window composes the pinned React package directly from
`react/src/index.ts`, with the unchanged `openaec-components.css` stylesheet.
It uses Dialog, Tabs, Select, Button, IconButton, Checkbox, Slider and Heading.
The sync manifest includes the React sources and their package metadata.
`SettingsDialog.css` only supplies the app's sizing and content layout.

Blueprint Dialog uses the browser's native modal layer for focus containment,
Escape and focus restoration. The three settings pages use horizontal Tabs.
Theme and workspace appearance use the same labelled native Select control.
Preference previews remain app-owned and revert on Cancel, Escape or Close.
Reset opens a second shared Dialog and changes draft preferences only; Save
commits them. Desktop scale and AI connection controls keep their existing
callbacks; connection permissions remain immediate session actions.

## Shared project information dialog

Project information composes the same native Dialog, IconButton, TextField,
Select and Button. `ProjectInformationDialog.css` supplies a compact two-column
layout with a narrow-window fallback; the shared package supplies decoration,
focus states and controls. Reference-level help uses the shared `ui.about`
IconButton and Blueprint tooltip styling on hover/keyboard focus, with app-owned
line wrapping/placement. Its hidden description is associated with the field
and button through `aria-describedby`. Escape on the focused information button
first hides the tooltip; a second Escape remains available to close the dialog. Decimal comma/point parsing and left-aligned
numeric entry are retained.

Name, reference level and currency remain local drafts until the existing
project-save callback accepts them. A rejected save retains the draft, pending
saves disable submission, and Cancel/Close/native Escape discard drafts.
Reopening reloads current project values. Modal keys stay away from viewer
shortcuts; native Dialog handles focus containment/restoration.

## Shared unsaved-changes dialog

The project-replacement warning uses the same native Dialog, IconButton and
Button components. Save remains the primary last action, continuing
without saving uses the shared danger style, and Cancel/Close/native Escape
all call the existing cancellation callback. App-owned layout keeps the actions
beside each other at desktop widths, wraps them at compact widths, and isolates
modal keys from viewer shortcuts.

The browser primary action explicitly saves locally to the recent IFCPP copy;
desktop keeps saving to its file. AppSession waits for persistence before allowing
replacement. Pending controls are disabled, and a shared error Banner stays inside
the warning if saving fails. Separate toolbar downloads keep their existing route.

## Shared CPT settings panel

The CPT settings sidebar composes Panel, IconButton, Radio, Checkbox, Button
and ChoiceTiles from the same pinned React package. The existing algorithm
diagrams live in the app-owned `cptAlgorithmDiagrams.svg`, used through the
ChoiceTiles visual slot with a scoped provider. These are explanatory diagrams,
not registered B2 function icons. Their SVG URL must not be inlined because
external SVG symbol references cannot resolve a data URL. The Blueprint variants of
`SettingsGroup` and `DraftNumberField` render Heading and TextField while reusing
the existing number-draft commit/clamp logic. The legacy rendering remains available for controls that have not migrated.

`components/domain/right-panel/cptSettings.css` supplies the compact sidebar
layout. Numeric help is displayed below its field and associated through
`aria-describedby`. Standalone numeric fields align left while retaining the
shared numeric font. Scope and
algorithm remain separate radio groups.
Algorithm tiles use the shared selection border and keyboard navigation. The
app adapter supplies a keyboard entry when mixed settings leave both tiles
unselected, and prevents their activation keys reaching viewer shortcuts.
All/selected scope, manual-overwrite opt-in and manual-selection edit routes
are unchanged; project settings still use the existing validation/history path.

Application theme and plan background are separate application preferences.
Legacy Forge/OpenAEC map to Dark; Contrast maps to High contrast dark.
High contrast themes enforce their own workspace contrast, as in Blueprint.
Plan annotation colours remain owned by the viewer, independently of chrome.

## Shared cost settings panel

The cost sidebar composes Panel, IconButton, Table, Select, TextField, Button,
Heading and Status from the same pinned package. Table cells contain labelled
native controls; row names identify the pile size and prices include the project
currency. Cost headings and numeric entry fields align left while retaining the
shared numeric font. Used pile sizes remain protected, other sizes stay in a collapsed
native disclosure, and the add form uses two columns with units beside values.
`costSettings.css` supplies layout only; shared section/numeric composition lives
in `panelControls.css` and also serves the CPT panel.

Existing core edit actions, cost parsing, pending guard and rejected-edit rollback
are retained. Personal and built-in defaults keep their existing callbacks and
replacement confirmation. Button/disclosure activation keys are isolated from
viewer shortcuts, while project Undo remains available.

## Shared grouping settings panel

The grouping sidebar composes Panel, IconButton, Checkbox, Button and the same
Blueprint section/number-draft adapters. Its standalone distance field retains
left alignment, units beside the value, and associated help. App-owned
`groupingSettings.css` handles wrapping, scrolling and compact sidebar layout.

`LoadPointGroupEditButton` has an opt-in Blueprint button variant; both variants
share the existing core preview/apply flow, stale-preview guard, disabled state
and reason tooltip. The selection toolbar retains its existing rendering.
Reset still uses the existing reset-overrides action. Automatic grouping,
distance, override records and group visibility stay on their existing project
history paths. Native button/checkbox activation is isolated from viewer keys;
Undo remains available.

## Shared optimization panel

Optimization uses the same NumberField proposal preview as the other numeric
editors, with its app-owned label/unit layout. Standalone ribbon numeric editors
also align left. Full result-summary value columns keep their layout alignment.

The optimization sidebar composes Panel, IconButton, Button, Checkbox, Radio,
TextField and Heading from the same pinned package. Target scope and candidate
source are labelled exclusive radio groups. `IlpDisclosure` stays app-owned
because the package has no disclosure component; its action and heading use the
shared components. Disclosure preferences, summaries, run destination, stop-best,
cancellation and stopping state retain their current callbacks and controller.
Result actions/headings share the same components; proof, cost-reference and
solution details remain separate.

`IlpNumberField` composes the NumberField candidate. The app adapter retains the
existing draft parser and commit callbacks; the candidate handles decimal
comma/point stepping, keyboard and delayed pointer repeat. Inputs align left,
units sit beside values, and errors use the shared field message. Legacy focus
styling excludes shared `.oa-field` controls so Blueprint owns their states.

The candidate matrix remains a semantic table styled with `.oa-table`, with
shared Checkbox/Button controls and native indeterminate selection. The package's
Table has string-only headers, so it cannot express this matrix's row/column
selection controls. Existing candidate helpers retain unavailable selected
configurations and perform immutable edits. The count selector uses a shared
native Dialog with shared controls; maximum/exclusions still apply atomically,
and cancelling or disabling the launcher discards its draft.

## Shared pile-option inspection

The pile-option sidebar composes Panel, Button, Checkbox and Status with the
pinned package. Its column-preference window uses the native Dialog and
IconButton; visibility, pointer/keyboard reordering and reset retain the existing
immediate application-preference callbacks and independent single/multiple
selection layouts. Modal keys stay within the dialog.

The semantic table stays app-owned: the shared Table's string-only headers do
not support its sort/filter controls, engineering subscripts or per-row pending
gates. It uses `.oa-table`, shared controls and scoped Blueprint tokens. Sizes,
tip levels and column labels use the normal body font; values align left.
Sort arrows point down for ascending and up for descending; `aria-sort` states
the actual numeric direction. Filtering, sorting and assignment callbacks are
unchanged. Rows also support Enter/Space activation, with the same pending guard.
Links and status actions inspect their target without assigning the surrounding
row. Shared Status tones retain the existing valid/missing/insufficient/neutral
presentation categories; they do not introduce new technical decisions.

The selection overview shared by pile-option and CPT inspection uses Heading
and Button. Grouped rows, context navigation, group editing, collapse and
resizing retain their existing selection and preference paths. Activation keys
stay away from viewer shortcuts while project Undo remains available outside
the modal. App-owned technical notices retain their content and use scoped theme
roles. Lock actions remain in the ribbon.

## Shared CPT inspection

CPT inspection composes the pinned Panel, Button, IconButton, Banner and Status
components in both the selected-CPT detail view and the selected-locations
overview. The native semantic tables use `.oa-table` with normal body fonts,
left-aligned values and intact resistance subscripts. App-owned table markup
retains optional pile-count columns, governing rows, advice highlight triangles,
`aria-current` and scroll-to-highlight behavior, which the shared Table API
cannot express together with the engineering headers.

The existing Modify, nearest/algorithm, Save, Cancel, remove, retry and
usage-member callbacks are unchanged. Pending automatic previews gate edits;
saving also gates cancellation. Preview failures use a translated shared Banner,
and progress uses Status inside a polite live region. Native details retain
member expansion and the existing tooltip dismissal on opening. Usage and
changed-member buttons use the shared Button without changing their draft and
selection paths. Enter/Space activation stays away from viewer shortcuts;
project Undo remains available. The shared selection overview/navigation is
the same one used by pile-option inspection.

## Shared pile-cap changes

The active-plan pile-cap overview composes Panel, IconButton, Button and Status.
It retains the existing semantic list of selectable proposals, stable ordering,
selection state, remaining-source filtering and distinct inactive/missing-source
reasons. Its app-owned column layout uses normal body fonts and left-aligned
counts. Warning labels wrap and keep their explicit reason text; row selection
also has a leading marker and `aria-pressed`.

`PileCapProposalControl` uses the shared Button for decrement/increment,
quarter-turn rotation and reset in both the overview and the selection block.
The selected-group heading uses Heading. Invalid/orphaned proposals keep the
existing removal action with shared Button/Status. Count readouts retain their
polite live region and width-reservation pseudo content; source-edit/pending
messages and force formatting are unchanged.

Core previews, count limits, common-configuration selection, immutable edit
callbacks, active-plan reset and edit guards retain their current paths.
Enter/Space on controls stays away from viewer shortcuts without cancelling
native defaults, and Undo remains available. The stylesheet supplies scoped
layout/tokens; shared components supply button states, status tones and icons.

## Shared legend editor

The legend editor composes the pinned native Dialog, Button, IconButton,
Checkbox, Radio, Heading, Status and Banner. The current plan stays in scope;
encoding/scope, bulk activation, recoloring, symbol reassignment, warnings and
usage/conflict details retain their existing model functions and translations.
Drafts remain local until the existing async Apply callback accepts them; close,
Cancel and native cancellation keep their existing callback ownership. Reopening
resets project values and unmounts picker content while closed, as the legacy
modal did. Apply retains its pending guard.

Color/symbol/palette-preview pickers and native disclosures stay app-owned
because the package has no matching specialized components. Their triggers and
choices compose the shared Button; palette previews, neutral symbol color,
22/44 px sample geometry, free native color input, placement and keyboard
selection remain intact. Focused inner Escape closes the popover and restores
its trigger before native editor cancellation. Modal keys do not reach viewer
shortcuts. Native Dialog supplies modal focus containment/restoration rather
than the old draggable window/focus trap.

`LegendEditor.css` supplies app-owned responsive columns, scroll areas, sample
geometry and Blueprint tokens. Long toolbar labels wrap and use regular weight
for compact readability; primary dialog actions keep the shared button weight. Usage/conflict status
labels use explicit text and shared tones; outside-scope usage badges use the
secondary text, a muted accent border and no tinted fill. Rendering/calculation colors in the
plan drawing remain separate and unchanged. The native color control retains
an associated label and the same uppercase color update callback.

## Shared project import and source refresh

Project import and source refresh compose the pinned Button, TextField, Select,
Checkbox, Heading, IconButton, Banner and Status components. Native file pickers
are activated by labelled shared Buttons and reset after each selection. The
existing preview hooks, file-role inference, RFEM options, advice discovery,
worksheet selection, immutable column mapping, refresh review and submission
callbacks remain unchanged. Reference-level help stays in an accessible tooltip;
the required field retains comma/point normalization and its existing blocker.

SourceTableEditor uses shared Buttons, Checkbox and Select alongside a semantic
table. Import and export previews share EditableTableHeading for the column
popup. SourceMeaningSelect preserves disabled mapping options (see the local
adaptation register). Numeric drafts retain validation, blur and repeat-step
behavior through the shared numeric adapter. Import errors link to the original
source row or cell when it is visible in the preview.

Import workspaces, including pile-plan import sizing, now use the same 1100 px
maximum width as export, constrained by the viewport and File navigation. The
project import form and column editor stack at narrower widths. No import rules
or source data are changed. The selected icon bundle includes the upstream status
icons required by shared feedback components, regenerated by the sync command.

## Shared pile-plan import and export

Pile-plan import uses the shared Button, Select, Checkbox, Heading, Banner and
Status components, including the Blueprint source-table editor variant. The
file action lives in `components/domain/shared/SourceFileButton.tsx`; project
import reuses it through its existing import. File inputs remain native, labelled
and reset after selection. Preview/category gates and accepted patch handling
continue through the existing import hook.

The export page and normal/revision workflows compose the same shared controls,
with TextField for proposal/change codes and the shared numeric draft adapter.
Column metadata editors compose shared TextField and Select;
preview tables use `.oa-table`. Semantic disclosures and the specialized column
list retain their keyboard/pointer ordering, focus, labels and immutable updates.
Numbering, source mapping, revision confirmation, export callbacks and busy
checks retain their existing logic. The location-review entry uses shared
Heading, Status and Button; its review workspace is described below.
Scoped `exportsBlueprint.css` supplies layout, wrapping and token-based surfaces.
Import and export retain their responsive 1100 px maximum workspaces.

## Shared location-matching workspace

The full-screen location review uses shared Button, Checkbox, Select, TextField,
Heading, Status and Banner components. Its existing resizable aside composes a
shared Panel for location details, partner selection, filtering and navigation.
Confirm is primary; other actions use regular-weight secondary buttons. Search,
layer keys and the semantic location list retain their existing labels and state.
The tolerance editor uses the shared numeric adapter and the canvas fit action
uses Button. Tolerance help uses IconButton with the existing application tooltip
overlay for accessible long hover/focus explanations, without a duplicate CSS tip.

The existing workspace host, mode aliases, scoped undo/redo, evaluation guards,
explicit confirmation and tolerance draft/commit boundary remain unchanged. The
canvas projection, markers, transparent hit targets and geometry are not migrated
to chrome controls. Legacy styles exclude shared fields/buttons and marker hit
targets; wrapped action styles exclude numeric stepper buttons. App-owned
`locationMatchingBlueprint.css` handles layout, panel scrolling, wrapping and
left-aligned property values. Import/source-refresh and revision modes reuse the
same workspace and their existing domain clients.

## Shared project explorer

The left explorer composes a shared Panel, MonoLabel, Button, IconButton,
TextField and neutral Status. The existing aside remains the workspace/resizer
boundary. Source rows, plan rows and expansion controls use shared quiet Buttons;
rename/copy/delete use the unchanged pinned object.rename/edit.copy/edit.delete
icons and the new-plan action uses pile.new. Those icons are selected through
the normal sync tool; their original 16/24 px artwork remains intact.

The shared Sidebar API has label/link items without domain metadata or sibling
management actions, so the explorer retains its semantic source list and plan
listbox. Counts, currencies, indicative cap changes, missing costs, locked counts,
optimizer status and the project dirty marker remain distinct. Source selection
also has aria-pressed; plan selection keeps aria-selected and a visible bar.
Inline renaming keeps autofocus, Enter/blur commit and Escape cancellation.
Existing callbacks and create/management/last-plan deletion guards are preserved.

App-owned PilePlanExplorer.css supplies compact layout, scrolling, wrapping,
metadata and space for the three plan actions. Legacy styles exclude shared
fields and filled Blueprint SVGs; the shared components own control states.
Plan action help uses the existing application tooltip portal so hover/focus help
does not enter the explorer scroll area or create a horizontal scrollbar. The
shared IconButtons keep their labels/states; their inline CSS tip is disabled.
No engineering decisions, persisted project operations or preferences change.

## Shared source data viewer

Load-point, CPT and foundation-advice views compose shared Heading, Button,
IconButton, TextField and Status components. Source replacement reuses the shared
SourceFileButton/native file picker, including repeated selection of one file.
The header keeps filename/profile provenance and import-warning counts. Close
and column-filter help use the existing application tooltip portal, retaining
accessible labels without inline tooltip overflow.

The data view remains a feature-owned virtualized grid: the shared Table API
cannot express its row window, interactive headers and selection behavior.
SourceDataViewer.css keeps the same 30 px layout row height and overscan, common
sticky-header/data scroll viewport, body font and left-aligned values. Table,
column-header/cell roles, sort state, total row count and virtual row indices
expose the visible window to assistive technology. Sort cycling, exact/contains
filters, row-selection modifiers, locked/disabled guards, selected-row reveal,
header/Escape clearing and read-only advice rows retain their existing paths.

Each source kind owns a fresh transient view instance, so filters, sorting,
open popovers and scroll state from another source kind cannot hide its data.
Changing the contents of the same source kind retains that view's local state.
Source records, formatting and the source-replacement workflow remain unchanged.

## Shared legend strip

`components/domain/pile-plans/Legend.tsx` uses shared quiet Buttons for selection
and IconButtons for the existing used-only and edit actions. The strip remains a
wrapping, app-owned layout in `Legend.css`; all three encoding modes keep their
existing project colors and pile-symbol renderer, including inactive dots and
warning/strike-through cues. The strip uses body typography, regular action
labels and shared selected/focus tokens. Selection still supports Shift and
excludes locked locations; read-only mode blocks edits, not inspection.

Action and warning tooltips use the application overlay, as in the explorer.
The normal icon sync includes `pile.legend-used`, `pile.legend-edit` and
`status.hidden` without altering the upstream artwork.

## Shared feedback window

`components/template/feedback/FeedbackDialog.tsx` composes the shared native
Dialog, TextField, TextArea, Radio, Button, IconButton, Banner and Heading.
Category and optional contact details stay transient. Closing/reopening
starts a fresh draft; a failed request preserves text and attachment previews.
Submission and close are guarded until an in-flight response is acknowledged.

`app/feedback/feedbackClient.ts` sends multipart data to the public Open Feedback
Studio `/api/feedback` route, using `open-pile-plan-studio` like the website.
The service creates issues in `OpenAEC-Foundation/pile-plan-studio` without user
GitHub authentication. Public disclosure precedes submission; contact fields
are separate from the public message. Only an acknowledged receipt can show
success, and only a validated product issue URL can be opened. A received
submission without an issue link is reported honestly as stored, not published.
Errors distinguish duplicate/rate-limit/rejected/network failures; no auto retry.

Attachments are limited to three PNG/JPEG/GIF/WebP files, 1 MiB total, matching
the API. Paste/file capture uses the same path. Screenshot capture is explicit,
previewed before posting and excludes the feedback window. The existing
html2canvas helper uses browser foreign-object rendering for modern Blueprint
CSS colors and caps capture resolution; it compresses oversized PNGs to JPEG.
Blob URLs are revoked only on removal, successful reset or unmount.
The API transport is shared by browser/Tauri; existing native metadata and
external-link helpers remain the desktop integration points.

## Shared ribbon controls

Visibility toggles keep fixed subject labels (Grid, Tip-level regions, Groups,
Explorer and Properties). Their pressed state communicates visibility; translated
action tooltips explain whether activation will show or hide the subject.


Plan and View use the pinned React `Tabs` component, including roving arrow-key,
Home and End navigation. File remains a command, rendered with the shared primary
`Button`. `RibbonButton` adapts a quiet `Button` to the existing stacked icon and
caption layout; group captions use `MonoLabel`. View uses shared `Button` controls
for foreground selection and editable percentages, and `Slider` for symbol size.
Foreground buttons use the same stacked `RibbonButton` adapter as the other
large actions, with a 24px location marker or reviewed CPT triangle above the text.
Their container follows intrinsic label widths; the tip-region button also grows
to fit long Dutch words instead of overflowing its fixed minimum width.
The numeric editor continues to use the shared number-field proposal.

The app orders its Plan groups as Project, Selection, Load display, Inspect,
Settings, Locking and Optimization. Pile options and CPT inspection use the
property-panel buttons; CPT settings remains a Plan command. Space and Enter stay within the
ribbon so viewer keyboard handlers cannot cancel native button activation;
application shortcuts continue to bubble. Extra help uses the application's
tooltip portal. The overlapping two-handle utilization slider remains local:
the pinned Blueprint slider accepts only one value.

## Shared File menu, project opening and About

`Backstage` composes shared `Button` controls for its mixed navigation/commands,
with `aria-current` on the active page and translated shortcut captions. A scoped
provider supplies the pinned sprite; the reviewed local application gear is retained.
Space/Enter activation and handled Escape stay out of the drawing keyboard
handlers. Import/export, native capability gating and async closing routes are
retained.

Standalone project-opening actions use the session's shared file input or the
desktop picker. The SuperCloud build uses its Docs picker. Start-screen project
cards use Blueprint styles and a separate `IconButton` to remove each entry.
Card dates follow the interface language. `backstage/AboutPanel`
uses `Heading`, `InfoCard` and `Button`, the product icon and existing product
metadata and external-link routes. `BackstageBlueprint.css` owns the layout and
active navigation marker; ordinary control states remain shared.

The recent-project list receives AppSession-owned state and actions. Desktop
entries reference original files; browser entries clearly show a local-copy label
and explain that opened, locally saved and downloaded IFCPP versions are retained.
Reopening and removal use separate keyboard controls. Storage and project validation
remain application operations, independent from the Blueprint presentation.

## Shared viewer controls and action notices

`ViewerFocusButton` composes the shared `Button`, retaining the existing
translated label, selection availability, mouse/click/key isolation and focus
callback. Its stylesheet owns only the top-right placement, minimum width and
shared shadow. It does not change projection, marker geometry or viewport logic.

`ActionNotice` uses the shared `Banner` and pinned sprite: neutral messages map
to info, errors to error, with no generated text prefix. Shared roles provide
polite status and assertive errors. The existing bottom-center placement,
pointer-inert layer, two-line limit, replacement key and motion preferences
remain. AppSession retains its 3500ms dismissal timer; `Toast` is not used
because its built-in five-second timer and persistent errors have a different
contract. A scoped icon-colour rule restores the shared error token where the
pinned Banner's later generic icon selector would otherwise override it.

## Shared property-panel view actions and import worksheets

Selected inspection rows retain a leading border in the two high-contrast themes:
the shared selected background deliberately equals the panel background there.
The marker uses `--oa-selected-bar`, preserves row geometry, and follows each row's
pressed state; ordinary light/dark selection colors are unchanged.

The two labelled property-panel view actions and the combined-view action use
shared compact Buttons. The labelled actions use the reviewed pile-option and
CPT symbols at 16 px. Their mutually exclusive pressed states are also exposed
when no inspection view is active because a task panel is open. Activating a view
closes the task through the existing callback and retains selection context.
The combined-view SVG remains app-owned; its help uses the application tooltip
layer. Enter/Space activation stays within the header, while application shortcuts
can still bubble. Scoped CSS owns only header sizing/wrapping and selected-state
Blueprint tokens, replacing the old custom button appearance.

RFEM coordinate/reaction worksheet choices compose shared Select through
SourceMeaningSelect so the empty prompt remains disabled. Each shared label is
associated with its own field; the existing label/value grid is preserved with
layout-only CSS and stacks at the compact breakpoint. Zero/one-candidate cases
remain plain values. Worksheet names, callbacks and preview/import logic remain
unchanged. The same adapter's retirement criteria apply to these choices.

## Shared column-setting fields

The remaining text and choice fields in `imports/SourceTableEditor`,
`exports/ExportColumnsEditor` and `exports/PileTableSourceEditor` compose shared
`TextField` and `Select`. Existing handlers retain mapping replacement, optional
source choices, numeric column-index conversion, empty strings/null templates,
custom status codes and inherited fieldset disabling. Adjacent template help
uses the shared `help` prop, giving the input an explicit accessible description.
Layout-only export-field wrappers remain; import rows allow shared field frames
to flex beside the existing numeric fields and header checkbox.

The import meaning field uses the small `SourceMeaningSelect` adapter. The pinned
`Select` API does not expose per-option disabling, so the adapter applies only
native `option.disabled` metadata in an idempotent layout effect before paint,
including clearing obsolete flags when the selected column changes. Label,
input, options, IDs and help rendering remain owned by shared `Select`. This
preserves the existing empty-column restrictions and the pile-plan exception
for explicit clearing of assignments/CPT selections without changing vendor code.

## Shared interface icons

Consumers of the pinned Blueprint icons import `studioSprite.ts`. It adds the generated
sprite's content hash from `manifest.json` to the asset URL. This invalidates an
already loaded external SVG document after an icon sync, including during Vite
live updates; newly added symbols must not retain a blank cached reference.
The pinned upstream sprite and React components remain unmodified.

The local pencil, funnel and plus alternatives use `SimpleIconControls.tsx` and
the separately fingerprinted `components/template/icons/simple-controls.svg`.
They retain the shared Button/IconButton components and accessible labels, while
the same pencil serves legend editing and plan renaming. These local drawings
do not alter the pinned upstream artwork (Blueprint issues 82 and 84).

`icons/studio.svg` is generated from the selected 16 and 24 px symbols in the
pinned Blueprint `reports.svg`, `composer.svg`, `standard.svg` and `pile-plan.svg`
sprites. It contains the shared general and pile-plan icons used by the title bar
and both ribbon tabs, plus the File menu and file-type symbols. `icons/studioIcons.ts` lists the selected action IDs. The original symbol markup is
preserved; paths are not redrawn or simplified. `icons/upstream-manifest.json`
records the original sprite hashes, and `manifest.json` records source and
generated hashes. `icons/studioIcons.ts` supplies the matching TypeScript IDs.
All of these files are restored by the same sync command and verified offline.

Title-bar quick actions use the Blueprint template's accent-text colour for
both the primary icon shape and its accent. Disabled history actions retain
their muted colour.

The Plan and View ribbons use the template's text colour for primary shapes and its
accent-text colour for icon details. Selected and disabled icons use one colour.
`PlanRibbon.css` scopes these ribbon styles. Reviewed local domain-icon candidates
live separately in `components/template/icons/pile-plan-proposals.svg`, rendered
through `PilePlanIcon`; they do not overwrite the pinned source. The three domain
settings buttons are horizontal with short subject labels and translated accessible names
and tooltips. The generic application gear is a separate local component and is
excluded from the planned domain-icon PR (Blueprint issue 73). Ribbon groups can scroll horizontally
when the window is narrow; translated labels retain intentional line breaks.

The source icon licence is copied to `icons/LICENSE.md` (LGPL 3 as currently
declared upstream). The final B2 icon licence remains under discussion in
[Blueprint issue 15](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint/issues/15);
this local integration does not resolve that upstream decision.
