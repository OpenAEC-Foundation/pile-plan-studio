use super::{
    prepare::{Neighbor, PreparedIlpProblem},
    types::*,
};
use std::collections::BTreeSet;
pub(crate) const MAX_EXACT: u64 = (1_u64 << 53) - 1;
pub(crate) struct ValidatedAssignment {
    pub assignments: Vec<IlpAssignment>,
    pub cost: u64,
    pub counts: IlpCounts,
    pub transitions: IlpTransitionCounts,
    pub score: u64,
}
pub(crate) fn validate(
    p: &PreparedIlpProblem,
    choices: &[usize],
    budget: Option<u64>,
) -> Result<ValidatedAssignment, String> {
    if choices.len() != p.units.len() {
        return Err("invalid_solver_assignment".into());
    }
    let mut cost = 0_u64;
    let mut configs = p.outside.clone();
    let mut assignments = vec![];
    let mut selected = vec![];
    for (u, &choice) in p.units.iter().zip(choices) {
        let o = u.options.get(choice).ok_or("invalid_solver_assignment")?;
        if u.forced_configuration
            .as_ref()
            .is_some_and(|c| c != &o.configuration)
        {
            return Err("lock_violation".into());
        }
        cost = cost
            .checked_add(o.total_cost)
            .filter(|n| *n <= MAX_EXACT)
            .ok_or("numeric_range_exceeded")?;
        configs.insert(o.configuration.clone());
        selected.push(&o.configuration);
        assignments.extend(u.load_point_ids.iter().map(|id| IlpAssignment {
            load_point_id: *id,
            configuration: o.configuration.clone(),
        }));
    }
    if budget.is_some_and(|b| cost > b) {
        return Err("budget_violation".into());
    }
    let counts = IlpCounts {
        configurations: configs.len() as u32,
        tip_levels: configs
            .iter()
            .map(|c| c.pile_tip_level_mm)
            .collect::<BTreeSet<_>>()
            .len() as u32,
        pile_sizes: configs
            .iter()
            .map(|c| c.pile_size_mm)
            .collect::<BTreeSet<_>>()
            .len() as u32,
    };
    for (actual, cap) in [
        (counts.configurations, p.settings.max_pile_configurations),
        (counts.tip_levels, p.settings.max_pile_tip_levels),
        (counts.pile_sizes, p.settings.max_pile_sizes),
    ] {
        if cap.is_some_and(|cap| actual > cap) {
            return Err("configuration_limit_violation".into());
        }
    }
    let mut transitions = IlpTransitionCounts::default();
    for (a, b) in &p.edges {
        let a = selected[*a];
        let b = match b {
            Neighbor::Unit(u) => selected[*u],
            Neighbor::Fixed(c) => c,
        };
        match (
            a.pile_tip_level_mm != b.pile_tip_level_mm,
            a.pile_size_mm != b.pile_size_mm,
        ) {
            (true, true) => transitions.both += 1,
            (true, false) => transitions.tip_only += 1,
            (false, true) => transitions.size_only += 1,
            _ => {}
        }
    }
    let w = &p.settings.transition_weights;
    let score = u64::from(transitions.tip_only) * u64::from(w.tip_only_milli)
        + u64::from(transitions.size_only) * u64::from(w.size_only_milli)
        + u64::from(transitions.both) * (u64::from(w.tip_only_milli) + u64::from(w.size_only_milli));
    if score > MAX_EXACT {
        return Err("numeric_range_exceeded".into());
    }
    Ok(ValidatedAssignment {
        assignments,
        cost,
        counts,
        transitions,
        score,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_partial_overbudget_overlimit_and_lock_violating_assignments() {
        let request: IlpRunRequest = serde_json::from_str(include_str!(
            "../../../../../tests/fixtures/ilp-contract/request.json"
        ))
        .unwrap();
        let mut p = crate::optimization::ilp::prepare::prepare(&request.input).unwrap();
        let choices: Vec<_> = p
            .units
            .iter()
            .map(|u| {
                u.options
                    .iter()
                    .enumerate()
                    .min_by_key(|(_, o)| o.total_cost)
                    .unwrap()
                    .0
            })
            .collect();
        assert_eq!(validate(&p, &choices, None).unwrap().cost, 21);
        assert_eq!(
            validate(&p, &choices[..1], None).err().unwrap(),
            "invalid_solver_assignment"
        );
        assert_eq!(
            validate(&p, &choices, Some(20)).err().unwrap(),
            "budget_violation"
        );
        p.settings.max_pile_tip_levels = Some(1);
        assert_eq!(
            validate(&p, &choices, None).err().unwrap(),
            "configuration_limit_violation"
        );
        p.settings.max_pile_tip_levels = None;
        p.units[0].forced_configuration =
            Some(p.units[0].options[1 - choices[0]].configuration.clone());
        assert_eq!(
            validate(&p, &choices, None).err().unwrap(),
            "lock_violation"
        );
    }
}
