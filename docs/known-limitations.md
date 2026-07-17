# Known Alpha Limitations

Pile Plan Studio is an early testing release. The following limitations are
intentional and should be considered when evaluating its results.

## Engineering Status

- The software and its output have not completed formal engineering validation
  or certification.
- Every pile plan and calculated option must be checked by a qualified
  professional before use in design, procurement, or construction.
- The CPT-selection rules are configurable approximations. Project-specific
  engineering judgement remains necessary.

## Optimization

- The current optimizer is a greedy heuristic.
- It can reduce cost and configuration variety, but does not guarantee a global
  optimum.
- It does not replace manual review of practical pile zones, constructability,
  or local variation.

## Data and Projects

- IFCPP is an evolving alpha project format. Later alpha releases may require
  migrations.
- Import currently supports CSV and XLSX sources for load points, CPTs, and
  foundation advice.
- RFEM load-point import recognises supported coordinate and reaction headers
  and falls back to the first two worksheets for traditional RFEM exports. The
  profile joins coordinates and reactions by node number.
- RFEM design loads currently use the minimum PZ envelope value, supporting the
  `Min PZ'`, `Min PZ`, and `Min` row variants. Selecting another force component
  or result rule is not yet supported.
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
  and manual CPT selections are retained. Matching uses validated IDs first and
  a unique coordinate fallback second.
- When the CPT source changes, refresh the corresponding foundation advice as
  well. Otherwise capacities for unmatched CPTs and related pile configurations
  can be temporarily unavailable.

## Platforms and Deferred Features

- The hosted browser demo and Windows x64 desktop package are the supported alpha
  distributions.
- macOS and Linux packages are not provided for this release.
- Browser projects store imported source information, but are not refresh-linked
  to the original files on the user's computer.

