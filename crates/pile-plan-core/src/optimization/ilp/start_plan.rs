use super::{
    prepare::{Neighbor, PreparedIlpProblem},
    types::IlpTransitionWeights,
};
use crate::PileConfigurationKey;
use std::collections::{BTreeMap, HashMap};
use web_time::Instant;

pub(crate) fn starting_choices(
    p: &PreparedIlpProblem,
    reference: &[usize],
    current: &HashMap<u32, PileConfigurationKey>,
    budget: u64,
) -> Result<Vec<usize>, String> {
    let reference_score = super::validate::validate(p, reference, Some(budget))?.score;
    let existing: Option<Vec<_>> = p
        .units
        .iter()
        .map(|unit| {
            let configuration = current.get(&unit.load_point_ids[0])?;
            if !unit
                .load_point_ids
                .iter()
                .all(|id| current.get(id) == Some(configuration))
            {
                return None;
            }
            unit.options
                .iter()
                .position(|option| &option.configuration == configuration)
        })
        .collect();
    if let Some(choices) = existing {
        if super::validate::validate(p, &choices, Some(budget))
            .is_ok_and(|valid| valid.score < reference_score)
        {
            return Ok(choices);
        }
    }
    Ok(reference.to_vec())
}

pub(crate) fn improve(
    p: &PreparedIlpProblem,
    mut choices: Vec<usize>,
    budget: u64,
    deadline: Instant,
    cancelled: &dyn Fn() -> bool,
) -> Vec<usize> {
    // Only strictly improving single-unit moves. This supplies a feasible fallback,
    // never an optimality proof, and never changes the cached cost reference.
    let mut tips = BTreeMap::new();
    let mut sizes = BTreeMap::new();
    let mut configs = BTreeMap::new();
    let mut cost = 0;
    for c in p.outside.iter().chain(
        p.units
            .iter()
            .zip(&choices)
            .map(|(u, &i)| &u.options[i].configuration),
    ) {
        add(&mut tips, c.pile_tip_level_mm);
        add(&mut sizes, c.pile_size_mm);
        add(&mut configs, c.clone());
    }
    for (u, &i) in p.units.iter().zip(&choices) {
        cost += u.options[i].total_cost;
    }
    let mut neighbors = vec![vec![]; p.units.len()];
    for (a, b) in &p.edges {
        neighbors[*a].push(b.clone());
        if let Neighbor::Unit(b) = b {
            neighbors[*b].push(Neighbor::Unit(*a));
        }
    }
    loop {
        let mut best = None;
        let mut best_gain = 0_i64;
        for (u, unit) in p.units.iter().enumerate() {
            if cancelled() || Instant::now() >= deadline {
                return choices;
            }
            if unit.forced_configuration.is_some() {
                continue;
            }
            let old = &unit.options[choices[u]];
            for (i, option) in unit.options.iter().enumerate() {
                let next_cost = cost - old.total_cost + option.total_cost;
                let a = &old.configuration;
                let b = &option.configuration;
                if i == choices[u]
                    || next_cost > budget
                    || !allows(
                        &tips,
                        &a.pile_tip_level_mm,
                        &b.pile_tip_level_mm,
                        p.settings.max_pile_tip_levels,
                    )
                    || !allows(
                        &sizes,
                        &a.pile_size_mm,
                        &b.pile_size_mm,
                        p.settings.max_pile_sizes,
                    )
                    || !allows(&configs, a, b, p.settings.max_pile_configurations)
                {
                    continue;
                }
                let gain: i64 = neighbors[u]
                    .iter()
                    .map(|neighbor| {
                        let c = match neighbor {
                            Neighbor::Unit(v) => &p.units[*v].options[choices[*v]].configuration,
                            Neighbor::Fixed(c) => c,
                        };
                        penalty(a, c, &p.settings.transition_weights)
                            - penalty(b, c, &p.settings.transition_weights)
                    })
                    .sum();
                if gain > best_gain {
                    best_gain = gain;
                    best = Some((u, i, next_cost));
                }
            }
        }
        let Some((u, i, next_cost)) = best else {
            return choices;
        };
        if cancelled() || Instant::now() >= deadline {
            return choices;
        }
        let old = &p.units[u].options[choices[u]].configuration;
        let new = &p.units[u].options[i].configuration;
        replace(&mut tips, old.pile_tip_level_mm, new.pile_tip_level_mm);
        replace(&mut sizes, old.pile_size_mm, new.pile_size_mm);
        replace(&mut configs, old.clone(), new.clone());
        choices[u] = i;
        cost = next_cost;
    }
}
fn penalty(a: &PileConfigurationKey, b: &PileConfigurationKey, w: &IlpTransitionWeights) -> i64 {
    i64::from(a.pile_tip_level_mm != b.pile_tip_level_mm) * i64::from(w.tip_only_milli)
        + i64::from(a.pile_size_mm != b.pile_size_mm) * i64::from(w.size_only_milli)
}
fn allows<T: Ord>(counts: &BTreeMap<T, u32>, old: &T, new: &T, cap: Option<u32>) -> bool {
    old == new
        || cap.is_none_or(|cap| {
            counts.len() - usize::from(counts.get(old) == Some(&1))
                + usize::from(!counts.contains_key(new))
                <= cap as usize
        })
}
fn add<T: Ord>(counts: &mut BTreeMap<T, u32>, value: T) {
    *counts.entry(value).or_default() += 1;
}
fn replace<T: Ord>(counts: &mut BTreeMap<T, u32>, old: T, new: T) {
    let count = counts.get_mut(&old).expect("selected label is counted");
    *count -= 1;
    if *count == 0 {
        counts.remove(&old);
    }
    add(counts, new);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::optimization::ilp::{prepare::prepare, types::IlpRunRequest, validate::validate};
    use std::time::Duration;

    #[test]
    fn reuses_better_current_plan_only_when_every_target_is_feasible() {
        let request: IlpRunRequest = serde_json::from_str(include_str!(
            "../../../../../tests/fixtures/ilp-contract/request.json"
        ))
        .unwrap();
        let p = prepare(&request.input).unwrap();
        let a = p.units[0]
            .options
            .iter()
            .position(|o| o.total_cost == 10)
            .unwrap();
        let b = 1 - a;
        let reference = vec![a, 0];
        let current = HashMap::from([
            (1, p.units[0].options[b].configuration.clone()),
            (2, p.units[1].options[0].configuration.clone()),
        ]);
        assert_eq!(
            starting_choices(&p, &reference, &current, 22).unwrap(),
            vec![b, 0]
        );
        assert_eq!(
            starting_choices(&p, &reference, &current, 21).unwrap(),
            reference
        );
        let mut partial = current.clone();
        partial.remove(&2);
        assert_eq!(
            starting_choices(&p, &reference, &partial, 22).unwrap(),
            reference
        );
        let mut grouped = p.clone();
        grouped.units[0].load_point_ids.push(3);
        assert_eq!(
            starting_choices(&grouped, &reference, &current, 40).unwrap(),
            reference
        );
        partial.insert(2, current[&2].clone());
        partial.insert(3, p.units[0].options[a].configuration.clone());
        assert_eq!(
            starting_choices(&grouped, &reference, &partial, 40).unwrap(),
            reference
        );
        let mut locked = p.clone();
        locked.units[0].forced_configuration = Some(p.units[0].options[a].configuration.clone());
        assert_eq!(
            starting_choices(&locked, &reference, &current, 22).unwrap(),
            reference
        );
        let mut filtered = p.clone();
        filtered.units[0].options = vec![p.units[0].options[a].clone()];
        assert_eq!(
            starting_choices(&filtered, &[0, 0], &current, 22).unwrap(),
            vec![0, 0]
        );
        let worse = HashMap::from([
            (1, p.units[0].options[a].configuration.clone()),
            (2, current[&2].clone()),
        ]);
        let mut capped = p.clone();
        capped.settings.max_pile_tip_levels = Some(1);
        assert_eq!(
            starting_choices(&capped, &[b, 0], &worse, 22).unwrap(),
            vec![b, 0]
        );
    }

    #[test]
    fn fixed_neighbors_and_outside_labels_respect_each_global_cap() {
        let request: IlpRunRequest = serde_json::from_str(include_str!(
            "../../../../../tests/fixtures/ilp-contract/request.json"
        ))
        .unwrap();
        let mut p = prepare(&request.input).unwrap();
        p.units.truncate(1);
        let old = p.units[0]
            .options
            .iter()
            .position(|o| o.total_cost == 10)
            .unwrap();
        let new = 1 - old;
        p.units[0].options[new].configuration.pile_size_mm = 2000;
        p.outside
            .insert(p.units[0].options[old].configuration.clone());
        p.edges = vec![(
            0,
            Neighbor::Fixed(p.units[0].options[new].configuration.clone()),
        )];
        let run = |p: &PreparedIlpProblem| {
            improve(
                p,
                vec![old],
                11,
                Instant::now() + Duration::from_secs(1),
                &|| false,
            )
        };
        assert_eq!(run(&p), vec![new]);
        for kind in 0..3 {
            let mut capped = p.clone();
            match kind {
                0 => capped.settings.max_pile_tip_levels = Some(1),
                1 => capped.settings.max_pile_sizes = Some(1),
                _ => capped.settings.max_pile_configurations = Some(1),
            };
            assert_eq!(run(&capped), vec![old]);
        }
    }

    #[test]
    fn reduces_transitions_without_crossing_budget_locks_or_deadline() {
        let request: IlpRunRequest = serde_json::from_str(include_str!(
            "../../../../../tests/fixtures/ilp-contract/request.json"
        ))
        .unwrap();
        let mut p = prepare(&request.input).unwrap();
        let initial: Vec<_> = p
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
        let run = |p: &PreparedIlpProblem, budget| {
            improve(
                p,
                initial.clone(),
                budget,
                Instant::now() + Duration::from_secs(1),
                &|| false,
            )
        };
        let improved = validate(&p, &run(&p, 22), Some(22)).unwrap();
        assert_eq!(improved.cost, 22);
        assert_eq!(improved.score, 0);
        assert_eq!(run(&p, 21), initial);
        assert_eq!(
            improve(&p, initial.clone(), 22, Instant::now(), &|| false),
            initial
        );
        assert_eq!(
            improve(
                &p,
                initial.clone(),
                22,
                Instant::now() + Duration::from_secs(1),
                &|| true
            ),
            initial
        );
        p.units[0].forced_configuration =
            Some(p.units[0].options[initial[0]].configuration.clone());
        assert_eq!(run(&p, 22), initial);
    }
}
