use crate::model::{
    BearingCapacity, Cpt, LoadPoint, PileConfiguration, PileOption, PileOptionInput,
};

pub fn calculate_pile_option(
    load_point: &LoadPoint,
    selected_cpts: &[Cpt],
    bearing_capacities: &[BearingCapacity],
    configuration: &PileConfiguration,
    pile_count: u32,
    max_utilization: f64,
) -> Option<PileOption> {
    if selected_cpts.is_empty() || pile_count == 0 {
        return None;
    }

    let mut governing_cpt_id = None;
    let mut governing_capacity = u32::MAX;

    for cpt in selected_cpts {
        let capacity = bearing_capacities
            .iter()
            .find(|capacity| {
                capacity.cpt_id == cpt.id && capacity.configuration == *configuration
            })?
            .value;

        if capacity < governing_capacity {
            governing_capacity = capacity;
            governing_cpt_id = Some(cpt.id.clone());
        }
    }

    let total_capacity = governing_capacity.checked_mul(pile_count)?;
    if total_capacity == 0 {
        return None;
    }

    let utilization = load_point.design_load / total_capacity as f64;
    if utilization > max_utilization {
        return None;
    }

    Some(PileOption {
        configuration: configuration.clone(),
        pile_count,
        governing_cpt_id: governing_cpt_id.expect("selected CPTs are not empty"),
        governing_capacity,
        total_capacity,
        utilization,
    })
}

pub fn find_pile_options(
    load_point: &LoadPoint,
    selected_cpts: &[Cpt],
    bearing_capacities: &[BearingCapacity],
    option_inputs: &[PileOptionInput],
    max_utilization: f64,
) -> Vec<PileOption> {
    option_inputs
        .iter()
        .filter_map(|input| {
            calculate_pile_option(
                load_point,
                selected_cpts,
                bearing_capacities,
                &input.configuration,
                input.pile_count,
                max_utilization,
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn load_point(design_load: f64) -> LoadPoint {
        LoadPoint {
            id: "LP-1".to_string(),
            x: 0.0,
            y: 0.0,
            design_load,
        }
    }

    fn cpt(id: &str) -> Cpt {
        Cpt { id: id.to_string() }
    }

    fn config() -> PileConfiguration {
        PileConfiguration {
            tip_level_mm: -10_000,
            diameter_mm: 220,
        }
    }

    fn capacity(cpt_id: &str, value: u32) -> BearingCapacity {
        BearingCapacity {
            cpt_id: cpt_id.to_string(),
            configuration: config(),
            value,
        }
    }

    #[test]
    fn returns_valid_option_when_all_selected_cpts_have_capacity() {
        let option = calculate_pile_option(
            &load_point(300.0),
            &[cpt("CPT-1"), cpt("CPT-2")],
            &[capacity("CPT-1", 400), capacity("CPT-2", 350)],
            &config(),
            1,
            1.0,
        )
        .expect("option should be valid");

        assert_eq!("CPT-2", option.governing_cpt_id);
        assert_eq!(350, option.governing_capacity);
        assert_eq!(350, option.total_capacity);
        assert_eq!(300.0 / 350.0, option.utilization);
    }

    #[test]
    fn rejects_option_when_selected_cpt_has_no_capacity_for_configuration() {
        let option = calculate_pile_option(
            &load_point(100.0),
            &[cpt("CPT-1"), cpt("CPT-2")],
            &[capacity("CPT-1", 400)],
            &config(),
            1,
            1.0,
        );

        assert!(option.is_none());
    }

    #[test]
    fn pile_count_increases_total_capacity_linearly() {
        let option = calculate_pile_option(
            &load_point(600.0),
            &[cpt("CPT-1"), cpt("CPT-2")],
            &[capacity("CPT-1", 400), capacity("CPT-2", 350)],
            &config(),
            2,
            1.0,
        )
        .expect("option should be valid");

        assert_eq!(700, option.total_capacity);
        assert_eq!(600.0 / 700.0, option.utilization);
    }

    #[test]
    fn rejects_option_above_max_utilization() {
        let option = calculate_pile_option(
            &load_point(351.0),
            &[cpt("CPT-1")],
            &[capacity("CPT-1", 350)],
            &config(),
            1,
            1.0,
        );

        assert!(option.is_none());
    }

    #[test]
    fn finds_all_valid_options_from_candidate_inputs() {
        let inputs = vec![
            PileOptionInput {
                configuration: config(),
                pile_count: 1,
            },
            PileOptionInput {
                configuration: config(),
                pile_count: 2,
            },
        ];

        let options = find_pile_options(
            &load_point(500.0),
            &[cpt("CPT-1"), cpt("CPT-2")],
            &[capacity("CPT-1", 400), capacity("CPT-2", 350)],
            &inputs,
            1.0,
        );

        assert_eq!(1, options.len());
        assert_eq!(2, options[0].pile_count);
    }
}
