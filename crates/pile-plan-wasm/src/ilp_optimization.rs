use pile_plan_core::{
    IlpOptimizationSession, IlpRunRequest, IlpSolverModel, IlpSolverOutcome, IlpSolverUpdate,
};
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmIlpSession {
    inner: IlpOptimizationSession,
}
#[wasm_bindgen]
impl WasmIlpSession {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: IlpOptimizationSession::new(),
        }
    }
    pub fn run(
        &mut self,
        request: JsValue,
        progress: &js_sys::Function,
        solve: &js_sys::Function,
    ) -> Result<JsValue, JsValue> {
        let request: IlpRunRequest = serde_wasm_bindgen::from_value(request)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        let mut solver = |model: &IlpSolverModel,
                          seconds: Option<f64>,
                          report: &mut dyn FnMut(IlpSolverUpdate)|
         -> Result<IlpSolverOutcome, String> {
            let data = model
                .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
                .map_err(|_| "solver_error")?;
            let mut malformed = false;
            let value = {
                let mut receive = |value: JsValue| match serde_wasm_bindgen::from_value(value) {
                    Ok(update) => report(update),
                    Err(_) => malformed = true,
                };
                let callback = wasm_bindgen::closure::ScopedClosure::borrow_mut_assert_unwind_safe(
                    &mut receive,
                );
                solve
                    .call3(
                        &JsValue::NULL,
                        &data,
                        &seconds.map(JsValue::from_f64).unwrap_or(JsValue::NULL),
                        callback.as_ref(),
                    )
                    .map_err(|_| "solver_error")?
            };
            if malformed {
                return Err("invalid_solver_assignment".into());
            }
            serde_wasm_bindgen::from_value(value).map_err(|_| "solver_error".into())
        };
        let outcome = self.inner.run_with_solver(
            request,
            &mut |update| {
                if let Ok(value) =
                    update.serialize(&serde_wasm_bindgen::Serializer::json_compatible())
                {
                    let _ = progress.call1(&JsValue::NULL, &value);
                }
            },
            &|| false,
            &mut Some(&mut solver),
        );
        // Browser cancellation terminates the owning Worker, never the UI thread.
        outcome
            .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }
}
