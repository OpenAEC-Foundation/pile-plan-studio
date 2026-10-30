use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::{
    foundation_advice::{
        grouped_bearing_capacity_rows, CptBearingCapacityRow, FoundationAdviceIndex,
    },
    pile_configuration_options_with_tension, PileConfigurationOption,
};
use crate::{
    cpt_selection::{select_cpts, CptSelectionSettings, SelectedCpt},
    source_data::{BearingCapacity, Cpt, LoadPoint},
    InvalidPileTipLevels,
};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct PileOptionAnalysisResult {
    pub pile_options_by_load_point: HashMap<u32, Vec<PileConfigurationOption>>,
    pub selected_cpts_by_load_point: HashMap<u32, Vec<SelectedCpt>>,
    pub cpt_frd_rows_by_cpt_id: Option<HashMap<u32, Vec<CptBearingCapacityRow>>>,
}

pub fn build_pile_option_analysis(
    load_points: &[LoadPoint],
    cpts: &[Cpt],
    bearing_capacities: &[BearingCapacity],
    settings_by_load_point: impl Fn(&LoadPoint) -> CptSelectionSettings,
    manual_cpt_ids_by_load_point: &HashMap<u32, Vec<u32>>,
    include_cpt_frd_rows: bool,
) -> Result<PileOptionAnalysisResult, InvalidPileTipLevels> {
    build_pile_option_analysis_for_groups(load_points,cpts,bearing_capacities,settings_by_load_point,manual_cpt_ids_by_load_point,include_cpt_frd_rows,&[])
}

pub fn calculate_pile_option_analysis(request: &crate::PileOptionAnalysisRequest) -> Result<PileOptionAnalysisResult, InvalidPileTipLevels> {
    let groups = request.grouping_settings.as_ref().map(|settings|crate::derive_load_point_groups(
        request.grouping_load_points.as_deref().unwrap_or(&request.load_points), settings).groups).unwrap_or_default();
    build_pile_option_analysis_for_groups(&request.load_points,&request.cpts,&request.bearing_capacities,
        |p|request.settings_by_load_point.get(&p.id).unwrap_or(&request.global_settings).clone(),
        &request.manual_cpt_ids_by_load_point,request.include_cpt_frd_rows,&groups)
}

pub fn build_pile_option_analysis_for_groups(
    load_points: &[LoadPoint],
    cpts: &[Cpt],
    bearing_capacities: &[BearingCapacity],
    settings_by_load_point: impl Fn(&LoadPoint) -> CptSelectionSettings,
    manual_cpt_ids_by_load_point: &HashMap<u32, Vec<u32>>,
    include_cpt_frd_rows: bool,
    groups: &[crate::LoadPointGroup],
) -> Result<PileOptionAnalysisResult, InvalidPileTipLevels> {
    let counts: HashMap<_,_> = groups.iter().flat_map(|g| g.load_point_ids.iter().map(|id|(*id,g.load_point_ids.len() as u32))).collect();
    let advice = FoundationAdviceIndex::new(bearing_capacities)?;
    let mut pile_options_by_load_point = HashMap::new();
    let mut selected_cpts_by_load_point = HashMap::new();

    for load_point in load_points {
        let settings = settings_by_load_point(load_point);
        let selections = select_cpts(
            load_point,
            cpts,
            &settings,
            manual_cpt_ids_by_load_point
                .get(&load_point.id)
                .map(Vec::as_slice),
        );
        let options = pile_configuration_options_with_tension(
            load_point.design_load_kn,
            &load_point.tension,
            &selections,
            &advice,
            counts.get(&load_point.id).copied().unwrap_or(1),
        );
        selected_cpts_by_load_point.insert(load_point.id, selections);
        pile_options_by_load_point.insert(load_point.id, options);
    }

    Ok(PileOptionAnalysisResult {
        pile_options_by_load_point,
        selected_cpts_by_load_point,
        cpt_frd_rows_by_cpt_id: include_cpt_frd_rows
            .then(|| grouped_bearing_capacity_rows(bearing_capacities)),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CptSelectionAlgorithm, PileOptionTechnicalStatus};

    #[test]
    fn batches_selection_options_and_optional_advice_rows() {
        let loads = vec![LoadPoint {
            id: 1,
            name: "Load point 1".into(),
            x_mm: 0.0,
            y_mm: 0.0,
            design_load_kn: 600.0,
            tension: Default::default(),
        }];
        let cpts = vec![Cpt {
            id: 11,
            name: "CPT 11".into(),
            x_mm: 100.0,
            y_mm: 100.0,
        }];
        let rows = vec![BearingCapacity {
                pile_count: None,
                missing: false,
            cpt_id: 11,
            pile_tip_level_m: -18.0,
            pile_size_mm: 320,
            frd_kn: 700.0,
            direction: Default::default(),
        }];
        let settings = CptSelectionSettings {
            algorithm: CptSelectionAlgorithm::Quadrants,
            max_distance_m: 25.0,
            monopoly_distance_m: 1.0,
            max_angle_degrees: 120.0,
        };

        let result = build_pile_option_analysis(
            &loads,
            &cpts,
            &rows,
            |_| settings.clone(),
            &HashMap::new(),
            true,
        )
        .unwrap();

        assert_eq!(result.selected_cpts_by_load_point[&1][0].cpt.id, 11);
        assert_eq!(
            result.pile_options_by_load_point[&1][0].technical_status,
            PileOptionTechnicalStatus::Valid
        );
        assert_eq!(result.cpt_frd_rows_by_cpt_id.unwrap()[&11].len(), 1);
    }
}
