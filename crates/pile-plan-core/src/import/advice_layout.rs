use super::advice_diagnostics::advice_error;
use super::capacity_columns::{
    detect_capacity_columns, detect_positional_capacity_columns, size_from_header,
    CapacityColumnsLayout,
};
use super::*;

#[derive(Clone, Debug)]
pub(super) enum AdviceLayout {
    Standard {
        header_row: Option<usize>,
    },
    CapacityColumns {
        layout: CapacityColumnsLayout,
        requires_explicit_profile: bool,
    },
}
impl AdviceLayout {
    pub fn profile(&self) -> ImportProfile {
        match self {
            Self::Standard { .. } => ImportProfile::StandardTable,
            Self::CapacityColumns { .. } => ImportProfile::CapacityColumns,
        }
    }
}
fn layout_error(
    table: &SourceTable,
    code: ImportDiagnosticCode,
    row: Option<usize>,
    count: usize,
) -> ImportError {
    advice_error(
        table,
        code,
        row,
        None,
        AdviceDiagnosticDetails {
            field: Some(AdviceField::Header),
            column_count: Some(count),
            ..Default::default()
        },
    )
}
pub(super) fn normalized(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}
pub(super) fn generic_header(value: &str, column: usize) -> bool {
    let t = normalized(value).replace(' ', "");
    t == format!("kolom{column}") || t == format!("column{column}")
}
pub(super) fn role_header(value: &str, column: usize) -> bool {
    let t = normalized(value);
    let base = t.split(['[', '(']).next().unwrap_or(&t).trim();
    match column {
        1 => [
            "id",
            "cpt id",
            "sondering",
            "sondering-id",
            "naam sondering",
        ]
        .contains(&base),
        2 => ["tip", "ppn", "puntniveau", "paalpuntniveau"].contains(&base),
        3 => ["size", "afmeting", "paalafmeting"].contains(&base),
        4 => [
            "frd",
            "rc;net;d",
            "rc;d",
            "rt;d",
            "rt;net;d",
            "drukweerstand",
            "trekweerstand",
            "draagvermogen",
        ]
        .contains(&base),
        _ => false,
    }
}
pub(super) fn validate_role_unit(
    table: &SourceTable,
    row: &SourceRow,
    column: usize,
) -> Result<(), ImportError> {
    let raw = row
        .cells
        .get(column - 1)
        .map(TableCell::as_text)
        .unwrap_or_default();
    let t = normalized(&raw);
    if let Some((_, unit)) = t.split_once('[').or_else(|| t.split_once('(')) {
        let unit = unit.trim_end_matches([']', ')']).trim();
        let expected = match column {
            2 => "m",
            3 => "mm",
            4 => "kn",
            _ => return Ok(()),
        };
        if unit != expected && !(column == 2 && unit.starts_with("m ")) {
            return Err(advice_error(
                table,
                ImportDiagnosticCode::InvalidAdviceValue,
                Some(row.number),
                Some(column),
                AdviceDiagnosticDetails {
                    field: Some(AdviceField::Header),
                    value: Some(raw),
                    expected_unit: Some(match column {
                        2 => AdviceUnit::Metres,
                        3 => AdviceUnit::Millimetres,
                        _ => AdviceUnit::Kilonewtons,
                    }),
                    ..Default::default()
                },
            ));
        }
    }
    Ok(())
}
pub(super) fn classify_advice_table(table: &SourceTable) -> Result<AdviceLayout, ImportError> {
    if let Some(layout) = detect_capacity_columns(table)? {
        return Ok(AdviceLayout::CapacityColumns {
            layout,
            requires_explicit_profile: false,
        });
    }
    if let Some(layout) = detect_positional_capacity_columns(table)? {
        return Ok(AdviceLayout::CapacityColumns {
            layout,
            requires_explicit_profile: true,
        });
    }
    let first = table.rows.first().ok_or_else(|| {
        layout_error(
            table,
            ImportDiagnosticCode::UnsupportedAdviceLayout,
            None,
            0,
        )
    })?;
    // A numeric first row is data. Never infer matrix headers from resistances.
    let first_value = first
        .cells
        .first()
        .map(TableCell::as_text)
        .unwrap_or_default();
    let header = !first_value.trim().is_empty()
        && parse_finite_number(first_value.trim()).is_err()
        && first
            .cells
            .get(1)
            .is_none_or(|c| parse_finite_number(c.as_text().trim()).is_err());
    if header
        && first
            .cells
            .iter()
            .skip(2)
            .filter(|c| size_from_header(&c.as_text()).is_some())
            .count()
            >= 2
    {
        return Err(layout_error(
            table,
            ImportDiagnosticCode::MissingAdviceHeader,
            Some(first.number),
            first.cells.len(),
        ));
    }
    let width = table
        .rows
        .iter()
        .flat_map(|r| {
            r.cells.iter().enumerate().filter_map(|(c, v)| {
                (!v.is_empty() || table.has_formula(r.number, c + 1)).then_some(c + 1)
            })
        })
        .chain(table.formula_cells.iter().map(|p| p.1))
        .max()
        .unwrap_or(0);
    if width > 4 {
        if !header
            || !(1..=4).all(|c| {
                role_header(
                    &first
                        .cells
                        .get(c - 1)
                        .map(TableCell::as_text)
                        .unwrap_or_default(),
                    c,
                )
            })
        {
            return Err(layout_error(
                table,
                ImportDiagnosticCode::AmbiguousAdviceLayout,
                Some(first.number),
                width,
            ));
        }
    } else if width < 4 {
        return Err(layout_error(
            table,
            ImportDiagnosticCode::UnsupportedAdviceLayout,
            Some(first.number),
            width,
        ));
    }
    if header {
        for c in 1..=4 {
            if role_header(&first.cells[c - 1].as_text(), c) {
                validate_role_unit(table, first, c)?;
            }
        }
    }
    Ok(AdviceLayout::Standard {
        header_row: header.then_some(first.number),
    })
}
pub(super) fn resolve_advice_layout(
    layout: AdviceLayout,
    requested: ImportProfile,
    table: &SourceTable,
) -> Result<AdviceLayout, ImportError> {
    let expected = layout.profile();
    let code = if requested != ImportProfile::Auto && requested != expected {
        Some(ImportDiagnosticCode::AdviceProfileMismatch)
    } else if requested == ImportProfile::Auto
        && matches!(
            layout,
            AdviceLayout::CapacityColumns {
                requires_explicit_profile: true,
                ..
            }
        )
    {
        Some(ImportDiagnosticCode::AdviceProfileRequired)
    } else {
        None
    };
    if let Some(code) = code {
        let sizes = match &layout {
            AdviceLayout::CapacityColumns { layout, .. } => {
                layout.size_columns.iter().map(|p| p.0).collect()
            }
            _ => vec![],
        };
        return Err(advice_error(
            table,
            code,
            None,
            None,
            AdviceDiagnosticDetails {
                required_profile: Some(expected),
                pile_sizes_mm: sizes,
                ..Default::default()
            },
        ));
    }
    Ok(layout)
}
