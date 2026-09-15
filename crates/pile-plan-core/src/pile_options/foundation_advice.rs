use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::{
    pile_configuration::PileConfigurationKey, pile_tip_levels::validate_pile_tip_level_values,
    source_data::BearingCapacity, InvalidPileTipLevels,
};

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct AvailablePileConfiguration {
    pub key: PileConfigurationKey,
    pub pile_tip_level_m: f64,
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct CapacityKey {
    cpt_id: u32,
    pile_size_mm: u32,
    pile_tip_level_mm: i64,
}

pub(crate) struct FoundationAdviceIndex<'a> {
    configurations: Vec<AvailablePileConfiguration>,
    capacities: HashMap<CapacityKey, &'a BearingCapacity>,
}

impl<'a> FoundationAdviceIndex<'a> {
    pub(crate) fn new(rows: &'a [BearingCapacity]) -> Result<Self, InvalidPileTipLevels> {
        let tip_level_keys =
            validate_pile_tip_level_values(rows.iter().map(|capacity| capacity.pile_tip_level_m))?;
        let mut seen = HashSet::new();
        let mut configurations = rows
            .iter()
            .zip(&tip_level_keys)
            .filter_map(|(capacity, &pile_tip_level_mm)| {
                let key = PileConfigurationKey {
                    pile_size_mm: capacity.pile_size_mm,
                    pile_tip_level_mm,
                };
                seen.insert(key.clone())
                    .then_some(AvailablePileConfiguration {
                        key,
                        pile_tip_level_m: capacity.pile_tip_level_m,
                    })
            })
            .collect::<Vec<_>>();
        configurations.sort_by(|left, right| {
            left.key
                .pile_size_mm
                .cmp(&right.key.pile_size_mm)
                .then_with(|| right.key.pile_tip_level_mm.cmp(&left.key.pile_tip_level_mm))
                .then_with(|| right.pile_tip_level_m.total_cmp(&left.pile_tip_level_m))
        });
        let capacities = rows
            .iter()
            .zip(tip_level_keys)
            .map(|(capacity, pile_tip_level_mm)| {
                (
                    CapacityKey {
                        cpt_id: capacity.cpt_id,
                        pile_size_mm: capacity.pile_size_mm,
                        pile_tip_level_mm,
                    },
                    capacity,
                )
            })
            .collect();
        Ok(Self {
            configurations,
            capacities,
        })
    }

    pub(crate) fn configurations(&self) -> &[AvailablePileConfiguration] {
        &self.configurations
    }

    pub(crate) fn capacity(
        &self,
        cpt_id: u32,
        configuration: &PileConfigurationKey,
    ) -> Option<&'a BearingCapacity> {
        self.capacities
            .get(&CapacityKey {
                cpt_id,
                pile_size_mm: configuration.pile_size_mm,
                pile_tip_level_mm: configuration.pile_tip_level_mm,
            })
            .copied()
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct CptBearingCapacityRow {
    pub pile_size_mm: u32,
    pub pile_tip_level_m: f64,
    pub frd_kn: f64,
}

pub(crate) fn grouped_bearing_capacity_rows(
    rows: &[BearingCapacity],
) -> HashMap<u32, Vec<CptBearingCapacityRow>> {
    let mut grouped: HashMap<u32, Vec<CptBearingCapacityRow>> = HashMap::new();
    for capacity in rows {
        grouped
            .entry(capacity.cpt_id)
            .or_default()
            .push(CptBearingCapacityRow {
                pile_size_mm: capacity.pile_size_mm,
                pile_tip_level_m: capacity.pile_tip_level_m,
                frd_kn: capacity.frd_kn,
            });
    }
    for rows in grouped.values_mut() {
        rows.sort_by(|left, right| {
            left.pile_size_mm
                .cmp(&right.pile_size_mm)
                .then_with(|| right.pile_tip_level_m.total_cmp(&left.pile_tip_level_m))
        });
    }
    grouped
}
