//! Bulk read-only analysis transport. Engineering requests and results stay unchanged.
use flate2::{read::GzDecoder, write::GzEncoder, Compression};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::borrow::Cow;
use std::io::{Read, Write};
use tauri::ipc::{InvokeBody, Request, Response};

#[derive(Deserialize)]
#[serde(tag = "command", content = "request", rename_all = "snake_case")]
enum AnalysisRequest {
    CalculatePileOptionAnalysis(pile_plan_core::PileOptionAnalysisRequest),
    AssessTechnicalAssignment(pile_plan_core::TechnicalAssignmentRequest),
    AggregatePileOptions(pile_plan_core::AggregatePileOptionsRequest),
    ChooseDefaultOptions(pile_plan_core::DefaultPileOptionsRequest),
    BuildTipLevelRegionTopology(pile_plan_core::TipLevelRegionTopologyRequest),
}

/// Raw bytes bypass Tauri's large intermediate JSON tree. Decoding, core work and
/// encoding all execute in the async command context, away from the window thread.
#[tauri::command(async)]
pub fn run_analysis_payload(request: Request<'_>) -> Result<Response, Value> {
    let bytes: Cow<'_, [u8]> = match request.body() {
        InvokeBody::Raw(bytes) => Cow::Borrowed(bytes),
        // Tauri's postMessage fallback wraps ArrayBuffer bytes as a JSON array.
        InvokeBody::Json(Value::Array(values)) => Cow::Owned(
            values
                .iter()
                .map(|value| {
                    value
                        .as_u64()
                        .and_then(|byte| u8::try_from(byte).ok())
                        .ok_or_else(|| Value::String("Invalid analysis byte".into()))
                })
                .collect::<Result<Vec<_>, _>>()?,
        ),
        _ => return Err(Value::String("Expected compressed analysis bytes".into())),
    };
    let mut decoded = Vec::new();
    GzDecoder::new(bytes.as_ref())
        .read_to_end(&mut decoded)
        .map_err(transport_error)?;
    let request: AnalysisRequest = serde_json::from_slice(&decoded).map_err(transport_error)?;
    drop(decoded);
    match request {
        AnalysisRequest::CalculatePileOptionAnalysis(request) => {
            encode(super::calculate_pile_option_analysis(request).map_err(core_error)?)
        }
        AnalysisRequest::AssessTechnicalAssignment(request) => {
            encode(super::assess_technical_assignment(request).map_err(core_error)?)
        }
        AnalysisRequest::AggregatePileOptions(request) => {
            encode(super::aggregate_pile_options(request))
        }
        AnalysisRequest::ChooseDefaultOptions(request) => {
            encode(super::choose_default_options(request))
        }
        AnalysisRequest::BuildTipLevelRegionTopology(request) => {
            encode(super::build_tip_level_region_topology(request))
        }
    }
}

fn encode(result: impl Serialize) -> Result<Response, Value> {
    let json = serde_json::to_vec(&result).map_err(transport_error)?;
    let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
    encoder.write_all(&json).map_err(transport_error)?;
    Ok(Response::new(encoder.finish().map_err(transport_error)?))
}

fn transport_error(error: impl std::fmt::Display) -> Value {
    Value::String(format!("Analysis transport: {error}"))
}

fn core_error(error: impl Serialize) -> Value {
    serde_json::to_value(error).unwrap_or_else(transport_error)
}
