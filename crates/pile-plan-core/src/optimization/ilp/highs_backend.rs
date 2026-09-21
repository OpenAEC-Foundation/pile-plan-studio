//! Native-only FFI boundary. The mathematical model stays in `model`.
use super::{
    backend::BackendResult,
    model::{extract_values, BuiltModel},
    types::*,
};
use highs::{HighsModelStatus, HighsSolutionStatus};
use highs_sys::*;
use std::{
    ffi::{c_char, c_int, c_void},
    panic::{catch_unwind, AssertUnwindSafe},
    time::Duration,
};
use web_time::Instant;

struct Callback<'a> {
    choices: &'a [Vec<usize>],
    phase: IlpPhase,
    started: Instant,
    last_report: Instant,
    progress: &'a mut dyn FnMut(IlpProgress),
    cancelled: &'a dyn Fn() -> bool,
    failed: bool,
}

// SAFETY: HiGHS runs synchronously with one thread and parallel solving disabled.
// The boxed context outlives the model and is never accessed while HiGHS runs.
// No borrowed solution buffer escapes the callback and no panic crosses the ABI.
unsafe extern "C" fn callback(
    kind: c_int,
    _: *const c_char,
    out: *const HighsCallbackDataOut,
    input: *mut HighsCallbackDataIn,
    user: *mut c_void,
) {
    let state = &mut *(user as *mut Callback<'_>);
    let action = catch_unwind(AssertUnwindSafe(|| {
        if (state.cancelled)() || state.failed {
            if let Some(input) = input.as_mut() {
                input.user_interrupt = 1;
            }
            return;
        }
        let Some(out) = out.as_ref() else {
            return;
        };
        let improving = kind == kHighsCallbackMipImprovingSolution;
        if !improving && state.last_report.elapsed() < Duration::from_millis(400) {
            return;
        }
        let choices = if improving && !out.mip_solution.is_null() && out.mip_solution_size > 0 {
            let values =
                std::slice::from_raw_parts(out.mip_solution, out.mip_solution_size as usize);
            match extract_values(state.choices, values) {
                Ok(choices) => Some(choices),
                Err(_) => {
                    state.failed = true;
                    return;
                }
            }
        } else {
            None
        };
        let mip =
            improving || kind == kHighsCallbackMipLogging || kind == kHighsCallbackMipInterrupt;
        let finite = |n: f64| (n.is_finite() && n.abs() < 1e29).then_some(n);
        (state.progress)(IlpProgress {
            diagnostics: vec![],
            phase: state.phase,
            elapsed_ms: state.started.elapsed().as_millis() as u64,
            incumbent_objective: if mip {
                finite(out.mip_primal_bound)
            } else {
                None
            },
            best_bound: if mip {
                finite(out.mip_dual_bound)
            } else {
                None
            },
            relative_gap: if mip { finite(out.mip_gap) } else { None },
            best_solution: None,
            choices,
        });
        state.last_report = Instant::now();
    }));
    if action.is_err() || state.failed {
        state.failed = true;
        if let Some(input) = input.as_mut() {
            input.user_interrupt = 1;
        }
    }
}

pub(crate) fn solve(
    model: BuiltModel,
    phase: IlpPhase,
    started: Instant,
    deadline: Option<Instant>,
    progress: &mut dyn FnMut(IlpProgress),
    cancelled: &dyn Fn() -> bool,
) -> Result<BackendResult, String> {
    if cancelled() {
        return Ok(BackendResult::Cancelled);
    }
    let remaining = deadline.map(|d| d.saturating_duration_since(Instant::now()));
    if remaining == Some(Duration::ZERO) {
        return Ok(BackendResult::NoSolution);
    }
    // Obtain the initialized model before constructing the callback context.
    let (native_model, choices) = model.into_native()?;
    let mut context = Box::new(Callback {
        choices: &choices,
        phase,
        started,
        last_report: started,
        progress,
        cancelled,
        failed: false,
    });
    // Declared after context, so even error paths destroy the model first.
    let mut native = native_model;
    native.make_quiet();
    native
        .try_set_option("threads", 1)
        .map_err(|_| "solver_error")?;
    native
        .try_set_option("parallel", "off")
        .map_err(|_| "solver_error")?;
    native
        .try_set_option("mip_rel_gap", 0.0)
        .map_err(|_| "solver_error")?;
    native
        .try_set_option("mip_abs_gap", 0.0)
        .map_err(|_| "solver_error")?;
    if let Some(time) = remaining {
        native
            .try_set_option("time_limit", time.as_secs_f64())
            .map_err(|_| "solver_error")?;
    }
    // SAFETY: pointers refer to a live HiGHS instance and stable boxed context.
    unsafe {
        if Highs_setCallback(
            native.as_mut_ptr(),
            Some(callback),
            (&mut *context as *mut Callback<'_>).cast(),
        ) != STATUS_OK
        {
            return Err("solver_error".into());
        }
        for kind in [
            kHighsCallbackSimplexInterrupt,
            kHighsCallbackIpmInterrupt,
            kHighsCallbackMipImprovingSolution,
            kHighsCallbackMipLogging,
            kHighsCallbackMipInterrupt,
        ] {
            if Highs_startCallback(native.as_mut_ptr(), kind) != STATUS_OK {
                return Err("solver_error".into());
            }
        }
    }
    let solved = native.try_solve().map_err(|_| "solver_error")?;
    if context.failed {
        return Err("solver_callback_error".into());
    }
    if cancelled() {
        return Ok(BackendResult::Cancelled);
    }
    if solved.status() == HighsModelStatus::Infeasible {
        return Ok(BackendResult::Infeasible);
    }
    if solved.primal_solution_status() != HighsSolutionStatus::Feasible {
        return Ok(BackendResult::NoSolution);
    }
    let values = solved.get_solution();
    let candidate = extract_values(&choices, values.columns())?;
    let optimal = solved.status() == HighsModelStatus::Optimal;
    (context.progress)(IlpProgress {
        diagnostics: vec![],
        phase,
        elapsed_ms: started.elapsed().as_millis() as u64,
        incumbent_objective: Some(solved.objective_value()),
        best_bound: solved
            .double_info_value(c"mip_dual_bound")
            .ok()
            .filter(|x| x.is_finite() && x.abs() < 1e29),
        relative_gap: solved
            .double_info_value(c"mip_gap")
            .ok()
            .filter(|x| x.is_finite()),
        best_solution: None,
        choices: Some(candidate.clone()),
    });
    Ok(BackendResult::Solved {
        choices: candidate,
        optimal,
    })
}

#[cfg(test)]
mod tests {
    use super::super::linear_model::{variable, Expression, Variables};
    use super::super::model::sparse_model;
    use super::*;
    use std::cell::Cell;

    #[test]
    fn native_incumbent_callback_can_interrupt_before_solver_completion() {
        let mut vars = Variables::default();
        let pairs: Vec<_> = (0..80)
            .map(|_| (vars.add(variable().binary()), vars.add(variable().binary())))
            .collect();
        let objective: Expression = pairs
            .iter()
            .enumerate()
            .map(|(i, (_, x))| -((i * 71 % 103 + 1) as f64) * *x)
            .sum();
        let weight: Expression = pairs
            .iter()
            .enumerate()
            .map(|(i, (_, x))| ((i * 37 % 89 + 1) as f64) * *x)
            .sum();
        let mut constraints = vec![weight.leq(900)];
        for (off, on) in &pairs {
            constraints.push((*off + *on).eq(1));
        }
        let problem = sparse_model(&vars, &objective, &constraints, false).unwrap();
        let model = BuiltModel {
            problem,
            choices: (0..80).map(|i| vec![2 * i, 2 * i + 1]).collect(),
        };
        let cancel = Cell::new(false);
        let started = Instant::now();
        let outcome = solve(
            model,
            IlpPhase::CostReference,
            started,
            Some(started + Duration::from_secs(5)),
            &mut |p| {
                if let Some(choices) = p.choices {
                    assert_eq!(choices.len(), 80);
                    assert!(choices.iter().all(|&i| i < 2));
                    cancel.set(true);
                }
            },
            &|| cancel.get(),
        )
        .unwrap();
        // The final progress notification comes after the cancellation check;
        // this result therefore proves a live HiGHS callback supplied the plan.
        assert!(cancel.get());
        assert!(matches!(outcome, BackendResult::Cancelled));
    }
}
