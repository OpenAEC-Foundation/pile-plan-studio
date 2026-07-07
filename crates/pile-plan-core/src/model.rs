#[derive(Clone, Debug, PartialEq)]
pub struct LoadPoint {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub design_load: f64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Cpt {
    pub id: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct PileConfiguration {
    pub tip_level_mm: i32,
    pub diameter_mm: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BearingCapacity {
    pub cpt_id: String,
    pub configuration: PileConfiguration,
    pub value: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PileOptionInput {
    pub configuration: PileConfiguration,
    pub pile_count: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PileOption {
    pub configuration: PileConfiguration,
    pub pile_count: u32,
    pub governing_cpt_id: String,
    pub governing_capacity: u32,
    pub total_capacity: u32,
    pub utilization: f64,
}
