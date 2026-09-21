# Native HiGHS and explicit local optimization

Use the existing mathematical model with HiGHS on desktop and microlp in the
browser. Keep the default run limit at ten minutes. A separate local action
computes the constrained cost reference and improves its transitions without
running the spatial MILP. Preserve all budget, configuration, selection and
engineering constraints.

Publish validated incumbent plans only when they improve. Display the best
weighted transition score, solver lower bound and gap during spatial search.
Stopping uses the best validated plan received so far; cancelling discards it.
Never apply results after the project or optimization context changes. Keep
the drawing unchanged during search; live drawing previews are deferred.

Implementation and verification:

1. Add an optional native HiGHS backend, using the same good_lp model. Isolate
   callbacks and interruption in the backend. Check both solvers against the
   existing exhaustive small-problem oracle.
2. Add local run mode and validated progress snapshots in the core. Fix microlp
   resumption so partial node solves are not repeatedly restarted. Test local
   feasibility, incumbent publication and interruption.
3. Extend browser/native transport and the run controller with stop-and-use-best
   distinct from cancellation. Test early stops, stale context and both transports.
4. Add local actions, stop/cancel controls and live score/bound display using
   existing styling and Dutch/English translations. Test contracts and UI state.
5. Run workspace and native tests, frontend tests and browser build, inspect the
   preview, and document native build prerequisites and remaining limitations.

No commits or deployment changes. The original greedy optimizer remains for
comparison. Native and browser differ only in solver capability/performance.


Verification so far: 273 Rust workspace tests pass with microlp and with native
HiGHS; nine Tauri tests pass; 842 frontend tests pass, including generated WASM
snapshots and native stop/cancel races. Browser production build passes. The
browser local action was checked on the 303-location example (score 88, selection
preserved). Native debug build was opened for user verification after automated
window control was stopped by the user. The ten-minute native example is being
checked separately; no live drawing preview is included.
