use super::*;

pub(super) fn advice_error(
    table: &SourceTable,
    code: ImportDiagnosticCode,
    row: Option<usize>,
    column: Option<usize>,
    details: AdviceDiagnosticDetails,
) -> ImportError {
    let mut d = pipeline::error_diagnostic(code, format!("Foundation advice: {code:?}"));
    d.location = Some((&table.location(row, column, None)).into());
    d.advice = Some(details);
    ImportError::Advice(SourceImportFailure {
        unique_value_count: 0,
        exact_duplicate_count: 0,
        message: d.fallback_message.clone(),
        diagnostics: vec![d],
        conflicts: vec![],
    })
}

pub(super) fn cell_error(
    table: &SourceTable,
    row: usize,
    column: usize,
    field: AdviceField,
    code: ImportDiagnosticCode,
) -> ImportError {
    let value = table
        .rows
        .iter()
        .find(|r| r.number == row)
        .and_then(|r| r.cells.get(column - 1))
        .map(TableCell::as_text)
        .unwrap_or_default();
    advice_error(
        table,
        code,
        Some(row),
        Some(column),
        AdviceDiagnosticDetails {
            field: Some(field),
            value: Some(value),
            expected_unit: match field {
                AdviceField::TipLevel => Some(AdviceUnit::Metres),
                AdviceField::PileSize => Some(AdviceUnit::Millimetres),
                AdviceField::Resistance => Some(AdviceUnit::Kilonewtons),
                _ => None,
            },
            ..Default::default()
        },
    )
}

pub(super) fn diagnostic_for_table(error: &ImportError, table: &SourceTable) -> ImportDiagnostic {
    if matches!(
        error,
        ImportError::Advice(_) | ImportError::InvalidPileTipLevels(_)
    ) {
        return super::advice::diagnostic(error);
    }
    let location = match error {
        ImportError::InvalidValue { location, .. }
        | ImportError::MissingCell { location }
        | ImportError::InvalidConstraint { location, .. }
        | ImportError::InvalidRow { location, .. } => location,
        _ => return super::advice::diagnostic(error),
    };
    if let (Some(row), Some(column)) = (location.row, location.column) {
        let field = match column {
            1 => AdviceField::CptId,
            2 => AdviceField::TipLevel,
            3 => AdviceField::PileSize,
            _ => AdviceField::Resistance,
        };
        let empty = table
            .rows
            .iter()
            .find(|r| r.number == row)
            .and_then(|r| r.cells.get(column - 1))
            .is_none_or(TableCell::is_empty);
        let code = if table.has_formula(row, column) && empty {
            ImportDiagnosticCode::MissingAdviceFormulaResult
        } else if empty {
            ImportDiagnosticCode::MissingAdviceValue
        } else {
            ImportDiagnosticCode::InvalidAdviceValue
        };
        return super::advice::diagnostic(&cell_error(table, row, column, field, code));
    }
    super::advice::diagnostic(error)
}
