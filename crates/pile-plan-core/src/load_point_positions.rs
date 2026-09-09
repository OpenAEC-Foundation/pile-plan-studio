use std::{cmp::Ordering, fmt};

use serde::{Deserialize, Serialize};

use crate::ProjectLoadPoint;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct DuplicateLoadPointPositionMember {
    pub id: u32,
    pub name: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct DuplicateLoadPointPosition {
    pub x_mm: f64,
    pub y_mm: f64,
    pub load_points: Vec<DuplicateLoadPointPositionMember>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct DuplicateLoadPointPositions {
    pub positions: Vec<DuplicateLoadPointPosition>,
}

impl fmt::Display for DuplicateLoadPointPositions {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("Load points must have unique positions")?;
        for duplicate in &self.positions {
            let ids = duplicate
                .load_points
                .iter()
                .map(|member| member.id.to_string())
                .collect::<Vec<_>>()
                .join(", ");
            write!(
                formatter,
                "; load points {ids} share position ({}, {}) mm",
                duplicate.x_mm, duplicate.y_mm,
            )?;
        }
        formatter.write_str(".")
    }
}

impl std::error::Error for DuplicateLoadPointPositions {}

pub fn duplicate_load_point_positions(
    load_points: &[ProjectLoadPoint],
) -> Vec<DuplicateLoadPointPosition> {
    let mut ordered = load_points.iter().collect::<Vec<_>>();
    ordered.sort_by(|left, right| {
        compare_coordinates(left.x_mm, right.x_mm)
            .then_with(|| compare_coordinates(left.y_mm, right.y_mm))
            .then_with(|| left.id.cmp(&right.id))
            .then_with(|| left.name.cmp(&right.name))
    });

    let mut duplicates = Vec::new();
    let mut start = 0;
    while start < ordered.len() {
        let x_mm = canonical_coordinate(ordered[start].x_mm);
        let y_mm = canonical_coordinate(ordered[start].y_mm);
        let mut end = start + 1;
        while end < ordered.len()
            && canonical_coordinate(ordered[end].x_mm) == x_mm
            && canonical_coordinate(ordered[end].y_mm) == y_mm
        {
            end += 1;
        }

        let mut load_points = Vec::new();
        for point in &ordered[start..end] {
            if load_points
                .last()
                .is_some_and(|member: &DuplicateLoadPointPositionMember| member.id == point.id)
            {
                continue;
            }
            load_points.push(DuplicateLoadPointPositionMember {
                id: point.id,
                name: point.name.clone(),
            });
        }
        if load_points.len() > 1 {
            duplicates.push(DuplicateLoadPointPosition {
                x_mm,
                y_mm,
                load_points,
            });
        }
        start = end;
    }

    duplicates
}

pub fn validate_unique_load_point_positions(
    load_points: &[ProjectLoadPoint],
) -> Result<(), DuplicateLoadPointPositions> {
    let positions = duplicate_load_point_positions(load_points);
    if positions.is_empty() {
        Ok(())
    } else {
        Err(DuplicateLoadPointPositions { positions })
    }
}

fn canonical_coordinate(value: f64) -> f64 {
    if value == 0.0 {
        0.0
    } else {
        value
    }
}

fn compare_coordinates(left: f64, right: f64) -> Ordering {
    canonical_coordinate(left).total_cmp(&canonical_coordinate(right))
}
