# ILP warm start and reuse of the current plan

The desktop spatial solver receives a complete feasible MIP start. The core
constructs initial values for assignment, label-usage, tip/size-difference and
joint-difference variables in the same order as the good_lp model. The adapter
explicitly passes these values to HiGHS, because good_lp's `try_into_inner` does
not forward its initial solution. Bounds and objective are not changed.

After obtaining the current constrained cost reference and budget, the core
checks the active plan against every target unit's available options, group
consistency, locks, configuration limits and budget. Missing or invalid target
assignments make that candidate unusable; it is not repaired by dropping units.
If its weighted score is lower than the reference, local improvement starts from
that plan. Otherwise it starts from the reference. The improved result remains
an independently validated fallback and is the desktop solver's MIP start.
The browser also reuses feasible current plans, but microlp cannot accept a MIP
start. Each run still creates a fresh spatial search, not a resumed search tree.

## Verification

- Native test with presolve disabled and zero search nodes: without a start no
  solution is available; with a start HiGHS returns the exact supplied assignment.
- Complete-start tests cover all three global caps, fixed neighbors, locks,
  joint/negative-interaction penalties, omitted zero-weight dimensions and
  fractional user weights. Invalid budgets and starts are rejected.
- Current-plan reuse tests cover missing/inconsistent group assignments, candidate
  filtering, locks, tightened budget and limits.
- Rust workspace tests pass for microlp and HiGHS; frontend tests and browser
  production build pass; Tauri development build succeeds.

## Example check, 21 September 2026

Reused the previous 303-location result with weighted score 36 and cost EUR
227,652 under a EUR 233,305 budget (cost reference EUR 212,096). The first validated
spatial snapshot arrived after 735 ms with score 36. A requested 30-second run
finished after 40.684 seconds because native stopping is cooperative. The final
score remained 36, feasible but not proven optimal; the last reported lower bound
was 25.577465748528182. This checks immediate reuse, not a speedup claim. Local
artifacts: `target/warm-start-previous-plan-{request,result}.json` and
`target/warm-start-previous-plan-progress.jsonl`.

Live drawing previews remain deferred. Improving assignments are already sent
to the interface; a future throttled, transient drawing preview can consume them
without changing project history, dirty state, selection or the active solver's
input. Rendering overhead must still be measured.
