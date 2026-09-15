use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct LoadPoint {
    pub id: u32,
    pub name: String,
    pub x_mm: f64,
    pub y_mm: f64,
    pub design_load_kn: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Cpt {
    pub id: u32,
    pub name: String,
    pub x_mm: f64,
    pub y_mm: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct BearingCapacity {
    pub cpt_id: u32,
    pub pile_tip_level_m: f64,
    pub pile_size_mm: u32,
    pub frd_kn: f64,
}
