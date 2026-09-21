//! Native diagnostic: compare a previously exported MPS with the app's HiGHS build.
#[cfg(not(feature = "native-highs"))]
fn main() {
    eprintln!("Requires --features native-highs");
}

#[cfg(feature = "native-highs")]
fn main() {
    use std::ffi::CString;
    let args: Vec<_> = std::env::args().skip(1).collect();
    let mut model = highs::RowProblem::new().optimise(highs::Sense::Minimise);
    let path = CString::new(args[0].clone()).unwrap();
    // SAFETY: model and null-terminated filename both remain alive during the read.
    assert_eq!(
        unsafe { highs_sys::Highs_readModel(model.as_mut_ptr(), path.as_ptr()) },
        highs_sys::STATUS_OK
    );
    model.set_option("threads", 1);
    model.set_option("parallel", "off");
    model.set_option("mip_rel_gap", 0.0);
    model.set_option("mip_abs_gap", 0.0);
    model.set_option("time_limit", args[1].parse::<f64>().unwrap());
    model.set_option("output_flag", true);
    let solved = model.solve();
    println!(
        "status={:?} objective={} bound={:?}",
        solved.status(),
        solved.objective_value(),
        solved.double_info_value(c"mip_dual_bound")
    );
}
