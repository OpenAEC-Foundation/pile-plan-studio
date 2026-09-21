use super::{
    backend::{solve, BackendResult},
    model::{build, build_spatial, Objective},
    prepare::{prepare, PreparedIlpProblem},
    solver_contract::IlpSolverBackend,
    types::*,
    validate::{validate, ValidatedAssignment, MAX_EXACT},
};
use std::time::Duration;
use web_time::Instant;

#[derive(Default)]
pub struct IlpOptimizationSession {
    reference: Option<(PreparedIlpProblem, Vec<usize>, IlpCostReference)>,
}
impl IlpOptimizationSession {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn run(
        &mut self,
        request: IlpRunRequest,
        progress: &mut dyn FnMut(IlpProgress),
        cancelled: &dyn Fn() -> bool,
    ) -> IlpOptimizationOutcome {
        self.run_with_solver(request, progress, cancelled, &mut None)
    }
    pub fn run_with_solver(
        &mut self,
        request: IlpRunRequest,
        progress: &mut dyn FnMut(IlpProgress),
        cancelled: &dyn Fn() -> bool,
        solver: &mut Option<&mut dyn IlpSolverBackend>,
    ) -> IlpOptimizationOutcome {
        match self.run_checked(request, progress, cancelled, solver) {
            Ok(o) => o,
            Err(code) => IlpOptimizationOutcome::Failed { code },
        }
    }
    fn run_checked(
        &mut self,
        request: IlpRunRequest,
        progress: &mut dyn FnMut(IlpProgress),
        cancelled: &dyn Fn() -> bool,
        solver: &mut Option<&mut dyn IlpSolverBackend>,
    ) -> Result<IlpOptimizationOutcome, String> {
        let started = Instant::now();
        let deadline = request
            .time_limit_ms
            .map(|ms| started + Duration::from_millis(ms as u64));
        if cancelled() {
            return Ok(IlpOptimizationOutcome::Cancelled);
        }
        if request.time_limit_ms == Some(0) {
            return Ok(IlpOptimizationOutcome::NoSolution {
                phase: IlpPhase::Preparation,
                termination: IlpTermination::TimeLimit,
            });
        }
        progress(IlpProgress {
            diagnostics: vec![],
            phase: IlpPhase::Preparation,
            elapsed_ms: 0,
            incumbent_objective: None,
            best_bound: None,
            relative_gap: None,
            best_solution: None,
            choices: None,
        });
        let p = match prepare(&request.input) {
            Ok(p) => p,
            Err(o) => return Ok(o),
        };
        let mut report = |mut update: IlpProgress| {
            if update.best_solution.is_some() {
                update.diagnostics = p.diagnostics.clone();
            }
            progress(update);
        };
        let progress: &mut dyn FnMut(IlpProgress) = &mut report;
        let weights = &p.settings.transition_weights;
        let needs_spatial = p.settings.optimize_coherence
            && !p.edges.is_empty()
            && (weights.tip_only_milli != 0 || weights.size_only_milli != 0);
        if cancelled() {
            return Ok(IlpOptimizationOutcome::Cancelled);
        }
        // Compare complete canonical content, not only a hash. Spatial-only data is irrelevant.
        let mut key = p.clone();
        key.edges.clear();
        key.diagnostics.clear();
        key.settings.budget_basis_points = 0;
        key.settings.optimize_coherence = true;
        key.settings.transition_weights = IlpTransitionWeights::default();
        let (reference_choices, reference) =
            if let Some((old, choices, reference)) = &self.reference {
                if old == &key {
                    (choices.clone(), reference.clone())
                } else {
                    self.reference = None;
                    (
                        vec![],
                        IlpCostReference {
                            cost: 0,
                            proof: IlpProof::Unknown,
                            termination: IlpTermination::Completed,
                        },
                    )
                }
            } else {
                (
                    vec![],
                    IlpCostReference {
                        cost: 0,
                        proof: IlpProof::Unknown,
                        termination: IlpTermination::Completed,
                    },
                )
            };
        let (reference_choices, reference) = if reference_choices.is_empty() {
            let cost_deadline = if needs_spatial {
                deadline.map(|d| Instant::now() + d.saturating_duration_since(Instant::now()) / 2)
            } else {
                deadline
            };
            let model = build(&p, Objective::Cost, None)?;
            match solve(
                model,
                IlpPhase::CostReference,
                started,
                cost_deadline,
                progress,
                cancelled,
                solver,
            )? {
                BackendResult::Cancelled => return Ok(IlpOptimizationOutcome::Cancelled),
                BackendResult::NoSolution => {
                    return Ok(IlpOptimizationOutcome::NoSolution {
                        phase: IlpPhase::CostReference,
                        termination: IlpTermination::TimeLimit,
                    })
                }
                BackendResult::Infeasible => {
                    return self.diagnose(&p, started, deadline, progress, cancelled, solver)
                }
                BackendResult::Solved { choices, optimal } => {
                    let valid = validate(&p, &choices, None)?;
                    let reference = IlpCostReference {
                        cost: valid.cost,
                        proof: if optimal {
                            IlpProof::Optimal
                        } else {
                            IlpProof::Feasible
                        },
                        termination: if optimal {
                            IlpTermination::Completed
                        } else {
                            IlpTermination::TimeLimit
                        },
                    };
                    self.reference = Some((key, choices.clone(), reference.clone()));
                    (choices, reference)
                }
            }
        } else {
            (reference_choices, reference)
        };
        if !p.settings.optimize_coherence {
            let valid = validate(&p, &reference_choices, Some(reference.cost))?;
            let optimal = reference.proof == IlpProof::Optimal;
            return Ok(result(
                valid,
                reference.cost,
                reference,
                optimal,
                p.diagnostics,
            ));
        }
        let budget = u64::try_from(
            u128::from(reference.cost) * (10_000 + u128::from(p.settings.budget_basis_points))
                / 10_000,
        )
        .ok()
        .filter(|n| *n <= MAX_EXACT)
        .ok_or("numeric_range_exceeded")?;
        if !needs_spatial {
            return Ok(result(
                validate(&p, &reference_choices, Some(budget))?,
                budget,
                reference,
                true,
                p.diagnostics,
            ));
        }
        progress(IlpProgress {
            diagnostics: vec![],
            phase: IlpPhase::Spatial,
            elapsed_ms: started.elapsed().as_millis() as u64,
            incumbent_objective: None,
            best_bound: None,
            relative_gap: None,
            best_solution: None,
            choices: None,
        });
        let now = Instant::now();
        let improvement_time = deadline.map_or(
            Duration::from_millis(if request.local_only { 5000 } else { 500 }),
            |d| {
                (d.saturating_duration_since(now) / 10).min(Duration::from_millis(
                    if request.local_only { 5000 } else { 500 },
                ))
            },
        );
        let seed_choices = super::start_plan::starting_choices(
            &p,
            &reference_choices,
            &request.input.current_assignments,
            budget,
        )?;
        let start_choices = super::start_plan::improve(
            &p,
            seed_choices.clone(),
            budget,
            now + improvement_time,
            cancelled,
        );
        if cancelled() {
            return Ok(IlpOptimizationOutcome::Cancelled);
        }
        let fallback = validate(&p, &start_choices, Some(budget))?;
        let initial = solution(fallback, budget, reference.clone(), false);
        let mut best = initial;
        progress(IlpProgress {
            diagnostics: vec![],
            phase: IlpPhase::Spatial,
            elapsed_ms: started.elapsed().as_millis() as u64,
            incumbent_objective: Some(best.score_milli as f64),
            best_bound: Some(0.0),
            relative_gap: Some(if best.score_milli == 0 { 0.0 } else { 1.0 }),
            best_solution: Some(best.clone()),
            choices: None,
        });
        if cancelled() {
            return Ok(IlpOptimizationOutcome::Cancelled);
        }
        if request.local_only || best.score_milli == 0 {
            best.termination = IlpTermination::Completed;
            if best.score_milli == 0 {
                best.proof = IlpProof::Optimal;
            }
            let mut diagnostics = p.diagnostics;
            if request.local_only {
                diagnostics.push(IlpDiagnostic {
                    code: "local_optimization".into(),
                    load_point_ids: vec![],
                    blocking: false,
                });
            }
            return Ok(IlpOptimizationOutcome::Solved {
                solution: best,
                diagnostics,
            });
        }
        let fallback_code = if start_choices == reference_choices {
            "spatial_reference_fallback"
        } else if start_choices == seed_choices {
            "spatial_current_plan_fallback"
        } else {
            "spatial_improved_start_fallback"
        };
        let model = build_spatial(&p, budget, &start_choices)?;
        let mut improved_by_solver = false;
        let mut invalid_candidate = false;
        let mut lower_bound = 0.0_f64;
        let outcome = solve(
            model,
            IlpPhase::Spatial,
            started,
            deadline,
            &mut |mut update| {
                if let Some(choices) = update.choices.take() {
                    match validate(&p, &choices, Some(budget)) {
                        Ok(valid) if valid.score < best.score_milli => {
                            best = solution(valid, budget, reference.clone(), false);
                            improved_by_solver = true;
                            update.best_solution = Some(best.clone());
                        }
                        Ok(_) => {}
                        Err(_) => invalid_candidate = true,
                    }
                }
                // Report the best validated plan, which can be better than the solver's
                // own incumbent. Bounds and gaps therefore describe that same plan.
                if let Some(bound) = update.best_bound.filter(|b| b.is_finite()) {
                    lower_bound = lower_bound.max(bound).min(best.score_milli as f64);
                }
                update.incumbent_objective = Some(best.score_milli as f64);
                update.best_bound = Some(lower_bound);
                update.relative_gap = Some(if best.score_milli == 0 {
                    0.0
                } else {
                    (best.score_milli as f64 - lower_bound) / best.score_milli as f64
                });
                progress(update);
            },
            cancelled,
            solver,
        )?;
        if invalid_candidate {
            return Err("invalid_solver_assignment".into());
        }
        let optimal = match outcome {
            BackendResult::Cancelled => return Ok(IlpOptimizationOutcome::Cancelled),
            BackendResult::Infeasible => return Err("reference_budget_inconsistency".into()),
            BackendResult::NoSolution => false,
            BackendResult::Solved { choices, optimal } => {
                let valid = validate(&p, &choices, Some(budget))?;
                if optimal && valid.score > best.score_milli {
                    return Err("reference_objective_inconsistency".into());
                }
                if valid.score <= best.score_milli {
                    improved_by_solver = true;
                    best = solution(valid, budget, reference, optimal);
                }
                optimal
            }
        };
        if optimal {
            best.proof = IlpProof::Optimal;
            best.termination = IlpTermination::Completed;
        }
        let mut diagnostics = p.diagnostics;
        if !improved_by_solver {
            diagnostics.push(IlpDiagnostic {
                code: fallback_code.into(),
                load_point_ids: vec![],
                blocking: false,
            });
        }
        Ok(IlpOptimizationOutcome::Solved {
            solution: best,
            diagnostics,
        })
    }
    fn diagnose(
        &self,
        p: &PreparedIlpProblem,
        started: Instant,
        deadline: Option<Instant>,
        progress: &mut dyn FnMut(IlpProgress),
        cancelled: &dyn Fn() -> bool,
        solver: &mut Option<&mut dyn IlpSolverBackend>,
    ) -> Result<IlpOptimizationOutcome, String> {
        let first = solve(
            build(p, Objective::RelaxCount, None)?,
            IlpPhase::LimitDiagnosis,
            started,
            deadline,
            progress,
            cancelled,
            solver,
        )?;
        let (mut choices, mut proven) = match first {
            BackendResult::Solved { choices, optimal } => (choices, optimal),
            BackendResult::Cancelled => return Ok(IlpOptimizationOutcome::Cancelled),
            _ => {
                return Ok(IlpOptimizationOutcome::Infeasible {
                    diagnostics: vec![],
                    proposal: None,
                })
            }
        };
        let mut uncapped = p.clone();
        uncapped.settings.max_pile_tip_levels = None;
        uncapped.settings.max_pile_sizes = None;
        uncapped.settings.max_pile_configurations = None;
        let initial = validate(&uncapped, &choices, None)?;
        let changed = |counts: &IlpCounts| {
            [
                (counts.tip_levels, p.settings.max_pile_tip_levels),
                (counts.pile_sizes, p.settings.max_pile_sizes),
                (counts.configurations, p.settings.max_pile_configurations),
            ]
            .into_iter()
            .filter(|(n, cap)| cap.is_some_and(|cap| *n > cap))
            .count() as u32
        };
        if proven {
            match solve(
                build(p, Objective::RelaxAmount(changed(&initial.counts)), None)?,
                IlpPhase::LimitDiagnosis,
                started,
                deadline,
                progress,
                cancelled,
                solver,
            )? {
                BackendResult::Solved {
                    choices: next,
                    optimal,
                } => {
                    choices = next;
                    proven = optimal;
                }
                BackendResult::Cancelled => return Ok(IlpOptimizationOutcome::Cancelled),
                _ => proven = false,
            }
        }
        let valid = validate(&uncapped, &choices, None)?;
        let increases = IlpCounts {
            tip_levels: p
                .settings
                .max_pile_tip_levels
                .map_or(0, |n| valid.counts.tip_levels.saturating_sub(n)),
            pile_sizes: p
                .settings
                .max_pile_sizes
                .map_or(0, |n| valid.counts.pile_sizes.saturating_sub(n)),
            configurations: p
                .settings
                .max_pile_configurations
                .map_or(0, |n| valid.counts.configurations.saturating_sub(n)),
        };
        Ok(IlpOptimizationOutcome::Infeasible {
            diagnostics: p.diagnostics.clone(),
            proposal: Some(IlpLimitProposal {
                required_limits: valid.counts,
                increases,
                minimality_proven: proven,
                witness: valid.assignments,
            }),
        })
    }
}
fn result(
    valid: ValidatedAssignment,
    budget: u64,
    reference: IlpCostReference,
    optimal: bool,
    diagnostics: Vec<IlpDiagnostic>,
) -> IlpOptimizationOutcome {
    IlpOptimizationOutcome::Solved {
        solution: solution(valid, budget, reference, optimal),
        diagnostics,
    }
}
fn solution(
    valid: ValidatedAssignment,
    budget: u64,
    reference: IlpCostReference,
    optimal: bool,
) -> IlpSolution {
    IlpSolution {
        assignments: valid.assignments,
        cost: valid.cost,
        budget,
        reference,
        counts: valid.counts,
        transitions: valid.transitions,
        score_milli: valid.score,
        proof: if optimal {
            IlpProof::Optimal
        } else {
            IlpProof::Feasible
        },
        termination: if optimal {
            IlpTermination::Completed
        } else {
            IlpTermination::TimeLimit
        },
    }
}
