use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PileOptionTechnicalStatus {
    Valid,
    MissingCapacityData,
    InsufficientCapacity,
}

pub fn pile_option_technical_status(
    is_option: bool,
    utilization: Option<f64>,
    missing_cpt_ids: &[u32],
) -> PileOptionTechnicalStatus {
    if !missing_cpt_ids.is_empty() || utilization.is_none() {
        PileOptionTechnicalStatus::MissingCapacityData
    } else if is_option {
        PileOptionTechnicalStatus::Valid
    } else {
        PileOptionTechnicalStatus::InsufficientCapacity
    }
}

#[cfg(test)]
mod tests {
    use super::{pile_option_technical_status, PileOptionTechnicalStatus};

    #[test]
    fn classifies_complete_valid_option_as_valid() {
        assert_eq!(
            pile_option_technical_status(true, Some(0.80), &[]),
            PileOptionTechnicalStatus::Valid,
        );
    }

    #[test]
    fn missing_capacity_takes_precedence_over_partial_overutilization() {
        assert_eq!(
            pile_option_technical_status(false, Some(1.20), &[8]),
            PileOptionTechnicalStatus::MissingCapacityData,
        );
    }

    #[test]
    fn classifies_complete_overutilized_option_as_insufficient() {
        assert_eq!(
            pile_option_technical_status(false, Some(1.01), &[]),
            PileOptionTechnicalStatus::InsufficientCapacity,
        );
    }

    #[test]
    fn missing_utilization_is_missing_even_without_a_concrete_cpt_id() {
        assert_eq!(
            pile_option_technical_status(false, None, &[]),
            PileOptionTechnicalStatus::MissingCapacityData,
        );
    }
}
