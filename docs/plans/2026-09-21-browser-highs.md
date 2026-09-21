# HiGHS browser integration and solver cleanup

> Execute inline using the executing-plans skill. No delegation or commits.

**Goal:** use HiGHS on desktop and in the browser; completely remove microlp.
**Spec:** user-approved browser benchmark and integration direction in this task; evidence in `target/highs-browser-probe/rapport.md`.
**Architecture:** Rust owns the common sparse model, initial solution, optimization phases, cache, independent validation and outcomes. Native HiGHS and a synchronous highs-js Worker adapter solve that same model. The WASM boundary invokes the supplied solver callback synchronously, forwarding validated progress through the existing client protocol.
**Stack:** Rust, highs/highs-sys, wasm-bindgen, highs-js 1.15.3, TypeScript, Vite.

## Constraints and decisions

- Preserve current branch, unrelated changes, NL/EN interface, project history and per-plan outcomes.
- Keep stop-and-use-best and cancel as Worker termination in browsers; snapshots retained outside the Worker. No new UI settings.
- Full start vectors include all auxiliary columns; bounds and incumbent status must never imply optimality after timeout.
- good_lp 1.15.3 requires a compiled solver even for modeling. Remove it together with microlp; use a small internal linear-model builder and shared CSR data instead of introducing an unused solver or vendoring a patched dependency.
- Native default builds use HiGHS; WASM receives its backend from JavaScript. Keep the existing native-highs feature as the supported opt-in for core-only builds and native tests.
- Browser adapter handles only solver transport, numeric status, progress throttling and resource lifetime, never engineering decisions.

## Tasks

- [x] 1. Add failing WASM bridge tests (solver invoked, malformed/throwing solver rejected), then shared sparse model and injected solver interface. Preserve all native model and validation tests; prove warm-start vectors against original constraints.
- [x] 2. Add highs-js adapter tests using actual HiGHS for optimal/infeasible/limited solves, warm starts, callbacks and disposal. Install pinned package, bundle WASM as Vite asset, wire into existing Worker, regenerate Rust WASM bindings.
- [x] 3. Remove microlp dependency/backend/probes and obsolete good_lp code; refresh lockfiles, documentation and tests. Update native callback test to shared matrix.
- [x] 4. Run Rust workspace and native tests, frontend suite, browser production build and Tauri check. Browser-check a real run including intermediate results, switching plans, stop-and-retain, cancellation and restart. Review diffs and update this ledger.

## Review focus

- Invalid/nonintegral or incomplete solver values must fail validation, including callback candidates.
- Timeout without a feasible solution must not become solved/optimal; preserve the independently valid fallback.
- Disposal and JS exceptions must not leak native WASM memory or leave active run state stuck.
- Shared Rust phases must retain cost caching, custom candidates, zero weights and configuration-limit diagnosis.
- Removing dependencies must leave both ordinary Rust workspace and browser-only builds supported; no runtime dependence on external CDN files.

## Ledger

- User explicitly requested implementation followed by removal; proceed without another approval round.
- Benchmark confirmed same HiGHS 1.15.1 engine in native library and npm package 1.15.3, callbacks and warm start available.
- Verified the supplied-solver test fails against the old WASM implementation before implementing the bridge. All 13 targeted adapter/WASM tests pass with the actual HiGHS runtime.
- `cargo test --workspace`: 287 tests passed. `npm test`: 875 tests passed. `npm run build`, browser-only core/WASM checks and Tauri `cargo check` succeeded. Production assets include locally bundled HiGHS WASM. Existing large-chunk build warning remains.
- Compared the new numeric model with the saved good_lp benchmark export: identical objective, all variable bounds and all 19,713 constraints across 4,923 variables (ignoring zero coefficients and term order). Local verification script: `target/compare-browser-highs-model.mjs`.
- Authorized browser QA on Sample Project: default 16 tip levels / 4 sizes / 5% budget completed with proven-optimal score 43. With 4 tip levels / 3 sizes / 10% budget, observed live improvement from 88 to 34 while viewing Basisplan. Stop retained score 34 with the correct nonoptimal status. A fresh run after Worker termination produced a live plan; cancelling removed that temporary plan. Selection was preserved. All test plans and setting changes were undone; only the original Basisplan remains and undo is empty.
- Reviewed solver status handling, complete warm starts, callback validation, synchronous closure lifetime and disposal. Native executable was not rebuilt or restarted; native integration was compile-checked and native solver tests passed.
