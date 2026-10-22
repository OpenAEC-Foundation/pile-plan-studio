use super::{AdviceConflict, AdviceConflictValue, AdviceValueLocation, ImportError};
use crate::{try_pile_tip_level_mm, ProjectBearingCapacity};
use std::collections::BTreeMap;
#[derive(Clone, Debug)]
pub(super) struct SourcedCapacity {
    pub capacity: ProjectBearingCapacity,
    pub location: AdviceValueLocation,
}
#[derive(Clone, Debug, Default, PartialEq)]
pub(super) struct AdviceMergeResult {
    pub unique_values: Vec<ProjectBearingCapacity>,
    pub exact_duplicate_count: usize,
    pub conflicts: Vec<AdviceConflict>,
}
pub(super) fn merge_advice_values(
    values: &[SourcedCapacity],
) -> Result<AdviceMergeResult, ImportError> {
    let mut groups: BTreeMap<(u32, u32, i64), Vec<&SourcedCapacity>> = BTreeMap::new();
    for item in values {
        let c = &item.capacity;
        if !c.frd_kn.is_finite() || c.pile_size_mm == 0 {
            return Err(ImportError::Validation("Invalid bearing capacity".into()));
        }
        let tip = try_pile_tip_level_mm(c.pile_tip_level_m)
            .map_err(|e| ImportError::Validation(e.to_string()))?;
        groups
            .entry((c.cpt_id, c.pile_size_mm, tip))
            .or_default()
            .push(item);
    }
    let mut result = AdviceMergeResult::default();
    for ((cpt_id, pile_size_mm, pile_tip_level_mm), mut items) in groups {
        items.sort_by(|a, b| {
            a.capacity
                .frd_kn
                .partial_cmp(&b.capacity.frd_kn)
                .unwrap()
                .then(a.location.cmp(&b.location))
        });
        let mut values: Vec<AdviceConflictValue> = Vec::new();
        for item in items {
            let frd = if item.capacity.frd_kn == 0.0 {
                0.0
            } else {
                item.capacity.frd_kn
            };
            if let Some(group) = values.last_mut().filter(|g| g.frd_kn == frd) {
                group.locations.push(item.location.clone());
                result.exact_duplicate_count += 1;
            } else {
                values.push(AdviceConflictValue {
                    frd_kn: frd,
                    locations: vec![item.location.clone()],
                });
            }
        }
        if values.len() > 1 {
            result.conflicts.push(AdviceConflict {
                cpt_id,
                pile_size_mm,
                pile_tip_level_mm,
                values,
            });
        } else {
            result.unique_values.push(ProjectBearingCapacity {
                cpt_id,
                pile_size_mm,
                pile_tip_level_m: pile_tip_level_mm as f64 / 1000.,
                frd_kn: values[0].frd_kn,
            });
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn item(id: &str, value: f64) -> SourcedCapacity {
        SourcedCapacity {
            capacity: crate::ProjectBearingCapacity {
                cpt_id: 1,
                pile_size_mm: 290,
                pile_tip_level_m: -15.0,
                frd_kn: value,
            },
            location: AdviceValueLocation {
                source_id: id.into(),
                file_name: "advies.xlsx".into(),
                sheet_name: Some("blad".into()),
                row: Some(2),
                column: Some(3),
            },
        }
    }
    #[test]
    fn merge_advice_counts_all_occurrences() {
        let mut values = vec![
            item("a", 500.),
            item("b", 500.),
            item("c", 600.),
            item("d", 600.),
            item("e", 600.),
        ];
        let result = merge_advice_values(&values).unwrap();
        assert_eq!(result.conflicts.len(), 1);
        assert_eq!(result.exact_duplicate_count, 3);
        assert_eq!(result.conflicts[0].values[0].locations.len(), 2);
        assert!(result.unique_values.is_empty());
        values.reverse();
        assert_eq!(result, merge_advice_values(&values).unwrap());
    }
    #[test]
    fn merge_advice_uses_exact_numeric_values() {
        assert_eq!(
            merge_advice_values(&[item("a", 0.), item("b", -0.)])
                .unwrap()
                .unique_values
                .len(),
            1
        );
        assert_eq!(
            merge_advice_values(&[item("a", 500.), item("b", 500.00000000000006)])
                .unwrap()
                .conflicts
                .len(),
            1
        );
    }
}
