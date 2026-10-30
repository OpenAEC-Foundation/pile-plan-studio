use crate::{
    build_pile_option_analysis_for_groups, calculate_pile_cost, evaluate_pile_cap_proposals, read_ifcpp_str,
    write_project_document, ExportError, ExportField, PileCapProposalRequest, PileConfigurationKey,
    PileConfigurationOption, PilePlanExportOptions, PilePlanExportRequest, PilePlanProject,
    ProjectDocumentDraft, ProjectLoadPoint,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ExportProjectContext {
    pub draft: ProjectDocumentDraft,
    pub plan_id: String,
}

pub(crate) struct PreparedExport {
    pub plan: PilePlanExportRequest,
    pub facts: HashMap<u32, HashMap<ExportField, Value>>,
    pub replaced: Vec<ProjectLoadPoint>,
    pub proposed: HashSet<u32>,
}

pub(crate) fn prepare(
    input: &PilePlanExportRequest,
    options: &PilePlanExportOptions,
) -> Result<PreparedExport, ExportError> {
    let mut out = PreparedExport {
        plan: input.clone(),
        facts: HashMap::new(),
        replaced: vec![],
        proposed: HashSet::new(),
    };
    out.plan.project_context = None;
    let Some(context) = &input.project_context else {
        for p in &input.load_points {
            out.facts.insert(
                p.id,
                HashMap::from([
                    (ExportField::ExportId, json!(p.id)),
                    (ExportField::OriginalLocations, json!(p.id.to_string())),
                ]),
            );
        }
        return Ok(out);
    };
    let text =
        write_project_document(context.draft.clone()).map_err(|e| ExportError(e.to_string()))?;
    let project = read_ifcpp_str(&text).map_err(|e| ExportError(e.to_string()))?;
    let plan = project
        .user_state
        .pile_plans
        .iter()
        .find(|p| p.id == context.plan_id)
        .ok_or_else(|| ExportError("unknown_plan".into()))?;
    out.plan.load_points = project.inputs.load_points.clone();
    out.plan.selected_piles = plan
        .selected_piles
        .iter()
        .filter_map(|(id, c)| c.pile.clone().map(|p| (*id, p)))
        .collect();
    out.plan.pile_shapes = project
        .settings
        .pile_costs
        .items
        .iter()
        .map(|i| (i.pile_size_mm, i.shape.clone()))
        .collect();
    let analysis = build_pile_option_analysis_for_groups(
        &project.inputs.load_points,
        &project.inputs.cpts,
        &project.inputs.bearing_capacities,
        |p| {
            project
                .settings
                .cpt_selection_by_load_point
                .get(&p.id)
                .unwrap_or(&project.settings.global_cpt_selection)
                .clone()
        },
        &project.user_state.manual_cpt_selections,
        false,
        &crate::derive_load_point_groups(&project.inputs.load_points,&project.settings.load_point_grouping).groups,
    )
    .map_err(|e| ExportError(e.to_string()))?;
    out.plan.selected_cpts = analysis
        .selected_cpts_by_load_point
        .iter()
        .map(|(id, selections)| (*id, selections.iter().map(|s| s.cpt.id).collect()))
        .collect();
    for p in &out.plan.load_points {
        let key = out.plan.selected_piles.get(&p.id);
        let selected = out
            .plan
            .selected_cpts
            .get(&p.id)
            .is_some_and(|v| !v.is_empty());
        let option = key.and_then(|k| {
            analysis
                .pile_options_by_load_point
                .get(&p.id)?
                .iter()
                .find(|o| o.configuration == *k)
        });
        out.facts.insert(
            p.id,
            facts(
                p.id,
                &[p.id],
                &p.tension,
                key,
                option,
                selected,
                &project,
                options,
            ),
        );
    }
    if options.include_proposals && !plan.pile_cap_proposals.is_empty() {
        let result = evaluate_pile_cap_proposals(PileCapProposalRequest {
            draft: context.draft.clone(),
            edit: None,
        })
        .map_err(ExportError)?;
        let mut previews = result
            .plans
            .into_iter()
            .find(|p| p.plan_id == context.plan_id)
            .ok_or_else(|| ExportError("unknown_plan".into()))?
            .previews;
        previews.sort_by(|a, b| a.proposal.load_point_ids.cmp(&b.proposal.load_point_ids));
        let mut next = out.plan.load_points.iter().map(|p| p.id).max().unwrap_or(0);
        let replaced: HashSet<_> = previews
            .iter()
            .flat_map(|p| p.proposal.load_point_ids.iter().copied())
            .collect();
        out.replaced = out
            .plan
            .load_points
            .iter()
            .filter(|p| replaced.contains(&p.id))
            .cloned()
            .collect();
        out.plan.load_points.retain(|p| !replaced.contains(&p.id));
        out.plan
            .selected_piles
            .retain(|id, _| !replaced.contains(id));
        for preview in previews {
            if !matches!(preview.status, "active" | "missing_cpt_selection") {
                return Err(ExportError("invalid_export_proposal".into()));
            }
            let key = preview.proposal.configuration.as_ref();
            let option = key
                .and_then(|k| {
                    preview
                        .options
                        .iter()
                        .find(|o| o.option.configuration == *k)
                })
                .map(|o| &o.option);
            for position in &preview.positions {
                next = next
                    .checked_add(1)
                    .ok_or_else(|| ExportError("export_id_overflow".into()))?;
                out.proposed.insert(next);
                out.plan.load_points.push(ProjectLoadPoint {
                    tension: preview.tension_per_pile.clone(),
                    id: next,
                    name: format!("Proposal {next}"),
                    x_mm: position.x_mm,
                    y_mm: position.y_mm,
                    design_load_kn: preview
                        .load_per_pile_kn
                        .ok_or_else(|| ExportError("invalid_export_proposal".into()))?,
                });
                if let Some(key) = key {
                    out.plan.selected_piles.insert(next, key.clone());
                }
                out.plan.selected_cpts.insert(next, preview.cpt_ids.clone());
                out.facts.insert(
                    next,
                    facts(
                        next,
                        &preview.proposal.load_point_ids,
                        &preview.tension_per_pile,
                        key,
                        option,
                        preview.missing_selection_load_point_ids.is_empty()
                            && !preview.cpt_ids.is_empty(),
                        &project,
                        options,
                    ),
                );
                let row = out.facts.get_mut(&next).unwrap();
                row.insert(ExportField::LoadPointId, Value::Null);
                row.insert(ExportField::ProposalCode, json!(options.proposal_code));
            }
        }
    }
    Ok(out)
}

fn facts(
    id: u32,
    origins: &[u32],
    tension: &crate::TensionDemand,
    key: Option<&PileConfigurationKey>,
    option: Option<&PileConfigurationOption>,
    selected: bool,
    project: &PilePlanProject,
    options: &PilePlanExportOptions,
) -> HashMap<ExportField, Value> {
    let complete = selected
        && option.is_some_and(|o| {
            o.compression
                .as_ref()
                .map(|a| a.missing_cpt_ids.is_empty() && a.governing_frd_kn.is_some())
                .unwrap_or(o.missing_cpt_ids.is_empty() && o.governing_frd_kn.is_some())
        });
    let status = if key.is_none() {
        "unassigned"
    } else if !selected {
        "no_cpts"
    } else if option.is_none() {
        "missing"
    } else if matches!(tension, crate::TensionDemand::Missing) {
        "missing_demand"
    } else if option.is_some_and(|o| {
        o.technical_status == crate::PileOptionTechnicalStatus::MissingCapacityData
    }) {
        "missing"
    } else if option.unwrap().is_option {
        "valid"
    } else {
        "insufficient"
    };
    let status_code = status;
    let nl = options.language != "en";
    let status = match (status, nl) {
        ("unassigned", true) => "Niet toegewezen",
        ("unassigned", false) => "Not assigned",
        ("no_cpts", true) => "Geen sonderingen geselecteerd",
        ("no_cpts", false) => "No CPTs selected",
        ("missing_demand", true) => "Trekbelasting ontbreekt",
        ("missing_demand", false) => "Tension load missing",
        ("missing", true) => "Ontbrekende capaciteitsgegevens",
        ("missing", false) => "Missing capacity data",
        ("valid", true) => "Voldoende capaciteit",
        ("valid", false) => "Sufficient capacity",
        (_, true) => "Onvoldoende capaciteit",
        (_, false) => "Insufficient capacity",
    };
    let length = key.and_then(|k| {
        project
            .settings
            .pile_head_level_m
            .map(|head| (head - k.pile_tip_level_m()).abs())
    });
    let cost = key.and_then(|k| {
        project.settings.pile_head_level_m.and_then(|head| {
            calculate_pile_cost(
                k.pile_size_mm,
                k.pile_tip_level_m(),
                head,
                &project.settings.pile_costs,
            )
        })
    });
    let mut result = HashMap::from([
        (ExportField::ExportId, json!(id)),
        (
            ExportField::OriginalLocations,
            json!(origins
                .iter()
                .map(u32::to_string)
                .collect::<Vec<_>>()
                .join(", ")),
        ),
        (
            ExportField::TechnicalStatus,
            json!({"code":status_code,"label":status}),
        ),
        (
            ExportField::CompressionResistance,
            json!(option.filter(|_| complete).and_then(|o| o.governing_frd_kn)),
        ),
        (
            ExportField::CompressionUtilization,
            json!(option
                .filter(|_| complete)
                .and_then(|o| o.utilization)
                .map(|u| u * 100.0)),
        ),
        (
            ExportField::GoverningCpt,
            json!(option.filter(|_| complete).and_then(|o| o.governing_cpt_id)),
        ),
        (ExportField::PileLength, json!(length)),
        (ExportField::PileCost, json!(cost)),
    ]);
    let pressure = option.and_then(|o| o.compression.as_ref());
    let tensile = option.and_then(|o| o.tension.as_ref());
    // Demand is exported even for an unassigned location; capacity facts require
    // a selected configuration and complete directional source data.
    result.insert(
        ExportField::TensionLoad,
        json!(match tension {
            crate::TensionDemand::Known { value_kn } => Some(*value_kn),
            _ => None,
        }),
    );
    result.insert(
        ExportField::AssessmentScope,
        json!(match (tension, nl) {
            (crate::TensionDemand::NotImported, true) => "Druk; trek niet beoordeeld",
            (crate::TensionDemand::NotImported, false) => "Compression; tension not assessed",
            (_, true) => "Druk en trek",
            (_, false) => "Compression and tension",
        }),
    );
    let complete_tension = selected
        && tensile.is_some_and(|a| {
            a.missing_cpt_ids.is_empty()
                && !matches!(
                    a.status,
                    crate::DirectionStatus::MissingCapacityData
                        | crate::DirectionStatus::MissingDemand
                        | crate::DirectionStatus::NotAssessed
                )
        });
    result.insert(
        ExportField::TensionResistance,
        json!(tensile
            .filter(|_| complete_tension)
            .and_then(|a| a.governing_frd_kn)),
    );
    result.insert(
        ExportField::TensionUtilization,
        json!(tensile
            .filter(|_| complete_tension)
            .and_then(|a| a.utilization)
            .map(|u| u * 100.)),
    );
    result.insert(
        ExportField::GoverningTensionCpt,
        json!(tensile
            .filter(|_| complete_tension)
            .and_then(|a| a.governing_cpt_id)),
    );
    let tension_status = match tension {
        crate::TensionDemand::NotImported => Some(crate::DirectionStatus::NotAssessed),
        crate::TensionDemand::Missing => Some(crate::DirectionStatus::MissingDemand),
        _ => tensile.map(|a| a.status),
    };
    result.insert(
        ExportField::CompressionStatus,
        directional_status(pressure.map(|a| a.status), key.is_some(), selected, nl),
    );
    result.insert(
        ExportField::TensionStatus,
        directional_status(tension_status, key.is_some(), selected, nl),
    );
    result
}
fn directional_status(
    status: Option<crate::DirectionStatus>,
    assigned: bool,
    selected: bool,
    nl: bool,
) -> Value {
    use crate::DirectionStatus::*;
    let (code, label) = match status {
        Some(NotAssessed) => (
            "not_assessed",
            if nl {
                "Trek niet beoordeeld"
            } else {
                "Tension not assessed"
            },
        ),
        Some(MissingDemand) => (
            "missing_demand",
            if nl {
                "Trekbelasting ontbreekt"
            } else {
                "Tension load missing"
            },
        ),
        Some(NoLoad) => ("no_load", if nl { "Geen belasting" } else { "No load" }),
        _ if !assigned => (
            "unassigned",
            if nl {
                "Niet toegewezen"
            } else {
                "Not assigned"
            },
        ),
        _ if !selected => (
            "no_cpts",
            if nl {
                "Geen sonderingen geselecteerd"
            } else {
                "No CPTs selected"
            },
        ),
        Some(Valid) => (
            "valid",
            if nl {
                "Voldoende capaciteit"
            } else {
                "Sufficient capacity"
            },
        ),
        Some(InsufficientCapacity) => (
            "insufficient",
            if nl {
                "Onvoldoende capaciteit"
            } else {
                "Insufficient capacity"
            },
        ),
        _ => (
            "missing",
            if nl {
                "Ontbrekende capaciteitsgegevens"
            } else {
                "Missing capacity data"
            },
        ),
    };
    json!({"code":code,"label":label})
}
