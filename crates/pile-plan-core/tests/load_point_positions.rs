use pile_plan_core::{
    duplicate_load_point_positions, validate_unique_load_point_positions, ProjectLoadPoint,
};

fn point(id: u32, name: &str, x_mm: f64, y_mm: f64) -> ProjectLoadPoint {
    ProjectLoadPoint {
        id,
        name: name.to_string(),
        x_mm,
        y_mm,
        design_load_kn: 100.0,
    }
}

#[test]
fn reports_every_duplicate_position_with_sorted_members() {
    let duplicates = duplicate_load_point_positions(&[
        point(9, "Nine", 30.0, 40.0),
        point(8, "Eight", 10.0, -0.0),
        point(7, "Seven", 30.0, 40.0),
        point(2, "Two", 10.0, 0.0),
        point(5, "Five", 30.0, 40.0),
    ]);

    assert_eq!(duplicates.len(), 2);
    assert_eq!((duplicates[0].x_mm, duplicates[0].y_mm), (10.0, 0.0));
    assert_eq!(
        duplicates[0]
            .load_points
            .iter()
            .map(|member| (member.id, member.name.as_str()))
            .collect::<Vec<_>>(),
        vec![(2, "Two"), (8, "Eight")],
    );
    assert_eq!((duplicates[1].x_mm, duplicates[1].y_mm), (30.0, 40.0));
    assert_eq!(
        duplicates[1]
            .load_points
            .iter()
            .map(|member| member.id)
            .collect::<Vec<_>>(),
        vec![5, 7, 9],
    );
}

#[test]
fn validation_accepts_unique_and_exactly_nearby_positions() {
    let x: f64 = 10.0;
    let nearby = f64::from_bits(x.to_bits() + 1);

    assert!(validate_unique_load_point_positions(&[
        point(1, "One", x, 20.0),
        point(2, "Two", nearby, 20.0),
    ])
    .is_ok());
}

#[test]
fn duplicate_output_is_independent_of_input_order() {
    let forward = vec![
        point(3, "Three", -4.0, 8.0),
        point(1, "One", -4.0, 8.0),
        point(2, "Two", 0.0, 0.0),
    ];
    let mut reverse = forward.clone();
    reverse.reverse();

    assert_eq!(
        duplicate_load_point_positions(&forward),
        duplicate_load_point_positions(&reverse),
    );
}

#[test]
fn repeated_rows_for_one_id_are_not_a_position_conflict() {
    assert!(duplicate_load_point_positions(&[
        point(4, "Four", 12.0, 13.0),
        point(4, "Four", 12.0, 13.0),
    ])
    .is_empty());
}
