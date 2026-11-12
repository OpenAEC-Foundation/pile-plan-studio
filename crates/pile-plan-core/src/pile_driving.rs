use std::collections::HashMap;

use crate::import::{
    parse_nonnegative_u32, SourceFormat, SourceTable, SourceTablePreview, TableCell,
    TableImportSettings,
};
use serde::{Deserialize, Serialize};

mod checks;
mod mapping;
mod neighborhood;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PileDrivingMatchField {
    RevitMark,
    LocationId,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(default)]
pub struct ProjectPileDriving {
    files: Vec<EmbeddedDrivingFile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    shared_match_by: Option<PileDrivingMatchField>,
    #[serde(skip_serializing_if = "Option::is_none")]
    shared_ignore_csv_leading_zeros: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    shared_table: Option<PileDrivingSharedTable>,
    #[serde(skip_serializing_if = "Option::is_none")]
    check_settings: Option<checks::CheckSettings>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
struct EmbeddedDrivingFile {
    id: String,
    file_name: String,
    format: SourceFormat,
    data_base64: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    overrides: Option<DrivingImportOverrides>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
struct DrivingImportOverrides {
    #[serde(skip_serializing_if = "Option::is_none")]
    match_by: Option<PileDrivingMatchField>,
    #[serde(skip_serializing_if = "Option::is_none")]
    ignore_csv_leading_zeros: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    table: Option<TableImportSettings>,
}

impl ProjectPileDriving {
    pub(crate) fn is_valid(&self) -> bool {
        let mut ids = std::collections::HashSet::new();
        self.files
            .iter()
            .all(|file| !file.id.is_empty() && file.id != "all" && ids.insert(&file.id))
            && self
                .check_settings
                .as_ref()
                .is_none_or(checks::CheckSettings::valid)
    }
}

#[derive(Debug, Deserialize)]
pub struct PileDrivingTarget {
    load_point_id: u32,
    revit_mark: Option<String>,
    configuration: Option<crate::PileConfigurationKey>,
    #[serde(default)]
    selected_cpt_ids: Vec<u32>,
}

#[derive(Debug, Deserialize)]
pub struct PileDrivingImportRequest {
    file_name: String,
    format: SourceFormat,
    bytes: Vec<u8>,
    match_by: PileDrivingMatchField,
    ignore_csv_leading_zeros: Option<bool>,
    targets: Vec<PileDrivingTarget>,
    pile_head_level_m: Option<f64>,
    #[serde(default)]
    settings: checks::CheckSettings,
}

#[derive(Debug, Deserialize)]
pub struct PileDrivingBatchRequest {
    files: Vec<PileDrivingSource>,
    shared_table: Option<PileDrivingSharedTable>,
    targets: Vec<PileDrivingTarget>,
    pile_head_level_m: Option<f64>,
    #[serde(default)]
    settings: checks::CheckSettings,
}

#[derive(Debug, Deserialize)]
struct PileDrivingSource {
    file_name: String,
    format: SourceFormat,
    bytes: Vec<u8>,
    match_by: PileDrivingMatchField,
    ignore_csv_leading_zeros: Option<bool>,
    #[serde(default)]
    independent: bool,
    table: Option<TableImportSettings>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
struct PileDrivingSharedTable {
    headers: Vec<String>,
    settings: TableImportSettings,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum PileDrivingMatch {
    Matched { load_point_id: u32 },
    Unmatched,
    Ambiguous,
}

#[derive(Debug, Serialize)]
pub struct PileDrivingRecord {
    pile_number: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    matched_pile_number: Option<String>,
    row_numbers: Vec<usize>,
    rows: Vec<Vec<String>>,
    matching: PileDrivingMatch,
    checks: Vec<checks::Check>,
    energy_range: Option<checks::EnergyRange>,
    #[serde(skip)]
    neighborhood_reading: Option<neighborhood::Reading>,
    neighborhood: Option<neighborhood::Comparison>,
}

#[derive(Debug, Serialize)]
pub struct PileDrivingPreview {
    columns: Vec<String>,
    records: Vec<PileDrivingRecord>,
    settings: checks::CheckSettings,
    energy_by_size: Vec<checks::EnergyGroup>,
}

#[derive(Debug, Serialize)]
struct PileDrivingFilePreview {
    columns: Vec<String>,
    records: Vec<PileDrivingRecord>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "kebab-case")]
enum PileDrivingFileResult {
    Ready {
        preview: PileDrivingFilePreview,
        table: SourceTablePreview,
    },
    Failed {
        error: PileDrivingImportError,
        table: Option<SourceTablePreview>,
    },
}

#[derive(Debug, Serialize)]
pub struct PileDrivingBatchPreview {
    files: Vec<PileDrivingFileResult>,
    settings: checks::CheckSettings,
    energy_by_size: Vec<checks::EnergyGroup>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "code", rename_all = "kebab-case")]
pub enum PileDrivingImportError {
    Unreadable,
    MissingPileNumberColumn,
    MultiplePileNumberColumns,
    MultiplePileNumberTables,
    MissingWorksheet,
    InvalidColumnMapping,
    MissingPileNumber { row: usize },
    NoRecords,
    InvalidCheckSettings,
}

pub fn preview_pile_driving(
    request: &PileDrivingImportRequest,
) -> Result<PileDrivingPreview, PileDrivingImportError> {
    if !request.settings.valid() {
        return Err(PileDrivingImportError::InvalidCheckSettings);
    }
    let table = mapping::read(
        &request.file_name,
        request.format,
        &request.bytes,
        None,
        None,
    )?;
    if let Some(error) = table.diagnostic {
        return Err(error);
    }
    let table = mapping::normalize(table.raw, &table.preview)?;
    let PileDrivingFilePreview {
        columns,
        mut records,
    } = inspect_driving_file(
        table,
        request.match_by,
        request.format,
        request.ignore_csv_leading_zeros,
        &request.targets,
        request.pile_head_level_m,
        &request.settings,
    )?;
    neighborhood::apply(
        records.iter_mut().collect(),
        &request.targets,
        request.settings.neighborhood_tolerance_pct,
    );
    let energy_by_size = checks::energy_by_size(
        [(columns.as_slice(), records.as_slice())],
        request.settings.peer_energy_spread_kj,
    );
    Ok(PileDrivingPreview {
        columns,
        records,
        settings: request.settings.clone(),
        energy_by_size,
    })
}

pub fn preview_pile_driving_files(
    request: &PileDrivingBatchRequest,
) -> Result<PileDrivingBatchPreview, PileDrivingImportError> {
    if !request.settings.valid() {
        return Err(PileDrivingImportError::InvalidCheckSettings);
    }
    let mut files: Vec<_> = request
        .files
        .iter()
        .map(|file| {
            let shared = if file.independent || file.table.is_some() {
                None
            } else {
                request.shared_table.as_ref()
            };
            let table = match mapping::read(
                &file.file_name,
                file.format,
                &file.bytes,
                file.table.as_ref(),
                shared,
            ) {
                Ok(table) => table,
                Err(error) => return PileDrivingFileResult::Failed { error, table: None },
            };
            let preview = match table.diagnostic {
                Some(error) => Err(error),
                None => mapping::normalize(table.raw, &table.preview).and_then(|normalized| {
                    inspect_driving_file(
                        normalized,
                        file.match_by,
                        file.format,
                        file.ignore_csv_leading_zeros,
                        &request.targets,
                        request.pile_head_level_m,
                        &request.settings,
                    )
                }),
            };
            match preview {
                Ok(preview) => PileDrivingFileResult::Ready {
                    preview,
                    table: table.preview,
                },
                Err(error) => PileDrivingFileResult::Failed {
                    error,
                    table: Some(table.preview),
                },
            }
        })
        .collect();
    let records = files
        .iter_mut()
        .filter_map(|result| match result {
            PileDrivingFileResult::Ready { preview, .. } => Some(preview.records.iter_mut()),
            PileDrivingFileResult::Failed { .. } => None,
        })
        .flatten()
        .collect();
    neighborhood::apply(
        records,
        &request.targets,
        request.settings.neighborhood_tolerance_pct,
    );
    let ready = files.iter().filter_map(|result| match result {
        PileDrivingFileResult::Ready { preview, .. } => {
            Some((preview.columns.as_slice(), preview.records.as_slice()))
        }
        PileDrivingFileResult::Failed { .. } => None,
    });
    let energy_by_size = checks::energy_by_size(ready, request.settings.peer_energy_spread_kj);
    Ok(PileDrivingBatchPreview {
        files,
        settings: request.settings.clone(),
        energy_by_size,
    })
}

fn numeric_pile_number(value: &str) -> Option<&str> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let digits = value.trim_start_matches('0');
    Some(if digits.is_empty() { "0" } else { digits })
}

fn inspect_driving_file(
    table: SourceTable,
    match_by: PileDrivingMatchField,
    format: SourceFormat,
    ignore_csv_leading_zeros: Option<bool>,
    plan_targets: &[PileDrivingTarget],
    pile_head_level_m: Option<f64>,
    settings: &checks::CheckSettings,
) -> Result<PileDrivingFilePreview, PileDrivingImportError> {
    let (header, rows) = table
        .rows
        .split_first()
        .ok_or(PileDrivingImportError::NoRecords)?;
    let columns: Vec<_> = header.cells.iter().map(TableCell::as_text).collect();
    let number_column = columns
        .iter()
        .position(|name| name == "paalnummer")
        .ok_or(PileDrivingImportError::MissingPileNumberColumn)?;
    let recording_columns: Vec<_> = columns
        .iter()
        .enumerate()
        .filter(|(_, name)| {
            matches!(
                column_key(name).as_str(),
                "paalid"
                    | "datum"
                    | "stelling"
                    | "starttijd"
                    | "projectnummer"
                    | "bloknummer"
                    | "kavelnummer"
            )
        })
        .map(|(index, _)| index)
        .collect();
    let normalize_csv = format == SourceFormat::Csv && ignore_csv_leading_zeros.unwrap_or(true);
    let mut targets = HashMap::<String, Vec<&PileDrivingTarget>>::new();
    let mut numeric_targets = HashMap::<String, Vec<&PileDrivingTarget>>::new();
    for target in plan_targets {
        let key = match match_by {
            PileDrivingMatchField::RevitMark => target
                .revit_mark
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_owned),
            PileDrivingMatchField::LocationId => Some(target.load_point_id.to_string()),
        };
        if let Some(key) = key {
            if match_by == PileDrivingMatchField::RevitMark
                && (normalize_csv || format == SourceFormat::Xlsx)
            {
                if let Some(digits) = numeric_pile_number(&key) {
                    numeric_targets
                        .entry(digits.to_owned())
                        .or_default()
                        .push(target);
                }
            }
            targets.entry(key).or_default().push(target);
        }
    }
    let mut records = Vec::<PileDrivingRecord>::new();
    let mut record_indices = HashMap::new();
    for row in rows {
        let values: Vec<_> = (0..columns.len())
            .map(|index| {
                row.cells
                    .get(index)
                    .map(TableCell::as_text)
                    .unwrap_or_default()
            })
            .collect();
        let pile_number = values[number_column].trim();
        if pile_number.is_empty() {
            return Err(PileDrivingImportError::MissingPileNumber { row: row.number });
        }
        let mut recording = vec![pile_number.to_owned()];
        recording.extend(
            recording_columns
                .iter()
                .map(|&index| values[index].trim().to_owned()),
        );
        let candidates = match match_by {
            PileDrivingMatchField::LocationId => parse_nonnegative_u32(pile_number)
                .ok()
                .and_then(|id| targets.get(&id.to_string())),
            PileDrivingMatchField::RevitMark if format == SourceFormat::Csv => {
                match numeric_pile_number(pile_number).filter(|_| normalize_csv) {
                    Some(digits) => numeric_targets.get(digits),
                    None => targets.get(pile_number),
                }
            }
            PileDrivingMatchField::RevitMark => match row.cells.get(number_column) {
                Some(TableCell::Number(value)) if *value >= 0.0 && value.fract() == 0.0 => {
                    let digits = if *value == 0.0 { "0" } else { pile_number };
                    numeric_targets.get(digits)
                }
                Some(TableCell::Text(_)) => targets.get(pile_number),
                _ => None,
            },
        };
        let matching = match candidates.map(Vec::as_slice) {
            Some([target]) => PileDrivingMatch::Matched {
                load_point_id: target.load_point_id,
            },
            Some(_) => PileDrivingMatch::Ambiguous,
            None => PileDrivingMatch::Unmatched,
        };
        let record_index = *record_indices
            .entry((recording, matching))
            .or_insert_with(|| {
                let matched_pile_number = match candidates.map(Vec::as_slice) {
                    Some([target]) if match_by == PileDrivingMatchField::RevitMark => target
                        .revit_mark
                        .as_deref()
                        .map(str::trim)
                        .map(str::to_owned),
                    _ => None,
                };
                let index = records.len();
                records.push(PileDrivingRecord {
                    pile_number: pile_number.to_owned(),
                    matched_pile_number,
                    row_numbers: vec![],
                    rows: vec![],
                    matching,
                    checks: Vec::new(),
                    energy_range: None,
                    neighborhood_reading: None,
                    neighborhood: None,
                });
                index
            });
        records[record_index].row_numbers.push(row.number);
        records[record_index].rows.push(values);
    }
    if records.is_empty() {
        return Err(PileDrivingImportError::NoRecords);
    }
    let plan = plan_targets
        .iter()
        .filter_map(|target| {
            target
                .configuration
                .as_ref()
                .map(|configuration| (target.load_point_id, configuration))
        })
        .collect::<HashMap<_, _>>();
    let check_columns = checks::CheckColumns::new(&columns);
    for record in &mut records {
        let configuration = match record.matching {
            PileDrivingMatch::Matched { load_point_id } => plan.get(&load_point_id).copied(),
            _ => None,
        };
        let assessment = checks::assess(
            &check_columns,
            &record.rows,
            configuration,
            pile_head_level_m,
            settings,
        );
        record.checks = assessment.checks;
        record.energy_range = assessment.energy_range;
        record.neighborhood_reading = assessment.neighborhood_reading;
    }
    Ok(PileDrivingFilePreview { columns, records })
}

fn column_key(header: &str) -> String {
    header
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn neighborhood_file(piles: &[(u32, u32, u32)]) -> Vec<u8> {
        use std::fmt::Write;
        let mut csv = String::from("paalnummer,dikte_cm,tochtnummer,ppn_nap,slagen,energie_per_slag_kj,mm_zakking_per_tocht\n");
        for &(id, size, blows) in piles {
            for increment in 1..=7 {
                let level = -16.0 - f64::from(increment) * 0.25;
                let (blows, energy) = if increment == 1 {
                    (99, 70)
                } else {
                    (blows, 35 + id)
                };
                writeln!(csv, "{id},{size},{increment},{level},{blows},{energy},250").unwrap();
            }
        }
        csv.into_bytes()
    }

    fn neighborhood_preview(limit: f64, relax: bool) -> serde_json::Value {
        let exact = [1, 2, 3, 4];
        let one_replaced = [1, 2, 3, 5];
        let request: PileDrivingBatchRequest = serde_json::from_value(serde_json::json!({
            "files": [
                {"file_name": "first.csv", "format": "csv", "match_by": "location-id",
                 "bytes": neighborhood_file(&[(1, 29, 30), (5, 29, 50), (6, 35, 50)])},
                {"file_name": "second.csv", "format": "csv", "match_by": "location-id",
                 "bytes": neighborhood_file(&[(2, 29, 18), (3, 29, 20), (4, 29, 25)])},
                {"file_name": "repeat.csv", "format": "csv", "match_by": "location-id",
                 "bytes": neighborhood_file(&[(2, 29, 18)])}
            ],
            "targets": [
                {"load_point_id": 1, "selected_cpt_ids": exact},
                {"load_point_id": 2, "selected_cpt_ids": [4, 3, 2, 1]},
                {"load_point_id": 3, "selected_cpt_ids": exact},
                {"load_point_id": 4, "selected_cpt_ids": if relax { [1, 2, 8, 9] } else { exact }},
                {"load_point_id": 5, "selected_cpt_ids": one_replaced},
                {"load_point_id": 6, "selected_cpt_ids": exact}
            ],
            "settings": { "neighborhood_tolerance_pct": limit, "end_window_increments": 2 }
        }))
        .unwrap();
        serde_json::to_value(preview_pile_driving_files(&request).unwrap()).unwrap()
    }

    #[test]
    fn neighborhood_uses_six_tochten_and_exact_peers_across_open_files() {
        let result = neighborhood_preview(10.0, false);
        let record = &result["files"][0]["preview"]["records"][0];
        let check = record["checks"]
            .as_array()
            .unwrap()
            .iter()
            .find(|check| check["kind"] == "neighborhood")
            .unwrap();
        assert_eq!(check["status"], "warning");
        assert_eq!(check["actual"], 30.0);
        assert_eq!(check["reference"], 20.0);
        assert_eq!(check["other"], 50.0);
        assert_eq!(record["neighborhood"]["relaxed_selection"], false);
        assert_eq!(record["neighborhood"]["peer_count"], 3);
        let peers = record["neighborhood"]["reference_piles"]
            .as_array()
            .unwrap();
        assert_eq!(
            peers
                .iter()
                .map(|peer| peer["load_point_id"].as_u64().unwrap())
                .collect::<Vec<_>>(),
            [2, 3, 4]
        );
        assert_eq!(peers[0]["final_ppn_m"], -17.75);
        assert_eq!(peers[0]["mean_energy_kj"], 37.0);

        let result = neighborhood_preview(50.0, false);
        let record = &result["files"][0]["preview"]["records"][0];
        let check = record["checks"]
            .as_array()
            .unwrap()
            .iter()
            .find(|check| check["kind"] == "neighborhood")
            .unwrap();
        assert_eq!(check["status"], "ok");
        let peers = record["neighborhood"]["reference_piles"]
            .as_array()
            .unwrap();
        assert_eq!(peers.len(), 3);
        assert_eq!(peers[0]["load_point_id"], 2);
        assert_eq!(peers[0]["deviation_pct"], 10.0);
        assert_eq!(peers[0]["exceeds_tolerance"], false);
    }

    #[test]
    fn neighborhood_relaxes_one_cpt_only_when_exact_peers_are_insufficient() {
        let result = neighborhood_preview(10.0, true);
        let record = &result["files"][0]["preview"]["records"][0];
        assert_eq!(record["neighborhood"]["relaxed_selection"], true);
        let peers = record["neighborhood"]["reference_piles"]
            .as_array()
            .unwrap();
        assert_eq!(
            peers
                .iter()
                .map(|peer| peer["load_point_id"].as_u64().unwrap())
                .collect::<Vec<_>>(),
            [2, 3, 5]
        );
        let other_size = &result["files"][0]["preview"]["records"][2];
        let check = other_size["checks"]
            .as_array()
            .unwrap()
            .iter()
            .find(|check| check["kind"] == "neighborhood")
            .unwrap();
        assert_eq!(check["status"], "unavailable");
    }

    #[test]
    fn neighborhood_marks_peer_deviation_against_the_same_reference_and_limit() {
        for (limit, expected) in [
            (9.5, [true, false, true]),
            (10.0, [false, false, true]),
            (25.0, [false, false, false]),
        ] {
            let result = neighborhood_preview(limit, false);
            let peers = result["files"][0]["preview"]["records"][0]["neighborhood"]
                ["reference_piles"]
                .as_array()
                .unwrap();
            for ((peer, deviation), exceeds) in peers.iter().zip([10.0, 0.0, 25.0]).zip(expected) {
                assert_eq!(peer["deviation_pct"], deviation);
                assert_eq!(peer["exceeds_tolerance"], exceeds);
            }
        }
        let result = neighborhood_preview(10.0, false);
        let below_reference = result["files"][1]["preview"]["records"][0]["checks"]
            .as_array()
            .unwrap()
            .iter()
            .find(|check| check["kind"] == "neighborhood")
            .unwrap();
        assert_eq!(below_reference["actual"], 18.0);
        assert_eq!(below_reference["reference"], 25.0);
        assert_eq!(below_reference["other"], 28.0);
    }

    fn energy_example() -> String {
        let mut csv = String::from(
            "paalnummer,datum,dikte_cm,tochtnummer,mm_zakking_per_tocht,energie_per_slag_kj\n",
        );
        for (pile, day, size, energies) in [
            (1, 1, 29, [34, 35, 35, 35, 35, 42]),
            (1, 2, 29, [35; 6]),
            (2, 1, 29, [40; 6]),
            (3, 1, 35, [55; 6]),
        ] {
            for (index, energy) in energies.into_iter().enumerate() {
                use std::fmt::Write;
                writeln!(csv, "{pile},{day},{size},{},250,{energy}", index + 1).unwrap();
            }
        }
        csv
    }

    #[test]
    fn compares_all_measurements_but_excludes_pairs_from_the_same_pile() {
        let csv = energy_example();
        let request = request(csv.as_bytes(), PileDrivingMatchField::LocationId);
        let result = serde_json::to_value(preview_pile_driving(&request).unwrap()).unwrap();
        let groups = &result["energy_by_size"];
        assert_eq!(groups[0]["pile_size_mm"], 290.0);
        assert_eq!(groups[0]["pile_count"], 2);
        assert_eq!(groups[0]["minimum_kj"], 34.0);
        assert_eq!(groups[0]["maximum_kj"], 42.0);
        assert_eq!(groups[0]["spread_kj"], 6.0);
        assert_eq!(groups[0]["status"], "warning");
        assert_eq!(groups[1]["pile_size_mm"], 350.0);
        assert_eq!(groups[1]["status"], "unavailable");
        assert!(result["records"][0]["checks"]
            .as_array()
            .unwrap()
            .iter()
            .all(|check| check["kind"] != "energy" && check["kind"] != "energy-target"));
    }

    #[test]
    fn compares_open_files_without_counting_a_linked_pile_twice_or_losing_readable_files() {
        let day_one: &[u8] = b"paalnummer,dikte_cm,energie_per_slag_kj\nM1,29,20\nM1,29,40\n";
        let day_two: &[u8] =
            b"paalnummer,dikte_cm,energie_per_slag_kj\n1,29,35\n2,29,30\n3,35,50\n";
        let invalid: &[u8] = b"something,else\n1,2\n";
        let request: PileDrivingBatchRequest = serde_json::from_value(serde_json::json!({
            "files": [
                {"file_name": "day-1.csv", "format": "csv", "bytes": day_one, "match_by": "revit-mark"},
                {"file_name": "day-2.csv", "format": "csv", "bytes": day_two, "match_by": "location-id"},
                {"file_name": "invalid.csv", "format": "csv", "bytes": invalid, "match_by": "location-id"}
            ],
            "targets": [{"load_point_id": 1, "revit_mark": "M1"}]
        }))
        .unwrap();

        let result = serde_json::to_value(preview_pile_driving_files(&request).unwrap()).unwrap();
        assert_eq!(result["files"][0]["status"], "ready");
        assert_eq!(result["files"][1]["status"], "ready");
        assert_eq!(
            result["files"][2]["error"]["code"],
            "missing-pile-number-column"
        );
        let groups = &result["energy_by_size"];
        assert_eq!(groups[0]["pile_count"], 2);
        assert_eq!(groups[0]["minimum_kj"], 20.0);
        assert_eq!(groups[0]["maximum_kj"], 40.0);
        assert_eq!(groups[0]["spread_kj"], 10.0);
        assert_eq!(groups[0]["status"], "warning");
        assert_eq!(groups[1]["status"], "unavailable");
    }

    #[test]
    fn shares_column_meanings_across_logs_and_allows_a_file_to_override_them() {
        let request: PileDrivingBatchRequest = serde_json::from_value(serde_json::json!({
            "files": [
                {"file_name": "first.csv", "format": "csv", "match_by": "location-id",
                 "bytes": "Nummer,Dikte (cm),Slagkracht\n1,29,35\n".as_bytes()},
                {"file_name": "reordered.csv", "format": "csv", "match_by": "location-id",
                 "bytes": "Slagkracht,Nummer,Dikte (cm)\n42,2,29\n".as_bytes()},
                {"file_name": "different.csv", "format": "csv", "match_by": "location-id",
                 "bytes": "3;29;37\n".as_bytes(),
                 "table": {"has_headers": false, "delimiter": ";", "columns": [
                     {"column": 1, "field": "paalnummer"},
                     {"column": 2, "field": "dikte_cm"},
                     {"column": 3, "field": "energie_per_slag_kj"}
                 ]}},
                {"file_name": "unmapped.csv", "format": "csv", "match_by": "location-id",
                 "bytes": "Unknown,Slagkracht\n4,38\n".as_bytes()}
            ],
            "targets": [],
            "shared_table": {
                "headers": ["Nummer", "Dikte (cm)", "Slagkracht"],
                "settings": {"has_headers": true, "columns": [
                    {"column": 1, "field": "paalnummer"},
                    {"column": 2, "field": "dikte_cm"},
                    {"column": 3, "field": "energie_per_slag_kj"}
                ]}
            }
        }))
        .unwrap();

        let result = serde_json::to_value(preview_pile_driving_files(&request).unwrap()).unwrap();
        for (index, number) in ["1", "2", "3"].into_iter().enumerate() {
            assert_eq!(
                result["files"][index]["preview"]["records"][0]["pile_number"],
                number
            );
        }
        assert_eq!(
            result["files"][1]["table"]["settings"]["columns"][0]["field"],
            "energie_per_slag_kj"
        );
        assert_eq!(result["energy_by_size"][0]["pile_count"], 3);
        assert_eq!(result["energy_by_size"][0]["spread_kj"], 7.0);
        assert_eq!(
            result["files"][3]["error"]["code"],
            "missing-pile-number-column"
        );
        assert_eq!(
            result["files"][3]["table"]["columns"][0]["header"],
            "Unknown"
        );
    }

    #[test]
    fn a_target_replaces_peer_comparison_for_its_size_and_uses_the_shared_tolerance() {
        let csv = energy_example();
        let request: PileDrivingImportRequest = serde_json::from_value(serde_json::json!({
            "file_name": "energy.csv", "format": "csv", "bytes": csv.as_bytes(),
            "match_by": "location-id", "targets": [],
            "settings": {
                "peer_energy_spread_kj": 0.0,
                "target_energy_tolerance_kj": 2.0,
                "expected_energy": [{"pile_size_mm": 290, "energy_kj": 38.0},
                                    {"pile_size_mm": 350, "energy_kj": 53.0}]
            }
        }))
        .unwrap();
        let result = serde_json::to_value(preview_pile_driving(&request).unwrap()).unwrap();
        assert_eq!(result["energy_by_size"], serde_json::json!([]));
        let checks = |index: usize, kind: &str| -> &serde_json::Value {
            result["records"][index]["checks"]
                .as_array()
                .unwrap()
                .iter()
                .find(|check| check["kind"] == kind)
                .unwrap()
        };
        assert_eq!(checks(0, "energy-target")["status"], "warning");
        assert_eq!(checks(1, "energy-target")["status"], "warning");
        assert_eq!(checks(2, "energy-target")["status"], "ok");
        assert_eq!(checks(3, "energy-target")["status"], "ok");
    }

    #[test]
    fn evaluates_the_whole_record_and_falls_back_for_sizes_without_a_target() {
        let mut csv = String::from(
            "paalnummer,dikte_cm,tochtnummer,mm_zakking_per_tocht,energie_per_slag_kj\n1,29,1,250,29\n",
        );
        for number in 2..=7 {
            use std::fmt::Write;
            writeln!(csv, "1,29,{number},250,35").unwrap();
        }
        csv.push_str("2,35,1,250,43\n3,35,1,250,46\n4,29,1,250,35\n4,29,2,250,\n");
        let request: PileDrivingImportRequest = serde_json::from_value(serde_json::json!({
            "file_name": "energy.csv", "format": "csv", "bytes": csv.as_bytes(),
            "match_by": "location-id", "targets": [],
            "settings": {
                "target_energy_tolerance_kj": 2.0,
                "expected_energy": [{"pile_size_mm": 290, "energy_kj": 35.0}]
            }
        }))
        .unwrap();
        let result = serde_json::to_value(preview_pile_driving(&request).unwrap()).unwrap();
        assert_eq!(result["records"][0]["checks"][5]["status"], "warning");
        assert_eq!(result["records"][0]["checks"][5]["actual"], 29.0);
        assert_eq!(result["records"][3]["checks"][5]["status"], "unavailable");
        let groups = result["energy_by_size"].as_array().unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0]["pile_size_mm"], 350.0);
        assert_eq!(groups[0]["spread_kj"], 3.0);
    }

    fn request(bytes: &[u8], match_by: PileDrivingMatchField) -> PileDrivingImportRequest {
        PileDrivingImportRequest {
            file_name: "driving.csv".to_owned(),
            format: SourceFormat::Csv,
            bytes: bytes.to_vec(),
            match_by,
            ignore_csv_leading_zeros: None,
            pile_head_level_m: None,
            settings: Default::default(),
            targets: vec![
                PileDrivingTarget {
                    load_point_id: 1,
                    revit_mark: Some("2".to_owned()),
                    configuration: None,
                    selected_cpt_ids: vec![],
                },
                PileDrivingTarget {
                    load_point_id: 2,
                    revit_mark: Some("001".to_owned()),
                    configuration: None,
                    selected_cpt_ids: vec![],
                },
                PileDrivingTarget {
                    load_point_id: 3,
                    revit_mark: None,
                    configuration: None,
                    selected_cpt_ids: vec![],
                },
            ],
        }
    }

    #[test]
    fn uses_only_the_selected_identifier_and_keeps_the_measurement_rows() {
        let mut request = request(
            b"paalnummer;tochtnummer;slagen\n2;1;21\n2;2;25\n001;1;20\n3;1;16\n",
            PileDrivingMatchField::RevitMark,
        );
        let result = preview_pile_driving(&request).unwrap();
        assert_eq!(result.records.len(), 3);
        assert_eq!(result.records[0].rows.len(), 2);
        assert_eq!(
            result.records[0].matching,
            PileDrivingMatch::Matched { load_point_id: 1 }
        );
        assert_eq!(
            result.records[1].matching,
            PileDrivingMatch::Matched { load_point_id: 2 }
        );
        assert_eq!(result.records[2].matching, PileDrivingMatch::Unmatched);

        request.match_by = PileDrivingMatchField::LocationId;
        let result = preview_pile_driving(&request).unwrap();
        assert_eq!(
            result.records[0].matching,
            PileDrivingMatch::Matched { load_point_id: 2 }
        );
        assert_eq!(
            result.records[1].matching,
            PileDrivingMatch::Matched { load_point_id: 1 }
        );
        assert_eq!(
            result.records[2].matching,
            PileDrivingMatch::Matched { load_point_id: 3 }
        );
    }

    #[test]
    fn duplicate_marks_are_ambiguous_and_separate_recordings_stay_separate() {
        let mut request = request(
            b"paalnummer,paal_id,datum,tochtnummer\n2,a,2026-10-26,1\n2,b,2026-10-27,1\n",
            PileDrivingMatchField::RevitMark,
        );
        request.targets[1].revit_mark = Some("2".to_owned());
        let result = preview_pile_driving(&request).unwrap();
        assert_eq!(result.records.len(), 2);
        assert!(result
            .records
            .iter()
            .all(|record| record.matching == PileDrivingMatch::Ambiguous));
    }

    #[test]
    fn csv_preview_ignores_leading_zeros_by_default_and_respects_exact_matching() {
        let source = |option: Option<bool>| {
            let mut source = serde_json::json!({
                "file_name": "driving.csv", "format": "csv", "match_by": "revit-mark",
                "bytes": "paalnummer,slagen\n1,23\n001,25\n000,15\n999999999999999999999999,16\n1-A,18\n".as_bytes()
            });
            if let Some(option) = option {
                source["ignore_csv_leading_zeros"] = option.into();
            }
            source
        };
        let mut input = serde_json::json!({
            "files": [source(None), source(Some(false))],
            "targets": [
                {"load_point_id": 10, "revit_mark": "001"},
                {"load_point_id": 20, "revit_mark": "0"},
                {"load_point_id": 30, "revit_mark": "0999999999999999999999999"},
                {"load_point_id": 40, "revit_mark": "01-A"}
            ]
        });
        let preview = |input| {
            let request = serde_json::from_value(input).unwrap();
            serde_json::to_value(preview_pile_driving_files(&request).unwrap()).unwrap()
        };
        let result = preview(input.clone());
        let automatic = &result["files"][0]["preview"]["records"];
        let exact = &result["files"][1]["preview"]["records"];
        assert_eq!(automatic[0]["pile_number"], "1");
        assert_eq!(automatic[0]["matching"]["load_point_id"], 10);
        assert_eq!(automatic[0]["matched_pile_number"], "001");
        assert_eq!(automatic[0]["row_numbers"], serde_json::json!([2]));
        assert_eq!(automatic[1]["pile_number"], "001");
        assert_eq!(automatic[2]["matching"]["load_point_id"], 20);
        assert_eq!(automatic[3]["matching"]["load_point_id"], 30);
        assert_eq!(automatic[4]["matching"]["status"], "unmatched");
        assert_eq!(exact[0]["matching"]["status"], "unmatched");
        assert_eq!(exact[1]["matching"]["load_point_id"], 10);

        input["targets"]
            .as_array_mut()
            .unwrap()
            .push(serde_json::json!({"load_point_id": 11, "revit_mark": "1"}));
        let result = preview(input);
        assert_eq!(
            result["files"][0]["preview"]["records"][0]["matching"]["status"],
            "ambiguous"
        );
        assert_eq!(
            result["files"][1]["preview"]["records"][0]["matching"]["load_point_id"],
            11
        );
    }

    #[test]
    fn excel_preview_distinguishes_numeric_cells_from_identically_displayed_text() {
        let mut workbook = rust_xlsxwriter::Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.write_string(0, 0, "Paalnummer").unwrap();
        sheet.write_number(1, 0, 1).unwrap();
        sheet.write_string(2, 0, "1").unwrap();
        sheet.write_string(3, 0, "001").unwrap();
        sheet.write_number(4, 0, 1.5).unwrap();
        sheet.write_string(5, 0, "1.5").unwrap();
        let mut request = request(&[], PileDrivingMatchField::RevitMark);
        request.format = SourceFormat::Xlsx;
        request.file_name = "driving.xlsx".to_owned();
        request.bytes = workbook.save_to_buffer().unwrap();
        request.targets[2].revit_mark = Some("1.5".to_owned());

        let result = preview_pile_driving(&request).unwrap();
        assert_eq!(result.records.len(), 5);
        assert_eq!(
            result.records[0].matching,
            PileDrivingMatch::Matched { load_point_id: 2 }
        );
        assert_eq!(result.records[1].matching, PileDrivingMatch::Unmatched);
        assert_eq!(
            result.records[2].matching,
            PileDrivingMatch::Matched { load_point_id: 2 }
        );
        assert_eq!(result.records[3].matching, PileDrivingMatch::Unmatched);
        assert_eq!(
            result.records[4].matching,
            PileDrivingMatch::Matched { load_point_id: 3 }
        );

        request.targets[0].revit_mark = Some("1".to_owned());
        let result = preview_pile_driving(&request).unwrap();
        assert_eq!(result.records[0].matching, PileDrivingMatch::Ambiguous);
        assert_eq!(
            result.records[1].matching,
            PileDrivingMatch::Matched { load_point_id: 1 }
        );
        assert_eq!(result.records[2].pile_number, "001");
    }

    #[test]
    fn reports_a_missing_number_with_the_source_row() {
        let request = request(
            b"paalnummer,slagen\n,23\n",
            PileDrivingMatchField::RevitMark,
        );
        assert_eq!(
            preview_pile_driving(&request).unwrap_err(),
            PileDrivingImportError::MissingPileNumber { row: 2 },
        );
    }

    #[test]
    fn reads_the_excel_worksheet_with_a_pile_number_column() {
        let mut workbook = rust_xlsxwriter::Workbook::new();
        workbook
            .add_worksheet()
            .write_string(0, 0, "Project")
            .unwrap();
        let sheet = workbook.add_worksheet();
        sheet.write_string(0, 0, "Paalnummer").unwrap();
        sheet.write_string(0, 1, "Slagen").unwrap();
        sheet.write_string(0, 2, "Datum").unwrap();
        sheet.write_number(1, 0, 2).unwrap();
        sheet.write_number(1, 1, 24).unwrap();
        sheet
            .write_datetime_with_format(
                1,
                2,
                rust_xlsxwriter::ExcelDateTime::from_ymd(2026, 11, 10).unwrap(),
                &rust_xlsxwriter::Format::new().set_num_format("dd-mm-yyyy"),
            )
            .unwrap();
        let mut request = request(&[], PileDrivingMatchField::RevitMark);
        request.file_name = "driving.xlsx".to_owned();
        request.format = SourceFormat::Xlsx;
        request.bytes = workbook.save_to_buffer().unwrap();

        let result = preview_pile_driving(&request).unwrap();
        assert_eq!(result.records[0].rows, vec![vec!["2", "24", "2026-11-10"]]);
        assert_eq!(
            result.records[0].matching,
            PileDrivingMatch::Matched { load_point_id: 1 }
        );
    }
}
