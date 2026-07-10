use std::collections::HashSet;

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
    let cpt_ids: HashSet<_> = cpts.iter().map(|item| item.id).collect();
    if let Some(capacity) = capacities
        .iter()
        .find(|item| !cpt_ids.contains(&item.cpt_id))
    {
        return Err(ImportError::Validation(format!(
            "Bearing capacity references unknown CPT {}",
            capacity.cpt_id
        )));
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
