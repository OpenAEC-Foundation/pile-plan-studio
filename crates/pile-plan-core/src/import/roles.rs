use std::collections::{BTreeSet, HashMap, HashSet};

use crate::{ProjectBearingCapacity, ProjectCpt, ProjectLoadPoint};

use super::{ImportError, SourceTable, TableCell};

pub fn parse_load_points(table: &SourceTable) -> Result<Vec<ProjectLoadPoint>, ImportError> {
    data_rows(table, 4, "load points")?
        .map(|(row_number, row)| {
            let id = cell_u32(row, row_number, 1)?;
            Ok(ProjectLoadPoint {
                id,
                name: format!("Load point {id}"),
                x_mm: cell_f64(row, row_number, 2)?,
                y_mm: cell_f64(row, row_number, 3)?,
                design_load_kn: cell_f64(row, row_number, 4)?,
            })
        })
        .collect()
}

pub fn parse_cpts(table: &SourceTable) -> Result<Vec<ProjectCpt>, ImportError> {
    data_rows(table, 3, "CPTs")?
        .map(|(row_number, row)| {
            let id = cell_u32(row, row_number, 1)?;
            Ok(ProjectCpt {
                id,
                name: format!("CPT {id}"),
                x_mm: cell_f64(row, row_number, 2)?,
                y_mm: cell_f64(row, row_number, 3)?,
            })
        })
        .collect()
}

pub fn parse_bearing_capacities(
    table: &SourceTable,
) -> Result<Vec<ProjectBearingCapacity>, ImportError> {
    data_rows(table, 4, "bearing capacities")?
        .map(|(row_number, row)| {
            Ok(ProjectBearingCapacity {
                cpt_id: cell_u32(row, row_number, 1)?,
                pile_tip_level_m: cell_f64(row, row_number, 2)?,
                pile_size_mm: cell_u32(row, row_number, 3)?,
                frd_kn: cell_f64(row, row_number, 4)?,
            })
        })
        .collect()
}

pub fn validate_imported_inputs(
    load_points: &[ProjectLoadPoint],
    cpts: &[ProjectCpt],
    capacities: &[ProjectBearingCapacity],
) -> Result<(), ImportError> {
    reject_duplicate_ids(load_points.iter().map(|item| item.id), "load point")?;
    reject_duplicate_ids(cpts.iter().map(|item| item.id), "CPT")?;
    validate_capacity_values(capacities)?;
    Ok(())
}

#[derive(Clone, Debug, PartialEq)]
pub struct ImportReconciliation {
    pub bearing_capacities: Vec<ProjectBearingCapacity>,
    pub ignored_orphan_rows: usize,
    pub ignored_orphan_cpt_ids: Vec<u32>,
    pub deduplicated_rows: usize,
    pub conflicting_duplicate_keys: usize,
    pub cpt_ids_without_capacities: Vec<u32>,
}

pub fn reconcile_imported_inputs(
    load_points: &[ProjectLoadPoint],
    cpts: &[ProjectCpt],
    capacities: Vec<ProjectBearingCapacity>,
) -> Result<ImportReconciliation, ImportError> {
    validate_imported_inputs(load_points, cpts, &capacities)?;
    let cpt_ids: HashSet<_> = cpts.iter().map(|item| item.id).collect();
    let mut orphan_ids = BTreeSet::new();
    let mut ignored_orphan_rows = 0;
    let mut deduplicated_rows = 0;
    let mut conflicting_keys = BTreeSet::new();
    let mut key_indexes: HashMap<(u32, u32, i64), usize> = HashMap::new();
    let mut bearing_capacities: Vec<ProjectBearingCapacity> = Vec::new();

    for capacity in capacities {
        if !cpt_ids.contains(&capacity.cpt_id) {
            ignored_orphan_rows += 1;
            orphan_ids.insert(capacity.cpt_id);
            continue;
        }
        let key = (
            capacity.cpt_id,
            capacity.pile_size_mm,
            (capacity.pile_tip_level_m * 1000.0).round() as i64,
        );
        if let Some(&index) = key_indexes.get(&key) {
            let existing = &bearing_capacities[index];
            if (existing.frd_kn - capacity.frd_kn).abs() > f64::EPSILON {
                conflicting_keys.insert(key);
                if capacity.frd_kn < existing.frd_kn {
                    bearing_capacities[index] = capacity;
                }
                continue;
            }
            deduplicated_rows += 1;
        } else {
            key_indexes.insert(key, bearing_capacities.len());
            bearing_capacities.push(capacity);
        }
    }

    let cpts_with_capacities: HashSet<_> =
        bearing_capacities.iter().map(|item| item.cpt_id).collect();
    let mut cpt_ids_without_capacities: Vec<_> =
        cpt_ids.difference(&cpts_with_capacities).copied().collect();
    cpt_ids_without_capacities.sort_unstable();

    Ok(ImportReconciliation {
        bearing_capacities,
        ignored_orphan_rows,
        ignored_orphan_cpt_ids: orphan_ids.into_iter().collect(),
        deduplicated_rows,
        conflicting_duplicate_keys: conflicting_keys.len(),
        cpt_ids_without_capacities,
    })
}

fn validate_capacity_values(capacities: &[ProjectBearingCapacity]) -> Result<(), ImportError> {
    for capacity in capacities {
        if capacity.pile_size_mm == 0 {
            return Err(ImportError::Validation(
                "Pile size must be greater than zero".to_string(),
            ));
        }
        if !capacity.frd_kn.is_finite() {
            return Err(ImportError::Validation(format!(
                "FRD must be a finite value for CPT {}",
                capacity.cpt_id
            )));
        }
    }
    Ok(())
}

fn data_rows<'a>(
    table: &'a SourceTable,
    columns: usize,
    role: &'static str,
) -> Result<impl Iterator<Item = (usize, &'a [TableCell])>, ImportError> {
    let first_data_index = usize::from(
        table
            .rows
            .first()
            .and_then(|row| row.first())
            .is_some_and(|cell| parse_u32(cell).is_err()),
    );
    for (index, row) in table.rows.iter().enumerate().skip(first_data_index) {
        if row.len() < columns {
            return Err(ImportError::Validation(format!(
                "{role} row {} has {} columns, expected at least {columns}",
                index + 1,
                row.len()
            )));
        }
    }
    Ok(table
        .rows
        .iter()
        .enumerate()
        .skip(first_data_index)
        .map(|(index, row)| (index + 1, row.as_slice())))
}

fn cell_u32(row: &[TableCell], row_number: usize, column: usize) -> Result<u32, ImportError> {
    parse_u32(cell(row, row_number, column)?)
}

fn cell_f64(row: &[TableCell], row_number: usize, column: usize) -> Result<f64, ImportError> {
    let value = cell(row, row_number, column)?.as_text();
    let number = value
        .parse::<f64>()
        .map_err(|_| ImportError::InvalidValue {
            value: value.clone(),
            expected: "a number",
        })?;
    if !number.is_finite() {
        return Err(ImportError::InvalidValue {
            value,
            expected: "a finite number",
        });
    }
    Ok(number)
}

fn parse_u32(cell: &TableCell) -> Result<u32, ImportError> {
    let value = cell.as_text();
    let number = value
        .parse::<f64>()
        .map_err(|_| ImportError::InvalidValue {
            value: value.clone(),
            expected: "a positive integer",
        })?;
    if !number.is_finite()
        || number.fract().abs() > f64::EPSILON
        || number < 0.0
        || number > u32::MAX as f64
    {
        return Err(ImportError::InvalidValue {
            value,
            expected: "a positive integer",
        });
    }
    Ok(number as u32)
}

fn cell(row: &[TableCell], row_number: usize, column: usize) -> Result<&TableCell, ImportError> {
    row.get(column - 1).ok_or(ImportError::MissingCell {
        row: row_number,
        column,
    })
}

fn reject_duplicate_ids(
    ids: impl Iterator<Item = u32>,
    label: &'static str,
) -> Result<(), ImportError> {
    let mut seen = HashSet::new();
    for id in ids {
        if !seen.insert(id) {
            return Err(ImportError::Validation(format!(
                "Duplicate {label} ID {id}"
            )));
        }
    }
    Ok(())
}
