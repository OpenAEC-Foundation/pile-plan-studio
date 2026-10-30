use super::{
    parse_finite_number, parse_nonnegative_u32, ImportError, SourceRow, SourceTable, TableCell,
};
use crate::{try_pile_tip_level_mm, ProjectBearingCapacity};
use std::collections::{BTreeSet, HashMap};

#[derive(Clone, Debug)]
pub(super) struct LocatedCapacity {
    pub capacity: ProjectBearingCapacity,
    pub row: usize,
    pub column: usize,
}
#[derive(Clone, Debug, Default)]
pub(super) struct ParsedAdviceTable {
    pub values: Vec<LocatedCapacity>,
    pub missing_cells: Vec<(usize, usize)>,
    pub mapped_columns: HashMap<String, String>,
}
#[derive(Clone, Debug)]
pub(super) struct CapacityColumnsLayout {
    pub header_row: usize,
    pub id_column: usize,
    pub check_id_column: Option<usize>,
    pub tip_column: usize,
    pub size_columns: Vec<(u32, usize)>,
}
fn normalized(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}
fn value(row: &SourceRow, column: usize) -> String {
    row.cells
        .get(column - 1)
        .map(TableCell::as_text)
        .unwrap_or_default()
}
fn bad(
    table: &SourceTable,
    row: usize,
    column: usize,
    value: String,
    field: super::AdviceField,
) -> ImportError {
    let code = if table.has_formula(row, column) && value.trim().is_empty() {
        super::ImportDiagnosticCode::MissingAdviceFormulaResult
    } else if value.trim().is_empty() {
        super::ImportDiagnosticCode::MissingAdviceValue
    } else {
        super::ImportDiagnosticCode::InvalidAdviceValue
    };
    super::advice_diagnostics::cell_error(table, row, column, field, code)
}
fn header_base(text: &str) -> &str {
    text.split('[').next().unwrap_or(text).trim()
}
fn unit(text: &str) -> Option<&str> {
    text.split_once('[')
        .map(|(_, u)| u.trim_end_matches(']').trim())
}

pub(super) fn size_from_header(raw: &str) -> Option<Result<u32, ()>> {
    let text = normalized(raw);
    let base = header_base(&text);
    let number = base
        .strip_prefix("prefab ")
        .or_else(|| base.strip_prefix('#'))
        .or_else(|| base.strip_suffix(" mm"))
        .or_else(|| parse_finite_number(base).ok().map(|_| base))?;
    let number = number.split(" rc;").next().unwrap_or(number).trim();
    Some(
        parse_nonnegative_u32(number)
            .map_err(|_| ())
            .and_then(|size| {
                if size == 0 || unit(&text).is_some_and(|u| u != "kn") {
                    Err(())
                } else {
                    Ok(size)
                }
            }),
    )
}

pub(super) fn detect_positional_capacity_columns(
    table: &SourceTable,
) -> Result<Option<CapacityColumnsLayout>, ImportError> {
    use super::advice_layout::{generic_header, role_header, validate_role_unit};
    use super::{AdviceDiagnosticDetails, AdviceField, ImportDiagnosticCode};
    let mut layouts = vec![];
    for row in table.rows.iter().filter(|r| r.number <= 20) {
        let first = value(row, 1);
        let second = value(row, 2);
        if !(generic_header(&first, 1) || role_header(&first, 1))
            || !(generic_header(&second, 2) || role_header(&second, 2))
        {
            continue;
        }
        if row
            .cells
            .iter()
            .skip(2)
            .filter(|c| size_from_header(&c.as_text()).is_some())
            .count()
            < 2
        {
            continue;
        }
        validate_role_unit(table, row, 2)?;
        let width = table
            .rows
            .iter()
            .map(|r| {
                r.cells
                    .iter()
                    .rposition(|c| !c.is_empty())
                    .map_or(0, |c| c + 1)
            })
            .chain(table.formula_cells.iter().map(|p| p.1))
            .max()
            .unwrap_or(0);
        let mut sizes = vec![];
        for column in 3..=width {
            let raw = value(row, column);
            let size = size_from_header(&raw).and_then(Result::ok).ok_or_else(|| {
                super::advice_diagnostics::advice_error(
                    table,
                    ImportDiagnosticCode::MissingAdviceHeader,
                    Some(row.number),
                    Some(column),
                    AdviceDiagnosticDetails {
                        field: Some(AdviceField::Header),
                        value: Some(raw),
                        ..Default::default()
                    },
                )
            })?;
            if sizes.iter().any(|(s, _)| *s == size) {
                return Err(super::advice_diagnostics::advice_error(
                    table,
                    ImportDiagnosticCode::AmbiguousAdviceLayout,
                    Some(row.number),
                    Some(column),
                    AdviceDiagnosticDetails {
                        pile_sizes_mm: vec![size],
                        ..Default::default()
                    },
                ));
            }
            sizes.push((size, column));
        }
        layouts.push(CapacityColumnsLayout {
            header_row: row.number,
            id_column: 1,
            check_id_column: None,
            tip_column: 2,
            size_columns: sizes,
        });
    }
    if layouts.len() > 1 {
        return Err(super::advice_diagnostics::advice_error(
            table,
            ImportDiagnosticCode::AmbiguousAdviceLayout,
            None,
            None,
            Default::default(),
        ));
    }
    Ok(layouts.pop())
}

pub(super) fn detect_capacity_columns(
    table: &SourceTable,
) -> Result<Option<CapacityColumnsLayout>, ImportError> {
    let mut candidates = Vec::new();
    for (index, row) in table
        .rows
        .iter()
        .enumerate()
        .filter(|(_, r)| r.number <= 20)
    {
        if !row.cells.iter().any(|cell| {
            [
                "id",
                "cpt id",
                "sondering",
                "sondering-id",
                "naam sondering",
            ]
            .contains(&header_base(&normalized(&cell.as_text())))
        }) {
            continue;
        }
        let previous = index
            .checked_sub(1)
            .and_then(|i| table.rows.get(i))
            .filter(|r| r.number + 1 == row.number);
        let mut ids = Vec::new();
        let mut tips = Vec::new();
        let mut sizes = Vec::new();
        let mut repeated_id = None;
        for (i, cell) in row.cells.iter().enumerate() {
            let col = i + 1;
            let text = normalized(&cell.as_text());
            let base = header_base(&text);
            if [
                "id",
                "cpt id",
                "sondering",
                "sondering-id",
                "naam sondering",
            ]
            .contains(&base)
            {
                ids.push(col);
            }
            if base == "s" && normalized(&value(row, col + 1)) == "sondering" {
                repeated_id = Some(col);
            }
            let upper = previous
                .map(|r| normalized(&value(r, col)))
                .unwrap_or_default();
            if ["ppn", "paalpuntniveau", "puntniveau", "tip"].contains(&base)
                || (["niveau", "niveau2"].contains(&base) && upper == "paalpunt")
            {
                if let Some(u) = unit(&text) {
                    if !(u == "m" || u.starts_with("m ")) {
                        return Err(bad(
                            table,
                            row.number,
                            col,
                            text,
                            super::AdviceField::Header,
                        ));
                    }
                }
                tips.push(col);
            }
            if let Some(size) = size_from_header(&text) {
                let size = size.map_err(|_| {
                    bad(
                        table,
                        row.number,
                        col,
                        text.clone(),
                        super::AdviceField::Header,
                    )
                })?;
                sizes.push((size, col));
            }
        }
        if !ids.is_empty() && !tips.is_empty() && !sizes.is_empty() {
            if ids.len() != 1
                || tips.len() != 1
                || sizes.iter().map(|p| p.0).collect::<BTreeSet<_>>().len() != sizes.len()
            {
                return Err(super::advice_diagnostics::advice_error(
                    table,
                    super::ImportDiagnosticCode::AmbiguousAdviceLayout,
                    Some(row.number),
                    None,
                    super::AdviceDiagnosticDetails {
                        pile_sizes_mm: sizes.iter().map(|p| p.0).collect(),
                        ..Default::default()
                    },
                ));
            }
            candidates.push(CapacityColumnsLayout {
                header_row: row.number,
                id_column: repeated_id.unwrap_or(ids[0]),
                check_id_column: repeated_id.map(|_| ids[0]),
                tip_column: tips[0],
                size_columns: sizes,
            });
        }
    }
    if candidates.len() > 1 {
        return Err(super::advice_diagnostics::advice_error(
            table,
            super::ImportDiagnosticCode::AmbiguousAdviceLayout,
            None,
            None,
            Default::default(),
        ));
    }
    Ok(candidates.pop())
}

pub(super) fn parse_capacity_columns(
    table: &SourceTable,
    layout: &CapacityColumnsLayout,
) -> Result<ParsedAdviceTable, ImportError> {
    let mut result = ParsedAdviceTable::default();
    let mut started = false;
    for row in table.rows.iter().filter(|r| r.number > layout.header_row) {
        let texts: Vec<_> = row
            .cells
            .iter()
            .map(|c| normalized(&c.as_text()))
            .filter(|t| !t.is_empty())
            .collect();
        if texts.is_empty() && !table.formula_cells.iter().any(|p| p.0 == row.number) {
            continue;
        }
        if !started
            && texts
                .iter()
                .all(|t| t.chars().all(|c| c == '-') || t.starts_with('['))
        {
            for &(size, col) in &layout.size_columns {
                let text = normalized(&value(row, col));
                if text.starts_with('[') && unit(&text) != Some("kn") {
                    return Err(bad(
                        table,
                        row.number,
                        col,
                        text,
                        super::AdviceField::Header,
                    ));
                }
                result
                    .mapped_columns
                    .insert(format!("column {col}"), format!("{size} mm"));
            }
            let text = normalized(&value(row, layout.tip_column));
            if let Some(u) = unit(&text) {
                if !(u == "m" || u.starts_with("m ")) {
                    return Err(bad(
                        table,
                        row.number,
                        layout.tip_column,
                        text,
                        super::AdviceField::Header,
                    ));
                }
            }
            continue;
        }
        started = true;
        let id_text = value(row, layout.id_column);
        let id = parse_nonnegative_u32(id_text.trim()).map_err(|_| {
            bad(
                table,
                row.number,
                layout.id_column,
                id_text,
                super::AdviceField::CptId,
            )
        })?;
        if let Some(col) = layout.check_id_column {
            let t = value(row, col);
            if !t.trim().is_empty() && parse_nonnegative_u32(t.trim()).ok() != Some(id) {
                return Err(bad(table, row.number, col, t, super::AdviceField::CptId));
            }
        }
        let tip_text = value(row, layout.tip_column);
        let tip = parse_finite_number(tip_text.trim()).map_err(|_| {
            bad(
                table,
                row.number,
                layout.tip_column,
                tip_text.clone(),
                super::AdviceField::TipLevel,
            )
        })?;
        try_pile_tip_level_mm(tip).map_err(|e| {
            ImportError::InvalidPileTipLevels(vec![super::InvalidSourcePileTipLevel {
                location: table.location(Some(row.number), Some(layout.tip_column), None),
                value: tip_text,
                reason: e.reason,
            }])
        })?;
        for &(size, col) in &layout.size_columns {
            let text = value(row, col);
            if text.trim().is_empty() {
                if table.has_formula(row.number, col) {
                    return Err(bad(
                        table,
                        row.number,
                        col,
                        text,
                        super::AdviceField::Resistance,
                    ));
                }
                result.missing_cells.push((row.number, col));
                continue;
            }
            let frd = parse_finite_number(text.trim())
                .map_err(|_| bad(table, row.number, col, text, super::AdviceField::Resistance))?;
            result.values.push(LocatedCapacity {
                capacity: ProjectBearingCapacity {
                pile_count: None,
                missing: false,
                    cpt_id: id,
                    pile_size_mm: size,
                    pile_tip_level_m: tip,
                    frd_kn: frd,
                    direction: Default::default(),
                },
                row: row.number,
                column: col,
            });
        }
    }
    result
        .mapped_columns
        .insert(format!("column {}", layout.id_column), "cpt_id".into());
    result.mapped_columns.insert(
        format!("column {}", layout.tip_column),
        "pile_tip_level_m".into(),
    );
    for &(size, col) in &layout.size_columns {
        result
            .mapped_columns
            .insert(format!("column {col}"), format!("{size} mm"));
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::import::{read_source_table, SourceFormat};

    fn table(text: &str) -> SourceTable {
        read_source_table("test.csv", SourceFormat::Csv, text.as_bytes()).unwrap()
    }

    #[test]
    fn capacity_columns_unpivots_supported_headers() {
        for header in ["Prefab 290", "290 mm", "#290"] {
            let t = table(&format!(
                "Naam Sondering,PPN,{header},#320\n1,-15,500,600\n1,-16,0,-42"
            ));
            let parsed =
                parse_capacity_columns(&t, &detect_capacity_columns(&t).unwrap().unwrap()).unwrap();
            assert_eq!(parsed.values.len(), 4);
            assert_eq!(parsed.values[0].capacity.pile_size_mm, 290);
            assert_eq!(parsed.values[0].column, 3);
            assert_eq!(parsed.values[3].capacity.frd_kn, -42.0);
        }
    }

    #[test]
    fn capacity_columns_almere_ids_and_two_row_header() {
        let t = table(
            ",,,paalpunt,Rc;netto;d\ns,sondering,maaiveld,niveau2,#290\n1,1,-3,-15,500\n1,,,-16,600");
        let layout = detect_capacity_columns(&t).unwrap().unwrap();
        assert_eq!(parse_capacity_columns(&t, &layout).unwrap().values.len(), 2);
        let t = table("s,sondering,PPN,#290\n1,2,-15,500");
        assert!(
            parse_capacity_columns(&t, &detect_capacity_columns(&t).unwrap().unwrap()).is_err()
        );
    }

    #[test]
    fn capacity_columns_rejects_invalid_data_and_preserves_missing() {
        for value in ["n.v.t.", "NaN", "-", "#DIV/0!"] {
            let t = table(&format!("Sondering,PPN,#290\n1,-15,{value}"));
            assert!(
                parse_capacity_columns(&t, &detect_capacity_columns(&t).unwrap().unwrap()).is_err()
            );
        }
        let t = table("Sondering,PPN,#290,#320\n1,-15,,500");
        let p = parse_capacity_columns(&t, &detect_capacity_columns(&t).unwrap().unwrap()).unwrap();
        assert_eq!(p.values.len(), 1);
        assert_eq!(p.missing_cells, vec![(2, 3)]);
        let t = table("Sondering,PPN [ft],#290\n1,-15,500");
        assert!(detect_capacity_columns(&t).is_err());
        let t = table("Sondering,PPN,#290\n1,-15.0001,500");
        assert!(
            parse_capacity_columns(&t, &detect_capacity_columns(&t).unwrap().unwrap()).is_err()
        );
    }
    #[test]
    fn formula_without_cached_value_blocks_while_cached_zero_is_a_value() {
        let mut t = table("Sondering,PPN,#290,#320\n1,-15,,0");
        t.formula_cells.insert((2, 3));
        t.formula_cells.insert((2, 4));
        let layout = detect_capacity_columns(&t).unwrap().unwrap();
        assert!(
            parse_capacity_columns(&t, &layout)
                .unwrap_err()
                .to_source_import_failure()
                .diagnostics[0]
                .code
                == super::super::ImportDiagnosticCode::MissingAdviceFormulaResult
        );
        t.formula_cells.remove(&(2, 3));
        let parsed = parse_capacity_columns(&t, &layout).unwrap();
        assert_eq!(parsed.values[0].capacity.frd_kn, 0.);
        assert_eq!(parsed.missing_cells, vec![(2, 3)]);
    }
}
