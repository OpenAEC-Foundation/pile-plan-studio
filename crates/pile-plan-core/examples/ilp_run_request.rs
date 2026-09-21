//! Run an exported request with the selected production backend. Arguments:
//! request.json output.json [time_limit_ms] [cancel_after_ms]. Progress is JSONL.
use pile_plan_core::{IlpOptimizationSession, IlpRunRequest};
use std::time::{Duration, Instant};
fn main() {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let mut request: IlpRunRequest =
        serde_json::from_str(&std::fs::read_to_string(&args[0]).unwrap()).unwrap();
    if let Some(limit) = args.get(2) {
        request.time_limit_ms = Some(limit.parse().unwrap());
    }
    let cancel_after = args
        .get(3)
        .map(|s| Duration::from_millis(s.parse().unwrap()));
    let started = Instant::now();
    let mut last = 0;
    let outcome = IlpOptimizationSession::new().run(
        request,
        &mut |p| {
            if p.best_solution.is_some() || p.elapsed_ms.saturating_sub(last) >= 10_000 {
                println!("{}", serde_json::to_string(&p).unwrap());
                last = p.elapsed_ms;
            }
        },
        &|| cancel_after.is_some_and(|d| started.elapsed() >= d),
    );
    std::fs::write(&args[1], serde_json::to_string_pretty(&outcome).unwrap()).unwrap();
    eprintln!("elapsed_ms={}", started.elapsed().as_millis());
}
