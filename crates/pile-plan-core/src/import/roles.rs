use std::collections::{BTreeSet, HashMap, HashSet};

use crate::{ProjectBearingCapacity, ProjectCpt, ProjectLoadPoint};

use super::{ImportError, SourceLocation, SourceRow, SourceTable, TableCell};

#[derive(Clone, Copy)]
struct Column {
    number: usize,
    name: &'static str,
}

const ID: Column = Column {
    number: 1,
    name: "ID",
};
const X: Column = Column {
    number: 2,
    name: "X",
};
const Y: Column = Column {
    number: 3,
    name: "Y",
};
const FED: Column = Column {
    number: 4,
    name: "FED",
};
const CPT_ID: Column = Column {
    number: 1,
    name: "CPT ID",
};
const TIP: Column = Column {
    number: 2,
    name: "Tip",
};
const SIZE: Column = Column {
    number: 3,
    name: "Size",
};
const FRD: Column = Column {
    number: 4,
    name: "FRD",
};

pub fn parse_load_points(table: &SourceTable) -> Result<Vec<ProjectLoadPoint>, ImportError> {
    let mut result = Vec::new();
    let mut seen = HashMap::new();
    for row in data_rows(table, 4, "load points")? {
        let id = cell_u32(table, row, ID)?;
        reject_duplicate_source_id(table, row, ID, id, "load point", &mut seen)?;
        result.push(ProjectLoadPoint {
            id,
            name: format!("Load point {id}"),
            x_mm: cell_f64(table, row, X)?,
            y_mm: cell_f64(table, row, Y)?,
            design_load_kn: cell_f64(table, row, FED)?,
        });
    }
    Ok(result)
}

pub fn parse_cpts(table: &SourceTable) -> Result<Vec<ProjectCpt>, ImportError> {
    let mut result = Vec::new();
    let mut seen = HashMap::new();
    for row in data_rows(table, 3, "CPTs")? {
        let id = cell_u32(table, row, ID)?;
        reject_duplicate_source_id(table, row, ID, id, "CPT", &mut seen)?;
        result.push(ProjectCpt {
            id,
            name: format!("CPT {id}"),
            x_mm: cell_f64(table, row, X)?,
            y_mm: cell_f64(table, row, Y)?,
        });
    }
    Ok(result)
}

pub fn parse_bearing_capacities(
    table: &SourceTable,
) -> Result<Vec<ProjectBearingCapacity>, ImportError> {
    let mut result = Vec::new();
    for row in data_rows(table, 4, "bearing capacities")? {
        let pile_size_mm = cell_u32(table, row, SIZE)?;
        if pile_size_mm == 0 {
            return Err(ImportError::InvalidConstraint {
                location: cell_location(table, row, SIZE),
                message: "value must be greater than zero",
            });
        }
        result.push(ProjectBearingCapacity {
            cpt_id: cell_u32(table, row, CPT_ID)?,
            pile_tip_level_m: cell_f64(table, row, TIP)?,
            pile_size_mm,
            frd_kn: cell_f64(table, row, FRD)?,
        });
    }
    Ok(result)
}

fn reject_duplicate_source_id(
    table: &SourceTable,
    row: &SourceRow,
    column: Column,
    id: u32,
    label: &'static str,
    seen: &mut HashMap<u32, SourceLocation>,
) -> Result<(), ImportError> {
    let location = cell_location(table, row, column);
    if let Some(first_location) = seen.get(&id) {
        return Err(ImportError::DuplicateId {
            location,
            first_location: first_location.clone(),
            label,
            id,
        });
    }
    seen.insert(id, location);
    Ok(())
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
) -> Result<impl Iterator<Item = &'a SourceRow>, ImportError> {
    let first_data_index = usize::from(
        table
            .rows
            .first()
            .and_then(|row| row.cells.first())
            .is_some_and(|cell| cell.as_text().parse::<f64>().is_err()),
    );
    for row in table.rows.iter().skip(first_data_index) {
        if row.cells.len() < columns {
            return Err(ImportError::InvalidRow {
                location: table.location(Some(row.number), None, None),
                role,
                actual_columns: row.cells.len(),
                expected_columns: columns,
            });
        }
    }
    Ok(table
        .rows
        .iter()
        .skip(first_data_index)
        .map(|row: &SourceRow| row))
}

fn cell_u32(table: &SourceTable, row: &SourceRow, column: Column) -> Result<u32, ImportError> {
    let location = cell_location(table, row, column);
    parse_u32(cell(row, column, &location)?, location)
}

fn cell_f64(table: &SourceTable, row: &SourceRow, column: Column) -> Result<f64, ImportError> {
    let location = cell_location(table, row, column);
    let value = cell(row, column, &location)?.as_text();
    let number = value
        .parse::<f64>()
        .map_err(|_| ImportError::InvalidValue {
            location: location.clone(),
            value: value.clone(),
            expected: "a number",
        })?;
    if !number.is_finite() {
        return Err(ImportError::InvalidValue {
            location,
            value,
            expected: "a finite number",
        });
    }
    Ok(number)
}

fn parse_u32(cell: &TableCell, location: SourceLocation) -> Result<u32, ImportError> {
    let value = cell.as_text();
    let number = value
        .parse::<f64>()
        .map_err(|_| ImportError::InvalidValue {
            location: location.clone(),
            value: value.clone(),
            expected: "a positive integer",
        })?;
    if !number.is_finite()
        || number.fract().abs() > f64::EPSILON
        || number < 0.0
        || number > u32::MAX as f64
    {
        return Err(ImportError::InvalidValue {
            location,
            value,
            expected: "a positive integer",
        });
    }
    Ok(number as u32)
}

fn cell<'a>(
    row: &'a SourceRow,
    column: Column,
    location: &SourceLocation,
) -> Result<&'a TableCell, ImportError> {
    row.cells
        .get(column.number - 1)
        .ok_or_else(|| ImportError::MissingCell {
            location: location.clone(),
        })
}

fn cell_location(table: &SourceTable, row: &SourceRow, column: Column) -> SourceLocation {
    table.location(Some(row.number), Some(column.number), Some(column.name))
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
