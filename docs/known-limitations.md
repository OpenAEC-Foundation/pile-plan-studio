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
- Empty foundation-advice values are imported as missing data and produce
  warnings.
- CPTs without coordinates are ignored when reconciling foundation advice.
- CPTs with coordinates but no capacities remain available and can cause pile
  options to have status Missing.

## Platforms and Deferred Features

- The hosted browser demo and Windows x64 desktop package are the supported alpha
  distributions.
- macOS and Linux packages are not provided for this release.
- RFEM load-point import is planned but not included.
- Excel export of currently selected piles is planned but not included.

