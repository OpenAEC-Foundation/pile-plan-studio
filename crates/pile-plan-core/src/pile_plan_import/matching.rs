use super::*;
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ImportLocation {
    pub id: u32,
    pub row: usize,
    pub source_id: Option<u32>,
    pub x_mm: Option<f64>,
    pub y_mm: Option<f64>,
    pub pile_size_mm: Option<u32>,
    pub tip_level_mm: Option<i64>,
}
impl From<&ParsedPilePlanRow> for ImportLocation {
    fn from(row: &ParsedPilePlanRow) -> Self {
        let pile = if let PilePlanImportedValue::Set(p) = &row.pile {
            Some(p)
        } else {
            None
        };
        Self {
            id: row.row as u32,
            row: row.row,
            source_id: row.source_id,
            x_mm: row.x_mm,
            y_mm: row.y_mm,
            pile_size_mm: pile.map(|p| p.pile_size_mm),
            tip_level_mm: pile.map(|p| p.pile_tip_level_mm),
        }
    }
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ImportLink {
    pub old_id: u32,
    pub new_id: u32,
    pub distance_mm: Option<f64>,
}
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct ImportMatching {
    pub old_order: Vec<u32>,
    pub new_order: Vec<u32>,
    pub links: Vec<ImportLink>,
    pub added: Vec<u32>,
    pub removed: Vec<u32>,
    pub unmatched_old: Vec<u32>,
    pub unmatched_new: Vec<u32>,
    pub proposals: Vec<crate::LocationProposal>,
    pub complete: bool,
}
fn distance(row: &ParsedPilePlanRow, p: &ProjectLoadPoint) -> Option<f64> {
    row.x_mm
        .zip(row.y_mm)
        .map(|(x, y)| coordinate_distance(x, y, p.x_mm, p.y_mm))
}
pub(super) fn evaluate(
    request: &PilePlanImportRequest,
    rows: &[ParsedPilePlanRow],
) -> Result<ImportMatching, PilePlanImportDiagnostic> {
    let mut result = ImportMatching::default();
    let known_rows: HashSet<_> = rows.iter().map(|r| r.row as u32).collect();
    let known_points: HashSet<_> = request.load_points.iter().map(|p| p.id).collect();
    if let Some(d) = &request.options.location_decisions {
        let mut source = HashSet::new();
        let mut target = HashSet::new();
        if !d.removed.is_empty()
            || d.links.iter().any(|l| {
                !known_rows.contains(&l.new_id)
                    || !known_points.contains(&l.old_id)
                    || !source.insert(l.new_id)
                    || !target.insert(l.old_id)
            })
            || d.added
                .iter()
                .any(|id| !known_rows.contains(id) || !source.insert(*id))
        {
            let mut error = mapping_error("Invalid import location associations.");
            error.code = PilePlanImportDiagnosticCode::InvalidLocationMapping;
            return Err(error);
        }
    }
    let decisions = request.options.location_decisions.as_ref();
    for row in rows {
        let key = row.row as u32;
        let mut candidates = request
            .load_points
            .iter()
            .filter_map(|p| {
                distance(row, p)
                    .filter(|d| *d <= request.options.coordinate_tolerance_mm)
                    .map(|d| crate::LocationCandidate {
                        old_id: p.id,
                        distance_mm: d,
                    })
            })
            .collect::<Vec<_>>();
        candidates.sort_by(|a, b| {
            a.distance_mm
                .total_cmp(&b.distance_mm)
                .then(a.old_id.cmp(&b.old_id))
        });
        if !candidates.is_empty() {
            result.proposals.push(crate::LocationProposal {
                new_id: key,
                candidates: candidates.clone(),
            });
        }
        if decisions.is_some_and(|d| d.added.contains(&key)) {
            result.added.push(key);
            continue;
        }
        let automatic = if decisions.is_none() {
            row.source_id
                .and_then(|id| {
                    request.load_points.iter().find(|p| {
                        p.id == id
                            && distance(row, p)
                                .is_none_or(|d| d <= request.options.coordinate_tolerance_mm)
                    })
                })
                .map(|p| p.id)
                .or_else(|| (candidates.len() == 1).then(|| candidates[0].old_id))
        } else {
            None
        };
        let target = decisions
            .and_then(|d| d.links.iter().find(|l| l.new_id == key).map(|l| l.old_id))
            .or(automatic);
        if let Some(id) = target {
            let p = request.load_points.iter().find(|p| p.id == id).unwrap();
            result.links.push(ImportLink {
                old_id: id,
                new_id: key,
                distance_mm: distance(row, p),
            });
        } else {
            result.unmatched_new.push(key);
        }
    }
    match request.options.bulk_action {
        Some(crate::LocationBulkAction::Separate) => result.added.append(&mut result.unmatched_new),
        Some(
            action @ (crate::LocationBulkAction::Nearest | crate::LocationBulkAction::Automatic),
        ) => {
            // An explicit nearest action may go beyond automatic tolerance,
            // using the same distance ordering as source refresh and revisions.
            let occupied: HashSet<_> = result.links.iter().map(|l| l.old_id).collect();
            let nearest = crate::reconcile_locations(&crate::LocationMatchingRequest {
                old_locations: request
                    .load_points
                    .iter()
                    .filter(|p| !occupied.contains(&p.id))
                    .map(|p| crate::NumberingPoint {
                        id: p.id,
                        x_mm: p.x_mm,
                        y_mm: p.y_mm,
                    })
                    .collect(),
                new_locations: rows
                    .iter()
                    .filter(|r| result.unmatched_new.contains(&(r.row as u32)))
                    .filter_map(|r| {
                        r.x_mm
                            .zip(r.y_mm)
                            .map(|(x_mm, y_mm)| crate::NumberingPoint {
                                id: r.row as u32,
                                x_mm,
                                y_mm,
                            })
                    })
                    .collect(),
                tolerance_mm: request.options.coordinate_tolerance_mm,
                decisions: Some(crate::LocationDecisions::default()),
                bulk_action: Some(action),
            })
            .map_err(|e| {
                let mut error = mapping_error(&e.to_string());
                error.code = PilePlanImportDiagnosticCode::InvalidLocationMapping;
                error
            })?;
            let linked: HashSet<_> = nearest.links.iter().map(|l| l.new_id).collect();
            result.unmatched_new.retain(|id| !linked.contains(id));
            result
                .links
                .extend(nearest.links.into_iter().map(|l| ImportLink {
                    old_id: l.old_id,
                    new_id: l.new_id,
                    distance_mm: Some(l.distance_mm),
                }));
        }
        None => {}
    }
    let point = |id, x_mm, y_mm| crate::NumberingPoint { id, x_mm, y_mm };
    let order_error = |e: crate::ExportError| mapping_error(&e.to_string());
    result.old_order = crate::location_matching::review_location_order(
        &request
            .load_points
            .iter()
            .map(|p| point(p.id, p.x_mm, p.y_mm))
            .collect::<Vec<_>>(),
    )
    .map_err(order_error)?;
    result.new_order = crate::location_matching::review_location_order(
        &rows
            .iter()
            .filter_map(|r| r.x_mm.zip(r.y_mm).map(|(x, y)| point(r.row as u32, x, y)))
            .collect::<Vec<_>>(),
    )
    .map_err(order_error)?;
    result.new_order.extend(
        rows.iter()
            .filter(|r| r.x_mm.is_none() || r.y_mm.is_none())
            .map(|r| r.row as u32),
    );
    result.complete = result.unmatched_new.is_empty();
    Ok(result)
}
