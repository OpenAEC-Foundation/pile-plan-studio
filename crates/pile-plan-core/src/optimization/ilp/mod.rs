mod backend;
#[cfg(all(feature = "native-highs", not(target_arch = "wasm32")))]
mod highs_backend;
mod model;
mod prepare;
mod session;
mod start_plan;
mod types;
mod validate;
pub use session::IlpOptimizationSession;
pub use types::*;

mod linear_model;
mod solver_contract;
pub use solver_contract::*;
