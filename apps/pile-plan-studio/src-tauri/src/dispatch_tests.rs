use super::*;
use serde_json::{json, Value};
use std::{sync::mpsc, thread, time::Duration};
use tauri::{
    ipc::{CallbackFn, InvokeBody, InvokeResponse},
    test::{mock_builder, mock_context, noop_assets},
};

/// Exercise the actual command registration and responder, not a test-only command.
fn invoke(command: &str, request: Value) -> (Result<Value, Value>, thread::ThreadId) {
    invoke_body(command, InvokeBody::Json(json!({"request": request})))
}

fn invoke_body(command: &str, body: InvokeBody) -> (Result<Value, Value>, thread::ThreadId) {
    let app = mock_builder()
        .invoke_handler(tauri::generate_handler![
            run_analysis_payload,
            calculate_pile_option_analysis,
            read_project_document,
            build_load_point_topology,
        ])
        .build(mock_context(noop_assets()))
        .unwrap();
    let window = tauri::WebviewWindowBuilder::new(&app, "main", tauri::WebviewUrl::default())
        .build()
        .unwrap();
    let (tx, rx) = mpsc::sync_channel(1);
    window.as_ref().clone().on_message(
        tauri::webview::InvokeRequest {
            cmd: command.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: if cfg!(windows) {
                "http://tauri.localhost"
            } else {
                "tauri://localhost"
            }
            .parse()
            .unwrap(),
            body,
            headers: Default::default(),
            invoke_key: tauri::test::INVOKE_KEY.into(),
        },
        Box::new(move |_, _, response, _, _| {
            let result = match response {
                InvokeResponse::Ok(tauri::ipc::InvokeResponseBody::Raw(bytes)) => {
                    use std::io::Read;
                    let mut decoded = Vec::new();
                    flate2::read::GzDecoder::new(bytes.as_slice())
                        .read_to_end(&mut decoded)
                        .unwrap();
                    Ok(serde_json::from_slice(&decoded).unwrap())
                }
                InvokeResponse::Ok(body) => Ok(body.deserialize::<Value>().unwrap()),
                InvokeResponse::Err(error) => Err(error.0),
            };
            tx.send((result, thread::current().id())).unwrap();
        }),
    );
    rx.recv_timeout(Duration::from_secs(10))
        .expect("Native command did not complete")
}

fn compressed_request(command: &str, request: Value) -> InvokeBody {
    use std::io::Write;
    let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
    encoder
        .write_all(&serde_json::to_vec(&json!({"command":command,"request":request})).unwrap())
        .unwrap();
    InvokeBody::Raw(encoder.finish().unwrap())
}

#[test]
fn bulk_analysis_retains_complete_core_facts_and_runs_off_the_calling_thread() {
    let p = pile_plan_core::read_project_document(include_str!(
        "../../../../sample_project/sample_project.ifcpp"
    ))
    .unwrap()
    .project;
    let request = json!({"load_points":p.inputs.load_points,"cpts":p.inputs.cpts,"bearing_capacities":p.inputs.bearing_capacities,
        "global_settings":p.settings.global_cpt_selection,"settings_by_load_point":p.settings.cpt_selection_by_load_point,
        "manual_cpt_ids_by_load_point":p.user_state.manual_cpt_selections,"include_cpt_frd_rows":true,
        "grouping_settings":p.settings.load_point_grouping});
    // Compare wire-to-wire, including the ordinary IPC request/response JSON
    // boundaries, rather than an in-memory f64 Value with no wire round trip.
    let wire_request = serde_json::from_slice(&serde_json::to_vec(&request).unwrap()).unwrap();
    let (expected, _) = invoke("calculate_pile_option_analysis", wire_request);
    let (actual, completed_on) = invoke_body(
        "run_analysis_payload",
        compressed_request("calculate_pile_option_analysis", request),
    );
    let actual = actual.unwrap();
    let expected = expected.unwrap();
    assert!(
        actual == expected,
        "{}",
        first_difference(&actual, &expected, "$")
    );
    assert_ne!(completed_on, thread::current().id());
}

fn first_difference(actual: &Value, expected: &Value, path: &str) -> String {
    match (actual, expected) {
        (Value::Object(left), Value::Object(right)) if left.keys().eq(right.keys()) => {
            for (key, value) in left {
                if value != &right[key] {
                    return first_difference(value, &right[key], &format!("{path}.{key}"));
                }
            }
        }
        (Value::Array(left), Value::Array(right)) if left.len() == right.len() => {
            for (index, (left, right)) in left.iter().zip(right).enumerate() {
                if left != right {
                    return first_difference(left, right, &format!("{path}[{index}]"));
                }
            }
        }
        _ => {}
    }
    format!(
        "Analysis wire mismatch at {path}: actual={:.200}, expected={:.200}",
        actual.to_string(),
        expected.to_string()
    )
}

#[test]
fn bulk_analysis_keeps_structured_errors_and_rejects_invalid_payloads() {
    let (result, _) = invoke_body(
        "run_analysis_payload",
        compressed_request(
            "assess_technical_assignment",
            json!({
                "groups":[{"load_point_ids":[42],"origin":"automatic"}],"options_by_load_point":{},
            }),
        ),
    );
    assert_eq!(result.unwrap_err(), json!({"missing_load_point_ids":[42]}));
    assert!(
        invoke_body("run_analysis_payload", InvokeBody::Raw(vec![1, 2, 3]))
            .0
            .is_err()
    );
    assert!(invoke_body(
        "run_analysis_payload",
        compressed_request("unknown_command", json!({}))
    )
    .0
    .is_err());
}

#[test]
fn bulk_analysis_accepts_tauri_post_message_byte_arrays() {
    let InvokeBody::Raw(bytes) = compressed_request(
        "aggregate_pile_options",
        json!({"options_by_load_point":{}}),
    ) else {
        unreachable!()
    };
    let (result, completed_on) =
        invoke_body("run_analysis_payload", InvokeBody::Json(json!(bytes)));
    assert_eq!(result, Ok(json!([])));
    assert_ne!(completed_on, thread::current().id());
    assert!(
        invoke_body("run_analysis_payload", InvokeBody::Json(json!([256])))
            .0
            .is_err()
    );
}

#[test]
fn project_loading_and_geometry_do_not_run_on_the_calling_thread() {
    for (command, request) in [
        (
            "read_project_document",
            json!({"contents": include_str!("../../../../sample_project/sample_project.ifcpp")}),
        ),
        ("build_load_point_topology", json!({"load_points": []})),
    ] {
        let (result, completed_on) = invoke(command, request);
        assert!(result.is_ok(), "{command}: {result:?}");
        assert_ne!(
            completed_on,
            thread::current().id(),
            "{command} blocked the native event thread"
        );
    }
}

#[test]
fn pile_option_calculation_does_not_run_on_the_calling_thread() {
    let (result, completed_on) = invoke(
        "calculate_pile_option_analysis",
        json!({
            "load_points": [], "cpts": [], "bearing_capacities": [],
            "global_settings": {"algorithm":"quadrants", "max_distance_m":25, "max_angle_degrees":90},
            "settings_by_load_point": {}, "manual_cpt_ids_by_load_point": {}, "include_cpt_frd_rows":false,
        }),
    );
    assert!(result.is_ok(), "{result:?}");
    assert_ne!(
        completed_on,
        thread::current().id(),
        "Pile analysis blocked the native event thread"
    );
}

#[test]
fn background_project_loading_retains_structured_validation_errors() {
    let (result, _) = invoke("read_project_document", json!({"contents":"not JSON"}));
    assert!(result.unwrap_err().is_object());
}
