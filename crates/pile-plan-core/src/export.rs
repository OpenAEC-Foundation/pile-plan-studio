use std::{
    collections::HashMap,
    error::Error,
    fmt::{Display, Formatter},
};

use rust_xlsxwriter::{Color, Format, FormatAlign, Workbook};
use serde::{Deserialize, Serialize};

use crate::{PileConfigurationKey, ProjectLoadPoint};

pub const PILE_PLAN_EXPORT_HEADERS: [&str; 7] = [
    "Load Point ID",
    "X [mm]",
    "Y [mm]",
    "FEd [kN]",
    "Pile Size [mm]",
    "Pile Tip Level [m]",
    "Selected CPTs",
];

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PilePlanExportRequest {
    pub load_points: Vec<ProjectLoadPoint>,
    pub selected_piles: HashMap<u32, PileConfigurationKey>,
    pub selected_cpts: HashMap<u32, Vec<u32>>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct PilePlanExportRow {
    #[serde(rename = "Load Point ID")]
    pub load_point_id: u32,
    #[serde(rename = "X [mm]")]
    pub x_mm: f64,
    #[serde(rename = "Y [mm]")]
    pub y_mm: f64,
    #[serde(rename = "FEd [kN]")]
    pub design_load_kn: f64,
    #[serde(rename = "Pile Size [mm]")]
    pub pile_size_mm: Option<u32>,
    #[serde(rename = "Pile Tip Level [m]")]
    pub pile_tip_level_m: Option<f64>,
    #[serde(rename = "Selected CPTs")]
    pub selected_cpts: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExportError(String);

impl ExportError {
    fn invalid_value(load_point_id: u32, field: &str) -> Self {
        Self(format!(
            "Load point {load_point_id} has an invalid {field}."
        ))
    }
}

impl Display for ExportError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl Error for ExportError {}

pub fn build_pile_plan_export_rows(
    request: &PilePlanExportRequest,
) -> Result<Vec<PilePlanExportRow>, ExportError> {
    let mut load_points = request.load_points.iter().collect::<Vec<_>>();
    load_points.sort_by_key(|load_point| load_point.id);

    load_points
        .into_iter()
        .map(|load_point| {
            validate_finite(load_point.id, "X coordinate", load_point.x_mm)?;
            validate_finite(load_point.id, "Y coordinate", load_point.y_mm)?;
            validate_finite(load_point.id, "design load", load_point.design_load_kn)?;

            let selected_pile = request.selected_piles.get(&load_point.id);
            let mut selected_cpts = request
                .selected_cpts
                .get(&load_point.id)
                .cloned()
                .unwrap_or_default();
            selected_cpts.sort_unstable();
            selected_cpts.dedup();

            Ok(PilePlanExportRow {
                load_point_id: load_point.id,
                x_mm: load_point.x_mm,
                y_mm: load_point.y_mm,
                design_load_kn: load_point.design_load_kn,
                pile_size_mm: selected_pile.map(|pile| pile.pile_size_mm),
                pile_tip_level_m: selected_pile
                    .map(|pile| pile.pile_tip_level_m_key as f64 / 1000.0),
                selected_cpts: selected_cpts
                    .iter()
                    .map(u32::to_string)
                    .collect::<Vec<_>>()
                    .join(", "),
            })
        })
        .collect()
}

pub fn write_pile_plan_csv(request: &PilePlanExportRequest) -> Result<Vec<u8>, ExportError> {
    let rows = build_pile_plan_export_rows(request)?;
    let mut writer = csv::WriterBuilder::new()
        .has_headers(false)
        .from_writer(Vec::new());
    writer
        .write_record(PILE_PLAN_EXPORT_HEADERS)
        .map_err(|error| ExportError(format!("Could not write pile plan CSV header: {error}")))?;

    for row in rows {
        writer
            .serialize(row)
            .map_err(|error| ExportError(format!("Could not write pile plan CSV: {error}")))?;
    }

    writer
        .into_inner()
        .map_err(|error| ExportError(format!("Could not finish pile plan CSV: {error}")))
}

pub fn write_pile_plan_xlsx(request: &PilePlanExportRequest) -> Result<Vec<u8>, ExportError> {
    let rows = build_pile_plan_export_rows(request)?;
    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    worksheet.set_name("Pile Plan").map_err(xlsx_error)?;

    let header_format = Format::new()
        .set_bold()
        .set_font_color(Color::White)
        .set_background_color(Color::RGB(0xED7100))
        .set_align(FormatAlign::Center);

    for (column, header) in PILE_PLAN_EXPORT_HEADERS.iter().enumerate() {
        worksheet
            .write_string_with_format(0, column as u16, *header, &header_format)
            .map_err(xlsx_error)?;
    }

    for (index, row) in rows.iter().enumerate() {
        let excel_row = index as u32 + 1;
        worksheet
            .write_number(excel_row, 0, row.load_point_id)
            .map_err(xlsx_error)?;
        worksheet
            .write_number(excel_row, 1, row.x_mm)
            .map_err(xlsx_error)?;
        worksheet
            .write_number(excel_row, 2, row.y_mm)
            .map_err(xlsx_error)?;
        worksheet
            .write_number(excel_row, 3, row.design_load_kn)
            .map_err(xlsx_error)?;
        if let Some(pile_size_mm) = row.pile_size_mm {
            worksheet
                .write_number(excel_row, 4, pile_size_mm)
                .map_err(xlsx_error)?;
        }
        if let Some(pile_tip_level_m) = row.pile_tip_level_m {
            worksheet
                .write_number(excel_row, 5, pile_tip_level_m)
                .map_err(xlsx_error)?;
        }
        if !row.selected_cpts.is_empty() {
            worksheet
                .write_string(excel_row, 6, &row.selected_cpts)
                .map_err(xlsx_error)?;
        }
    }

    worksheet.set_freeze_panes(1, 0).map_err(xlsx_error)?;
    worksheet
        .autofilter(0, 0, rows.len() as u32, 6)
        .map_err(xlsx_error)?;
    for (column, width) in [18.0, 14.0, 14.0, 14.0, 18.0, 22.0, 24.0]
        .into_iter()
        .enumerate()
    {
        worksheet
            .set_column_width(column as u16, width)
            .map_err(xlsx_error)?;
    }

    workbook.save_to_buffer().map_err(xlsx_error)
}

fn xlsx_error(error: impl Display) -> ExportError {
    ExportError(format!("Could not write pile plan XLSX: {error}"))
}

fn validate_finite(load_point_id: u32, field: &str, value: f64) -> Result<(), ExportError> {
    if value.is_finite() {
        Ok(())
    } else {
        Err(ExportError::invalid_value(load_point_id, field))
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::{PileConfigurationKey, ProjectLoadPoint};

    use super::{
        build_pile_plan_export_rows, write_pile_plan_csv, write_pile_plan_xlsx,
        PilePlanExportRequest,
    };

    fn request() -> PilePlanExportRequest {
        PilePlanExportRequest {
            load_points: vec![
                ProjectLoadPoint {
                    id: 20,
                    name: "Load point 20".to_string(),
                    x_mm: 2000.0,
                    y_mm: 3000.0,
                    design_load_kn: 120.0,
                },
                ProjectLoadPoint {
                    id: 3,
                    name: "Load point 3".to_string(),
                    x_mm: 1000.0,
                    y_mm: 1500.0,
                    design_load_kn: 80.0,
                },
            ],
            selected_piles: HashMap::from([(
                20,
                PileConfigurationKey {
                    pile_size_mm: 320,
                    pile_tip_level_m_key: -18_500,
                },
            )]),
            selected_cpts: HashMap::from([(20, vec![11, 2])]),
        }
    }

    #[test]
    fn builds_rows_in_load_point_order_with_optional_choices() {
        let rows = build_pile_plan_export_rows(&request()).expect("rows");

        assert_eq!(
            rows.iter().map(|row| row.load_point_id).collect::<Vec<_>>(),
            [3, 20]
        );
        assert_eq!(rows[0].pile_size_mm, None);
        assert_eq!(rows[0].pile_tip_level_m, None);
        assert_eq!(rows[0].selected_cpts, "");
        assert_eq!(rows[1].pile_size_mm, Some(320));
        assert_eq!(rows[1].pile_tip_level_m, Some(-18.5));
        assert_eq!(rows[1].selected_cpts, "2, 11");
    }

    #[test]
    fn writes_csv_with_stable_headers_and_quoted_cpt_list() {
        let bytes = write_pile_plan_csv(&request()).expect("csv");
        let text = String::from_utf8(bytes).expect("utf8");

        assert!(text.starts_with(
            "Load Point ID,X [mm],Y [mm],FEd [kN],Pile Size [mm],Pile Tip Level [m],Selected CPTs"
        ));
        assert!(text.contains("20,2000.0,3000.0,120.0,320,-18.5,\"2, 11\""));
    }

    #[test]
    fn writes_csv_headers_for_an_empty_project() {
        let bytes = write_pile_plan_csv(&PilePlanExportRequest {
            load_points: vec![],
            selected_piles: HashMap::new(),
            selected_cpts: HashMap::new(),
        })
        .expect("csv");
        let text = String::from_utf8(bytes).expect("utf8");

        assert_eq!(
            text.trim_end(),
            "Load Point ID,X [mm],Y [mm],FEd [kN],Pile Size [mm],Pile Tip Level [m],Selected CPTs"
        );
    }

    #[test]
    fn rejects_non_finite_project_values() {
        let mut input = request();
        input.load_points[0].x_mm = f64::NAN;

        let error = build_pile_plan_export_rows(&input).expect_err("invalid coordinate");

        assert!(error.to_string().contains("Load point 20"));
        assert!(error.to_string().contains("X coordinate"));
    }

    #[test]
    fn writes_xlsx_with_standard_table() {
        use std::io::Cursor;

        use calamine::{Data, Reader, Xlsx};

        let bytes = write_pile_plan_xlsx(&request()).expect("xlsx");
        let mut workbook = Xlsx::new(Cursor::new(bytes)).expect("workbook");

        assert_eq!(workbook.sheet_names(), ["Pile Plan"]);
        let range = workbook.worksheet_range("Pile Plan").expect("worksheet");
        assert_eq!(
            range.get_value((0, 0)),
            Some(&Data::String("Load Point ID".to_string()))
        );
        assert_eq!(range.get_value((1, 0)), Some(&Data::Float(3.0)));
        assert_eq!(range.get_value((1, 4)), Some(&Data::Empty));
        assert_eq!(range.get_value((2, 4)), Some(&Data::Float(320.0)));
        assert_eq!(
            range.get_value((2, 6)),
            Some(&Data::String("2, 11".to_string()))
        );
    }
}
