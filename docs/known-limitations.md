# Known Alpha Limitations

Open Pile Plan Studio is an early testing release. The following limitations are
intentional and should be considered when evaluating its results.

## Engineering Status

- The software and its output have not completed formal engineering validation
  or certification.
- Every pile plan and calculated option must be checked by a qualified
  professional before use in design, procurement, or construction.
- The CPT-selection rules are configurable approximations. Project-specific
  engineering judgement remains necessary.

## Optimization

- The optimizer minimizes cost within configuration limits and can optionally
  reduce neighbor differences within a cost budget. Larger runs may finish
  without proving optimality, and browser and desktop runtimes can differ.
  Quick improve uses local moves and does not prove a global optimum.
- It does not replace manual review of practical pile zones, constructability,
  or local variation.
- The preferred utilization range controls viewer highlighting. Engineering
  option validity remains based on the calculated resistance check. The
  optimizer has a configurable maximum utilization.
- Neighbor coherence can independently weight differences in tip level, pile
  size and pile count per cap. The count term counts mismatching neighbor pairs,
  not the number of distinct cap types across the whole plan or physical cap
  dimensions. Zero disables it; the existing cost budget and locks still apply.
  Older projects and historical results default a missing count weight to zero.
- Load-point grouping combines the automatic distance rule with undoable manual
  group and separation overrides. Manual groups must remain connected in the
  project's Gabriel graph; arbitrary disconnected location sets are rejected.

## Pile-cap proposals

- A compact **Pile cap** control beside the selection's grouping action explores
  one to twenty piles. Minus/plus changes the count and the rotation button turns
  the schematic layout 90 degrees. Returning to the original count removes
  the proposal; Reset restores the original cap too. Selecting another group or
  closing the control retains it.
- Proposals belong to individual pile plans and are saved in IFCPP schema 6,
  recovery and undo/redo. Existing source locations and assignments are retained.
  Ordinary new plans start without proposals; duplicates and optimization
  destinations inherit independent copies of existing proposals.
- The total of the original FEd values is redistributed equally. This does not
  preserve moments or reconstruct load combinations or eccentricity. Cap
  stiffness, pile-group effects, cap footprint, edge distances and structural
  adequacy are not checked. Negative/uplift loads are not supported by this
  force-only preview.
- All hypothetical piles use the union of the original members' effective CPT
  selections. This can be more restrictive than the original per-point checks.
  A member with no selected CPTs prevents an assessed proposal.
- Spacing is schematic and adapts to nearby locations. Members of the same
  proposal may partially overlap to keep external locations clear; symbols
  retain their size and distinct centers. Spacing never increases beyond the
  original spacing. It shrinks to a third of the symbol diameter, or the
  original spacing if that was already smaller. Remaining unavoidable external
  overlap is indicated on hover. The dashed contour is not a physical
  cap boundary.
- Indicative costs use the existing pile-cost catalog and exclude cap costs.
  A changed source group makes its stored proposal inactive instead of silently
  transferring it to another group; inspect an involved member to remove it.
- Optimization honors existing proposals at their current counts by default.
  The explicit **Allow pile counts per cap to change** setting is off by default.
  When enabled, groups and single piles may use checked counts up to the optimizer
  maximum (default 6, adjustable up to 20). The popup allows individual exclusions,
  such as five-pile caps. Existing larger source/proposal counts remain preservation
  options; original groups above 20 are not truncated. Any locked member keeps its cap's effective count and
  configuration fixed. Candidate filters, utilization, configuration limits,
  cost budgets and selection scopes still apply. Source loads/assignments remain
  intact for changed counts; results are per-plan proposals, saved atomically
  with the optimization summary. Alternative counts share the manual proposal's
  equal-force/CPT-union assumptions. No structural cap checks or cap costs enter
  the objective, so the lowest pile cost need not be the lowest foundation cost.
- CSV/XLSX pile export is unavailable for plans containing proposals. Save those
  variants as IFCPP, or use a separate plan without proposals for export.
  Conversion to real source locations and dedicated MCP proposal editing are
  deferred. The Plan ribbon's proposal overview supports selection, centering,
  count/rotation edits, individual Reset and a single undoable Reset all.
  MCP optimization settings expose the same explicit
  count-change flag as the interface.

## Data and Projects

- IFCPP is an evolving alpha project format. Later alpha releases may require
  migrations.
- One IFCPP project can contain multiple pile plans. CPT selections and legend
  appearance mappings remain shared project settings, while active pile sizes
  and pile-tip levels are stored separately for each pile plan.
- Import currently supports CSV and XLSX sources for load points, CPTs, and
  foundation advice.
- RFEM load-point import recognises supported coordinate and reaction headers
  and falls back to the first two worksheets for traditional RFEM exports. The
  profile joins coordinates and reactions by node number.
- RFEM design loads currently use the minimum PZ envelope value, supporting the
  `Min PZ'`, `Min PZ`, and `Min` row variants and the RFEM 6 component-envelope
  layout with two `Pz` rows per node. The latter requires a complete pair and
  ignores per-node extremes and the Dutch/English overall max/min summary,
  including an unlabelled twelve-row summary following the final node's extremes.
  Coordinates and reactions must share one workbook. The RFEM 6 Cartesian
  coordinate layout uses global X/Y in columns I/J, with or without headers.
  Additional support-type tables are ignored; only nodes present in both the
  coordinate and reaction tables are imported. Missing results cannot be
  reconstructed from support definitions.
  Selecting another force component or result rule is not yet supported.
- Empty foundation-advice values are imported as missing data and produce
  warnings.
- CPTs without coordinates are ignored when reconciling foundation advice.
- CPTs with coordinates but no capacities remain available and can cause pile
  options to have status Missing.
- Standard pile-plan tables can update pile assignments and manual CPT
  selections. Legacy `Vergrendeld.xlsx` tables contain pile assignments only;
  rows representing more than one pile are skipped with a warning.
- Pile-plan import matches a validated ID first and then falls back to one
  unique coordinate match within the configured tolerance (1 mm by default).
- Historical Legacy rows are ignored when a more reliable current ID match is
  available. Conflicting equally reliable rows remain skipped with warnings.
- Individual project sources can be refreshed while matched pile assignments
  and manual CPT selections are retained. Load points use a validated ID and
  position match, followed by a unique coordinate fallback. CPTs keep their
  identity by ID even when their position changes; renamed CPTs use the unique
  coordinate fallback.
- When CPT IDs are removed and cannot be matched by position, their existing
  foundation advice is removed as well. Refresh the corresponding foundation
  advice when adding new CPTs or changing the capacity data.

## Platforms and Deferred Features

- The hosted browser demo and Windows x64 desktop package are the supported alpha
  distributions.
- macOS and Linux packages are not provided for this release.
- Browser projects store imported source information, but are not refresh-linked
  to the original files on the user's computer.
