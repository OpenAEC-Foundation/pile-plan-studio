use pile_plan_core::*;
use serde_json::json;
use std::collections::HashMap;

fn rows(values:serde_json::Value)->Vec<ProjectBearingCapacity>{serde_json::from_value(values).unwrap()}
fn analyze(capacities:Vec<ProjectBearingCapacity>)->PileConfigurationOption{
 let loads=vec![serde_json::from_value(json!({"id":1,"name":"P1","x_mm":0,"y_mm":0,"design_load_kn":10,"tension":{"state":"known","value_kn":40}})).unwrap()];
 let cpts=vec![ProjectCpt{id:1,name:"S1".into(),x_mm:0.,y_mm:0.}];
 build_pile_option_analysis(&loads,&cpts,&capacities,|_|CptSelectionSettings {algorithm:CptSelectionAlgorithm::Quadrants,max_distance_m:100.,monopoly_distance_m:1.,max_angle_degrees:120.},&HashMap::from([(1,vec![1])]),false).unwrap().pile_options_by_load_point[&1][0].clone()
}
#[test]
fn exact_single_cap_advice_overrides_general_independent_of_order(){
 for reversed in [false,true]{
  let mut r=rows(json!([
   {"cpt_id":1,"pile_size_mm":320,"pile_tip_level_m":-18,"frd_kn":100},
   {"cpt_id":1,"pile_size_mm":320,"pile_tip_level_m":-18,"frd_kn":20,"direction":"tension","pile_count":1},
   {"cpt_id":1,"pile_size_mm":320,"pile_tip_level_m":-18,"frd_kn":90,"direction":"tension"}
  ]));
  if reversed{r.reverse();}
  let o=analyze(r);assert_eq!(o.tension.unwrap().governing_frd_kn,Some(20.));assert!(!o.is_option);
 }
}
#[test]
fn another_cap_count_is_missing_not_an_implicit_fallback(){
 let o=analyze(rows(json!([
  {"cpt_id":1,"pile_size_mm":320,"pile_tip_level_m":-18,"frd_kn":100},
  {"cpt_id":1,"pile_size_mm":320,"pile_tip_level_m":-18,"frd_kn":90,"direction":"tension","pile_count":4}
 ])));
 assert_eq!(o.tension.unwrap().status,DirectionStatus::MissingCapacityData);
}
#[test]
fn explicit_missing_specific_value_blocks_general_but_zero_is_insufficient(){
 for missing in [true,false]{
  let o=analyze(rows(json!([
   {"cpt_id":1,"pile_size_mm":320,"pile_tip_level_m":-18,"frd_kn":100},
   {"cpt_id":1,"pile_size_mm":320,"pile_tip_level_m":-18,"frd_kn":90,"direction":"tension"},
   {"cpt_id":1,"pile_size_mm":320,"pile_tip_level_m":-18,"frd_kn":0,"direction":"tension","pile_count":1,"missing":missing}
  ])));
  assert_eq!(o.tension.unwrap().status,if missing{DirectionStatus::MissingCapacityData}else{DirectionStatus::InsufficientCapacity});
 }
}


#[test]
fn scoped_advice_round_trips_and_legacy_rows_stay_general(){
 let mut p=read_ifcpp_str(include_str!("../../../sample_project/sample_project.ifcpp")).unwrap();
 assert!(p.inputs.bearing_capacities.iter().all(|v|v.pile_count.is_none()&&!v.missing));
 p.inputs.bearing_capacities[0].pile_count=Some(4);
 let text=write_ifcpp_string(&p).unwrap();
 assert_eq!(serde_json::from_str::<serde_json::Value>(&text).unwrap()["schema_version"],8);
 let restored=read_ifcpp_str(&text).unwrap();
 assert!(restored.inputs.bearing_capacities.iter().any(|v|v.pile_count==Some(4)));
 p.inputs.bearing_capacities[0].pile_count=Some(0);assert!(write_ifcpp_string(&p).is_err());
}

#[test]
fn request_derives_full_cap_count_even_for_a_single_location_preview(){
 let all=(1..=4).map(|id|json!({"id":id,"name":format!("P{id}"),"x_mm":(id-1)*1100,"y_mm":0,"design_load_kn":10,"tension":{"state":"known","value_kn":40}})).collect::<Vec<_>>();
 let request:PileOptionAnalysisRequest=serde_json::from_value(json!({
  "load_points":[all[0]],"grouping_load_points":all,"grouping_settings":{"automatic":true,"max_edge_distance_mm":1200},
  "cpts":[{"id":1,"name":"S1","x_mm":0,"y_mm":0}],
  "bearing_capacities":[{"cpt_id":1,"pile_size_mm":320,"pile_tip_level_m":-18,"frd_kn":100},{"cpt_id":1,"pile_size_mm":320,"pile_tip_level_m":-18,"frd_kn":90,"direction":"tension","pile_count":1},{"cpt_id":1,"pile_size_mm":320,"pile_tip_level_m":-18,"frd_kn":20,"direction":"tension","pile_count":4}],
  "global_settings":{"algorithm":"quadrants","max_distance_m":100,"monopoly_distance_m":1,"max_angle_degrees":120},"settings_by_load_point":{},"manual_cpt_ids_by_load_point":{"1":[1]},"include_cpt_frd_rows":true
 })).unwrap();
 let result=calculate_pile_option_analysis(&request).unwrap();
 assert_eq!(result.pile_options_by_load_point[&1][0].tension.as_ref().unwrap().governing_frd_kn,Some(20.));
 assert_eq!(result.pile_options_by_load_point.len(),1);
 assert_eq!(result.cpt_frd_rows_by_cpt_id.unwrap()[&1].len(),3);
}
