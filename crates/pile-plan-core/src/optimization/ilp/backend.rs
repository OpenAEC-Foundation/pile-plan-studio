use super::{
    model::{extract_values, BuiltModel},
    solver_contract::*,
    types::*,
};
use web_time::Instant;
pub(crate) enum BackendResult {
    Solved { choices: Vec<usize>, optimal: bool },
    Infeasible,
    NoSolution,
    Cancelled,
}
pub(crate) fn solve(
    model: BuiltModel,
    phase: IlpPhase,
    started: Instant,
    deadline: Option<Instant>,
    progress: &mut dyn FnMut(IlpProgress),
    cancelled: &dyn Fn() -> bool,
    solver: &mut Option<&mut dyn IlpSolverBackend>,
) -> Result<BackendResult, String> {
    if cancelled() {
        return Ok(BackendResult::Cancelled);
    }
    let Some(solver) = solver.as_deref_mut() else {
        #[cfg(all(feature = "native-highs", not(target_arch = "wasm32")))]
        return super::highs_backend::solve(model, phase, started, deadline, progress, cancelled);
        #[cfg(not(all(feature = "native-highs", not(target_arch = "wasm32"))))]
        return Err("solver_unavailable".into());
    };
    let remaining = deadline.map(|d| d.saturating_duration_since(Instant::now()).as_secs_f64());
    if remaining == Some(0.0) {
        return Ok(BackendResult::NoSolution);
    }
    let mut invalid = false;
    let finite = |v: Option<f64>| v.filter(|x| x.is_finite() && x.abs() < 1e29);
    let outcome = solver.solve(&model.problem, remaining, &mut |p| {
        let choices = match p.values {
            Some(v) => match validate_values(&model, &v) {
                Ok(c) => Some(c),
                Err(_) => {
                    invalid = true;
                    return;
                }
            },
            None => None,
        };
        progress(IlpProgress {
            diagnostics: vec![],
            phase,
            elapsed_ms: started.elapsed().as_millis() as u64,
            incumbent_objective: finite(p.incumbent_objective),
            best_bound: finite(p.best_bound),
            relative_gap: finite(p.relative_gap),
            best_solution: None,
            choices,
        });
    })?;
    if invalid {
        return Err("invalid_solver_assignment".into());
    }
    if cancelled() {
        return Ok(BackendResult::Cancelled);
    }
    match outcome {
        IlpSolverOutcome::Solved { values, optimal } => Ok(BackendResult::Solved {
            choices: validate_values(&model, &values)?,
            optimal,
        }),
        IlpSolverOutcome::Infeasible => Ok(BackendResult::Infeasible),
        IlpSolverOutcome::NoSolution => Ok(BackendResult::NoSolution),
    }
}
fn validate_values(model: &BuiltModel, values: &[f64]) -> Result<Vec<usize>, String> {
    let m = &model.problem;
    if values.len() != m.col_cost.len() {
        return Err("invalid_solver_assignment".into());
    }
    for (i, &v) in values.iter().enumerate() {
        if !v.is_finite()
            || (v - v.round()).abs() > 1e-6
            || v < m.col_lower[i] - 1e-6
            || v > m.col_upper[i] + 1e-6
        {
            return Err("invalid_solver_assignment".into());
        }
    }
    for i in 0..m.row_upper.len() {
        let value: f64 = (m.starts[i]..m.starts[i + 1])
            .map(|j| m.values[j] * values[m.indices[j]])
            .sum();
        if value < m.row_lower[i] - 1e-5 || value > m.row_upper[i] + 1e-5 {
            return Err("invalid_solver_assignment".into());
        }
    }
    extract_values(&model.choices, values)
}
