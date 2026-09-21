use pile_plan_core::{IlpOptimizationOutcome, IlpOptimizationSession, IlpProgress, IlpRunRequest};
use std::collections::VecDeque;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{ipc::Channel, State};

#[derive(Default)]
struct JobState {
    session: Option<IlpOptimizationSession>,
    active: Option<(String, Arc<AtomicBool>)>,
    cancelled_before_start: VecDeque<String>,
}
impl JobState {
    fn begin(&mut self, id: String) -> Result<(IlpOptimizationSession, Arc<AtomicBool>), String> {
        if self.active.is_some() {
            return Err("ilp_already_running".into());
        }
        let already_cancelled = self
            .cancelled_before_start
            .iter()
            .position(|old| old == &id)
            .and_then(|index| self.cancelled_before_start.remove(index))
            .is_some();
        let cancel = Arc::new(AtomicBool::new(already_cancelled));
        self.active = Some((id, cancel.clone()));
        Ok((self.session.take().unwrap_or_default(), cancel))
    }
    fn cancel_run(&mut self, id: String) {
        if let Some((active, cancel)) = &self.active {
            if *active == id {
                cancel.store(true, Ordering::Relaxed);
                return;
            }
        }
        // Start/cancel IPC commands may be scheduled in either order. Bound stale IDs.
        self.cancelled_before_start.push_back(id);
        if self.cancelled_before_start.len() > 64 {
            self.cancelled_before_start.pop_front();
        }
    }
}
#[derive(Default)]
pub struct IlpJobs(Mutex<JobState>);

#[tauri::command]
pub async fn ilp_optimize(
    request: IlpRunRequest,
    progress: Channel<IlpProgress>,
    jobs: State<'_, IlpJobs>,
) -> Result<IlpOptimizationOutcome, String> {
    let (mut session, cancel) = {
        let mut state = jobs.0.lock().map_err(|_| "ilp_state_error")?;
        state.begin(request.run_id.clone())?
    };
    let finished = tauri::async_runtime::spawn_blocking(move || {
        let outcome = session.run(
            request,
            &mut |update| {
                let _ = progress.send(update);
            },
            &|| cancel.load(Ordering::Relaxed),
        );
        (session, outcome)
    })
    .await;
    let mut state = jobs.0.lock().map_err(|_| "ilp_state_error")?;
    state.active = None;
    match finished {
        Ok((session, outcome)) => {
            state.session = Some(session);
            Ok(outcome)
        }
        Err(_) => Err("ilp_worker_failed".into()),
    }
}
#[tauri::command]
pub fn cancel_ilp_optimization(run_id: String, jobs: State<'_, IlpJobs>) {
    if let Ok(mut state) = jobs.0.lock() {
        state.cancel_run(run_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cancellation_before_start_and_active_run_exclusion() {
        let mut jobs = JobState::default();
        jobs.cancel_run("early".into());
        let (_, cancel) = jobs.begin("early".into()).unwrap();
        assert!(cancel.load(Ordering::Relaxed));
        assert!(jobs.begin("other".into()).is_err());
        jobs.active = None;
        let (_, cancel) = jobs.begin("next".into()).unwrap();
        jobs.cancel_run("unrelated".into());
        assert!(!cancel.load(Ordering::Relaxed));
        jobs.cancel_run("next".into());
        assert!(cancel.load(Ordering::Relaxed));
    }
}
impl IlpJobs {
    pub fn cancel(&self) {
        if let Ok(state) = self.0.lock() {
            if let Some((_, cancel)) = &state.active {
                cancel.store(true, Ordering::Relaxed);
            }
        }
    }
}
