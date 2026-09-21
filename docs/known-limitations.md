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

- The ILP optimizer supports minimum cost within configuration limits and optional
  neighbor-difference minimization within a cost budget. Quick improvement uses
  local moves and does not prove a global optimum.
- It does not replace manual review of practical pile zones, constructability,
  or local variation.
- The preferred utilization range controls viewer highlighting. Engineering
  option validity remains based on the calculated resistance check. The
  optimizer has a configurable maximum utilization.
- Load-point grouping is automatic and distance-based. Manual grouping is not
  available yet.

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


## ILP optimizer

- Desktop uses native HiGHS; the browser uses highs-js in a Worker. Both solve
  the same model and independently validate assignments. Default solver runtime
  is ten minutes. Large spatial problems may still finish without an optimality
  proof. Reference quality and returned-plan quality are shown separately.
- The separate local action computes the constrained cost reference, then performs
  strictly improving single-unit moves within the budget and configuration limits
  for at most five seconds (less if the run deadline is close). It can get stuck
  in a local optimum. The cost-reference computation itself can take longer.
- Solver progress can pause during expensive HiGHS operations. Browser HiGHS is
  single-threaded, as is the current desktop configuration; equal settings do not
  guarantee the same search path or time to an improved solution across builds.
- Progress shows the best validated weighted score, solver lower bound and gap.
  An improved assignment is transferred only when the score improves. The drawing
  shows the best validated spatial solution, updating at most once per second.
  With new-plan output enabled, a single temporary plan appears in the explorer;
  otherwise the current plan is previewed. Before the first spatial solution, the
  original drawing remains visible. Preview plans are only saved on completion or
  stop-and-use-best, and disappear on cancellation or failure.
- Stop and use best plan retains the best validated plan received by the interface.
  Cancel discards all results. Native interruption is cooperative and may wait for
  a callback. The UI continues to show stopping until the solver returns; another
  run cannot start during that wait. Browser interruption terminates the Worker and loses its cached
  reference. Relevant engineering-input changes discard stale results. Selection and zoom
  remain usable; the optimization targets are fixed when the run starts.
  Other plans can be viewed while the destination plan updates in the background.
  Completed results are saved with that plan and restored with the project. Older
  plans have no retrospective optimizer summary. Manual assignment or input changes
  label the saved summary as historical; they do not recalculate its score.
  Preparation, model construction and solver operations can overrun the time limit.
- The cached cost reference is reused across budget/weight/boundary-only changes.
  A new run starts a fresh spatial solve; it does not continue the previous
  spatial search. After calculating the new budget, the current plan is rechecked
  against all current domains, groups, locks, limits and budget. If it is feasible
  and has a lower weighted score than the reference, local improvement starts
  there. Otherwise it starts from the reference. This reuses a previous result
  without retaining the previous solver search tree. In both browser and desktop, that plan is also
  passed to HiGHS as a complete feasible MIP start, including usage and transition
  auxiliary variables. This gives HiGHS an incumbent immediately, but does not
  guarantee faster improvements or an optimality proof. The browser loads an additional bundled solver WASM asset on first use.
  The panel explicitly reports a timeout fallback and
  shows the cost-reference proof separately from the returned pile-plan proof.
- Disabling coherence runs cost optimization only and ignores the saved budget
  and transition weights. With all transition weights zero, the spatial objective
  is already optimal at the cost-reference plan and no spatial solve runs.
- The optional “Skip locations without a valid configuration” setting is saved
  with the project and defaults to off for existing and new projects. Each run
  reassesses the requested locations using current candidates, utilization and
  locks. A group with an empty candidate domain is skipped in full; its existing
  assignments and the user's selection stay unchanged. Results list the skipped
  locations and reasons, including when stopping with the best plan.
- Skipped units act as locations outside the optimization: their existing labels
  count only with whole-plan limits, and valid fixed neighbors contribute only
  when boundary transitions are enabled. The original Gabriel graph is retained.
  Units are never dropped to satisfy global configuration limits or the budget.
  Missing cost data and invalid global input still block execution. If every
  requested unit is unsolvable, no plan is created.
- The old greedy optimizer has been retired. Existing projects remain readable;
  previous assignments and stored outcomes are preserved.
