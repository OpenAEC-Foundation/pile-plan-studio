//! Numeric solver boundary; no engineering policy is delegated to the backend.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize)]
pub struct IlpSolverModel {
    pub col_cost: Vec<f64>,
    pub col_lower: Vec<f64>,
    pub col_upper: Vec<f64>,
    pub row_lower: Vec<f64>,
    pub row_upper: Vec<f64>,
    pub starts: Vec<usize>,
    pub indices: Vec<usize>,
    pub values: Vec<f64>,
    pub initial_solution: Option<Vec<f64>>,
}
#[derive(Default, Deserialize)]
pub struct IlpSolverUpdate {
    pub incumbent_objective: Option<f64>,
    pub best_bound: Option<f64>,
    pub relative_gap: Option<f64>,
    pub values: Option<Vec<f64>>,
}
#[derive(Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum IlpSolverOutcome {
    Solved { values: Vec<f64>, optimal: bool },
    Infeasible,
    NoSolution,
}
pub trait IlpSolverBackend {
    fn solve(
        &mut self,
        model: &IlpSolverModel,
        time_limit_seconds: Option<f64>,
        progress: &mut dyn FnMut(IlpSolverUpdate),
    ) -> Result<IlpSolverOutcome, String>;
}
impl<F> IlpSolverBackend for F
where
    F: FnMut(
        &IlpSolverModel,
        Option<f64>,
        &mut dyn FnMut(IlpSolverUpdate),
    ) -> Result<IlpSolverOutcome, String>,
{
    fn solve(
        &mut self,
        m: &IlpSolverModel,
        t: Option<f64>,
        p: &mut dyn FnMut(IlpSolverUpdate),
    ) -> Result<IlpSolverOutcome, String> {
        self(m, t, p)
    }
}
