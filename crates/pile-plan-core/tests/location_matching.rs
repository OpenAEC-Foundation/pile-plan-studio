use pile_plan_core::{
    detect_numbering_rule, reconcile_locations, LocationMatchingRequest, NumberingPoint,
};
use serde_json::json;

fn request(
    old: serde_json::Value,
    new: serde_json::Value,
    decisions: serde_json::Value,
    bulk: serde_json::Value,
) -> LocationMatchingRequest {
    serde_json::from_value(json!({"old_locations":old,"new_locations":new,"tolerance_mm":99.0,"decisions":decisions,"bulk_action":bulk})).unwrap()
}

#[test]
fn coordinates_match_even_when_ids_change_and_reused_ids_do_not_override_positions() {
    let req = request(
        json!([{ "id":1,"x_mm":0,"y_mm":0},{"id":2,"x_mm":1000,"y_mm":0}]),
        json!([{ "id":2,"x_mm":0,"y_mm":0},{"id":1,"x_mm":1000,"y_mm":0}]),
        json!(null),
        json!(null),
    );
    let result = reconcile_locations(&req).unwrap();
    assert_eq!(
        result
            .links
            .iter()
            .map(|l| (l.old_id, l.new_id))
            .collect::<Vec<_>>(),
        [(2, 1), (1, 2)]
    );
    assert!(result.complete);
}

#[test]
fn reciprocal_ambiguity_never_reuses_a_location() {
    let req = request(
        json!([{ "id":1,"x_mm":0,"y_mm":0}]),
        json!([
        {"id":20,"x_mm":-50,"y_mm":0},{"id":30,"x_mm":50,"y_mm":0}]),
        json!(null),
        json!(null),
    );
    let result = reconcile_locations(&req).unwrap();
    assert!(result.links.is_empty());
    assert!(!result.complete);
    assert_eq!(result.proposals.len(), 2);
}

#[test]
fn explicit_empty_decisions_release_automatic_matches() {
    let req = request(
        json!([{ "id":1,"x_mm":0,"y_mm":0}]),
        json!([{ "id":2,"x_mm":0,"y_mm":0}]),
        json!({"links":[],"added":[],"removed":[]}),
        json!(null),
    );
    assert!(reconcile_locations(&req).unwrap().links.is_empty());
}

#[test]
fn invalid_manual_bulk_mapping_is_rejected_as_a_whole() {
    let req = request(
        json!([{ "id":1,"x_mm":0,"y_mm":0}]),
        json!([
        {"id":2,"x_mm":1000,"y_mm":0},{"id":3,"x_mm":2000,"y_mm":0}]),
        json!({"links":[{"old_id":1,"new_id":2},{"old_id":1,"new_id":3}],"added":[],"removed":[]}),
        json!(null),
    );
    assert!(reconcile_locations(&req).is_err());
}

#[test]
fn nearest_bulk_is_deterministic_and_preserves_explicit_decisions() {
    let mut req = request(
        json!([
        {"id":2,"x_mm":2000,"y_mm":0},{"id":1,"x_mm":0,"y_mm":0},{"id":3,"x_mm":4000,"y_mm":0}]),
        json!([
        {"id":20,"x_mm":1000,"y_mm":0},{"id":10,"x_mm":5000,"y_mm":0}]),
        json!({"links":[],"added":[10],"removed":[3]}),
        json!("nearest"),
    );
    let a = reconcile_locations(&req).unwrap();
    req.old_locations.reverse();
    req.new_locations.reverse();
    let b = reconcile_locations(&req).unwrap();
    assert_eq!(a, b);
    assert_eq!(a.links[0].old_id, 1);
    assert_eq!(a.added, [10]);
    assert_eq!(a.removed, [3]);
    assert_eq!(a.unmatched_old, [2]);
    assert!(!a.complete);
}

#[test]
fn separate_bulk_marks_only_unresolved_as_added_and_removed() {
    let req = request(
        json!([{ "id":1,"x_mm":0,"y_mm":0},{"id":3,"x_mm":3000,"y_mm":0}]),
        json!([{ "id":2,"x_mm":0,"y_mm":0},{"id":4,"x_mm":9000,"y_mm":0}]),
        json!(null),
        json!("separate"),
    );
    let result = reconcile_locations(&req).unwrap();
    assert_eq!(result.links.len(), 1);
    assert_eq!(result.added, [4]);
    assert_eq!(result.removed, [3]);
    assert!(result.complete);
}

#[test]
fn equal_numbers_at_far_locations_are_only_proposals() {
    let req = request(
        json!([{ "id":1,"x_mm":0,"y_mm":0}]),
        json!([{ "id":1,"x_mm":1000,"y_mm":0}]),
        json!(null),
        json!(null),
    );
    let result = reconcile_locations(&req).unwrap();
    assert!(result.links.is_empty());
    assert_eq!(result.proposals[0].candidates[0].distance_mm, 1000.0);
}

#[test]
fn detects_rank_order_with_gaps_without_guessing_a_tolerance() {
    let points = vec![
        NumberingPoint {
            id: 10,
            x_mm: 0.0,
            y_mm: 1000.0,
        },
        NumberingPoint {
            id: 20,
            x_mm: 1000.0,
            y_mm: 1000.0,
        },
        NumberingPoint {
            id: 30,
            x_mm: 0.0,
            y_mm: 0.0,
        },
        NumberingPoint {
            id: 50,
            x_mm: 1000.0,
            y_mm: 0.0,
        },
    ];
    let result = detect_numbering_rule(&points, 1.0).unwrap();
    assert_eq!(result.matching_positions, 4);
    assert_eq!(result.total_positions, 4);
    assert_eq!(serde_json::to_value(&result.rule).unwrap()["axis"], "y");
    assert_eq!(result.rule.tolerance_mm, 1.0);
}
