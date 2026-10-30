//! Source-column inspection and normalization. Existing role parsers validate the values.
use super::{
    parse_finite_number, ImportError, ImportRole, ImportSource, SourceFormat, SourceRow,
    SourceTable, TableCell,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashSet};

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct TableImportSettings {
    pub fixed_pile_size_mm: Option<u32>,
    pub pile_count: Option<u32>,
    pub sheet_name: Option<String>,
    pub has_headers: Option<bool>,
    pub header_row: Option<usize>,
    pub first_data_row: Option<usize>,
    pub delimiter: Option<String>,
    pub columns: Option<Vec<ImportColumnMapping>>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ImportColumnMapping {
    pub column: usize,
    pub field: String,
    pub unit: Option<String>,
    pub pile_size_mm: Option<u32>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SourceTablePreview {
    pub sheets: Vec<String>,
    pub settings: TableImportSettings,
    pub columns: Vec<SourceColumnPreview>,
    pub rows: Vec<SourcePreviewRow>,
    pub row_count: usize,
    pub processed: bool,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SourceColumnPreview {
    pub column: usize,
    pub header: String,
    pub nonempty_count: usize,
    pub numeric_count: usize,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SourcePreviewRow {
    pub number: usize,
    pub cells: Vec<String>,
}

fn token(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}
pub(super) fn header_field(s: &str, role: ImportRole) -> Option<&'static str> {
    let v = token(
        s.split('[')
            .next()
            .unwrap_or(s)
            .split('(')
            .next()
            .unwrap_or(s),
    );
    if role == ImportRole::BearingCapacities && ["sond","sondnr"].contains(&v.as_str()) { return Some("id"); }
    if role == ImportRole::BearingCapacities && v == "niveau2" { return Some("tip-level"); }
    if role == ImportRole::BearingCapacities && v == "kenmerk" { return Some("pile-size"); }
    if role == ImportRole::BearingCapacities && v == "waarde" { return Some("resistance"); }
    if role == ImportRole::BearingCapacities && ["rtdindicatief","rtd","rtnetd"].contains(&v.as_str()) { return Some("tension"); }
    if role == ImportRole::BearingCapacities && v == "rcnetd" { return Some("resistance"); }
    if v.starts_with("trek")
        || v.starts_with("tension")
        || ["fted", "ftrek", "pull", "ftrd"].contains(&v.as_str())
    {
        return Some("tension");
    }
    if [
        "id",
        "nummer",
        "number",
        "nr",
        "no",
        "locatieid",
        "locationid",
        "knoop",
        "mark",
        "sondering",
        "naamsondering",
        "sonderingid",
        "cpt",
        "cptid",
    ]
    .contains(&v.as_str())
    {
        return Some("id");
    }
    if v == "x" || v.starts_with("xcoord") || ["xm", "xmm", "east", "oost"].contains(&v.as_str()) {
        return Some("x");
    }
    if v == "y" || v.starts_with("ycoord") || ["ym", "ymm", "north", "noord"].contains(&v.as_str())
    {
        return Some("y");
    }
    if v.starts_with("paalpunt")
        || v.starts_with("tiplevel")
        || ["tip", "niveau", "puntniveau", "ppn"].contains(&v.as_str())
    {
        return Some("tip-level");
    }
    if [
        "size",
        "afmeting",
        "paalafmeting",
        "paalmaat",
        "diameter",
        "pilesize",
        "pilesizemm",
    ]
    .contains(&v.as_str())
    {
        return Some("pile-size");
    }
    if v.starts_with("druk")
        || v.starts_with("compression")
        || [
            "fed",
            "fced",
            "designload",
            "designloadkn",
            "push",
            "frd",
            "resistance",
            "draagvermogen",
            "weerstand",
        ]
        .contains(&v.as_str())
    {
        return Some(if role == ImportRole::BearingCapacities {
            "resistance"
        } else {
            "compression"
        });
    }
    None
}
pub(crate) fn read_import_table(
    source: &ImportSource,
) -> Result<(SourceTable, Vec<String>), ImportError> {
    if source.format == SourceFormat::Xlsx {
        let tables = super::table::read_xlsx_tables(&source.file_name, &source.bytes)?;
        let names = tables.iter().filter_map(|t| t.sheet_name.clone()).collect();
        let requested = source
            .profile_options
            .table
            .as_ref()
            .and_then(|s| s.sheet_name.as_deref());
        let table = if let Some(name) = requested {
            tables
                .into_iter()
                .find(|t| t.sheet_name.as_deref() == Some(name))
                .ok_or_else(|| ImportError::Validation(format!("Unknown worksheet: {name}")))?
        } else {
            tables
                .into_iter()
                .next()
                .ok_or_else(|| ImportError::EmptySource(source.file_name.clone()))?
        };
        Ok((table, names))
    } else {
        let delimiter = source
            .profile_options
            .table
            .as_ref()
            .and_then(|s| s.delimiter.as_deref())
            .map(|s| match s {
                ";" => b';',
                "tab" | "\t" => b'\t',
                _ => b',',
            })
            .unwrap_or_else(|| {
                let first = String::from_utf8_lossy(&source.bytes)
                    .lines()
                    .find(|s| !s.trim().is_empty())
                    .unwrap_or("")
                    .to_string();
                if first.matches(';').count() > first.matches(',').count() {
                    b';'
                } else if first.contains('\t') {
                    b'\t'
                } else {
                    b','
                }
            });
        Ok((
            super::table::read_csv_delimited(&source.file_name, &source.bytes, delimiter)?,
            vec![],
        ))
    }
}
pub(crate) fn inspect_table(
    table: &SourceTable,
    role: ImportRole,
    requested: Option<&TableImportSettings>,
    sheets: Vec<String>,
) -> SourceTablePreview {
    let width = table.rows.iter().map(|r| r.cells.len()).max().unwrap_or(0);
    let mut settings = requested.cloned().unwrap_or_default();
    settings.sheet_name = table.sheet_name.clone();
    let recognized = table
        .rows
        .iter()
        .take(30)
        .map(|row| {
            (
                row,
                row.cells
                    .iter()
                    .filter(|c| header_field(&c.as_text(), role).is_some())
                    .count(),
            )
        })
        .max_by_key(|(_, n)| *n);
    let textual_header = table
        .rows
        .windows(2)
        .take(30)
        .find(|pair| {
            let first = &pair[0];
            let next = &pair[1];
            first
                .cells
                .iter()
                .filter(|c| !c.is_empty() && parse_finite_number(&c.as_text()).is_err())
                .count()
                >= 2
                && first
                    .cells
                    .first()
                    .is_some_and(|c| !c.is_empty() && parse_finite_number(&c.as_text()).is_err())
                && next
                    .cells
                    .first()
                    .is_some_and(|c| parse_finite_number(&c.as_text()).is_ok())
                && next
                    .cells
                    .iter()
                    .filter(|c| parse_finite_number(&c.as_text()).is_ok())
                    .count()
                    >= 2
        })
        .map(|pair| &pair[0]);
    let header = if settings.has_headers == Some(false) {
        None
    } else if let Some(n) = settings.header_row {
        table.rows.iter().find(|r| r.number == n)
    } else {
        recognized
            .filter(|(_, n)| *n >= 2)
            .map(|(row, _)| row)
            .or(textual_header)
    };
    let has_headers = settings.has_headers.unwrap_or(header.is_some());
    let header = if has_headers {
        header.or_else(|| table.rows.first())
    } else {
        None
    };
    let header_number = header.map(|r| r.number);
    let first_data = settings.first_data_row.unwrap_or_else(|| {
        header_number
            .map(|n| data_start_after(table, n))
            .unwrap_or_else(|| table.rows.first().map(|r| r.number).unwrap_or(1))
    });
    settings.has_headers = Some(has_headers);
    settings.header_row = header_number;
    settings.first_data_row = Some(first_data);
    let columns: Vec<_> = (0..width)
        .map(|i| {
            let cells = table
                .rows
                .iter()
                .filter(|r| r.number >= first_data)
                .filter_map(|r| r.cells.get(i));
            SourceColumnPreview {
                column: i + 1,
                header: header
                    .and_then(|r| r.cells.get(i))
                    .map(TableCell::as_text)
                    .unwrap_or_default(),
                nonempty_count: cells.clone().filter(|c| !c.is_empty()).count(),
                numeric_count: cells
                    .filter(|c| parse_finite_number(&c.as_text()).is_ok())
                    .count(),
            }
        })
        .collect();
    if settings.columns.is_none() {
        let expected = fields(role, false);
        let header_matches = columns
            .iter()
            .filter(|c| header_field(&c.header, role).is_some())
            .count();
        let mut used = HashSet::new();
        settings.columns = Some(
            columns
                .iter()
                .map(|column| {
                    let fifth = if role == ImportRole::LoadPoints
                        && column.column == 5
                        && column.numeric_count > 0
                    {
                        "tension"
                    } else {
                        "ignore"
                    };
                    let field = if header_matches >= 2 {
                        header_field(&column.header, role).unwrap_or_else(|| {
                            if column.header.trim().is_empty() {
                                expected.get(column.column - 1).copied().unwrap_or(fifth)
                            } else {
                                fifth
                            }
                        })
                    } else {
                        expected.get(column.column - 1).copied().unwrap_or(fifth)
                    };
                    let field =
                        if column.nonempty_count == 0 || field != "ignore" && !used.insert(field) {
                            "ignore"
                        } else {
                            field
                        };
                    let label = column.header.to_lowercase();
                    let unit = if ["x", "y", "tip-level"].contains(&field) {
                        Some(
                            if label.contains("[m]")
                                || label.ends_with("(m)")
                                || ["xm", "ym"].contains(&token(&label).as_str())
                            {
                                "m"
                            } else if label.contains("[mm]") || label.ends_with("(mm)") {
                                "mm"
                            } else if field == "tip-level" {
                                "m"
                            } else {
                                "mm"
                            }
                            .into(),
                        )
                    } else {
                        None
                    };
                    ImportColumnMapping {
                        column: column.column,
                        field: field.into(),
                        unit,
                        pile_size_mm: None,
                    }
                })
                .collect(),
        );
    }
    if role == ImportRole::BearingCapacities && settings.fixed_pile_size_mm.is_none()
        && requested.is_none_or(|v|v.columns.is_none())
        && !settings.columns.as_ref().is_some_and(|cs|cs.iter().any(|c|c.field=="pile-size")) {
        settings.fixed_pile_size_mm = table.sheet_name.as_deref()
            .and_then(super::capacity_columns::size_from_header).and_then(Result::ok);
    }
    SourceTablePreview {
        sheets,
        settings,
        columns,
        rows: table
            .rows
            .iter()
            .take(25)
            .map(|r| SourcePreviewRow {
                number: r.number,
                cells: (0..width)
                    .map(|i| r.cells.get(i).map(TableCell::as_text).unwrap_or_default())
                    .collect(),
            })
            .collect(),
        row_count: table.rows.iter().filter(|r| r.number >= first_data).count(),
        processed: false,
    }
}
pub(crate) fn fields(role: ImportRole, tension: bool) -> Vec<&'static str> {
    match role {
        ImportRole::Cpts => vec!["id", "x", "y"],
        ImportRole::LoadPoints => {
            if tension {
                vec!["id", "x", "y", "compression", "tension"]
            } else {
                vec!["id", "x", "y", "compression"]
            }
        }
        ImportRole::BearingCapacities => {
            if tension {
                vec!["id", "tip-level", "pile-size", "resistance", "tension"]
            } else {
                vec!["id", "tip-level", "pile-size", "resistance"]
            }
        }
    }
}
pub(crate) fn data_start_after(table: &SourceTable, header: usize) -> usize {
    table
        .rows
        .iter()
        .find(|r| {
            r.number > header
                && !r.cells.iter().filter(|c| !c.is_empty()).all(|c| {
                    let text = token(&c.as_text());
                    ["m", "mm", "mnap", "kn"].contains(&text.as_str())
                })
        })
        .map(|r| r.number)
        .unwrap_or(header + 1)
}
pub(crate) fn include_diagnostic_rows(
    table: &SourceTable,
    preview: &mut SourceTablePreview,
    diagnostics: &[super::ImportDiagnostic],
) {
    for number in diagnostics
        .iter()
        .filter_map(|d| d.location.as_ref().and_then(|l| l.row))
        .take(5)
    {
        if !preview.rows.iter().any(|r| r.number == number) {
            if let Some(row) = table.rows.iter().find(|r| r.number == number) {
                preview.rows.push(SourcePreviewRow {
                    number,
                    cells: (0..preview.columns.len())
                        .map(|i| row.cells.get(i).map(TableCell::as_text).unwrap_or_default())
                        .collect(),
                });
            }
        }
    }
    preview.rows.sort_by_key(|r| r.number);
}
pub(crate) fn normalize_table(
    table: &SourceTable,
    role: ImportRole,
    settings: &TableImportSettings,
) -> Result<SourceTable, ImportError> {
    if settings.pile_count == Some(0) || settings.fixed_pile_size_mm == Some(0) {
        return Err(ImportError::Validation("Pile count and fixed pile size must be greater than zero".into()));
    }
    let fixed_size = if role == ImportRole::BearingCapacities { settings.fixed_pile_size_mm } else { None };
    let columns = settings.columns.as_deref().unwrap_or(&[]);
    if fixed_size.is_some() && columns.iter().any(|c|c.field=="pile-size") {
        return Err(ImportError::Validation("Choose either a fixed pile size or a pile-size column".into()));
    }
    let tension = columns.iter().any(|c| c.field == "tension");
    let expected = fields(role, tension);
    let mut seen = HashSet::new();
    let mut source_columns = HashSet::new();
    let first = settings.first_data_row.unwrap_or(1);
    for column in columns.iter().filter(|c| c.field != "ignore") {
        if column.column == 0
            || !source_columns.insert(column.column)
            || !seen.insert(column.field.as_str())
            || !expected.contains(&column.field.as_str())
        {
            return Err(ImportError::Validation(format!(
                "Invalid or duplicate column mapping: {}",
                column.field
            )));
        }
        if !table.rows.iter().filter(|r| r.number >= first).any(|r| {
            r.cells
                .get(column.column - 1)
                .is_some_and(|c| !c.is_empty())
        }) {
            return Err(ImportError::Validation(format!(
                "Column {} contains no data",
                column.column
            )));
        }
        if let Some(unit) = &column.unit {
            if !["m", "mm"].contains(&unit.as_str()) {
                return Err(ImportError::Validation(
                    "Unsupported coordinate unit".into(),
                ));
            }
        }
    }
    let mapping: Vec<_> = expected
        .iter()
        .map(|field| {
            if *field == "pile-size" && fixed_size.is_some() { return Ok(None); }
            columns.iter().find(|c| c.field == *field).map(Some)
                .ok_or_else(|| ImportError::Validation(format!("Missing column mapping: {field}")))
        })
        .collect::<Result<_, _>>()?;
    let mut formula_cells = BTreeSet::new();
    let mut rows = table
        .rows
        .iter()
        .filter(|r| r.number >= first)
        .map(|r| {
            let cells = mapping
                .iter()
                .enumerate()
                .map(|(index, column)| {
                    let Some(column)=column else { return TableCell::Number(f64::from(fixed_size.unwrap())); };
                    if table.has_formula(r.number, column.column) {
                        formula_cells.insert((r.number, index + 1));
                    }
                    let cell = r
                        .cells
                        .get(column.column - 1)
                        .cloned()
                        .unwrap_or(TableCell::Empty);
                    let factor = match (column.field.as_str(), column.unit.as_deref()) {
                        ("x" | "y", Some("m")) => 1000.,
                        ("tip-level", Some("mm")) => 0.001,
                        _ => 1.,
                    };
                    if factor != 1. {
                        parse_finite_number(&cell.as_text())
                            .map(|n| TableCell::Number(n * factor))
                            .unwrap_or(cell)
                    } else {
                        cell
                    }
                })
                .collect();
            SourceRow {
                number: r.number,
                cells,
            }
        })
        .collect::<Vec<_>>();
    if rows.is_empty() {
        return Err(ImportError::EmptySource(table.file_name.clone()));
    }
    // Existing parsers recognize a header automatically. Supply a canonical
    // header so an explicitly included first data row is never silently skipped.
    rows.insert(
        0,
        SourceRow {
            number: 0,
            cells: expected
                .iter()
                .map(|field| TableCell::Text(field.to_string()))
                .collect(),
        },
    );
    Ok(SourceTable {
        file_name: table.file_name.clone(),
        sheet_name: table.sheet_name.clone(),
        rows,
        formula_cells,
    })
}
pub(crate) fn mapped_table(source: &ImportSource) -> Result<SourceTable, ImportError> {
    if let Some(settings) = &source.profile_options.table {
        let (table, sheets) = read_import_table(source)?;
        let preview = inspect_table(&table, source.role, Some(settings), sheets);
        normalize_table(&table, source.role, &preview.settings)
    } else {
        super::read_source_table(&source.file_name, source.format, &source.bytes)
    }
}
pub(crate) fn map_error(
    mut error: ImportError,
    settings: &TableImportSettings,
    role: ImportRole,
) -> ImportError {
    let expected = fields(
        role,
        settings
            .columns
            .as_ref()
            .is_some_and(|cs| cs.iter().any(|c| c.field == "tension")),
    );
    let remap = |location: &mut super::SourceLocation| {
        if let Some(c) = location.column {
            if let Some(field) = expected.get(c.saturating_sub(1)) {
                location.column = settings
                    .columns
                    .as_ref()
                    .and_then(|cols| cols.iter().find(|m| m.field == *field))
                    .map(|m| m.column);
            }
        }
    };
    match &mut error {
        ImportError::InvalidValue { location, .. }
        | ImportError::MissingCell { location }
        | ImportError::InvalidConstraint { location, .. }
        | ImportError::InvalidRow { location, .. } => remap(location),
        ImportError::InvalidPileTipLevels(values) => {
            for value in values {
                remap(&mut value.location)
            }
        }
        _ => {}
    }
    error
}
