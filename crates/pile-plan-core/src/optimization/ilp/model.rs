use super::{
    linear_model::{variable, Constraint, Expression, Variable, VariableDefinition, Variables},
    solver_contract::IlpSolverModel,
};
use super::{
    prepare::{Neighbor, PreparedIlpProblem},
    validate::MAX_EXACT,
};
use crate::PileConfigurationKey;
use std::collections::BTreeSet;

#[derive(Clone, Copy)]
pub(crate) enum Objective {
    Cost,
    Transitions,
    RelaxCount,
    RelaxAmount(u32),
}
pub(crate) struct BuiltModel {
    pub problem: IlpSolverModel,
    pub choices: Vec<Vec<usize>>,
}
fn label(c: &PileConfigurationKey, kind: usize) -> (i64, i64) {
    match kind {
        0 => (c.pile_tip_level_mm, 0),
        1 => (i64::from(c.pile_size_mm), 0),
        _ => (c.pile_tip_level_mm, i64::from(c.pile_size_mm)),
    }
}
pub(crate) fn build_spatial(
    p: &PreparedIlpProblem,
    budget: u64,
    start_choices: &[usize],
) -> Result<BuiltModel, String> {
    super::validate::validate(p, start_choices, Some(budget))?;
    let start = Some(start_choices);
    build_with_start(p, Objective::Transitions, Some(budget), start)
}
fn binary_with_start(value: Option<bool>) -> VariableDefinition {
    let definition = variable().binary();
    match value {
        Some(v) => definition.initial(u32::from(v)),
        None => definition,
    }
}
pub(crate) fn build(
    p: &PreparedIlpProblem,
    objective: Objective,
    budget: Option<u64>,
) -> Result<BuiltModel, String> {
    build_with_start(p, objective, budget, None)
}
fn build_with_start(
    p: &PreparedIlpProblem,
    objective: Objective,
    budget: Option<u64>,
    start: Option<&[usize]>,
) -> Result<BuiltModel, String> {
    let selected: Option<Vec<_>> = start.map(|choices| {
        p.units
            .iter()
            .zip(choices)
            .map(|(u, &i)| &u.options[i].configuration)
            .collect()
    });
    let max_cost = p
        .units
        .iter()
        .try_fold(0_u64, |acc, u| {
            acc.checked_add(u.options.iter().map(|o| o.total_cost).max().unwrap_or(0))
        })
        .filter(|v| *v <= MAX_EXACT)
        .ok_or("numeric_range_exceeded")?;
    let max_weight = u64::from(p.settings.transition_weights.tip_only_milli)
        + u64::from(p.settings.transition_weights.size_only_milli);
    if max_weight
        .checked_mul(p.edges.len() as u64)
        .is_none_or(|x| x > MAX_EXACT)
        || budget.is_some_and(|v| v > MAX_EXACT)
    {
        return Err("numeric_range_exceeded".into());
    }
    let mut vars = Variables::default();
    let mut constraints: Vec<Constraint> = vec![];
    let x: Vec<Vec<Variable>> = p
        .units
        .iter()
        .enumerate()
        .map(|(unit, u)| {
            u.options
                .iter()
                .enumerate()
                .map(|(option, _)| vars.add(binary_with_start(start.map(|s| s[unit] == option))))
                .collect()
        })
        .collect();
    let mut cost = Expression::from(0.0);
    for (u, xu) in p.units.iter().zip(&x) {
        constraints.push(xu.iter().copied().sum::<Expression>().eq(1));
        for (o, &v) in u.options.iter().zip(xu) {
            cost += o.total_cost as f64 * v;
        }
    }
    if let Some(b) = budget {
        constraints.push(cost.clone().leq(b.min(max_cost) as f64));
    }
    let relax = matches!(objective, Objective::RelaxCount | Objective::RelaxAmount(_));
    let mut relax_count = Expression::from(0.0);
    let mut relax_amount = Expression::from(0.0);
    for (kind, cap) in [
        p.settings.max_pile_tip_levels,
        p.settings.max_pile_sizes,
        p.settings.max_pile_configurations,
    ]
    .into_iter()
    .enumerate()
    {
        let Some(cap) = cap else { continue };
        let labels: BTreeSet<_> = p
            .units
            .iter()
            .flat_map(|u| u.options.iter().map(|o| label(&o.configuration, kind)))
            .chain(p.outside.iter().map(|c| label(c, kind)))
            .collect();
        // A cap covering every available label cannot constrain any assignment.
        // Omit its usage binaries, also in the relaxation models.
        if labels.len() <= cap as usize {
            continue;
        }
        let mut used = Expression::from(0.0);
        for l in &labels {
            let y = vars.add(binary_with_start(selected.as_ref().map(|selected| {
                selected
                    .iter()
                    .copied()
                    .chain(p.outside.iter())
                    .any(|c| label(c, kind) == *l)
            })));
            used += y;
            if p.outside.iter().any(|c| label(c, kind) == *l) {
                constraints.push(Expression::from(y).eq(1));
                continue;
            }
            let mut usage = Expression::from(0.0);
            for (u, xu) in p.units.iter().zip(&x) {
                for (o, &v) in u.options.iter().zip(xu) {
                    if label(&o.configuration, kind) == *l {
                        usage += v;
                        constraints.push((y - v).geq(0));
                    }
                }
            }
            constraints.push((y - usage).leq(0));
        }
        if relax {
            let m = (labels.len() as u32).saturating_sub(cap);
            let delta = vars.add(variable().integer().min(0).max(m));
            let r = vars.add(variable().binary());
            constraints.push((delta - r).geq(0));
            constraints.push((delta - f64::from(m) * r).leq(0));
            constraints.push((used - delta).leq(f64::from(cap)));
            relax_count += r;
            relax_amount += delta;
        } else {
            constraints.push(used.leq(f64::from(cap)));
        }
    }
    if let Objective::RelaxAmount(count) = objective {
        constraints.push(relax_count.clone().eq(f64::from(count)));
    }
    let mut transitions = Expression::from(0.0);
    if matches!(objective, Objective::Transitions) {
        let w = &p.settings.transition_weights;
        for (a, b) in &p.edges {
            let start_differences = selected.as_ref().map(|selected| {
                let left = selected[*a];
                let right = match b {
                    Neighbor::Unit(b) => selected[*b],
                    Neighbor::Fixed(c) => c,
                };
                [
                    label(left, 0) != label(right, 0),
                    label(left, 1) != label(right, 1),
                ]
            });
            for kind in 0..2 {
                let weight = [w.tip_only_milli, w.size_only_milli][kind];
                // An unweighted dimension does not contribute to the additive objective.
                if weight == 0 {
                    continue;
                }
                let d = vars.add(binary_with_start(start_differences.map(|d| d[kind])));
                transitions += f64::from(weight) * d;
                let mut labels: BTreeSet<_> = p.units[*a]
                    .options
                    .iter()
                    .map(|o| label(&o.configuration, kind))
                    .collect();
                match b {
                    Neighbor::Unit(b) => labels.extend(
                        p.units[*b]
                            .options
                            .iter()
                            .map(|o| label(&o.configuration, kind)),
                    ),
                    Neighbor::Fixed(c) => {
                        labels.insert(label(c, kind));
                    }
                }
                for l in labels {
                    let left: Expression = p.units[*a]
                        .options
                        .iter()
                        .zip(&x[*a])
                        .filter(|(o, _)| label(&o.configuration, kind) == l)
                        .map(|(_, v)| *v)
                        .sum();
                    let right: Expression = match b {
                        Neighbor::Unit(b) => p.units[*b]
                            .options
                            .iter()
                            .zip(&x[*b])
                            .filter(|(o, _)| label(&o.configuration, kind) == l)
                            .map(|(_, v)| *v)
                            .sum(),
                        Neighbor::Fixed(c) => {
                            Expression::from(if label(c, kind) == l { 1.0 } else { 0.0 })
                        }
                    };
                    constraints.push((d - left.clone() + right.clone()).geq(0));
                    constraints.push((d + left.clone() - right.clone()).geq(0));
                    constraints.push((d + left + right).leq(2));
                }
            }

        }
    }
    let expression = match objective {
        Objective::Cost => cost,
        Objective::Transitions => transitions,
        Objective::RelaxCount => relax_count,
        Objective::RelaxAmount(_) => relax_amount,
    };
    let problem = sparse_model(&vars, &expression, &constraints, start.is_some())?;
    // Assignment columns precede auxiliary columns, in unit/option order.
    let mut next = 0;
    let choices = x
        .iter()
        .map(|xs| {
            xs.iter()
                .map(|_| {
                    let index = next;
                    next += 1;
                    index
                })
                .collect()
        })
        .collect();
    Ok(BuiltModel { problem, choices })
}
pub(super) fn sparse_model(
    vars: &Variables,
    objective: &Expression,
    constraints: &[Constraint],
    warm: bool,
) -> Result<IlpSolverModel, String> {
    if objective.constant != 0.0 {
        return Err("invalid_solver_model".into());
    }
    let mut result = IlpSolverModel {
        col_cost: vec![0.; vars.0.len()],
        col_lower: vars.0.iter().map(|v| v.min).collect(),
        col_upper: vars.0.iter().map(|v| v.max).collect(),
        row_lower: vec![],
        row_upper: vec![],
        starts: vec![0],
        indices: vec![],
        values: vec![],
        initial_solution: None,
    };
    for (&v, &c) in &objective.terms {
        result.col_cost[v] = c;
    }
    for row in constraints {
        result.row_lower.push(if row.equal {
            -row.expression.constant
        } else {
            f64::NEG_INFINITY
        });
        result.row_upper.push(-row.expression.constant);
        for (&v, &c) in &row.expression.terms {
            if c != 0. {
                result.indices.push(v);
                result.values.push(c);
            }
        }
        result.starts.push(result.indices.len());
    }
    if warm {
        result.initial_solution = Some(
            vars.iter_variables_with_def()
                .map(|(_, v)| {
                    v.get_initial()
                        .ok_or_else(|| "invalid_solver_assignment".to_string())
                })
                .collect::<Result<_, _>>()?,
        );
    }
    Ok(result)
}
impl BuiltModel {
    #[cfg(all(feature = "native-highs", not(target_arch = "wasm32")))]
    pub fn into_native(self) -> Result<(highs::Model, Vec<Vec<usize>>), String> {
        let m = self.problem;
        let mut problem = highs::RowProblem::new();
        let cols: Vec<_> = (0..m.col_cost.len())
            .map(|i| problem.add_integer_column(m.col_cost[i], m.col_lower[i]..=m.col_upper[i]))
            .collect();
        for i in 0..m.row_upper.len() {
            problem.add_row(
                m.row_lower[i]..=m.row_upper[i],
                (m.starts[i]..m.starts[i + 1]).map(|j| (cols[m.indices[j]], m.values[j])),
            );
        }
        let mut native = problem
            .try_optimise(highs::Sense::Minimise)
            .map_err(|_| "solver_error")?;
        if let Some(values) = m.initial_solution {
            native
                .try_set_solution(Some(&values), None, None, None)
                .map_err(|_| "invalid_solver_assignment")?;
        }
        Ok((native, self.choices))
    }
}

#[cfg(all(test, feature = "native-highs", not(target_arch = "wasm32")))]
mod warm_start_tests {
    use super::*;
    use crate::optimization::ilp::{prepare::prepare, types::IlpRunRequest, validate::validate};
    use highs::HighsSolutionStatus;

    #[test]
    fn warm_start_auxiliaries_match_caps_boundaries_and_all_penalty_cases() {
        let request: IlpRunRequest = serde_json::from_str(include_str!(
            "../../../../../tests/fixtures/ilp-contract/request.json"
        ))
        .unwrap();
        let mut p = prepare(&request.input).unwrap();
        let template = p.units[0].options[0].clone();
        let configs: Vec<_> = [(1000, -10_000), (1200, -11_000), (1400, -12_000)]
            .into_iter()
            .map(|(pile_size_mm, pile_tip_level_mm)| PileConfigurationKey {
                pile_size_mm,
                pile_tip_level_mm,
            })
            .collect();
        let mut third = p.units[0].clone();
        third.load_point_ids = vec![3];
        p.units.push(third);
        for unit in &mut p.units {
            unit.options = configs
                .iter()
                .enumerate()
                .map(|(i, c)| {
                    let mut option = template.clone();
                    option.configuration = c.clone();
                    option.total_cost = 10 + i as u64;
                    option
                })
                .collect();
        }
        p.units[2].forced_configuration = Some(configs[1].clone());
        let fixed = PileConfigurationKey {
            pile_size_mm: 1200,
            pile_tip_level_mm: -10_000,
        };
        p.outside.insert(fixed.clone());
        p.edges = vec![
            (0, Neighbor::Unit(1)),
            (1, Neighbor::Unit(2)),
            (0, Neighbor::Fixed(fixed.clone())),
            (1, Neighbor::Fixed(fixed)),
        ];
        p.settings.max_pile_tip_levels = Some(2);
        p.settings.max_pile_sizes = Some(2);
        p.settings.max_pile_configurations = Some(3);
        let choices = vec![0, 1, 1];
        for (tip, size) in [(1000, 1000), (0, 0), (1000, 0), (0, 1000), (250, 750)] {
            p.settings.transition_weights = crate::IlpTransitionWeights {
                tip_only_milli: tip,
                size_only_milli: size,
                legacy_both_milli: None,
            };
            let model = build_spatial(&p, 32, &choices).unwrap();
            let (mut native, columns) = model.into_native().unwrap();
            native.make_quiet();
            native.set_option("presolve", "off");
            native.set_option("mip_max_nodes", 0);
            native.set_option("threads", 1);
            let solved = native.try_solve().unwrap();
            assert_eq!(
                solved.primal_solution_status(),
                HighsSolutionStatus::Feasible
            );
            assert_eq!(solved.objective_value(), 2.0 * (f64::from(tip) + f64::from(size)));
            assert_eq!(
                extract_values(&columns, solved.get_solution().columns()).unwrap(),
                choices
            );
        }
        assert!(build_spatial(&p, 31, &choices).is_err());
        assert!(build_spatial(&p, 32, &[0, 1]).is_err());
        assert!(build_spatial(&p, 32, &[0, 1, 0]).is_err());
        p.settings.max_pile_configurations = Some(2);
        assert!(build_spatial(&p, 32, &choices).is_err());
    }

    #[test]
    fn native_warm_start_is_available_without_searching_any_nodes() {
        let request: IlpRunRequest = serde_json::from_str(include_str!(
            "../../../../../tests/fixtures/ilp-contract/request.json"
        ))
        .unwrap();
        let mut p = prepare(&request.input).unwrap();
        let choices: Vec<_> = p
            .units
            .iter()
            .map(|u| {
                u.options
                    .iter()
                    .position(|o| o.configuration.pile_tip_level_mm == -11_000)
                    .unwrap()
            })
            .collect();
        p.settings.max_pile_tip_levels = Some(1);
        p.settings.max_pile_configurations = Some(1);
        let expected = validate(&p, &choices, Some(22)).unwrap();
        for warm in [false, true] {
            let model = if warm {
                build_spatial(&p, 22, &choices)
            } else {
                build(&p, Objective::Transitions, Some(22))
            }
            .unwrap();
            let (mut native, columns) = model.into_native().unwrap();
            native.make_quiet();
            native.set_option("presolve", "off");
            native.set_option("mip_max_nodes", 0);
            native.set_option("threads", 1);
            let solved = native.try_solve().unwrap();
            if warm {
                assert_eq!(
                    solved.primal_solution_status(),
                    HighsSolutionStatus::Feasible
                );
                assert_eq!(
                    extract_values(&columns, solved.get_solution().columns()).unwrap(),
                    choices
                );
                assert_eq!(solved.objective_value(), expected.score as f64);
            } else {
                assert_ne!(
                    solved.primal_solution_status(),
                    HighsSolutionStatus::Feasible
                );
            }
        }
    }
}
pub(crate) fn extract_values(choices: &[Vec<usize>], values: &[f64]) -> Result<Vec<usize>, String> {
    choices
        .iter()
        .map(|xs| {
            let mut chosen = None;
            for (i, x) in xs.iter().enumerate() {
                let value = *values.get(*x).ok_or("invalid_solver_assignment")?;
                if !value.is_finite()
                    || (value - value.round()).abs() > 1e-6
                    || !(-1e-6..=1.0 + 1e-6).contains(&value)
                {
                    return Err("invalid_solver_assignment".into());
                }
                if value > 0.5 {
                    if chosen.replace(i).is_some() {
                        return Err("invalid_solver_assignment".into());
                    }
                }
            }
            chosen.ok_or_else(|| "invalid_solver_assignment".into())
        })
        .collect()
}
